# Loop 54 — Blueprint Gap Matrix + 3 bounded fixes (G1/G2/G3)

## What triggered this loop

The Boss uploaded a new document, `MONARCH_Maintenance_Architecture_Blueprint.html`
(35 sections: architecture overview, 13-state lifecycle, data model,
ownership boundaries, permission matrix, 20 screen wireframes, form catalog,
enforcement registry, golden scenarios, negative tests, pending gates,
definition of done), with an explicit instruction: map it against the
repository first, do not rewrite working business logic, produce a
screen-by-screen + interaction-by-interaction + data/permission + harness
gap matrix, and only after that implement bounded changes.

## Part 1 — the gap matrix

Read the Blueprint in full and cross-checked every claim against actual repo
evidence (migration SQL, RPC bodies, RLS policies, form components, the
existing test suite) rather than assumption or memory. Full detail in
`BLUEPRINT_GAP_MATRIX.md` (committed separately, before any code changed).

Headline finding: the backend/data layer is already comprehensive — 26
tables, ~60 SECURITY DEFINER RPCs, the full locked transition graph, RLS on
every table. This is Loop 54 of an already-53-loop build where Loops 1–45
built the business logic before Loops 46–53 turned to visual polish, so the
Blueprint's 35 sections mostly confirmed MATCH against what already exists
rather than surfacing new scope.

Also flagged, not silently resolved: the Blueprint cites "Implementation
Pack v0.3" while this repo's `IMPLEMENTATION_PACK.md` is v0.2 LOCKED — no
content conflict found between the two, but the version-number mismatch is
recorded in the matrix for the Boss's awareness.

Three genuine gaps were found, all three traceable to the **current, already
LOCKED v0.2 pack itself** — not new scope invented by the Blueprint:

- **G1** — no UI path anywhere ever called `transition_case(...,
  'ASSESSED')`. The locked ACKNOWLEDGED→ASSESSED→ASSIGNED graph (§4,
  `status_transitions`) was only ever exercised by the Vitest suite calling
  the RPC directly for test setup. `assign_technician`'s auto-advance only
  fires `if v_current = 'ASSESSED'`, so assigning a technician straight from
  ACKNOWLEDGED left the case's `status` stuck at ACKNOWLEDGED indefinitely —
  a real lifecycle-correctness bug in already-shipped code, not a cosmetic
  gap.
- **G2** — the intake form had no `shift` field (column already existed on
  `maintenance.cases`, §5.1 lists it as part of the intake minimum).
- **G3** — `maintenance.interventions` captured only 3 of the LOCKED §9's 8
  required diagnosis concepts (intervention/action_taken, result,
  failure_mode). `observed_symptom` and `immediate_action` (§9.1/§9.2) had
  no column anywhere in the schema — root cause (§9.6) and permanent
  corrective action/effectiveness verification (§9.7/§9.8) are correctly
  handled elsewhere (their own root-cause table, and the CAPA flow
  respectively), but these two genuinely had no home.

## Part 2 — Boss decision on shape, then implementation

Rather than guess at G1's fix shape (a real architecture-drift risk per
CLAUDE.md's "no silent architecture drift" rule) or assume the intake-form
priority question, both were put to the Boss directly:

- **G1**: Boss chose "build a new Confirm Assessment screen" over silently
  loosening `assign_technician`'s auto-advance guard.
- **G2**: Boss chose "add shift only, leave priority-at-Acknowledge as is"
  over moving priority capture to intake.

### G3 fix (schema + RPC + UI)

New migration `0048_maintenance_intervention_observed_symptom_immediate_action.sql`
(applied via Supabase MCP to project `maavrlqkdrisjwzhjdgg`):
- Two new nullable columns on `maintenance.interventions`:
  `observed_symptom`, `immediate_action`.
- `record_intervention` extended with two new optional trailing parameters
  (`p_observed_symptom`, `p_immediate_action`, both `default null`) — every
  existing guard (staff-or-assigned-technician check, the NULL-propagation
  fix from migration 0029, action_taken-required check) copied byte-for-byte
  unchanged.
- `intervention-form.tsx`: two new optional text inputs, ahead of the
  existing "Action taken" field, matching the pack's own field ordering.
