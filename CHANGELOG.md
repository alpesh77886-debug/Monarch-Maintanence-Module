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
