# Sarvam Screen Architecture — Forensic Verification Report

Source verified against: `MONARCH_Maintenance_Screen_Architecture.html` (uploaded by the Boss,
1001 lines, read in full). Per the Type-A handoff's completion protocol: this is a mismatch
list, not a compliance claim. Every row below was checked against the actual implementation —
routes read directly, RPC bodies read from `supabase/migrations/*.sql`, forms read from their
React source — not inferred from the design doc's own description of itself.

## 0. A discrepancy in the source file itself — flagged, not resolved

The file's own closing `src-note` says two different things in the same sentence: "Derived from
MONARCH — Maintenance Claude Code Implementation Pack **v0.3** (LOCKED EXECUTION)... Canonical
design page: MONARCH — Maintenance Development Package / Module Contract — **v0.2** (LOCKED /
USER APPROVED)." This repo's actual locked contract (`IMPLEMENTATION_PACK.md`, per `CLAUDE.md`)
is v0.2. Whether a genuine "v0.3" exists somewhere the Boss has and this repo doesn't is a
question for the Boss — not something to guess at or silently reconcile. Everything below was
checked against **this repo's actual v0.2 `IMPLEMENTATION_PACK.md`**, not against Sarvam's
paraphrase of it, specifically for anything the mismatch list calls a LOCKED-rule gap.

## 1. Real gaps against the LOCKED pack (not Sarvam preference — checked against IMPLEMENTATION_PACK.md directly)

These three are the ones worth the Boss's attention. Everything in §2 below is Sarvam's own
*visual/interaction* layer (explicitly PROPOSED, not locked) and is reported for completeness,
not because it needs fixing.

### 1a. Case intake form omits `shift` and `priority` — Pack §5.1

**Pack §5.1 (verbatim):** "A case must support: ... shift where relevant ... priority ...
operational impact fields where available."

**Actual (`src/app/(app)/cases/new/page.tsx`):** no `shift` field, no `priority` field anywhere
in the form. Traced why: `supabase/migrations/0026_maintenance_cases_insert_column_lockdown.sql`
(Loop 27, RISK-19 — an unrelated INSERT-policy security fix) locks the RLS `with_check` to force
`shift is null` and `priority is null` at insert time. **This lockdown's own comment says it was
written to "tighten with_check to the exact baseline the real intake form... submits"** — i.e.
it *codified* an already-missing field into a security boundary; it was never a deliberate
decision that shift/priority shouldn't be captured at intake. §5.4 ("Executive can change
priority... Manager has final override") governs *changing* priority later — it doesn't say
intake shouldn't capture an initial value, and §5.1 explicitly lists priority as one of the
intake-support fields.

**Verdict: FAIL against §5.1**, not a Sarvam-only preference. Worth a real fix (reopen the RLS
`with_check` to allow client-supplied `shift`/`priority` at insert, add the two fields to the
intake form) — flagging for the Boss's prioritization rather than fixing unprompted, since
touching that lockdown migration is exactly the kind of RLS surface this project has repeatedly
found defects in and deserves the same "enumerate-first, live-verify" rigor as RISK-19 itself.

### 1b. Two of the eight §9 diagnosis concepts have no distinct capture point

**Pack §9 (verbatim):** "Separate these concepts: 1. observed symptom 2. immediate action /
containment 3. intervention 4. result 5. failure mode 6. validated root cause 7. permanent
corrective action 8. effectiveness verification. Never collapse all of them into one free-text
field."

**Actual:** 6 of 8 concepts have a distinct field/panel:`intervention`+`result`+`failure_mode`
(`intervention-form.tsx`, fields `actionTaken`/`result`/`failureMode`), `validated_root_cause`
(`root-cause-panel.tsx`), `permanent_corrective_action` + `effectiveness_verification`
(`recurrence-capa-panel.tsx`). **Missing as distinct fields anywhere on the case:**
`observed_symptom` (the closest thing is the one-time case-level `symptom` captured at intake —
never re-captured at diagnosis time) and `immediate_action`/containment (`intervention-form.tsx`
has only one field, `actionTaken`, which is ambiguous between "immediate action" and
"intervention" — the pack treats these as two different things).

