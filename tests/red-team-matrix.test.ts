import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 36 — the forensic brief's Phase 4 red-team matrix, as a permanent
// regression suite rather than a one-off probe.
//
// Every case here asserts a FORBIDDEN/refusal. They were all run live first
// and all 17 attacks were already refused — this suite exists so they stay
// refused, not because a gap was found. A clean sweep is only worth something
// if it is repeatable.
//
// One attack surface is genuinely new: the QC identity introduced by F-01.
// Adding an identity type is exactly the kind of change that opens a lateral
// door somewhere else, so it is attacked here on its own terms.

// The supabase-js RPC builder is thenable but not a Promise, so PromiseLike
// is the right shape here — awaiting it is all these tests need.
type Attack = PromiseLike<{ error: { message: string } | null }>;

async function freshCase(exec: Awaited<ReturnType<typeof signInAs>>, label: string) {
  const { data } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  const caseId = data!.id as string;
  await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
  return caseId;
}

describe("Red team — a non-Maintenance authenticated identity", () => {
  it("cannot mutate the lifecycle, assign, stop, confirm, send to QC, or reopen", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const caseId = await freshCase(exec, "red team non-staff");

    // Thunks, not pre-built promises: each attack fires only when it is
    // about to be asserted, so one attack cannot influence the next.
    const attempts: [string, () => Attack][] = [
      ["transition_case", () => tech.client.rpc("transition_case", { p_case_id: caseId, p_new_status: "ASSESSED" })],
      ["assign_technician", () => tech.client.rpc("assign_technician", { p_case_id: caseId, p_technician_user_id: tech.userId })],
      ["raise_safety_stop", () => tech.client.rpc("raise_safety_stop", { p_case_id: caseId, p_stop_type: "SAFETY", p_reason: "red team" })],
      ["confirm_emergency", () => tech.client.rpc("confirm_emergency", { p_case_id: caseId })],
      ["send_to_qc", () => tech.client.rpc("send_to_qc", { p_case_id: caseId })],
      ["reopen_case", () => tech.client.rpc("reopen_case", { p_case_id: caseId, p_reason: "red team" })],
    ];

    for (const [name, call] of attempts) {
      const { error } = await call();
      expect(error, `${name} must be refused server-side`).not.toBeNull();
      expect(error!.message, `${name}`).toMatch(/FORBIDDEN/);
    }
  });
});

describe("Red team — the ₹12,000 boundary (§3.3 LOCKED)", () => {
  it("refuses every identity except a Maintenance Manager", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const tech = await signInAs("technician");
    const qc = await signInAs("qc");

    const caseId = await freshCase(exec, "red team 12k boundary");
    const raised = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: "expensive pump",
      p_quantity_requested: 1,
      p_estimated_amount: 50000,
    });
    expect(raised.error).toBeNull();
    const requestId = raised.data.spare_request_id as string;

    // The request itself must have been flagged — the gate is data, not UI.
    const { data: row } = await exec.client
      .from("spare_requests")
      .select("requires_manager_approval")
      .eq("id", requestId)
      .single();
    expect(row!.requires_manager_approval).toBe(true);

    for (const [who, client] of [
      ["non-staff technician", tech.client],
      ["QC identity", qc.client],
      ["Maintenance Executive", exec.client],
    ] as const) {
      const { error } = await client.rpc("approve_spare_request", {
        p_spare_request_id: requestId,
        p_approval_proof_ref: "red-team",
      });
      expect(error, `${who} must not approve a >₹12,000 spare`).not.toBeNull();
      expect(error!.message).toMatch(/FORBIDDEN/);
    }

    // ...and the Manager still can.
    const { error } = await mgr.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "red-team",
    });
    expect(error).toBeNull();
  });
});

describe("Red team — the QC identity has no lateral Maintenance authority", () => {
  it("cannot acknowledge, stop, assign, or close anything", async () => {
    const exec = await signInAs("executive");
    const qc = await signInAs("qc");
    const caseId = await freshCase(exec, "red team qc lateral");

    const attempts: [string, () => Attack][] = [
      ["acknowledge_case", () => qc.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "HIGH" })],
      ["raise_safety_stop", () => qc.client.rpc("raise_safety_stop", { p_case_id: caseId, p_stop_type: "SAFETY", p_reason: "qc overreach" })],
      ["assign_technician", () => qc.client.rpc("assign_technician", { p_case_id: caseId, p_technician_user_id: qc.userId })],
      ["reopen_case", () => qc.client.rpc("reopen_case", { p_case_id: caseId, p_reason: "qc overreach" })],
    ];

    for (const [name, call] of attempts) {
      const { error } = await call();
      expect(error, `QC identity must not be able to ${name}`).not.toBeNull();
      expect(error!.message).toMatch(/FORBIDDEN/);
    }
  });
});

describe("Red team — an Executive cannot jump the lifecycle graph", () => {
  it("is refused an arbitrary jump to CLOSED or MAINTENANCE_RELEASED", async () => {
    const exec = await signInAs("executive");
    const caseId = await freshCase(exec, "red team lifecycle jump");

    for (const target of ["CLOSED", "MAINTENANCE_RELEASED"]) {
      const { error } = await exec.client.rpc("transition_case", {
        p_case_id: caseId,
        p_new_status: target,
        p_reason: "red team jump",
      });
      expect(error, `ACKNOWLEDGED -> ${target} must be refused`).not.toBeNull();
      expect(error!.message).toMatch(/INVALID_TRANSITION/);
    }
  });
});
