Project: MONARCH — Maintenance Module
Current approved design version: v0.2 LOCKED
Current loop: Loop 16 (complete) — mid-batch (Loops 16-20; hard gate
  re-triggers after Loop 20 per IMPLEMENTATION_PACK.md §19.11)
Current gate: none open — Gate 3 (Loops 11-15) was approved by the Boss via
  explicit confirmation ("Haan, Loop 16-20 shuru karo" — Yes, start Loop
  16-20 — given through AskUserQuestion after the model was switched to
  Sonnet 5 and the gate report was re-surfaced, satisfying §19.13's
  requirement for explicit continuation language). Next hard gate is after
  Loop 20. See APPROVAL_GATE.md.

Open defects: none known unresolved. RISK-08/09 (Loop 2), RISK-10/11/12
  (post-Loop-5 bugfix round triggered by a Boss-reported login failure),
  RISK-13 (Loop 8 — `is_manager()` NULL-propagation authorization bypass),
  RISK-14 (Loop 9 — a rewrite of `transition_case` silently dropped the
  §13 QC gate; caught by CI, not by manual review), RISK-15 (Loop 14 — the
  first view in this schema shipped without `security_invoker` and read
  past RLS; measured live, fixed, regression-tested), and RISK-16 (Loop 14
  — the test suite exhausted Supabase's auth rate limit, producing red CI
  that was infrastructure, not product) all RESOLVED and verified against
  the live deployment. No CRITICAL or HIGH defects currently open.
Highest severity open: none.

Vercel status: LINKED and GREEN. Team `Monarch` (monarch-92be), project
  `monarch-maintenance-module`. SSO/deployment protection is OFF (fixed
  Loop 2). App-level Supabase auth is the actual access boundary. `main`
  is the configured production branch; PRs #1-#5 (Loops 1-5, 6, 7, 8, 9)
  are all merged.
Sentry status: LINKED, SDK wired, verified live (Loop 2). Org `monarch-bo`,
  project `monarch-maintenance-module`.
Test status: Vitest integration suite wired into CI (`npm test` in
  `.github/workflows/ci.yml`), run as real signed-in users against the live
  `maintenance` schema. 17 tests from Loop 6, +10 Loop 7 (§6 claim/confirm,
  notifications), +7 Loop 8 (§16 spares, `is_manager()` regression), +4
  Loop 9 (§4.6/§4.7), +6 Loop 10 (§17 PM), +6 Loop 12 (§22 handover),
  +7 Loop 13 (§13 production boundary), +8 Loop 14 (§25 impact/KPI),
  +9 Loop 15 (§18 recurrence, §19 CAPA), +10 Loop 16 (§5.4 priority override,
  §14.2 PTW gate) — **81 tests across 12 files** (counted from `it()` blocks), all confirmed
  passing in real GitHub Actions CI (including catching and driving the
  RISK-14 fix).
  (Correction: the Loop 10 gate report said "44 tests across 7 files"; the
  real figure at that point was 40. Counted from `it()` blocks — see
  CHANGELOG Loop 12.)
  Browser E2E: NEW in Loop 11 — 8 Playwright tests (`e2e/*.spec.ts`) wired
  into CI as their own `e2e` job. First CI run: 6/8 passed, including all
  four sign-in flows; the 2 failures were wrong assertions in the test code
  itself, since fixed. 2 specs (signed-out) also pass in this sandbox — the
  first browser tests ever to run here. See RISK_REGISTER.md RISK-05.

CI note (Loop 14): `signInAs()` now caches one signed-in client per role.
  Signing in per test had grown to ~78 GoTrue `/token` requests in ~80s from
  one CI IP and was tripping Supabase's auth rate limit — red CI that was
  infrastructure, not product (RISK-16). CI also now runs on `push` to
  `main` plus `pull_request` only, with a `concurrency` group, so a PR
  commit no longer starts two workflows racing on the same live project.

Pending evidence gates: PENDING-01 (LOTO/PTW SOP — untouched, only seam
  columns exist), PENDING-02 (moot — Production module still has no live
  schema), PENDING-03 (granular permission matrix beyond the 2 locked
  roles), PENDING-04 (recurrence threshold/window — recurrence, §18, still
  entirely unbuilt), PENDING-05 (none discovered).

