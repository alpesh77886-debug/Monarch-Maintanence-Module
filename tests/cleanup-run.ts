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
  } catch (err) {
    console.warn(`[cleanup:${label}] skipped — ${(err as Error).message}`);
  }
}
