import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

async function driveToInRepair(exec: Awaited<ReturnType<typeof signInAs>>, symptom: string) {
  const { data: created } = await exec.client
    .from("cases")
    .insert({ case_type: "BREAKDOWN", symptom, reporter_user_id: exec.userId })
    .select("id")
    .single();
  const caseId = created!.id as string;
  await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
  for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
    await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
  }
  return caseId;
}

describe("Scenario B — QC required / rejected then cleared (§38)", () => {
  it("goes TECHNICALLY_RESTORED -> CLEARANCE_PENDING -> QC_REJECTED -> ... -> MAINTENANCE_RELEASED", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("scenario B"));

    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: true,
      p_reason: "autotest: QC required",
    });

    let { error } = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest first attempt",
    });
    expect(error).toBeNull();

    let sendResult = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
    expect(sendResult.error).toBeNull();
    const firstClearanceId = sendResult.data.clearance_id as string;

    let decision = await exec.client.rpc("qc_decision", {
      p_clearance_id: firstClearanceId,
      p_decision: "REJECTED",
      p_reason: "autotest: still faulty",
    });
    expect(decision.error).toBeNull();

    const { data: afterReject } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(afterReject!.status).toBe("QC_REJECTED");

    ({ error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "IN_REPAIR",
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest second attempt",
    }));
    expect(error).toBeNull();

    sendResult = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
    expect(sendResult.error).toBeNull();

    decision = await exec.client.rpc("qc_decision", {
      p_clearance_id: sendResult.data.clearance_id,
      p_decision: "CLEARED",
    });
    expect(decision.error).toBeNull();

    const { data: released } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(released!.status).toBe("MAINTENANCE_RELEASED");
  });

  it("blocks a direct release when qc_required is true (§13 QC gate)", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("QC gate bypass"));
    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: true,
      p_reason: "autotest",
    });
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest",
    });

    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("QC_GATE");
  });

  it("blocks a direct release when qc_required was never decided (RISK-11 regression)", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("QC undecided"));
    // qc_required is left at its default (NULL) — never calling set_qc_required.
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest",
    });

    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("QC_GATE");
  });
});

describe("Scenario C — temporary restoration + follow-up (§10, §38, RISK-12 regression)", () => {
  it("TEMPORARILY_RESTORED has no direct edge to TECHNICALLY_RESTORED — follow-up via IN_REPAIR is required", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("scenario C"));

    let { error } = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TEMPORARY",
      p_details: "autotest: bypassed faulty part temporarily",
    });
    expect(error).toBeNull();

    const { data: tempCase } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(tempCase!.status).toBe("TEMPORARILY_RESTORED");

    // Regression guard for RISK-12: a TECHNICAL restoration must NOT be
    // recordable directly from TEMPORARILY_RESTORED (no such graph edge).
    const directAttempt = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest: should fail without the follow-up step",
    });
    expect(directAttempt.error).not.toBeNull();
    expect(directAttempt.error!.message).toContain("INVALID_TRANSITION");

    // The follow-up step the UI's FollowUpButton performs.
    ({ error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "IN_REPAIR",
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest: permanent fix after follow-up",
    }));
    expect(error).toBeNull();

    const { data: finalCase } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(finalCase!.status).toBe("TECHNICALLY_RESTORED");
  });
});

describe("Technical restoration verification failure (§4.2, §11)", () => {
  it("returns the case to IN_REPAIR with the failure reason recorded, never a false success", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("verification failure"));

    const restoration = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest: claimed fixed",
    });
    expect(restoration.error).toBeNull();

    const verify = await exec.client.rpc("verify_restoration", {
      p_restoration_id: restoration.data.restoration_id,
      p_passed: false,
      p_failure_reason: "autotest: failed re-test",
      p_return_status: "IN_REPAIR",
    });
    expect(verify.error).toBeNull();

    const { data: afterFailure } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(afterFailure!.status).toBe("IN_REPAIR");

    const { data: restorationRow } = await exec.client
      .from("restorations")
      .select("verification_result, verification_failure_reason")
      .eq("id", restoration.data.restoration_id)
      .single();
    expect(restorationRow!.verification_result).toBe("FAILED");
    expect(restorationRow!.verification_failure_reason).toContain("autotest");
  });
});
