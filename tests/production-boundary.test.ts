import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 13: §13 production restart boundary.
//
// The rule that matters most here is §13.1's "Do not silently clear the
// stop." A recording function that helpfully tidied up the stop would look
// like a convenience and would in fact erase the reason the line was unsafe,
// so that specific non-behaviour is asserted directly.

async function seedCaseWithStop(label: string) {
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

  const { data: stop, error } = await exec.client.rpc("raise_safety_stop", {
    p_case_id: caseId,
    p_stop_type: "SAFETY",
    p_reason: testSymptom("guard interlock bypassed"),
    p_machine_ref: "AUTOTEST-MOTOR",
    p_line_ref: "AUTOTEST-LINE",
  });
  expect(error).toBeNull();
  return { exec, caseId, stopId: (stop as { safety_stop_id: string }).safety_stop_id };
}

describe("Maintenance safety/technical stop (§13, §24)", () => {
  it("is staff-only, needs a reason, and allows only one active stop per case", async () => {
    const tech = await signInAs("technician");
    const { exec, caseId } = await seedCaseWithStop("stop guards");

    // A second active stop would make "the active stop reference" (§13.1)
    // ambiguous.
    let { error } = await exec.client.rpc("raise_safety_stop", {
      p_case_id: caseId,
      p_stop_type: "TECHNICAL",
      p_reason: "second stop",
    });
    expect(error?.message).toMatch(/STOP_ALREADY_ACTIVE/);

    ({ error } = await tech.client.rpc("raise_safety_stop", {
      p_case_id: caseId,
      p_stop_type: "SAFETY",
      p_reason: "non-staff tries",
    }));
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("can only be lifted deliberately, by staff, with a reason", async () => {
    const tech = await signInAs("technician");
    const { exec, stopId } = await seedCaseWithStop("stop lifting");

    let { error } = await tech.client.rpc("lift_safety_stop", {
      p_safety_stop_id: stopId,
      p_reason: "non-staff tries to lift",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await exec.client.rpc("lift_safety_stop", {
      p_safety_stop_id: stopId,
      p_reason: "",
    }));
    expect(error?.message).toMatch(/REASON_REQUIRED/);

    ({ error } = await exec.client.rpc("lift_safety_stop", {
      p_safety_stop_id: stopId,
      p_reason: testSymptom("interlock restored and verified"),
    }));
    expect(error).toBeNull();

    ({ error } = await exec.client.rpc("lift_safety_stop", {
      p_safety_stop_id: stopId,
      p_reason: "again",
    }));
    expect(error?.message).toMatch(/ALREADY_LIFTED/);
  });
});

describe("§13.1 — production started without Maintenance release", () => {
  it("records the breach WITHOUT clearing the active stop", async () => {
    const { exec, caseId, stopId } = await seedCaseWithStop("breach does not clear stop");

    const { data: result, error } = await exec.client.rpc(
      "record_production_started_without_release",
      {
        p_case_id: caseId,
        p_reason: testSymptom("line supervisor restarted despite active stop"),
        p_machine_ref: "AUTOTEST-MOTOR",
        p_line_ref: "AUTOTEST-LINE",
      }
    );
    expect(error).toBeNull();

    // The event references the stop that was active at the time.
    expect((result as { safety_stop_id: string }).safety_stop_id).toBe(stopId);

    // §13.1: "Do not silently clear the stop." The stop must still be active.
    const { data: stopRow } = await exec.client
      .from("safety_stops")
      .select("lifted_at, lifted_by")
      .eq("id", stopId)
      .single();
    expect(stopRow!.lifted_at).toBeNull();
    expect(stopRow!.lifted_by).toBeNull();

    // And it is not a restart/release: the case must not have moved.
    const { data: caseRow } = await exec.client
      .from("cases")
      .select("status, maintenance_released_at")
      .eq("id", caseId)
      .single();
    expect(caseRow!.status).toBe("REPORTED");
    expect(caseRow!.maintenance_released_at).toBeNull();

    // The record itself captures the status it was recorded against.
    const { data: events } = await exec.client
      .from("production_boundary_events")
      .select("event_type, case_status_at_record, safety_stop_id")
      .eq("case_id", caseId);
    expect(events?.length).toBe(1);
    expect(events![0].event_type).toBe("PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE");
    expect(events![0].case_status_at_record).toBe("REPORTED");
  });

  it("refuses to record a breach on a case that was actually released", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("released case is not a breach"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    // Walk it to MAINTENANCE_RELEASED the legitimate way.
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });
    for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
      await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: status });
    }
    await exec.client.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: "TECHNICAL",
      p_details: "autotest fix",
    });
    await exec.client.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: false,
      p_reason: "no QC needed for autotest",
    });
    await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "MAINTENANCE_RELEASED",
    });

    // Production starting after a real release is the expected outcome —
    // recording it as a §13.1 violation would be false history.
    const { error } = await exec.client.rpc("record_production_started_without_release", {
      p_case_id: caseId,
      p_reason: "should not be recordable",
    });
    expect(error?.message).toMatch(/ALREADY_RELEASED/);
  });

  it("requires reason/context and staff (§13.1 record fields)", async () => {
    const tech = await signInAs("technician");
    const { exec, caseId } = await seedCaseWithStop("breach guards");

    let { error } = await exec.client.rpc("record_production_started_without_release", {
      p_case_id: caseId,
      p_reason: "",
    });
    expect(error?.message).toMatch(/REASON_REQUIRED/);

    ({ error } = await tech.client.rpc("record_production_started_without_release", {
      p_case_id: caseId,
      p_reason: "non-staff tries",
    }));
    expect(error?.message).toMatch(/FORBIDDEN/);
  });
});

