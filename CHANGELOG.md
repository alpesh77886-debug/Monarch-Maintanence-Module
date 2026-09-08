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

## Loop 28 — 2026-09-07

PR #22 (Gate 5 log + Loop 26 + Loop 27 + CI fix) merged clean — both CI
jobs green, 122 tests passing. Started Loop 28 from a fresh `main`.

Read every RLS policy in the schema in one query (`pg_policies` for the
whole `maintenance` schema) to find what, if anything, hadn't yet been
scrutinized by this batch's method. `cases`, as expected, has zero UPDATE
policy (RLS default-denies with no matching policy — direct client
UPDATE on `cases` is already impossible, confirmed, not merely assumed).
`evidence_insert`'s "any authenticated user" (broader than its own
comment says: "any authenticated user **involved**") turned out to be
already reviewed and deliberately accepted in Loop 18 — `evidence-panel.tsx`
carries a comment explaining why (reporters need to attach evidence
before any staff RPC touches the case, and `file_ref` is a reference, not
a real upload). Not a new finding.

### RISK-20 — `case_assignments` direct-insert still allows forged staff attribution

The 0025 fix (RISK-18, Loop 26) added the `emergency_confirmed` check but
only ever validated `emergency_direct_start`, `technician_user_id`, and
(now) the case's emergency state — every other column on
`case_assignments`, including `assigned_by_user_id`, stayed
client-writable on the same INSERT.

Verified live as the seeded non-staff `technician` identity, on a
genuinely confirmed emergency (real `claim_emergency`/`confirm_emergency`,
not faked): a direct insert with `assigned_by_user_id` set to the real
manager's staff id succeeded, producing a `case_assignments` row that
looks exactly like a staff-mediated assignment but is a self-service
direct-start the technician made up entirely on their own. §5.5's whole
point of the `emergency_direct_start` carve-out is that *no* staff
mediated it — a row that claims otherwise is a forged audit-trail entry
on a table §29 exists specifically to make trustworthy.

Migration `0027_maintenance_case_assignments_attribution_lockdown.sql`
adds `assigned_by_user_id is null`, `is_active = true`, and
`deactivated_at is null` to the `with_check` — the only honest state a
brand-new self-service row can start in.

**Live verification:**

| Step | Result |
|---|---|
| Forge `assigned_by_user_id = <real manager id>` on a confirmed emergency, before fix | succeeded |
| Same insert, after the fix | fails, `42501` RLS violation |
| Legitimate self-insert (no attribution fields set), after the fix | succeeds, `assigned_by_user_id`/`deactivated_at` land `null`, `is_active = true` |
| `assign_technician` (SECURITY DEFINER, the only legitimate place to set `assigned_by_user_id`) | unaffected |

Logged as RISK-20, MEDIUM, RESOLVED, in `RISK_REGISTER.md`.

### Tests

1 new `it()` in `tests/emergency-and-notifications.test.ts`: refuses a
direct self-insert that forges `assigned_by_user_id`, even on a genuinely
confirmed emergency. Suite is now **123 tests across 17 files**.

### After Loop 16's server/client boundary lesson

No UI changed this loop (RLS-only fix; confirmed via `grep` that this
app's own UI never sets `emergency_direct_start` or `assigned_by_user_id`
on a direct insert — only `assign_technician`, which is unaffected, and a
read-only display). Re-scanned every `"use client"` file anyway — clean.

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` before and after the fix (table above).

## Loop 29 — 2026-09-07

PR #23 (Loop 28) merged clean — both CI jobs green, 123 tests passing.
Started Loop 29 from a fresh `main`.

Switched angle per the recommendation from earlier gate reports: instead
of continuing to read RLS `qual`/`with_check` (exhausted across the whole
schema by Loop 28's single-query sweep), read every `SECURITY DEFINER`
RPC's own internal guards against its own documented intent. Listed all
55 `SECURITY DEFINER` functions in the schema and started with the ones
touching §3.3's named financial-authority boundary, since `CLAUDE.md`
calls the ₹12,000 rule out explicitly as LOCKED and non-negotiable.

### RISK-21 — `record_spare_usage` lets the ₹12,000 approval gate be skipped by simply not linking a request

`record_spare_usage`'s `>₹12,000` Manager-approval check (added Loop 8,
migration 0009) only runs `if p_spare_request_id is not null` — but that
parameter defaults to `NULL` and nothing required a caller to supply it.

Verified live as the seeded non-staff `technician` identity, assigned to
a case: calling `record_spare_usage` with `p_spare_request_id` omitted
succeeded outright — no request, no approval, no Manager review, for a
spare of any value. Worse: `maintenance.spare_usage` has no `spare_name`
column of its own — the *only* place a spare's name is recorded is
`spare_requests.spare_name`, reachable only via the link. An unlinked
usage row therefore isn't just unapproved, it is untraceable to any named
spare at all — an unconditional violation of §16.1 ("Spare usage
traceability is mandatory V1", chain starts with "which spare was
used"), not a judgment call or a PENDING/interpretation matter.

This is also the first finding this batch that's reachable through the
app's own shipped UI with zero adversarial effort, not just a direct API
call: `spares-panel.tsx`'s "Record spare usage" dropdown defaulted to an
explicit `(not linked to a request)` option.

Migration `0028_maintenance_spare_usage_requires_request.sql` makes
`record_spare_usage` raise `SPARE_REQUEST_REQUIRED` when
`p_spare_request_id is null`. This isn't a new business rule — §16.1's
traceability mandate already required every usage to name its spare;
the fix just makes the RPC actually enforce what the pack already locks,
closing the §3.3 financial-authority bypass as the same side effect.

`spares-panel.tsx` updated: the "(not linked to a request)" option is
gone; if a case has no spare requests yet, the usage form is replaced
with guidance to raise one first; a client-side check gives an immediate
error instead of a round trip if none is selected.

**Live verification:**

| Step | Result |
|---|---|
| `record_spare_usage` with `p_spare_request_id` omitted, before fix | succeeded — no request, no approval, unnamed spare |
| Same call, after the fix | fails, `SPARE_REQUEST_REQUIRED` |
| Linked to a real, low-value (≤₹12,000) request, after the fix | succeeds |
| Linked to a real, unapproved >₹12,000 request, after the fix | fails, `APPROVAL_REQUIRED` (unchanged, still correct) |

Logged as RISK-21, HIGH, RESOLVED, in `RISK_REGISTER.md`.

### Tests

1 new `it()` in `tests/spares.test.ts` for the `SPARE_REQUEST_REQUIRED`
rejection. 2 existing tests updated: they previously called
`record_spare_usage` with no linked request and asserted success — that
was exercising the very gap this loop closes, not a legitimate case, so
both now raise a request first and link it. Suite is now **124 tests
across 17 files**.

### After Loop 16's server/client boundary lesson

`spares-panel.tsx` (a `"use client"` file) changed this loop. Re-scanned
every `"use client"` file for stray named exports — clean, only
`export default` on the changed file, matching every prior loop's
finding.

### Verified

`tsc`, `lint`, `build` clean (one `react/no-unescaped-entities` lint
error caught and fixed — an apostrophe in new guidance text). Live-verified
against Supabase project `maavrlqkdrisjwzhjdgg` before and after the fix
(table above), including confirming the pre-existing >₹12,000
`APPROVAL_REQUIRED` path is unchanged by this fix.

## Loop 30 — 2026-09-07

Last loop of the Loops 26-30 batch. PR #24 (Loop 29) merged clean — both
CI jobs green, 124 tests passing. Started Loop 30 from a fresh `main`.

Continued the `SECURITY DEFINER` RPC audit from Loop 29, reading the
remaining ~40 functions not yet checked. Most held up: `approve_pm_plan`,
`create_pm_plan`, `link_ptw_proof`, `set_ptw_required`, `set_qc_required`,
`qc_decision`, `send_to_qc`, `transition_case`, `take_ownership`,
`find_user_by_email` all gate on server-side state or `is_staff()`/
`is_manager()`, never on a client-optional parameter the way
`record_spare_usage` did.

### RISK-22 — `record_intervention` never verified the caller was actually assigned to the case

`record_intervention`'s actor check (Loop 3, migration 0004) was
`is_staff() OR p_technician_user_id = v_actor` — comparing a
client-supplied id to the caller's own id, never checking
`case_assignments` at all. `record_spare_usage`'s own migration comment
(Loop 8, 0009) already described `record_intervention`'s intent as
"staff, or the actively assigned technician on this case" — a documented
intent the original 0004 code never actually implemented.

Two compounding problems, both live-verified as the seeded non-staff
`technician` identity with **zero assignment** to a fresh case:

1. No assignment check at all: passing `p_technician_user_id` = their own
   id succeeded outright — any signed-in non-staff user could fabricate
   an intervention on any case, assigned or not.
2. A NULL-propagation bug on top: `p_technician_user_id` defaults to
   `NULL`, and `NULL = v_actor` evaluates to `NULL` (not `false`) in SQL.
   `not (false or NULL)` is `NULL`, and PL/pgSQL's `if NULL then` does
   not raise — so simply *omitting* the parameter also silently passed
   the check, independent of problem 1.

This app's own UI (`page.tsx`'s `isAssignedTechnician`/`isStaffRow`
gating the intervention form) already got this right — this was a pure
server-side enforcement gap, exactly what §29 warns against ("the UI is
not a security boundary").

Migration `0029_maintenance_record_intervention_assignment_check.sql`
replaces the check with the same `case_assignments`-based pattern
`record_spare_usage` already established, plus a separate explicit check
that a non-staff caller still cannot claim to be a *different*
technician than themselves.

**Live verification, all four directions:**

| Step | Result |
|---|---|
| Unassigned technician, `p_technician_user_id` = own id | fails, `FORBIDDEN` |
| Unassigned technician, `p_technician_user_id` omitted (NULL-propagation variant) | fails, `FORBIDDEN` |
| Genuinely assigned technician, self-recording | succeeds |
| Genuinely assigned technician, claiming a different technician's id | fails, `FORBIDDEN` |
| Staff recording on behalf of any technician (no assignment required) | succeeds, unaffected |

Logged as RISK-22, HIGH, RESOLVED, in `RISK_REGISTER.md`.

### Tests

2 new `it()`s in `tests/assignment-and-waiting.test.ts`: an unassigned
non-staff caller is refused both with explicit self-attribution and with
the parameter omitted. The 2 pre-existing tests in the same file already
exercised assigned/self and assigned/impersonation paths correctly and
needed no changes. Suite is now **126 tests across 17 files**.

### After Loop 16's server/client boundary lesson

No UI changed this loop (the UI already gated this correctly; only the
RPC needed fixing). Re-scanned every `"use client"` file anyway — clean.

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` before and after the fix (table above).

## Loop 31 — 2026-09-07

