# Blueprint Gap Matrix — MONARCH Maintenance Architecture Blueprint vs. Repository

Boss request (verbatim intent): treat the uploaded `MONARCH_Maintenance_Architecture_Blueprint.html`
as the new architecture/evaluation specification, map it against the existing
repository, do not rewrite working business logic, produce a screen-by-screen +
interaction-by-interaction + data/permission + harness gap matrix, and only
after that implement bounded changes.

This document is that matrix. Method: read the Blueprint in full (35 sections,
2375 lines), then verified each claim against actual repo evidence — migration
SQL, RPC bodies, form components, RLS policies, and the existing test suite —
rather than against memory alone. Every GAP/QUESTION row below cites the exact
file/line evidence. Where a section was not independently re-verified this
pass (scope/time), it says so explicitly rather than claiming false certainty.

## 0. Governance note — version discrepancy (flag, not a silent resolution)

The Blueprint's footer states: *"Derived from the LOCKED Implementation Pack
v0.3"* and its hero card says Design State LOCKED, approved 2026-09-06.

This repository's `IMPLEMENTATION_PACK.md` header states: *"Claude Code
Implementation Pack v0.2 — LOCKED / APPROVED"*, same approval date
(2026-09-06).

**These are two different version numbers for what is, content-wise, the same
locked contract** (same 13-state lifecycle, same two roles, same ₹12,000
boundary, same PENDING-01..05 gates, same §9 8-field diagnosis model). Per
CLAUDE.md's priority order, `IMPLEMENTATION_PACK.md` in this repo is the
priority-1 source of truth; this Blueprint is treated as Layer-2 architecture
guidance consistent with it, not a supersession — no content conflict was
found between the two documents in this pass. Flagging the version-number
mismatch here rather than silently assuming it's a typo; if the Boss has a
real v0.3 pack with content changes, that supersedes this matrix's findings
and should be supplied so `IMPLEMENTATION_PACK.md` itself can be updated
under a §42 Change Control entry.

## 1. Executive summary

The backend/data layer is **substantially more complete than the Blueprint's
own framing might suggest to a first-time reader** — this is Loop 53 of an
already-53-loop build, and Loops 1–45 built the full state machine, RBAC, QC
gate, PM, recurrence, CAPA, safety stops, spare traceability, notifications,
and KPIs before Loops 46–53 turned to visual/UX polish. Concretely: **26
tables, ~60 SECURITY DEFINER RPCs**, a locked transition-graph table enforced
server-side, RLS policies on every table, and 47 migrations already exist.

Three **genuine, confirmed gaps** were found — all three are gaps against the
repo's own already-LOCKED v0.2 pack, not new scope invented by the Blueprint:

| # | Gap | Class | Confirmed by |
|---|-----|-------|--------------|
| G1 | No UI path ever calls `transition_case(..., 'ASSESSED')` — the ACKNOWLEDGED→ASSESSED edge is only exercised by the Vitest suite calling the RPC directly | Full-stack (RPC exists, no caller) | `tests/lifecycle.test.ts:179-184` calls it manually; `grep` across `src/app` finds zero UI call sites |
| G2 | Case intake form has no `shift` field and captures no `priority` at creation | UI-only (columns exist) | `src/app/(app)/cases/new/page.tsx` — no `shift` state, no priority selector |
| G3 | Diagnosis/intervention data model captures only 3 of the LOCKED §9 8 fields (`action_taken`≈intervention, `result`, `failure_mode`) — `observed_symptom` and `immediate_action` have no column anywhere | Full-stack (no column) | `supabase/migrations/0001_maintenance_core_schema.sql:194-205` (interventions table definition) |

Everything else checked (below) is either a confirmed MATCH or an
already-tracked, already-PENDING item consistent with both documents — no
new business rule invention is proposed anywhere in this matrix.

## 2. Section-by-section matrix

Status legend: **MATCH** = repo evidence confirms full coverage. **PARTIAL**
= exists but incomplete per evidence above. **CONSISTENT-PENDING** = both
documents agree this is intentionally not yet decided (§34/§35 PENDING
gates) — not a defect. **NOT RE-VERIFIED** = plausible from session history
and general architecture but not independently re-checked line-by-line this
pass.

