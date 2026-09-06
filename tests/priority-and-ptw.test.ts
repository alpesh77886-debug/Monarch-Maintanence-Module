import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 16: §5.4 priority Manager-override + §14.2 PTW safety gate seam.
//
// transition_case is touched here for the THIRD time (after the RISK-14
// regression and its 0012 fix). The most important assertions in this file
// are therefore not the new PTW gate itself, but that every guard that
// already existed on that function — the QC gate at all three qc_required
// states, the DUPLICATE lockout, REASON_REQUIRED — still holds. A future
// rewrite that drops any of them should fail here, the same way RISK-14 was
// eventually caught by CI rather than by review.

async function seedToStatus(label: string, targetStatus: string) {
  const exec = await signInAs("executive");
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

  // A fresh case is already REPORTED — acknowledge_case would move it past
  // that, so callers wanting REPORTED stop here.
  if (targetStatus === "REPORTED") {
    return { exec, caseId };
  }

  await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });
  // Transition INTO each status, then check whether that was the target —
  // stopping BEFORE transitioning (the original bug here) leaves the case
  // one status short of what the caller asked for.
  for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
    await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    if (status === targetStatus) break;
  }
  return { exec, caseId };
}

describe("transition_case regression guard (touched a third time in Loop 16)", () => {
  it("QC gate still blocks a direct release when qc_required is true", async () => {
    const { exec, caseId } = await seedToStatus("loop16 regression qc-true", "IN_REPAIR");
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "fix",
    });
    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: true,
      p_reason: "needs QC",
    });
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(error?.message).toMatch(/QC_GATE/);
  });

  it("QC gate still blocks an UNDECIDED (never-set) qc_required", async () => {
    const { exec, caseId } = await seedToStatus("loop16 regression qc-undecided", "IN_REPAIR");
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "fix",
    });
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(error?.message).toMatch(/QC_GATE/);
  });

  it("DUPLICATE guard still redirects to mark_duplicate_case", async () => {
    const { exec, caseId } = await seedToStatus("loop16 regression duplicate", "REPORTED");
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "DUPLICATE",
    });
    expect(error?.message).toMatch(/USE_MARK_DUPLICATE_CASE/);
  });

  it("REASON_REQUIRED still enforced on REJECTED/CLOSED", async () => {
    const { exec, caseId } = await seedToStatus("loop16 regression reason", "REPORTED");
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "REJECTED",
    });
    expect(error?.message).toMatch(/REASON_REQUIRED/);
  });
});

