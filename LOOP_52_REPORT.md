# Loop 52 — Sticky mobile primary action + KPI card grouping

## Sticky primary action (Sarvam DR-04)

Sarvam's own DR-04 proposal: "the primary state-gated action stays in a
sticky footer above the tab bar so the next lifecycle step is always one
thumb-tap away." Implemented by pulling the primary action-buttons row
(Acknowledge / Take Ownership / Mark Duplicate / Close False Complaint /
Hand Over) out of the Overview tab entirely and rendering it once at the
page level, above `CaseDetailTabs` — so it's reachable from any tab
without switching back to Overview, matching Sarvam's own wording, not
just the "sticky" visual effect.

CSS: `sticky bottom-20 ... md:static`. `bottom-20` (5rem) reuses the exact
clearance `(app)/layout.tsx`'s `<main>` already reserves below the fold
for the fixed mobile bottom nav (`pb-20`) — no new offset was invented,
this is the same already-established safe zone every other page's content
already respects. `md:static` drops the pinning on desktop, where the row
is already in view without needing to follow scroll.

**Honestly flagged, not silently assumed correct**: this is the one piece
of this loop's UI work that could not be visually verified against a real
device. `tsc`/`eslint`/`next build` all confirm it *compiles*, but a sticky
footer's actual on-screen position — whether it correctly clears the fixed
bottom nav, whether the `95%`-opacity + backdrop-blur card reads cleanly
against real case content scrolling behind it — is exactly the kind of
thing only a live render on a phone-width viewport would confirm, and this
sandbox cannot reach the live Supabase project (RISK-05) to render an
authenticated Case Detail page with real data. Recorded as elevated-risk
here rather than reported as done-and-verified.

## KPI page: grouped metrics get a card shell

Small, separate, low-risk change made while Loop 51's CI was running: the
KPI page's `Group` sections (Restoration & Execution, Production Impact,
Waiting/Dependency, etc.) were a bare heading floating over a metrics grid
with no container. Wrapped in a `Card`-equivalent shell (border + layered
shadow) so each group reads as one bordered block, matching the reference
apps' convention of grouping related metrics inside a card rather than a
loose heading + grid. The individual `Metric` tiles inside were moved from
`bg-card` to `bg-bg2` so they read as a distinct surface layer against
their now-`bg-card` parent instead of blending into it (the same 5-level
surface-stack convention — `bg` < `bg2` < `card` < `card2` — Loop 50
established, applied one level deeper here). Pure container/token change;
every metric's computation, coverage line, and "no data" handling is
untouched.

## What was deliberately left alone

PM and Recurrence-rules pages were checked and found already consistent
with the reference apps' card-list convention (courtesy of Loop 50's token
sweep) — no further changes made there. Polishing pages that already read
correctly risks diminishing-returns diff size for no real visual gain;
this loop stayed targeted at the two places with a genuine, identifiable
gap (a missing DR-04 affordance, and a missing container on grouped
metrics).

## Checks

`tsc --noEmit`, `eslint`, `next build`: all clean. No RPC, migration, or
RLS surface touched.
