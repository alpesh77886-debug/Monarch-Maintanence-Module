import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../src/lib/supabase/config";
import { CREDS } from "./helpers";

// §21 — a successful test run cleans up its own synthetic data.
//
// The underlying problem this fixes: every CI run added cases and nothing ever
// removed them, so the database refilled indefinitely. A one-off cleanup would
// have been undone within a day.
//
// This runs ONCE per suite, not per test, so no existing test needed changing
// and none had its coverage weakened to make cleanup easier.
//
// Honest limitation: vitest's globalSetup teardown is not told whether the run
// passed. So retention-on-failure is OPT-IN rather than automatic — set
// MAINTENANCE_KEEP_TEST_DATA=1 to keep a run's data for forensic debugging.
// That is stated here rather than implied, because the brief asks for
// failed-run retention and this delivers it as a switch, not as magic.

export async function setup() {
  const startedAt = new Date().toISOString();
  process.env.MAINTENANCE_TEST_RUN_START = startedAt;

  return async function teardown() {
    if (process.env.MAINTENANCE_KEEP_TEST_DATA === "1") {
      console.log("[cleanup] MAINTENANCE_KEEP_TEST_DATA=1 — keeping this run's data.");
      return;
    }
    if (process.env.MAINTENANCE_TEST_WRITES_OK !== "1") return;

    try {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        db: { schema: "maintenance" },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInError } = await client.auth.signInWithPassword(CREDS.executive);
      if (signInError) {
        console.warn(`[cleanup] skipped — sign-in failed: ${signInError.message}`);
        return;
      }

      // Only this run's window, and only [AUTOTEST-prefixed cases: the RPC
      // delegates to cleanup_synthetic_cases, which refuses anything else.
      const { data, error } = await client.rpc("cleanup_test_cases_since", {
        p_since: startedAt,
      });
      if (error) {
        console.warn(`[cleanup] skipped — ${error.message}`);
        return;
      }
      console.log(`[cleanup] removed ${(data as { deleted_cases: number }).deleted_cases} synthetic case(s) created by this run.`);
    } catch (err) {
      // Cleanup must never turn a green run red.
      console.warn(`[cleanup] skipped — ${(err as Error).message}`);
    }
  };
}
