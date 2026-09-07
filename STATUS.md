Project: MONARCH — Maintenance Module
Current approved design version: v0.2 LOCKED
Current loop: Loop 24 (complete) — batch Loops 21-25 in progress
Current gate: **GATE 4 CLOSED.** The Boss approved continuation for Loops
  21-25 via an explicit choice (visual-style-upgrade-only scope for the
  dashboard/KPI work, confirmed before Loop 21 began) after reviewing
  APPROVAL_REPORT_LOOP_16_20.md. Batch Loops 21-25 is now in progress; the
  next hard gate is after Loop 25 (IMPLEMENTATION_PACK.md §19.9/§19.13).
  See APPROVAL_GATE.md.

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
  §14.2 PTW gate), +6 Loop 17 (§9.1 validated root cause), +4 Loop 18
  (§5.1 evidence attachment), +2 Loop 19 (§5.1/§24 major/complex intake),
  +4 Loop 20 (§5.1 asset linkage), +1 Loop 22 (§10 restoration follow-up
  flag), +3 Loop 23 (§18 `set_recurrence_rule_active`, previously
  zero coverage), +5 Loop 24 (§16.2 Stores reference RPCs, previously
  zero coverage) — **106 tests across 16 files** (counted
  from `it()` blocks), all confirmed
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

Batch summary (Loops 11-15 — see CHANGELOG.md for full per-loop detail):
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

Migrations applied: 0008 (Loop 7) through 0023 (Loop 24), all live on
  Supabase project `maavrlqkdrisjwzhjdgg` and verified via `execute_sql`
  before each was pushed. 0019 (Loop 16) touches `transition_case` for the
  third time (adding the §14.2 PTW gate), built from the LIVE function
  definition per the standing RISK-14 process rule, with a full regression
  of every pre-existing guard re-verified live immediately after applying.
  0020 (Loop 17) adds the second view in this schema, `case_current_root_cause`
  — created WITH `security_invoker = true` from its first line (verified via
  `pg_class.reloptions` right after creation), applying the RISK-15 lesson
  prospectively rather than needing a second fix. Loop 18 adds NO migration —
  `maintenance.evidence` and its RLS have existed since Loops 1/2 and were
  simply never used until now. 0022 (Loop 22) edits `record_restoration`,
  also built from the LIVE definition per RISK-14 — only the
  `follow_up_required` value is new, the rest byte-identical to what was live.

PR #12 (Loop 16) needed two post-open CI fixes before it merged: a test-helper
  logic bug, and a genuine Next.js server/client boundary bug (a plain helper
  function exported from a `"use client"` file, called directly from the
  Server Component) — invisible to `tsc`/`lint`/`build`, only surfacing on an
  actual authenticated page render, which only CI's e2e job could exercise
  (this sandbox has no live Supabase access, RISK-05). Both fixed and
  verified live in CI; every `"use client"` file in the app has since been
  re-scanned after each subsequent loop for the same pattern (none found).

Batch summary (Loops 16-20 — see CHANGELOG.md for full per-loop detail):
  - Loop 16: §5.4 priority Manager-override (`change_priority`, an Executive
    may change freely until a Manager sets it, after which only a Manager
    can move it further) + §14.2 PTW safety gate seam (`set_ptw_required`/
    `link_ptw_proof`, gating `DIAGNOSING -> IN_REPAIR` when required and
    unproven) — closing two real gaps in §32 items 3 and 19 that had been
    sitting as dead columns/no-override logic since Loop 1.
  - Loop 17: §9 item 6 / §9.1 validated root cause. `record_root_cause`
    (staff-only, mandatory validation basis, append-only corrections via
    `supersedes_record_id`) closes the last of §9's 8 diagnosis/intervention
    concepts that had no seam — previously root cause could only be recorded
    against a CONFIRMED recurrence flag, leaving ordinary one-off cases with
    nowhere to record one at all.
  - Loop 18: §5.1 / §26 evidence attachment. No new migration —
    `maintenance.evidence` has existed since Loop 1 with correct RLS since
    Loop 2 (any authenticated user may attach evidence to a case they can
    see, not staff-only, matching how case reporting itself works) but
    nothing had ever written to it or displayed it. A test-writing mistake
    was caught before shipping: RLS-blocked UPDATE/DELETE via PostgREST
    reports success with zero rows affected, not an error — the test now
    asserts the row is provably unchanged instead.
  - Loop 19: §5.1 / §24 major/complex classification at intake. No new
    migration or RPC — `cases.major_complex_flag` and its RLS have existed
    since Loop 1 (the reporter's own insert policy already permits setting
    it); this loop is intake-form UI plus list/detail badges. Deliberately
    no later change/override flow — the pack documents the classification
    happening at creation, not a revision mechanism for it.
  - Loop 20: §5.1 asset/machine linkage. No new RPC — `case_assets` and its
    RLS have existed since Loop 1/2 (staff-only, same shape as evidence)
    but nothing had ever written to it. Adds one trigger
    (`case_assets_mark_known`, `SECURITY DEFINER` — confirmed live first
    that `cases` has no direct UPDATE policy at all, so a plain trigger
    would have failed) keeping `cases.asset_known` honest once a real link
    is made. Also the knock-on fix: §18's recurrence `ASSET_REF` match tier
    (Loop 15) could never produce a match before this loop — verified live
    that it now does (3 cases sharing one linked asset -> 1 flag).

