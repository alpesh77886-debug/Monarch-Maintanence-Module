import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Forensic remediation regression suite.
//
// These are negative-path tests: every case below asserts that a forbidden
// operation FAILS server-side. They exist because each one was reachable at
// some point — F-01 (QC self-clearance) and F-02/03/04 (read scope) were all
// live defects, not hypotheticals. Frontend hiding is not authorization, so
// nothing here goes through the UI.

describe("F-01 — QC decision authority boundary", () => {
  it("a Maintenance Executive cannot record a QC decision", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("qc_decision", {
      p_clearance_id: "00000000-0000-0000-0000-000000000001",
      p_decision: "CLEARED",
    });
    // The authority guard runs before the clearance lookup, so a nonexistent
    // clearance id still proves which gate refused us: FORBIDDEN means the
    // authority check fired; CLEARANCE_NOT_FOUND would mean it let us through.
    expect(error?.message).toMatch(/FORBIDDEN/);
    expect(error?.message).toMatch(/does not own QC clearance/i);
  });

  it("a Maintenance Manager cannot record a QC decision either", async () => {
    const mgr = await signInAs("manager");
    const { error } = await mgr.client.rpc("qc_decision", {
      p_clearance_id: "00000000-0000-0000-0000-000000000001",
      p_decision: "CLEARED",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
    expect(error?.message).toMatch(/does not own QC clearance/i);
  });

  it("a non-staff identity with no QC grant cannot record a QC decision", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client.rpc("qc_decision", {
      p_clearance_id: "00000000-0000-0000-0000-000000000001",
      p_decision: "CLEARED",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
    expect(error?.message).toMatch(/granted QC authority/i);
  });

  it("the granted QC identity passes both authority gates", async () => {
    const qc = await signInAs("qc");
    const { error } = await qc.client.rpc("qc_decision", {
      p_clearance_id: "00000000-0000-0000-0000-000000000001",
      p_decision: "CLEARED",
    });
    // Reaching the clearance lookup is the pass condition — it means neither
    // authority guard refused this identity.
    expect(error?.message).toMatch(/CLEARANCE_NOT_FOUND/);
  });

  it("a QC decision is written to the audit log with the real QC actor", async () => {
    const exec = await signInAs("executive");
    const qc = await signInAs("qc");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-01 audit trail"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    }
    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: true,
      p_reason: "autotest: QC required",
    });
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest restoration",
    });
    const sent = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
    expect(sent.error).toBeNull();
    const clearanceId = sent.data.clearance_id as string;

    const decided = await qc.client.rpc("qc_decision", {
      p_clearance_id: clearanceId,
      p_decision: "CLEARED",
    });
    expect(decided.error).toBeNull();

    // The 0007 version wrote no audit row at all, so the QC actor was absent
    // from the audit trail entirely. Staff can read audit_log.
    const { data: audits } = await exec.client
      .from("audit_log")
      .select("actor_user_id, action, target_id")
      .eq("action", "qc_decision")
      .eq("target_id", clearanceId);

    expect(audits?.length).toBe(1);
    expect(audits![0].actor_user_id).toBe(qc.userId);
    // and specifically NOT the Maintenance actor who sent it to QC
    expect(audits![0].actor_user_id).not.toBe(exec.userId);
  });

  it("a repeated QC decision is refused rather than duplicated", async () => {
    const exec = await signInAs("executive");
    const qc = await signInAs("qc");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-01 idempotency"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    }
    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: true,
      p_reason: "autotest: QC required",
    });
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest restoration",
    });
    const sent = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
    const clearanceId = sent.data.clearance_id as string;

    const first = await qc.client.rpc("qc_decision", {
      p_clearance_id: clearanceId,
      p_decision: "REJECTED",
      p_reason: "autotest: rejected once",
    });
    expect(first.error).toBeNull();

    const retry = await qc.client.rpc("qc_decision", {
      p_clearance_id: clearanceId,
      p_decision: "CLEARED",
    });
    expect(retry.error?.message).toMatch(/ALREADY_DECIDED/);

    // The rejection must have returned the case to a repair state (§12).
    const { data: after } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(after!.status).toBe("QC_REJECTED");

    // and exactly one decision event exists, not two
    const { data: events } = await exec.client
      .from("case_events")
      .select("id")
      .eq("case_id", caseId)
      .eq("event_type", "QC_DECISION");
    expect(events?.length).toBe(1);
  });
});

