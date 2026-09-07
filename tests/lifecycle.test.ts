import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Scenario A (IMPLEMENTATION_PACK.md §38) + the core negative-path and
// audit/idempotency guarantees from §37. Each `it` creates its own case so
// failures are independent and don't cascade.

describe("Scenario A — normal breakdown happy path (§38)", () => {
  it("goes REPORTED -> ... -> MAINTENANCE_RELEASED -> CLOSED, then reopens", async () => {
    const exec = await signInAs("executive");

    const { data: created, error: createErr } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("scenario A"),
        reporter_user_id: exec.userId,
      })
      .select("id, status")
      .single();
    expect(createErr).toBeNull();
    expect(created!.status).toBe("REPORTED");
    const caseId = created!.id as string;

    let { error } = await exec.client.rpc("acknowledge_case", {
      p_case_id: caseId,
      p_priority: "MEDIUM",
      p_initial_assessment: "autotest",
    });
    expect(error).toBeNull();

    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      ({ error } = await exec.client.rpc("transition_case", {
        p_case_id: caseId,
        p_new_status: status,
      }));
      expect(error, `transition to ${status}`).toBeNull();
    }

    ({ error } = await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest fix",
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: false,
      p_reason: "no QC needed for autotest",
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "CLOSED",
      p_reason: "autotest: production resumed",
    }));
    expect(error).toBeNull();

    const { data: closedCase } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(closedCase!.status).toBe("CLOSED");

    // Scenario F — reopen (§4.5, §38)
    ({ error } = await exec.client.rpc("reopen_case", {
      p_case_id: caseId,
      p_reason: "autotest: same problem recurred",
    }));
    expect(error).toBeNull();

    const { data: reopenedCase } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(reopenedCase!.status).toBe("DIAGNOSING");

    const { data: events } = await exec.client
      .from("case_events")
      .select("event_type")
      .eq("case_id", caseId);
    expect(events!.some((e) => e.event_type === "REOPENED")).toBe(true);
  });
});

describe("Invalid transitions are rejected server-side (§36.3, §37)", () => {
  it("rejects a transition skipped ahead in the graph", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("invalid transition"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    // REPORTED -> IN_REPAIR is not a valid edge.
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "IN_REPAIR",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("INVALID_TRANSITION");
  });

  it("rejects closing without a reason", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("closure reason required"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });
    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    }
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "fixed",
    });
    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: false,
      p_reason: "autotest",
    });
    await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });

    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "CLOSED",
      // p_reason intentionally omitted
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("REASON_REQUIRED");
  });
});

describe("Idempotency (§28)", () => {
  it("replaying the same idempotency key does not duplicate the event", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("idempotency"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });

    const idempotencyKey = `autotest-${caseId}`;
    const first = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "ASSESSED",
      p_idempotency_key: idempotencyKey,
    });
    const second = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "ASSESSED",
      p_idempotency_key: idempotencyKey,
    });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data.event_id).toBe(first.data.event_id);

    const { data: events } = await exec.client
      .from("case_events")
      .select("id")
      .eq("case_id", caseId)
      .eq("idempotency_key", idempotencyKey);
    expect(events!.length).toBe(1);
  });
});

describe("Append-only enforcement (§0 rule 6, §27)", () => {
  it("denies a direct client insert into case_events", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("append-only"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { error } = await exec.client
      .from("case_events")
      .insert({ case_id: caseId, event_type: "MANUAL_INJECT", actor_user_id: exec.userId });
    expect(error).not.toBeNull();
  });
});

// Loop 27 (RISK-19): cases_insert's with_check (migration 0002) validated
// only reporter_user_id = auth.uid() — every other column, including
// status, all emergency_* columns, qc_required, current_owner_user_id, and
// closed_at/closure_reason, was fully client-writable at INSERT time. Any
// authenticated non-staff user (no RPC involved) could self-confirm a fake
// emergency or insert an already-CLOSED case with a fabricated closure,
// bypassing the §6 two-step ceremony and the §4 LOCKED lifecycle graph at
// the root, with zero real audit trail. Fixed in migration 0026 by turning
// cases_insert into an allow-list: every non-intake column must land at
// its safe default/null, matching exactly what the real intake form
// (src/app/(app)/cases/new/page.tsx) submits.
describe("cases_insert column lockdown (§4, §6, RISK-19)", () => {
  it("refuses a reporter self-setting emergency_confirmed at creation", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client.from("cases").insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom("RISK-19 fake emergency_confirmed"),
      reporter_user_id: tech.userId,
      emergency_confirmed: true,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a reporter self-inserting an already-CLOSED case", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client.from("cases").insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom("RISK-19 fake closed case"),
      reporter_user_id: tech.userId,
      status: "CLOSED",
      closure_reason: "forged closure",
      qc_required: false,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a reporter self-setting current_owner_user_id or priority at creation", async () => {
    const exec = await signInAs("executive");
    let { error } = await exec.client.from("cases").insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom("RISK-19 fake owner"),
      reporter_user_id: exec.userId,
      current_owner_user_id: exec.userId,
    });
    expect(error).not.toBeNull();

    ({ error } = await exec.client.from("cases").insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom("RISK-19 fake priority"),
      reporter_user_id: exec.userId,
      priority: "HIGH",
    }));
    expect(error).not.toBeNull();
  });

  it("still allows the real intake payload, landing at safe defaults", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("RISK-19 legitimate intake"),
        area: "Line 3",
        line: "L3",
        asset_known: false,
        major_complex_flag: false,
        reporter_user_id: exec.userId,
      })
      .select("status, emergency_confirmed, qc_required, current_owner_user_id, closed_at")
      .single();
    expect(error).toBeNull();
    expect(data!.status).toBe("REPORTED");
    expect(data!.emergency_confirmed).toBe(false);
    expect(data!.qc_required).toBeNull();
    expect(data!.current_owner_user_id).toBeNull();
    expect(data!.closed_at).toBeNull();
  });
});
