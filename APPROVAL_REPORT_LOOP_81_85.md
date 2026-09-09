# Approval Gate Report — Loops 81-85

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is the mandatory hard stop
after the 5th completed loop. Autonomous loop work is PAUSED. Loop 86 will
not start without explicit continuation language from the Boss — silence,
"looks good," or an unrelated reply is not approval. This applies even
though the Boss's "continue loop 81 to 85" pre-approved this batch in
advance — the mandatory stop is independent of pre-approval, per standing
practice since Gate 8.

This batch's direction was self-selected per `APPROVAL_REPORT_LOOP_76_80.md`'s
three flagged candidates (fix the disclosed sticky-action-bar gap, an
accessibility pass, or data-freshness/performance per §24/§38): Loop 81
targeted the most concrete, already-diagnosed item first (the sticky-bar
fix); Loops 82-85 then moved to the accessibility pass flagged as the next
concrete gap since Loop 69's single action-sheet audit. That plan is
recorded in `APPROVAL_GATE.md`'s Gate 16 RESOLVED paragraph, dated before
this batch started.

## What happened across these 5 loops

| Loop | What | Result |
|---|---|---|
| 81 | Real fix for Case Detail's sticky primary-action bar (the gap Loop 80 disclosed but didn't fix) | Switched `position: sticky` to `position: fixed` — CSS sticky's containing-block-is-the-immediate-parent behavior was the root cause, not fixable by restructuring within the same positioning scheme. Verified with a dedicated scroll-position script across 6 depths to 9000px, both mobile and tablet — the button now stays reachable throughout the whole scroll, not just ~one `sidePanel`-height of it |
| 82 | Accessibility investigation + first slice | Skip-to-content link (WCAG 2.4.1 "Bypass Blocks"), `role="alert"` on the canonical inline-error pattern (32 files / 34 occurrences), `FormField`'s required-asterisk got an `sr-only` text alternative |
| 83 | Accessibility pass continuation | `aria-current="page"` on both `AppNav` surfaces, `aria-pressed` on `AvailabilityToggle`, `aria-expanded`/`aria-haspopup`/`aria-controls` on `NotificationBell`'s trigger, and the significant one: `sign-out-button.tsx`'s confirm dialog got Sheet's (Loop 51/69) already-verified focus-trap/`role="dialog"`/Escape/autofocus/focus-return logic ported in, having previously had none of it despite visually duplicating Sheet's overlay markup |
| 84 | `NotificationBell` dropdown dismissal | The dropdown had no Escape-to-close, no outside-click dismissal, and no focus-return — added both listeners per the WAI-ARIA APG "Disclosure" pattern's baseline (no full Tab-trap needed, since it's non-modal) |
| 85 | Final sweep + this gate report | Confirmed no further concrete, mechanically-verifiable accessibility item remains from Loop 82's investigation trail — see "What Loop 85 checked and ruled out" below |

Full commit-level detail: Loop 81's fix and the Loop 81/82 STATUS.md
entries landed together in PR #81 (a same-branch-PR-restriction repeat —
see below); Loop 83 in PR #82; Loop 84 in PR #83. All three merged clean.

## Operational wrinkle this batch (recurring, not a defect)

The same GitHub same-branch-PR restriction flagged in the two prior gate
reports recurred once this batch: PR #81 (opened for Loop 81's STATUS.md
follow-up commit) was still open when Loop 82's commit landed on the same
branch, so it joined PR #81 rather than opening a new PR. Handled the same
way as before — retitled and rewrote the PR body to describe both loops'
changes before merging. PRs #82 and #83 (Loops 83 and 84) each opened
cleanly with no conflict, since the prior PR had already merged by the
time each was pushed. No commit was lost or silently merged without
review in either case.

## Defects found and fixed this batch

- **Case Detail's sticky primary-action bar not staying reachable through
  scroll** (Loop 81, real fix for the gap Loop 80 disclosed): root-caused
  as CSS `position: sticky`'s containing-block being the element's own
  immediate parent, not any taller ancestor. Fixed by switching to
  `position: fixed` with its own explicit width/centering (two nested
  divs, since `fixed` drops out of flow). This is the deepest defect this
  batch — a real UX regression against Loop 52's own documented design
  intent, live since Loop 73, now actually verified fixed rather than
  disclosed-and-deferred.