Batch progress (Loops 11-15, current batch):
  - Loop 11: browser E2E (Playwright) wired into CI as its own job —
    closed RISK-05, open since Loop 1. 8/8 green.
  - Loop 12: §22 shift handover / availability.
  - Loop 13: §13 production restart boundary (safety stops, §13.1/§13.2
    recording that never silently clears a stop).
  - Loop 14: §25 KPI reporting + production impact capture — the one real
    §25 gap was that "downtime minutes" and "output loss kg" had nowhere to
    live. Added `case_impact_records` (nullable measures, mandatory basis,
    append-only corrections via `supersedes_record_id`),
    `record_production_impact`, the `case_current_impact` view, an impact
    panel on the case page, and a new `/kpi` page. RISK-15 (view bypassed
    RLS) and RISK-16 (CI auth rate limit) both found and fixed in this loop.
  - Loop 15: §18 recurrence detection + §19 CAPA. The threshold and window
    are PENDING-04, so `recurrence_rules` ships EMPTY and the scan flags
    nothing until a Manager configures a tier — detection is dormant by
    construction, and a test asserts no active rule exists. The scan writes
    SUSPECTED only; no code path declares root cause without a human. CAPA
    owner and effectiveness verifier are both the Manager, and a
    system-proposed CAPA is labelled "suggested — not certified" (§19).

Batch summary (Loops 6-10 — see CHANGELOG.md for full per-loop detail):
  - Loop 6: Vitest integration suite wired into CI.
  - Loop 7: §6 emergency two-step (`claim_emergency`/`confirm_emergency`),
    §23 notifications (`maintenance.notifications` + RLS +
    `mark_notification_read`), §7.2/§7.3 timer escalation
    (`run_escalation_scan`, pg_cron every 5 min).
  - Loop 8: §16 spare request/usage RPCs, §3.3 ₹12,000 Manager-approval
    threshold computed server-side. RISK-13 found and fixed
    (`is_manager()` NULL propagation).
  - Loop 9: §4.6 duplicate case linkage (`mark_duplicate_case`), §4.7
    reporter-driven false/wrong complaint closure
    (`close_false_complaint`).
  - Loop 10: §17 preventive maintenance — `create_pm_plan`/
    `approve_pm_plan` (RECURRING proposed-by-staff/approved-by-Manager vs.
    ONE_TIME Manager-only/self-approved), `link_pm_instance_to_case`/
    `complete_pm_instance`/`reschedule_pm_instance` (history-preserving),
    `run_pm_scan` (pg_cron hourly) for generation + `PM_OVERDUE` alerts.
  - **RISK-14** (between Loop 9 and 10): Loop 9's `transition_case`
    rewrite was built from a stale copy of the function and silently
    dropped the Loop 5 QC gate. Caught by CI on PR #5, not by manual
    review — reproduced live, fixed at the source
    (`0012_maintenance_qc_gate_regression_fix.sql`), re-verified, and the
    process gap that caused it (a live-only fix with no matching migration
    file) is now called out explicitly in CHANGELOG.md as a standing
    process rule for this repo.

Migrations applied: 0008 (Loop 7) through 0019 (Loop 16), all live on
  Supabase project `maavrlqkdrisjwzhjdgg` and verified via `execute_sql`
  before each was pushed. 0019 (Loop 16) is this batch's — it touches
  `transition_case` for the third time (adding the §14.2 PTW gate) and was
  built from the LIVE function definition, not a migration file, per the
  standing process rule from the RISK-14 incident; a full regression of every
  pre-existing guard was re-verified live immediately after applying.

Batch progress (Loops 16-20, current batch):
  - Loop 16: §5.4 priority Manager-override (`change_priority`, an Executive
    may change freely until a Manager sets it, after which only a Manager
    can move it further) + §14.2 PTW safety gate seam (`set_ptw_required`/
    `link_ptw_proof`, gating `DIAGNOSING -> IN_REPAIR` when required and
    unproven) — closing two real gaps in §32 items 3 and 19 that had been
    sitting as dead columns/no-override logic since Loop 1.
  - Loop 17-20: NOT STARTED.

Approval state: RUNNING — the Boss approved Loops 16-20. The next HARD GATE
  falls after Loop 20, where autonomous development stops again pending
  explicit continuation language (APPROVAL_GATE.md /
  IMPLEMENTATION_PACK.md §19.13).

Recurrence status (important): §18 detection is BUILT BUT INERT. It will
  produce nothing at all until the Boss supplies PENDING-04 (threshold +
  window) and a Manager enters it. One deactivated [AUTOTEST] rule remains in
  `recurrence_rules`, labelled "NOT an approved plant threshold"; 0 rules are
  active and the scan returns flags_created: 0.

Demo/test logins (rotate or remove before real rollout):
  Executive:  exec1@monarch.test / Loop1TestPass!23
  Manager:    mgr1@monarch.test  / Loop1TestPass!23
  Technician: tech1@monarch.test / Loop1TestPass!23 (no maintenance.staff
    row — represents a plain technician identity, not Executive/Manager)
