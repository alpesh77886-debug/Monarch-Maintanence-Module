Project: MONARCH — Maintenance Module
Current approved design version: v0.2 LOCKED
Current loop: Loop 38 complete (batch 36-40). Loop 36 turned the forensic
  brief's red-team matrix into a permanent suite (17 attacks, all refused).
  Loop 37 audited escalation paths and found RISK-25 (INTERNAL waits can
  never escalate — evidence-controlled, deliberately NOT fixed). Loop 38
  verified PM generation/overdue are correct despite a ratio that looks
  broken (164 approved plans, 3 instances — frequencies are 14-30 days on a
  1-day-old database; 0 plans are actually owed an instance), and found and
  FIXED RISK-26: three sites delivered the same notification twice to the
  same person when the case owner was also a Manager. Proven by microsecond-
  identical timestamps, so not a race — a double-send by construction.
  Migration 0035 dedupes the recipient set without dropping any recipient.
  PRODUCTION READINESS VERDICT: **NOT READY** — three Boss-side blockers
  plus RISK-25 as a fourth open evidence question.
  Live-data fact: 8,254 cases, ZERO of them real business records.
Current gate: **GATE 7 (Loops 31-35) AWAITING BOSS.** Autonomous
  loop-batch engineering is paused per IMPLEMENTATION_PACK.md §19.9/§19.13
  until the Boss gives explicit continuation language for the next audit
  batch. The UI-redesign and performance tasks above are separate,
  explicit Boss instructions, not a continuation of the audit batches —
  the "Loop 36/37/38" numbering there is the Boss's own three-step
  framing for that one task, not a resumption of the gated cadence.
  See APPROVAL_GATE.md.

Open defects: none known unresolved. RISK-08/09 (Loop 2), RISK-10/11/12
  (post-Loop-5 bugfix round triggered by a Boss-reported login failure),
  RISK-13 (Loop 8 — `is_manager()` NULL-propagation authorization bypass),
  RISK-14 (Loop 9 — a rewrite of `transition_case` silently dropped the
  §13 QC gate; caught by CI, not by manual review), RISK-15 (Loop 14 — the
  first view in this schema shipped without `security_invoker` and read
  past RLS; measured live, fixed, regression-tested), and RISK-16 (Loop 14
  — the test suite exhausted Supabase's auth rate limit, producing red CI
  that was infrastructure, not product), RISK-17 (Loop 25 —
  `clearances_insert` allowed a direct client insert bypassing
  `send_to_qc`'s TECHNICALLY_RESTORED guard entirely; not live-exploitable
  as a lifecycle bypass since `transition_case`'s own graph check still
  protects the actual status, but a real server-side enforcement gap on a
  locked boundary, same shape as the Loop 8 spares fix), and RISK-18
  (Loop 26 — `case_assignments_insert`'s `emergency_direct_start` path
  never checked the target case was an actual confirmed emergency; a
  non-staff technician could self-grant intervention/spare-usage rights
  on ANY case), and RISK-19 (Loop 27 — `cases_insert` validated only
  `reporter_user_id`; any signed-in non-staff user could self-insert a
  case with `emergency_confirmed = true` or a fully-fabricated
  `status = 'CLOSED'`, bypassing the entire §4 LOCKED lifecycle graph and
  §6 two-step emergency gate at the root, with zero RPC/audit-trail
  involvement — CRITICAL, the highest-severity defect found in this
  project to date, strictly worse than RISK-18), and RISK-20 (Loop 28 —
  the 0025 fix for RISK-18 still left `assigned_by_user_id` client-writable
  on the `case_assignments` direct self-insert path; a self-service
  technician could forge it to a real staff member's id, falsely claiming
  staff mediation that never happened — MEDIUM, an audit-trail integrity
  gap rather than a lifecycle/authority bypass), and RISK-21 (Loop 29 —
  `record_spare_usage`'s `>₹12,000` Manager-approval gate (§3.3, named
  LOCKED in `CLAUDE.md`) was entirely conditional on a client-optional
  `p_spare_request_id` parameter; omitting it skipped the gate completely
  and also left the usage row untraceable to any named spare at all,
  violating §16.1's "mandatory V1" chain — HIGH, and the first finding
  this batch reachable through the shipped UI's own default dropdown
  selection, not only a direct API call), and RISK-22 (Loop 30 —
  `record_intervention`'s actor check never verified an actual
  `case_assignments` row existed, only comparing a client-supplied id to
  the caller's own; any signed-in non-staff user, with zero assignment to
  a case, could fabricate an intervention record on it — HIGH,
  live-exploitable audit-trail forgery; this app's own UI already gated
  the form correctly, so this was a pure server-side enforcement gap)
  all RESOLVED and verified against the live deployment. Loop 35's
  finding (`raise_safety_stop` never sent the §15-mandatory notification)
  was a missing-notification completeness gap, not a security/authority
  bypass — not logged as a new RISK entry, matching the Loop 22/Loop 34
  precedent for non-security completeness fixes. No CRITICAL or HIGH
  defects currently open.
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
  zero coverage), +9 Loop 25 (`observations`/`clearances`/`audit_log` RLS,
  new file, previously zero coverage), +3 Loop 26 (`case_assignments`
  `emergency_direct_start`, RISK-18, previously zero coverage), +4 Loop 27
  (`cases_insert` column lockdown, RISK-19, previously zero coverage on
  columns beyond `reporter_user_id`), +1 Loop 28 (`case_assignments`
  attribution lockdown, RISK-20), +1 Loop 29 (`record_spare_usage`
  requires a linked request, RISK-21; 2 pre-existing tests also updated,
  see CHANGELOG), +2 Loop 30 (`record_intervention` requires an active
  assignment, RISK-22), +1 Loop 34 (§8 observation journal, all 9
  canonical fields including intervention linkage), +2 Loop 35
  (`raise_safety_stop` §15 manager notification, previously zero
  coverage of any notification behavior on this RPC) —
  **129 tests across 17 files** (counted from `it()` blocks), all confirmed
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