- **`sign-out-button.tsx`'s confirm dialog had zero accessibility
  treatment** (Loop 83): visually identical to Sheet's overlay pattern but
  built before Sheet existed (or independently of it) — no `role="dialog"`,
  no focus trap, no Escape, no autofocus, no focus-return. A keyboard-only
  or screen-reader user opening this dialog (which appears on every sign-
  out when the user still owns open cases — not a rare path) had no way to
  navigate it via keyboard alone and no signal it was a dialog at all.
- **`NotificationBell`'s dropdown had no dismissal mechanism** (Loop 84)
  beyond re-clicking the same trigger button — no Escape, no outside-click.
  A minor but real usability gap for any user, not just assistive-tech
  users.

No CRITICAL or HIGH findings this batch — all four items above are real,
user-facing gaps but none touch lifecycle state, authority, or data
integrity.

## What Loop 85 checked and ruled out (rather than inventing a new item)

Two of Loop 82's originally flagged candidates were investigated properly
before this loop, rather than assumed:

- **`aria-describedby` linking hint text to inputs**: `FormField` (in
  `components/ui.tsx`) already nests its `children` (the actual `<input>`/
  `<select>`/`<textarea>`) inside a real `<label>` element, together with
  the hint text. Per the HTML implicit-label-association spec, a screen
  reader's computed accessible name/description for a labelable control
  already includes all text content of its enclosing `<label>` — the hint
  text is already announced on focus. Adding `aria-describedby` here would
  be redundant, not a fix for a real gap. Correctly not implemented.
- **Colorblind-safe status signaling on `StatusBadge`/priority badges**:
  `StatusBadge` (in `components/ui.tsx`) renders
  `status.replace(/_/g, " ")` as visible text inside the badge, not a
  color-only indicator (a dot or bare background fill would have been the
  real gap). A colorblind user reads the same status word a sighted user
  does. Correctly not implemented.

With those two ruled out and Loops 82-84 covering the concrete items that
were real (skip-link, alert regions, required-field text, `aria-current`/
`pressed`/`expanded`, the sign-out dialog trap, the notification dropdown
dismissal), this batch's accessibility pass has exhausted what a
grep-based, mechanically-verifiable audit surfaced. This is not a claim
that the app is now "fully accessible" — see below.

## What this batch is NOT claiming

- **Not a full WCAG conformance audit.** This was a targeted pass driven
  by grep-based pattern-matching (missing `role="alert"`, missing
  `aria-*` on stateful custom controls, missing dialog semantics on
  overlay-shaped markup) — not a systematic AA/AAA checklist walk, not a
  screen-reader-software (NVDA/JAWS/VoiceOver) manual pass, and not a
  color-contrast audit.
- **Not every overlay/popup in the app individually audited.** Sheet
  (Loop 69) and the sign-out dialog (Loop 83) both now have real focus
  traps; `NotificationBell`'s dropdown (Loop 84) has Escape/outside-click
  dismissal appropriate to a non-modal popup. No other overlay-shaped
  component was found during this batch's investigation, but the
  investigation was grep-driven, not exhaustive by construction.
- **Not a business-logic or authority change of any kind.** All 5 loops
  are presentation-layer only, per the Prompt's own §4 "DO NOT REBUILD
  THE BACKEND" constraint — zero RPC signatures, zero `.insert()`
  payloads, zero RLS policies changed across the whole batch. Loop 81's
  fix changed CSS positioning only; Loops 82-85 changed JSX
  attributes/markup and one `useEffect` per component, nothing else.

## Verification posture this batch

Every loop's `tsc --noEmit`/`eslint`/`next build` came back clean. Every
behavioral claim got real, empirical verification via the Loop 53
throwaway-route + local-only `proxy.ts`-bypass technique (route and bypass
both reverted before each real commit, confirmed via `git status`/`git
diff` every time):

