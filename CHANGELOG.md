# Changelog

All notable engineering loops for MONARCH Maintenance are logged here, oldest first
within each loop. Entries are never rewritten to look cleaner after the fact.

## Loop 1 — 2026-09-06

**Summary:** Repository forensics + governance baseline + start of core data model.

**Requirements affected:** §36.1 (pre-coding forensics), §19.3–19.5 (repo governance),
§26 (data model), foundation for §29 (RBAC).

**Findings:**
- This repo and the sibling `Monarch-Production-Module` repo were both placeholder-only
  (`index.html` + README) at the start of implementation — no existing Maintenance or
  Production application code to reuse or regress against.
- Two Supabase projects exist on the account; neither matches Maintenance's domain
  (one backs the unrelated `accountoperatingsystem` generic task app, the other backs
  `Raccoon`/Store Register and is currently paused). Decision: Maintenance gets its own
  dedicated Supabase project, consistent with the standalone-module requirement (§2.1).
- Vercel team `Monarch` and Sentry org `monarch-bo` already exist and already host the
  Production and AOS modules — Maintenance will be added alongside them, not create new
  team/org infrastructure.

**Material changes:**
- Added `IMPLEMENTATION_PACK.md` (full, unabridged v0.2 pack — verbatim contract).
- Added `CLAUDE.md` operating rules, `README.md`, `STATUS.md`, `APPROVAL_GATE.md`,
  `RISK_REGISTER.md`, this `CHANGELOG.md`, and `/docs/*` seams.
- (in progress) `supabase/migrations/` — core `maintenance` schema.
- (in progress) Next.js application skeleton.

**Tests:** none yet — no business logic committed yet in this loop.

**Deployment/reference:** none yet.

**Known limitations:** No UI, no business operations, no RLS policies enforced yet as
of the start of this entry. Updated as the loop completes — see STATUS.md for the live
picture, this entry is append-only history.

### Loop 1 completion update

Rather than rewrite the entry above, recording final state here (same append-only
principle as the rest of the system):

- Created dedicated Supabase project `monarch-maintenance-module`
  (`maavrlqkdrisjwzhjdgg`), `maintenance` Postgres schema, 21 tables per §26,
  RLS on all of them, exposed the schema over PostgREST.
- Locked lifecycle graph (§4) implemented as `status_transitions` + the
  `transition_case` / `take_ownership` / `acknowledge_case` / `reopen_case`
  SECURITY DEFINER RPCs. `cases`/`case_events`/`audit_log`/`idempotency_keys`
  have no client-facing UPDATE/INSERT policy for the sensitive paths, so the
  RPCs are the only way to mutate lifecycle state (§36.3 enforced in the
  database, not just the UI).
- Verified directly against Postgres (simulated JWT via `execute_sql`):
  happy-path Scenario A end to end, an invalid-transition rejection, reopen
  (Scenario F), idempotent replay (same idempotency key twice → one event),
  append-only enforcement (direct `case_events` insert denied by RLS), and
  the first-valid-actor ownership race (§28 — second `take_ownership` call
  correctly raised `ALREADY_OWNED`). Test seed data removed afterward; two
  demo staff logins were left in place (see STATUS.md) for the Boss to try
  the deployed app.
- Next.js (App Router, TS, Tailwind) app: login, case list, report-case
  form, case detail with acknowledge action and the Observation + Action
  Continuity Journal (§8), all mobile-first.
- Linked Vercel project `monarch-maintenance-module` (team `Monarch`) to
  this GitHub repo; pushing to `claude/new-session-edkk1u` auto-deploys.
  Confirmed the deployed `/login` page returns 200 with the expected markup.
- Created Sentry project `monarch-maintenance-module` in org `monarch-bo`
  and wired `@sentry/nextjs` client/server/edge instrumentation.

**Deviations from a "by-the-book" setup, with reasons:**
- Supabase/Sentry connection values (anon key, DSN) are committed as source
  fallbacks in `src/lib/supabase/config.ts` / `src/instrumentation*.ts`
  instead of Vercel-dashboard-only env vars, because the Vercel MCP tooling
  available in this session has no operation to set project environment
  variables (only `create_git_project` / `deploy_to_vercel`, neither of
  which takes env vars). Both values are non-secret, submit/read-only public
  identifiers by their respective platforms' own security model (protected
  by RLS and by DSN's write-only scope, not by secrecy) — the same category
  as a Firebase `apiKey`. No actual secret (service-role key, Sentry auth
  token) was committed. Recommend moving these to real Vercel env vars via
  the dashboard when convenient, for cleaner rotation — functionally nothing
  is blocked by leaving them as source fallbacks.
- This sandbox's own egress network policy blocks direct HTTPS to
  `*.supabase.co` and `*.vercel.app`, so local `next dev` could not be
  browser-tested here, and `e2e/smoke.mjs` could not be run in this
  environment at all. Backend logic was instead verified directly against
  Postgres (see above); the live Vercel deployment was verified via the
  Vercel MCP's own fetch tool (which runs outside this sandbox's network),
  confirming a real 200 response. The browser E2E script is written and
  ready to run against the live URL — see RISK_REGISTER.md.
- No SENTRY_AUTH_TOKEN available, so source-map upload is skipped (build
  warns, does not fail); stack traces in Sentry will show minified code
  until a token is added.
- No automated test framework (Jest/Vitest/Playwright test runner) wired
  into `npm test` yet — §37's full test matrix is still scope debt, not
  satisfied by the manual verification above.

## Loop 2 — 2026-09-06

**Summary:** Verification loop — found and fixed two real defects, confirmed
Sentry captures a real error end-to-end.

**Requirements affected:** §19.7 (Sentry verification), §29 (auth boundary),
§39 (forensic verification — "green build ≠ correct product").

**Defects found and fixed:**
1. `src/proxy.ts` (the auth middleware) was HTML-redirecting unauthenticated
   requests to `/api/*` paths to `/login` instead of letting the route
   handler run. Harmless while no API route existed; would have silently
   broken every future API route. Fixed by excluding `/api/*` from the
   page-auth redirect.
2. The Vercel project had SSO (Vercel Authentication) protection enabled on
   "all deployments except custom domains" — meaning even the production
   `.vercel.app` alias required a Vercel team login to open. A real plant
   user (technician/Executive) has no Vercel account, so this would have
   made the app completely unreachable for its actual users. Disabled SSO
   protection at the project level; the app's own Supabase-auth login page
   is the real access gate (§29), which is the intended boundary anyway.

**Verification performed:**
- Added a diagnostic-only `/api/sentry-test?key=loop2-verify` route,
  deployed it, hit it via the Vercel MCP's fetch tool, and confirmed the
  resulting error (`MONARCH-MAINTENANCE-MODULE-1`) actually appeared in
  Sentry (1 event, correct message) — then marked it resolved. Sentry
  observability is now verified live, not just "SDK installed."
- Re-confirmed `/cases` correctly redirects an unauthenticated request to
  this app's own `/login` (not a Vercel SSO wall) after the protection fix.

**Tests:** manual, against the live deployment (see above) — this sandbox
still cannot run `e2e/smoke.mjs` itself (RISK-05 unchanged).

**Deployment/reference:** commit 73ed9ae, deployment dpl_4v2wJ8D2 (READY).

**Known limitations:** no automated regression test locks in either fix —
recommend a Playwright assertion for the `/api/*` redirect behavior and a
project-config check for deployment protection in a future loop.

## Loop 3 — 2026-09-06

**Summary:** Technician assignment + intervention recording (§5.5, §9).

**Material changes:**
- `assign_technician` / `record_intervention` SECURITY DEFINER RPCs, both
  audited (case_events + audit_log). `find_user_by_email` helper for the
  assignment UI (staff-only, does not leak existence to non-staff).
- Direct client insert into `case_assignments` (staff path) and
  `interventions` is now denied by RLS — only the audited RPCs write them.
  The emergency direct-start insert path on `case_assignments` is
  unchanged (§5.5 — technician can start directly before formal assignment).
- First technician assignment on an ASSESSED case auto-transitions it to
  ASSIGNED (reuses the existing ASSESSED→ASSIGNED graph edge); reassigning
  later does not move the case backward.
- UI: assign-technician + record-intervention forms and lists on the case
  detail page.

**Tests (execute_sql, simulated JWT):** staff assigns by email and case
auto-transitions to ASSIGNED; technician records their own intervention;
Manager records on a technician's behalf; a technician attempting to record
under a *different* technician's identity is correctly FORBIDDEN; the old
direct-insert bypass on both tables is correctly denied by RLS.

**Deployment/reference:** commit e8def16.

## Loop 4 — 2026-09-06

**Summary:** WAITING dependency overlay (§7).

**Material changes:**
- `enter_waiting` / `mark_wait_resolved` / `resume_wait` SECURITY DEFINER
  RPCs. `reason_type` is always an explicit INTERNAL/EXTERNAL argument,
  never inferred from `reason_text` (§7.1). None of these RPCs touch
  `cases.status` — WAITING stays an overlay, not a competing lifecycle,
  exactly as §7 frames it.
- EXTERNAL waits use the two-step resolve→resume path (§7.2): resolving
  sets `resume_ready_at` (recorded, not a silent auto-continue); resuming
  before that is rejected. INTERNAL waits resume directly (manual, by
  Executive or Manager).
- Direct client insert into `waits` is now denied by RLS — only the RPCs
  write it.
- UI: enter-WAITING form + an active-wait card (resolve/resume actions) on
  the case detail page.

**Tests (execute_sql):** double-waiting on the same case rejected
(`ALREADY_WAITING`); resuming an EXTERNAL wait before it's marked resolved
rejected (`NOT_RESUME_READY`); full EXTERNAL resolve→resume flow; full
INTERNAL direct-resume flow (by a Manager).

**Deployment/reference:** commit ac312c0.

## Loop 5 — 2026-09-06

**Summary:** Restoration/verification, QC clearance gate, close/reopen UI
(§10, §11, §12, §13) — the last backend gap in the core lifecycle from §32
items 8–11.

**Material changes:**
- `record_restoration` (TEMPORARY vs TECHNICAL), `verify_restoration`
  (pass/fail, failure requires a reason and returns the case to DIAGNOSING
  or IN_REPAIR — reusing the `TECHNICALLY_RESTORED → {DIAGNOSING,IN_REPAIR}`
  edges already in the Loop 1 graph, so no new edges were needed for the
  failure path, §4.2/§11).
- `set_qc_required` (records actor/timestamp/reason — §12), `send_to_qc`
  (only from TECHNICALLY_RESTORED), `qc_decision` (CLEARED or REJECTED,
  REJECTED requires a reason).
- `transition_case` gained one guard: the *direct*
  `TECHNICALLY_RESTORED → MAINTENANCE_RELEASED` edge is blocked when
  `qc_required` is true. The `CLEARANCE_PENDING → MAINTENANCE_RELEASED`
  edge (only reachable via `qc_decision(CLEARED)`, since `CLEARANCE_PENDING`
  itself is only reachable via `send_to_qc`) is deliberately left
  unguarded — that's the legitimate cleared path, not a bypass. This is
  §13's boundary enforced in the database, not by hiding a UI button.
  (Caught and fixed a self-introduced bug here before applying the
  migration: an earlier draft of the guard would have also blocked the
  legitimate cleared path — see git history on this file.)
- UI: record-restoration form, verify-restoration pass/fail card, a QC
  panel (set qc_required, send to QC, clear/reject with mandatory rejection
  reason), and close/reopen actions.

**Tests (execute_sql):** full Scenario B end to end
(`TECHNICALLY_RESTORED → CLEARANCE_PENDING → QC_REJECTED → IN_REPAIR →
TECHNICALLY_RESTORED → CLEARANCE_PENDING → MAINTENANCE_RELEASED`); the
QC-gate bypass (`transition_case` straight to `MAINTENANCE_RELEASED` while
`qc_required`) correctly rejected; a verification-failure path returning
`IN_REPAIR` with the failure reason recorded and the restoration marked
`FAILED` (never a false `TECHNICALLY_RESTORED` success).

**Deployment/reference:** commit dcd8c0d.

**Gate:** this closes the first 5-loop batch. Per `IMPLEMENTATION_PACK.md`
§19.11, autonomous development now STOPS — see
`APPROVAL_REPORT_LOOP_01_05.md` and `APPROVAL_GATE.md`.

## Post-gate bugfix round — 2026-09-06

