import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// RISK-25 CLOSED — the three INTERNAL waiting reasons, Boss-supplied.
//
// RISK-25 was found in Loop 37 and deliberately left OPEN: an INTERNAL wait
// could never escalate, and closing it needed a threshold the pack never
// stated. The Boss has now supplied it. These tests pin the resolved rule.
//
// The three permitted reasons, and nothing else:
//   REPORTING_MANAGER_APPROVAL_PENDING — Maintenance Manager awaiting the
//     authority they report to; required before Purchase can proceed.
//   PURCHASE_ORDER_RELEASE_PENDING — approval arrived, PO not yet released.
//   OTHER — any other legitimate internal dependency, detail mandatory.

const R1 = "REPORTING_MANAGER_APPROVAL_PENDING";
const R2 = "PURCHASE_ORDER_RELEASE_PENDING";

async function caseReadyForWaiting(
  exec: Awaited<ReturnType<typeof signInAs>>,
  label: string
) {
  const { data: created } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  const caseId = created!.id as string;
  await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
  for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING"]) {
    await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
  }
  return caseId;
}

describe("RISK-25 — exactly three INTERNAL reasons", () => {
  it("accepts reason 1 (reporting-manager approval pending)", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 reason1");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "awaiting reporting-manager approval before Purchase can proceed",
      p_internal_reason: R1,
    });
    expect(error).toBeNull();
  });

  it("accepts reason 2 (Purchase Order release pending)", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 reason2");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "approval received, Purchase has not released the PO yet",
      p_internal_reason: R2,
    });
    expect(error).toBeNull();
  });

  it("accepts OTHER when real detail is given", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 other ok");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "awaiting shop-floor crane availability from another team",
      p_internal_reason: "OTHER",
    });
    expect(error).toBeNull();
  });

  it("rejects OTHER with placeholder detail, so it cannot become a hidden fourth category", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 other placeholder");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "x",
      p_internal_reason: "OTHER",
    });
    expect(error?.message).toMatch(/DETAIL_REQUIRED/);
  });

  it("rejects a fourth INTERNAL reason", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 fourth reason");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "vendor is late again",
      p_internal_reason: "VENDOR_DELAY",
    });
    expect(error?.message).toMatch(/INVALID_INTERNAL_REASON/);
  });

  it("rejects an INTERNAL wait with no reason at all", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 no reason");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "something internal",
      p_internal_reason: null,
    });
    expect(error?.message).toMatch(/INTERNAL_REASON_REQUIRED/);
  });

  it("rejects an internal_reason on an EXTERNAL wait", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 external with reason");
    const { error } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "EXTERNAL",
      p_reason_text: "vendor part awaited",
      p_internal_reason: R1,
    });
    expect(error?.message).toMatch(/INVALID_INTERNAL_REASON/);
  });

  it("leaves EXTERNAL waiting completely intact", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 external intact");
    const entered = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "EXTERNAL",
      p_reason_text: "vendor part awaited",
    });
    expect(entered.error).toBeNull();

    // mark_wait_resolved still applies only to EXTERNAL, unchanged.
    const { error } = await exec.client.rpc("mark_wait_resolved", {
      p_wait_id: entered.data.wait_id,
    });
    expect(error).toBeNull();
  });
});

describe("RISK-25 — the wait records its dependency and nothing more", () => {
  it("stores the reason and never marks the approval or PO as settled", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 no fabrication");
    const entered = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "awaiting reporting-manager approval",
      p_internal_reason: R1,
      p_dependency_ref: "PO-REF-AUTOTEST",
    });
    expect(entered.error).toBeNull();

    const { data: wait } = await exec.client
      .from("waits")
      .select("internal_reason, reason_type, resumed_at, resume_ready_at, dependency_ref")
      .eq("id", entered.data.wait_id)
      .single();

    expect(wait!.internal_reason).toBe(R1);
    expect(wait!.reason_type).toBe("INTERNAL");
    expect(wait!.dependency_ref).toBe("PO-REF-AUTOTEST");
    // Maintenance is not the Purchase system: entering the wait must not
    // resolve it, and must not invent a resume-ready state.
    expect(wait!.resumed_at).toBeNull();
    expect(wait!.resume_ready_at).toBeNull();
  });

  it("records the actor and the reason in the audit trail", async () => {
    const exec = await signInAs("executive");
    const caseId = await caseReadyForWaiting(exec, "R25 audit");
    const entered = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "approval received, PO not released",
      p_internal_reason: R2,
    });

    const { data: audits } = await exec.client
      .from("audit_log")
      .select("actor_user_id, action, after")
      .eq("action", "enter_waiting")
      .eq("target_id", entered.data.wait_id);

    expect(audits?.length).toBe(1);
    expect(audits![0].actor_user_id).toBe(exec.userId);
    expect((audits![0].after as { internal_reason: string }).internal_reason).toBe(R2);
  });
});
