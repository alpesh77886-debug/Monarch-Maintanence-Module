import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// RISK-33 (Gate 21, Loop 102) — complainant disagreement path, raise side.
// IMPLEMENTATION_PACK.md §11: "complainant + Executive jointly decide, no
// unilateral closure." This suite exercises raise_restoration_dispute; the
// Executive's acknowledge side (maintenance.acknowledge_restoration_dispute)
// lands in Loop 103 with its own test coverage.

async function driveToTechnicallyRestoredAndPassed(
  exec: Awaited<ReturnType<typeof signInAs>>,
  reporterUserId: string,
  label: string
) {
  const { data: created } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: reporterUserId,
    })
    .select("id")
    .single();
  const caseId = created!.id as string;

  await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
  for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
    await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
  }

  const { data: restoration } = await exec.client.rpc("record_restoration", {
    p_case_id: caseId,
    p_restoration_type: "TECHNICAL",
    p_details: "autotest fix",
  });
  const restorationId = (restoration as { restoration_id: string }).restoration_id;

  const { error: verifyErr } = await exec.client.rpc("verify_restoration", {
    p_restoration_id: restorationId,
    p_passed: true,
  });
  expect(verifyErr).toBeNull();

  return { caseId, restorationId };
}

describe("raise_restoration_dispute (§11, RISK-33)", () => {
  it("only the case's own reporter can dispute a PASSED technical restoration", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { caseId, restorationId } = await driveToTechnicallyRestoredAndPassed(
      exec,
      tech.userId,
      "restoration dispute — authority"
    );

    // The owning Executive is not the reporter — must be refused, even
    // though they are staff and the case is theirs.
    const { error: execErr } = await exec.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "exec should not be able to dispute their own restoration",
    });
    expect(execErr?.message).toMatch(/FORBIDDEN/);

    // The actual reporter (technician account, deliberately non-staff)
    // succeeds.
    const { data: dispute, error: disputeErr } = await tech.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "machine still making the same noise",
    });
    expect(disputeErr).toBeNull();
    expect((dispute as { status: string }).status).toBe("PENDING");

    const { data: events } = await exec.client
      .from("case_events")
      .select("event_type, reason")
      .eq("case_id", caseId)
      .eq("event_type", "RESTORATION_DISPUTED");
    expect(events!.length).toBe(1);

    // The case's owning Executive gets notified.
    const { data: notifications } = await exec.client
      .from("notifications")
      .select("notification_type, recipient_user_id")
      .eq("case_id", caseId)
      .eq("notification_type", "RESTORATION_DISPUTED");
    expect(notifications!.some((n) => n.recipient_user_id === exec.userId)).toBe(true);

    // A second dispute on the same still-pending one must be refused.
    const { error: dupErr } = await tech.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "still not fixed, again",
    });
    expect(dupErr?.message).toMatch(/DISPUTE_ALREADY_PENDING/);
  });

  it("requires a reason and refuses a restoration that has not passed verification", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("restoration dispute — preconditions"),
        reporter_user_id: tech.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    }
    const { data: restoration } = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest fix, not yet verified",
    });
    const restorationId = (restoration as { restoration_id: string }).restoration_id;

    // Not yet staff-verified — must be refused regardless of reason.
    const { error: unverifiedErr } = await tech.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "premature dispute",
    });
    expect(unverifiedErr?.message).toMatch(/INVALID_OPERATION/);

    await exec.client.rpc("verify_restoration", { p_restoration_id: restorationId, p_passed: true });

    // Now verified PASSED, but no reason supplied.
    const { error: noReasonErr } = await tech.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "   ",
    });
    expect(noReasonErr?.message).toMatch(/REASON_REQUIRED/);
  });
});
