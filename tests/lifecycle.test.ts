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
