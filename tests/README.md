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

Loop 9 (`duplicate-and-false-complaint.test.ts`) adds: the `transition_case`
DUPLICATE lockout, the full `mark_duplicate_case` guard set (non-staff,
self-as-primary, missing reason) plus an explicit assertion that the
primary case's own status/link is untouched, reporter-only enforcement and
the OTHER/explanation rule on `close_false_complaint`, and a
transition-eligibility check confirming a case that's moved past
`REPORTED` can no longer use the reporter-driven false-complaint shortcut.

Loop 10 (`pm.test.ts`) adds: PM plan creation guards (RECURRING requires an
explicit frequency, ONE_TIME is Manager-only and self-approved, ONE_TIME
must not carry a frequency), the `approve_pm_plan` guard set (Manager-only,
no double-approval, can't approve an already-self-approved plan), and the
`run_pm_scan` permission lockout. **Not covered here:** the
instance-lifecycle RPCs (`link_pm_instance_to_case`, `complete_pm_instance`,
`reschedule_pm_instance`) — a PM instance only comes into existence via
`run_pm_scan`, which is cron-only and unreachable by any client, so there
is no way for a signed-in test user to get an instance to act on without a
test-only backdoor RPC (which would cut against the same principle that
kept this suite from building a cleanup RPC in Loop 6). Those three RPCs,
and the scan's generation/overdue-flagging/notification logic itself, were
verified live via `execute_sql` instead — see CHANGELOG.md Loop 10.

Loop 12 (`handover.test.ts`) adds: §22.1 manual-handover guards (non-staff
caller, missing reason, a non-staff receiver, handing to the person who
already owns it), the ownership-history assertions that matter most —
prior row closed with its reason, new row opened, `ended_at` of one
exactly equal to `started_at` of the next, and `created_at` unchanged so
case age does not reset — Manager override vs. a non-owner Executive, and
that the handover notification reaches the receiver and *not* the sender.
**Not covered here:** `handover_all_open_cases` beyond its reason guard.
It acts on every open case the caller owns, so running it for real inside
a suite that shares one live Supabase project would move cases other tests
are mid-way through using. Verified live instead — see CHANGELOG Loop 12.

Loop 13 (`production-boundary.test.ts`) adds: §13 safety/technical stop
guards (staff-only, one active stop per case, deliberate lift with a reason,
no double-lift), and the assertion that matters most — recording a §13.1
breach leaves the stop **active** (`lifted_at` still null) and does not move
the case or mark it released, since §13.1 says "do not silently clear the
stop." Also: refusing to file a breach against a case that genuinely
reached `MAINTENANCE_RELEASED` (walked through the real lifecycle to get
there), §13.2 recording that neither fabricates a restart nor introduces a
closure blocker, and direct-insert denial on both new tables.

## Not yet covered

The full `IMPLEMENTATION_PACK.md` §37 matrix is larger than this first pass
— see `APPROVAL_REPORT_LOOP_01_05.md` §J for the original build order, now
complete through Loop 10 (the last item in the Loops 6-10 batch).
Notifications, the emergency two-step, spare request/usage, duplicate
linkage, false-complaint closure, and PM plan/approval are all now covered
(Loops 7-10); escalation-timer *durations* and PM instance-lifecycle
actions are still only spot-checked live, not in this suite — see above.

Browser E2E lives in `../e2e/` — same network limitation applies to running
it from this sandbox.

Loop 14 (`kpi.test.ts`) adds: §25 production impact capture — the staff-only
guard, `BASIS_REQUIRED` and `NO_MEASURE_SUPPLIED`, negative-measure
rejection, and the assertion that carries the section's weight: an
unsupplied measure is stored as **NULL, not 0** (§25.2, "Missing data must
NOT silently become zero"). Also the §27 correction chain — a superseding
record leaves the original row intact and the `case_current_impact` view
reports only the newest non-superseded figure — plus cross-case
`INVALID_SUPERSEDE` and direct-insert denial.

The last test in that file is a permanent regression test for **RISK-15**:
`case_current_impact` originally shipped without `security_invoker`, so it
executed as its owner (`postgres`) and returned every case's impact data to
any authenticated user regardless of the RLS policy on the table beneath it.
The test asserts a non-staff user reads nothing through *either* the view or
the table. Standing rule for this repo: **every reporting view over an
RLS-protected maintenance table must set `security_invoker`.**

### A note on sign-ins (RISK-16)

`signInAs()` caches one signed-in client per role for the whole run. It used
to sign in fresh on every call, and at 78 call sites that meant ~78 requests
to Supabase GoTrue's `/token` endpoint in ~80 seconds from one CI IP — over
the project's auth rate limit. CI failed with 8 tests erroring "Request rate
limit reached", which looked like a product defect and was not. If you add
tests, keep using `signInAs()` rather than building your own client, or the
same ceiling comes back.

Loop 15 (`recurrence-capa.test.ts`) adds: the **PENDING-04 guard** — an
assertion that NO active recurrence rule is configured, so a future change
that quietly seeds a default threshold fails CI (§18: "Do not hard-code an
unapproved recurrence threshold"); the `run_recurrence_scan` permission
lockout; `create_recurrence_rule` Manager-only plus its value guards
(`APPROVAL_NOTE_REQUIRED`, `INVALID_THRESHOLD`, `INVALID_WINDOW`); §19 CAPA
ownership (an Executive and a non-staff technician are both refused as owner
— only a Manager qualifies); the raise guards; the full effectiveness path
including **both** outcomes (`VERIFIED_NOT_EFFECTIVE` is a real result, not a
missing answer) and Manager-only enforcement; and direct-insert plus
non-staff-read denial on all three tables.

**Not covered here:** the scan creating a flag. `run_recurrence_scan` is
cron-only and `permission denied` for every client, so a signed-in test user
cannot reach it without a test-only backdoor RPC — the same reasoning that
kept the PM instance-lifecycle RPCs out of `pm.test.ts`. The whole
scan → flag → confirm → root cause → CAPA → verify chain was verified live
instead; see CHANGELOG.md Loop 15 for the run and its results.

Loop 16 (`priority-and-ptw.test.ts`) adds: §5.4 `change_priority` — staff-only,
reason-required, and the Manager-override lock chain (an Executive changes
freely until a Manager sets it, after which the Executive is refused and only
a Manager can move it further, with the full `PRIORITY_CHANGED` audit trail
asserted); §14.2 the PTW seam (`set_ptw_required`/`link_ptw_proof` guards,
the gate blocking `DIAGNOSING -> IN_REPAIR` until a required proof is linked,
and that disabling PTW clears a stale proof rather than leaving it behind).

This file is also the **third** `transition_case` regression suite. It
re-asserts the QC gate at both `qc_required = true` and never-decided, and the
DUPLICATE lockout, specifically because this is the third time that function
has been rewritten (0011 dropped the QC gate entirely; 0012 restored it) —
so any future change that repeats that mistake fails here immediately rather
than needing another manual audit to catch it.