describe("§14.2 PTW gate on DIAGNOSING -> IN_REPAIR", () => {
  it("does not block when PTW was never marked required", async () => {
    const { exec, caseId } = await seedToStatus("loop16 ptw not required", "DIAGNOSING");
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "IN_REPAIR",
    });
    expect(error).toBeNull();
  });

  it("set_ptw_required is staff-only and needs a reason", async () => {
    const { caseId } = await seedToStatus("loop16 ptw guards", "DIAGNOSING");
    const tech = await signInAs("technician");
    const exec = await signInAs("executive");

    let { error } = await tech.client.rpc("set_ptw_required", {
      p_case_id: caseId,
      p_required: true,
      p_reason: "tech tries",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await exec.client.rpc("set_ptw_required", {
      p_case_id: caseId,
      p_required: true,
      p_reason: "   ",
    }));
    expect(error?.message).toMatch(/REASON_REQUIRED/);
  });

  it("refuses to link proof before PTW is marked required", async () => {
    const { exec, caseId } = await seedToStatus("loop16 ptw proof before required", "DIAGNOSING");
    const { error } = await exec.client.rpc("link_ptw_proof", {
      p_case_id: caseId,
      p_proof_ref: "PERMIT-001",
    });
    expect(error?.message).toMatch(/PTW_NOT_REQUIRED/);
  });

  it("blocks IN_REPAIR when required and no proof, then allows it once linked", async () => {
    const { exec, caseId } = await seedToStatus("loop16 ptw full gate", "DIAGNOSING");

    await exec.client.rpc("set_ptw_required", {
      p_case_id: caseId,
      p_required: true,
      p_reason: testSymptom("confined space work"),
    });

    let { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "IN_REPAIR",
    });
    expect(error?.message).toMatch(/PTW_GATE/);

    // blank proof is refused too
    ({ error } = await exec.client.rpc("link_ptw_proof", {
      p_case_id: caseId,
      p_proof_ref: "   ",
    }));
    expect(error?.message).toMatch(/PROOF_REF_REQUIRED/);

    ({ error } = await exec.client.rpc("link_ptw_proof", {
      p_case_id: caseId,
      p_proof_ref: testSymptom("PERMIT-001"),
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "IN_REPAIR",
    }));
    expect(error).toBeNull();
  });

  it("disabling PTW clears any linked proof (no stale permit on a cleared requirement)", async () => {
    const { exec, caseId } = await seedToStatus("loop16 ptw disable clears proof", "DIAGNOSING");
    await exec.client.rpc("set_ptw_required", {
      p_case_id: caseId,
      p_required: true,
      p_reason: "initial",
    });
    await exec.client.rpc("link_ptw_proof", {
      p_case_id: caseId,
      p_proof_ref: "PERMIT-XYZ",
    });
    await exec.client.rpc("set_ptw_required", {
      p_case_id: caseId,
      p_required: false,
      p_reason: "not needed after all",
    });

    const { data: row } = await exec.client
      .from("cases")
      .select("ptw_required, ptw_proof_ref")
      .eq("id", caseId)
      .single();
    expect(row!.ptw_required).toBe(false);
    expect(row!.ptw_proof_ref).toBeNull();
  });
});

describe("§5.4 change_priority — Executive can change, Manager has final override", () => {
  it("is staff-only and needs a reason", async () => {
    const { caseId } = await seedToStatus("loop16 priority guards", "REPORTED");
    const tech = await signInAs("technician");
    const exec = await signInAs("executive");

    let { error } = await tech.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "HIGH",
      p_reason: "tech tries",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await exec.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "HIGH",
      p_reason: "",
    }));
    expect(error?.message).toMatch(/REASON_REQUIRED/);
  });

  it("lets an Executive change freely until a Manager locks it, then refuses the Executive", async () => {
    const { exec, caseId } = await seedToStatus("loop16 priority lock chain", "REPORTED");
    const mgr = await signInAs("manager");

    // Executive changes it twice — never locked yet.
    let { error } = await exec.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "MEDIUM",
      p_reason: testSymptom("exec raises it"),
    });
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "HIGH",
      p_reason: testSymptom("exec raises again"),
    }));
    expect(error).toBeNull();

    // Manager overrides.
    ({ error } = await mgr.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "LOW",
      p_reason: testSymptom("manager overrides down"),
    }));
    expect(error).toBeNull();

    const { data: afterManager } = await exec.client
      .from("cases")
      .select("priority, priority_set_by_role")
      .eq("id", caseId)
      .single();
    expect(afterManager!.priority).toBe("LOW");
    expect(afterManager!.priority_set_by_role).toBe("MAINTENANCE_MANAGER");

    // Executive tries to undo the Manager's decision — refused (§5.4).
    ({ error } = await exec.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "HIGH",
      p_reason: testSymptom("exec tries to undo manager"),
    }));
    expect(error?.message).toMatch(/MANAGER_OVERRIDE/);

    // A Manager can still change it again.
    ({ error } = await mgr.client.rpc("change_priority", {
      p_case_id: caseId,
      p_priority: "HIGH",
      p_reason: testSymptom("manager changes own decision"),
    }));
    expect(error).toBeNull();

    const { data: events } = await exec.client
      .from("case_events")
      .select("event_type")
      .eq("case_id", caseId)
      .eq("event_type", "PRIORITY_CHANGED");
    expect(events?.length).toBe(4);
  });
});
