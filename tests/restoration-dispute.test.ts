import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// RISK-33 (Gate 21, Loops 102-103) — complainant disagreement path.
// IMPLEMENTATION_PACK.md §11: "complainant + Executive jointly decide, no
// unilateral closure." Loop 102 covers raise_restoration_dispute (the
// complainant's side); Loop 103 adds acknowledge_restoration_dispute (the
// Executive's side) and the "no unilateral closure" guard inside
// transition_case that actually gives the rule server-side teeth.

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

describe("acknowledge_restoration_dispute + \"no unilateral closure\" guard (§11, RISK-33)", () => {
  it("not-fixed: staff-only, reopens work, notifies the complainant, and blocks closure until then", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { caseId, restorationId } = await driveToTechnicallyRestoredAndPassed(
      exec,
      tech.userId,
      "restoration dispute — not fixed + guard"
    );
    const { data: dispute } = await tech.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "still broken",
    });
    const disputeId = (dispute as { dispute_id: string }).dispute_id;

    // §11 "no unilateral closure": while the dispute is PENDING, neither
    // the no-QC-required direct release nor send_to_qc may proceed.
    await exec.client.rpc("set_qc_required", { p_case_id: caseId, p_qc_required: false, p_reason: "autotest" });
    const { error: blockedRelease } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(blockedRelease?.message).toMatch(/DISPUTE_PENDING/);

    const { error: blockedQc } = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
    expect(blockedQc?.message).toMatch(/DISPUTE_PENDING/);
    // The blocked send_to_qc must not leave an orphaned clearances row —
    // it calls transition_case internally, and that exception must roll
    // back everything send_to_qc already did in the same call.
    const { data: orphanClearance } = await exec.client
      .from("clearances")
      .select("id")
      .eq("case_id", caseId);
    expect(orphanClearance).toEqual([]);

    // Non-staff (including the complainant themselves) cannot acknowledge.
    const { error: techAckErr } = await tech.client.rpc("acknowledge_restoration_dispute", {
      p_dispute_id: disputeId,
      p_fixed: false,
      p_reason: "tech should not be able to acknowledge",
    });
    expect(techAckErr?.message).toMatch(/FORBIDDEN/);

    const { data: ack, error: ackErr } = await exec.client.rpc("acknowledge_restoration_dispute", {
      p_dispute_id: disputeId,
      p_fixed: false,
      p_reason: "confirmed still broken on re-inspection",
    });
    expect(ackErr).toBeNull();
    expect((ack as { status: string }).status).toBe("ACKNOWLEDGED_NOT_FIXED");

    const { data: caseAfter } = await exec.client.from("cases").select("status").eq("id", caseId).single();
    expect(caseAfter!.status).toBe("DIAGNOSING");

    const { data: events } = await exec.client
      .from("case_events")
      .select("event_type")
      .eq("case_id", caseId)
      .eq("event_type", "RESTORATION_DISPUTE_ACKNOWLEDGED");
    expect(events!.length).toBe(1);

    const { data: notifications } = await exec.client
      .from("notifications")
      .select("recipient_user_id")
      .eq("case_id", caseId)
      .eq("notification_type", "RESTORATION_DISPUTED");
    expect(notifications!.some((n) => n.recipient_user_id === tech.userId)).toBe(true);

    const { error: doubleAckErr } = await exec.client.rpc("acknowledge_restoration_dispute", {
      p_dispute_id: disputeId,
      p_fixed: true,
      p_reason: "double ack attempt",
    });
    expect(doubleAckErr?.message).toMatch(/ALREADY_ACKNOWLEDGED/);
  });

  it("fixed: case status is left unchanged and the guard lifts, letting closure proceed", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { caseId, restorationId } = await driveToTechnicallyRestoredAndPassed(
      exec,
      tech.userId,
      "restoration dispute — fixed"
    );
    const { data: dispute } = await tech.client.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: "thought it was still broken",
    });
    const disputeId = (dispute as { dispute_id: string }).dispute_id;

    const { data: ack, error: ackErr } = await exec.client.rpc("acknowledge_restoration_dispute", {
      p_dispute_id: disputeId,
      p_fixed: true,
      p_reason: "re-inspected, confirmed fixed",
    });
    expect(ackErr).toBeNull();
    expect((ack as { status: string }).status).toBe("ACKNOWLEDGED_FIXED");

    const { data: caseAfter } = await exec.client.from("cases").select("status").eq("id", caseId).single();
    expect(caseAfter!.status).toBe("TECHNICALLY_RESTORED");

    // Guard is lifted now that the dispute is no longer PENDING.
    await exec.client.rpc("set_qc_required", { p_case_id: caseId, p_qc_required: false, p_reason: "autotest" });
    const { error: releaseErr } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(releaseErr).toBeNull();
  });
});
