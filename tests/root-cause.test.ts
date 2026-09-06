import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 17: §9 item 6 / §9.1 — validated root cause.
//
// §9 lists 8 distinct concepts that diagnosis/intervention data must not be
// collapsed into one free-text field. Checking the live schema against that
// list found symptom, immediate action, intervention, result and failure
// mode all covered by `interventions`/`cases`, and permanent corrective
// action / effectiveness verification covered by `capa_links` (Loop 15).
// "Validated root cause" had no seam anywhere except
// `record_recurrence_root_cause`, gated behind a CONFIRMED recurrence flag —
// meaning an ordinary one-off case (the vast majority, especially while §18
// recurrence detection stays inert per PENDING-04) had nowhere to record one
// at all. This file covers the general RPC that closes that gap.
//
// §9.1: "The system/AI MUST NOT infer or declare authoritative root cause
// from symptom text alone... Only an authorized human process can validate
// and record root cause as authoritative." The two assertions that matter
// most here are therefore the BASIS_REQUIRED guard (no root cause without a
// stated validation) and that nothing anywhere calls this RPC automatically
// — it is human-only by construction (staff-gated, no cron, no scan).

async function seedCase(label: string) {
  const exec = await signInAs("executive");
  const { data } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  return { exec, caseId: data!.id as string };
}

describe("record_root_cause guards (§9.1)", () => {
  it("is staff-only", async () => {
    const tech = await signInAs("technician");
    const { caseId } = await seedCase("root cause staff only");
    const { error } = await tech.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: "bearing wear",
      p_basis: "inspection",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("requires both a root cause and a stated validation basis", async () => {
    const { exec, caseId } = await seedCase("root cause requires basis");

    let { error } = await exec.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: "   ",
      p_basis: "inspection",
    });
    expect(error?.message).toMatch(/ROOT_CAUSE_REQUIRED/);

    // §9.1's core rule: a root cause with no stated basis is exactly the
    // "declared from symptom text alone" pattern that is forbidden.
    ({ error } = await exec.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: "bearing wear",
      p_basis: "   ",
    }));
    expect(error?.message).toMatch(/BASIS_REQUIRED/);
  });
});

describe("§8/§27 — a correction is a new row, never an overwrite", () => {
  it("keeps the superseded finding and reports only the newest", async () => {
    const { exec, caseId } = await seedCase("root cause correction");

    const { data: first } = await exec.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: testSymptom("inadequate lubrication interval"),
      p_basis: testSymptom("component sectioned and inspected"),
    });
    const firstId = (first as { root_cause_record_id: string }).root_cause_record_id;

    const { data: second, error } = await exec.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: testSymptom("seal failure, not lubrication (revised)"),
      p_basis: testSymptom("vendor teardown report received"),
      p_supersedes_record_id: firstId,
    });
    expect(error).toBeNull();
    const secondId = (second as { root_cause_record_id: string }).root_cause_record_id;

    const { data: rows } = await exec.client
      .from("case_root_causes")
      .select("id, root_cause")
      .eq("case_id", caseId);
    expect(rows?.length).toBe(2);
    expect(rows!.find((r) => r.id === firstId)!.root_cause).toMatch(/lubrication interval/);

    const { data: current } = await exec.client
      .from("case_current_root_cause")
      .select("root_cause_record_id, root_cause")
      .eq("case_id", caseId);
    expect(current?.length).toBe(1);
    expect(current![0].root_cause_record_id).toBe(secondId);
    expect(current![0].root_cause).toMatch(/seal failure/);
  });

  it("refuses to supersede a record belonging to a different case", async () => {
    const { exec, caseId } = await seedCase("root cause supersede case A");
    const { caseId: otherCaseId } = await seedCase("root cause supersede case B");

    const { data: onOther } = await exec.client.rpc("record_root_cause", {
      p_case_id: otherCaseId,
      p_root_cause: "other case finding",
      p_basis: "other case basis",
    });
    const otherId = (onOther as { root_cause_record_id: string }).root_cause_record_id;

    const { error } = await exec.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: "cross-case correction",
      p_basis: "should not work",
      p_supersedes_record_id: otherId,
    });
    expect(error?.message).toMatch(/INVALID_SUPERSEDE/);
  });
});

describe("Root cause records are RPC-only and staff-only to read (RISK-15 class regression)", () => {
  it("denies a direct insert", async () => {
    const { exec, caseId } = await seedCase("root cause direct insert");
    const { error } = await exec.client.from("case_root_causes").insert({
      case_id: caseId,
      root_cause: "forged",
      basis: "forged",
      recorded_by: exec.userId,
    });
    expect(error).not.toBeNull();
  });

  // This mirrors the RISK-15 regression test in kpi.test.ts. The view here
  // was created WITH security_invoker = true from the start (verified live
  // via pg_class.reloptions before this suite was written — see
  // CHANGELOG.md Loop 17), so this asserts that holds, not that a bug was
  // fixed after the fact.
  it("does not let a non-staff user read root cause data through the view", async () => {
    const { exec, caseId } = await seedCase("root cause view rls");
    await exec.client.rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: testSymptom("rls probe"),
      p_basis: testSymptom("rls probe basis"),
    });

    const { data: staffView } = await exec.client
      .from("case_current_root_cause")
      .select("case_id")
      .eq("case_id", caseId);
    expect(staffView?.length).toBe(1);

    const tech = await signInAs("technician");
    const { data: techView } = await tech.client
      .from("case_current_root_cause")
      .select("case_id")
      .eq("case_id", caseId);
    expect(techView ?? []).toHaveLength(0);

    const { data: techTable } = await tech.client
      .from("case_root_causes")
      .select("id")
      .eq("case_id", caseId);
    expect(techTable ?? []).toHaveLength(0);
  });
});