describe("§13.2 — shift ended, production not restarted", () => {
  it("records without fabricating a restart, and does not block closure", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("not restarted"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { error } = await exec.client.rpc("record_production_not_restarted", {
      p_case_id: caseId,
      p_reason: testSymptom("shift ended, awaiting spare"),
    });
    expect(error).toBeNull();

    const { data: events } = await exec.client
      .from("production_boundary_events")
      .select("event_type")
      .eq("case_id", caseId);
    expect(events?.length).toBe(1);
    expect(events![0].event_type).toBe("PRODUCTION_NOT_RESTARTED");

    // §13.2: "Maintenance may close if Maintenance-side conditions permit" —
    // so recording this must not have introduced a new closure blocker. The
    // case is still in REPORTED, i.e. untouched by the recording.
    const { data: caseRow } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(caseRow!.status).toBe("REPORTED");
  });
});

describe("§15 — raise_safety_stop notifies Maintenance Managers (Loop 35)", () => {
  // §15: "Immediate Production Manager notification is mandatory." No
  // Production Manager account exists in this standalone module (§3.1's two
  // roles are the only ones), so — matching the precedent already set for
  // the closely related §13.1 breach notification, one function below this
  // one in the same migration — every active Maintenance Manager is notified
  // instead. Before Loop 35, raise_safety_stop sent no notification at all.
  it("notifies the active manager, with the stop type and reason in the message", async () => {
    const mgr = await signInAs("manager");
    const { caseId } = await seedCaseWithStop("stop notification");

    const { data: received } = await mgr.client
      .from("notifications")
      .select("notification_type, message")
      .eq("case_id", caseId)
      .eq("notification_type", "SAFETY_STOP_RAISED");
    expect(received?.length).toBe(1);
    expect(received![0].message).toMatch(/SAFETY/);
  });

  it("does not notify anyone when a non-staff caller is correctly refused", async () => {
    const tech = await signInAs("technician");
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("stop notification refused actor"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { error } = await tech.client.rpc("raise_safety_stop", {
      p_case_id: caseId,
      p_stop_type: "SAFETY",
      p_reason: "non-staff tries",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    const { data: received } = await mgr.client
      .from("notifications")
      .select("id")
      .eq("case_id", caseId)
      .eq("notification_type", "SAFETY_STOP_RAISED");
    expect(received?.length).toBe(0);
  });
});

describe("Boundary records are append-only from the client", () => {
  it("denies direct inserts into safety_stops and production_boundary_events", async () => {
    const { exec, caseId } = await seedCaseWithStop("direct insert denial");

    const { error: stopErr } = await exec.client.from("safety_stops").insert({
      case_id: caseId,
      stop_type: "SAFETY",
      reason: "forged",
      raised_by: exec.userId,
    });
    expect(stopErr).not.toBeNull();

    const { error: eventErr } = await exec.client
      .from("production_boundary_events")
      .insert({
        case_id: caseId,
        event_type: "PRODUCTION_NOT_RESTARTED",
        reason: "forged",
        recorded_by: exec.userId,
        case_status_at_record: "REPORTED",
      });
    expect(eventErr).not.toBeNull();
  });
});
