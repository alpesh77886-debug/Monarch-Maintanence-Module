import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 37 — escalation coverage.
//
// The first two suites pin behaviour that is CORRECT and must not regress.
// The third pins behaviour that is a KNOWN OPEN QUESTION (RISK-25): an
// INTERNAL wait can never escalate, because the only function that sets
// resume_ready_at refuses non-EXTERNAL waits, and the escalation scan filters
// on resume_ready_at. That test exists so nobody "fixes" the asymmetry by
// inventing a threshold — if the Boss supplies evidence that INTERNAL waits
// should escalate, this test is the thing that must be deliberately changed.

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

describe("RISK-25 — an INTERNAL wait cannot reach the escalation clock at all", () => {
  // This is the documented consequence, not an aspiration. §7.2 scopes the
  // 24h escalation to "resume-ready with no required action", and an INTERNAL
  // wait has no route to resume-ready. Whether that is intended is an open
  // question for the Boss (§23/§24 list "24h normal escalation" unscoped),
  // and inventing a start point for an INTERNAL wait's clock would be exactly
  // the invented threshold §19.15 forbids.
  it("has no resume_ready_at, so the escalation scan cannot select it", async () => {
    const exec = await signInAs("executive");
    const { waitId } = await caseInWaiting(exec, "RISK-25 internal never ready", "INTERNAL");

    const { data } = await exec.client
      .from("waits")
      .select("resume_ready_at, reason_type")
      .eq("id", waitId)
      .single();

    expect(data!.reason_type).toBe("INTERNAL");
    // If this ever becomes non-null, either mark_wait_resolved changed or a
    // new path was added — both are decisions that need Boss evidence first.
    expect(data!.resume_ready_at).toBeNull();
  });
});