Boss reported "Database error querying schema" at login on the live app.
Investigated and fixed three real defects found during a full audit of
every button/action against its backend RPC and the locked transition
graph (per Boss's request: "har button check karo... aarpaar jao").

- **RISK-10 (HIGH, login completely broken):** the 3 test accounts were
  seeded via raw SQL in earlier loops rather than a real signup/Admin API
  call, leaving several GoTrue-internal token columns NULL instead of `''`.
  Confirmed via Supabase `auth_logs` (`error finding user: sql: Scan error
  on column index 8, name "email_change": converting NULL to string is
  unsupported`) — exactly the bug RISK-05 warned this environment couldn't
  catch (no browser-driven login test was possible from this sandbox).
  Fixed by backfilling `''` into the affected columns; verified via a
  temporary server-side diagnostic route (`/api/login-test`, removed after
  use) that called the real `signInWithPassword` flow — all 3 accounts
  confirmed returning a session.
- **RISK-11 (MEDIUM):** the Loop 5 QC guard used
  `coalesce(v_qc_required, false)`, so an undecided (`NULL`) `qc_required`
  could bypass the QC gate via a direct `transition_case` call, even though
  the UI only exposes that path for an explicit `false`. Tightened to
  `v_qc_required is distinct from false`; re-verified the full guard
  behavior (blocked when NULL/true, allowed when explicitly false).
- **RISK-12 (HIGH, dead-end button):** the case detail page showed "Record
  restoration" while `TEMPORARILY_RESTORED`, but the locked graph has no
  `TEMPORARILY_RESTORED → TECHNICALLY_RESTORED` edge — every click failed.
  Replaced with a `FollowUpButton` (resume to `IN_REPAIR`/`DIAGNOSING`,
  matching Scenario C's "follow-up" step); restoration form now only shows
  in `IN_REPAIR`. Re-verified Scenario C end-to-end.

All fixes verified against the live Supabase project and deployed;
`/api/sentry-test` is the only diagnostic route left in place (see Loop 2).

## PR #1 merged to main — 2026-09-06

Boss approved merging `claude/new-session-edkk1u` into `main` (previously
placeholder-only). Merged via GitHub PR #1 (fast-forward-safe, zero
conflicts — the diff was purely additive). Vercel's configured production
branch is `main`, so this also moved the real "Production" deployment
target off the stale placeholder commit onto the actual app for the first
time — `https://monarch-maintenance-module.vercel.app` now serves the
merged code. The working branch was then reset to the new `main` per the
project's own branch-restart convention (same branch name, fresh history).

## Loop 6 — 2026-09-06

**Summary:** Automated integration test suite (top item from
`APPROVAL_REPORT_LOOP_01_05.md` §J / RISK-07).

**Material changes:**
- Added Vitest (`vitest.config.ts`, `tests/helpers.ts`, 3 test files, 17
  tests total): Scenario A + reopen, invalid-transition rejection,
  closure-reason requirement, idempotent replay, append-only enforcement,
  Scenario B (QC required/rejected/cleared), QC-gate bypass regression
  tests for both `qc_required=true` and never-decided (RISK-11), Scenario C
  + a regression test that a TECHNICAL restoration is correctly rejected
  directly from TEMPORARILY_RESTORED (RISK-12), verification-failure path,
  technician assignment + auto ASSESSED→ASSIGNED, intervention recording +
  impersonation-forbidden, case_assignments/waits direct-insert bypass
  denials, and the first-valid-actor ownership race.
- Bumped `@types/node` to `^22` (vitest 5's peer requirement).
- Wired `npm test` into `.github/workflows/ci.yml` (runs after lint+build).

**Tests:** the suite itself — see above. Confirmed structurally sound in
this sandbox (type-checks clean, all 17 tests load and execute in the
right order, failing uniformly at the `signInWithPassword` network call
because this sandbox's egress proxy blocks `*.supabase.co` — not a code
defect). Real green/red signal comes from the GitHub Actions run on the PR
for this loop.

**Known limitations:** no separate test/staging Supabase project (tests run
against the same live project, tagged `[AUTOTEST]`, no automated cleanup —
see tests/README.md for why). PM, spares, notifications, and
duplicate/false-complaint scenarios have no tests yet because those
features don't exist yet either.

## Loop 7 — 2026-09-06

**Summary:** Emergency two-step confirmation (§6), notifications (§23), and
timer-based escalation (§7.2 WAITING 24h, §7.3 confirmed-emergency 1h).

**Material changes:**
- Migration `0008_maintenance_emergency_notifications.sql`:
  - Added `cases.emergency_claimed_by/_at/_claim_reason` and
    `emergency_escalated_at` — §6 requires the claim actor/timestamp/reason
    to be recorded, and Loop 1 only ever added the two boolean flags with no
    RPC to set them. `emergency_escalated_at` makes the 1h escalation fire
    exactly once.
  - New `maintenance.notifications` table (RPC/definer-write-only, RLS
    restricts select to `recipient_user_id = auth.uid()`, same pattern as
    every other mutation-sensitive table since Loop 1) +
    `mark_notification_read`.
  - New `claim_emergency`/`confirm_emergency` RPCs implementing the §6
    two-step workflow: reporter (or staff) claims with a mandatory
    reason, then Executive/Manager confirms — only confirmation starts the
    1h clock (§7.3). Ordering enforced (`NOT_CLAIMED`,
    `ALREADY_CONFIRMED`); a generic toggle cannot skip a step.
  - `acknowledge_case` and `mark_wait_resolved` now insert the two purely
    event-driven notifications §23 requires (acknowledgement to reporter,
    resume-ready to the case owner).
  - New `maintenance.run_escalation_scan()` — installs `pg_cron`/`pg_net`
    (confirmed available-but-uninstalled beforehand) and schedules the scan
    every 5 minutes. Handles: 24h resume-ready-with-no-action escalation to
    Executive+Manager (fires once per wait), the §7.2 repeated-every-24h
    Manager reminder until resumed, and the §7.3 1h confirmed-emergency
    escalation (fires once — the pack locks no repeat cadence for this one,
    unlike WAITING's explicit "every 24h until action"). `EXECUTE` on this
    function is revoked from `anon`/`authenticated`/`public` — only pg_cron
    (as `postgres`) can run it; confirmed a client call gets
    `permission denied`, not a business-logic error.
- UI: `EmergencyPanel` on the case detail page (claim form → confirmed
  banner, gated by role/reporter identity and case-terminal state) and a
  `NotificationBell` in the app header (unread list, mark-read, links to the
  case).
- `database.types.ts`: added the new `cases` emergency columns and an
  `AppNotification`/`NotificationType` type.

**Verified live (Supabase `execute_sql`, simulated JWT, project
`maavrlqkdrisjwzhjdgg`):**
- `claim_emergency` rejects an empty reason (`REASON_REQUIRED`) and a
  non-reporter/non-staff caller (`FORBIDDEN`).
- `confirm_emergency` rejects a non-staff caller and an unclaimed case
  (`NOT_CLAIMED`); the reporter (technician, non-staff) cannot confirm their
  own claim.
- Full two-step happy path confirmed end-to-end (tech1 claims → exec1
  confirms → `emergency_confirmed_at` set); re-confirm and re-claim after
  confirmation both correctly rejected (`ALREADY_CONFIRMED`).
- `run_escalation_scan()` called directly by an `authenticated` client:
  `permission denied` — the revoke works.
- Backdated `emergency_confirmed_at` 2h and ran the scan as `postgres`: 1
  `EMERGENCY_ESCALATION_1H` notification fired (to case owner + all active
  Managers); re-running the scan produced no duplicate — idempotent via
  `emergency_escalated_at`.
- Backdated a resolved-EXTERNAL wait's `resume_ready_at` 25h and ran the
  scan: 1 `WAIT_ESCALATION_24H` fired; backdating `last_escalated_at` a
  further 25h and re-running fired 1 `WAIT_MANAGER_REMINDER_24H` — the
  §7.2 repeat-until-resumed behavior works.
- `acknowledge_case` inserted a `CASE_ACKNOWLEDGED` notification readable by
  the reporter and invisible to a different staff member (RLS) — the
  message names the acknowledging actor per §5.2.
- Direct client `insert`/`update` on `notifications` both rejected/no-op
  under RLS; `mark_notification_read` only lets the actual recipient flip
  `read_at`.

**Tests:** added `tests/emergency-and-notifications.test.ts` (10 tests) —
claim/confirm guards and ordering, the `run_escalation_scan` permission
lockout, notification RLS, and `mark_wait_resolved`'s immediate
notification. Structurally verified in this sandbox (lint clean, `next
build` type-checks clean, all 4 test files including this one load and
execute in order, failing uniformly at the network call — see
tests/README.md); real signal is the GitHub Actions run on this loop's PR.
The 24h/1h timer *durations* themselves cannot be exercised in a suite that
runs in seconds — that gap was closed instead by the live backdated-column
`execute_sql` checks above, run directly against the scheduled function.

**Known limitations:** notification targeting for the two escalation paths
(alert "Executive + Manager" per §7.2, and — by extension, since the pack
names no explicit recipient for §7.3 — the same set for confirmed
emergency) can double-notify a single person who is both the case owner
and a Manager (two rows, same message) — cosmetic, not a correctness bug,
left as-is rather than adding dedup logic the pack doesn't ask for. pg_cron
job cadence (5 min) is an implementation choice, not a locked value — the
pack only locks the 24h/1h thresholds, not how often the scan polls for
them.

## Loop 8 — 2026-09-06

**Summary:** Spare request/usage RPCs + UI (§16), enforcing the §3.3
₹12,000 Manager-approval financial-authority boundary server-side. Also
fixed a real authorization bug found while building this loop.

**Material changes:**
- Migration `0009_maintenance_spares.sql`: `spare_requests`/`spare_usage`
  have existed since Loop 1, but their 0002 insert policies let ANY
  authenticated user insert a row with self-set values for
  `requires_manager_approval`/`approved_by`/`approved_at` — a real gap on a
  locked financial boundary. Tightened both to RPC-only
  (`with check (false)`), matching every other audit-sensitive table in
  this schema, and added:
  - `raise_spare_request` — any authenticated user (§16.3: technician
    direct, or Executive on their behalf); `requires_manager_approval` is
    always computed server-side from `p_estimated_amount > 12000`, never
    accepted as client input.
  - `approve_spare_request` — Manager-only, mandatory non-empty
    `approval_proof_ref` (§3.3: "approval proof is a request
    prerequisite"), rejects a request that never crossed the threshold
    (`NOT_REQUIRED`) or was already approved (`ALREADY_APPROVED`).
  - `record_spare_usage` — same actor eligibility as `record_intervention`
    (staff, or the actively assigned technician); if linked to a request
    that needed Manager approval, blocks (`APPROVAL_REQUIRED`) until that
    approval is actually on record — this is where the proof requirement
    gets enforced against real usage, not just the request.
- **Bug found and fixed (`0010_maintenance_is_manager_null_fix.sql`):**
  `maintenance.is_manager()` (defined in 0002) returned `NULL` — not
  `false` — for any authenticated caller with no `maintenance.staff` row,
  because `current_staff_role() = 'MAINTENANCE_MANAGER'` propagates NULL
  through the equality. The function's only prior use (0002, an RLS `with
  check`) happened to be safe because Postgres RLS treats NULL as "reject",
  but `approve_spare_request`'s `if not maintenance.is_manager() then raise
  exception` guard is standard PL/pgSQL, where `IF NULL` silently skips the
  branch — i.e. a non-staff authenticated caller (tech1, or any reporter)
  could have called `approve_spare_request` and fallen through the
  authorization check undetected. Same class of defect as RISK-11 (guard
  against NULL, not just an explicit false). Fixed at the source
  (`coalesce(..., false)`) so every future caller of `is_manager()` is safe
  by construction, not just this one call site. Caught by testing the
  negative case with the technician account (no staff row) before this
  code ever reached the UI — see verification below.
- UI: `SparesPanel` on the case detail page — request list with per-request
  approval status, a raise-request form (any signed-in user), a Manager-only
  approve control (proof reference required), a usage list, and a
  record-usage form (staff or the assigned technician).
- `database.types.ts`: added `SpareRequest`/`SpareUsage`.

**Verified live (Supabase `execute_sql`, simulated JWT, project
`maavrlqkdrisjwzhjdgg`):**
- `raise_spare_request`: ₹12,000 exactly → `requires_manager_approval =
  false`; ₹12,000.01 → `true` (boundary is `>`, not `>=`, matching §3.3
  literally). `initiated_role` correctly `TECHNICIAN` for tech1 (no staff
  row).
- Before the `is_manager()` fix: confirmed the bug live — a non-staff
  caller's `approve_spare_request` call incorrectly proceeded past the
  `FORBIDDEN` guard. After the fix: `select maintenance.is_manager()` for
  tech1 correctly returns `false` (not NULL), and `approve_spare_request`
  now correctly rejects both a non-staff caller and a staff Executive
  (only Manager is authorized).
- `approve_spare_request` without proof → `APPROVAL_PROOF_REQUIRED`; with
  proof → succeeds; re-approve → `ALREADY_APPROVED`; approving a
  <=₹12,000 request → `NOT_REQUIRED`.
- `record_spare_usage` on an unapproved >₹12,000 request → blocked
  (`APPROVAL_REQUIRED`) even for staff; succeeds once approved. A
  non-staff, non-assigned caller is `FORBIDDEN`; the actively assigned
  technician can record usage on their own case.
- Direct client `insert` on both `spare_requests` and `spare_usage`
  rejected by RLS.

**Tests:** added `tests/spares.test.ts` (7 tests) — the threshold
computation, the full `is_manager()`-NULL regression (non-staff and
non-Manager staff both rejected), proof/idempotency guards on approval,
the `APPROVAL_REQUIRED` usage gate, actor eligibility for usage recording,
and both tables' direct-insert RLS denials. Structurally verified in this
sandbox (lint clean, `next build` type-checks clean, all 5 test files
including this one load and execute in order, network call fails here
only — see tests/README.md); real signal is the GitHub Actions run on
this loop's PR.

**Known limitations:** `record_spare_usage` does not itself verify the
linked `spare_request`'s `quantity_requested` against cumulative usage
quantity (over-fulfillment isn't blocked) — the pack's §16.1 usage chain
doesn't ask for that check, and Stores remains the authoritative stock
ledger (§16.2), so this module deliberately doesn't try to reconcile
quantities against a truth it doesn't own.

## Loop 9 — 2026-09-06

**Summary:** Duplicate case linkage (§4.6) and reporter-driven false/wrong
complaint closure (§4.7).

**Material changes:**
- Migration `0011_maintenance_duplicate_false_complaint.sql`:
  - Added `cases.duplicate_of_case_id`. The `status_transitions` rows for
    `-> DUPLICATE` have existed since Loop 1 as graph documentation, but
    calling the generic `transition_case` RPC with `DUPLICATE` could never
    actually record "link to primary case" (§4.6) — it only knows
    from/to status. Rather than leave that gap open, `transition_case` now
    refuses `DUPLICATE` outright (`USE_MARK_DUPLICATE_CASE`) and a new
    `mark_duplicate_case(p_case_id, p_primary_case_id, p_reason)` — staff
    only, mandatory reason, rejects a case being its own primary, still
    reads `status_transitions` to decide which current statuses are
    eligible rather than hardcoding them a second time — does the
    transition and the link together, atomically. The primary case's own
    row is never touched (§4.6: "primary remains active").
  - New `close_false_complaint(p_case_id, p_closure_reason,
    p_other_explanation)` — the reporting person (not staff) may close
    their own false/wrong complaint; lands in the existing `REJECTED`
    status (the pack defines no separate terminal status for this).
    Deliberately does NOT hardcode the pack's "predefined closure reason"
    as a fixed enum in the database — the pack requires the concept but
    never enumerates values, and inventing that business taxonomy at the
    RPC layer would be exactly the kind of business-rule invention
    CLAUDE.md prohibits. What IS enforced literally: a non-empty reason,
    and a mandatory explanation when the reason is `OTHER`. The reason
    list lives in the UI (`close-false-complaint-form.tsx`) as presentation
    convenience, not a locked contract.
- UI: `MarkDuplicateForm` (staff, looks up the primary case by case
  number) and `CloseFalseComplaintForm` (reporter only, predefined-reason
  dropdown + OTHER explanation) on the case detail page; a "Duplicate of
  <case number>" badge with a link when set.
- `database.types.ts`: added `duplicate_of_case_id` to `MaintenanceCase`.

**Verified live (Supabase `execute_sql`, simulated JWT, project
`maavrlqkdrisjwzhjdgg`):**
- `transition_case(..., 'DUPLICATE', ...)` correctly refuses with
  `USE_MARK_DUPLICATE_CASE` even for a staff caller.
- `mark_duplicate_case`: non-staff rejected (`FORBIDDEN`), self-as-primary
  rejected (`INVALID_PRIMARY`), empty reason rejected (`REASON_REQUIRED`);
  full happy path confirmed — duplicate case correctly landed in
  `DUPLICATE` with `duplicate_of_case_id` set, primary case's own
  status/link untouched (still `REPORTED`, `duplicate_of_case_id` still
  null).
- `close_false_complaint`: a non-reporter staff caller rejected
  (`FORBIDDEN`) even though they're Maintenance staff; the actual reporter
  succeeded and the case landed in `REJECTED`.

**Tests:** added `tests/duplicate-and-false-complaint.test.ts` (4 tests) —
the `transition_case` DUPLICATE lockout, the full `mark_duplicate_case`
guard set plus the primary-untouched assertion, reporter-only enforcement
plus the OTHER/explanation rule on `close_false_complaint`, and a
transition-eligibility check (cannot close-as-false-complaint once a case
has moved past `REPORTED`). Structurally verified in this sandbox (lint
clean, `next build` type-checks clean, all 6 test files including this one
load and execute in order, network call fails here only — see
tests/README.md); real signal is the GitHub Actions run on this loop's PR.

**Known limitations:** `close_false_complaint` is scoped to `REPORTED`
only (the single locked `-> REJECTED` edge in `status_transitions`) — a
false complaint discovered after acknowledgement has no reporter-driven
shortcut in this loop; that case goes through the normal Executive
reject/closure path instead, which is an intentional scope choice, not
an oversight (widening the locked transition graph would need a §42
Change Control entry).

## Regression fix (post Loop 9, pre Loop 10) — 2026-09-06

**RISK-14, found by CI, not by manual review.** PR #5 (Loop 9)'s CI run
failed `qc-and-restoration.test.ts`'s two QC-gate tests. Root cause: the
Loop 9 `transition_case` rewrite (0011, needed to add the DUPLICATE guard)
was built from a copy of the function that predated the §13 QC gate
(Loop 5, migration `0007`) *and* its RISK-11 NULL-safety fix — that fix
was applied live in Loop 5 but, per the CHANGELOG at the time, never
captured in a numbered migration file in this repo. Re-deriving the
function from the wrong source silently deleted the QC gate outright: a
direct `TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED` transition would
have succeeded even with `qc_required = true`, a safety-relevant bypass.

Reproduced live via `execute_sql` before fixing (confirmed the gate really
was gone, not a test artifact), then fixed with
`0012_maintenance_qc_gate_regression_fix.sql`: `transition_case` now
carries the QC gate (`v_qc_required is distinct from false`) and the
DUPLICATE guard together. Re-verified live: `qc_required = true`, `= null`,
and `= false` all behave correctly, and DUPLICATE is still refused via the
generic path. See `RISK_REGISTER.md` RISK-14.

**Process note:** this is the second time an inline (non-migration-file)
fix has caused downstream confusion (RISK-11's fix was also applied live
without a matching file, which is exactly what made it easy to silently
drop in Loop 9). Going forward, any `execute_sql`/`apply_migration` fix to
an already-shipped function must also land as its own numbered migration
file in the same work session — no more fixes that only exist live.

## Loop 10 — 2026-09-06

**Summary:** Preventive maintenance (§17) — the last item in the Loops 6-10
batch. Hard gate per IMPLEMENTATION_PACK.md §19.11 triggers after this loop;
see `APPROVAL_REPORT_LOOP_06_10.md`.

**Material changes:**
- Migration `0013_maintenance_pm.sql`:
  - Added `pm_plans.approved_at` and `pm_instances.completed_at` for
    auditability (mirrors the `approved_at` pattern from Loop 8's
    `spare_requests`). Added `PM_OVERDUE` to the `notifications` check
    constraint (§23 locks it as a minimum notification).
  - `pm_plans_insert` (0002) let any staff member insert a row with a
    self-set `approved_by` — the same class of gap as `spare_requests`
    before Loop 8. Tightened to RPC-only.
  - `create_pm_plan(title, plan_type, asset_ref, frequency_days)`: a
    RECURRING plan may be proposed by any staff member but is unapproved
    until a Manager acts; frequency is mandatory and never defaulted
    (`FREQUENCY_REQUIRED`) — "exact frequencies must not be invented" is
    read literally, as "must be explicitly supplied," not as "the database
    picks a number." A ONE_TIME plan may only be created by a Manager
    (§17.2) and is self-approved at creation, matching the locked text's
    lack of a separate approval step for it; it must not carry a frequency
    (`FREQUENCY_NOT_APPLICABLE`).
  - `approve_pm_plan`: Manager-only, rejects double-approval and approving
    a plan that isn't pending (e.g. an already-self-approved ONE_TIME
    plan).
  - `link_pm_instance_to_case`/`complete_pm_instance`: staff-only; §17.3
    "Executive manages execution/assignment" — linking a PM instance to a
    real case is how execution starts, the case's own lifecycle takes over
    from there.
  - `reschedule_pm_instance`: staff-only, mandatory reason; §17.4
    "rescheduling must not erase original overdue history" is enforced
    structurally — the old instance is marked `RESCHEDULED` (never
    deleted/edited in place) and a new `SCHEDULED` instance is created,
    linked back via the `rescheduled_from_instance_id` column that has
    existed since Loop 1 for exactly this.
  - `run_pm_scan()`: cron-only (hourly), same pattern as
    `run_escalation_scan` (Loop 7) — generates the next due instance one
    at a time per approved active RECURRING plan (no invented lookahead
    window; the pack asks for generation "from approved schedule," not a
    batch size), flags `SCHEDULED` instances past `due_at` as `OVERDUE`,
    and notifies (§17.4: "alert responsible Executive + Manager"). The
    schema has no per-plan "responsible Executive" field, so the
    already-auditable stand-in is used: the linked case's current owner
    once execution has started, falling back to the plan's own creator
    before that.
- UI: new `/pm` page (staff-only — a non-staff signed-in user sees a plain
  notice instead of an empty/broken list, since `pm_plans`/`pm_instances`
  are staff-only reads per 0002 RLS) — plan list with a create form and
  Manager-only approve control, instance list with link-to-case,
  reschedule, and complete actions. Added a "PM" nav link in the app
  header, staff-only.
- `database.types.ts`: added `PmPlan`/`PmInstance`.

**Verified live (Supabase `execute_sql`, simulated JWT, project
`maavrlqkdrisjwzhjdgg`):**
- `create_pm_plan`: RECURRING without frequency → `FREQUENCY_REQUIRED`;
  ONE_TIME by a non-Manager → `FORBIDDEN`; ONE_TIME by Manager →
  self-approved immediately.
- `approve_pm_plan`: non-Manager rejected, double-approve rejected.
- `run_pm_scan()` called directly by an `authenticated` client:
  `permission denied`.
- Backdated a RECURRING plan's `approved_at` 31 days (frequency 30 days)
  and ran the scan as `postgres`: 1 instance generated and immediately
  flagged `OVERDUE` (its due date was already in the past); the matching
  `PM_OVERDUE` notifications landed for both the plan's creator and the
  Manager. Re-running the scan produced no duplicate instance and no
  duplicate notification — idempotent (status leaves `SCHEDULED` once
  flagged, so the overdue-scan's own `WHERE status = 'SCHEDULED'` no
  longer matches it).
- `link_pm_instance_to_case` linked a case; `complete_pm_instance`
  succeeded once then correctly rejected a second call
  (`ALREADY_COMPLETED`).
- `reschedule_pm_instance` on a manually-seeded SCHEDULED instance:
  confirmed the old instance survives as `RESCHEDULED` (not deleted) and
  the new instance carries `rescheduled_from_instance_id` pointing back to
  it — original overdue/scheduling history is never erased.

**Tests:** added `tests/pm.test.ts` (6 tests) — the plan-creation and
approval guard set (frequency requirement, RECURRING-vs-ONE_TIME authority
split, double-approval rejection, approving an already-self-approved
ONE_TIME plan), and the `run_pm_scan` permission lockout. Structurally
verified in this sandbox (lint clean, `next build` type-checks clean, all
7 test files including this one load and execute in order, network call
fails here only — see tests/README.md); real signal is the GitHub Actions
run on this loop's PR. Instance-lifecycle RPCs
(`link_pm_instance_to_case`/`complete_pm_instance`/
`reschedule_pm_instance`) are **not** exercised by this Vitest suite —
instances only come into existence via `run_pm_scan`, which is
intentionally unreachable by any client, and there is no test-only
"seed an instance" RPC (same reasoning as Loop 6's decision not to build
a test cleanup RPC: it would cut against the tables' own design). Those
three RPCs were verified live instead, per above.

**Known limitations:** the "responsible Executive" stand-in
(case-owner-or-plan-creator) for `PM_OVERDUE` alerts is a reasonable but
not pack-specified interpretation — the locked text never defines who
that is before a case exists for the PM work. `run_pm_scan`'s hourly
cadence is an implementation choice; the pack locks no specific polling
interval for PM, only that overdue flagging and generation happen
automatically.

# Batch 3 — Loops 11-15

Boss approval to proceed: "suru karo...loop 11 se 15 suru karo" (2026-09-06).

## Loop 11 — 2026-09-06

**Summary:** Browser E2E, actually running — closing RISK-05, open since
Loop 1 and the top item in the last gate report's §J.

**The insight that unblocked it:** RISK-05 was framed for ten loops as "this
sandbox can't reach Supabase, so browser tests must wait for a human to run
them elsewhere." But GitHub Actions *does* have normal egress — the Vitest
suite has been talking to the live Supabase project from CI since Loop 6.
The browser tests never needed a human; they needed to run in CI.

**Material changes:**
- Added `@playwright/test` + `playwright.config.ts`. The config builds and
  starts the app itself (port 3100) and points the browser at it, rather
  than at a Vercel preview URL — no deploy-timing race in CI, and what's
  under test is this repo's client-side wiring, not Vercel's edge. Set
  `E2E_BASE_URL` to run against a deployed URL instead.
- Replaced `e2e/smoke.mjs` (a one-shot script that had never once been run,
  and whose hardcoded `executablePath` would have failed in CI anyway) with
  two real spec files, 8 tests:
  - `e2e/case-flow.spec.ts` — signed-out `/login` renders with zero console
    or page errors; `/cases` while signed out redirects to *this app's* own
    login (a standing RISK-08 guard: it must never be a Vercel SSO wall);
    the full sign-in → report → acknowledge → journal → audit-trail flow;
    and the §6 emergency claim/confirm two-step including its reason
    requirement and the claim-is-not-confirmation distinction.
  - `e2e/roles-and-notifications.spec.ts` — §17 PM surface hidden from a
    non-staff user *and* gated on direct navigation; Manager-only PM
    approval (§17.3); §23 acknowledgement notification reaching the reporter
    and provably *not* visible to the acknowledging Executive (two parallel
    browser contexts); §3.3 ₹12,000 spare gate rendering the awaiting-
    approval state with the approve control withheld from a non-Manager.
- Wired into `.github/workflows/ci.yml` as a separate `e2e` job that runs
  after `lint-and-build` passes, installs Chromium, and uploads the
  Playwright HTML report as an artifact on failure.
- `e2e/README.md` documents the setup, the sandbox limitation, and the
  coverage table.
- `signIn()` surfaces the login page's own inline error text on failure
  instead of a bare "still on /login" timeout — RISK-10's actual message
  ("Database error querying schema") is what identified that bug, so the
  harness now preserves that signal by construction.

**Verified locally (this sandbox):**
- 2 of 8 tests genuinely **pass** — the two signed-out specs. These are the
  first browser tests ever to actually run and pass in this repo; every
  prior loop's "UI verification" was a server-side fetch of rendered HTML.
- The other 6 fail at the sign-in network call only, and now say so
  explicitly: `signIn(executive) did not reach /cases. Login page reported:
  "Failed to fetch (maavrlqkdrisjwzhjdgg.supabase.co)"` — the sandbox's
  egress policy, not an app defect.
- `npm run lint` clean, `tsc --noEmit` clean over the new specs.

**Known limitations:** the 6 sign-in specs can only be proven in CI, not
here — that is the whole point of the CI job, but it does mean this
sandbox cannot self-certify them. RISK-05 is marked PARTIALLY RESOLVED
until the first CI `e2e` job passes. A version note: this environment ships
a pre-installed Chromium of a different build than current Playwright
expects, so local runs need `E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium`;
CI installs its own matching browser and leaves that env var unset.

**First CI result — 6 of 8 passed.** The four sign-in-dependent
`case-flow` specs all passed on the very first run: login works in a real
browser, and so do report → acknowledge → journal → audit trail and the §6
emergency two-step. The two failures were **defects in the new test code,
not in the app**, and are worth naming rather than quietly fixing:
- The PM approval spec located the plan card with
  `page.locator("div").filter({hasText: title}).last()`, which resolves to
  the *innermost* matching div — the one holding only the title, not the
  card that also holds the status text and the Approve button.
- The notification spec asserted the acknowledging Executive could not see
  the symptom text anywhere on the page. But that page *is* the case detail
  page, which shows the symptom in its heading. The real claim — that the
  notification is not delivered to them — needed scoping to the
  notification panel.

Both now anchor on `data-testid` (`pm-plan-card`, `notification-panel`) and
assert on the case number inside the panel rather than page-wide text. A
test that asserts the wrong thing is still a defect; it just costs a cycle
instead of an incident.

## Loop 12 — 2026-09-06

**Summary:** Shift handover and availability (§22) — the last §32
must-have area that had zero implementation.

**A locked-scope decision worth stating plainly:** §22.1 and §24 both name
`UNASSIGNED / WAITING_MAINTENANCE` as where a case goes when nobody is
available at logout. That is **not** added as a `case_status` value. The §4
lifecycle graph is LOCKED and contains no such node, and ownership is
already a separate axis from status in this schema (§5.6 ownership
transfer; WAITING is likewise an overlay, not a status). So it is
represented the way the schema already represents it: the case keeps its
lifecycle status and `current_owner_user_id` goes NULL — which is exactly
the state `take_ownership` is written to pick back up. Adding a status
would have been a lifecycle change requiring a §42 Change Control entry;
this required none.

**Material changes (`0014_maintenance_handover.sql`):**
- `staff.is_available` + `availability_changed_at`, set through
  `set_availability` (staff-only, self only). §22 says "next available /
  logged-in Executive" — but the database cannot see who is logged in, and
  inferring availability from session activity would be guesswork, so
  availability is explicit and self-declared: on shift / off shift.
- `handover_case(case, to, reason)` — the preferred manual path (§22.1).
  Reason mandatory; receiver must be active staff; the current owner may
  hand over their own case and a Manager may move anyone's (§3.2). Closes
  the prior `case_ownership` row and opens a new one, so history is an
  unbroken chain rather than an overwrite, and `created_at` is never
  touched (§22.1/§5.6: case age does not reset).
- `handover_all_open_cases(reason)` — the logout path. Picks the next
  available Executive, falling back to an available Manager ("If no
  Executive/Manager is available" implies a Manager may receive), and with
  nobody available unassigns the case rather than leaving it with someone
  who has gone home. Receiver ranking among several available people is
  deterministic (Executives first, then longest-available, then name) —
  the pack says "next available", not how to rank, so this is a mechanism
  choice and deliberately *not* a workload/round-robin policy, which would
  be invented.
- Two new notification types (§23 locks "required ownership/handover
  notifications"): `CASE_HANDOVER_RECEIVED` to the receiver, and
  `CASE_UNASSIGNED` to all active Managers — an orphaned case nobody is
  told about is the exact failure mode §22.1 exists to prevent.

**UI:**
- Sign-out now checks for still-owned open cases and, if any, shows the
  §22.1 warning popup with a handover reason, rather than silently
  dropping them. If the check itself errors, it says so and still offers
  to sign out — nobody gets trapped in the app, but nothing is silently
  lost either.
- Availability toggle (On shift / Off shift) in the header.
- `HandoverForm` on the case detail page for the preferred manual path.
- §22.2 handover quality: the case page now shows **ownership history**
  (who held it, when, and why it moved) and an **escalation state** panel
  (confirmed emergency with its 1h clock, resume-ready wait with its
  escalation) — a receiver could previously see the journal and
  interventions but had no view of either.
- New `/dashboard` ("Shift") route with the §22 list: total open,
  unassigned, per-staff pending/completed, on/off shift, PM overdue, and
  oldest open cases. **Age is shown, never "overdue"** — no case-level SLA
  exists in the locked pack, and inventing a threshold to colour cases red
  would be exactly the invention CLAUDE.md prohibits. PM overdue is
  different and is shown as a real count, because it derives from an
  explicitly supplied frequency.

**Verified live (`execute_sql`, simulated JWT):**
- `handover_case`: non-staff `FORBIDDEN`; empty reason `REASON_REQUIRED`;
  full handover succeeded.
- Ownership chain checked directly: prior row closed with the reason, new
  row opened, and `ended_at` of the first exactly equals `started_at` of
  the second — a continuous, gap-free history. `created_at` unchanged.
- `handover_all_open_cases` with everyone else off shift: 3 cases
  unassigned, 0 handed over, `current_owner_user_id` NULL, ownership rows
  closed, 3 `OWNERSHIP_UNASSIGNED` events and 3 `CASE_UNASSIGNED` Manager
  notifications.
- Same call with an Executive back on shift: 1 handed over, 0 unassigned,
  receiver correctly the available Executive.

**Tests:** `tests/handover.test.ts` (6 tests) — the guard set (non-staff,
missing reason, non-staff receiver, handing to the current owner), the
ownership-history-and-age assertions above, Manager override vs. non-owner
Executive, and receiver-scoped handover notification. Suite is now 46
tests across 8 files.

**Known limitations:** `handover_all_open_cases` is covered in Vitest only
by its reason guard. It deliberately acts on *every* open case the caller
owns, so running it for real inside a suite that shares one live Supabase
project would move cases other tests are mid-way through using. Its full
behaviour was verified live instead (above) — the same call this project
has made before when a test would have to fight the shared-project
constraint rather than test the product.

**Correction to an earlier claim:** `STATUS.md` at the Loop 10 gate said
"44 tests total across 7 files". The real number was 40 (verified by
counting `it()` blocks; the Loop 9 CI run reported 34, plus Loop 10's 6).
The gate report's other figures were not affected, but the test count was
overstated and is corrected here and in STATUS.md.

## Loop 13 — 2026-09-06

**Summary:** Production restart boundary (§13) — §32 item 12, previously
schema-seam-only.

**A gap found while reading the spec:** §13.1 requires recording
`PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE` with an *"active stop
reference"* — but a Maintenance safety/technical stop had never been
modelled anywhere in the schema, so there was nothing to reference. The
stop itself had to be built first.

**Material changes (`0015_maintenance_production_boundary.sql`):**
- `maintenance.safety_stops` — a raised/lifted Maintenance stop with type
  (SAFETY | TECHNICAL), machine/line refs, reasons on both raise and lift,
  and actor/timestamps for each. RPC-only writes. A partial unique index
  enforces **at most one active stop per case**, because a second active
  stop would make "the active stop reference" ambiguous.
- `raise_safety_stop` / `lift_safety_stop` — staff-only, reason mandatory
  on both. Lifting is always its own deliberate action: there is no code
  path anywhere that lifts a stop as a side effect of something else
  (§24 NEVER AUTOMATE: "silently override safety stop").
- `maintenance.production_boundary_events` — the §13.1/§13.2 records, with
  machine/line, the stop reference, reason/context, actor, timestamp, and
  the case status at the moment of recording. Own table rather than only
  `case_events` because the fields are structured and §25 KPI reporting
  will need to count them; they are mirrored into `case_events` too so the
  case's single audit trail stays complete.
- `record_production_started_without_release` (§13.1) — records and does
  **nothing else**: it does not lift the stop, does not move the case, does
  not mark anything released. It refuses to record on a case that actually
  reached `MAINTENANCE_RELEASED`/`CLOSED`, because a production start after
  a real release is the expected outcome and filing it as a violation would
  be false history. Managers are notified
  (`PRODUCTION_BOUNDARY_BREACH`) — a boundary breach nobody is told about
  is not meaningfully recorded.
- `record_production_not_restarted` (§13.2) — records only. It deliberately
  does not gate closure: "Maintenance may close if Maintenance-side
  conditions permit" is governed by the existing closure rules, and adding
  a new blocker here would be inventing one.

**Nothing here authorises or blocks a line start.** §13 is explicit that
Maintenance must not become Production's line-start authority; these RPCs
record what Maintenance observed at the boundary.

**Verified live (`execute_sql`, simulated JWT):**
- Raised a SAFETY stop, then recorded a §13.1 breach against it. The
  returned `safety_stop_id` matched, and critically `lifted_at` was still
  NULL afterwards — **the stop was not cleared**. Case status stayed
  `IN_REPAIR`, and the event captured `case_status_at_record = IN_REPAIR`.
  One `PRODUCTION_BOUNDARY_BREACH` notification reached the Manager.
- Second `raise_safety_stop` on the same case → `STOP_ALREADY_ACTIVE`.
- Non-staff `lift_safety_stop` → `FORBIDDEN`; staff lift with a reason
  succeeded.
- `record_production_not_restarted` recorded cleanly.

**Tests:** `tests/production-boundary.test.ts` (7 tests) — stop guards
(staff-only, one-active-per-case), lift guards (staff, reason, no
double-lift), the **stop-must-survive-the-breach-record** assertion,
refusal to record a breach on a genuinely released case (walked through the
real lifecycle to get there), §13.2 recording without fabricating a restart
or introducing a closure blocker, and direct-insert denial on both new
tables. Suite is now 53 tests across 9 files.

## Loop 14 — 2026-09-06

**§25 KPI reporting + production impact capture (§32 item 22).**

### The gap this loop closes

Reading §25 against the live schema turned up exactly one real hole. §25.1
group 3 is "Production Impact — minutes + kg", and §25.2 lists **downtime
minutes** and **output loss kg** as minimum operational measures. A schema
query confirmed no such column existed anywhere in `maintenance`. Everything
else §25.2 asks for was already derivable from existing history — case age
from `created_at`, restoration time from `technically_restored_at`, wait
duration from `waits`, PM overdue from `pm_instances`, ownership/workload from
`case_ownership`/`cases`, reopen signals from `case_events`, escalation state
from the wait/emergency columns. Those two measures were the whole gap.

### `0016_maintenance_impact_kpi.sql`

`maintenance.case_impact_records` — `downtime_minutes` and `output_loss_kg`
both **nullable, with no DEFAULT 0 anywhere in the file**, because §25.2 says
*"Missing data must NOT silently become zero."* Recording only one of the two
measures is a valid partial observation, and "not recorded" and "zero" are
different facts that the schema, the RPC, and the UI all keep apart.
`basis text not null` because §25.2 also says financial impact must use an
authoritative source/basis — a figure with no stated origin is not a KPI.
`supersedes_record_id` because §27 makes history append-only: a revised figure
is a NEW row pointing at the one it replaces, never an UPDATE.

`record_production_impact(...)` — staff-only, raising `BASIS_REQUIRED`,
`NO_MEASURE_SUPPLIED`, `CASE_NOT_FOUND`, `INVALID_SUPERSEDE`; writes both a
`case_events` row and an `audit_log` row. The staff guard is written
`coalesce(is_staff(), false)` even though `is_staff()` cannot currently return
NULL — RISK-13 was exactly this pattern going wrong when the helper underneath
changed shape, so the guard no longer depends on that.

`maintenance.case_current_impact` — a view returning the newest
non-superseded record per case, so "the current figure" exists without any
UPDATE ever touching the original.

### RISK-15 — the view bypassed RLS (found and fixed in this loop)

`case_current_impact` is the first view in this schema, and it shipped with
Postgres's default: **a view executes with its owner's privileges**, and the
owner (`postgres`) is not subject to RLS. It read straight past the
`is_staff()` SELECT policy on `case_impact_records`.

This was measured, not assumed. With 2 impact rows present, a technician JWT
querying an identical probe view created without `security_invoker` returned
**2 rows**; the same JWT against the base table returned **0**. The probe view
was dropped immediately afterwards (verified gone).

Fixed in `0017_maintenance_impact_view_security_invoker.sql`. Re-verified: the
technician JWT now returns 0 rows through the view while staff still sees the
record. A permanent regression test guards it. **Standing precedent for this
repo: every reporting view over an RLS-protected maintenance table must set
`security_invoker`, or the policy underneath it is decorative.**

Also confirmed the view is not writable despite `authenticated` holding the
schema's blanket INSERT/UPDATE grant — `DISTINCT ON` makes it
non-auto-updatable, and both a direct insert and a direct update were refused
live (`cannot insert into view` / `cannot update view`).

### Live verification (`execute_sql`, simulated JWTs)

| Check | Result |
|---|---|
| non-staff caller | `FORBIDDEN` |
| blank basis | `BASIS_REQUIRED` |
| neither measure supplied | `NO_MEASURE_SUPPLIED` |
| negative downtime | check constraint violation |
| downtime-only record | `output_loss_kg` stored as **NULL, not 0** |
| supersede a record on another case | `INVALID_SUPERSEDE` |
| correction recorded | 2 rows kept; original still `downtime=45` |
| view after correction | 1 row, the corrected record (60 min / 120 kg) |
| events + audit | 2 `PRODUCTION_IMPACT_RECORDED` events, 2 audit rows |
| direct insert as staff | RLS refusal |
| non-staff reads view (post-fix) | 0 rows |

### UI

`ImpactPanel` on the case page — records impact, and renders a null measure as
the words *"not recorded"* rather than a number, which is where §25.2's
no-silent-zero rule actually has to hold. A correction is offered as
"Correct this figure", which supersedes rather than edits; the superseded row
stays visible in the history, greyed and labelled.

New `/kpi` page covering the §25.1 groups. Three things it deliberately does
**not** do:

- **No KPI targets or SLAs** (§25.2). Nothing is coloured good/bad and no
  number is compared to a threshold, because no approved threshold exists.
- **No ₹ cost-of-maintenance headline.** Spare `estimated_amount` values are
  Maintenance-entered *estimates*, not an authoritative costing, and §24 lists
  fabricating financial impact as NEVER AUTOMATE. They are shown labelled as
  estimates, and requests carrying no amount are counted separately rather
  than folded in as ₹0.
- **No zero-filling.** Every metric carries a coverage line ("recorded on 3 of
  40 cases"); a metric with no data reads "no data", never "0". §18 recurrence
  and §19 CAPA are listed as *unbuilt* rather than shown as zero — reporting
  "0 repeat failures" from a detector that does not exist would be false.

While wiring the page, `MaintenanceCase` turned out to be missing
`assigned_at`, `technically_restored_at`, `maintenance_released_at`, and the
two §13 boundary flags — all real columns. Added rather than worked around.

### RISK-16 — CI was failing for a real reason (fixed first, before this loop's work)

PR #9's CI came back red: 45 passed, **8 failed, every one at
`signInWithPassword` with "Request rate limit reached"**. This was not a flake
and re-running would only have moved the failure to a different file.

Two causes, both in my own test infrastructure:

1. `signInAs` signed in fresh on every call. With 78 call sites the suite fired
   ~78 requests at GoTrue's `/token` endpoint inside ~80 seconds from one CI
   IP — over the project's auth rate limit, and getting worse with every test
   added. Now one signed-in client is cached per role: 3 sign-ins per run.
   Nothing in the suite needed a fresh session (a role is one user; no test
   signs out or builds its own client). The *promise* is cached so concurrent
   first calls cannot race into two sign-ins, and a failed sign-in is evicted
   so one transient network error cannot poison every later test.
2. `push: branches: ["**"]` plus `pull_request` ran **two identical workflows
   per PR commit**, doubling that load and running two suites against the same
   live Supabase project simultaneously. Push now covers `main` only (branch
   work reaches CI through its PR), and a `concurrency` group cancels
   superseded runs so two runs of one ref can never race on shared data.

Verified: the next run was a single workflow, **53/53 green**, with the `e2e`
job green too. PR #9 (Loop 13) then merged.

### Tests

`tests/kpi.test.ts` (8 tests): staff-only guard, basis and measure
requirements, negative rejection, **the null-is-not-zero assertion**, the §27
correction chain (original survives, view reports only the newest),
cross-case `INVALID_SUPERSEDE`, direct-insert denial, and the RISK-15
regression test asserting a non-staff user reads nothing through either the
view or the table. Suite is now 61 tests across 10 files.

## Loop 15 — 2026-09-06

**§18 recurrence detection + §19 CAPA (§32 items 17-18).** Last loop of the
Loops 11-15 batch; the hard gate re-triggers after this one.

### The central design problem: PENDING-04

§18 is locked as a HYBRID architecture — evidence tiers, a configurable
threshold, a configurable window — and says in as many words:

> "Do not hard-code an unapproved recurrence threshold."
> "Historical examples may inform configuration but are not automatically the
> Maintenance rule."

PENDING-04 (the threshold and window) is still open. So this loop ships the
**mechanism and no numbers**. `maintenance.recurrence_rules` is created
**empty and seeds nothing**: with no rule rows, `run_recurrence_scan()` reads
zero rules and flags nothing. Detection is dormant *by construction*, not by a
comment asking someone not to enable it. `tests/recurrence-capa.test.ts`
asserts no ACTIVE rule exists, so a future change that quietly seeds a default
threshold fails CI.

"Evidence tiers" are likewise not invented. A tier **is** a rule row the
Manager names and defines. `match_on` is constrained to the three fields the
schema actually carries (`ASSET_REF`, `LINE`, `AREA`) rather than to a
severity ranking I would have had to make up, and every flag records which
rule produced it, so a flag always states its own evidence basis.

### What the system may and may not do (§18)

The scan creates flags with status `SUSPECTED` only. It never sets
`CONFIRMED`, and there is **no code path anywhere that writes
`root_cause_note` except `record_recurrence_root_cause`**, which requires a
human actor, their own words, and a flag somebody has already confirmed —
§18's "must NOT automatically declare root cause", enforced rather than
documented. Confirmation is by Executive **or** Manager, matching §18's
"Executive/Manager confirms recurrence status"; unlike the ₹12,000 boundary,
the pack does not reserve this to the Manager, so neither does the code.

### §19 CAPA

Owner and effectiveness verifier are both the Maintenance Manager. Any staff
member may raise a CAPA, but `raise_capa` rejects an owner who is not an
active Manager. `verify_capa_effectiveness` is Manager-only and records
**both** outcomes — the skeleton's `effectiveness_verified boolean` could not
distinguish "not yet verified" from "verified and found NOT effective", which
is precisely the distinction §19 exists to capture, so it was replaced with a
status (the table was empty; verified before altering). A system-proposed CAPA
is stored as `source = 'SYSTEM_SUGGESTED'` and shown as *"suggested — not
certified"*: §19 allows the system to suggest candidates and forbids it from
certifying effectiveness.

### A caught error worth recording

The first apply of migration 0018 was **rejected by Postgres**:

```
ERROR: 23514: check constraint "notifications_notification_type_check"
of relation "notifications" is violated by some row
```

I had rebuilt the notification-type list by copying it out of migration 0015,
but read from a line offset that silently dropped `CASE_ACKNOWLEDGED` and
`WAIT_RESUME_READY` — 580 live rows carry those two values. The transaction
rolled back cleanly (constraint verified intact afterwards). The list is now
taken from the live constraint definition itself, with a comment saying why.
Same class of mistake as RISK-14: rebuilding a definition from a stale copy
instead of from the live object.

### Live verification (`execute_sql`, simulated JWTs)

| Check | Result |
|---|---|
| scan with **no** rules configured | `flags_created: 0` (dormant — PENDING-04) |
| Executive creates a recurrence rule | `FORBIDDEN` |
| Executive verifies CAPA effectiveness | `FORBIDDEN` |
| blank `approval_note` | `APPROVAL_NOTE_REQUIRED` |
| threshold of 1 | `INVALID_THRESHOLD` |
| unsupported `match_on` | check constraint violation |
| `run_recurrence_scan` as `authenticated` | `permission denied` (cron only) |
| scan with a rule + 3 matching cases | 1 flag: `status=SUSPECTED`, `root_cause=NULL`, `decided_by=NULL`, 3 related cases, 2 staff notified |
| second scan | `flags_created: 0` (no duplicate) |
| root cause **before** confirmation | `NOT_CONFIRMED` |
| decide with no reason / bad decision | `REASON_REQUIRED` / `INVALID_DECISION` |
| confirm, then confirm again | `CONFIRMED`, then `ALREADY_DECIDED` |
| root cause after confirmation | recorded, attributed to the human who wrote it |
| CAPA owned by an Executive | `OWNER_MUST_BE_MANAGER` |
| CAPA owned by a non-staff technician | `OWNER_NOT_STAFF` |
| system-suggested CAPA | `status=OPEN source=SYSTEM_SUGGESTED` |
| verify with no note | `VERIFICATION_NOTE_REQUIRED` |
| verify NOT effective | `status=VERIFIED_NOT_EFFECTIVE` |
| verify again | `ALREADY_VERIFIED` |
| non-staff reads rules/flags/CAPA | 0 / 0 / 0 rows |

**Cleanup, and why it mattered.** The verification above required a real rule
with real numbers. Leaving it active would have meant the new hourly cron job
flagging genuine cases against a threshold the Boss never approved — the exact
PENDING-04 violation this design exists to prevent. The rule was deactivated
through the real `set_recurrence_rule_active` RPC (so the action is itself
audited) rather than deleted, keeping the history intact. Re-verified
afterwards: **0 active rules, scan returns `flags_created: 0`.** The
deactivated row remains, labelled `[AUTOTEST]` and
`"NOT an approved plant threshold"`.

### Also fixed

`NotificationType` in `database.types.ts` had drifted badly — `PM_OVERDUE`
(Loop 10), `CASE_HANDOVER_RECEIVED` / `CASE_UNASSIGNED` (Loop 12) and
`PRODUCTION_BOUNDARY_BREACH` (Loop 13) were all being written by live RPCs but
were missing from the union, so the type was quietly narrower than the
database. Corrected along with the two new values.

### Tests

`tests/recurrence-capa.test.ts` (9): the PENDING-04 no-active-rule assertion,
the scan permission lockout, `create_recurrence_rule` Manager-only and its
value guards, CAPA owner-must-be-Manager (Executive and non-staff both
refused), raise guards, the full verification path including **both**
outcomes and Manager-only enforcement, direct-insert denial on all three
tables, and non-staff read denial. Suite is now **70 tests across 11 files**.

Not covered in the suite: the scan creating a flag. `run_recurrence_scan` is
cron-only and `permission denied` for every client, so a signed-in test user
cannot reach it without a test-only backdoor RPC — the same reasoning that
kept the PM instance-lifecycle RPCs out of `pm.test.ts` in Loop 10. That whole
chain was verified live instead, as tabulated above.

## Loop 16 — 2026-09-06

**§5.4 priority Manager-override + §14.2 PTW safety gate seam (§32 item 19).**
First loop of the Loops 16-20 batch (approved by the Boss selecting "Loop
16-20 shuru karo" after the Loops 11-15 gate).

### How the gaps were found

Re-read §5, §14, §21 and §32 against the live schema and RPC list rather than
against memory of what had been built. Two real gaps turned up:

- §5.4: *"Executive can change priority. Manager has final override."*
  Priority was only ever set once, inside `acknowledge_case`, with no RPC to
  change it afterwards and no override semantics anywhere.
- §14.2: *"PTW Required = Yes/No, required permit/proof linked where
  applicable, formally required proof must exist before governed work
  starts."* `cases.ptw_required` / `ptw_proof_ref` have existed since the
  Loop 1 schema (migration 0001) — five loops of never being written to or
  gated on. Two dead columns were being counted as a built feature.

§21 (vendor/external dependency) was checked and correctly has nothing to
build in V1 — it explicitly says not to encode a mandatory approval chain
unless separately approved, and nothing here changes that.

### `change_priority` (§5.4)

New column `cases.priority_set_by_role`. Any staff member may call
`change_priority`, but the guard is: once the current priority was last set
by a Manager, an Executive cannot change it again — only another Manager
decision moves it. A case whose priority has never been explicitly changed
since acknowledgement (`priority_set_by_role is null`) is not locked, which
falls out of the NULL-safety pattern for free (`v_set_by_role = 'MANAGER'`
is false, not true, when NULL) rather than needing a separate branch.

### PTW seam (§14.2) — deliberately thin

`set_ptw_required` and `link_ptw_proof`, both staff-only, both reason-gated.
**Nothing here decides who may issue, perform, or authorize a permit** — that
exact matrix (issuer/performer/permit authority/authorized-person matrix,
exact permit types) is §14.1's PENDING-01 and stays untouched. What §14.2
actually locks — Required Y/N, a linked proof reference, and refusing
governed work without one when required — is not PENDING, so it's built.

Turning PTW off clears any linked proof (`ptw_proof_ref := null`): a stale
permit reference surviving past the requirement that produced it would be
worse than no reference at all. Verified live: disable → re-enable leaves
`ptw_proof_ref` NULL, not the old value.

"Governed work starts" is read as `DIAGNOSING -> IN_REPAIR` — per §4 it is
the *only* outgoing edge from DIAGNOSING, and §9 already splits diagnosis
from intervention along exactly this line. Same reasoning the §13 QC gate
uses for its own boundary (`TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED`).

### `transition_case` touched a third time — handled per the RISK-14 process rule

This is the third time `transition_case` has been rewritten (after the
original 0011 regression that dropped the QC gate, and its 0012 fix). The
standing rule adopted after that incident — read from the *live* function,
never a migration file, before touching it again — was followed here:

```sql
select pg_get_functiondef(oid) from pg_proc
where proname = 'transition_case' and pronamespace = 'maintenance'::regnamespace;
```

was run and captured **before** writing a single line of the new version.
The new file adds exactly two things — two new `declare` variables and one
new gate block — and changes nothing else; every other line was left
byte-for-byte identical to what the query returned. Confirmed with a full
regression pass live, immediately after applying, covering every guard that
already existed on the function, not just the new one:

| Check | Result |
|---|---|
| QC gate, `qc_required = true` | `QC_GATE` (still blocks) |
| DUPLICATE guard | `USE_MARK_DUPLICATE_CASE` (still redirects) |
| `REASON_REQUIRED` on REJECTED | still enforced |
| PTW not required → IN_REPAIR | proceeds (gate correctly inert) |
| non-staff sets PTW required | `FORBIDDEN` |
| blank reason on `set_ptw_required` | `REASON_REQUIRED` |
| link proof before PTW required | `PTW_NOT_REQUIRED` |
| PTW required, no proof → IN_REPAIR | `PTW_GATE` (blocks) |
| blank proof ref | `PROOF_REF_REQUIRED` |
| proof linked → IN_REPAIR | succeeds |
| Executive changes priority (unlocked) | succeeds, `set_by_role=EXECUTIVE` |
| Manager overrides | succeeds, `set_by_role=MANAGER`, priority moved |
| Executive tries to undo Manager's decision | `MANAGER_OVERRIDE` |
| Manager changes own decision again | succeeds |
| `PRIORITY_CHANGED` events recorded | 4 (one per successful change above) |

A permanent regression test (`tests/priority-and-ptw.test.ts`) now locks in
the pre-existing QC-gate-at-all-states and DUPLICATE-guard behaviour
alongside the two new features, specifically so a future rewrite of this
function cannot silently drop either the way 0011 did.

### UI

`PriorityPanel` on the case page shows the current priority, offers a
reason-gated change to staff, and — when locked by a Manager decision and
the viewer isn't a Manager — shows why the buttons are disabled rather than
just disabling them silently. `PtwPanel` (visible while `DIAGNOSING`, or
once PTW is required) sets Required Yes/No and links a proof, stating
directly in the UI that repair work cannot start until a proof exists.

### Tests

`tests/priority-and-ptw.test.ts` (10): the `transition_case` regression
guard (4), the PTW gate end-to-end including the disable-clears-proof
behaviour (5), and the full priority lock/override chain including the
audit trail (1, with 5 assertions inside it). Suite is now **81 tests
across 12 files**.

## Loop 17 — 2026-09-06

**§9 item 6 / §9.1 — validated root cause.**

### How the gap was found

§9 lists 8 distinct concepts diagnosis/intervention data must not be
collapsed into: observed symptom, immediate action/containment, intervention,
result, failure mode, **validated root cause**, permanent corrective action,
effectiveness verification. Checking each against the live schema: symptom
(`cases.symptom`), immediate action/intervention/result/failure mode
(`interventions`) were all already covered, and permanent corrective
action/effectiveness verification (`capa_links`) were closed in Loop 15.

**Item 6 was not.** The only place root cause could be written anywhere in
this schema was `record_recurrence_root_cause` — gated behind a `CONFIRMED`
recurrence flag. Recurrence detection is currently inert by design
(PENDING-04, Loop 15), and even once configured only covers cases matching a
rule's threshold. The great majority of one-off breakdowns had **no seam at
all** to record a validated root cause.

### `record_root_cause` — human-only by construction

§9.1: *"The system/AI MUST NOT infer or declare authoritative root cause
from symptom text alone... Only an authorized human process can validate and
record root cause as authoritative."* The RPC is staff-only and — mirroring
the §25.2 impact-record pattern from Loop 14 — requires a stated `basis`: a
root cause with no stated validation is exactly the "declared from symptom
text alone" pattern this rule forbids. Nothing anywhere calls this RPC
automatically; there is no scan, no cron, no AI path near it.

`maintenance.case_root_causes` is append-only (§8 *"Corrections are
additive, not destructive... Do not compress away earlier
observations/actions"* and §27): a correction is a new row pointing at the
one it supersedes, never an `UPDATE`. Same shape as `case_impact_records`.

### The RISK-15 lesson applied prospectively

`case_current_root_cause` is the second reporting view in this schema.
Unlike `case_current_impact` (Loop 14), which shipped without
`security_invoker` and had to be fixed after the fact (RISK-15), this one was
created **with `security_invoker = true` from its first line**:

```sql
create view maintenance.case_current_root_cause
with (security_invoker = true)
as select ...
```

Verified live before any test was written: `pg_class.reloptions` shows
`{security_invoker=true}` immediately after creation, and with real rows
present a non-staff technician JWT reads **0 rows** through both the view
and the base table. The precedent recorded in RISK-15 held.

### Live verification (`execute_sql`, simulated JWTs)

| Check | Result |
|---|---|
| non-staff caller | `FORBIDDEN` |
| blank root cause | `ROOT_CAUSE_REQUIRED` |
| blank basis | `BASIS_REQUIRED` |
| first record | stored and shown via the view |
| supersede a record on another case | `INVALID_SUPERSEDE` |
| correction recorded | 2 rows kept; original finding still intact |
| view after correction | 1 row, the corrected finding only |
| direct insert as staff | RLS refusal |
| non-staff reads view/table (with rows present) | 0 / 0 |

### UI

`RootCausePanel` on the case page — states plainly that no root cause
recorded is a valid state ("root cause is never inferred automatically"),
requires the basis box, and offers corrections as supersessions with the
prior finding kept visible in history, same interaction pattern as
`ImpactPanel`.

### Tests

`tests/root-cause.test.ts` (6): staff-only + basis-required guards, the
append-only correction chain, cross-case `INVALID_SUPERSEDE`, direct-insert
denial, and the view RLS assertion (explicitly framed as confirming the
RISK-15 lesson held, not as fixing a new instance of it). Suite is now **87
tests across 13 files**.

## Loop 18 — 2026-09-06

**§5.1 / §26 — evidence attachment/reference.**

### How the gap was found

Scanning `IMPLEMENTATION_PACK.md` §26's recommended core entities against
`create table maintenance.` across every migration turned up
`maintenance.evidence` — present since the very first migration (0001),
with its own RLS policies since the second (0002). **Nothing had ever
written to it.** Six loops, twenty migrations, and the entire UI, and this
table had zero rows and zero references anywhere in `src/`.

### The RLS was already correct — this loop is UI, not authorization

Unlike almost every other table in this schema, `evidence` was never
RPC-gated. Its insert policy is `with check (uploaded_by = auth.uid())` —
any authenticated user, not staff-only — matching how `cases_insert` itself
works (reporting a case is a direct insert too). This is deliberate: §5.1
lists evidence as an intake field, so the *reporter* needs to attach it, not
only staff, and possibly before any staff RPC has touched the case at all.
So Loop 18 adds no migration — it is the first thing to actually use a
six-loop-old, already-correct policy.

`file_ref` is treated as a **reference** (a URL, a photo pointer, a report
number) rather than an uploaded document this app stores. Building real
file/photo upload would mean Supabase Storage buckets, MIME handling, and a
security review of their own — none of that is asked for by the locked
pack, and every other reference seam in this app (PTW proof, `evidence_ref`
columns elsewhere) is the same shape: a text pointer to where the evidence
actually lives.

### A test-writing mistake caught before it shipped

The first draft of `tests/evidence.test.ts` asserted
`expect(updateErr).not.toBeNull()` after a direct `.update()` call from a
non-owning session, expecting RLS to surface as a PostgREST error. It
doesn't: **with no UPDATE policy defined, RLS makes the write match zero
rows — PostgREST reports success, not an error.** Verified directly against
Postgres before trusting the assumption: a raw-SQL `UPDATE ... RETURNING`
under the same simulated JWT returned no error either, and a follow-up
`SELECT` proved the value never changed. The correct assertion — checking
the row is provably unchanged/still present rather than checking for a
truthy error — already exists as precedent in this repo
(`emergency-and-notifications.test.ts`'s `notifications` update-denial
test), which the fixed version now matches.

### Live verification (`execute_sql`, simulated JWTs)

| Check | Result |
|---|---|
| non-staff (technician) creates a case as reporter | succeeds |
| non-staff attaches evidence to their own case | succeeds |
| staff attaches evidence | succeeds |
| insert attributing evidence to someone else (impersonation) | RLS refusal (real error) |
| update from a non-owning session | silent no-op — value unchanged (not an error) |
| delete from a non-owning session | silent no-op — row still present (not an error) |

### After Loop 16's lesson: checked before trusting build again

Loop 16's PR needed a fix for a Next.js server/client boundary bug that
`tsc`/`lint`/`build` couldn't see. Before treating this loop's UI as done,
every `"use client"` file in the app was re-scanned for a second (non-default)
export being called from a server component — the exact pattern that broke
Loop 16. `evidence-panel.tsx` has none; the whole app has none.

### UI

`EvidencePanel` on the case page, visible to **any signed-in user** (not
gated behind `isStaffRow` like most panels — matches the RLS). Lists
existing evidence with uploader/timestamp, renders a `file_ref` that looks
like a URL as a clickable link, and offers a form to attach more with an
optional description.

### Tests

`tests/evidence.test.ts` (4): non-staff self-attach,
staff attach, impersonation refusal, and the append-only assertion (correctly
checking row state, not error presence, per the note above). Suite is now
**91 tests across 14 files**.

## Loop 19 — 2026-09-06

**§5.1 / §24 — major/complex classification at intake.**

### How the gap was found

Re-reading §24's AUTOMATION VS HUMAN DECISION table line by line (rather
than skimming it, as earlier loops mostly had) turned up "major/complex
classification at complaint creation" under HUMAN REQUIRED. Cross-checked
against §5.1's intake minimum list, which independently names "major/complex
indication" as a required field. `cases.major_complex_flag` has existed
since the Loop 1 schema (0001) — a real boolean column, present in the
TypeScript types since Loop 1 too — with **no checkbox on the intake form,
no display anywhere, and no reference in `src/` at all** until this loop.
Same class of gap as PTW (Loop 16) and evidence (Loop 18): a real column
sitting dead since the very first migration.

### No migration, no RPC — same shape as Loop 18

`cases_insert`'s RLS (`with check (reporter_user_id = auth.uid())`) already
permits the reporter to set any column on the case they're creating — the
same way `symptom`/`area`/`line`/`asset_known` already work with no RPC
gate. There is nothing to author server-side; this loop is UI plumbing for
an already-correct policy, exactly like Loop 18.

Deliberately **not** built: a later change/override flow for this flag. §24
documents the classification happening "at complaint creation" and nothing
elsewhere in the pack describes a mechanism for revising it afterward (unlike
priority, which §5.4 explicitly says a Manager may later override) — adding
one would be inventing authority the contract doesn't state.

### Live verification (`execute_sql`, simulated JWT)

| Check | Result |
|---|---|
| insert with `major_complex_flag: true` | stored as `true` |
| insert with the field omitted | defaults to `false` — never silently inferred |

### After Loop 16's lesson

Re-scanned every `"use client"` file in the app for the server/client
boundary pattern before considering this done. Clean.

### UI

An intake checkbox on `/cases/new` ("This is a major / complex case"), and a
`MAJOR/COMPLEX` badge on both the case list (`/cases`) and the case detail
page header when the flag is set.

### Tests

`tests/major-complex.test.ts` (2): the flag is stored exactly as set, and
defaults to `false` when omitted rather than being guessed. Suite is now
**93 tests across 15 files**.

## Loop 20 — 2026-09-06

**§5.1 — asset/machine linkage.** Last loop of the Loops 16-20 batch; the
hard gate re-triggers after this one.

### How the gap was found

A systematic sweep — every column in every `maintenance` table cross-checked
against `src/` for any reference — found `maintenance.case_assets`
referenced only in the schema (0001), its RLS (0002), and as a READ inside
the recurrence scan (0018). **Nothing had ever written to it.** §5.1 is
explicit: *"Exact asset may be unknown at creation. Never silently map an
unknown asset. A case may later be linked to one or more assets/machines."*
The intake form (`cases/new`) has offered a checkbox reading *"link it after
acknowledgement"* since it was built — a promise the app could not keep,
since there was nowhere to actually do that.

This gap also had a concrete downstream cost: §18's recurrence engine
(Loop 15) supports an `ASSET_REF` match tier, but it could **never** produce
a match — no case had ever had a `case_assets` row to match on. Closing this
gap makes a previously-unusable recurrence tier usable for the first time.

### No RPC — same shape as evidence (Loop 18)

`case_assets_insert`'s RLS (`is_staff() and linked_by = auth.uid()`) has
been correct since Loop 2 and needed no change; this is a direct client
insert like `evidence`, just staff-gated rather than any-authenticated
(asset identification is a staff/triage judgment, unlike evidence, which
the reporter also needs to supply).

### The one genuine new piece: a trigger keeping `asset_known` honest

`cases.asset_known` is set once at intake and, until now, was never touched
again — a case reported "asset unknown" stayed marked that way forever, even
after staff identified and linked the real asset. `0021` adds
`case_assets_mark_known`, an `AFTER INSERT` trigger on `case_assets` that
flips `cases.asset_known` to `true`. This is not a business-rule change —
§5.1's "never silently map an unknown asset" is about not *guessing* which
asset, and says nothing about the boolean staying accurate once a real,
staff-entered link exists; leaving it permanently stale would make the flag
actively misleading. The trigger function is `SECURITY DEFINER` because it
must be — confirmed live first that `cases` has no direct `UPDATE` policy
for `authenticated` at all (every mutation in this schema goes through
`SECURITY DEFINER` RPCs), so a plain trigger would have failed outright.

### Live verification (`execute_sql`, simulated JWTs)

| Check | Result |
|---|---|
| non-staff links an asset | RLS refusal |
| `linked_by` spoofed to someone else | RLS refusal |
| staff links a real asset | succeeds, stored exactly as entered |
| `asset_known` before link | `false` |
| `asset_known` after link (trigger) | `true` |
| recurrence rule with `match_on = 'ASSET_REF'`, 3 cases sharing one linked asset | scan produces exactly 1 flag — the tier now works |

The test rule used for that last check was deactivated immediately afterward
through `set_recurrence_rule_active` (audited, not deleted) — same
discipline as every recurrence verification since Loop 15. Re-confirmed
after cleanup: 0 active rules.

### A testing-harness lesson worth recording

The first verification attempt used a single `DO $$ ... $$` block that
switched the simulated JWT (`set_config`) *inside* a `BEGIN ... EXCEPTION
WHEN OTHERS ... END` sub-block. When that block's exception fired, Postgres
rolled back to its implicit savepoint — which undid the `set_config` call
too, silently reverting the session to the previous role before the next
statement ran. The symptom was a confusing, unrelated-looking RLS failure
several statements later. Fixed by keeping every role switch at the
top level, outside any exception-catching block, across separate
`execute_sql` calls. Not a migration bug — a reminder that this specific
verification pattern (JWT switch + exception probes in one block) needs the
switch outside the probe.

### After Loop 16's server/client boundary lesson

Re-scanned every `"use client"` file in the app before considering this
done. Clean.

### UI

`AssetPanel` on the case page (staff-only), showing linked assets and a
form to add one — explicitly captioned that an asset is linked once
identified, never guessed from the symptom.

### Tests

`tests/case-assets.test.ts` (4): non-staff refusal, `linked_by` impersonation
refusal, a successful link stored exactly as entered, and the
`asset_known` trigger flipping `false` → `true`. Suite is now **97 tests
across 16 files**.

## Loop 21 — 2026-09-06

First loop of the Loops 21-25 batch (Gate 4 approved by the Boss).
Boss-directed scope this loop: a **presentation-only** visual upgrade to
`/dashboard` and `/kpi` (coloured stat cards, a status-breakdown bar) —
explicitly *not* new modules or nav sections. Confirmed with the Boss via
`AskUserQuestion` before starting: several unrelated third-party CMMS
screenshots were shown as visual reference, and the Boss chose "visual
style upgrade only" over "add new modules (Equipment/Inventory/etc.)" —
the latter would have been architecture drift into scope the locked pack
does not define, and is explicitly out for this loop.

### No migration, no RPC

Every number shown was already computed by the existing pages from
already-correct queries/RLS. This loop only changes presentation.

### New shared component

`src/components/stat-card.tsx` — `StatCard` (coloured icon + number +
label) and `BarBreakdown` (a proportional status bar). Plain server-safe
module (no `"use client"`), so it can be imported directly by any server
page. Deliberately invents no thresholds or judgments: `tone` is a colour
the *caller* already decided (e.g. an existing warn/neutral choice), never
a verdict this component computes on its own.

### A real, well-scoped gap found while touching `/kpi`

Re-reading `/kpi`'s own comment block against the live schema turned up a
stale claim: it said "§18 recurrence / §19 CAPA are not implemented yet",
written before Loop 15 built them, and never corrected. The page never
queried `recurrence_flags` or `capa_links` at all. Live query before
touching anything:

| Query | Result |
|---|---|
| `recurrence_flags` total / SUSPECTED / CONFIRMED / DISMISSED | 2 / 1 / 1 / 0 |
| active `recurrence_rules` | 0 (PENDING-04 — expected) |
| `capa_links` total / OPEN / VERIFIED_EFFECTIVE / VERIFIED_NOT_EFFECTIVE | 15 / 0 / 0 / 15 |
| `capa_links` with `source = 'SYSTEM_SUGGESTED'` | 1 |

Real, non-trivial data — accumulated from Loop 15's and Loop 20's own live
verification runs — sitting completely unreported. Fixed: `/kpi` now
queries and displays these as a real "Recurrence & CAPA (§18 / §19)"
group. Re-verified with a simulated staff JWT (role switch at the top
level, not inside an exception block — the Loop 20 lesson) that a signed-in
Executive sees the same counts as the superuser query: confirmed, 2 and 15
respectively.

Kept the §25.2 distinction the original page was built around: a 0 here is
a genuine zero (the detector ran, or would run, and found nothing), not a
"missing data" zero — the copy says so explicitly rather than leaving the
reader to guess which kind of zero it is.

### After Loop 16's server/client boundary lesson

Re-scanned every `"use client"` file in the app (32 files, one new since
Loop 20: `stat-card.tsx` matched the earlier grep only because of a comment
containing the literal string `"use client"`, not an actual directive —
confirmed by re-running the scan anchored to line 1). Clean, no second
export from an actual client file called by a server component.

### Verified

`tsc`, `lint`, `build` clean. The sandbox cannot reach Supabase for
`npm test`, so the suite fails identically at the network call here
(RISK-05) — unchanged by this loop, since no test file was added or
touched. Suite remains **97 tests across 16 files**.

## Loop 22 — 2026-09-07

Second loop of the Loops 21-25 batch. Continued the systematic column-sweep
method (recommended for future batches in §H of the Loop 16-20 gate report):
cross-referenced every column of `information_schema.columns` for the
`maintenance` schema against `grep -rl` on `src/`.

### §10 permanent-repair follow-up responsibility

`maintenance.restorations.follow_up_required` (`not null default false`)
has existed since Loop 1, and `evidence_ref` on `restorations`/`case_events`
has too — both zero references anywhere in `src/`. Checked both against §10
("When entered: record restoration details, preserve evidence,
generate/retain permanent-repair follow-up responsibility for Executive,
keep case non-closed unless a valid later path completes") before deciding
what, if anything, was a real gap:

- **`evidence_ref` — investigated, deliberately left alone.** Every RPC that
  accepts `p_evidence_ref` (`transition_case`, `record_restoration`) has it
  default to `null`, and no UI form anywhere passes it. But Loop 18 already
  built a general, better-designed evidence-attachment mechanism (the
  `maintenance.evidence` table + `EvidencePanel`, any signed-in user, not
  staff-only) that already satisfies "preserve evidence" for a case
  undergoing any transition, restoration included. Adding a second,
  parallel free-text evidence pointer specific to restorations would be
  redundant complexity, not a fix — the kind of duplicated mechanism
  CLAUDE.md's "Maintenance MUST NOT become a second source of truth"
  principle argues against even within the module's own schema. Left
  untouched.
- **`follow_up_required` — a real, narrower gap than it first looked.** The
  rest of §10 was already correctly built: the transition graph has no
  direct `TEMPORARILY_RESTORED -> TECHNICALLY_RESTORED` edge (a Loop 5/
  RISK-12 regression guard, still tested in `qc-and-restoration.test.ts`),
  so a case genuinely cannot close from that state, and `FollowUpButton`
  already forces the only valid path back into repair work. What was
  missing: `record_restoration` never set the flag, so once a case moved
  on past `TEMPORARILY_RESTORED` the fact that it had ever needed a
  stop-gap fix became unrecoverable from anywhere in this schema — an
  audit/KPI gap, not a lifecycle-safety one.

Migration `0022_maintenance_restoration_followup.sql`: `record_restoration`
now sets `follow_up_required = (p_restoration_type = 'TEMPORARY')` on
insert. Per the standing RISK-14 process rule, pulled the LIVE function
definition via `pg_get_functiondef` immediately before writing the
migration — every line besides that one value is byte-identical to what
was live.

**Live verification (staff JWT, role switch at the top level):**

| Step | Result |
|---|---|
| `record_restoration(..., 'TEMPORARY', ...)` | `restorations.follow_up_required = true` |
| case status after | `TEMPORARILY_RESTORED` |
| `record_restoration(..., 'TECHNICAL', ...)` after the follow-up step | `restorations.follow_up_required = false` |
| RISK-12 guard (direct `TEMPORARY -> TECHNICAL` without the follow-up step) | unaffected — only the insert's values changed, not the transition graph |

### UI

`restoration-history-panel.tsx` (new, staff-only via the page's existing
`isStaffRow` gate): the case page never showed restoration history before
this loop — the only prior query was the single pending-TECHNICAL-
verification lookup, so a `TEMPORARY` restoration was invisible on the case
page even while it was blocking closure. Plain presentational server
component (no `"use client"` — read-only, no interactivity), listing every
restoration with a type badge, a "Permanent-repair follow-up generated
(§10)" badge when `follow_up_required` is true, and the verification
result when present.

`/kpi`: one new metric in "Quality / closure" — cases with at least one
`TEMPORARY` restoration on record, and the total count of such
restorations. Same real-vs-missing-data zero discipline as Loop 21's
recurrence/CAPA group.

### After Loop 16's server/client boundary lesson

Re-scanned every `"use client"` file in the app. Clean — the new panel and
KPI addition are both plain server components.

### Tests

Added one `it()` to the existing `qc-and-restoration.test.ts` (§10
Scenario C file) rather than a new file: asserts `follow_up_required` is
`true` for the `TEMPORARY` restoration and `false` for the `TECHNICAL` one
recorded after the follow-up step. No new RLS surface — `restorations`
policies are unchanged. Suite is now **98 tests across 16 files**.

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` before shipping (table above). The sandbox cannot
reach Supabase for `npm test`; real signal is CI as always.

## Loop 23 — 2026-09-07

Third loop of the Loops 21-25 batch. This time the sweep looked for
**RPCs with zero callers anywhere in `src/`**, not just dead columns —
`grep -rl "\"<fn>\"" src/` for every `create or replace function
maintenance.<fn>` across all migrations. Eleven came back unused; nine were
false positives by design: `is_staff`/`is_manager`/`current_staff_role`
(SQL-only policy helpers, never client-facing), `next_case_number`/
`mark_asset_known` (internal trigger/sequence helpers), and
`run_escalation_scan`/`run_pm_scan`/`run_recurrence_scan` (cron-only,
`revoke execute ... from ... authenticated` on purpose, asserted by
existing tests). `take_ownership` is also a false positive — it's called
internally by `acknowledge_case` and the emergency-claim path, both of
which are wired to UI; checked it specifically against §5.6 ("cases may be
transferred between Executives") since it sounded relevant, and found
`handover_case`/`handover_all_open_cases` (Loop 12) already fully satisfy
§5.6 — no gap there.

### The two real ones: §18 configuration was fully built and fully untested-by-UI

`create_recurrence_rule` and `set_recurrence_rule_active` (Loop 15) were
completely correct and completely unreachable from this app. The only way
anyone had ever called them — including every "verified live" table in the
Loop 15/20/21 CHANGELOG entries above — was direct SQL against the live
database, by me, for testing, followed immediately by deactivating the
test rule again. That means even once the Boss supplies PENDING-04
evidence, a Manager would have had no tool to act on it inside the app
itself.

No migration — both RPCs and their guards (Manager-only, mandatory
`approval_note`, `INVALID_THRESHOLD`, `INVALID_WINDOW`, `REASON_REQUIRED`,
`RULE_NOT_FOUND`) already existed and were already correct. This loop is
UI plumbing plus, in one place, closing a real automated-test gap that
predates it.

**This does not resolve PENDING-04.** Nothing in the new form defaults or
suggests a threshold/window value — both inputs start empty, and
`approval_note` is required exactly so a Manager who does use this tool
still has to write down the Boss-approved basis for the numbers they
typed in. The page's own copy says as much.

### UI

New `/recurrence-rules` page (added to nav as "Recurrence"), staff-visible
to read (matches `recurrence_rules_select`'s existing `is_staff()` RLS),
Manager-only to act on (matches both RPCs' `is_manager()` guard —
`CreateRecurrenceRuleForm` is only rendered for a Manager at all, not
merely disabled, since an Executive has zero ability to call
`create_recurrence_rule`). `RecurrenceRuleCard` lists every rule
(active and inactive, so a Manager can see history) with a
Manager-only activate/deactivate toggle that always demands a reason,
matching the audited-not-deleted discipline this project has used for
every prior test rule.

### Live verification (staff JWT, role switch at the top level)

| Step | Result |
|---|---|
| Manager creates a rule via `create_recurrence_rule` | succeeds |
| Executive calls `set_recurrence_rule_active` on it | `FORBIDDEN` |
| Manager deactivates it | succeeds |
| `recurrence_rules` where `is_active` afterward | 0 (PENDING-04 invariant intact) |

### After Loop 16's server/client boundary lesson

Re-scanned every `"use client"` file in the app (34 files now, two new:
`create-recurrence-rule-form.tsx`, `recurrence-rule-card.tsx`). Clean.

### Tests

`set_recurrence_rule_active` had **zero automated coverage** before this
loop — only the ad-hoc live verification runs referenced above, never
written down as a regression test. Added 3 `it()`s to
`recurrence-capa.test.ts`: Manager-only, `REASON_REQUIRED` +
`RULE_NOT_FOUND`, and a real toggle observed via a follow-up `select`.
Every test rule created is deactivated again within the same test.
`create_recurrence_rule`'s own guards were already covered and were not
duplicated. Suite is now **101 tests across 16 files**.

### Verified

`tsc`, `lint`, `build` clean (new `/recurrence-rules` route compiles).
Live-verified against Supabase project `maavrlqkdrisjwzhjdgg` before
shipping (table above).

## Loop 24 — 2026-09-07

Fourth loop of the Loops 21-25 batch. §16.2's own text names the exact
capability this loop closes: "V1 may record: ... explicit Stores/reference
identifiers ... When Stores truth is unavailable, use an explicit status
such as `STORES_REFERENCE_PENDING`."

### §16.2 explicit Stores reference identifiers

`spare_requests.stores_reference_status` and `spare_usage.
stores_reference_status` have existed since Loop 1 (`not null default
'STORES_REFERENCE_PENDING'`) alongside a nullable `stores_reference_id` on
both — exactly the seam §16.2 describes. No RPC had ever written to
either: every request/usage row created since Loop 8 sits at the default
forever, because nothing could change it. "V1 may record ... explicit
Stores/reference identifiers" described a capability that did not exist.

Migration `0023_maintenance_spare_stores_reference.sql`: two new RPCs,
`set_spare_request_stores_reference` and `set_spare_usage_stores_reference`
(staff-only, mandatory status, optional reference id and reason). Neither
column carries a `check` constraint, unlike almost every other status
column in this schema (`recurrence_flags.status`, `capa_links.status`) —
read as a deliberate signal, not an oversight, that the real status
vocabulary is Stores' own to define once Phase-3 integration exists. So
these RPCs accept whatever status text a Maintenance staff member is told
by Stores rather than constraining it to a set this migration would have
had to invent.

### Live verification (staff JWT, role switch at the top level)

| Step | Result |
|---|---|
| New spare request, before any update | `STORES_REFERENCE_PENDING` / `null` |
| A signed-out-of-staff caller (`sub` = random uuid) calls the RPC | `FORBIDDEN` |
| Staff sets status + reference id | row updated exactly as sent (`STORES_ISSUED` / `PO-1234`) |
| Empty status string | `STATUS_REQUIRED` |
| Unknown request/usage id | `SPARE_REQUEST_NOT_FOUND` / `SPARE_USAGE_NOT_FOUND` |

### UI

`spares-panel.tsx`: every spare request and usage row now shows its
current Stores status and reference id, and a staff-only inline
status + reference-id + Update control (new `isStaff` prop, wired from the
page's existing `isStaffRow` check — deliberately not gated on
`isManager`, since this is plain data entry like `asset_ref`/`outcome`,
not a §3.3 financial-authority decision).

### After Loop 16's server/client boundary lesson

Re-scanned every `"use client"` file in the app. Clean.

### Tests

`tests/spares.test.ts`: 5 new `it()`s — the default-on-creation value, both
RPCs' staff-only + `STATUS_REQUIRED` guards, a successful update on each
table, and the not-found guard on both. Suite is now **106 tests across
16 files**.

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` before shipping (table above).

## Loop 25 — 2026-09-07

Fifth and last loop of the Loops 21-25 batch. Different sweep this time:
every `alter table maintenance.<t> enable row level security` (26 tables)
cross-referenced against every test file's table/RPC references, looking
for RLS-enabled tables with **zero automated coverage anywhere**. Three
came back genuinely untested: `observations`, `clearances`, `audit_log`.

### A real defect found while live-verifying `clearances`, not just a coverage gap

Live-checking the policy before writing a test (never trust an RLS
assumption without checking it live — the standing discipline since
RISK-13/15) turned up:

```
clearances_insert: with check (is_staff() AND sent_to_qc_by = auth.uid())
```

This let **any staff member insert a `clearances` row directly for any
case in any status** — completely bypassing `send_to_qc`'s own guard
(`if v_status <> 'TECHNICALLY_RESTORED' then raise INVALID_OPERATION`).
Verified live: a direct insert against a case still sitting at `REPORTED`
(never even acknowledged) succeeded, creating a `decision = 'PENDING'`
clearance row with no case-status check at all.

**Not live-exploitable as a lifecycle bypass** — `qc_decision(CLEARED)`
still calls `transition_case(..., 'MAINTENANCE_RELEASED')`, and that
RPC's own `status_transitions` graph check rejects the edge from anything
but `TECHNICALLY_RESTORED`/`CLEARANCE_PENDING`, so the orphaned row was
inert on its own (confirmed: the test case's status stayed `REPORTED`
after the direct insert). But it is exactly the "server-side enforcement
gap on a locked boundary" class of bug CLAUDE.md names explicitly, and
the same shape Loop 8 already fixed once in this schema for
`spare_requests`/`spare_usage` — a direct-insert policy letting a client
set fields a dedicated RPC was supposed to gate.

Migration `0024_maintenance_clearances_rpc_only.sql`: `clearances_insert`
is now `with check (false)` — RPC-only, matching every other
financially/audit-sensitive table in this schema.

### Live verification

| Step | Result |
|---|---|
| Direct insert as staff, before the fix | succeeded on a `REPORTED` case (no status check) |
| Direct insert as staff, after the fix | RLS violation (`42501`) |
| `send_to_qc` (SECURITY DEFINER, bypasses RLS) after the fix | unaffected — full flow re-verified end to end |

### `observations` and `audit_log` — coverage gaps only, policies already correct

Both tables' RLS (staff-only select, staff-and-self insert on
`observations`; staff-only select and **no insert policy at all** on
`audit_log`) were already correct since Loop 1/2 and match the UI's own
gating (`ObservationForm` only renders when `isStaffRow`). No migration
for either — this loop closes the verification debt, not a defect.

### Tests

New `tests/observations-clearances-audit.test.ts` — 9 `it()`s across all
three tables: `observations` (non-staff insert refused, staff can
insert/read, hidden from non-staff, append-only via the Loop 18
zero-rows-not-an-error pattern), `clearances` (the fixed direct-insert
denial on a real freshly created case — not a fake-UUID FK failure,
`send_to_qc` still works post-fix, hidden from non-staff, visible to
staff), `audit_log` (staff-only read, no INSERT policy at all for anyone).
Suite is now **115 tests across 17 files**.

### Verified

`tsc`, `lint`, `build` clean. No UI changed this loop, so the `"use
client"` boundary re-scan is a formality — re-ran it anyway, clean.
Live-verified against Supabase project `maavrlqkdrisjwzhjdgg` before and
after the fix (tables above).

## Loop 26 — 2026-09-07

First loop of the Loops 26-30 batch (Boss approved: "me aage ki loops ke
liye approve kar raha hu 26 se 30"). Continued Loop 25's RLS-policy audit
method, widened: pulled every policy's live `qual`/`with_check` via
`pg_policies` for the whole `maintenance` schema in one query, and read
each one against what its own migration's comment claims it does — not
just "is there a test", but "does the policy actually match its own
documented intent."

### RISK-18 — a live-exploitable authority bypass on `case_assignments`

`case_assignments_insert` (migration 0004, Loop 3) is commented as "the
emergency direct-start path (§5.5: 'technician can start directly')...
deliberately immediate and self-service" — but its actual check,
`with check (emergency_direct_start AND technician_user_id = auth.uid())`,
never verified the target case was an actual confirmed emergency.
`emergency_direct_start` is a plain client-supplied column value on the
INSERT itself, not derived from anything server-side.

Verified live, and this one is **genuinely exploitable, not merely a
server-side gap like RISK-17**: signed in as the seeded non-staff
`technician` identity, a direct insert with `emergency_direct_start = true`
succeeded against a case whose `emergency_confirmed` was `false` (never
even claimed as an emergency), producing an `is_active = true`
`case_assignments` row. That matters because `page.tsx`'s own
`isAssignedTechnician` check is defined purely as "an active
`case_assignments` row for this technician" — and grants
`canRecordIntervention`/`canRecordSpareUsage`. So any non-staff technician
identity could self-grant intervention/spare-usage recording rights on
**any case in the system**, any time, bypassing both §5.5's staff-mediated
assignment and §6's two-step emergency confirmation gate entirely — not
via a UI button (nothing in this app's own UI ever sets
`emergency_direct_start`; `grep` found it only ever *displayed*), but via
a direct client insert, which any signed-in user can issue.

Migration `0025_maintenance_case_assignments_emergency_gate.sql`: the
policy now also requires `exists (select 1 from cases where id = case_id
and emergency_confirmed = true)`.

**Live verification, all three directions:**

| Step | Result |
|---|---|
| Technician direct-inserts `emergency_direct_start=true` on a case with `emergency_confirmed=false`, before the fix | succeeded — `is_active=true` row created |
| Same insert, after the fix | fails, `42501` RLS violation |
| Same insert, on a case genuinely taken through `claim_emergency`→`confirm_emergency` | succeeds — legitimate path preserved |
| Staff-mediated `assign_technician` (SECURITY DEFINER, bypasses RLS) | unaffected |

Logged as RISK-18, RESOLVED, in `RISK_REGISTER.md`.

### Tests

3 new `it()`s in `tests/emergency-and-notifications.test.ts` (zero prior
coverage of `emergency_direct_start`/`case_assignments` insert existed —
this path had gone untested since Loop 3): denies the self-insert on a
non-emergency case, denies impersonating a different
`technician_user_id` even on a confirmed emergency, and confirms the
legitimate path still works end to end. Suite is now **118 tests across
17 files**.

### After Loop 16's server/client boundary lesson

No UI changed this loop. Re-scanned every `"use client"` file anyway —
clean.

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` before and after the fix (table above).

## Loop 27 — 2026-09-07

Continued Loop 26's RLS-policy audit, applied to `cases_insert` — the
single most consequential insert policy in the schema, since every other
table's row exists only because a `cases` row already does.

### RISK-19 — a live-exploitable bypass of the entire §4 LOCKED lifecycle graph, at case creation

`cases_insert` (migration 0002, Loop 1) has always been
`with check (reporter_user_id = auth.uid())` — one column checked out of
the ~40 on `maintenance.cases`. Every other column, including `status`
itself, every `emergency_*` column, `qc_required`, `ptw_required`,
`current_owner_user_id`, `priority`, `closed_at`, and `closure_reason`,
was fully client-writable at INSERT time. A `default` (e.g. `status
default 'REPORTED'`) is not a constraint — a client that explicitly
supplies its own value for that column simply overrides the default.

Verified live as the seeded non-staff `technician` identity, no RPC
involved:

| Exploit attempt | Result before fix |
|---|---|
| Direct insert with `emergency_confirmed = true` | succeeded — a fake emergency, self-confirmed, with zero claim/confirm ceremony |
| Direct insert with `status = 'CLOSED'`, a fabricated `closure_reason`, and `closed_at` | succeeded — case `MC-003975`, a fully-formed "closed" case that never touched a single `status_transitions` edge or a single lifecycle RPC |

This is assessed as **more severe than RISK-18**: it needs no staff
access, no RPC, and no prior case state at all — a brand-new INSERT
statement can fabricate a fully-closed case out of nothing, with none of
the §4 LOCKED lifecycle graph's edges ever consulted and none of the
§6/§27 audit-trail RPCs ever invoked. It also meant Loop 26's RISK-18 fix
was independently circumventable on its own: fake `emergency_confirmed =
true` here first, then walk the (now "legitimate"-looking)
`emergency_direct_start` path RISK-18 just closed.

Migration `0026_maintenance_cases_insert_column_lockdown.sql` rewrites
`cases_insert` as an allow-list rather than a blacklist: `reporter_user_id
= auth.uid()` plus an explicit `is null` / `= false` / `= 'REPORTED'`
check on every other column, matching exactly the fields the real intake
form (`src/app/(app)/cases/new/page.tsx`) submits — `case_type`,
`symptom`, `area`, `line`, `asset_known`, `major_complex_flag`,
`reporter_user_id`. Because it's an allow-list, a future column added to
`maintenance.cases` is closed-by-default at INSERT until a later
migration explicitly opens it here — the same shape of gap can't
reappear silently.

**Live verification:**

| Step | Result |
|---|---|
| `emergency_confirmed = true` self-insert, after the fix | fails, `42501` RLS violation |
| `status = 'CLOSED'` self-insert with fabricated closure, after the fix | fails, `42501` RLS violation |
| Real intake payload (7 fields above only) | succeeds — lands at `status = 'REPORTED'`, `emergency_confirmed = false`, `qc_required = null`, `current_owner_user_id = null`, `closed_at = null` |
| `acknowledge_case`, `claim_emergency`, `confirm_emergency`, `transition_case`, `change_priority` | all confirmed `SECURITY DEFINER` — bypass RLS entirely, unaffected by this policy change |

Logged as RISK-19, CRITICAL, RESOLVED, in `RISK_REGISTER.md`.

### Tests

4 new `it()`s in `tests/lifecycle.test.ts`: refuses a reporter
self-setting `emergency_confirmed` at creation, refuses self-inserting an
already-`CLOSED` case, refuses self-setting `current_owner_user_id` or
`priority`, and confirms the real intake payload still succeeds and lands
at safe defaults. Suite is now **122 tests across 17 files**.

### After Loop 16's server/client boundary lesson

No UI changed this loop (RLS-only fix). Re-scanned every `"use client"`
file anyway — clean.

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` before and after the fix (tables above), including
confirming every lifecycle-mutating RPC is `SECURITY DEFINER` and
therefore unaffected by the tightened INSERT policy.

### CI fix — a real bug in Loop 26's own "impersonation" test, not a flake

PR #22's `lint-and-build` job (run on the Loop 26 commit) failed one test:
`case_assignments emergency_direct_start ... refuses a direct self-insert
claiming a different technician_user_id`. Root-caused, not re-run
blind: the test used the literal string
`"91a2fd36-5a35-4c36-8f5a-e0cd0e492f75"` as a "shape only" placeholder for
"a different technician" — but that UUID **is** the real seeded
`tech1@monarch.test` identity's own `auth.users.id` (confirmed live via
`select id from auth.users where email = 'tech1@monarch.test'`). Since
the test signs in *as* `tech1`, `technician_user_id` ended up equal to
`auth.uid()` — not impersonation at all, so the insert legitimately
succeeded and `expect(error).not.toBeNull()` correctly failed.

Fixed by using `exec.userId` (a real, different, already-signed-in seeded
identity) instead of a hand-typed placeholder UUID. Re-verified live via
`execute_sql`, replaying the exact scenario (create → `claim_emergency` →
`confirm_emergency` → attempted impersonating insert): now fails with
`42501` as intended. Lesson: a "shape only" UUID in a multi-tenant test
fixture is not risk-free — it can silently collide with a real seeded
user's id and invert what the test actually proves.
