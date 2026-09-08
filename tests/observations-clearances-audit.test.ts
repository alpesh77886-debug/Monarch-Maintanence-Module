import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 25 (last loop of the Loops 21-25 batch). Not a new column or RPC —
// a systematic check for RLS-enabled tables with literally zero automated
// coverage anywhere in this suite (grepped every `alter table ... enable
// row level security` against every test file's table/RPC references).
// Three came back with real, meaningful policies that had never been
// exercised: `observations`, `clearances`, `audit_log`. All three RLS
// policies below were already correct (migration 0002, Loop 1/2) — this
// loop only closes the verification debt, per CLAUDE.md's "every material
// state change must be testable and auditable", matching the precedent
// set by Loop 23 closing set_recurrence_rule_active's coverage gap.

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

describe("observations (§9 journal entries) — RLS (Loop 25)", () => {
  async function seedCase(label: string) {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({ case_type: "BREAKDOWN", symptom: testSymptom(label), reporter_user_id: exec.userId })
      .select("id")
      .single();
    return { exec, caseId: created!.id as string };
  }

  it("refuses a non-staff insert", async () => {
    const { caseId } = await seedCase("observation non-staff");
    const tech = await signInAs("technician");
    const { error } = await tech.client.from("observations").insert({
      case_id: caseId,
      actor_user_id: tech.userId,
      observation: "should not be allowed",
    });
    expect(error).not.toBeNull();
  });

  it("lets staff insert and read their own entry", async () => {
    const { exec, caseId } = await seedCase("observation staff");
    const { error } = await exec.client.from("observations").insert({
      case_id: caseId,
      actor_user_id: exec.userId,
      observation: testSymptom("checked pump"),
      current_condition: "running",
    });
    expect(error).toBeNull();

    const { data } = await exec.client
      .from("observations")
      .select("observation, current_condition")
      .eq("case_id", caseId)
      .single();
    expect(data!.current_condition).toBe("running");
  });

  it("hides observations from a non-staff user", async () => {
    const { exec, caseId } = await seedCase("observation hidden");
    await exec.client.from("observations").insert({
      case_id: caseId,
      actor_user_id: exec.userId,
      observation: "staff-only content",
    });

    const tech = await signInAs("technician");
    const { data } = await tech.client.from("observations").select("id").eq("case_id", caseId);
    expect(data ?? []).toHaveLength(0);
  });

  it("is append-only — no update/delete policy exists", async () => {
    const { exec, caseId } = await seedCase("observation append-only");
    const { data: inserted } = await exec.client
      .from("observations")
      .insert({ case_id: caseId, actor_user_id: exec.userId, observation: "original" })
      .select("id")
      .single();

    // RLS with no UPDATE policy matches zero rows and PostgREST reports
    // success, not an error (the Loop 18 lesson) — assert the row is
    // provably unchanged, not that an error was thrown.
    await exec.client.from("observations").update({ observation: "edited" }).eq("id", inserted!.id);

    const { data: after } = await exec.client
      .from("observations")
      .select("observation")
      .eq("id", inserted!.id)
      .single();
    expect(after!.observation).toBe("original");
  });

  // Loop 34: §8's canonical continuity-journal structure names 9 fields
  // per entry (intervention/step reference, observation, action, result,
  // current condition, pending action, blocker, next step, evidence
  // reference) — all 9 have existed as columns since Loop 1, but
  // observation-form.tsx only ever exposed 4 of them (observation, action,
  // current_condition, next_step), so result/pending_action/blocker/
  // intervention_id/evidence_ref were silently unreachable through the
  // app for a "mandatory V1 feature." RLS itself was never the problem
  // (already unrestricted on these columns) — this is a UI completeness
  // fix, verified here at the data layer since the columns are what the
  // RLS policy actually gates.
  it("accepts all 9 canonical §8 fields, including intervention linkage and evidence reference", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("observation full fields"));

    const { data: intervention } = await exec.client.rpc("record_intervention", {
      p_case_id: caseId,
      p_action_taken: "autotest: replaced seal",
      p_technician_user_id: exec.userId,
    });
    const interventionId = (intervention as { intervention_id: string }).intervention_id;

    const { error } = await exec.client.from("observations").insert({
      case_id: caseId,
      actor_user_id: exec.userId,
      intervention_id: interventionId,
      observation: "leak observed",
      action: "replaced seal",
      result: "leak stopped",
      current_condition: "running normally",
      pending_action: "monitor for 24h",
      blocker: "none",
      next_step: "close case if stable",
      evidence_ref: "photo-ref-001",
    });
    expect(error).toBeNull();

    const { data } = await exec.client
      .from("observations")
      .select("*")
      .eq("case_id", caseId)
      .single();
    expect(data!.intervention_id).toBe(interventionId);
    expect(data!.result).toBe("leak stopped");
    expect(data!.pending_action).toBe("monitor for 24h");
    expect(data!.blocker).toBe("none");
    expect(data!.evidence_ref).toBe("photo-ref-001");
  });
});