| § | Blueprint topic | Status | Evidence / note |
|---|---|---|---|
| 1 | Architecture overview / 4-layer model | MATCH | Repo structure mirrors this exactly (this CLAUDE.md's own layer split) |
| 2 | 13-state lifecycle + WAITING/NEEDS_INFORMATION overlays | MATCH | `case_status` enum (0001) has all 16 values (13 + REOPENED/DUPLICATE/REJECTED); `status_transitions` table (0003) encodes the exact locked graph |
| 3 | Data model (cases, events, interventions, spare_usage, waits, pm_plans) | MATCH | All named tables exist; `maintenance.cases` (0001) carries every field in the Blueprint's minimum semantic set including `production_not_restarted`, `emergency_confirmed_at`, `qc_required_change_reason` |
| 4 | Ownership boundaries (reference ≠ ownership) | MATCH | `production_case_ref`, `stores_reference_status` are plain text reference columns (0001:114-115), no FK into another module's schema anywhere in 47 migrations |
| 5 | Permission matrix (Executive/Manager) | MATCH (spot-checked) | `is_manager()` guards confirmed on `approve_spare_request` (0009), PM approval (0013), handover-without-consent (0014); `is_staff()` guards on acknowledge/assign/intervention |
| 6 | Auto vs Human vs Recommend vs Never-automate | MATCH | `run_escalation_scan`, `run_pm_scan`, `run_recurrence_scan` are the only autonomous state-affecting functions; no RPC declares root cause or QC clearance autonomously |
| 7 | Notifications (1h emergency / 24h normal / 24h reminder loop) | MATCH | `run_escalation_scan` (0008 era) + `case_notification_recipients`; confirmed in earlier loops' E2E (`roles-and-notifications.spec.ts`) |
| 8 | Screen: Dashboard | MATCH | `/dashboard` route exists, KPI cards, workload, aging — built Loop 21 |
| 9 | Screen: Case Queue | MATCH | `/cases` route |
| 10 | Screen: Case Detail (hub, click map) | MATCH | `/cases/[id]` — now tab-organized (Loop 51/52): Overview/Journal/Interventions/Assignments/Spares/Restorations/QC/Waiting/Audit/Evidence, sticky primary-action bar |
| 11 | Screen: Create Case | **PARTIAL — G2** | See §1 above |
| 12 | Screen: Acknowledge | MATCH | `acknowledge-form.tsx`: priority + initial assessment, concurrency-safe (`v_current not in ('REPORTED','NEEDS_INFORMATION')` guard) |
| 13 | Screen: Assessment / Triage | **GAP — G1** | See §1 above — no dedicated UI, no call site for the ACKNOWLEDGED→ASSESSED edge |
| 14 | Screen: Technician Assignment | PARTIAL (functional, but see G1) | `assign-technician-form.tsx` works and records the assignment correctly; because of G1 the case's `status` never actually reads ASSESSED or auto-advances to ASSIGNED when assigned from ACKNOWLEDGED — see proposed fix below |
| 15 | Screen: Emergency two-step | MATCH | `claim_emergency` / `confirm_emergency` (two distinct RPCs, two distinct actors); `emergency_confirmed_at` is what the 1h clock keys off, not `emergency_claimed` — verified in migration and in `case-flow.spec.ts`'s passing emergency test |
| 16 | Screen: Diagnosis / Intervention (8 fields) | **PARTIAL — G3** | See §1 above. Note: root cause (§9.6) is correctly NOT collapsed into intervention — it lives in its own `case_root_causes` table + `root-cause-panel.tsx`, and permanent-corrective-action/effectiveness-verification (§9.7/§9.8) correctly live in the CAPA flow (`recurrence-capa-panel.tsx`, `raise_capa`/`verify_capa_effectiveness`) rather than per-intervention — this reorganization is architecturally sound (those two concepts are case-level, not per-intervention-event), but §9.1/§9.2 (observed_symptom, immediate_action) have no home anywhere |
| 17 | Screen: Continuity Journal | MATCH | `observation-form.tsx` + `ObservationForm` captures all 7 FORM-006 fields (`observation`, `action`, `result`, `current_condition`, `pending_action`, `blocker`, `next_step`) plus `evidence_ref` |
| 18 | Screen: Temporary Restoration | MATCH | `restoration-form.tsx`, `TEMPORARILY_RESTORED → CLOSED` is absent from `status_transitions` (0003) — non-closure enforced server-side |
| 19 | Screen: Technical Restoration + Verification | MATCH | `verify_restoration` RPC; failure path returns to DIAGNOSING/IN_REPAIR per transition graph |
| 20 | Screen: QC / Clearance Gate | MATCH | `send_to_qc`, `qc_decision`; `CLEARANCE_PENDING → QC_REJECTED → DIAGNOSING/IN_REPAIR` all present in transition graph; no auto-QC anywhere |
| 21 | Screen: Waiting / Dependency | MATCH | `enter_waiting` requires explicit `reason_type` enum param (not inferred from text — matches R007) |
| 22 | Screen: Spare Request & Usage | MATCH | `raise_spare_request`, `record_spare_usage`, `approve_spare_request` (Manager-only, >₹12,000 gate confirmed in 0009), `STORES_REFERENCE_PENDING` pattern present |
| 23 | Screen: PM Calendar | MATCH | `/pm` route, `create_pm_plan`, `approve_pm_plan` (Manager-only), `run_pm_scan`, `reschedule_pm_instance` |
| 24 | Screen: Shift Handover | MATCH | Both forms exist: per-case `handover-form.tsx` AND bulk `handover_all_open_cases` wired into `sign-out-button.tsx` for the logout-with-unhanded-cases flow the Blueprint describes |
| 25 | Screen: Safety / Technical Stop | MATCH | `raise_safety_stop`, `lift_safety_stop`, `record_production_started_without_release` |
| 26 | Screen: Audit Trail | MATCH | `audit_log` table has only a SELECT RLS policy (0002) — no INSERT/UPDATE/DELETE policy for regular clients, so append-only is enforced by RLS default-deny, not just convention |
| 27 | Screen: Reopen / Duplicate / False Complaint | MATCH | `reopen_case` (Exec+Manager co-required — confirmed as its own dedicated function per the code comment in 0003), `mark_duplicate_case`, `close_false_complaint` |
| 28 | Form catalog F01–F38 | See G2/G3 | All fields present except the ones named in G2/G3 |
| 29 | Integration boundaries (Phase-1 standalone, reference-only) | MATCH | Confirmed no live cross-module API calls anywhere in the codebase; matches CLAUDE.md's own repository forensics (Production module is placeholder-only) |
| 30 | Harness engineering (5-loop gate) | MATCH | This is literally how this repo has operated since Loop 1 — `APPROVAL_GATE.md`, `APPROVAL_REPORT_LOOP_*.md` files exist for every completed batch |
| 31 | Enforcement registry R001–R015 | MATCH (spot-checked R003, R006, R007, R011, R012) | R003 confirmed above; R006 (`emergency_confirmed_at` not `emergency_claimed`) confirmed in §15 row; idempotency: `maintenance.idempotency_keys` table exists (0001) |
| 32 | Golden scenarios GS-A..H | NOT RE-VERIFIED end-to-end this pass | `tests/lifecycle.test.ts` and `e2e/*.spec.ts` cover large parts of GS-A/B/C/D/F/G individually (confirmed via grep), but a fresh full GS-by-GS trace was not re-run this pass — reasonable confidence, not claimed as freshly verified |
| 33 | Negative tests NS-001..020 | NOT RE-VERIFIED individually this pass | Many map to guards already confirmed above (NS-001 RBAC, NS-007 no-closure-from-temp, NS-009 emergency clock); a full NS-by-NS audit against the test suite would be a good, bounded Loop 54/55 task if the Boss wants it |
| 34 | Pending gates PENDING-01..05 | **CONSISTENT-PENDING** | All five map 1:1 to this repo's own already-tracked PENDING items (`docs/pending-gates.md`, RISK_REGISTER.md, and the Boss's own "baad me sochte hai" on recurrence threshold) — no drift, both documents agree these stay PENDING |
| 35 | Definition of Done (18 criteria) | Mostly MATCH, #16 "no regression" is what G1 threatens | Criterion 16 ("existing functionality does not regress") is exactly why G1 matters — it's not new scope, it's a live-lifecycle correctness gap in already-shipped code |

