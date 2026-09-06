# Tests

Integration test suite (Vitest) covering the state machine, RBAC, WAITING
overlay, and QC gate — run with:

```bash
npm test
```

## What this is

These are **live integration tests**, not unit tests with mocks: each test
signs in as one of the seeded demo accounts (`exec1@monarch.test`,
`mgr1@monarch.test`, `tech1@monarch.test` — see `STATUS.md`) and calls the
real Supabase RPCs against the real `maintenance` schema, the same way the
app's UI does. This replaces the manual `execute_sql` spot-checks done in
Loops 1-5 (see `CHANGELOG.md`) with a suite that runs the same scenarios
automatically, every push (`.github/workflows/ci.yml`).

Covered: Scenario A (happy path) + reopen, invalid-transition rejection,
closure-reason requirement, idempotent replay, append-only enforcement,
Scenario B (QC required/rejected/cleared), the QC gate bypass check (both
`qc_required = true` and never-decided — the latter is a regression test for
RISK-11), Scenario C (temporary restoration + follow-up — a regression test
for RISK-12), technical-restoration verification failure, technician
assignment + auto ASSESSED→ASSIGNED, intervention recording +
impersonation-forbidden, the case_assignments direct-insert bypass denial,
first-valid-actor ownership race, and both WAITING paths (EXTERNAL two-step
resolve→resume, INTERNAL direct resume) + the waits direct-insert bypass
denial.

Loop 7 (`emergency-and-notifications.test.ts`) adds: the §6 emergency
claim/confirm RPC guards (reason required, reporter-or-staff-only claim,
staff-only confirm, claim-before-confirm ordering, no re-claim/re-confirm
after confirmation), confirming `run_escalation_scan()` is not callable by
any authenticated client (`permission denied`, not a business-logic
error), notification RLS (only the recipient can read their own row,
direct insert/update are both blocked), `mark_notification_read`
rejecting a non-recipient, and `mark_wait_resolved`'s immediate
notification to the case owner. **Not covered here:** the 24h/1h timer
*durations* themselves — a suite that runs in seconds cannot wait real
hours for `pg_cron` to fire. That gap was closed instead with one-off
`execute_sql` checks (backdating `resume_ready_at`/`emergency_confirmed_at`
and calling the scan function directly as `postgres`) — see CHANGELOG.md
Loop 7 for the exact runs and results. If this needs to become an
automated regression test later, the honest way is a test-only RPC that
lets a signed-in staff user backdate those columns on their own
`[AUTOTEST]`-tagged case (still gated by ownership), not a shortcut around
RLS.

Loop 8 (`spares.test.ts`) adds: the §3.3 ₹12,000 threshold computation
(exactly ₹12,000 vs ₹12,000.01), spare-name validation, both tables'
direct-insert RLS denials, the full approval gate (non-staff and
staff-Executive both rejected, proof required, idempotent approve, a
<=₹12,000 request correctly refused approval), the `APPROVAL_REQUIRED`
usage-recording gate, and usage-recording actor eligibility (staff or the
actively assigned technician). The Manager-approval rejection test is
also a permanent regression test for RISK-13 (`is_manager()` NULL
propagation) — it specifically exercises the non-staff-caller path that
the bug affected.

## Known tradeoffs (deliberate, not oversights)

- **No separate test/staging Supabase project.** Tests run against the same
  project the live app uses. Every test tags its case's symptom with
  `[AUTOTEST]` (see `tests/helpers.ts`) so created rows are trivially
  identifiable and ignorable in the UI/dashboards.
- **No automated cleanup.** `maintenance.cases` and every audit-adjacent
  table (`case_events`, `audit_log`, etc.) have no `DELETE` policy for any
  client role, by design (`IMPLEMENTATION_PACK.md` §0 rule 6, §27 — history
  is append-only). Building a delete/cleanup RPC just for test convenience
  would cut against that same principle, so this suite doesn't attempt one.
  Test runs will slowly accumulate `[AUTOTEST]`-tagged rows; an operator can
  purge them manually via the Supabase SQL editor if desired. If this
  becomes a real problem, the correct fix is a dedicated test Supabase
  project, not a cleanup backdoor in production RPCs.
- **This sandbox's own network cannot run these tests.** Its egress proxy
  blocks `*.supabase.co` (see `RISK_REGISTER.md` RISK-05), so `npm test`
  here fails every test with a network error, not a real assertion failure —
  confirmed by running it and seeing all 17 tests fail identically at the
  `signInWithPassword` call. The suite is verified structurally sound
  (type-checks, loads, executes in order) from here; real pass/fail signal
  comes from GitHub Actions CI, which has normal network access.

## Not yet covered

The full `IMPLEMENTATION_PACK.md` §37 matrix is larger than this first pass
— PM overdue/regeneration and duplicate/false-complaint closure still need
tests once those features exist (see `APPROVAL_REPORT_LOOP_01_05.md` §J for
the build order). Notifications, the emergency two-step, and spare
request/usage are now covered (Loops 7-8); the escalation-timer *durations*
are still only spot-checked live, not in this suite — see above.

Browser E2E lives in `../e2e/` — same network limitation applies to running
it from this sandbox.
