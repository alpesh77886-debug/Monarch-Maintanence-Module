import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 45 — RISK-30.
//
// evidence_insert's WITH CHECK was `uploaded_by = auth.uid()` and nothing else:
// no staff check and, crucially, no check that the caller had any relationship
// to the case. Every comparable table required one —
//
//   observations   is_staff() AND actor_user_id = auth.uid()
//   restorations   is_staff() AND recorded_by   = auth.uid()
//   case_assets    is_staff() AND linked_by     = auth.uid()
//   evidence       uploaded_by = auth.uid()          <- no case predicate
//
// Proven live before the fix: the non-staff technician identity attached
// evidence to MC-009600, a case invisible to them (0 rows visible), could not
// see the row afterwards (0 rows visible), and Maintenance staff saw it as
// ordinary attached evidence. Blind writes into someone else's audit trail.
//
// The fix is NOT a reversal of the deliberate §5.1 intake decision — it
// implements it. The intent was always "the reporter, on THEIR case"; the
// policy said "anyone, on ANY case". 0045 adds can_read_case(case_id), which is
// exactly the three parties the intent names.

async function makeCase(actor: Awaited<ReturnType<typeof signInAs>>, label: string) {
  const { data, error } = await actor.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: actor.userId,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe("evidence insert — scope", () => {
  it("refuses a non-staff user attaching evidence to someone else's case", async () => {
    const exec = await signInAs("executive");
    const caseId = await makeCase(exec, "evidence scope - staff owned");

    const tech = await signInAs("technician");
    const { error } = await tech.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: tech.userId,
      file_ref: "test://forged",
      description: "must be refused - no relationship to this case",
    });
    expect(error).not.toBeNull();
  });

  it("refuses attaching evidence under someone else's identity", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const caseId = await makeCase(exec, "evidence scope - impersonation");

    const { error } = await exec.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: tech.userId, // not the caller
      file_ref: "test://impersonated",
      description: "must be refused - uploaded_by is not the caller",
    });
    expect(error).not.toBeNull();
  });

  it("still lets a NON-STAFF reporter attach evidence to their own case", async () => {
    // This is the §5.1 intake path the original open policy existed for. If
    // this ever fails, the fix has overreached and broken the intent rather
    // than implementing it.
    const tech = await signInAs("technician");
    const caseId = await makeCase(tech, "evidence scope - reporter intake");

    const { error } = await tech.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: tech.userId,
      file_ref: "test://own-case",
      description: "reporter attaching to their own case at intake",
    });
    expect(error).toBeNull();
  });

  it("still lets staff attach evidence to a case they did not report", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const caseId = await makeCase(tech, "evidence scope - staff on others case");

    const { error } = await exec.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: exec.userId,
      file_ref: "test://staff-attach",
      description: "staff attaching to a case reported by someone else",
    });
    expect(error).toBeNull();
  });
});