## 3. Detailed finding — G1 (highest priority: real lifecycle-correctness bug)

**What's wrong:** `maintenance.assign_technician` (migration 0004) has this
guard:

```sql
if v_current = 'ASSESSED' then
  perform maintenance.transition_case(p_case_id, 'ASSIGNED');
end if;
```

This only fires if the case is *already* in `ASSESSED` status. But no RPC or
UI path ever moves a case from `ACKNOWLEDGED` to `ASSESSED` — the edge exists
in `status_transitions` (0003) and `transition_case` can perform it, but
nothing calls it except the Vitest suite driving the RPC directly for test
setup (`tests/lifecycle.test.ts:179-184`).

**Real-world consequence:** an Executive who acknowledges a case and then
assigns a technician gets a working assignment record, but the case's
`status` column stays `ACKNOWLEDGED` — it never reaches `ASSIGNED`,
`DIAGNOSING`, etc. through this path. (Whether downstream RPCs like
`record_intervention` have their own status guards that would then also
reject was not traced in this pass — worth confirming as part of the fix.)

**Proposed bounded fix** (does not touch locked business meaning — the
ACKNOWLEDGED→ASSESSED→ASSIGNED graph is already locked in §4/0003, this only
makes the already-approved graph reachable):
- Loosen `assign_technician`'s auto-advance guard to `if v_current in
  ('ASSESSED', 'ACKNOWLEDGED') then perform transition_case(p_case_id,
  case when v_current = 'ACKNOWLEDGED' then ... end)` — but a direct
  ACKNOWLEDGED→ASSIGNED jump is NOT a valid edge in the locked graph, so this
  needs either (a) a two-step `transition_case('ASSESSED')` then
  `transition_case('ASSIGNED')` inside `assign_technician` when starting from
  ACKNOWLEDGED, or (b) a small explicit "Confirm Assessment" UI action
  (matching Blueprint Screen 13) that calls `transition_case('ASSESSED')`
  before assignment. Option (b) is closer to both documents' intent (§13 is a
  distinct screen with its own fields — assessment notes, asset linking,
  operational impact) and is the one this session recommends, but this is
  exactly the kind of design-shape decision that should be put to the Boss
  rather than picked unilaterally, per the "no silent architecture drift"
  rule — **flagging for Boss decision, not implementing without confirmation.**

## 4. Detailed finding — G2 (intake form fields)

Already known from an earlier Sarvam-verification pass this session (see
prior LOOP reports) — not a new discovery, now independently re-confirmed
against `IMPLEMENTATION_PACK.md §5.1` and the Blueprint's FORM-001 catalog
in agreement. `shift` is a text column already on `maintenance.cases`
(0001:83) — pure UI gap, no migration needed. Priority is currently
deliberately deferred to Acknowledge time (Executive sets it, not the
reporter) — worth confirming with the Boss whether that's the intended
design (Blueprint's FORM-001 marks `F06_priority` as reporter/Executive
sourced and required at intake) or whether Acknowledge-time priority-setting
was itself a deliberate earlier design choice worth keeping.

## 5. Detailed finding — G3 (diagnosis fields)

Also previously known, now confirmed as a genuine schema-level gap, not just
UI: `observed_symptom` and `immediate_action` need new nullable columns on
`maintenance.interventions` plus form fields in `intervention-form.tsx` and
plumbing through `record_intervention`. This is the most mechanically
straightforward of the three gaps — a pure additive migration (new nullable
columns, no data migration risk) plus two new form fields — and is
unambiguously required by the LOCKED pack's own §9 ("Never collapse all of
them into one free-text field"), so it's the safest candidate for a bounded
fix this batch.

## 6. What this pass deliberately did NOT do

- Did not re-verify every one of the ~60 RPCs line-by-line against every
  Blueprint form field — spot-checked the highest-risk/highest-value ones
  (financial authority, QC, audit append-only, emergency timing).
- Did not re-run the full golden-scenario (§32) or negative-test (§33) suites
  fresh — relied on `grep` confirming test coverage exists, not on executing
  them in this pass.
- Did not touch any code, migration, or business logic — this document is
  pure analysis, per the Boss's explicit instruction to produce the matrix
  first.

## 7. Recommended bounded changes for this batch (pending Boss confirmation)

1. **G3 fix** (lowest risk, unambiguously LOCKED-pack-mandated): add
   `observed_symptom` and `immediate_action` nullable columns to
   `maintenance.interventions`, thread them through `record_intervention` and
   `intervention-form.tsx`. No design decision needed — recommend proceeding.
2. **G2 fix** (low risk): add a `shift` field to the intake form (column
   already exists). Recommend proceeding. Priority-at-intake left as a
   question for the Boss rather than assumed.
3. **G1 fix**: real bug, but the correct shape (inline auto-advance vs. a
   dedicated Assessment screen) is a design decision — recommending the Boss
   pick before implementation rather than guessing.