First loop of the Loops 31-35 batch (Boss approved: "approved loops 31
to 35"). Two pieces of work, both verification rather than a code
change — a legitimate outcome, not every loop needs to ship a fix.

### 1. Finished the `SECURITY DEFINER` RPC-guard audit

Read every remaining function not yet checked in the Loops 26-30 batch
(~25 of the ~55 total): `close_false_complaint`, `complete_pm_instance`,
`create_recurrence_rule`, `decide_recurrence_flag`, `enter_waiting`,
`handover_case`, `link_pm_instance_to_case`, `mark_asset_known`,
`mark_duplicate_case`, `raise_capa`, `raise_safety_stop`,
`record_production_impact`, `record_production_not_restarted`,
`record_production_started_without_release`,
`record_recurrence_root_cause`, `record_restoration`,
`record_root_cause`, `reopen_case`, `reschedule_pm_instance`,
`resume_wait`, `run_recurrence_scan`, `set_availability`,
`verify_capa_effectiveness`. None showed the RISK-21/RISK-22 shape (an
authority or actor-eligibility gate skippable by omitting a
client-optional parameter) or any other guard mismatch against
documented intent. `handover_case`'s ownership check
(`v_current_owner is distinct from v_actor`) is worth noting as the
*correct* pattern for a nullable comparison — `IS DISTINCT FROM` instead
of `=`, which is exactly what RISK-22's old check got wrong.
`run_recurrence_scan`/`run_pm_scan` (cron-only, `EXECUTE` revoked from
every client role) were already confirmed unreachable by existing tests.

**The RPC-guard sweep is now exhausted** — every `SECURITY DEFINER`
function in the schema has been read against its own documented intent
this batch, across Loops 29-31.

### 2. Spot-check: did RISK-19/RISK-18 ever affect real data?

The Loops 26-30 gate report (§H.2) flagged that RISK-19 (CRITICAL) was
live from Loop 1 until Loop 27, and recommended checking whether any real
case ever reached `CLOSED` or `emergency_confirmed = true` without a
corresponding `case_events` trail — the signature of the gap having been
exploited, accidentally or otherwise, rather than merely present.

Ran three read-only checks against the live `maintenance` schema:

1. `cases` where `status = 'CLOSED'` with no matching `case_events` row
   from a legitimate closure path (`transition_case` or
   `close_false_complaint`).
2. `cases` where `emergency_confirmed = true` with no `EMERGENCY_CONFIRMED`
   `case_events` row (the only thing `confirm_emergency` ever writes).
3. `case_assignments` with `emergency_direct_start = true` on a case that
   is not (or was never) a confirmed emergency (the RISK-18 shape).

**Result: every row any of the three queries returned was one of this
project's own `[AUTOTEST-Lxx]`-tagged verification rows** — the exact
same rows created and already fully disclosed while live-verifying
RISK-18/19 in Loops 26-27 (`MC-003975`, `MC-003973`, `MC-003770`). No
other row matched any of the three queries. No real Boss/staff data was
ever affected by any defect fixed in the Loops 26-30 batch.

### After Loop 16's server/client boundary lesson

No UI or RPC changed this loop — pure read-only verification. No
`"use client"` re-scan needed.

### Verified

No code change to verify — both pieces of this loop were live read
queries against Supabase project `maavrlqkdrisjwzhjdgg`, not migrations.

## Loop 32 — 2026-09-07

New angle for this batch: every prior loop (26-31) audited the
*write*/authority side of RLS and RPC guards. This loop read every RLS
**SELECT** policy in the schema instead, specifically for over-broad
*read*-side exposure — a genuinely different question from "can someone
change something they shouldn't."

### Found: 4 tables are readable by ANY authenticated user, not staff-scoped

`pg_policies` for the whole schema shows 4 tables with `using (true)` on
their SELECT policy — `cases`, `evidence`, `safety_stops`,
`production_boundary_events`. Every other actor-scoped table instead
follows an `is_staff() OR <owner column> = auth.uid()` pattern
(`case_assignments`, `interventions`, `spare_requests`, `spare_usage`),
making these four an asymmetry worth naming precisely.

`cases_select`'s own migration comment (0002) says "All staff can see all
open work (§22 dashboard requirement)" — but the actual policy is
`using (true)`, which is broader than "staff": any signed-in user,
including a non-staff reporter, can currently read every case in the
system, not just their own. `evidence` was already reviewed and
deliberately accepted in Loop 18 (`evidence-panel.tsx` carries the
reasoning) — not a new finding. `safety_stops`/`production_boundary_events`
carry no comment justifying `true` at all, though it plausibly makes
operational sense open (plant-wide visibility that a machine has an
active safety stop is arguably a safety benefit, not a data leak) —
unlike `cases_select`, there's no documented intent to check this
against either way.

**Deliberately not fixed.** Narrowing any of these three would mean
guessing at PENDING-03's still-unresolved granular permission matrix
(RISK-04) rather than receiving it from the Boss — and could break a
legitimate need with no pack evidence either way (a reporter tracking
their own case, or plant-wide safety-stop visibility). Instead of
inventing an answer, `RISK_REGISTER.md`'s existing RISK-04 entry (already
OPEN, MEDIUM, tracking PENDING-03 generally) was updated with these four
concrete table names and the `cases_select` comment-vs-behavior mismatch,
so the Boss has something specific to confirm or correct rather than an
abstract "permission matrix is unresolved" note.

### After Loop 16's server/client boundary lesson

No UI or RPC changed this loop. No `"use client"` re-scan needed.

### Verified

No code change — this loop was a live read (`pg_policies`) against
Supabase project `maavrlqkdrisjwzhjdgg`, plus a documentation update.

## Loop 33 — 2026-09-07

