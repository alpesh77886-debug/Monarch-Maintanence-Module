import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 19: §5.1 / §24 — major/complex classification at intake.
//
// §5.1 lists "major/complex indication" as an intake minimum field, and §24
// separately marks "major/complex classification at complaint creation" as
// HUMAN REQUIRED. `cases.major_complex_flag` has existed since Loop 1 with no
// migration or RLS change needed here — `cases_insert`'s policy
// (reporter_user_id = auth.uid()) already permits setting any column on the
// row the reporter creates, the same way symptom/area/line/asset_known
// already work. This loop is UI-only: an intake checkbox and two display
// badges. No new RPC, no new policy, no new migration.

describe("major_complex_flag at case creation (§5.1, §24)", () => {
  it("is stored exactly as set — true when the reporter marks it", async () => {
    const tech = await signInAs("technician");
    const { data, error } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("major complex case"),
        reporter_user_id: tech.userId,
        major_complex_flag: true,
      })
      .select("major_complex_flag")
      .single();

    expect(error).toBeNull();
    expect(data!.major_complex_flag).toBe(true);
  });

  it("defaults to false rather than being silently inferred", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("ordinary case"),
        reporter_user_id: exec.userId,
      })
      .select("major_complex_flag")
      .single();

    expect(error).toBeNull();
    expect(data!.major_complex_flag).toBe(false);
  });
});