**Verdict: PARTIAL.** The pack's hard rule ("never collapse *all* of them into *one* free-text
field") is technically not violated — nothing is one undifferentiated blob. But "separate these
[eight] concepts" isn't fully realized either: 2 of 8 are either omitted or folded together.
Whether "immediate action / containment" needs its own field distinct from "intervention" is a
judgment call the Boss should make, not one to invent — flagging rather than fixing.

### 1c. Case Detail's status badge is hardcoded, doesn't reflect the actual state

Not a Sarvam citation at all — found independently while checking DR-05 (state badge colours).
`src/app/(app)/cases/[id]/page.tsx:216` — `<Badge tone="info">{caseRow.status}</Badge>` — the
`tone` is hardcoded to `"info"` (blue) regardless of what `caseRow.status` actually is. So on
the single most important screen in the app (the primary working surface, per Pack §32 "all"),
REPORTED, EMERGENCY-adjacent states, TECHNICALLY_RESTORED, and CLOSED all render the identical
blue badge — only the *text* changes. The case **queue** (`cases/page.tsx`) and the **dashboard**
bar chart each have their own separate, more complete status→colour maps, but neither is reused
on Case Detail itself.

**Verdict: a real, independently-found usability defect**, not a locked-pack citation issue —
worth fixing regardless of any Sarvam alignment question, since fast state recognition is the
whole point of this screen during an active breakdown. Flagging, not fixing unprompted.

## 2. Sarvam's own PROPOSED visual/interaction layer (DR-01..DR-05) — non-binding, reported for completeness

Per the handoff: these were never business requirements and are not being treated as such. The
table below is descriptive, not a to-do list.

| Sarvam item | Sarvam's proposal | Actual implementation | Status |
|---|---|---|---|
| DR-01 bottom tab bar | 5 tabs: Control Tower / Cases / PM / Spares / More | 5 tabs exist (`app-nav.tsx`) but labelled Cases / **Shift** / PM / **Recurrence** / **KPIs** — no "Control Tower" label, no "Spares" tab (spares only reachable inside a case), no "More" | PARTIAL — tab bar exists, contents differ |
| DR-02 bottom-sheet action forms | Lifecycle actions as modal sheets over Case Detail | All actions (`AcknowledgeForm`, `AssignTechnicianForm`, `InterventionForm`, `RestorationForm`, `QcPanel`, `WaitingForm`, `EmergencyPanel`, `MarkDuplicateForm`) render inline/expand-in-place on one long page — zero modals for lifecycle actions anywhere in the codebase (the only modal found at all is the sign-out-with-open-cases confirmation) | FAIL against the proposal (PROPOSED only — not a defect) |
| DR-03 case-queue card list | Cards, not a dense table | Confirmed — `cases/page.tsx` is `<ul>/<li>` cards, zero `<table>` | **PASS** |
| DR-04 sticky primary action | Sticky footer action bar on Case Detail mobile | None — `grep sticky` finds only the nav rail and the page header, nothing on `cases/[id]/page.tsx` | FAIL against the proposal (PROPOSED only) |
| DR-05 semantic state badges | 6-colour semantic system, non-colour-only | 3 separate, inconsistent colour maps (`ui.tsx` generic tones, `cases/page.tsx` 9-of-16-status map, `dashboard/page.tsx` 16-of-16-status map) with **no single shared implementation** — see §1c above for the worse Case-Detail-specific consequence | PARTIAL, and see 1c for the real bug this produces |

