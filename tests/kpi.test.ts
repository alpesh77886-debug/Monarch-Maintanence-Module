import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 14: §25 production impact capture.
//
// Two rules from §25.2 carry the weight here and both are asserted directly,
// because both are the kind of thing that looks fine until someone reads a
// report and believes a number that was never recorded:
//
//   "Missing data must NOT silently become zero" — an unrecorded measure must
//   come back as null, never 0.
//   Corrections are new rows (§27) — the original figure must survive.
//
// The view test is also a permanent regression test for RISK-15: the view
// shipped without security_invoker and read straight past the table's RLS.

async function seedCase(label: string) {
  const exec = await signInAs("executive");
  const { data: created, error } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return { exec, caseId: created!.id as string };
}

describe("record_production_impact guards (§25.2)", () => {
  it("is staff-only", async () => {
    const tech = await signInAs("technician");
    const { caseId } = await seedCase("impact staff only");

    const { error } = await tech.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: "line log",
      p_downtime_minutes: 30,
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("requires a basis and at least one measure", async () => {
    const { exec, caseId } = await seedCase("impact basis required");

    // §25.2: financial/operational impact must state an authoritative basis.
    let { error } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: "   ",
      p_downtime_minutes: 30,
    });
    expect(error?.message).toMatch(/BASIS_REQUIRED/);

    // A record with neither number asserts nothing.
    ({ error } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: "line log",
    }));
    expect(error?.message).toMatch(/NO_MEASURE_SUPPLIED/);
  });

  it("rejects negative measures", async () => {
    const { exec, caseId } = await seedCase("impact negative");
    const { error } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: "line log",
      p_downtime_minutes: -1,
    });
    expect(error).not.toBeNull();
  });
});

describe("§25.2 — missing data must NOT silently become zero", () => {
  it("stores an unsupplied measure as null, not 0", async () => {
    const { exec, caseId } = await seedCase("impact null not zero");

    // Downtime only. Output loss was not observed — that is a different fact
    // from "output loss was zero", and the row must say so.
    const { data, error } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: testSymptom("line stoppage log"),
      p_downtime_minutes: 45,
    });
    expect(error).toBeNull();

    const recordId = (data as { impact_record_id: string }).impact_record_id;
    const { data: row } = await exec.client
      .from("case_impact_records")
      .select("downtime_minutes, output_loss_kg")
      .eq("id", recordId)
      .single();

    expect(Number(row!.downtime_minutes)).toBe(45);
    expect(row!.output_loss_kg).toBeNull();
    expect(row!.output_loss_kg).not.toBe(0);
  });
});

describe("§27 — a correction is a new row, never an overwrite", () => {
  it("keeps the superseded figure and reports only the newest", async () => {
    const { exec, caseId } = await seedCase("impact correction");

    const { data: first } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: testSymptom("initial estimate"),
      p_downtime_minutes: 45,
    });
    const firstId = (first as { impact_record_id: string }).impact_record_id;

    const { data: second, error } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: testSymptom("shift production report"),
      p_downtime_minutes: 60,
      p_output_loss_kg: 120,
      p_supersedes_record_id: firstId,
    });
    expect(error).toBeNull();
    const secondId = (second as { impact_record_id: string }).impact_record_id;

    // Both rows still exist; the original is untouched.
    const { data: rows } = await exec.client
      .from("case_impact_records")
      .select("id, downtime_minutes")
      .eq("case_id", caseId);
    expect(rows?.length).toBe(2);
    const original = rows!.find((r) => r.id === firstId);
    expect(Number(original!.downtime_minutes)).toBe(45);

    // The reporting view resolves to the newest non-superseded record only.
    const { data: current } = await exec.client
      .from("case_current_impact")
      .select("impact_record_id, downtime_minutes, output_loss_kg")
      .eq("case_id", caseId);
    expect(current?.length).toBe(1);
    expect(current![0].impact_record_id).toBe(secondId);
    expect(Number(current![0].downtime_minutes)).toBe(60);
    expect(Number(current![0].output_loss_kg)).toBe(120);
  });

  it("refuses to supersede a record belonging to a different case", async () => {
    const { exec, caseId } = await seedCase("impact supersede case A");
    const { caseId: otherCaseId } = await seedCase("impact supersede case B");

    const { data: onOther } = await exec.client.rpc("record_production_impact", {
      p_case_id: otherCaseId,
      p_basis: "other case log",
      p_downtime_minutes: 10,
    });
    const otherRecordId = (onOther as { impact_record_id: string }).impact_record_id;

    const { error } = await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: "cross-case correction",
      p_downtime_minutes: 20,
      p_supersedes_record_id: otherRecordId,
    });
    expect(error?.message).toMatch(/INVALID_SUPERSEDE/);
  });
});

describe("Impact records are RPC-only and staff-only to read (RISK-15)", () => {
  it("denies a direct insert", async () => {
    const { exec, caseId } = await seedCase("impact direct insert");
    const { error } = await exec.client.from("case_impact_records").insert({
      case_id: caseId,
      downtime_minutes: 1,
      basis: "forged",
      recorded_by: exec.userId,
    });
    expect(error).not.toBeNull();
  });

  // Regression test for RISK-15. `case_current_impact` originally shipped
  // without security_invoker, so it executed as its owner (postgres) and
  // returned every case's impact data to any authenticated user regardless of
  // the RLS policy on the table underneath. Proven live at the time: the same
  // query returned rows through the view and none through the table.
  it("does not let a non-staff user read impact data through the view", async () => {
    const { exec, caseId } = await seedCase("impact view rls");
    await exec.client.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: testSymptom("rls probe"),
      p_downtime_minutes: 15,
    });

    // Staff can see it...
    const { data: staffView } = await exec.client
      .from("case_current_impact")
      .select("case_id")
      .eq("case_id", caseId);
    expect(staffView?.length).toBe(1);

    // ...the non-staff technician must not, through either the view or table.
    const tech = await signInAs("technician");
    const { data: techView } = await tech.client
      .from("case_current_impact")
      .select("case_id")
      .eq("case_id", caseId);
    expect(techView ?? []).toHaveLength(0);

    const { data: techTable } = await tech.client
      .from("case_impact_records")
      .select("id")
      .eq("case_id", caseId);
    expect(techTable ?? []).toHaveLength(0);
  });
});
