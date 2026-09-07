import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 37 — escalation coverage.
//
// The first two suites pin behaviour that is CORRECT and must not regress.
//
// The third used to pin RISK-25 as an OPEN question: an INTERNAL wait could
// never escalate, and closing it needed a threshold the pack never stated, so
// the test existed to stop anyone "fixing" it by invention. That worked as
// intended — the Boss has now supplied the evidence, and this is the test that
// was deliberately changed as a result. It now pins the RESOLVED rule.

async function caseInWaiting(
  exec: Awaited<ReturnType<typeof signInAs>>,
  label: string,
  reasonType: "INTERNAL" | "EXTERNAL"
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
  const wait = await exec.client.rpc("enter_waiting", {
    p_case_id: caseId,
    p_reason_type: reasonType,
    p_reason_text: "autotest dependency",
    // RISK-25: an INTERNAL wait must name one of the three permitted reasons.
    p_internal_reason:
      reasonType === "INTERNAL" ? "REPORTING_MANAGER_APPROVAL_PENDING" : null,
  });
  expect(wait.error).toBeNull();
  return { caseId, waitId: wait.data.wait_id as string };
}

describe("§7.2 — resume-ready is reachable only for EXTERNAL waits", () => {
  it("sets resume_ready_at when an EXTERNAL dependency is explicitly resolved", async () => {
    const exec = await signInAs("executive");
    const { waitId } = await caseInWaiting(exec, "escalation external", "EXTERNAL");

    const { error } = await exec.client.rpc("mark_wait_resolved", { p_wait_id: waitId });
    expect(error).toBeNull();

    const { data } = await exec.client
      .from("waits")
      .select("resume_ready_at")
      .eq("id", waitId)
      .single();
    expect(data!.resume_ready_at).not.toBeNull();
  });

  it("refuses mark_wait_resolved on an INTERNAL wait", async () => {
    const exec = await signInAs("executive");
    const { waitId } = await caseInWaiting(exec, "escalation internal refused", "INTERNAL");

    const { error } = await exec.client.rpc("mark_wait_resolved", { p_wait_id: waitId });
    expect(error?.message).toMatch(/INVALID_OPERATION/);
  });
});

describe("RISK-25 — CLOSED: an INTERNAL wait now reaches the escalation clock", () => {
  // This block previously PINNED the defect: it asserted that an INTERNAL wait
  // has no resume_ready_at and therefore could never escalate, deliberately,
  // because closing it needed a threshold the pack never stated.
  //
  // The Boss has now supplied that evidence. An INTERNAL wait still has no
  // resume-ready state — mark_wait_resolved is still EXTERNAL-only, and that
  // is correct — but the escalation scan's SAME 24h branch now also selects
  // INTERNAL waits, measuring from entered_at instead. No second engine, no
  // changed threshold.
  it("still has no resume_ready_at — that part of the model is unchanged", async () => {
    const exec = await signInAs("executive");
    const { waitId } = await caseInWaiting(exec, "R25 internal shape", "INTERNAL");

    const { data } = await exec.client
      .from("waits")
      .select("resume_ready_at, reason_type, internal_reason")
      .eq("id", waitId)
      .single();

    expect(data!.reason_type).toBe("INTERNAL");
    expect(data!.resume_ready_at).toBeNull();
    // ...but it now carries one of the three permitted reasons, which is what
    // makes it a first-class citizen of the escalation branch.
    expect(data!.internal_reason).toBe("REPORTING_MANAGER_APPROVAL_PENDING");
  });

  it("is eligible for the existing 24h escalation, unlike before", async () => {
    const exec = await signInAs("executive");
    const { waitId } = await caseInWaiting(exec, "R25 internal eligible", "INTERNAL");

    // Eligibility is what changed. The scan itself is cron-only and not
    // client-callable (asserted in pm.test.ts for the PM scan), so this
    // asserts the precondition the scan selects on: an open INTERNAL wait
    // that has not yet been escalated.
    const { data } = await exec.client
      .from("waits")
      .select("resumed_at, last_escalated_at, entered_at, reason_type")
      .eq("id", waitId)
      .single();

    expect(data!.reason_type).toBe("INTERNAL");
    expect(data!.resumed_at).toBeNull();
    expect(data!.last_escalated_at).toBeNull();
    expect(data!.entered_at).not.toBeNull();
  });
});
