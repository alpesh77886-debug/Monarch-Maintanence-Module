import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 39 / RISK-27 — `take_ownership` existed and was tested (including §28's
// first-valid-actor race, covered in assignment-and-waiting.test.ts) but no
// button in the app ever called it.
//
// Acknowledging a case assigns ownership, so a REPORTED case was covered. A
// case that LOSES its owner later was not — and that state is designed, not
// accidental: §22.1's shift-end handover sets the owner to NULL when nobody is
// available, and the dashboard lists exactly those cases under "Unassigned —
// waiting for a Maintenance owner". It listed them with no way to claim one.
//
// These tests cover the RPC behaviour the new button depends on. The race
// condition is deliberately NOT re-tested here — it already has a home.

describe("RISK-27 — take_ownership is usable for an unowned case", () => {
  it("lets staff claim a case that has no owner, and records them as owner", async () => {
    const exec = await signInAs("executive");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("RISK-27 claim unowned"),
        reporter_user_id: exec.userId,
      })
      .select("id, current_owner_user_id")
      .single();
    const caseId = created!.id as string;
    // Precondition: a freshly reported case genuinely has no owner.
    expect(created!.current_owner_user_id).toBeNull();

    const { error } = await exec.client.rpc("take_ownership", { p_case_id: caseId });
    expect(error).toBeNull();

    const { data: after } = await exec.client
      .from("cases")
      .select("current_owner_user_id")
      .eq("id", caseId)
      .single();
    expect(after!.current_owner_user_id).toBe(exec.userId);
  });

  it("refuses a non-staff identity", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("RISK-27 non-staff claim"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await tech.client.rpc("take_ownership", { p_case_id: created!.id });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("refuses a case that already has an owner, so a claim cannot steal one", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("RISK-27 no stealing"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    // acknowledge_case assigns ownership to the acknowledger.
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });

    const { error } = await mgr.client.rpc("take_ownership", { p_case_id: caseId });
    expect(error?.message).toMatch(/ALREADY_OWNED/);

    const { data: after } = await exec.client
      .from("cases")
      .select("current_owner_user_id")
      .eq("id", caseId)
      .single();
    expect(after!.current_owner_user_id).toBe(exec.userId);
  });
});
