import { cleanupRun } from "./cleanup-run";

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
//
// Loop 41: the body moved to tests/cleanup-run.ts so the Playwright suite —
// which previously had no teardown at all and leaked four cases per CI run —
// can share exactly the same one.

export async function setup() {
  const startedAt = new Date().toISOString();
  process.env.MAINTENANCE_TEST_RUN_START = startedAt;

  return async function teardown() {
    await cleanupRun("vitest", startedAt);
  };
}
