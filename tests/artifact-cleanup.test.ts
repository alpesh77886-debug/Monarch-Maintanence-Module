import { describe, it, expect } from "vitest";
import { signInAs } from "./helpers";

// Loop 42 — F-42-1 and F-42-2.
//
// The Loops 40/41 cleanup walked a CASE's dependents. Two categories of
// synthetic residue never hung off a case and so were never reached:
//
//   pm_plans          484 rows, 484 synthetic (100%)
//   recurrence_rules  183 rows, 183 synthetic (100%)
//
// and the audit sweep only covered target_table = 'maintenance.cases', leaving
// 4,175 of 5,659 audit rows (74%) pointing at ids that no longer existed.
//
// These tests pin the REFUSAL surface of the new function. The destructive
// behaviours — that a correctly-tagged sweep removes its own plan and rule and
// leaves another run's and a non-synthetic one alone, and that an audit row
// whose subject still exists survives while a dangling one is swept — were
// proven live with fixtures that were created, exercised, and removed in the
// same session (including deliberately "REAL PLANT" ones, so no fake real
// record was left behind). See LOOP_42_REPORT.md. They are not reproduced here,
// for the same reason as Loop 41: a test that leaves a second run's rows behind
// to show they survived leaks exactly what this feature exists to stop leaking.

const VALID_TAG = "loop42-nonexistent-tag";

describe("cleanup_test_artifacts_since — authority and bounds", () => {
  it("refuses a non-staff caller", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client.rpc("cleanup_test_artifacts_since", {
      p_since: new Date().toISOString(),
      p_run_tag: VALID_TAG,
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("refuses a null window", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_artifacts_since", {
      p_since: null,
      p_run_tag: VALID_TAG,
    });
    expect(error?.message).toMatch(/SINCE_REQUIRED/);
  });

  it("refuses a window wider than 24 hours", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_artifacts_since", {
      p_since: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      p_run_tag: VALID_TAG,
    });
    expect(error?.message).toMatch(/WINDOW_TOO_WIDE/);
  });
});

describe("cleanup_test_artifacts_since — run tag", () => {
  it("refuses a '%' wildcard tag", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_artifacts_since", {
      p_since: new Date().toISOString(),
      p_run_tag: "%",
    });
    expect(error?.message).toMatch(/INVALID_RUN_TAG/);
  });

  it("refuses an underscore wildcard tag", async () => {
    // '_' matches any single character in LIKE. Allowing it in the case-cleanup
    // charset once already let one run delete another run's rows, so the same
    // charset is enforced here.
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_artifacts_since", {
      p_since: new Date().toISOString(),
      p_run_tag: "loop42-RUN___",
    });
    expect(error?.message).toMatch(/INVALID_RUN_TAG/);
  });

  it("deletes nothing when scoped to a tag no artifact carries", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client.rpc("cleanup_test_artifacts_since", {
      p_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      p_run_tag: VALID_TAG,
    });
    expect(error).toBeNull();
    const r = data as {
      pm_plans_deleted: number;
      recurrence_rules_deleted: number;
      pm_instances_deleted: number;
    };
    // The isolation property in its safe direction: a foreign tag touches
    // nothing, even though plenty of synthetic plans and rules exist inside the
    // window it was given.
    expect(r.pm_plans_deleted).toBe(0);
    expect(r.recurrence_rules_deleted).toBe(0);
    expect(r.pm_instances_deleted).toBe(0);
  });
});
