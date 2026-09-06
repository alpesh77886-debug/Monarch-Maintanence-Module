Project: MONARCH — Maintenance Module
Current approved design version: v0.2 LOCKED
Current loop: Loop 8 (complete) — mid-batch (Loops 6-10; hard gate re-triggers
  after Loop 10 per IMPLEMENTATION_PACK.md §19.11)
Current gate: none open right now — Gate 1 (Loops 01-05) was approved by the
  Boss ("Loop 2-5 continue karo"). Next hard gate is after Loop 10 —
  autonomous work stops there until re-approved. See APPROVAL_GATE.md.

Open defects: none known unresolved. RISK-08/09 (Loop 2), RISK-10/11/12
  (post-Loop-5 bugfix round triggered by a Boss-reported login failure),
  RISK-13 (Loop 8 — `is_manager()` NULL-propagation authorization bypass,
  found and fixed while building `approve_spare_request`) all RESOLVED and
  verified against the live deployment. No CRITICAL or HIGH defects
  currently open.
Highest severity open: none.

Vercel status: LINKED and GREEN. Team `Monarch` (monarch-92be), project
  `monarch-maintenance-module`. SSO/deployment protection is OFF (fixed
  Loop 2). App-level Supabase auth is the actual access boundary. `main`
  is the configured production branch; PRs #1 (Loops 1-5) and #2 (Loop 6)
  are merged.
Sentry status: LINKED, SDK wired, verified live (Loop 2). Org `monarch-bo`,
  project `monarch-maintenance-module`.
Test status: Vitest integration suite wired into CI (`npm test` in
  `.github/workflows/ci.yml`), run as real signed-in users against the live
  `maintenance` schema. 17 tests from Loop 6 (Scenario A/B/C, negative
  transitions, idempotency, append-only, RLS bypass denials, ownership
  race, WAITING) confirmed passing in real GitHub Actions CI. Loop 7 added
  10 more (§6 claim/confirm, notifications) and Loop 8 added 7 more
  (§16 spare request/usage, the `is_manager()` NULL regression) — 34 tests
  total across 5 files, structurally verified in this sandbox (lint clean,
  `next build` type-checks clean, loads and executes in order, network
  call fails here only because the sandbox's egress proxy blocks
  `*.supabase.co` — RISK-05); real signal is the next GitHub Actions run.
  Browser E2E (`e2e/smoke.mjs`) still has not run — same network
  restriction (RISK-05, still open).

Pending evidence gates: PENDING-01 (LOTO/PTW SOP — untouched, only seam
  columns exist), PENDING-02 (moot — Production module still has no live
  schema), PENDING-03 (granular permission matrix beyond the 2 locked
  roles), PENDING-04 (recurrence threshold/window — recurrence not started
  yet), PENDING-05 (none discovered).

Loop 7 highlights (see CHANGELOG.md for full detail):
  - §6 emergency two-step workflow actually implemented (`claim_emergency`/
    `confirm_emergency`) — the `emergency_claimed`/`emergency_confirmed`
    columns existed since Loop 1 but no RPC ever set them until now.
  - §23 notifications: `maintenance.notifications` table + RLS +
    `mark_notification_read`, wired into `acknowledge_case` and
    `mark_wait_resolved`.
  - §7.2/§7.3 timer escalation: `pg_cron`-scheduled
    `maintenance.run_escalation_scan()` (every 5 min) handles the 24h
    WAITING resume-ready escalation + 24h repeat Manager reminder, and the
    1h confirmed-emergency escalation. Client `EXECUTE` revoked — verified
    a client call gets `permission denied`, not a business-logic error.
  - UI: `EmergencyPanel` on the case detail page, `NotificationBell` in the
    app header.

Loop 8 highlights (see CHANGELOG.md for full detail):
  - §16 spare request/usage RPCs (`raise_spare_request`,
    `approve_spare_request`, `record_spare_usage`) — closed a real RLS gap
    where any authenticated user could previously self-set
    `requires_manager_approval`/`approved_by`/`approved_at` by direct
    insert.
  - §3.3 ₹12,000 Manager-approval threshold computed server-side, never
    client-supplied; mandatory approval-proof reference; usage blocked
    until a required approval is actually on record.
  - **RISK-13 found and fixed**: `is_manager()` returned NULL (not false)
    for non-staff callers, which would have let a non-staff caller bypass
    the Manager-only approval guard undetected. Fixed at the source.
  - UI: `SparesPanel` on the case detail page.

Last verified commit/reference: see `git log` on `claude/new-session-edkk1u`
  (Loop 8 migrations `0009_maintenance_spares.sql` and
  `0010_maintenance_is_manager_null_fix.sql` applied live to Supabase
  project `maavrlqkdrisjwzhjdgg` and verified via `execute_sql` before this
  commit was pushed).
Next authorized work: Loop 9 (duplicate case + false-complaint closure,
  §4.6/§4.7) per the Boss's "Loop 2-5 continue karo" approval extended to
  the current Loops 6-10 batch. Loop 10 ends with
  `APPROVAL_REPORT_LOOP_06_10.md` and a hard STOP for Boss re-approval.
Approval state: AUTONOMOUS DEVELOPMENT IN PROGRESS (Loops 6-10 batch).

Demo/test logins (rotate or remove before real rollout):
  Executive:  exec1@monarch.test / Loop1TestPass!23
  Manager:    mgr1@monarch.test  / Loop1TestPass!23
  Technician: tech1@monarch.test / Loop1TestPass!23 (no maintenance.staff
    row — represents a plain technician identity, not Executive/Manager)
