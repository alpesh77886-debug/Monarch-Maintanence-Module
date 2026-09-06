import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 20: §5.1 — asset/machine linkage, and the knock-on it unblocks.
//
// §5.1: "Exact asset may be unknown at creation. Never silently map an
// unknown asset. A case may later be linked to one or more assets/machines."
// `maintenance.case_assets` has existed since Loop 1 with correct RLS since
// Loop 2 — staff-only, direct insert, no RPC needed (same shape as evidence,
// Loop 18) — but nothing had ever written to it. It is also why §18's
// recurrence engine ASSET_REF match tier (Loop 15) could never produce a
// match: no case ever had a case_assets row to match on. The scan-level
// assertion for that is covered live in CHANGELOG.md Loop 20 rather than
// here, for the same reason the scan itself isn't unit-tested elsewhere in
// this suite — run_recurrence_scan is cron-only and unreachable by any
// signed-in client.
//
// The one genuine new piece of logic is the `case_assets_mark_known` trigger
// keeping `cases.asset_known` honest once a real link is made — that's what
// this file actually exercises.

async function seedCase(label: string, actor: "executive" | "technician") {
  const session = await signInAs(actor);
  const { data } = await session.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: session.userId,
      asset_known: false,
    })
    .select("id")
    .single();
  return { session, caseId: data!.id as string };
}

describe("case_assets — staff-only linkage (§5.1)", () => {
  it("refuses a non-staff caller", async () => {
    const { session, caseId } = await seedCase("asset non-staff", "technician");
    const { error } = await session.client.from("case_assets").insert({
      case_id: caseId,
      asset_name: "Conveyor Motor 7",
      linked_by: session.userId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses linked_by that does not match the caller (impersonation)", async () => {
    const { caseId } = await seedCase("asset impersonation", "technician");
    const exec = await signInAs("executive");
    const { error } = await exec.client.from("case_assets").insert({
      case_id: caseId,
      asset_name: "spoofed",
      linked_by: "91a2fd36-5a35-4c36-8f5a-e0cd0e492f75",
    });
    expect(error).not.toBeNull();
  });

  it("lets staff link an asset, and it is stored as entered — never guessed", async () => {
    const { caseId } = await seedCase("asset link", "technician");
    const exec = await signInAs("executive");

    const { error } = await exec.client.from("case_assets").insert({
      case_id: caseId,
      asset_name: testSymptom("Conveyor Motor 7"),
      asset_ref: testSymptom("MOTOR-007"),
      linked_by: exec.userId,
    });
    expect(error).toBeNull();

    const { data } = await exec.client
      .from("case_assets")
      .select("asset_name, asset_ref, linked_by")
      .eq("case_id", caseId)
      .single();
    expect(data!.linked_by).toBe(exec.userId);
    expect(data!.asset_ref).toMatch(/MOTOR-007/);
  });
});

describe("linking an asset keeps cases.asset_known honest (trigger)", () => {
  it("flips asset_known from false to true once a real asset is linked", async () => {
    const { caseId } = await seedCase("asset_known trigger", "technician");
    const exec = await signInAs("executive");

    const { data: before } = await exec.client
      .from("cases")
      .select("asset_known")
      .eq("id", caseId)
      .single();
    expect(before!.asset_known).toBe(false);

    await exec.client.from("case_assets").insert({
      case_id: caseId,
      asset_name: "Pump 12",
      linked_by: exec.userId,
    });

    const { data: after } = await exec.client
      .from("cases")
      .select("asset_known")
      .eq("id", caseId)
      .single();
    expect(after!.asset_known).toBe(true);
  });
});