- Loop 81: a dedicated Playwright scroll-position script (`getBoundingClientRect()`
  + `window.scrollTo()`) at 6 depths to 9000px, both mobile and tablet —
  materially more rigorous than the single-check verification that missed
  this bug in Loop 80.
- Loop 82: skip-link focus-visible + tab order confirmed; `role="alert"`
  firing in the accessibility tree on an injected error; `FormField`'s
  isolated `sr-only` text confirmed via a targeted `.sr-only` selector
  (an initial, imprecise selector matched the wrong wrapping span first —
  caught and corrected before treating the check as passing).
- Loop 83: `aria-pressed`/`aria-expanded`/`aria-haspopup`/`aria-controls`
  toggling correctly confirmed live; the sign-out dialog's identical trap
  code (copied verbatim from the real component) exercised standalone in
  the same preview, since `SignOutButton` itself can't be driven into its
  open state without a live Supabase session (RISK-05's sandbox blocks
  that) — confirmed `role`/`aria-modal`/`aria-labelledby`, initial
  autofocus, full Tab-forward and Shift+Tab-wrap trap, Escape-to-close,
  and focus-return to the opener.
- Loop 84: confirmed Escape closes the dropdown and returns focus to the
  trigger; confirmed an outside click closes it; confirmed clicking
  *inside* the panel does NOT close it (so a notification's own "Mark
  read" control isn't dismissed out from under a click).

CI: PR #81 hit one failure on its pre-Loop-82 commit
(`tests/cleanup-safety.test.ts`, two tests with opposite/complementary
assertion mismatches) — read via real job logs, consistent with the same
shared-live-Supabase-test-project race class hit repeatedly in prior
batches, confirmed unrelated to that commit's docs-only diff, and
superseded cleanly by the fresh CI run Loop 82's own commits triggered
(green on the first try, no re-run spent). PRs #82 and #83 both hit CI
green on the first try with no flakes.

## Open items — unchanged from every prior gate this span

- **RISK-32** (CRITICAL, reopen authority) and **RISK-33** (MEDIUM,
  complainant disagreement) remain `OPEN` in `RISK_REGISTER.md`, unchanged
  since Gate 12 — untouched across this batch and every batch since. This
  entire UX-reconstruction span (61-85 so far) never touched lifecycle
  authority or business rules, per the Prompt's own §4 constraint.
- Type B items unchanged from earlier gates: shared test/prod Supabase
  project (mitigated by run-tagging), leaked-password protection (Boss:
  last), §35 PENDING-01/02/03/04.
- The 15-file `toLocaleString()` latent-hydration-risk pattern (flagged
  before Loop 61) remains unswept.
- The operational same-branch-PR wrinkle recurred once this batch (PR #81
  carried 2 commits, same pattern as before but smaller than the 76-80
  batch's 5-commit instance) — still not a code defect, flagged again for
  awareness in case a different STATUS.md/PR cadence is wanted.

## What the Boss needs to decide before Loop 86

Per §19.9/§19.13: explicit continuation language is required, e.g. "Loop
86 se aage badho" or "Approved, continue." This batch's own investigation
(Loop 85, above) concluded that the grep-driven accessibility pass has
run out of concrete, mechanically-verifiable items — so unlike the last
two gate reports, there isn't an obvious "finish what this batch started"
thread to hand off. The Boss may direct the next batch toward any of:

1. **RISK-32/RISK-33** — both CRITICAL/MEDIUM findings have sat `OPEN`
   since Gate 12 awaiting a Boss design decision (not a guess this project
   should make) on what "Executive + Manager" reopen authority and
   "complainant + Executive jointly decide" should actually look like as
   an implementation. These are the highest-severity open items in the
   whole repo and have not moved in many batches.
2. **Data-freshness/performance** (§24/§38) — flagged as not-landed since
   Gate 13's report, still untouched.
3. **A deeper accessibility pass** beyond what grep-pattern-matching can
   find — a manual screen-reader walkthrough, color-contrast audit, or
   full WCAG AA checklist — acknowledging this would need different tools/
   methodology than this batch used.
4. Something else entirely — this report does not pre-select a direction.
