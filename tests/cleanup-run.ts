import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../src/lib/supabase/config";
import { CREDS } from "./helpers";
import { runTag } from "./run-tag";

// The teardown body, shared by the Vitest suite and the Playwright suite.
//
// It was Vitest-only until Loop 41. Playwright had no teardown at all, so every
// CI run left its browser-E2E cases in the database permanently — four per run,
// and nothing ever removed them. Extracting this rather than copying it keeps
// the two suites from drifting into two different definitions of "safe".
//
// Cleanup must NEVER turn a green run red, so every failure path here warns and
// returns instead of throwing.
export async function cleanupRun(label: string, startedAt: string): Promise<void> {
  if (process.env.MAINTENANCE_KEEP_TEST_DATA === "1") {
    console.log(`[cleanup:${label}] MAINTENANCE_KEEP_TEST_DATA=1 — keeping this run's data.`);
    return;
  }
  if (process.env.MAINTENANCE_TEST_WRITES_OK !== "1") return;

  const tag = runTag();

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "maintenance" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword(CREDS.executive);
    if (signInError) {
      console.warn(`[cleanup:${label}] skipped — sign-in failed: ${signInError.message}`);
      return;
    }

    // Two independent narrowings, and the server re-checks both:
    //   p_since   — only cases created inside this run's window
    //   p_run_tag — only cases carrying THIS run's [run=<tag>] marker, so a
    //               concurrently-running workflow's in-flight rows are not
    //               touched. Null locally, where no second run exists.
    const { data, error } = await client.rpc("cleanup_test_cases_since", {
      p_since: startedAt,
      p_run_tag: tag,
    });
    if (error) {
      console.warn(`[cleanup:${label}] skipped — ${error.message}`);
      return;
    }
    const deleted = (data as { deleted_cases: number }).deleted_cases;
    console.log(
      `[cleanup:${label}] removed ${deleted} synthetic case(s)` +
        (tag ? ` tagged ${tag}.` : " created by this run (untagged, window-scoped).")
    );

    // Loop 42 (F-42-1/F-42-2). The case cleanup above walks a case's dependents,
    // so it never reached pm_plans or recurrence_rules — neither hangs off a
    // case — and it removed audit rows only for target_table
    // 'maintenance.cases', leaving every child row's audit entry dangling.
    // Live counts before this ran: 484/484 pm_plans and 183/183
    // recurrence_rules synthetic, and 4,175 of 5,659 audit rows (74%) pointing
    // at ids that no longer existed.
    //
    // This runs AFTER the case cleanup on purpose: a run's audit rows only
    // become sweepable once the case cleanup has removed their subjects.
    const { data: artifacts, error: artifactError } = await client.rpc(
      "cleanup_test_artifacts_since",
      { p_since: startedAt, p_run_tag: tag }
    );
    if (artifactError) {
      console.warn(`[cleanup:${label}] artifact sweep skipped — ${artifactError.message}`);
      return;
    }
    const a = artifacts as {
      pm_plans_deleted: number;
      recurrence_rules_deleted: number;
      dangling_audit_rows_deleted: number;
    };
    console.log(
      `[cleanup:${label}] removed ${a.pm_plans_deleted} PM plan(s), ` +
        `${a.recurrence_rules_deleted} recurrence rule(s), ` +
        `${a.dangling_audit_rows_deleted} dangling audit row(s).`
    );
  } catch (err) {
    console.warn(`[cleanup:${label}] skipped — ${(err as Error).message}`);
  }
}
