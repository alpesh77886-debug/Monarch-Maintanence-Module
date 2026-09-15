# Approval Gate Report — Loops 111-113 (of the approved 111-115 batch)

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is a stop for explicit Boss
input. Only 3 of the 5 approved loops ran — the same pattern as Gate 10
(`APPROVAL_GATE.md`): the approved scope's genuine, evidence-based work ran
out before the loop count did, and the two remaining slots were
deliberately not filled with invented work rather than manufactured to hit
a number. Autonomous loop work is PAUSED. Loop 114 will not start without
explicit continuation language from the Boss.

## What this batch was

The Boss replied to Gate 22 with **"Loop 111 se 115 start karo"** — a
blanket continuation that did not pick between that report's two flagged
options (going deeper on Manager/Technician screen separation, which needs
an explicit go-ahead since it's a multi-loop project of its own; or a new
direction). Per standing practice, Loop 111 targeted the most concrete
already-flagged item instead of guessing: the e2e coverage gap for the
Reopen button and dispute forms, explicitly acknowledged and deferred at
Gate 21 and repeated as still open at Gate 22.

## What happened across these 3 loops

| Loop | What | Result |
|---|---|---|
| 111 | Browser e2e for Reopen (RISK-32) + dispute forms (RISK-33) | New `e2e/lifecycle-authority.spec.ts`, arranging scenario state via the same real RPCs `tests/lifecycle.test.ts`/`tests/restoration-dispute.test.ts` already prove correct, then driving only the actual UI surface through a real browser. **Found a real, live bug in the process**: `restorations_select` RLS was staff-only, so a non-staff reporter (§11's own "complainant") could never actually see the dispute form — the RPC-level test suite never caught it because it calls the RPC directly, bypassing the page's read query. Fixed live (migration 0055), documented as **RISK-35 (RESOLVED)**. Two of this loop's own CI runs also failed on genuine bugs in the new test itself (a double-signIn-on-one-page pattern no existing spec uses; a wrong assumption that reopening sets literal status `"REOPENED"` when it actually lands in `DIAGNOSING`) — both root-caused from the actual job logs and fixed, not assumed. Merged as PR #102 (3 CI rounds). |
| 112 | QC gate (§12) unreachable for the QC-authority identity | Continued the same method — reading every case-scoped table's live `pg_policy` — on the QC gate, which had zero browser e2e coverage either. **Found a more severe bug**: F-01 deliberately made the QC-authority identity NOT staff, but `cases_select` never had a QC-authority branch and `clearances_select` was staff-only since this schema's first RLS pass — the QC-authority holder could not even load the case page, let alone reach the decision buttons, which were *additionally* hidden by `qcTab` being gated on `isStaffRow` alone. The entire §12 decision UI has been unreachable via the browser for the real QC-authority identity since Loop 31. Fixed live (migration 0056: extended `can_read_case()`/`cases_select` with a QC-authority branch scoped to cases that actually have a clearance, plus the matching `clearances_select` branch; `qcTab` gate changed to `isStaffRow \|\| isQcAuthority`), documented as **RISK-36 (RESOLVED)**. New `e2e/qc-gate.spec.ts` proves the full round-trip. Merged as PR #103 — green on the first CI run. |
| 113 | Close out the audit thread, verify no residual gap | Two checks, not a fix: (1) `clearances`' write-side policies — `clearances_insert` is `with check (false)` (RPC-only, `send_to_qc` is `SECURITY DEFINER`), no UPDATE/DELETE policy exists either, confirming the write side was always correctly RPC-only and Loop 112's read-side fix introduced no new write exposure; (2) a fresh `npm audit` — still exactly the 2 moderate findings already documented as RISK-34, no drift since Loop 108. Both clean. This loop is what closes the batch early: continuing to dig for a third finding of the same class without new evidence would mean either re-treading confirmed-clean ground, or guessing at business intent on the one remaining candidate below — both of which CLAUDE.md's "no business-rule invention" rule counsels against. |

## Why RISK-35 and RISK-36 were real, high-value finds — not scope creep

Both were found using the exact loop-111 approach the batch was already
approved for (browser-level e2e coverage of authority boundaries the
RPC-level suite cannot see), applied to a second flow (§12) once the first
(§11) turned up a genuine defect. Neither was invented: both are cases
where an authority the pack requires and the RPC layer already correctly
enforces (`raise_restoration_dispute`'s reporter check; `qc_decision`'s
`is_qc_authority()` check) was silently unreachable through the browser
because the read-side RLS policy was never updated when that authority was
added. Fixing the read scope to match an already-shipped, already-tested
write authority is not new business-rule invention — it is closing the
exact "server-side enforced, never UI-only" gap CLAUDE.md itself names as
the norm this project must maintain in both directions: an RPC that is
correctly gated but practically unreachable is as real a defect as a gate
that is too permissive.

## One question flagged, not acted on

While re-reading `page.tsx` during the Loop 112 investigation, the same
"tab not staff-gated at the top level" shape that produced RISK-35/36
turned up again in the Journal, Interventions, and Assignments tabs — none
of them are hidden from a non-staff viewer, but `observations_select` and
most of `case_ownership_select` are staff-only, and
`interventions_select`/`case_assignments_select` only cover staff or the
*specific* technician involved, never a general reporter. Unlike RISK-35,
there is no §11-equivalent pack requirement forcing reporter read access
here — every RPC that writes into these tables is already staff-only or
technician-only regardless of what the reporter can read, so nothing is
*functionally* broken. The only real effect is a possibly-misleading "No
entries yet" shown to a reporter who is neither staff nor the involved
technician, when real entries may exist. Widening this without a stated
requirement would be guessing at intended UX, not fixing a defect — so it
is named here for the Boss to decide, not silently acted on either way
(left showing the misleading empty state, or widened without evidence).

**The question:** should a case's own reporter be able to see its Journal
(Observation + Action Continuity log), Intervention history, and
Assignment/ownership history — the way they can already see (after this
batch) its Restoration history and (as of Gate 21) raise a dispute on it —
or is that internal-to-Maintenance detail the reporter was never meant to
see, and the current staff-only content behind a non-hidden tab is
accepted, if imperfect, UX?

## Verification posture this batch

- Every loop's `tsc --noEmit`, `eslint`, and a full `next build` came back
  clean.
- Both migrations (`0055`, `0056`) were applied live to the Maintenance
  Supabase project via the Supabase MCP tool and re-verified via a direct
  `pg_policy` read before and after — not assumed from the SQL file alone.
- `get_advisors` (security) was checked after each migration — no new
  finding from either policy change, both pre-existing items unchanged
  (`idempotency_keys` no-policy, leaked-password-protection).
- CI (GitHub Actions, live Supabase project) remains this batch's actual
  test-execution evidence for the new e2e coverage — this sandbox's own
  egress proxy still blocks direct Supabase access. PR #102 needed 3 CI
  rounds (two real bugs in the new test itself, both root-caused from
  actual job logs); PR #103 was green on the first run.

## Open items

- **RISK-35 and RISK-36 are both RESOLVED** this batch.
- RISK-32/RISK-33 remain RESOLVED (Gate 21, unchanged).
- RISK-01/02/03/04/06/07(remaining sub-item)/34 unchanged — all still
  Boss/access-blocked or already-accepted-as-is per prior gate reports.
- **New, explicitly flagged above:** the Journal/Interventions/Assignments
  reporter-visibility question — needs a Boss decision, not a guess.
- Gate 22's own still-unanswered option — going deeper on Manager/
  Technician screen separation to the Premium UI v2 mockup's depth — is
  still available if that is the direction the Boss wants, and is still
  sized as a multi-loop project of its own, not a single-batch item.

## What the Boss needs to decide before Loop 114

1. **Answer the Journal/Interventions/Assignments question above** — a
   quick yes/no unlocks a small, bounded Loop 114 (three RLS branches,
   matching the exact RISK-35/36 pattern, no UI change needed beyond
   what's already there).
2. **Go deeper on Manager/Technician screen separation** — sized as its
   own multi-loop project, needs an explicit go-ahead given the size.
3. **A new direction** — a live bug report, a new feature area, explicit
   reprioritization. This report does not pre-select a direction.
4. **If none of the above:** the self-directed angles available without a
   Boss decision are now genuinely exhausted for this specific method
   (RLS/UI-reachability audit) — a fresh angle would be needed for Loop
   114 to continue self-directed rather than re-treading ground already
   confirmed clean this batch.