describe("clearances (§12 QC) — RLS (Loop 25)", () => {
  async function seedClearance(label: string) {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom(label));
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest",
    });
    const { data: sent } = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
    return { exec, caseId, clearanceId: (sent as { clearance_id: string }).clearance_id };
  }

  // Migration 0024 (this loop): a direct insert used to succeed for ANY
  // staff member on ANY case, in ANY status — verified live before writing
  // this test that it worked even on a case still sitting at REPORTED,
  // completely bypassing send_to_qc's own TECHNICALLY_RESTORED guard. Now
  // RPC-only, matching spare_requests/spare_usage (Loop 8). Uses a real,
  // freshly created case so this is unambiguously an RLS denial, not a
  // foreign-key failure on a fake case_id.
  it("denies a direct insert on any case, even a fresh REPORTED one — send_to_qc is the only way in", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("clearance direct-insert denial"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await exec.client.from("clearances").insert({
      case_id: created!.id,
      sent_to_qc_by: exec.userId,
    });
    expect(error).not.toBeNull();
  });

  it("send_to_qc (the legitimate RPC path) still works after the RLS tightening", async () => {
    const { clearanceId } = await seedClearance("clearance rpc still works");
    expect(clearanceId).toBeTruthy();
  });

  it("hides clearances from a non-staff user", async () => {
    const { clearanceId } = await seedClearance("clearance hidden");
    const tech = await signInAs("technician");
    const { data } = await tech.client.from("clearances").select("id").eq("id", clearanceId);
    expect(data ?? []).toHaveLength(0);
  });

  it("is visible to staff", async () => {
    const { exec, clearanceId } = await seedClearance("clearance visible");
    const { data } = await exec.client
      .from("clearances")
      .select("decision")
      .eq("id", clearanceId)
      .single();
    expect(data!.decision).toBe("PENDING");
  });
});

describe("audit_log — RLS (Loop 25)", () => {
  it("is staff-only to read", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("audit log staff read"));
    // transition_case's own RPC already writes an audit_log row for this case.
    const { data, error } = await exec.client
      .from("audit_log")
      .select("id, action")
      .eq("target_id", caseId)
      .limit(1);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);

    const tech = await signInAs("technician");
    const { data: hidden } = await tech.client
      .from("audit_log")
      .select("id")
      .eq("target_id", caseId);
    expect(hidden ?? []).toHaveLength(0);
  });

  it("has no INSERT policy at all — even a staff member cannot write directly", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.from("audit_log").insert({
      actor_user_id: exec.userId,
      action: "forged",
      target_table: "maintenance.cases",
    });
    expect(error).not.toBeNull();
  });

  // Blueprint Gap Matrix (Loop 56) NS-019: audit entries must be append-only
  // — no UPDATE or DELETE policy exists on audit_log (0002), so both are
  // already structurally blocked by RLS default-deny. This makes that
  // guarantee a checked regression rather than an inferred one.
  it("NS-019: has no UPDATE or DELETE policy — a staff member cannot alter or remove an entry", async () => {
    const exec = await signInAs("executive");
    const caseId = await driveToInRepair(exec, testSymptom("NS-019 audit append-only"));
    const { data: row } = await exec.client
      .from("audit_log")
      .select("id, reason")
      .eq("target_id", caseId)
      .limit(1)
      .single();
    expect(row).not.toBeNull();

    const update = await exec.client
      .from("audit_log")
      .update({ reason: "tampered" })
      .eq("id", row!.id)
      .select();
    expect(update.data ?? []).toHaveLength(0);

    const del = await exec.client.from("audit_log").delete().eq("id", row!.id).select();
    expect(del.data ?? []).toHaveLength(0);

    const { data: unchanged } = await exec.client
      .from("audit_log")
      .select("id, reason")
      .eq("id", row!.id)
      .single();
    expect(unchanged!.reason).toBe(row!.reason);
  });
});
