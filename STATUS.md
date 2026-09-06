Project: MONARCH — Maintenance Module
Current approved design version: v0.2 LOCKED
Current loop: Loop 1 (complete)
Current gate: Pre-gate (hard gate applies at Loop 5 — 4 loops remain in this batch)
V1 completion %: ~15% against the 25-item §32 acceptance scope (core lifecycle
  data model + state engine + auth + minimal execution UI landed; PM,
  spares UI, notifications/escalation, KPIs, recurrence, LOTO/PTW, and most
  of the mobile execution flow are not started)

Completed requirements (from §32):
6 (core lifecycle with valid-transition enforcement) — DONE server-side, minimal UI.
7 (diagnosis/intervention records with separated semantics) — data model DONE, no dedicated UI yet (only the observation journal has UI).
8 (temporary restoration as explicit non-closure state) — data model + transition graph DONE, no UI.
9 (technical restoration + verification + failure path) — data model + transition graph DONE, no UI.
10 (QC-required gate + manual send-to-QC + rejection history) — data model + transition graph DONE, no UI.
11 (MAINTENANCE_RELEASED boundary) — DONE.
12 (production non-restart / started-without-release recording) — columns exist, no operation wired yet.
13 (reopen / duplicate / false complaint) — reopen DONE end-to-end (RPC + tested); duplicate/false-complaint are schema-ready, no RPC/UI yet.
20 (audit + idempotency) — DONE and verified (see Evidence below).
21 (mobile-first execution UX) — partial: login, case list, report case, acknowledge, observation journal are mobile-first; most other actions have no UI yet.
23 (security/access foundation) — DONE: RLS on all 21 tables, 2 locked roles, SECURITY DEFINER RPCs are the only path to mutate case state.
24 (Executive Observation + Action Continuity Journal) — DONE end-to-end (schema + UI + RLS).
2 (acknowledgement + ownership + notification) — acknowledgement + ownership DONE and tested; notification delivery not built yet.
1 (Maintenance Case intake) — DONE (report-case UI + RLS).
14 (WAITING + INTERNAL/EXTERNAL + free text + dependency) — schema DONE, no RPC/UI yet.
25 (spare usage traceability) — schema DONE, no RPC/UI yet.

Not started: 3 (triage/priority Manager override UI), 4 (technician assignment UI), 5 (emergency intervention), 15 (resume-ready/escalation/reminders), 16 (shift handover/availability), 17 (PM), 18 (LOTO/PTW seams beyond columns), 19 (KPI/impact), 22 (KPI capture).

Open defects: none known (see Evidence — every backend path exercised passed;
  no browser E2E run yet against the live deployment, see below).
Highest severity: none open.

Vercel status: LINKED and GREEN. Team `Monarch` (monarch-92be), project
  `monarch-maintenance-module` (prj_iBJOL0iGapB4Id3w9r49IDUV7vBf), linked to
  this GitHub repo — pushing to `claude/new-session-edkk1u` auto-deploys.
  Two deployments confirmed READY + verified 200 on /login (via the Vercel
  MCP's own fetch tool — this sandbox's own egress proxy blocks *.vercel.app,
  so a plain curl from here can't reach it, but the app itself is live):
  - https://monarch-maintenance-module.vercel.app (commit d5336c4, pre-Sentry)
  - https://monarch-maintenance-module-git-claude-new-s-e548d3-monarch-92be.vercel.app
    (commit 3b578b3, current HEAD, includes Sentry)
Sentry status: LINKED, SDK wired, deploy confirmed green. Org `monarch-bo`,
  project `monarch-maintenance-module` (id 4512038433456128), DSN wired into
  client/server/edge instrumentation, build succeeds with it in place. No
  SENTRY_AUTH_TOKEN available in this environment, so source-map upload is
  skipped (build warns, does not fail) — stack traces will be minified until
  a token is added. No real error event has been triggered/confirmed in the
  Sentry UI yet — that still needs a live check (e.g. via e2e/smoke.mjs
  causing a deliberate error, or the next real bug).
Test status: no automated test suite (unit/integration framework) set up
  yet — that is real scope debt, not covered by the manual verification
  below. Manual backend verification performed directly against Postgres via
  simulated JWT claims (Supabase MCP execute_sql), covering: happy-path
  lifecycle (Scenario A, REPORTED→...→CLOSED), invalid-transition rejection,
  reopen (Scenario F), idempotent replay of transition_case (2 calls, 1
  event), append-only enforcement (direct case_events INSERT correctly
  denied by RLS), first-valid-actor ownership race (2nd take_ownership
  correctly raises ALREADY_OWNED). Browser E2E (e2e/smoke.mjs, Playwright)
  could not be run against `next dev` in this sandbox — its egress proxy
  policy-denies *.supabase.co — and has not yet been run against the live
  Vercel deployment either.
Pending evidence gates: PENDING-01 (LOTO/PTW SOP), PENDING-02 (moot for now —
  Production module has no live schema either), PENDING-03 (granular
  permission matrix beyond the 2 locked roles), PENDING-04 (recurrence
  threshold/window values), PENDING-05 (none discovered yet).

Last verified commit/reference: 3b578b3 (pushed to claude/new-session-edkk1u)
Last gate report: none yet (gate triggers at Loop 5)
Next authorized work (priority order): (1) run e2e/smoke.mjs against the live
  Vercel URL and fix anything it finds; (2) trigger + confirm one real Sentry
  test event; (3) technician assignment + intervention recording UI;
  (4) WAITING overlay UI + RPCs; (5) QC send/clearance UI + RPCs.
Approval state: AUTONOMOUS DEVELOPMENT IN PROGRESS — Loop 1 complete,
  pre-gate (Loops 2–5 remain before the hard Boss gate).

Demo/test login (rotate or remove before real rollout):
  Executive: exec1@monarch.test / Loop1TestPass!23
  Manager:   mgr1@monarch.test  / Loop1TestPass!23
