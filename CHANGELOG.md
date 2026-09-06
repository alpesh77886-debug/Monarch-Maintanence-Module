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
