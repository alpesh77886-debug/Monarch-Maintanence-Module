# Loop 51 — Case Detail restructure: tabs + bottom-sheet actions

## What this loop does

The single highest-value, highest-risk piece of the visual redesign: Case
Detail (`cases/[id]/page.tsx`) went from 20+ sections rendered
unconditionally down one 550-line scrolling page to Sarvam's own proposed
local-navigation model — a persistent case header, then 10 tabs (Overview,
Journal, Interventions, Assignments, Spares, Restorations, QC, Waiting,
Audit, Evidence, per Sarvam §2/§4), with the four action forms that
previously appeared as an always-visible coloured box (Acknowledge, Mark
Duplicate, Close False Complaint, Hand Over) now opening as a bottom sheet
from a trigger button instead — matching Sarvam's DR-02 proposal, and
validated by the fact that the Boss's own Quality app already ships exactly
this pattern (its "Disposition" wizard is a real, shipped bottom-sheet, not
a hypothetical).

**This is very likely the direct fix for the Boss's earlier confusion**
("mujhe ek bhi forms nahi dikh raha") — every lifecycle action lived inline
on one page and only appeared once its state-gating boolean happened to be
true for that specific case; nothing was missing, it just wasn't organized
in a way that made the app's own functional breadth legible.

## Method: relocate, don't rewrite

Every one of the ~20 panels kept its exact existing component, props, and
state-gating boolean — this loop only moved *where in the JSX tree* each
one renders. No panel's internal form logic, validation, RPC call, or error
handling was touched. This was a deliberate risk-reduction choice: a full
rewrite of every form's internals in the same loop as a structural
reorganization would have been much harder to reason about correctly
without live-rendering access (see "Verification" below).

Five forms already had their own internal collapse-by-default "+" toggle
before this loop (Assign, Intervention, Waiting, Observation, Restoration)
— those stayed exactly as they were, just relocated into their matching tab.
Only the four forms that had **no** such toggle and rendered as a permanent
inline box (Acknowledge, Mark Duplicate, Close False Complaint, Hand Over)
were wrapped in the new `ActionSheetTrigger` component.

## New infrastructure

- **`src/components/sheet.tsx`** — `ActionSheetTrigger` (default export):
  a button that opens a modal/bottom-sheet on click, rendering its
  `children` only while open. Covers the Sarvam handoff's §F "Modal/sheet
  behaviour" checklist: preserves case context (the wrapped form gets
  whatever props the caller already passed it, unaffected by the wrapper),
  returns to the same screen on close (overlay, not navigation), explicit
  cancel/dismiss (× button, backdrop click, Escape), focus management
  (autofocus into the panel on open, focus returns to the trigger on
  close), keyboard accessibility (Escape closes; a single tabbable panel
  root; `role="dialog"` + `aria-modal`). Responsive per Sarvam §9: full-height
  bottom-sheet on mobile (rounded top corners, slides from the bottom),
  centered modal on tablet/desktop — one implementation, Tailwind's `sm:`
  breakpoint switches the position/radius/max-width classes.

  **Deliberately not implemented**: per-form unsaved-change detection.
  The wrapped forms are short (2-4 fields) and each already shows its own
  inline validation; generic dirty-tracking would require touching every
  wrapped form's internals to report state back up, which is exactly the
  "rewrite, not relocate" risk this loop avoided. Recorded as a known
  simplification, not silently dropped.

- **`src/components/tabs.tsx`** — `CaseDetailTabs` (default export): a
  thin client-side tab switcher. The page itself stays a server component
  (all 22+ parallelized Supabase reads from Loop 37 completely unchanged);
  each tab's server-rendered JSX is built once in `page.tsx` and handed to
  the client tab-switcher as a prop — no re-fetch, no client-side data
  layer, no new network round trip when switching tabs. Horizontal scroll
  with a hidden scrollbar on mobile (Sarvam §9: "horizontally scrollable
  Case Detail sub-tabs"), matching the reference apps' own filter-chip-row
  treatment (new `.scrollbar-none` utility in `globals.css`).

## A live bug caught and fixed before it shipped, not discovered later

The first version of `sheet.tsx` exported two things (`Sheet` and
`ActionSheetTrigger`) from one `"use client"` file, and `page.tsx` (a
server component) imported one of them. This is *exactly* the shape this
project's own standing rule warns about — the Loop 16 lesson, restated in
`app-nav.tsx`'s own comment: "a second, non-default export in a 'use
client' file called from a server component breaks in a way tsc/lint/build
cannot see." `tsc`/`eslint`/`next build` all passed anyway (as the lesson
itself predicts — this class of bug is invisible to all three). Caught by
deliberately re-reading the new files against that specific known failure
mode, not by any tool. Fixed: `Sheet` is now an unexported internal
component, `ActionSheetTrigger` is the sole default export;
`CaseDetailTabs` was changed to a default export for the same reason (its
`CaseTabId` type export is compile-time-only and doesn't carry the same
risk, so it stayed a named export). A repo-wide check for this exact shape
(every `"use client"` file's export count) was run afterward and found
clean everywhere else too.

## Verification

`tsc --noEmit`, `eslint`, `next build`: all clean. The `"use client"`
boundary re-scan (this loop's specific version: every hook-using file has
the directive as its literal first line, and every `"use client"` file
either has a single default export or only type-only additional exports)
run across the whole repo, not just the touched files — clean.

**What could not be verified**: this sandbox still can't reach the live
Supabase project (`RISK-05`), so the actual rendered Case Detail page —
with real case data flowing through real state-gating booleans into real
tabs — has not been visually confirmed, only reasoned through by careful
reading of the relocated JSX against the original. This is a materially
higher-risk change than Loop 50's pure colour sweep for exactly this
reason: a colour class either compiles or it doesn't, but a JSX
restructuring this size can compile clean and still be visually or
interactionally wrong in a way only a real render would show. CI is the
verification path, same as every prior loop, but this loop's diff
deserves more scrutiny there than most.

## What this loop does NOT do

- Does not add a sticky mobile primary-action bar (Sarvam DR-04) — next.
- Does not touch `VerifyRestorationCard`, `QcPanel`, `EmergencyPanel`,
  `CloseReopenActions`, `PriorityPanel`, or the compliance/record panels
  (Production Boundary, PTW, Asset, Root Cause, Impact, Recurrence/CAPA) —
  these stayed inline in their tabs rather than becoming sheets, a
  deliberate judgement call (they're either decision-critical context that
  benefits from staying visible, or already reasonably compact) rather
  than converting everything indiscriminately.
- Does not touch the 2 remaining `IMPLEMENTATION_PACK.md` findings from
  the Sarvam-verification pass (intake shift/priority, diagnosis fields).
- Does not touch any RPC, migration, RLS policy, or business rule — every
  panel's data layer is byte-for-byte what it was before this loop.