Another new angle: with RLS (write and read side) and every `SECURITY
DEFINER` RPC guard now audited, cross-referenced three pack sections not
yet closely read against their actual implementation, similar to Loop
24's method. First checked for the smallest possible gap: trigger
functions. `information_schema.triggers` shows exactly one trigger in
the whole schema (`case_assets_mark_known` → `mark_asset_known()`,
already reviewed in this batch's RPC sweep) — that angle was exhausted
immediately.

### §24 Automation vs Human Decision — checked, clean

Read the pack's explicit AUTO / HUMAN REQUIRED / RECOMMEND-FLAG-ONLY /
NEVER AUTOMATE checklist and cross-checked the security-relevant items
against actual code:

- "auto-handover on confirmed logout when recipient exists" —
  `sign-out-button.tsx` matches §22.1 exactly (warn, then on confirm
  call `handover_all_open_cases`); "UNASSIGNED / WAITING_MAINTENANCE"
  isn't a `case_status` enum value (confirmed via the enum definition)
  so it's descriptive of the ownership state, not a status the code
  needs to set — already correctly implemented as
  `current_owner_user_id = null` with status untouched.
- "NEVER AUTOMATE: equate temporary restoration with permanent
  closure" — checked the LOCKED `status_transitions` graph live:
  `TEMPORARILY_RESTORED` only has edges to `DIAGNOSING`/`IN_REPAIR`, no
  path to `CLOSED` or any released state.
- "Recommendations may never become silent state transitions" — the
  only "recommend"-shaped seam in the schema is `raise_capa`'s
  `p_source = 'SYSTEM_SUGGESTED'` value; grepped every migration and
  confirmed `raise_capa` is never called from any scan/cron function —
  it's client-invoked by staff only, so nothing currently auto-creates
  a CAPA silently.
- "invent root cause" / "silently override safety stop" / "infer
  INTERNAL/EXTERNAL waiting from free text" / "fabricate inventory
  truth" / "fabricate financial impact" — each RPC's own mandatory,
  non-inferred parameters (`record_root_cause`'s `p_basis`,
  `enter_waiting`'s explicit `p_reason_type`, the `STORES_REFERENCE_PENDING`
  placeholder, `record_production_impact`'s required real measure) were
  re-read against this list; none violated.

### §28 Idempotency / Concurrency — checked, clean

Every operation the pack lists as requiring concurrency-safe behaviour
(Take Ownership, Accept Case, State transition, Assignment, Reopen,
Duplicate marking, Handover, Emergency confirmation) uses `select ... for
update` or an atomic `update ... where <precondition>` before mutating —
re-read each RPC's body to confirm. `take_ownership`'s
`update ... where current_owner_user_id is null` + `row_count` check is
the correct "first-valid-actor" pattern the pack's §28 names explicitly,
and it's exactly what it does. Spare request/usage posting and PM/
escalation scan generation are insert-only or cron-only with no
prior-state contention, so no race hazard applies to them.

### §37 Test Matrix — spot-checked, clean/already-disclosed

Cross-referenced the pack's required test list against `tests/`.
"Concurrent accept race" is covered
(`assignment-and-waiting.test.ts`'s "First-valid-actor ownership race").
"No available Executive/Manager" (the `handover_all_open_cases` unassign
path) has zero automated coverage — but this is not a new gap:
`handover.test.ts`'s own header comment already discloses exactly why
(the suite shares one live project; the full unassign path was verified
live via `execute_sql` once, documented in Loop 12's CHANGELOG entry) —
the same disclosed-gap pattern already used for the emergency escalation
timers and the PM/recurrence scan functions elsewhere in this project.

### After Loop 16's server/client boundary lesson

No UI or RPC changed this loop. No `"use client"` re-scan needed.

### Verified

No code change — three pack sections read closely against live schema
state (`status_transitions`, `information_schema.triggers`) and existing
source/test files, not migrations.

## Loop 34 — 2026-09-07

Continued the pack cross-reference from Loop 33, reading §8 (Observation
+ Action Continuity Journal) — a section explicitly marked "mandatory V1
feature" — closely against its implementation. Unlike Loops 31-33, this
one found a real, concrete gap: not a security bug, a materially
incomplete UI.

### `observation-form.tsx` only exposed 4 of the 9 fields §8 requires per entry

§8's canonical structure is `OBSERVATION → ACTION → RESULT → CURRENT
CONDITION → PENDING ACTION → BLOCKER → NEXT STEP`, and its "each entry
records" list adds two more: an intervention/step reference and an
evidence/reference where applicable. `maintenance.observations` has
carried all 9 corresponding columns since Loop 1
(`intervention_id`, `observation`, `action`, `result`,
`current_condition`, `pending_action`, `blocker`, `next_step`,
`evidence_ref`) — but `observation-form.tsx` only ever had inputs for 4
of them (`observation`, `action`, `current_condition`, `next_step`).
`result`, `pending_action`, `blocker`, `intervention_id`, and
`evidence_ref` were silently unreachable through the app since the
feature was first built — every journal entry ever created through this
app has those five columns permanently `NULL`, even though the display
side (`page.tsx`'s "Observation + Action Continuity Journal" section)
was already correctly rendering `result`/`pending_action`/`blocker` (just
never had anything to show).

This was never an RLS problem — `observations_insert`'s `with check
(is_staff() and actor_user_id = auth.uid())` never restricted which
columns could be set, confirmed live before writing any code. It was
purely a UI completeness gap on a pack section explicitly marked
mandatory, not a PENDING/authority question — nothing here needed
inventing, every field name and meaning was already locked by the
existing schema and pack text.

**Fix:**
- `observation-form.tsx`: added `Result`, `Pending action`, `Blocker`,
  and `Evidence reference` inputs, plus an optional "Related
  intervention" dropdown (only rendered when the case has interventions)
  populated from data `page.tsx` already fetches.
- `CaseObservation` type (`database.types.ts`): added the two fields
  (`intervention_id`, `evidence_ref`) it was missing, matching the table
  since Loop 1.
- `page.tsx`'s journal display: now also shows the linked intervention's
  `action_taken` (via a lookup against the case's own interventions) and
  the evidence reference, when present.

Live-verified the full 9-field insert against the real schema before
writing the test — confirmed the exact same payload the form now sends
round-trips correctly, including a real `intervention_id` from
`record_intervention`.

### Tests

1 new `it()` in `tests/observations-clearances-audit.test.ts`: inserts
all 9 canonical fields (including a real intervention link) and asserts
every one round-trips, closing the gap the existing 4 observations tests
(RLS-focused, Loop 25) never exercised. Suite is now **127 tests across
17 files**.

### After Loop 16's server/client boundary lesson

`observation-form.tsx` (a `"use client"` file) changed this loop —
re-scanned every `"use client"` file for stray named exports, clean
(only `export default`).

### Verified

`tsc`, `lint`, `build` clean. Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` (the full 9-field insert, matching what the form
and the new test both send) before writing any UI or test code.

## Loop 35 — 2026-09-07

Last loop of the Loops 31-35 batch (Boss approved: "approved loops 31 to
35"). Continued the pack cross-reference started in Loops 33-34: read §15
(Safety/Technical Stop) closely against `raise_safety_stop`
(`0015_maintenance_production_boundary.sql`, Loop 13).

### `raise_safety_stop` never sent the notification §15 says is mandatory

§15: "Immediate Production Manager notification is mandatory" for a
safety/technical stop. Live-verified before writing any fix: 271 real
stops have been raised in this project's history via `raise_safety_stop`,
and **zero** notifications of any type were ever tied to any of them —
`SAFETY_STOP_RAISED` wasn't even a member of
`notifications_notification_type_check`. `lift_safety_stop` and the
§13.1/§13.2 boundary-recording functions were unaffected; this was
specific to the raise path.

This module has no Production Manager account to notify — Production is
a separate, not-yet-built module (per CLAUDE.md's repository forensics),
and §3.1 locks Maintenance to exactly two roles
(`MAINTENANCE_EXECUTIVE`, `MAINTENANCE_MANAGER`). Migration 0015 already
solved this exact problem for the closely related §13.1 breach
notification (`record_production_started_without_release`, same file):
notify every active `MAINTENANCE_MANAGER` instead, reasoning "Managers
are the escalation authority (§3.2)". `raise_safety_stop` — one function
above that one in the same file — never got the same treatment. Not a
security/authorization bug (the stop itself was always correctly
recorded and gated); a mandatory notification requirement that was
simply never wired up.

**Fix:** Migration 0030 adds `SAFETY_STOP_RAISED` to the notification
type constraint and updates `raise_safety_stop` to loop over active
Maintenance Managers and notify each, exactly matching the 0015
precedent's pattern and message style. No change to the authorization
checks, the stop record itself, or `lift_safety_stop`.

Live-verified end to end against the real Supabase project before
writing the test: created a real case as the seeded executive, called
`raise_safety_stop`, and confirmed the seeded manager (`mgr1@monarch.test`)
received exactly one `SAFETY_STOP_RAISED` notification referencing the
real case number, stop type, and reason.

### Tests

2 new `it()`s in `tests/production-boundary.test.ts`: the manager
receives the notification on a legitimate raise; a correctly-refused
non-staff attempt sends none. Suite is now **129 tests across 17 files**.

### Local test-run limitation (disclosed, matches the RISK-05/Loop 11
precedent)

This sandbox's egress policy denies the CONNECT tunnel to
`maavrlqkdrisjwzhjdgg.supabase.co` outright (`gateway answered 403`,
confirmed via the proxy's own status endpoint) — `npx vitest run` cannot
reach the project from here at all, the same limitation Loop 11
disclosed for the Playwright e2e specs. The fix and the new tests were
therefore verified two ways instead of a local `vitest run`: (1) the
live SQL walkthrough above, run through the Supabase MCP connection
(which is not subject to this sandbox's HTTP egress policy), and (2) the
CI `lint-and-build`/`e2e` jobs on the PR, which do have real network
access. No change touched a `"use client"` file, so no boundary re-scan
was needed this loop.

### Verified

`tsc`, `lint`, `build` clean (all three run locally; none require
Supabase network access). Live-verified against Supabase project
`maavrlqkdrisjwzhjdgg` as described above. CI is the source of truth for
the actual `vitest run` result on this PR, per the disclosed limitation.

## UI redesign — 2026-09-07 (Boss-directed, outside the loop-batch cadence)

Gate 7 (Loops 31-35) is AWAITING BOSS — autonomous loop-batch engineering
stays paused. This is a separate, explicit Boss-directed task ("UI design
sudharo... buttons thik karo, design karo, navigations thik karo"), shown
against 8 reference CMMS screenshots. Presentation-only, matching the
Loop 21 precedent: no migration, no RPC, no RLS, no business-rule change
— every screen still calls exactly the same queries/RPCs it did before.

### What was actually wrong

Reading the app against the references: the top nav was a single cramped
row of plain text links with no active-state, no icons, and no mobile
affordance at all — a real gap against §30's "mobile-first... common
actions possible with minimal navigation" requirement, which this repo
had never actually built toward on the navigation surface itself. Buttons
were also ad hoc across ~30 files — every panel invented its own color/
radius/shadow with no shared component, so the app read as visually
inconsistent even though each individual screen was internally fine.

### New shared design system

- `src/components/ui.tsx`: `Button` (variants: primary/secondary/danger/
  warning/success/ghost; sizes sm/md), `LinkButton`, `Badge`, `Card` — pure
  presentational primitives, no logic, every existing `onClick`/`disabled`/
  `type` prop forwarded unchanged everywhere they're used.
- `src/app/(app)/app-nav.tsx`: a single default-exported `AppNav` (the
  Loop 16 boundary lesson — one export, not two — see below) rendering
  both a fixed bottom tab bar (mobile, `md:hidden`) and a left icon-rail
  (`hidden md:flex`) from one shared nav-item list with active-state
  highlighting via `usePathname`. The bottom bar is the primary/default
  surface — §30 explicitly forbids designing desktop-first and shrinking
  it, so the rail is an additive enhancement at `md:`, not the base design.

### Applied across the app

`layout.tsx` (new compact top bar + `AppNav`), `login/page.tsx`,
`cases/page.tsx` (list + report button), `cases/new/page.tsx`,
`cases/[id]/page.tsx` (header badges, all bottom sections now `Card`s),
`sign-out-button.tsx`, `notification-bell.tsx` (icon bell replacing a
text button), `availability-toggle.tsx`, and all ~28 case-detail panel/
form components — every raw `<button>` with an ad hoc className swapped
for `<Button variant=.../>`, preserving each button's exact behavior.
PM and recurrence-rule cards/forms got the same treatment.

### Verified

`tsc`, `lint`, `build` all clean. Full `"use client"` boundary re-scan
(every file, not just touched ones) — clean, one export each. Screenshotted
`/login` locally (desktop 1280×800 and mobile 390×844 via Playwright
against the dev server) since it needs no Supabase call — renders
correctly in both. Every other route requires a real sign-in, which this
sandbox still cannot do (RISK-05's disclosed Supabase egress block, hit
again by a direct Chromium subprocess check this loop — the block is at
the sandbox's outbound network layer, so it applies the same way whether
the target is `localhost` or a live Vercel preview). Full authenticated
visual verification is therefore a CI/Vercel-preview/manual-device check,
same disclosed limitation as every prior UI loop in this project.

## Performance — app load/navigation latency — 2026-09-07

Boss-directed, outside the loop-batch cadence (Gate 7 remains AWAITING
BOSS): *"application ki load hone me aur navigate hone me bahut time le
rahi hai... even form and button bhi action me time le rahe hai... solve on
priority... 3 loop me check karo, test and solve."* Structured as three
loops — 36 diagnose, 37 fix, 38 verify. Presentation/infrastructure only:
no migration, no RPC, no RLS policy, no lifecycle rule, no authority
boundary was touched. Every query below is byte-for-byte the same query it
was before; only *when* it is issued changed.

### Loop 36 — diagnose (measure first, guess never)

The database was ruled out before anything was changed. `explain analyze`
on the case-list query against the live project returned **Execution Time
6.783 ms**, Planning 10.895 ms, using `Index Scan Backward using
cases_created_at_idx`; the newest case carried 1 event, 0 observations,
0 interventions. There is no slow query and no missing index. Three real
causes were found instead:

| # | Root cause | Evidence |
|---|---|---|
| 1 | Vercel functions ran in `iad1` (Washington DC); Supabase is in `ap-southeast-1` (Singapore) | deployment `regions: ["iad1"]` vs `get_project` region |
| 2 | Every server page issued its reads strictly one after another — 24 sequential round trips on case-detail, plus 3 in the layout and 1 in middleware, ≈28 per navigation | app-wide `Promise.all` count was **0** |
| 3 | Every button calls `router.refresh()`, which re-runs the whole server page — so button latency *is* page latency | 33 call sites |

Cause 1 multiplies cause 2: ~28 sequential trips, each crossing a
continent and back, is where the wall-clock went. Cause 3 is why forms and
buttons felt as slow as a fresh page load — because they *were* a fresh
page load.

### Loop 37 — fix

- **`vercel.json` (new)** — `"regions": ["sin1"]`, putting the functions in
  Singapore next to Supabase. This is the single largest change: it cuts
  the per-round-trip latency for *all* ~28 trips at once, including the
  middleware and layout trips no page-level change can touch.
  Deliberately **not** done with the `preferredRegion` route segment
  export: per the bundled Next.js docs in `node_modules/next/dist/docs/`,
  `preferredRegion` is deprecated in this version and on Vercel accepts
  only `'auto' | 'global' | 'home'` — passing a region code like `'sin1'`
  there throws. Region pinning belongs in `vercel.json`.
- **`cases/[id]/page.tsx`** — 24 sequential awaits collapsed into 2
  parallel waves. Wave 1 issues the 22 mutually independent reads together;
  wave 2 issues the only 2 genuinely dependent reads (the staff row needs
  `user.id`, the duplicate's case number needs `caseRow`) together.
- **`layout.tsx`** — staff row + unread notifications in one wave. Highest
  leverage after case-detail because this layout wraps *every* page, so its
  round trips are paid on every single navigation.
- **`dashboard/page.tsx`** (cases + staff + overdue PM), **`kpi/page.tsx`**
  (10 aggregate reads in one wave), **`pm/page.tsx`**, and
  **`recurrence-rules/page.tsx`** — same treatment.

`src/proxy.ts` was read and deliberately left unchanged. It calls
`supabase.auth.getUser()` on every request, which is one more round trip
than `getSession()` would be — but `getUser()` validates the JWT
server-side and `getSession()` does not. Security over speed, per
`CLAUDE.md`. That middleware refresh is also what makes the parallel waves
safe: the access token is refreshed one layer *above* the page, so the
concurrent queries cannot race a token refresh or run on a stale token.

### Honest cost of the change

On a URL whose case id does not exist, all 22 wave-1 queries now run before
`notFound()`, where previously only the `cases` lookup ran. That is extra
work on a 404 path — every one of those queries is an indexed `case_id`
lookup returning zero rows, RLS still applies to each, and no data is
exposed that wasn't already scoped. It is a real (small) cost of
parallelising, recorded here rather than glossed over.

`router.refresh()` (cause 3) was **not** separately rewritten. It is the
correct primitive for a server-rendered mutation, and after causes 1 and 2
the page it re-runs is itself much cheaper — a refresh now costs ~2 parallel
waves at Singapore latency instead of ~28 sequential cross-continent trips.
Whether that is sufficient is a Loop 38 measurement, not an assumption.

### Verified

`tsc`, `lint`, `build` all clean. Full `"use client"` boundary re-scan
across all 35 client files — zero stray non-default exports (the Loop 16
lesson). Destructuring order re-checked against promise order by hand as
well as by `tsc`. Live authenticated timing from inside this sandbox
remains impossible (RISK-05's disclosed Supabase egress block); CI and the
deployed Vercel function region are the sources of truth, checked in
Loop 38.

### Loop 38 — verify (measured, not assumed)

**1. Did the region actually change?** This was the real unknown — a Vercel
plan can reject a non-default region, and a `vercel.json` that is silently
ignored looks identical to one that worked. Read back from the deployed
preview for commit `c99bf5c`:

```
preview    dpl_8XB3oEzCcNnKkXFU3GL4Fd7bLkLe  regions: ["sin1"]  READY
production dpl_Fh26fRFAsVF1oFNXZR6QbUtgCrHQ  regions: ["sin1"]  READY
```

Confirmed accepted, not assumed — and confirmed on **production**, not
just the preview: that second deployment is the one aliased to
`monarch-maintenance-module.vercel.app`, i.e. the app the Boss actually
opens. It went out on the merge of PR #34.

**2. Did it get faster?** The CI e2e job is the only authenticated,
end-to-end timing available (RISK-05 blocks live timing from the build
sandbox). Important caveat, stated up front so the number is not
over-claimed: **CI builds and runs the app on a US GitHub runner, so
`vercel.json`'s region has zero effect there.** The CI delta therefore
measures *only* the parallelisation (cause 2), not the region
co-location (cause 1). Cause 1's benefit shows up only on the live app.

Three green runs before the fix and three after were used, rather than
one of each, so the result could be checked against real run-to-run
spread instead of a single pair:

| CI run | commit | | `npm run test:e2e` | `npm test` (vitest, control) |
|---|---|---|---|---|
| #107 | `5356d31` | before | 147 s | 205 s |
| #110 | `5a5fd31` | before | 125 s | 174 s |
| #111 | `3d6d732` | before | 156 s | 172 s |
| #112 | `c99bf5c` | **after** | **66 s** | 218 s |
| #113 | `6b7612a` (main, merged) | **after** | **80 s** | 151 s |
| #114 | `600f88c` | **after** | **72 s** | 141 s |

E2E before: 125–156 s (mean 142.7). After: 66–80 s (mean 72.7). The two
ranges **do not overlap at all** — even the slowest post-fix run is 36%
faster than the fastest pre-fix run. Mean improvement **49%**. Runs #113
and #114 overlapped in time by 13 seconds, hitting the same shared live
Supabase project concurrently, and still landed at 80 s and 72 s.

**Correction to the first reading of this data.** When only run #112
existed, its vitest control read 218 s — the slowest of the four runs
then available — and that was written up as "the control got slower while
e2e halved, which rules out a fast-runner day." With three post-fix runs
in hand that claim does not hold: the control came in at 218, 151 and
141 s against a pre-fix 172–205 s, i.e. **noisy and overlapping in both
directions**, with two of the three post-fix values *below* the entire
pre-fix range. 218 s was ordinary variance, not a signal. The correct
statement is the weaker and simpler one: vitest exercises the RPCs
directly and never renders a page component, so the parallelisation
cannot affect it — and measured across three runs it indeed shows no
consistent movement either way. The e2e result stands on its own
separation of ranges, not on that control.

**3. Any functional regression?** No. 129 vitest tests and 8 Playwright
e2e specs all green on `c99bf5c` — the same suites that caught two real
self-inflicted regressions during the UI redesign the day before.

**Still open / not claimed:** the live end-user improvement from the
region move (cause 1) has not been measured, only its deployment
confirmed — the sandbox cannot reach the app to time it, and the CI
harness structurally cannot show it. The expected direction is clear
(functions and database now in the same region instead of opposite sides
of the planet) but the magnitude is unverified here and is honestly a
device-side check. Whether `router.refresh()` (cause 3) still feels slow
after both fixes is the same kind of open question.

## Forensic remediation — P0/P1/P2 fix pack — 2026-09-07

Boss-supplied brief ("MONARCH Maintenance — Forensic Remediation Prompt"),
executed in its own prescribed order: Phase 1 reconnaissance (no edits), Phase 2
authority model, Phase 3 minimal fixes, Phase 4 red-team tests. Delivered
`FORENSIC_REMEDIATION_RECON.md`, `AUTHORITY_MATRIX.md`,
`LIVE_DATA_FORENSIC_REPORT.md`, `FORENSIC_REMEDIATION_FINAL.md`.

Live database state was treated as authoritative over migration files
throughout — a migration can be superseded, so every policy, function,
transition edge and row count below was read back from the live project.

### F-01 (CRITICAL) — QC decision authority — RISK-23

`qc_decision` guarded only on `is_staff()`. Any Executive or Manager could
clear or reject their own QC gate; the loop
`Maintenance → send_to_qc → Maintenance → CLEARED` was reachable. Forbidden by
§1, §43.8 and §19.15 — not an interpretation.

Two adjacent controls were checked first and found correct, so the fix stayed
surgical: `send_to_qc` (staff + `TECHNICALLY_RESTORED`) is contract-correct per
§12, and `transition_case`'s direct release edge is properly gated on
`qc_required` being explicitly `false`. Only the actor check in `qc_decision`
was wrong.

Migration 0031 adds `maintenance.qc_authority` — an explicit, **empty by
default**, service-role-granted allowlist. `qc_decision` refuses any staff
identity *first and unconditionally*, then requires an active grant, so the
loop cannot be recreated even by granting a Maintenance member. It also now
writes an `audit_log` row; the 0007 version wrote none, leaving the QC actor out
of the audit trail entirely.

Live-verified against four real identities — Executive and Manager both
`FORBIDDEN … does not own QC clearance`, ungranted non-staff
`FORBIDDEN … granted QC authority`, granted QC identity through both gates.

**Deliberate open consequence, stated rather than buried:** the allowlist is
empty, so QC-required cases now stop at `CLEARANCE_PENDING` until the Boss names
the real QC identities. Fail-closed by design. The QC-not-required path is
untouched.

### F-02/03/04 (HIGH) — read scope — RISK-24

Four SELECT policies were `USING (true)`: `cases`, `evidence`, `safety_stops`,
`production_boundary_events`. Any authenticated account — including one with no
staff row — could read the whole plant's work list, all evidence, all
safety-stop reasons and all production-boundary detail.

This was first surfaced in Loop 32 and **deliberately deferred** then, logged
against RISK-04 pending PENDING-03's permission matrix. The brief reframed it
correctly: least privilege does not need the full matrix, only the scopes the
pack already backs. That earlier deferral was the wrong call and is recorded as
such.

Migration 0032 applies one derived predicate — staff (all cases, §22 dashboard),
reporter (own case, §5/§7), assigned technician (assigned case, §3.1) — the same
shape `case_assignments_select`/`interventions_select` already used. Child
tables inherit via `can_read_case()`. **Write policies untouched**:
`safety_stops` and `production_boundary_events` remain RPC-only.

Live-verified by row counts per identity: an unrelated authenticated identity
went from 7,592 / 211 / 355 / 138 to **0 / 0 / 0 / 0**; staff unchanged;
assigned technician still sees their own work.

One reading correction: `tech1` seeing all 211 evidence rows first looked like a
leak. A direct check showed `evidence_tech_must_not_see = 0` — every row
genuinely belongs to a case that identity reported or is assigned to. The
discriminating negative is the unrelated identity's zero.

### F-05 (HIGH) — test contamination — real, but the opposite shape

Live audit: **7,592 cases, of which 7,284 vitest-tagged, 291 e2e-tagged, 17
loop-verification-tagged, and exactly 0 untagged.** There is no production data
and never has been — nothing operational was polluted, lost or mixed.

The mechanism is nevertheless a genuine defect: one Supabase project serves both
the deployed app and CI. A dedicated test project is a spend decision, so the
available fix is the brief's preference 5 — explicit environment tagging. Both
suites now refuse to run unless `MAINTENANCE_TEST_WRITES_OK=1` is set; CI sets
it. A developer who later points this at a real production project gets a hard
failure instead of silent contamination. **No data was deleted** — deleting
7,592 rows from a database with zero real records solves nothing.

### F-06 (MEDIUM) — anomalies classified, no history rewritten

Four anomalous rows found; all classified against the migration timeline and
tested for reproducibility. Three are not reproducible: the `CLOSED`-without-
release row is Loop 27's own RISK-19 exploit proof (0026 closed that path), the
`MAINTENANCE_RELEASED`-without-restoration row is the RISK-11 regression 0012
fixed, and 151 unlinked spare usages all predate 0028 by minutes.

**New finding not on the brief's list:** 2,686 cases have zero `case_events`
**and** zero `audit_log` rows, and this **is** reproducible — case creation is a
direct client insert, not an RPC, so nothing writes an event or audit row until
someone acts on the case. Reported, not fixed: whether case creation is a
"material action" under §43.3 is a contract reading for the Boss.

### F-07 (MEDIUM) — stale vocabulary was the smaller half of the problem

The live enum has neither `WAITING` nor `QC_PENDING`, and `cases/page.tsx` was
already correct — the stale keys survived in exactly one file. The real defect
was the mirror image: because those two dead keys occupied the dashboard's
colour map, the eight statuses that *do* exist but were missing
(`ACKNOWLEDGED`, `NEEDS_INFORMATION`, `TEMPORARILY_RESTORED`,
`TECHNICALLY_RESTORED`, `CLEARANCE_PENDING`, `QC_REJECTED`,
`MAINTENANCE_RELEASED`, `REOPENED`) all rendered in the same grey as
`REJECTED`/`DUPLICATE`. All 16 enum values are now mapped.

### F-08 (MEDIUM) — hardening, with honest severity

Migration 0033 pins `search_path` on `is_staff()`/`is_manager()`. Reported
honestly: this was **not** an open bypass — both are SECURITY INVOKER, their one
call is schema-qualified, and the callee is already SECURITY DEFINER with a
pinned path; an attacker would need `CREATE` on the schema. Fixed because it is
free. The Supabase advisor now no longer reports
`function_search_path_mutable`.

Leaked-password protection is **still disabled** — the MCP surface exposes no
auth-config write tool, so it needs a dashboard toggle. The
`idempotency_keys` "RLS enabled, no policy" INFO is correct by design (no policy
= no client access; only SECURITY DEFINER RPCs touch it) and is documented
rather than "fixed".

### F-09 (MEDIUM) — three indexes, not twenty

Only `evidence`, `capa_links` and `case_assets` gained a `case_id` index — the
only tables the case-detail page actually filters by `case_id` that lacked one.
`notifications` (3,089 rows), `idempotency_keys` and `pm_instances` also lack
one and deliberately keep it that way: they are not filtered by `case_id`
anywhere, and indexing them would be exactly the "blindly index every FK" the
brief warns against.

### F-10 (MEDIUM) — already measured

Handled earlier today; `explain analyze` showed 6.783 ms and the real costs were
region and sequential queries. Residual app-side aggregation on the dashboard is
documented as a scale risk, deliberately not folded into a security fix.

### Verdict

**NOT READY** — see `FORENSIC_REMEDIATION_FINAL.md` §16. Three blockers, none of
them unfinished engineering: the QC allowlist is empty, production and CI share
one database, and leaked-password protection is off. Each needs a Boss decision
or credential. The security posture is materially better than before this work;
that is a separate question from being operable on real data.

### Verified

`tsc`, `npm run lint`, `npm run build` all clean. Full `"use client"` boundary
re-scan across 35 client files — clean. 15 new regression tests in
`tests/forensic-authorization.test.ts`; the QC scenario test updated to use the
QC identity. Suites cannot run in this sandbox (RISK-05 egress block) — CI is
the source of truth.

### Forensic remediation — two self-inflicted defects, caught by CI (migration 0034)

The first CI run on the remediation PR failed 5 of 143 tests. Both real
failures were introduced by the remediation itself, and both are recorded here
because one of them exposes a genuine weakness in how 0031 was verified.

**(1) `qc_decision` could never actually complete.** `qc_decision` correctly
admitted only a QC-authority identity, then called `transition_case` — whose
own first line is `if not is_staff() then raise FORBIDDEN`. A QC identity is
deliberately *not* staff, so every real QC decision failed. Three tests caught
it, including the pre-existing Scenario B test that has passed since Loop 5.

**Why the live probe missed it, stated plainly:** the four-identity probe used
a *non-existent* clearance id, on the reasoning that reaching
`CLEARANCE_NOT_FOUND` proves the authority gates opened. It does — but it stops
exactly one step before the transition, so it verified the gates and nothing
past them. A probe that only exercises the refusal path cannot tell you the
success path works. The test suite caught what the probe could not.

Fixed in 0034 by granting the QC identity exactly the two transitions that
*are* the QC decision — `CLEARANCE_PENDING → MAINTENANCE_RELEASED` and
`CLEARANCE_PENDING → QC_REJECTED` — and nothing else. Every other transition
stays staff-only, and a second check after the status is read refuses a QC
identity on any case not actually in `CLEARANCE_PENDING`, so it cannot skip
the clearance record.

Re-verified end to end this time, on a real case with a real clearance:
`CLEARANCE_PENDING` → Executive refused → QC identity **SUCCEEDED** → case
reached `MAINTENANCE_RELEASED` → exactly 1 audit row with the QC actor → and
the same QC identity was still refused when it tried to `CLOSED` a case.

**(2) Tightening `cases_select` silently broke `case_assignments_insert`.** The
RISK-18 fix (0025) gated the emergency self-insert on
`exists (select 1 from cases where … emergency_confirmed)`. That subquery is
evaluated **as the inserting user**, so it was itself subject to
`cases_select`. While that policy was `USING (true)` the coupling was
invisible; once 0032 scoped case reads, a technician who is neither reporter
nor already assigned could no longer see the case, the `EXISTS` returned false,
and the legitimate emergency self-insert was refused.

This is the general hazard worth recording as a standing lesson for this repo:
**an authorization check must never depend on the actor's read visibility**, or
narrowing a SELECT policy silently narrows a WITH CHECK policy somewhere else.
0034 moves the check into a SECURITY DEFINER helper
(`case_is_confirmed_emergency`) so it answers the same question regardless of
who is asking. Authority is unchanged — the RISK-18 emergency gate and the
RISK-20 attribution pins both still hold.

Verified live in all four directions: the technician still cannot *see* the
case (0032 holds), still *can* self-insert on a confirmed emergency (0034
fixes it), still *cannot* self-insert on a non-emergency case (RISK-18 holds),
and *can* see the case once assigned (0032's assignee branch works).

**(3) One failure was not reproduced and is not claimed as fixed.**
`observations-clearances-audit.test.ts > audit_log is staff-only to read`
failed inside `driveToInRepair`. The same helper, same identity and same insert
passed twice elsewhere in the same file in the same run, and a direct SQL probe
of that exact insert-and-read-back as the Executive identity succeeded. The run
also coincided with PostgREST reloading its schema cache after three migrations
added a table and several functions. That is consistent with a transient, but
it is recorded as *unexplained* rather than dismissed as a flake; if it recurs
on the next run it will be root-caused properly rather than re-run again.

3 new regression tests cover the two real defects.

## Loop 36 — 2026-09-07

**Summary:** Completed the forensic brief's Phase 4 red-team matrix as a
permanent regression suite. **No new defects found** — all 17 attacks were
already refused server-side.

**Requirements affected:** §29 (authorization enforced at the backend
boundary), §3.3 (₹12,000 LOCKED financial authority), §4 (LOCKED lifecycle
graph), §6 (emergency two-step), §12 (QC ownership).

**Why this loop:** the remediation brief listed a red-team matrix under Phase 4,
but only two slices of it were actually exercised there — QC authority and read
scope. The rest (lifecycle mutation, assignment, safety stop, emergency
confirmation, send-to-QC, spare approval, reopen, lifecycle jumps) was never
run as a set. A matrix that is only partly run is not a matrix.

There was also a specific reason to re-attack now: **F-01 introduced a brand new
identity type.** Adding an identity is exactly the kind of change that opens a
lateral door somewhere unrelated, and nothing had yet checked whether the QC
identity could do Maintenance work through some other RPC.

**Findings — all clean, run live before any test was written:**

| Actor | Attack | Result |
|---|---|---|
| non-staff | `transition_case` | FORBIDDEN |
| non-staff | `assign_technician` | FORBIDDEN |
| non-staff | `raise_safety_stop` | FORBIDDEN |
| non-staff | `confirm_emergency` | FORBIDDEN |
| non-staff | `send_to_qc` | FORBIDDEN |
| non-staff | `reopen_case` | FORBIDDEN |
| non-staff | approve >₹12,000 spare | FORBIDDEN |
| **QC identity** | approve >₹12,000 spare | FORBIDDEN |
| **QC identity** | `acknowledge_case` | FORBIDDEN |
| **QC identity** | `raise_safety_stop` | FORBIDDEN |
| **QC identity** | `assign_technician` / `reopen_case` | FORBIDDEN |
| **QC identity** | `transition_case` to CLOSED | FORBIDDEN |
| **Executive** | approve >₹12,000 spare | FORBIDDEN (Manager-only holds) |
| Executive | jump `ACKNOWLEDGED → CLOSED` | INVALID_TRANSITION |
| Executive | jump `ACKNOWLEDGED → MAINTENANCE_RELEASED` | INVALID_TRANSITION |
| Manager | approve >₹12,000 spare | SUCCEEDED (correct) |

The ₹12,000 request was also verified to carry
`requires_manager_approval = true` in the data itself — the gate is a stored
fact, not a UI decision.

**Material changes:** `tests/red-team-matrix.test.ts` (new, 4 suites). No
migration, no RPC, no RLS, no UI change — there was nothing to fix.

**A note on what a clean loop is worth:** finding nothing is only meaningful if
the check is repeatable. The value here is not the sweep, which was already
implied by earlier loops' individual guards; it is that the whole matrix now
runs on every CI push, including against the identity type that did not exist
this morning.

**Implementation detail worth recording:** the attacks are stored as thunks,
not pre-built promises. An array of already-fired `client.rpc(...)` calls
executes every attack concurrently the moment the array is built, before a
single assertion runs — so one attack could influence another's outcome and the
failure message would point at the wrong row. Deferring each call until its own
assertion keeps them independent and sequential.

**Tests:** 4 new suites. `tsc`, `lint` clean.

**Known limitations:** unchanged — the three Boss-side blockers from
`FORENSIC_REMEDIATION_FINAL.md` §16 remain open and are deliberately not loop
work.

## Loop 37 — 2026-09-07

**Summary:** Audited the notification/escalation paths as a set — something no
prior loop had done. The machinery is healthy; one real structural gap was
found and **deliberately not fixed** (RISK-25).

**Requirements affected:** §7.2 (waiting/resume), §7.3 (1h emergency), §23
(locked notifications), §24 (AUTO vs human), §32 item 15.

**Method:** the same one that found Loop 35's defect — ask the live database
whether a feature has ever actually produced its output, rather than reading
the code and assuming.

### What is healthy (verified, not assumed)

| Check | Result |
|---|---|
| Notification types that have ever fired | **12 of 12** — every declared type has real rows |
| `WAIT_ESCALATION_24H` | 74 |
| `EMERGENCY_ESCALATION_1H` | 273 |
| `WAIT_MANAGER_REMINDER_24H` | 2 |
| Scheduled scans registered and active | 3 (`escalation` */5min, `pm` hourly, `recurrence` hourly) |
| **pg_cron runs, all three scans** | **393 succeeded, 0 failed** |

The cron check matters more than it looks: a scheduled job that errors on every
run is indistinguishable from a working one in `cron.job`. Nobody had ever read
`cron.job_run_details`. All 393 runs succeeded.

The low `WAIT_MANAGER_REMINDER_24H` count (2 against 74 escalations) was checked
and is **correct**, not a gap: the reminder requires `last_escalated_at <= now()
- 24h`, and this database is only ~29 hours old, so the reminder has had two
opportunities to fire. Reported here because the ratio looks alarming until you
check it.

### RISK-25 — INTERNAL waits can never escalate. Found, not fixed.

`mark_wait_resolved` is the **only** function in the schema that sets
`waits.resume_ready_at`, and it explicitly refuses any wait whose
`reason_type <> 'EXTERNAL'`. `run_escalation_scan`'s 24h branch selects only
`where resume_ready_at is not null`. So an INTERNAL wait is **structurally
incapable** of ever escalating — not unlikely, impossible.

Live-verified, and it is not a test-data artifact:

| `reason_type` | total | have `resume_ready_at` |
|---|---:|---:|
| EXTERNAL | 213 | **213 (100%)** |
| INTERNAL | 107 | **0 (0%)** |

**Why this was not fixed.** The pack conflicts with itself, and the conflict is
the whole finding:

- §7.2 (the specific WAITING rule) scopes escalation to "**Resume-ready** with
  no required action for 24h". Under that reading the code is exactly right.
- §23's locked-notification list and §24's AUTO list both say "24h normal
  escalation" with **no** such scoping.
- §32 item 15 groups them as "Resume-ready + escalation + reminders", leaning
  toward §7.2.

Following the most specific section is defensible. But the operational
consequence — internally-blocked work is invisible to escalation forever — is
unlikely to be what a plant wants. Closing it requires deciding *when* an
INTERNAL wait's 24h clock starts, and the pack never says. That is precisely
the "invent SLA/threshold values not approved in this pack" that §19.15
forbids, so it goes to the Boss as evidence-controlled rather than being
guessed.

**Material changes:** `tests/escalation-coverage.test.ts` (new, 3 tests) and a
RISK-25 register entry. No migration, no RPC, no RLS change.

The third test deliberately **pins the current behaviour** rather than
asserting the desired one. That is the same device used for the deactivated
`[AUTOTEST]` recurrence rule: it keeps the gap a documented decision instead of
letting it drift into an accident, and it guarantees that anyone who later
"fixes" it has to change a test that explains why they must not do so without
Boss evidence.

**Tests:** 3 new. `tsc`, `lint` clean.

**One process note:** the first draft of these tests called a non-existent RPC
(`start_wait`; the real name is `enter_waiting`). `tsc` passed anyway, because
the Supabase client in this repo is not generically bound to a `Database` type,
so RPC names are unchecked strings. Caught by verifying the function catalogue
against the live schema before pushing rather than by letting CI find it.

## Loop 38 — 2026-09-07

**Summary:** Applied the "has this feature ever actually produced output"
method to PM, recurrence and CAPA — all healthy — then turned the same
question on §23's own idempotency claim and **found RISK-26: three sites were
delivering the same notification twice to the same person.** Fixed.

**Requirements affected:** §23 (notifications/escalation), §28 (escalation
notification creation), §32 item 17 (PM generation + overdue).

### PM — looked broken, is correct

164 approved RECURRING plans but only **3** PM instances and **0** overdue.
That ratio looks like the Loop 35 defect shape, so it was checked rather than
assumed — by simulating `run_pm_scan`'s own decision for every eligible plan:

| Check | Result |
|---|---|
| Plans currently owed an instance but not given one | **0** — the scan is fully caught up |
| `SCHEDULED` instances past due but not flagged | **0** |
| `PM_OVERDUE` notifications ever produced | **2** — the overdue path has run end to end |
| `approved_at` / `approved_by` mismatch (the scan filters on `approved_by`) | **0** |

The explanation is arithmetic, not a bug: frequencies are 14–30 days and
almost every plan was approved today, so the first instance falls due in two to
four weeks. Recorded because "164 plans, 3 instances" reads as a failure until
you do the subtraction.

Recurrence remains inert by design (0 active rules — PENDING-04), CAPA is
producing rows normally.

### RISK-26 — duplicate notification delivery. Found and fixed.

§23 makes two explicit claims: notifications are "event-driven, not
spam-driven", and "notification delivery must be idempotent and auditable".
Rather than trust either, the live `notifications` table was grouped by
(type, recipient, case) looking for counts above 1. Two duplicate pairs
surfaced on one case.

**The evidence rules out the obvious explanation.** Both pairs carry timestamps
identical to the **microsecond** — `09:54:18.629383` twice and
`09:54:55.425613` twice. Identical microsecond timestamps mean one transaction
and one scan pass, so this is not two overlapping cron runs. It is a
double-send by construction:

```
send to the case owner
then loop every active Manager and send again
```

When the owner **is** a Manager — normal; a Manager can own a case — that
person is in both sets. The case's own `CASE_ACKNOWLEDGED` row ("acknowledged
by Loop1 Test Manager") confirms exactly that.

Three sites had it: the 24h wait escalation, the 1h emergency escalation, and
the PM-overdue alert. With N Managers, an owner-Manager gets 2 notifications
while every other Manager gets 1, on every escalation, indefinitely — the kind
of alert-fatigue defect that makes a real escalation get ignored.

**Fix (0035):** one `case_notification_recipients(p_extra)` helper returning
the DISTINCT union of the extra recipient and every active Manager; all three
sites iterate that set instead of sending twice. Escalation rules, thresholds,
guards and the once-only semantics (`last_escalated_at`,
`emergency_escalated_at`) are byte-for-byte unchanged — only who gets collected
changed.

**The risk in this fix was dropping someone**, so all four shapes were verified
live:

| Owner | Recipients | |
|---|---|---|
| IS the Manager | **1** | was 2 — the bug |
| a distinct Executive | 2 | both present, nobody dropped |
| none (Manager-reminder path) | 1 | unchanged |
| a non-staff technician | 2 | unchanged |

**Three other Manager-notifying sites were checked and deliberately left
alone:** the handover `CASE_UNASSIGNED` path (0014), the production-boundary
breach (0015) and the safety-stop raise (0030) all notify Managers *only*, with
no separate owner send, so they have no overlap to dedupe. Changing them would
have been churn, not a fix.

**Material changes:** `0035_maintenance_notification_recipient_dedupe.sql`,
`tests/notification-dedupe.test.ts` (5 tests), RISK-26 entry.

**Note on what was not touched:** the existing duplicate rows are left in
place. `notifications` carries operational history and this repo does not
rewrite history to make a metric look better (§27). The fix stops new
duplicates; it does not erase the evidence of the old ones.

**Tests:** 5 new. `tsc`, `lint` clean.

## Loop 39 — 2026-09-07

**Summary:** Took an angle no prior loop had — instead of auditing what the
code *does*, cross-referenced all 60 schema functions against whether anything
in `src/` or `tests/` actually *calls* them. One real finding, fixed
(RISK-27), and two corrections to my own first reading.

**Requirements affected:** §28 (Take Ownership, first-valid-actor), §24
(HUMAN REQUIRED), §22.1 (shift-end UNASSIGNED), §37 (test matrix).

### RISK-27 — a built, tested capability no user could reach

`take_ownership` is named explicitly in §28 and listed in §24's HUMAN REQUIRED
list. It existed, was correct, and was tested — including §28's first-valid-actor
race guard. **Nothing in the application ever called it.**

Acknowledging a case assigns ownership, so a `REPORTED` case was covered. A
case that *loses* its owner later was not — and that state is **designed, not
accidental**: §22.1's `handover_all_open_cases` deliberately sets the owner to
NULL at shift end when nobody is available, and the dashboard deliberately
lists those cases under "Unassigned — waiting for a Maintenance owner".

So the application created the state, highlighted it on the dashboard, and
offered no way to resolve it. Live-verified: **4 cases were unassigned AND past
the statuses the Acknowledge button is offered on** (`ACKNOWLEDGED`,
`IN_REPAIR`) — genuinely unclaimable through the UI.

Fixed by wiring the existing RPC to a button, gated on
`isStaffRow && !current_owner_user_id && !caseIsTerminal && !canAcknowledge`.
That last clause matters: acknowledging already assigns ownership, so offering
both on a `REPORTED` case would be two buttons doing one thing. No migration,
no RPC change — the server side was already correct and already race-safe.
§28's deterministic conflict response (`ALREADY_OWNED`) is shown to the user
rather than swallowed, so the loser of a simultaneous claim learns why nothing
happened.

### Two corrections to my own first reading

Both are recorded because in each case the first reading would have produced a
false finding.

**1. `mark_asset_known` is not dead code.** The cross-reference flagged it as
called by neither `src/` nor `tests/`. That is true and irrelevant: it is a
**trigger** function (`execute function maintenance.mark_asset_known()` in
0021), so being uncalled as an RPC is correct by design. It is genuinely
exercised — `tests/case-assets.test.ts` asserts the trigger flips
`cases.asset_known` when a real asset is linked. Reporting it as dead surface
would have been wrong.

**2. The five "untested" UI-reachable RPCs are a known, documented limitation,
not a discovery.** `complete_pm_instance`, `reschedule_pm_instance`,
`link_pm_instance_to_case`, `decide_recurrence_flag` and
`record_recurrence_root_cause` have no vitest coverage — but `tests/pm.test.ts`
already explains why, in a comment written in Loop 10: instances only come into
existence via `run_pm_scan`, which is cron-only with EXECUTE revoked from every
client role (a fact that file also *asserts*), so there is no client-reachable
way to create the precondition. The same holds for recurrence flags and
`run_recurrence_scan`. Those RPCs were verified live via `execute_sql` at the
time instead. Presenting this as a new §37 gap would have been claiming
someone else's already-documented decision as my own finding.

**Material changes:** `take-ownership-button.tsx` (new), case-detail page
wiring, `tests/take-ownership-reachability.test.ts` (3 tests), RISK-27 entry.
No migration, no RPC change.

**Tests:** 3 new. `tsc`, `lint`, `build` clean. Full `"use client"` boundary
re-scan across 36 client files — clean.

## Loop 40 — 2026-09-07 — batch close (Loops 36–40)

**Summary:** Batch-closing loop. No engineering change — wrote
`APPROVAL_REPORT_LOOP_36_40.md`, logged Gate 8 as AWAITING BOSS, and stopped.

**Batch outcome:** three genuine findings across five loops — RISK-25 (open,
needs Boss evidence), RISK-26 (fixed), RISK-27 (fixed). One migration (0035).

**Stated plainly in the report rather than buried:** Loop 36 found nothing new,
Loop 38's first lead was a false alarm that turned out to be arithmetic, and
two of Loop 39's three observations were wrong and caught before they became
findings. That is a lower yield than Loops 26–30 (5 defects in 5 loops). The
audit surface is not inexhaustible, and saying so is more useful than
manufacturing findings to fill a batch.

**Four items now sit with the Boss** — none is unfinished engineering, each
needs evidence or a credential: the QC authority list is empty by design;
production and CI share one Supabase project; leaked-password protection is
off; and RISK-25 needs a threshold the pack never states.

**Gate:** GATE 8 AWAITING BOSS. Autonomous loop work is paused per §19.9/§19.13.
Loop 41 will not start without explicit continuation language.

## Boss-directed: RISK-25 closed + safe synthetic-data cleanup — 2026-09-07

Full evidence in `CLEANUP_AND_RISK25_REPORT.md` (structured per the brief's
§30). Summary below.

### RISK-25 — closed with Boss-supplied evidence

Loop 37 found that an INTERNAL wait could never escalate and deliberately did
NOT fix it, because closing it required a threshold the pack never stated. The
Boss has now supplied it: three permitted INTERNAL reasons
(reporting-manager approval pending / Purchase Order release pending / Other
with mandatory detail), and INTERNAL waits join the **existing** 24h
escalation measured from `entered_at`.

Enforced in three layers, and the third is the one that matters: a **direct
table insert** of a fourth reason is refused by a CHECK constraint, so this is
not UI-only and not even RPC-only.

**A defect this work introduced and caught before shipping:** adding
`p_internal_reason` changed `enter_waiting`'s arity, so `create or replace`
did not replace the old function — it created a **second overload with no
enforcement** and made 3-argument calls ambiguous. Found by the live probe, not
CI; dropped in the same migration. It failed closed (the CHECK constraint would
still have refused the row), but a second door that is merely locked is still a
second door.

Live proof on a wait backdated 25 hours: 0 → 2 notifications, a repeat scan
gave 2 → 2 (idempotent), and **the wait stayed unresolved** — escalation
notifies, it never grants the approval or releases the PO.

`escalation-coverage.test.ts`'s RISK-25 block was rewritten from pinning the
defect to pinning the resolution. That pin existed precisely to force a
deliberate change when evidence arrived, and it did its job.

### Synthetic test-data cleanup — 8,920 cases removed, safely

**Forensic inspection came first**, and it changed the design: there are **0
DELETE policies** in the entire schema, all **21** FKs to `cases` are
`NO ACTION` (nothing cascades), `audit_log` has **no FK** to `cases`, and
`recurrence_flags.related_case_ids` is an array holding *shared* references.

Classification was prefix-anchored (`like '[AUTOTEST%'`, not `'%[AUTOTEST%'`)
because the loose form would match a real symptom that merely mentioned the
word. Before cleanup: 9,214 cases, **9,214 synthetic, 0 not provably
synthetic**.

The cleanup function refuses, all-or-nothing: a non-synthetic case, a case
owned by a `pm_instances` row, a case that is the primary of a duplicate
outside the batch, and a case referenced by a surviving recurrence flag. **Each
refusal was proven to fire**, including the important one — a temporary
fixture symptomed `REAL BUSINESS CASE` was created, **refused**, and removed
again in the same transaction so no fake "real" record was left behind.

A single-case trial ran before any bulk work: exactly 1 case and its 1 event
removed, staff untouched.

**Result: 8,920 deleted. 321 cases remain — 114 open, 207 non-open left alone
per §16. Zero orphans across every dependent table.**

**Why 114 open and not 10, stated plainly:** 10 retained by choice (one per
distinct open lifecycle state, richest first), 1 blocked by a `pm_instances`
reference, 103 blocked because a DUPLICATE case points at them — and deleting
those would mean deleting resolved cases, which §16 forbids. **Zero
unexplained.** The brief's own rule that safety outranks the number 10 is why
the number is 114.

### Stopping the refill, not just the symptom

A one-off cleanup would have been undone within a day. A vitest `globalSetup`
teardown now removes only the synthetic cases created during that run's window,
once per suite — no existing test changed, no coverage weakened.

`cleanup_synthetic_cases` keeps EXECUTE revoked from every client role. The one
client-reachable entry point is staff-only, demands an explicit start timestamp
(it can never mean "clean everything"), refuses windows wider than 24 hours, and
delegates every deletion to the guarded function — so even a malicious staff
account could only remove `[AUTOTEST` fixtures, and in a production database it
is inert.

Honest limitation: vitest's teardown is not told whether the run passed, so
failed-run retention is **opt-in** (`MAINTENANCE_KEEP_TEST_DATA=1`), not
automatic.

### What was NOT done, and why

The brief's authority #2 is the **Sarvam Maintenance Screen Architecture**.
**That document was not supplied and is not in the repo.** §4/§5/§27 ask for UX
correction "where the implementation does not follow Sarvam's approved
interaction architecture" — a judgement impossible to make against a document I
do not have. Inventing a bottom-sheet architecture and calling it
Sarvam-compliant would be exactly the fake green §28 forbids. Reported as
**NOT TOUCHED — blocked on a missing input**, not as done.

### QC identities — answered, no code needed

The Boss's answer: the QC login will come from the Quality module when the two
are integrated. Noted from the attachment: that module is currently a
standalone localStorage prototype (roles `exec`/`mgr`/`head`,
`canApprove = mgr || head`) and is **not on shared Supabase auth yet**, so
integration needs that first. `maintenance.qc_authority` staying empty is now a
recorded decision rather than an open question.

**Tests:** 17 new (10 RISK-25, 7 cleanup), 4 files updated. `tsc`, `lint`,
`build` clean; `"use client"` boundary re-scan across 36 files clean.

## Loop 41 — 2026-09-07

**Summary:** Verified Loop 40's test-data cleanup against the next real CI run
instead of against its own code. It did not hold. Two defects found; the fix for
the second was itself wrong on the first attempt and was caught by its own
red-team test. Full evidence in `LOOP_41_REPORT.md`.

**Requirements affected:** §21 (test data hygiene), §28 (no fake green),
§29 (least privilege).

**Findings:**
- **F-41-1 — Playwright had no teardown at all.** The Loop 40 cleanup lived in
  `vitest.config.ts`'s `globalSetup`, which Playwright never runs. Ordering made
  it unfixable by config alone: `e2e` `needs: lint-and-build`, so Vitest's
  teardown fires before the e2e cases exist. Evidence from the CI run that
  merged PR #41 — teardown at 18:11:58 UTC, then cases `a5e3caf2`, `924af305`,
  `d18a4351`, `a6a2a662` created 18:13:07–18:13:46 and all still present
  afterwards. Four leaked cases per run, forever.
- **F-41-2 — a run could delete a concurrently-running run's in-flight cases.**
  `cleanup_test_cases_since(p_since)` selected on `created_at >= p_since AND
  symptom like '[AUTOTEST%'` and nothing else — no notion of which run owned a
  case. `ci.yml` scopes concurrency to `ci-${{ github.ref }}`, so a PR run and a
  main-branch run are in different groups and may overlap. Introduced by Loop
  40's own fix.
- **The first fix for F-41-2 reintroduced F-41-2.** Migration `0040` matched the
  run tag with `LIKE '%[run=' || tag || ']%'` and allowed `_` in the tag
  charset. `_` is a single-character wildcard in `LIKE`, so a tag of
  `loop41-RUN___` matched `[run=loop41-RUNBBB]` and deleted the other run's
  case. Proven live: a correctly-tagged cleanup deleted exactly its own 2 cases
  and left the third alone; the wildcard tag then deleted the third as well.
- **`cleanup_test_cases_since` held EXECUTE for `PUBLIC`/`anon`** (left by
  `0039`). Never exploitable — the first statement is an unconditional
  `is_staff()` refusal and an anonymous caller has no `auth.uid()`, verified
  live returning `FORBIDDEN` — but an unauthenticated role should not hold
  EXECUTE on a delete-capable function.

**Material changes:**
- `supabase/migrations/0040_maintenance_test_run_tagging_and_least_privilege.sql`
  — adds `p_run_tag`; revokes EXECUTE from `public` and `anon`. The old
  single-argument function is **dropped explicitly first**: `create or replace`
  with a different arity creates a new overload rather than replacing, a trap
  this repo has hit twice before. Catalogue re-checked after applying — one row,
  one overload.
- `supabase/migrations/0041_maintenance_run_tag_wildcard_fix.sql` — replaces the
  `LIKE` match with `strpos()` (a literal substring search, where no
  metacharacter has meaning) **and** drops `_` from the allowed charset. Two
  changes for one bug, deliberately: the goal is to remove the class, not the
  one character that exposed it.
- `tests/run-tag.ts` (new) — the shared run-tag/marker helper.
- `tests/cleanup-run.ts` (new) — the teardown body, extracted so both suites
  share one definition of "safe" rather than two that can drift.
- `e2e/global-teardown.ts` (new) + `playwright.config.ts` — the e2e suite now
  cleans up after itself. That Playwright invokes a function returned from
  `globalSetup` as the global teardown was verified in the installed runner
  source, not assumed.
- `.github/workflows/ci.yml` — per-job `MAINTENANCE_TEST_RUN_ID`. The
  `-unit`/`-e2e` suffix is load-bearing: without it the two jobs of one workflow
  run would clean each other's rows.
- `tests/helpers.ts`, `e2e/helpers.ts` — symptoms now carry `[run=<tag>]`. Also
  corrects a comment that still claimed automated cleanup "isn't attempted".
- `tests/run-tag-scoping.test.ts` (new, 7 tests).

**Honest limits:**
- The isolation property in its dangerous direction (run A's cleanup leaves run
  B's rows alone) is proven live in `LOOP_41_REPORT.md`, not in the suite. A
  test asserting it would have to leave a second run's rows behind to show they
  survived — leaking exactly what the feature exists to stop leaking. The suite
  pins the safe direction (a foreign tag deletes zero) and every refusal path.
- Local runs (no `MAINTENANCE_TEST_RUN_ID`) still use window-only cleanup. That
  is deliberate — there is no second concurrent run locally — but it means the
  cross-run protection is CI-scoped, not universal.

**Correction to Loop 40's record:** Loop 40 reported the refill problem as
closed. It was not. A green CI run was not evidence the cleanup worked — the
leaked rows were sitting in the database the whole time it was green.

## Loop 42 — 2026-09-08

**Summary:** Loop 41 fixed where the cleanup ran and what it was allowed to
touch. Loop 42 asked what it never looks at. Two answers, and the second is a
correction to my own Loop 40 report. Full evidence in `LOOP_42_REPORT.md`.

**Requirements affected:** §21 (test data hygiene), §27/§0 rule 6 (append-only
history — respected, see below), §28 (no fake green).

**Findings:**
- **F-42-1 — pm_plans and recurrence_rules accumulate forever.**
  `cleanup_synthetic_cases` walks a CASE's dependents; neither table hangs off a
  case, so it never saw them. Live: `pm_plans` 484 rows, **484 synthetic
  (100%)**; `recurrence_rules` 183 rows, **183 synthetic (100%)**; ~5 plans and
  ~3–6 rules added per CI run. Not just clutter — **182** of those plans are
  RECURRING, active, approved, with `frequency_days` 14–30, approved
  2026-09-06/07. `run_pm_scan` (hourly) will generate instances once they
  mature, flag them OVERDUE, and send a `PM_OVERDUE` notification to every
  active Manager. In 2–4 weeks a real manager starts receiving hundreds of
  overdue alerts for preventive maintenance that does not exist.
- **F-42-2 — 74% of the audit log dangles, and Loop 40's "zero orphans" claim
  was wrong.** `cleanup_synthetic_cases` removed audit rows for
  `target_table = 'maintenance.cases'` and nothing else, so every child row it
  deleted left its audit entry behind. **4,175 of 5,659 audit rows (74%)** point
  at ids that no longer exist — 1,134 for `spare_requests`, 657 for `waits`, 543
  for `safety_stops`, 402 for `case_impact_records`, and so on.
- **A defect in this loop's own work, caught on the first live call.** The audit
  sweep was written against `audit_log.created_at`. That column does not exist —
  the table timestamps with `occurred_at`. It failed loudly rather than silently
  sweeping nothing, which is the right failure mode, but the column should have
  been read from `information_schema` rather than assumed.

**Material changes:**
- `supabase/migrations/0042_maintenance_test_artifact_cleanup.sql` — adds
  `cleanup_test_artifacts_since(p_since, p_run_tag)`. Staff-only, ≤24h window,
  same run-tag charset and `strpos()` (non-pattern) matching as Loop 41. Removes
  tagged synthetic `recurrence_rules` (refused if any `recurrence_flag`
  references them), tagged synthetic `pm_plans` and their instances (a plan with
  an instance linked to a surviving CASE is refused, so a case never silently
  loses its PM linkage), and audit rows inside the window whose subject no
  longer exists. Each `target_table` is checked against ITSELF by name; an
  unrecognised table is skipped, never guessed at. EXECUTE revoked from `public`
  and `anon`.
- `tests/cleanup-run.ts` — the teardown now runs the artifact sweep AFTER the
  case cleanup, because a run's audit rows only become sweepable once their
  subjects are gone.
- `tests/artifact-cleanup.test.ts` (new, 6 tests) — pins the refusal surface.

**On append-only history:** §0 rule 6 / §27 govern REAL history. Every row this
function can remove is inside a ≤24h window, names a `target_table` that exists,
and has a `target_id` whose subject has ALREADY ceased to exist. It cannot touch
an audit row whose subject survives — proven live with a three-way probe (live
subject survived, dangling swept, unknown table skipped). A pointer to a deleted
`[AUTOTEST` fixture is not business history.

**Honest limits:**
- The audit sweep is **window-scoped only, not run-tag scoped** — an audit row
  carries no tag, and by the time it is sweepable its subject is gone. A
  concurrent run could sweep another run's dangling audit rows. Safe rather than
  merely tolerated: a row is swept only once its subject no longer exists, so
  nothing a running test can still observe is removed.
- The **historical backlog** (484 plans, 183 rules, 4,175 dangling audit rows)
  is **NOT** deleted. The mechanism stops the backlog growing from the next CI
  run onward; clearing what is already there is a bulk deletion outside any
  window and is waiting on the Boss, alongside the still-unanswered question
  about the 8 leaked e2e cases.

**Checked and found nothing** (reported because "found nothing" is a result):
all 48 business RPCs are reachable from `src/` — the only one without a call
site, `mark_asset_known`, is a trigger function, not an RPC — and every
component under `src/` is imported somewhere. `run_pm_scan` has no bug: 182
eligible plans against 3 instances looked wrong but `should_generate_now` is 0,
and all three cron jobs are healthy (394/394, 29/29, 24/24 succeeded, zero
errors) per `cron.job_run_details`, not `cron.job`.

**Correction to Loop 40's record:** "Zero orphans across every dependent table"
was wrong about the database and right only about what it measured. The probe
covered the eleven FK-linked dependents; `audit_log` deliberately has no foreign
key — that absence is what keeps history append-only — so the one table that
could dangle was the one table not checked.

## Loop 43 — 2026-09-08

**Summary:** Went back to authorization and found the worst defect in this
project so far. The §4 LOCKED lifecycle graph was writable by an
unauthenticated caller. RISK-28, CRITICAL. Full evidence in
`LOOP_43_REPORT.md`.

**Requirements affected:** §4 LOCKED lifecycle graph, §6 emergency gate,
§12 QC boundary, §29 authorization, §42 Change Control.

**Findings:**
- **RISK-28 (CRITICAL) — `maintenance.status_transitions` had RLS disabled.**
  That table IS the §4 locked graph; every transition check in the product
  (`transition_case` in 0003 and its 0034 rewrite, plus 0007, 0011, 0012, 0019)
  validates edges against it. Migration 0003 created it and never enabled RLS.
  Supabase grants full DML on a schema's tables to `anon` and `authenticated` by
  default, so nothing stopped a client writing to it.
  **Proven live as the `anon` role with NO JWT** — any holder of the public anon
  key, signed in or not:
    * `insert ('REPORTED','CLOSED')` **SUCCEEDED**. That edge alone closes a case
      straight from REPORTED — no diagnosis, no repair, no QC clearance, no
      restoration verification — and `transition_case` would have accepted it as
      legitimate, writing a clean audit trail for a closure that skipped every
      control.
    * `delete from maintenance.status_transitions` with no WHERE **SUCCEEDED**,
      leaving **0 edges**. With an empty graph every transition in the product
      fails: total denial of service on the case lifecycle.
  Both reverted immediately; the graph verified back to exactly its canonical 26
  edges **set-wise** against 0003 (0 missing, 0 extra).
  Same class as RISK-19 but strictly worse in reach: RISK-19 needed a session and
  forged one case; this needs no session and rewrites the rule every case is
  judged by.
- **Controls confirm the hole was specific, not general.** The same anon INSERT
  probe against `cases` and `audit_log` was refused by RLS in both cases. RLS was
  working everywhere it was switched on; `status_transitions` was the only table
  in the schema where it was never switched on.
- **`idempotency_keys` flagged by the same sweep is safe.** RLS enabled with zero
  policies denies everything, and nothing in `src/` reads it.

**Material changes:**
- `supabase/migrations/0043_maintenance_lifecycle_graph_lockdown.sql` — RLS
  enabled on `status_transitions`; a SELECT-only policy for `authenticated`; and
  deliberately NO write policy, because changing this table is a §42 Change
  Control action performed by a migration, never a runtime write. Staff cannot
  write to it either — staff authority does not extend to rewriting the rules
  staff are judged by. RLS is enabled without FORCE, matching every other table
  here, so the SECURITY DEFINER RPCs that read the graph as the table owner are
  unaffected. Defence in depth: default write grants revoked from `anon` and
  `authenticated`, SELECT revoked from `anon`, and `idempotency_keys`' unusable
  default write grants revoked too.
- `tests/lifecycle-graph-lockdown.test.ts` (new, 5 tests) — non-staff INSERT
  refused, **staff** INSERT refused, staff DELETE refused and the edge survives,
  an illegal transition still refused end-to-end, and a **canary** on the
  canonical edge count so any future runtime write to the graph fails CI.

**Verified after the fix:** anon INSERT → `permission denied`; anon DELETE-all →
`permission denied`; staff-authenticated INSERT → `permission denied`;
`authenticated` SELECT → 26 edges. And end-to-end through the real RPC on a real
case, `REPORTED → ACKNOWLEDGED` still **succeeds** while `ACKNOWLEDGED → CLOSED`
is still refused with `INVALID_TRANSITION` — the lockdown did not break the
SECURITY DEFINER path. Probe case removed afterwards via the run-tag cleanup.

**How it was found, and why no earlier loop found it:** by sweeping
`pg_class.relrowsecurity` and `pg_policy` across every table in the schema rather
than reading policy definitions. Loops 26–39 audited RPC bodies, policy
predicates and business rules in detail, and this sat underneath all of them,
because **a table with no policies does not appear when you audit policies.**
Enumerate the objects first, then audit the ones that exist. Loops 41 and 42
learned the same lesson about cleanup (the case-walker never saw tables that do
not hang off a case); this is that lesson again in the authorization layer, where
it costs more.

## Loop 44 — 2026-09-08

**Summary:** Loop 43 fixed one table whose RLS was never enabled. Loop 44 asked
why that one mistake was fatal, and fixed the default that made it so. RISK-29.
Full evidence in `LOOP_44_REPORT.md`.

**Requirements affected:** §29 authorization, §42, schema-wide privileges.

**Findings:**
- **RISK-29 — `pg_default_acl` granted every new object to `anon`.** Tables got
  `arwdDxtm` (SELECT/INSERT/UPDATE/DELETE/TRUNCATE), functions `X`, sequences
  `rwU`. So RLS was the ONLY thing between an unauthenticated caller and every
  table in the schema, and any future table would carry the same loaded default.
  **This is why RISK-28 was fatal rather than untidy:** `status_transitions`
  handed `anon` full DML the moment it was created, and nobody enabled RLS.
- Three leaks proven live as `anon` with **no JWT**:
  * `case_notification_recipients(null)` returned **every active Manager's user
    id** — SECURITY DEFINER, so it bypassed the `staff` table's RLS. Those ids
    are the input to `assign_technician`, `handover_case`, `raise_capa`.
  * `case_is_confirmed_emergency(<real case id>)` returned **TRUE** — an oracle
    for an unauthenticated caller. Tested against a real emergency case, not
    just a non-existent id, which returns `false` and would have been a
    misleadingly reassuring test.
  * `next_case_number()` **advanced the sequence**, letting an unauthenticated
    caller burn MC numbers and leave permanent gaps in an audit-visible
    identifier series. Two numbers, MC-010550 and MC-010551, were burned proving
    this; that gap is real and is recorded rather than quietly ignored.

**Checked and found nothing** (recorded because "found nothing" is a result):
**every** function in the schema already pins `search_path` — zero missing — and
no SECURITY INVOKER/DEFINER mismatch was found. The finding came from the third
sweep, which roles hold EXECUTE, and then from asking why they held it.

**Material changes:**
- `supabase/migrations/0044_maintenance_anon_privilege_lockdown.sql` — revokes
  the schema's DEFAULT PRIVILEGES for `anon` on tables, functions and sequences
  so new objects stop inheriting the grant; revokes the same on all existing
  objects; and revokes `usage on schema maintenance` from `anon`. Fixing the
  default matters more than fixing the three functions — patching the instances
  would have left the next table equally exposed.
- `tests/anon-privilege-lockdown.test.ts` (new, 7 tests) using a genuinely
  signed-out client holding the anon key, which is what an attacker has since
  that key ships in the browser bundle.

**`anon` needing nothing was verified, not assumed:** every `.from(`/`.rpc(` call
in `src/` lives under `src/app/(app)/`, the login page calls only
`auth.signInWithPassword`, and the single API route touches no data.

**Deliberately NOT revoked — `authenticated`.** Three helpers are evaluated as
the CALLING user, so revoking them there would break authorization rather than
tighten it: `can_read_case` (evidence/safety_stops/production_boundary SELECT
policies), `case_is_confirmed_emergency` (`case_assignments_insert` WITH CHECK),
and `next_case_number` (the DEFAULT on `cases.case_number`). Checked against
`pg_policy` and the column default BEFORE writing the migration, because this
repo has already made that exact mistake once — tightening `cases_select` broke
`case_assignments_insert`, whose EXISTS was evaluated as the inserting user.

**Verified after:** all three anon probes now return `permission denied for
schema maintenance`; and the authenticated path is intact end-to-end — staff read
465 cases and the 26-edge graph, a case INSERT succeeds and receives MC-010665
from the default, and `acknowledge_case` still drives REPORTED → ACKNOWLEDGED.

**A mistake in this loop's own test, caught before pushing:** the new test file
first built its case symptom by hand as `[AUTOTEST] anon lockdown regression`,
which carries no `[run=<tag>]` marker — so the tag-scoped teardown would have
left the row behind permanently, precisely the leak Loop 41 closed. Changed to
`testSymptom()`. The fix from three loops ago is only as good as every new call
site remembering to use it.

## Loop 45 — 2026-09-08

**Summary:** Final loop of the 41-45 batch. Same enumerate-then-audit method as
43 and 44, one layer further in: audit the policies that DO exist, side by side.
RISK-30. Full evidence in `LOOP_45_REPORT.md`; batch report in
`APPROVAL_REPORT_LOOP_41_45.md`.

**Requirements affected:** §5.1 evidence intake, §26 data model, §29
authorization/audit trail.

**Findings:**
- **RISK-30 — `evidence_insert` had no case predicate.** Its WITH CHECK was
  `uploaded_by = auth.uid()` and nothing else: no staff check and, crucially, no
  check that the caller had any relationship to the case. **The asymmetry was
  the tell** — `observations`, `restorations` and `case_assets` all require
  `is_staff() AND <actor> = auth.uid()`; `evidence` required neither staff nor a
  case predicate.
  Proven live as the seeded technician identity (a real auth user with no
  `maintenance.staff` row, unassigned to the target case): cases visible to that
  identity for MC-009600 = **0**; INSERT into `evidence` for MC-009600 =
  **SUCCEEDED**; the row visible back to its own writer = **0**; the row visible
  to Maintenance staff = **YES**, as ordinary attached evidence naming the
  technician as uploader. A blind write into someone else's audit trail. Same
  class as RISK-22. Probe row deleted immediately.

**Checked and found nothing** (recorded because "found nothing" is a result):
the only policy still `USING (true)` is `status_transitions_select`, created
deliberately in Loop 43; both UPDATE policies are `USING (false)`; and there are
**zero** DELETE policies in the schema.

**Material changes:**
- `supabase/migrations/0045_maintenance_evidence_insert_scope.sql` — adds
  `maintenance.can_read_case(case_id)` to the WITH CHECK. **This is not a
  reversal of a deliberate decision, it implements it.** `evidence-panel.tsx`
  records the intent: §5.1 lists evidence as an intake field, so the reporter —
  not just staff — must be able to attach it before any staff RPC touches the
  case. That intent is right and is preserved; the defect was that the code said
  something wider — intent "the reporter, on THEIR case", policy "anyone, on ANY
  case". Exactly the shape of RISK-22. `can_read_case` is staff / that case's
  reporter / an assigned technician — precisely the three parties the intent
  names — so INSERT scope now matches SELECT scope. It is evaluated as the
  CALLING user here, which is why Loop 44 deliberately kept its `authenticated`
  EXECUTE grant.
- `src/app/(app)/cases/[id]/evidence-panel.tsx` — the comment claiming the policy
  was "already correct" was corrected rather than left to mislead the next
  reader.
- `tests/evidence-insert-scope.test.ts` (new, 4 tests).

**Verified in four directions:** the original attack is refused; a **non-staff
reporter can still attach evidence to their own case** (the §5.1 intake path — if
this had failed the fix would have overreached and broken the intent); staff can
still attach to a case they did not report; and impersonation (`uploaded_by` set
to another user) is refused. All probe rows and the probe case removed.

**Gate 9 logged as AWAITING BOSS.** Autonomous loop work is PAUSED per §19.9/
§19.13. Two deletions await an explicit yes and have NOT been acted on: the 8
leaked e2e cases, and the historical backlog of 484 pm_plans + 183
recurrence_rules + 4,175 dangling audit rows.

## Boss-approved backlog cleanup — 2026-09-08

**Summary:** The Boss answered the two open deletions with "dono hatao agar usse
project ko koi nuksan nahi hai to... project safety first." Both removed, every
guard checked first, nothing forced past a refusal. Full evidence in
`BACKLOG_CLEANUP_REPORT.md`.

**Result:**

| | Before | After |
|---|---|---|
| Leaked e2e cases | 8 | **0** |
| `pm_plans` | 489 | **0** |
| `pm_instances` | 3 | **0** |
| `recurrence_rules` | 183 | **0** |
| `audit_log` | 5,753 | **520** |
| Dangling audit rows | 4,177 | **0** |
| PM_OVERDUE generators | 183 | **0** |
| `staff` / `auth.users` / lifecycle edges | 2 / 4 / 26 | **2 / 4 / 26** |

**Non-synthetic rows deleted: zero.** Verified before running — cases, pm_plans
and recurrence_rules each had 0 rows without the `[AUTOTEST` prefix — and the
migration aborts the whole transaction if that is ever untrue.

**Material changes:**
- `supabase/migrations/0046_maintenance_backlog_cleanup_one_time.sql` — a
  one-time, fully guarded DO block. **The 24h window guard was NOT weakened:**
  `cleanup_test_cases_since` / `cleanup_test_artifacts_since` both refuse a
  window over 24h by design and this backlog dates from 2026-09-06, so rather
  than relax that limit — which would permanently weaken the guard protecting
  every future run — the work was done once, here, where it is auditable, and
  **no new callable function was left behind**.
- The 8 e2e cases went through the existing guarded `cleanup_synthetic_cases`
  (`requested 8, deleted 8`), which re-checks every guard for itself.

**The one plan that tripped a guard:** `[AUTOTEST] Monthly lube check` —
RECURRING, 30-day, with an instance linked to case MC-000428. The guard exists so
a surviving REAL case never silently loses its PM linkage; here both ends were
provably synthetic (MC-000428 is `[AUTOTEST] PM instance case`, no duplicate
pointing at it, no recurrence flag referencing it), so the chain was removed and
the migration aborts if that case had turned out to be real. **It was the last
remaining PM_OVERDUE generator** — leaving it would have kept notifying a real
Manager every 30 days about maintenance that does not exist.

**Deliberately NOT deleted:** case MC-000428 itself. The Boss approved two things
— the 8 e2e cases and the backlog (plans, rules, audit rows) — and this case is in
neither list. It is harmless once its plan is gone, because a case generates no
notifications by itself.

**Append-only history respected:** every audit row removed named a `target_table`
that exists and a `target_id` whose subject had ALREADY ceased to exist. Each
table is checked against ITSELF by name; an unrecognised table is skipped, never
guessed at. All 520 surviving rows point at a live subject.

**Zero orphans** across eight probes (audit, pm_instances, recurrence_flags,
evidence, case_events, notifications, case_assignments, waits).

**The app still works — checked, not assumed.** An empty `pm_plans` /
`recurrence_rules` is a state the code had never seen: all three cron scans run
clean on empty tables; a case can be created and acknowledged with events and
audit rows written (2 and 2); a Manager can create a PM plan and a recurrence
rule, repopulating from empty; and the teardown removed the smoke fixtures. One
refusal during smoke-testing was correct behaviour, not a defect —
`create_pm_plan` as the Executive returned `FORBIDDEN: only Maintenance Manager
may create a special/one-time PM plan (§17.2)`; wrong identity on my part, and
§17.2 enforcing itself. Re-run as the Manager, it succeeded.

## Loop 46 — 2026-09-08

**Summary:** First loop of the Boss-approved "Type A" scope. Same
enumerate-first method as Loops 43-45, applied to triggers and constraints:
enumerate every one in the schema, read each in full, then find the one that
doesn't match its business rule. RISK-31. Full evidence in
`LOOP_46_REPORT.md`.

**Requirements affected:** §16.3 spare request initiation, §29 audit trail.

**Findings:**
- **Triggers — 1 in the whole schema, correctly scoped.**
  `case_assets_mark_known` (AFTER INSERT on `case_assets`) only ever follows an
  already staff-authorized insert (`case_assets_insert`'s WITH CHECK is
  `is_staff() AND linked_by = auth.uid()`). No finding.
- **CHECK constraints — 24, read in full.** 23 matched their business rule
  exactly. Every `notification_type` literal used at any insert site across
  all 47 migrations was diffed against the 12-value constraint list: zero
  mismatches.
- **RISK-31 — `spare_requests.initiated_role` collapsed Manager into
  Executive.** `raise_spare_request` set it with
  `case when is_staff() then 'EXECUTIVE' else 'TECHNICIAN' end`. `is_staff()`
  is true for BOTH locked software roles (§3.1), so a Manager-raised spare
  request was recorded — and displayed — as if an Executive raised it.
  Proven live: signed in as the seeded Manager, `initiated_by` was correctly
  the Manager's own uuid but `initiated_role` was `'EXECUTIVE'`. User-visible:
  `spares-panel.tsx` renders `Requested by {initiated_role.toLowerCase()}`.
  Not a security defect — approval routing uses `estimated_amount` vs the
  §3.3 ₹12,000 boundary, independent of this field — but a real audit-trail
  accuracy defect.

**Material changes:**
- `supabase/migrations/0047_maintenance_spare_request_initiated_role_fix.sql`
  — widens the constraint to allow `'MANAGER'` and recreates
  `raise_spare_request` to derive the label from
  `maintenance.current_staff_role()` (which already existed and already
  returns the exact role) instead of the collapsing `is_staff()` check. §16.3
  names only Technician/Executive as initiation paths and never mentions
  Manager, but restricting the RPC to Executives only would have invented an
  authority restriction the pack never states (§3.2 gives Manager override
  authority and never says Manager cannot do what Executive can) — so the fix
  records the role that exists rather than restricting who may act. Same
  5-argument signature and both trailing defaults preserved (a second apply
  was needed after the first hit `cannot remove parameter defaults from
  existing function`).
- `src/lib/supabase/database.types.ts` — `SpareRequest.initiated_role` was
  also missing `"MANAGER"` in its TS union; corrected, since a future
  exhaustive UI switch on this type would otherwise silently mishandle a
  value the database can now genuinely produce.
- `tests/spare-request-initiated-role.test.ts` (new, 4 tests).

**Verified in all three directions plus the boundary:** Executive → `EXECUTIVE`,
Manager → `MANAGER` (the regression this fixes), non-staff → `TECHNICIAN`; and
the §3.3 ₹12,000 approval boundary re-verified unaffected
(`requires_manager_approval: true` at ₹15,000 regardless of initiator).

**Checks:** `tsc`, `lint`, `build` clean; `"use client"` re-scan across 36 files
clean; function arity unchanged after the fix (one overload, 5 args).

## Loop 47 — 2026-09-08

**Summary:** Second loop of the Boss-approved "Type A" scope. First sweep of
the deployed runtime configuration — every prior loop audited the database and
application code, never the platform underneath. No migration, no application
code change: infrastructure audit plus Sentry issue triage only. Full
evidence in `LOOP_47_REPORT.md`.

**Vercel:**
- Deployment protection (password/SSO/trusted IPs) is off across the board.
  Not treated as a defect — this app's authorization boundary is Supabase
  auth + RLS (hardened through Loops 43-45), not network-level access
  control; an unauthenticated visitor to any preview URL reaches a login
  page, not data. Recorded rather than silently assumed: every PR branch
  gets its own live, publicly reachable preview URL.
- The GitHub repository is public (`githubRepoVisibility: "public"`,
  confirmed from deployment metadata). No secret has ever been committed, but
  changing repo visibility is an account-level, Boss-side decision — reported,
  not changed.
- `vercel.json`'s `regions: ["sin1"]` pin (from the earlier performance fix)
  is unchanged; no drift.
- Environment variables: exactly two used anywhere in `src/` —
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — both
  correctly public by Supabase's own design, protected by RLS. No
  `service_role` key or other secret referenced anywhere in the client or
  server code.

**Sentry:**
- DSN and SDK config checked and found correct: DSN is a public submit-only
  identifier (same category as the Supabase anon key), and `@sentry/nextjs`
  v10's `sendDefaultPii` default (`false`) means the absence of an explicit
  PII setting is the safe default, not a gap.
- **Two "unresolved" issues found, both stale, both resolved.** Read in full
  before triage rather than assumed: `MONARCH-MAINTENANCE-MODULE-2`
  (`isPriorityLockedByManager()` called from server) and
  `-3` (the generic client-side echo of the same throw — identical
  `trace_id`). Both events came from `http://127.0.0.1:3100`, the local
  Playwright e2e server, on a GitHub Actions runner (`server_name:
  runnervmejwal`) — never real traffic, `Users Impacted: 0` on both. The
  release SHA and timestamp window match Loop 16's `"use client"` boundary
  defect, fixed the same day in commit `7f4099c`. `isPriorityLockedByManager`
  no longer exists anywhere in the source tree (verified by grep), and every
  subsequent loop's boundary re-scan has been clean, including this one.
  First seen equals last seen — a single CI burst before the fix landed,
  never recurred. Both marked resolved in Sentry with a comment recording
  the full root-cause chain, so a future reader does not re-investigate a
  two-day-old, already-dead error.

**What this confirms:** the standing `"use client"` boundary rule (written
after Loop 16, re-verified every loop since) has held — the only trace of
that defect left anywhere was two stale Sentry rows, not a live recurrence.
Also confirms Loop 44's anon lockdown is doing its job at the platform edge:
deployment protection being off is safe specifically because the database no
longer trusts an unauthenticated caller for anything.

**What this does NOT resolve:** the shared test/production Supabase project
question and the public-repository fact are both reported for the Boss's
decision, not acted on — not something to invent an answer to.

## Loop 48 — 2026-09-08

**Summary:** Third loop of the Boss-approved "Type A" scope; the mobile-first
UX pass (§30, §32 item 21), and the first loop to receive the Sarvam
Type-A handoff mid-work (treated strictly as non-binding guidance per the
Boss's instruction — DR-01 through DR-05 stay PROPOSED, not implemented as
new business rules). Full evidence in `LOOP_48_REPORT.md`.

**Correction to a prior overstatement:** the earlier percent-complete
breakdown described mobile UX as "only 4/36 client components use
responsive Tailwind classes" — technically true but the wrong metric.
Tailwind v4 is mobile-first: unprefixed classes already apply at every
viewport, so a component with zero `sm:`/`md:`/`lg:` prefixes is not
necessarily desktop-only. Re-checked actual rendered structure instead:
cases queue is already cards (not a table), bottom tab nav already exists,
`/cases/new`/PM/recurrence-rules pages are already single-column, case
detail inputs already use `text-base` (prevents iOS zoom-on-focus). The
one `<table>` in the app (`dashboard/page.tsx`'s staff breakdown) is
already wrapped in `overflow-x-auto` — a valid scroll-container pattern,
not an uncollapsed dense grid. No genuine structural mobile defect found
in any of it — reported to the Boss as a correction rather than left
standing.

**The one real, verified gap — fixed:** `src/components/ui.tsx`'s shared
`Button`/`LinkButton` `"md"` size (the default, used for every primary
"Save"/"Acknowledge"/"Submit" action app-wide) rendered under the ~48px
minimum touch-target §30 asks for (and the Sarvam handoff's §C repeats
independently). Added `min-h-12` (48px) to `"md"` only — `"sm"`
deliberately untouched, it's the compact size for 26 secondary/inline call
sites (badges-with-actions, dense table-row buttons) where enlarging would
hurt, not help. One line changed in one shared component; every caller
app-wide picks it up automatically.

**Test:** `tests/button-touch-target.test.ts` (new, 3 tests) — asserts
`"md"` carries `min-h-12`, `"sm"` deliberately does not, and the rule
applies to every button variant, not just `primary`. This project's
`tests/` directory is Supabase-RPC integration tests only (no
component-render infra); `buttonClass()` returns a plain string so it
fits the existing `.ts`-only pattern without adding new tooling. Verified:
`Test Files 1 passed (1)`, `Tests 3 passed (3)`.

**Type-A forensic sweep** (handoff-required, all 8 categories: triggers,
constraints, RPC/state-transition guards, RLS/grants, client-side state
gating, duplicate-submit/idempotency, error/rollback paths, mobile
responsive behaviour) — swept explicitly rather than assumed safe for a
"just CSS" change; no follow-on defect in any category, the change is as
contained as it looks.

**What this loop does NOT claim:** not a Sarvam-compliance claim — DR-01
(bottom tab bar)/DR-03 (cards) already existing is a fact about prior
work, not evidence the rest of the Sarvam architecture (contextual
bottom-sheet forms, the full Case Detail local-nav set, the permission
matrix) is implemented. The full mismatch-list exercise waits for the
Boss's promised `MONARCH_Maintenance_Screen_Architecture.html`.

`tsc --noEmit`/`eslint`/`next build` all clean, including the anchored
`"use client"` re-scan (unaffected — `ui.tsx` has no `"use client"`
directive at all).