Also structurally absent as *dedicated routes* (all PROPOSED navigation architecture, not locked):
`/handover` (handover exists, but as a shared form — no dedicated screen), `/manager` (no
Manager Dashboard; every manager-only control — CAPA effectiveness, PM approval, high-value spare
approval, priority override lock — lives inline in the same shared panels every role sees,
gated by an `isManager` boolean rather than surfaced on its own screen), `/notifications` (no
history/archive view — `NotificationBell` shows only the current unread list, nothing once
marked read), `/spares` as a standalone screen, `/pm/:id` as its own route (PM detail lives
inline on the single `/pm` list page instead). None of these are locked-pack violations —
Pack §22/§17/§16/§23 require the *functions* (handover, PM management, spare traceability,
notifications) to exist and be correctly authorized, which they do; Sarvam's proposal was about
*where* they live in the navigation, which is explicitly non-binding.

## 3. Confirmed PASS — click-map / RPC verification (read directly from migration SQL, not assumed)

All six spot-checked lifecycle actions match their Sarvam click-map's stated precondition,
state-transition, and audit behaviour, cross-checked against the actual LOCKED pack sections
they cite:

- **Take Ownership / Acknowledge** — first-valid-actor guard via a conditional `UPDATE ...
  WHERE current_owner_user_id IS NULL`, raises `ALREADY_OWNED` on the losing concurrent call;
  `acknowledge_case` correctly gates on `REPORTED`/`NEEDS_INFORMATION`, writes `case_events` +
  `audit_log`, notifies the reporter. Matches §5.2.
- **Confirm Emergency** — two-step confirmed: `claim` then a separate `confirm_emergency` call;
  confirming sets `emergency_confirmed_at`, and only `run_escalation_scan`'s 1h check (reading
  that same timestamp) starts the clock — never the claim itself. Matches §6/§7.3 exactly.
- **Technical Restoration FAIL** — `verify_restoration(p_passed=false)` requires a non-empty
  failure reason, requires the return status be `DIAGNOSING`/`IN_REPAIR` only, and **never**
  produces `TECHNICALLY_RESTORED` on that path (confirmed: no code path sets that status when
  `p_passed=false`). Matches §4.2/§11 exactly.
- **Send to QC** — only fires from `TECHNICALLY_RESTORED`, transitions to `CLEARANCE_PENDING`.
  Matches §12.
- **Maintenance Release** — reached only via `qc_decision`, which **explicitly forbids
  Maintenance staff from deciding QC clearance themselves** (`is_staff()` → `FORBIDDEN`) and
  requires a separate `qc_authority` grant. This is *stricter* than Sarvam's click-map implies —
  a good thing, matches §12/§13's ownership-boundary intent precisely.
- **Mark Duplicate** — the primary case's own row is never written to by this function (verified
  by reading the full function body); `transition_case` itself structurally refuses a direct
  transition to `DUPLICATE`, forcing every duplicate-mark through this one audited path. Matches
  §4.6.

Also confirmed correct and worth noting as **exceeding** rather than merely matching spec: the
Waiting form's `reason_type` is an explicit two-option radio, never inferred from free text
(§7.1/§24); the Spare Request form's `approval_proof` gate is wired to the real `>₹12,000`
boundary server-side (§3.3), and `stores_reference_status` genuinely defaults to a
`STORES_REFERENCE_PENDING` sentinel rather than any fabricated balance (§16.2); the KPI dashboard
shows "no data" / excludes-from-total rather than ever zero-filling a missing figure, and hides
the financial-impact figure without an authoritative basis (§25.2) — all confirmed by reading
every metric's value expression in `kpi/page.tsx`, not sampled.

## 4. What this does NOT claim

Per the handoff's own completion protocol: this is not a Sarvam-compliance claim from visual
similarity. Sections 1a/1b/1c are the three findings that actually matter — real gaps or a real
bug, checked against this repo's own locked pack text, not Sarvam's restatement of it. Section 2
is descriptive record-keeping of a PROPOSED, non-binding visual layer that nobody has approved
as a requirement yet. No code was changed to produce this report; it is the promised mismatch
list only, exactly as the handoff specified — the Boss decides what (if anything) gets built
next.