- `page.tsx` intervention timeline: displays the two new fields when
  present, same pattern as the existing result/failure_mode display.
- `database.types.ts`: `Intervention` interface updated (this repo's types
  file is hand-maintained against the `maintenance` schema, not the
  Supabase-generated `public`-schema output, which is empty — confirmed by
  running `generate_typescript_types` and finding it returns nothing for
  `maintenance`).

Purely additive at the schema level — no existing row, policy, or
transition touched.

### G2 fix (UI only, column already existed)

`cases/new/page.tsx`: added a `shift` text input (placeholder "A / B / C",
matching the Blueprint's own wireframe), threaded through the existing
`.insert()` call. No RPC/migration needed — `shift` was already a column on
`maintenance.cases` since migration 0001.

### G1 fix (new screen, zero new backend surface)

New `assessment-form.tsx` (`AssessmentForm`, sole default export, "use
client" — matches the established single-default-export convention from the
Loop 16/51 boundary lesson). Deliberately reuses the existing generic
`transition_case` RPC rather than adding a new one:
`ACKNOWLEDGED → ASSESSED` does not require a mandatory reason (only
REJECTED/DUPLICATE/CLOSED do, per `transition_case`'s own guard), so the
optional "assessment notes" field maps directly onto the RPC's existing
`p_reason` parameter — already recorded on both `case_events` and
`audit_log`. Zero new SQL.

Wired into `page.tsx`:
- New gating boolean `canConfirmAssessment = !!isStaffRow &&
  caseRow.status === "ACKNOWLEDGED"`, placed directly after `canAcknowledge`
  for readability.
- New `ActionSheetTrigger` in the sticky primary-actions bar (Loop 52's
  DR-04 pattern), positioned right after Acknowledge — so the real-world
  flow is now Acknowledge → **Confirm Assessment** → Assign Technician
  (whose existing auto-advance to ASSIGNED now actually fires, since the
  case genuinely reaches ASSESSED first).
- `hasPrimaryAction` needed no change — `canConfirmAssessment` is only ever
  true when `isStaffRow && !caseIsTerminal` is already true (ACKNOWLEDGED is
  never terminal), which that boolean already covers.

## Verification

`tsc --noEmit`, `eslint`, `next build`: all clean (all 11 routes compile).
Migration applied successfully via `mcp__Supabase__apply_migration` against
the live project. `mcp__Supabase__generate_typescript_types` was run to
confirm whether the hand-maintained `database.types.ts` needed a different
update process — confirmed it does (the generated output only covers
`public`, which is empty; `maintenance`-schema types are and remain
hand-maintained), so the `Intervention` interface was updated by hand
instead.

**Not independently re-verified this pass, honestly flagged**: `npm test`
(Vitest) could not be run locally — this sandbox's egress proxy blocks the
live Supabase project directly (RISK-05, standing, unrelated to this loop's
changes — confirmed by the failure mode: `"Host not i..." is not valid
JSON`, the proxy's own rejection page, not a Postgres/Supabase error).
CI is the verification path for the full lifecycle test suite and the E2E
suite, same as every prior loop. The three changes were kept deliberately
small and additive specifically to minimize what CI needs to catch:
`record_intervention`'s two new parameters are optional and appended at the
end (any existing caller, including the test suite's own calls, is
unaffected), `assign_technician` was not touched at all, and no existing
`status_transitions` row or RLS policy was touched.

## What this loop deliberately did NOT do

- Did not touch `assign_technician` — the Boss's chosen fix shape (a
  dedicated Assessment screen) makes that unnecessary; its existing
  `if v_current = 'ASSESSED'` auto-advance now simply fires correctly once
  cases actually reach ASSESSED.
- Did not move priority capture to intake — Boss's explicit choice to leave
  priority-at-Acknowledge as is.
- Did not add `area`/`line`/`shift` display to Case Detail's Overview tab —
  `area` and `line` weren't displayed there before this loop either; adding
  display for all three together would be scope creep beyond the three
  bounded fixes actually approved this loop.
- Did not attempt the golden-scenario (§32) or negative-test (§33)
  section-by-section re-verification the gap matrix flagged as not done
  this pass — recommended as a candidate for Loop 55 or a future batch if
  the Boss wants it.
