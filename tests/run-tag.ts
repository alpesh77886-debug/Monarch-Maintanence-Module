// Loop 41 — a per-run identity for synthetic test data.
//
// Why this exists: `cleanup_test_cases_since` used to select on nothing but a
// time window plus the '[AUTOTEST' prefix. CI scopes concurrency to
// `ci-${{ github.ref }}`, so a pull-request run and a main-branch run sit in
// DIFFERENT groups and can overlap — and when they did, whichever finished
// first deleted the other run's in-flight cases out from under it. Tagging each
// case with the run that made it lets a run delete only its own.
//
// The tag must be identical in the process that CREATES cases and the process
// that CLEANS them up, so it is read from the environment rather than generated
// per-process. CI sets MAINTENANCE_TEST_RUN_ID per job (see ci.yml); the job
// suffix is what keeps the unit job and the e2e job of the SAME workflow run
// from cleaning each other's rows.
//
// When it is unset (a developer running locally) the tag is null and everything
// behaves exactly as before: window-scoped cleanup, plain '[AUTOTEST]' prefix.
// That is deliberate and not a silent downgrade — locally there is no second
// concurrent run to race with, and inventing a tag per process would break the
// setup/worker agreement this depends on.
//
// Charset note: the database validates the tag against ^[A-Za-z0-9.-]{4,64}$
// and deliberately EXCLUDES '_'. An underscore is a single-character wildcard
// in SQL LIKE, and an earlier version of this feature matched the tag with
// LIKE — a tag of 'RUN___' matched 'RUNBBB' and deleted another run's case,
// which is the precise bug the tag was introduced to prevent. The server now
// matches with strpos() instead, but the charset stays narrow anyway. Sanitise
// here so a run id containing '_' (or anything else) is normalised rather than
// rejected at teardown time, when it is too late to be useful.
export function runTag(): string | null {
  const raw = process.env.MAINTENANCE_TEST_RUN_ID;
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z0-9.-]/g, "-").slice(0, 64);
  return cleaned.length >= 4 ? cleaned : null;
}

// The marker embedded in a synthetic case's symptom. Kept in one place so the
// creating side and the server-side matcher can never drift apart.
export function runMarker(): string {
  const tag = runTag();
  return tag ? `[run=${tag}]` : "";
}