describe("F-01b — the QC identity's grant is narrow (0034 regression)", () => {
  // 0031 let a QC identity past qc_decision's gates but transition_case still
  // refused it, so no QC decision could ever complete. 0034 grants exactly the
  // two QC-decision edges. These tests pin that the grant did not widen into
  // general lifecycle authority.
  it("cannot perform an ordinary lifecycle transition", async () => {
    const exec = await signInAs("executive");
    const qc = await signInAs("qc");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-01b qc overreach"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await qc.client.rpc("transition_case", {
      p_case_id: created!.id,
      p_new_status: "ASSESSED",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("cannot release a case that never went through a clearance", async () => {
    const exec = await signInAs("executive");
    const qc = await signInAs("qc");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-01b qc skips clearance"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    }
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest",
    });

    // TECHNICALLY_RESTORED, not CLEARANCE_PENDING — a QC identity must not be
    // able to release it directly and skip the clearance record entirely.
    const { error } = await qc.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });
    expect(error?.message).toMatch(/CLEARANCE_PENDING/);
  });
});

describe("F-02/03/04 — read scope is enforced by RLS, not by the UI", () => {
  it("an unrelated authenticated identity cannot read a case it neither reported nor is assigned to", async () => {
    const exec = await signInAs("executive");
    const outsider = await signInAs("qc"); // authenticated, non-staff, unrelated

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-02 read scope"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { data: seen } = await outsider.client
      .from("cases")
      .select("id")
      .eq("id", caseId);
    expect(seen).toEqual([]);
  });

  it("staff can read every case (the §22 shift dashboard depends on it)", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-02 staff read"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { data: seen } = await mgr.client
      .from("cases")
      .select("id")
      .eq("id", created!.id);
    expect(seen?.length).toBe(1);
  });

  it("the reporter can still read their own case", async () => {
    const tech = await signInAs("technician"); // non-staff reporter
    const { data: created, error } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-02 reporter read"),
        reporter_user_id: tech.userId,
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { data: seen } = await tech.client
      .from("cases")
      .select("id")
      .eq("id", created!.id);
    expect(seen?.length).toBe(1);
  });

  it("an assigned technician can read the case they are assigned to", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("F-02 assignee read"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
    await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: "ASSESSED" });
    await exec.client.rpc("assign_technician", {
      p_case_id: caseId,
      p_technician_user_id: tech.userId,
    });

    const { data: seen } = await tech.client.from("cases").select("id").eq("id", caseId);
    expect(seen?.length).toBe(1);
  });

  it("an unrelated identity cannot read safety stops or production boundary events", async () => {
    const outsider = await signInAs("qc");

    const { data: stops } = await outsider.client.from("safety_stops").select("id").limit(5);
    expect(stops).toEqual([]);

    const { data: boundary } = await outsider.client
      .from("production_boundary_events")
      .select("id")
      .limit(5);
    expect(boundary).toEqual([]);
  });

  it("an unrelated identity cannot read evidence for a case it cannot read", async () => {
    const outsider = await signInAs("qc");
    const { data: ev } = await outsider.client.from("evidence").select("id").limit(5);
    expect(ev).toEqual([]);
  });
});

describe("F-04 — write protections on safety/production tables are unchanged", () => {
  it("no client may insert a safety stop directly (RPC-only)", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client
      .from("safety_stops")
      .insert({ case_id: "00000000-0000-0000-0000-000000000001", stop_type: "SAFETY", reason: "x" });
    expect(error).not.toBeNull();
  });

  it("no client may insert a production boundary event directly (RPC-only)", async () => {
    const mgr = await signInAs("manager");
    const { error } = await mgr.client
      .from("production_boundary_events")
      .insert({ case_id: "00000000-0000-0000-0000-000000000001", event_type: "PRODUCTION_NOT_RESTARTED" });
    expect(error).not.toBeNull();
  });
});