Migrations applied: 0008 (Loop 7) through 0029 (Loop 30), all live on
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

Approval state: Gate 5 approved. Loops 26-30 in progress.

Batch summary (Loops 21-25 — see CHANGELOG.md for full per-loop detail):
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
  - Loop 25 (last of the batch): systematic RLS-coverage sweep — every
    RLS-enabled table cross-referenced against every test file for zero
    coverage. `observations`/`clearances`/`audit_log` came back.
    Live-verifying `clearances` before writing its test found RISK-17 (see
    RISK_REGISTER.md): `clearances_insert` let any staff member insert a
    row directly for any case in any status, bypassing `send_to_qc`'s
    `TECHNICALLY_RESTORED` guard entirely. Fixed via migration 0024
    (RPC-only, matching the Loop 8 spares precedent). New
    `tests/observations-clearances-audit.test.ts` (9 tests) closes all
    three tables' coverage gaps.

Batch summary (Loops 26-30, complete — see CHANGELOG.md for full detail):
  - Loop 26: RISK-18 — a live-exploitable authority bypass on
    `case_assignments`. Widened Loop 25's RLS audit to read every policy's
    live `qual`/`with_check` against its own migration's comment.
    `case_assignments_insert`'s `emergency_direct_start` path never
    checked the target case was an actual confirmed emergency — a
    non-staff technician could self-insert an active assignment row on
    ANY case, self-granting `canRecordIntervention`/`canRecordSpareUsage`
    (page.tsx's `isAssignedTechnician` check) with zero emergency
    requirement and zero staff mediation. Verified genuinely exploitable
    live, not theoretical. Migration 0025 adds an `emergency_confirmed`
    check; re-verified all three directions (exploit blocked, legitimate
    path preserved, staff-mediated `assign_technician` unaffected).
  - Loop 27: RISK-19 — CRITICAL, the most severe defect found in this
    project to date. `cases_insert` (the schema's single most
    consequential insert policy) validated only `reporter_user_id`,
    leaving every other column on `cases` — `status`, all `emergency_*`
    columns, `qc_required`, `current_owner_user_id`, `closed_at`,
    `closure_reason` — fully client-writable at INSERT time. Live-verified
    as a non-staff user: self-inserted a case with `emergency_confirmed =
    true` (no claim/confirm ceremony), and separately self-inserted a
    fully-fabricated `status = 'CLOSED'` case, bypassing the entire §4
    LOCKED lifecycle graph and §6 two-step gate at the root, with no RPC
    and no audit trail — and independently un-did Loop 26's RISK-18 fix
    (fake the emergency first, then walk the now-"legitimate"
    `emergency_direct_start` path). Migration 0026 rewrites `cases_insert`
    as an allow-list matching exactly the real intake form's fields;
    every other column forced to `is null`/`= false`/`= 'REPORTED'`.
    Re-verified: both exploits now fail (`42501`), the real intake payload
    still succeeds at safe defaults, and every lifecycle RPC is confirmed
    `SECURITY DEFINER` (bypasses RLS, unaffected).
  - Loop 28: RISK-20 — MEDIUM, an audit-trail integrity gap on
    `case_assignments`. The 0025/RISK-18 fix checked `emergency_confirmed`
    but still left `assigned_by_user_id`/`is_active`/`deactivated_at`
    client-writable on the direct self-insert path. Live-verified: a
    self-service technician could forge `assigned_by_user_id` to a real
    staff member's id on a genuinely confirmed emergency, producing a row
    that looks staff-mediated but isn't — defeating the whole point of the
    `emergency_direct_start` carve-out (that no staff mediated it).
    Migration 0027 forces `assigned_by_user_id is null`/`is_active =
    true`/`deactivated_at is null` — the only honest state a fresh
    self-service row can start in. Re-verified: forgery now fails
    (`42501`), legitimate self-insert unaffected, `assign_technician`
    (SECURITY DEFINER) unaffected.
  - Loop 29: RISK-21 — HIGH. Switched angle: read every `SECURITY
    DEFINER` RPC's guards against its own documented intent instead of
    RLS policies. `record_spare_usage`'s `>₹12,000` approval gate (§3.3,
    named LOCKED in CLAUDE.md) ran only `if p_spare_request_id is not
    null` — omitting that optional parameter skipped the gate entirely,
    and (since `spare_usage` has no `spare_name` of its own) also left
    the row untraceable to any named spare, violating §16.1's mandatory
    traceability chain. Reachable via the shipped UI's own default
    dropdown option ("(not linked to a request)"), not just a direct API
    call — the first such finding this batch. Migration 0028 makes
    `record_spare_usage` require `p_spare_request_id`; `spares-panel.tsx`
    updated to remove the unsafe default and guide raising a request
    first. Re-verified: omitted-link call now fails
    (`SPARE_REQUEST_REQUIRED`); linked low-value usage still succeeds;
    linked unapproved high-value usage still correctly blocks
    (`APPROVAL_REQUIRED`, unchanged).
  - Loop 30: RISK-22 — HIGH, last loop of the batch. Continued the RPC
    audit across the remaining ~40 `SECURITY DEFINER` functions; most
    held up. `record_intervention`'s actor check (Loop 3) was
    `is_staff() OR p_technician_user_id = v_actor` — never verified an
    actual `case_assignments` row existed, unlike `record_spare_usage`'s
    own migration comment, which already described `record_intervention`'s
    intent as "staff, or the actively assigned technician" — never
    actually implemented. Compounded by a NULL-propagation bug: omitting
    `p_technician_user_id` (its default) made the check evaluate `NULL`,
    which PL/pgSQL's `if` treats as false, silently skipping it too.
    Live-verified: an unassigned non-staff technician could fabricate an
    intervention on any case, both by self-attributing and by omitting
    the parameter. This app's UI already gated the form correctly — pure
    server-side gap. Migration 0029 requires an active assignment
    (matching `record_spare_usage`'s pattern) plus a separate check
    blocking impersonation of a different technician. Re-verified live in
    all four directions (both exploit variants blocked; genuine
    self-recording and staff-mediated recording unaffected).

Batch summary (Loops 31-35, current batch — see CHANGELOG.md for full detail):
  - Loop 31: two verification pieces, no code change. (1) Finished the
    `SECURITY DEFINER` RPC-guard audit — read the ~25 remaining functions
    not yet checked in Loops 26-30; none showed the RISK-21/RISK-22 shape
    or any other guard mismatch. The sweep is now exhausted across the
    whole schema (~55 functions, Loops 29-31). (2) Spot-checked (per the
    Loops 26-30 gate report §H.2) whether RISK-19/RISK-18 ever affected
    real data before their fixes: three read-only queries for
    fabricated-CLOSED cases, fabricated-emergency-confirmed cases, and
    RISK-18-shaped `case_assignments` rows. Every row found was this
    project's own `[AUTOTEST-Lxx]` verification data from Loops 26-27
    (`MC-003975`, `MC-003973`, `MC-003770`) — no real Boss/staff data was
    ever affected.
  - Loop 32: new angle — read every RLS SELECT policy for over-broad
    read-side exposure (prior loops 26-31 only audited write/authority
    paths). Found 4 tables with `using (true)` (open to any authenticated
    user, not staff-scoped): `cases`, `evidence`, `safety_stops`,
    `production_boundary_events`. `cases_select`'s own migration comment
    says "All staff can see all open work" but the actual policy is
    broader than staff-only. `evidence` already reviewed/accepted in
    Loop 18. Deliberately NOT fixed — narrowing read access would mean
    guessing at PENDING-03's still-unresolved permission matrix
    (RISK-04) rather than receiving it from the Boss. RISK-04's entry
    updated with these 4 concrete table names instead, so it's
    actionable when the Boss provides guidance.
  - Loop 33: cross-referenced 3 pack sections not yet closely read
    against implementation (§24 Automation vs Human Decision, §28
    Idempotency/Concurrency, §37 Test Matrix), same method as Loop 24.
    Checked trigger functions first — only 1 exists in the whole schema,
    already reviewed. All three sections came back clean: §24's
    security-relevant AUTO/NEVER-AUTOMATE items match actual code (e.g.
    `TEMPORARILY_RESTORED` has no lifecycle-graph edge to `CLOSED`,
    confirmed live); §28's every listed concurrency-sensitive operation
    uses `for update` or an atomic `update...where` guard; §37's
    "concurrent accept race" is tested, and the one uncovered item (no
    receiver on handover) is an already-disclosed, deliberate
    manual-verification-only gap from Loop 12, not a new finding. No
    code change this loop.
  - Loop 34: continued the pack cross-reference into §8 (Observation +
    Action Continuity Journal, "mandatory V1 feature") and found a real
    gap: `observation-form.tsx` only ever exposed 4 of the 9 fields §8's
    canonical structure requires per entry (`observation`, `action`,
    `current_condition`, `next_step`) — `result`, `pending_action`,
    `blocker`, `intervention_id`, and `evidence_ref` have existed as
    columns since Loop 1 but were silently unreachable through the app;
    every journal entry ever created via the UI has those five columns
    permanently NULL. Not an RLS gap (confirmed live: `observations_insert`
    never restricted which columns could be set) — a pure UI completeness
    fix on a section explicitly marked mandatory, nothing invented. Fixed:
    the form now has all 9 fields (`result`/`pending_action`/`blocker`/
    `evidence_ref` inputs, plus an optional intervention-linkage
    dropdown); `page.tsx`'s journal display now also shows the linked
    intervention and evidence reference; `CaseObservation` type completed
    to match the table. Live-verified the full 9-field insert against the
    real schema before writing any code.
  - Loop 35 (last loop of this batch): continued the pack cross-reference
    into §15 (Safety/Technical Stop) and found a real gap:
    `raise_safety_stop` (Loop 13) never sent the notification §15 calls
    mandatory ("Immediate Production Manager notification is mandatory").
    Live-verified before any fix: 271 real stops raised historically,
    zero notifications of any type ever tied to any of them, and
    `SAFETY_STOP_RAISED` wasn't even in the notification-type constraint.
    No Production Manager account exists in this standalone module
    (§3.1's two roles are the only ones) — migration 0015 already solved
    this exact problem for the closely related §13.1 breach notification
    by notifying every active `MAINTENANCE_MANAGER` instead, one function
    below `raise_safety_stop` in the same file; that pattern was simply
    never applied to the raise path itself. Not a security/authority
    bug — the stop's own gating and recording were always correct.
    Fixed: migration 0030 adds `SAFETY_STOP_RAISED` to the notification
    type constraint and applies the existing 0015 substitute-recipient
    pattern to `raise_safety_stop`. Live-verified end to end (real case,
    real manager, exactly one notification with the right case number/
    stop type/reason) before writing the test.

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
  QC:         qc1@monarch.test   / Loop1TestPass!23 (F-01/RISK-23 — no
    maintenance.staff row, holds an active maintenance.qc_authority grant.
    This is the ONLY identity that can record a QC CLEARED/REJECTED
    decision. It is a test/demo grant, NOT a plant QC authority record —
    the real grant is evidence-controlled per §12.)
