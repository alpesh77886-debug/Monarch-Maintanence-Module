import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

describe("Technician assignment + intervention recording (§5.5, §9)", () => {
  it("assigns a technician by email, auto-transitions ASSESSED -> ASSIGNED, and records their intervention", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("assignment"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });
    await exec.client.rpc("transition_case", { p_case_id: caseId, p_new_status: "ASSESSED" });

    const lookup = await exec.client.rpc("find_user_by_email", { p_email: "tech1@monarch.test" });
    expect(lookup.error).toBeNull();
    expect(lookup.data).toBe(tech.userId);

    const assign = await exec.client.rpc("assign_technician", {
      p_case_id: caseId,
      p_technician_user_id: tech.userId,
    });
    expect(assign.error).toBeNull();

    const { data: assignedCase } = await exec.client
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();
    expect(assignedCase!.status).toBe("ASSIGNED");

    const ownRecord = await tech.client.rpc("record_intervention", {
      p_case_id: caseId,
      p_action_taken: "autotest: replaced part",
      p_result: "autotest: fixed",
      p_technician_user_id: tech.userId,
    });
    expect(ownRecord.error).toBeNull();
  });

  it("forbids a technician from recording an intervention as a different technician", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("impersonation"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const impersonate = await tech.client.rpc("record_intervention", {
      p_case_id: caseId,
      p_action_taken: "autotest: impersonation attempt",
      p_technician_user_id: exec.userId, // not tech's own id
    });
    expect(impersonate.error).not.toBeNull();
    expect(impersonate.error!.message).toContain("FORBIDDEN");
  });

  // Loop 30 (RISK-22): record_intervention's actor check was `is_staff() OR
  // p_technician_user_id = v_actor` — it never verified an actual
  // case_assignments row existed, unlike record_spare_usage's established
  // pattern. Any signed-in non-staff user could record a fabricated
  // intervention on ANY case by simply passing their own id (or omitting
  // p_technician_user_id entirely, which triggered a NULL-propagation bug
  // in the old check that silently skipped it too). This app's own UI
  // already gated the form correctly (isAssignedTechnician) — this was a
  // pure server-side enforcement gap.
  it("forbids a non-staff, non-assigned caller from recording any intervention (RISK-22)", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("RISK-22 unassigned intervention"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    // explicit self-attribution, but never assigned to this case
    let { error } = await tech.client.rpc("record_intervention", {
      p_case_id: caseId,
      p_action_taken: "fabricated, never assigned",
      p_technician_user_id: tech.userId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("FORBIDDEN");

    // omitted p_technician_user_id -- the NULL-propagation variant of the bug
    ({ error } = await tech.client.rpc("record_intervention", {
      p_case_id: caseId,
      p_action_taken: "fabricated, omitted technician id",
    }));
    expect(error).not.toBeNull();
    expect(error!.message).toContain("FORBIDDEN");
  });

  it("denies a direct client insert into case_assignments outside the emergency path", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("assignment bypass"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await exec.client.from("case_assignments").insert({
      case_id: created!.id,
      technician_user_id: tech.userId,
      assigned_by_user_id: exec.userId,
    });
    expect(error).not.toBeNull();
  });
});

describe("First-valid-actor ownership race (§5.2, §28)", () => {
  it("the second take_ownership call on the same case is rejected", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("ownership race"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const first = await exec.client.rpc("take_ownership", { p_case_id: caseId });
    expect(first.error).toBeNull();

    const second = await mgr.client.rpc("take_ownership", { p_case_id: caseId });
    expect(second.error).not.toBeNull();
    expect(second.error!.message).toContain("ALREADY_OWNED");
  });
});

describe("WAITING dependency overlay (§7)", () => {
  it("EXTERNAL wait requires mark_wait_resolved before resume_wait succeeds", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("waiting external"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const enter = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "EXTERNAL",
      p_reason_text: "autotest: waiting on vendor part",
      p_dependency_ref: "PO-AUTOTEST",
    });
    expect(enter.error).toBeNull();
    const waitId = enter.data.wait_id as string;

    const secondEnter = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "autotest: should fail, already waiting",
      p_internal_reason: "REPORTING_MANAGER_APPROVAL_PENDING",
    });
    expect(secondEnter.error).not.toBeNull();
    expect(secondEnter.error!.message).toContain("ALREADY_WAITING");

    const tooEarly = await exec.client.rpc("resume_wait", { p_wait_id: waitId });
    expect(tooEarly.error).not.toBeNull();
    expect(tooEarly.error!.message).toContain("NOT_RESUME_READY");

    const resolved = await exec.client.rpc("mark_wait_resolved", { p_wait_id: waitId });
    expect(resolved.error).toBeNull();

    const resumed = await exec.client.rpc("resume_wait", { p_wait_id: waitId });
    expect(resumed.error).toBeNull();

    const { data: waitRow } = await exec.client
      .from("waits")
      .select("resumed_at, resume_type")
      .eq("id", waitId)
      .single();
    expect(waitRow!.resumed_at).not.toBeNull();
    expect(waitRow!.resume_type).toBe("AUTO_EXTERNAL");
  });

  it("INTERNAL wait resumes directly without mark_wait_resolved", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("waiting internal"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const enter = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "INTERNAL",
      p_reason_text: "autotest: waiting for manager approval",
      p_internal_reason: "REPORTING_MANAGER_APPROVAL_PENDING",
    });
    expect(enter.error).toBeNull();

    const resumed = await exec.client.rpc("resume_wait", { p_wait_id: enter.data.wait_id });
    expect(resumed.error).toBeNull();

    const { data: waitRow } = await exec.client
      .from("waits")
      .select("resume_type")
      .eq("id", enter.data.wait_id)
      .single();
    expect(waitRow!.resume_type).toBe("MANUAL_INTERNAL");
  });

  it("denies a direct client insert into waits", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("waiting bypass"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await exec.client.from("waits").insert({
      case_id: created!.id,
      reason_type: "EXTERNAL",
      reason_text: "autotest: bypass attempt",
    });
    expect(error).not.toBeNull();
  });
});
