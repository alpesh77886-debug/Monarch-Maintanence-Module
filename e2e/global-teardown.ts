import { cleanupRun } from "../tests/cleanup-run";

// Loop 41 — F-41-1. Playwright had NO teardown, so every CI run left its
// browser-E2E cases in the database forever. Vitest's teardown could not cover
// them: the two suites run in separate jobs and Vitest's had already finished
// before the e2e job created anything (evidence: the run that merged PR #41
// tore down at 18:11:58 UTC, then e2e created four cases at 18:13:07-18:13:46,
// all of which survived).
//
// Playwright calls globalSetup's returned function as the global teardown, so
// the run's start time is captured in the same closure that later cleans it up
// — no env round-trip, and no chance of the two disagreeing about the window.
export default async function globalSetup() {
  const startedAt = new Date().toISOString();
  return async () => {
    await cleanupRun("playwright", startedAt);
  };
}