Approval state: Gate 4 approved. Loops 21-25 in progress.

Batch summary (Loops 21-25, current batch — see CHANGELOG.md for full detail):
  - Loop 21: dashboard/KPI visual upgrade. Boss-scoped explicitly to
    presentation only (no new modules/nav — a real scope boundary was
    confirmed via AskUserQuestion after several unrelated third-party CMMS
    screenshots were shown for visual reference). No migration, no RPC.
    New shared `StatCard`/`BarBreakdown` components (plain server-safe
    module, no `"use client"`). While touching `/kpi`, found and fixed a
    real stale-copy defect: the page said §18 recurrence/§19 CAPA were
    "not implemented yet" — false since Loop 15 — and never queried either
    table. Now shows real counts (verified live: 2 recurrence flags, 15
    CAPA links already existed and were invisible before this loop).
  - Loop 22: §10 permanent-repair follow-up responsibility.
    `restorations.follow_up_required` has existed since Loop 1 but
    `record_restoration` never set it. The rest of §10 was already
    correctly built (Loop 5's RISK-12 transition-graph guard + the
    existing `FollowUpButton` UI) — the real gap was narrower: once a case
    moved past `TEMPORARILY_RESTORED`, the fact it ever needed a stop-gap
    fix became unrecoverable from the schema. Migration 0022 sets
    `follow_up_required = (restoration_type = 'TEMPORARY')` on insert,
    built from the LIVE `record_restoration` definition per the standing
    RISK-14 rule. New `restoration-history-panel.tsx` on the case page
    (nothing showed TEMPORARY restorations before this loop) and a new
    `/kpi` metric. Investigated `evidence_ref` (also zero references
    anywhere) and deliberately left it alone — Loop 18's general evidence
    table already covers "preserve evidence" for restorations; a second,
    parallel free-text pointer would be redundant, not a fix.
  - Loop 23: §18 recurrence-rule configuration UI. `create_recurrence_rule`
    and `set_recurrence_rule_active` (Loop 15) were fully correct and
    fully unreachable from this app — the only caller had ever been direct
    SQL, by me, for testing. New `/recurrence-rules` page (staff-read,
    Manager-act, matching each RPC's own guard) does not resolve
    PENDING-04 — no field defaults a threshold/window, and
    `approval_note` stays mandatory. Closed a real automated-test gap
    found along the way: `set_recurrence_rule_active` had zero coverage
    before this loop.
  - Loop 24: §16.2 explicit Stores reference identifiers.
    `stores_reference_status`/`stores_reference_id` on `spare_requests`
    and `spare_usage` have existed since Loop 1 (default
    `STORES_REFERENCE_PENDING`/`null`) but no RPC could ever change them.
    New RPCs `set_spare_request_stores_reference`/
    `set_spare_usage_stores_reference` (staff-only, mandatory status —
    deliberately unconstrained text, matching the column's own lack of a
    `check` constraint since the real vocabulary is Stores' own once
    Phase-3 integration exists). `spares-panel.tsx` now shows and lets
    staff update the Stores status/reference per row.

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
