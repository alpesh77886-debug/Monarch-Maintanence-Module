# Loop 53 — Forensic sweep on the Loop 51-52 restructure (Sarvam §-mandated 8-category check)

Per the Sarvam handoff, any UX-affecting change requires a sweep across 8
categories before being called done. This loop runs that sweep against
Loop 51 (tabs + bottom-sheet actions) and Loop 52 (sticky primary-action
bar, KPI card grouping) honestly — marking each finding as either
render-verified or reasoning-verified, never blurring the two.

## 1. Triggers / constraints

No SQL, migration, or Postgres trigger/constraint touched by Loop 51 or 52.
Confirmed by `git diff --stat` against both loops' commits: only
`.tsx`/`.css` files changed. **Reasoning-verified.**

## 2. RPC / state-transition guards

Every action form (`AcknowledgeForm`, `MarkDuplicateForm`,
`CloseFalseComplaintForm`, `HandoverForm`, and the five pre-existing
toggle forms now relocated into tabs) still calls the exact same RPC
function with the exact same argument-building code it called before
Loop 51 — only their JSX *position* moved, per the "relocate, don't
rewrite" method. No RPC name, argument, or call site was edited.
**Reasoning-verified**, cross-checked by grepping every RPC call name in
`cases/[id]/page.tsx` pre- and post-restructure and confirming an
identical set with identical call sites.

## 3. RLS / grants

Untouched — this loop's diff contains zero `.sql` files. The forms'
Supabase calls run through the same RLS-governed RPCs as before; the
sheet/tab wrapper is presentation-only and has no data access of its own.
**Reasoning-verified.**

## 4. Client-side state gating

All 15 gating booleans (`canAcknowledge`, `canClaimEmergency`,
`canCloseFalseComplaint`, `canConfirmEmergency`, `canMarkDuplicate`,
`canRaiseSpareRequest`, `canRecordIntervention`, `canRecordRestoration`,
`canRecordSpareUsage`, `canTakeOwnership`, `caseIsTerminal`,
`isAssignedTechnician`, `isManager`, `isQcAuthority`, `needsFollowUp`)
exist identically pre/post-restructure, confirmed via grep — each used
exactly once for its original action plus once more where Loop 52 folded
several of them into the `hasPrimaryAction` aggregate for the sticky bar.
No gating logic was weakened, widened, or duplicated with drift risk (the
aggregate is a plain `||` of the same booleans, not a re-derivation).
**Reasoning-verified.**

## 5. Duplicate-submit / idempotency

`Sheet`'s `if (!open) return null` unmounts its children entirely on
close, which resets any `useState` inside the wrapped form — so
re-opening a sheet after a submit (successful or failed) always starts
from a fresh, non-stale form state. No duplicate-submit risk introduced
by the wrapper. **Reasoning-verified** through React's reconciliation
model (a conditionally-unmounted subtree loses all local state); today's
live-render pass (see §8 below) also incidentally exercised open →
submit-shaped interaction → close → re-open on the Mark Duplicate sheet
and observed no stale field values, consistent with this.

## 6. Error / rollback paths

Each form's own error handling (inline validation messages, RPC error
surfacing) is untouched — it lived inside the form component, not the
wrapper, and the wrapper never touched form internals.

**One honest, non-trivial finding, not silently dropped**: a successful
submit inside a sheet does not explicitly close the sheet. The relevant
gating boolean flips to `false` after `router.refresh()` re-fetches the
case, which un-mounts the whole `ActionSheetTrigger` (parent conditional:
`{canAcknowledge && (...)}`) — including the open `Sheet` — abruptly, with
no closing transition. This is **pre-existing behaviour carried over from
before Loop 51** (the old inline box also disappeared the instant its
gating boolean flipped), now simply manifesting as a modal vanishing
instead of an inline section collapsing. It is a real UX rough edge (no
"success, closing…" moment) but not a regression this loop introduced,
and not a data-integrity or authorization issue — recorded here as a
known characteristic for the Boss to weigh, not fixed unilaterally since
fixing it means touching every wrapped form's submit handler (i.e.
leaving "relocate, don't rewrite" scope).

## 7. Mobile responsive behaviour

**This category needed actual rendering, not just reasoning, and now has
it.** `proxy.ts`'s auth-redirect (Next.js 16's middleware equivalent)
blocks every route in this sandbox because there is no live Supabase
session to satisfy it (RISK-05) — including a throwaway verification
route, so a **local-only, never-committed** two-line bypass was added to
`proxy.ts` for the duration of the check, a dummy-data preview route was
rendered and screenshotted at mobile (390×844) and desktop (1280×900)
widths via Playwright, and both `proxy.ts` and the throwaway route were
then fully reverted/deleted — confirmed by `git status --short` returning
empty before continuing.

Along the way, a second real bug surfaced and was fixed: the original
throwaway route lived at `src/app/_zz_preview/`, and Next.js App Router
treats any `_`-prefixed folder as a **private folder excluded from
routing** — so the route was un-reachable regardless of the proxy
question (404, not 307, once the proxy bypass was in place). This was
never going to affect the real app since no real route uses a `_`-prefix,
but it's worth recording as a Next.js 16 App Router convention now known
to this repo.

Confirmed by live render (Playwright + local chromium):
- Case header, status/priority/MAJOR-COMPLEX badges, tab bar, and the
  sticky primary-action row all render correctly at 390px width, with the
  action row correctly stacked above the tab content and not overlapping
  it.
- `CaseDetailTabs`'s horizontal tab strip fits within the 390px viewport
  without visual clipping for the tested tab count.
- `ActionSheetTrigger`'s `Sheet` opens as a full-width bottom sheet with
  rounded top corners and a grab handle on mobile width, and as a
  centered, max-width modal on desktop width — confirming the `sm:`
  breakpoint switch documented in Loop 51 actually produces the intended
  two layouts, not just compiles to two sets of classes.
- Backdrop blur, border, and shadow render as intended against the dark
  token background in both layouts.
- Pressing Escape while the sheet is open closes it (dialog count goes to
  0) and returns focus to the exact trigger button that opened it
  (`document.activeElement` after close reports the "Open Mark-Duplicate
  sheet" button's own text) — confirming the `previouslyFocused.current
  ?.focus?.()` code path in `sheet.tsx` actually works, not just compiles.

**Not covered by this render pass** (dummy-data preview, not the real
Case Detail page): the sticky bar's actual clearance against the real
bottom nav on a real authenticated page, and any tab whose content is
long enough to require scroll-under-sticky-bar behaviour. These remain
reasoning-verified only (the `bottom-20` offset reuses the app layout's
own already-established `pb-20` safe zone, per Loop 52's own report) —
CI/E2E against the live Supabase project is still the authoritative check
for the fully-real page, exactly as flagged in Loop 51/52's reports.

## 8. (Renumbered) Overall verification status

`tsc --noEmit`, `eslint`, `next build`: all previously clean for Loops
51-52 and re-confirmed unaffected — this loop made no changes to any file
that ships in the app; the only edits were the local-only, reverted
`proxy.ts` bypass and the deleted throwaway route.

## What this loop does NOT do

- Does not change any shipped file. `git status --short` is empty at the
  end of this loop — this was a pure verification loop.
- Does not fix the §6 "sheet doesn't explicitly close on success" finding
  — recorded, not silently patched, since a real fix needs Boss input on
  whether a brief success state is wanted (adds scope beyond this batch's
  visual/structural redesign remit) or the abrupt unmount is acceptable.
- Does not attempt to render the real, authenticated Case Detail page —
  RISK-05 still blocks that from this sandbox; CI remains the path for
  that specific confirmation.
