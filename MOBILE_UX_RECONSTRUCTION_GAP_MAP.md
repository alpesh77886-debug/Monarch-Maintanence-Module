# Mobile UX Reconstruction — Gap Map (Loop 61)

Source documents (Boss-supplied, this loop):
- `MONARCH_Maintenance_Mobile_Application_Experience_Reconstruction_Prompt_V2.md` (47 sections, the UX reconstruction contract for Loops 61+)
- `MONARCH_Screen_Mockups_ENTERPRISE_V3.html` (21-screen visual/interaction reference, illustrative only per its own text)

Per the prompt's own §5 and §25 (forensic inspection before code, small auditable steps), this loop
inspects the real repository and runtime before any implementation. No code changed this loop.

## Method

Read the current route tree, `AppNav`, `AppLayout`, `dashboard/page.tsx`, `cases/page.tsx`, the full
`cases/[id]/` component inventory, and `src/components/` shared primitives. Cross-checked against the
mockup's Screen 002 (Home/Module Hub) and Screen 003 (Case Queue) in detail; screens 4-21 not yet
individually forensically verified (flagged below, not skipped silently).

## Current state (evidence, not assumption)

| Area | Evidence |
|---|---|
| Post-login landing | `proxy.ts:51` redirects to `/cases` — there is no hub/home route today |
| Primary nav | `app-nav.tsx` — 5 static bottom-tab items: Cases / Shift / PM / Recurrence / KPIs, `flex-1` equal width, no side drawer anywhere in the codebase |
| Header | `(app)/layout.tsx` — logo, staff name (hidden below `sm:`), availability toggle, notification bell, sign-out — all always visible, no hamburger/menu trigger |
| Case Queue | `cases/page.tsx`, 86 lines — plain `.map()` list, **no search input, no filter chips, no age/urgency sort, capped at 50 with a static "Report case" link only, no pagination control** |
| Case Detail | `cases/[id]/page.tsx` + 23 sibling components — already restructured into tabs/sheets in Loop 51 (§9's "cockpit not document" goal is partially met); no compact lifecycle-journey visualization component exists yet |
| Spares | No top-level `/spares` route — `spares-panel.tsx` exists only inside Case Detail |
| Emergency | No top-level `/emergency` route — `emergency-panel.tsx` exists only inside Case Detail |
| My Work | No route exists at all |
| Shared components | `src/components/`: `ui.tsx` (199 lines), `sheet.tsx`, `tabs.tsx`, `stat-card.tsx` — no icon system, no loading-skeleton primitive, no empty-state primitive found by name |
| Design tokens | Loop 50's dark "glass chrome" token set (`--bg`, `--card`, `--brand`, etc.) — different palette from the mockup's teal/green Module Hub treatment (`#0f9f8e`/`#13b981`), which is a deliberately distinct home-screen accent, not a full re-theme, per the mockup's own CSS scoping (`.home-header`, `.module-tile`, etc. are hub-specific classes layered on top of the existing token set) |

## Evidence map (Current → Problem → Root cause → Target → Plan)

### 1. Post-login landing / Module Hub (Prompt §47 — MANDATORY, mockup Screen 002)

- **Current**: land directly on `/cases`, a plain list.
- **Problem**: no orientation screen; user has no "who am I / what shift / what can I do" surface (Prompt §3's 6 questions unanswered on arrival).
- **Root cause**: the app was built bottom-nav-first with no dedicated home concept; §47 is new scope, not a pre-existing gap this repo missed.
- **Target**: new `/home` (or `/` inside `(app)`) route — 2-column module tiles (Cases, Shift, PM, Spare Consumption, My Work, Emergency), shift-context banner, quick actions, side drawer (Work / Preferences / Account sections) triggered by a header hamburger.
- **Plan**: new route + new `AppDrawer` component + new `ModuleHub` page, sourcing role/shift/tile-badge data from real queries (staff row, shift/handover tables, open-case counts) — **zero fabricated values**, per the mockup's own explicit "illustrative mockup... should be sourced from authorised data" caption. `/spares` and `/emergency` and `/my-work` need **new routes** created (they don't exist today) since the hub links to them directly.

### 2. Primary navigation relabeling (Prompt §6, §34)

- **Current**: `Cases / Shift / PM / Recurrence / KPIs`.
- **Problem** (Sarvam finding, §34, already partially known from this session's own Loop 56-57 sweeps): "Shift" is a confusing label for a dashboard-like page; "Recurrence" is a long label for a 5-slot bar; no fast New Case shortcut.
- **Target** (Prompt §6 + mockup's own in-app tab bar, seen on Screens 3/4): `Control | Cases | PM | Spares | More`, i.e. the mockup keeps a *secondary* bottom tab bar on non-home screens even though Home itself has no bottom bar. This means two navigation surfaces coexist: the Home hub (no bottom nav) and everything else (bottom nav, relabeled).
- **Plan**: relabel/reorder `AppNav`'s `NAV_ITEMS`, add a `/spares` landing route it can link to, fold "Recurrence" into "More" (mockon Screen 003/004 tab bar has no Recurrence slot) rather than removing recurrence functionality — recurrence rules stay reachable, just not from the primary 5-slot bar. This is a navigation/IA change, not a business-rule change, so it's implementable without a Boss decision, but the exact "More" contents need to be decided (this session should not silently decide which of Recurrence/KPIs/Audit end up grouped under More vs staying primary — flagged for a quick confirm, not a hard stop).

### 3. Case Queue → work queue (Prompt §8, mockup Screen 003)

- **Current**: see evidence table above — no search, no filters, no urgency-first sort.
- **Target**: search input, status filter chips with live counts, priority/urgency-led visual hierarchy, age shown per row, FAB for "+ Report case" instead of (or alongside) a header link.
- **Plan**: rebuild `cases/page.tsx` — add server-side search/filter query params, filter chip row (client component for interactivity, counts from a real aggregate query — not fabricated), re-sort by urgency (EMERGENCY/aging-unassigned first) rather than pure `created_at desc`. No new tables needed; existing columns (`status`, `priority`, `created_at`, `current_owner_user_id`) are sufficient.

### 4. Case Detail → work cockpit (Prompt §9, §22, mockup Screen 004)

- **Current**: Loop 51 already moved this to tabs + bottom-sheet actions (real progress, not a gap from zero) — but no compact lifecycle-journey visualization (`Reported → Acknowledged → ... → Release`) exists, and the "next valid action" is not visually singular/dominant the way the mockup's `NEXT ACTION` block is.
- **Target**: add a compact horizontal lifecycle-state strip, and a single dominant "next action" affordance derived from current state + role + permissions (Prompt §22's "Next Action Engine" concept) rather than the current flat action-sheet trigger list.
- **Plan**: new `LifecycleStrip` component (reads the same locked transition graph already enforced server-side — display only, never a second source of truth) + a `NextActionCard` component that wraps the existing sticky primary-action bar with the single-dominant-action framing. Existing action sheets/forms are reused, not rebuilt from zero.

### 5. Design system governance (Prompt §42)

- **Current**: `ui.tsx`/`sheet.tsx`/`tabs.tsx`/`stat-card.tsx` cover buttons/badges/sheets/tabs/stat cards. No standardized loading skeleton, empty-state, or icon-set primitive exists as a named, reusable component.
- **Plan**: add `Skeleton`, `EmptyState` primitives; adopt one icon approach consistently (the mockup uses plain Unicode glyphs inside styled boxes, not an icon font/SVG library — cheapest, zero-new-dependency option, consistent with Prompt §40's free-tools-only constraint and §36 "one coherent icon set").

## What this loop is NOT claiming

- Screens 6-21 of the mockup (Assign, Diagnose, Waiting, Restoration, QC, Handover, Emergency claim/confirm, Spare request/usage, PM plan/instance, Recurrence, KPI, Audit, empty/error/loading states, tablet/desktop) have not each been individually forensically mapped yet — only the two most structurally significant ones (Home, Case Queue) plus Case Detail's delta from Loop 51. The remaining screens follow the same propagation pattern (§10 of this batch's plan, below) once the Home/Queue/Detail/component-system foundation lands, per the Prompt's own §25 sequencing ("do not spread effort across every page before the core mobile journey works").
- No browser-based multi-viewport verification has happened yet this loop — that starts once the first real screens (Home, Queue) exist to verify, per the established Loop 53 technique (throwaway local route + proxy bypass + Playwright, reverted before commit).

## Honest loop-count estimate for the full 47-section bar

Grounded in this repo's own historical velocity (Loop 50 = tokens only; Loop 51 = one screen's
structural rebuild; Loop 52 = one component + one page; Loop 53 = verification only; Loop 54 = a gap
matrix + 3 bounded fixes) and the concrete gap list above:

| Workstream | Estimated loops |
|---|---|
| Module Hub + side drawer + new routes (Cases/Spares/Emergency/My Work landing) | 2-3 |
| Nav relabel + IA change (Control/Cases/PM/Spares/More) | 1 |
| Case Queue rebuild (search/filter/urgency sort/FAB) | 1-2 |
| Case Detail cockpit delta (lifecycle strip + next-action engine) | 2 |
| Design-system primitives (skeleton, empty-state, icon consistency sweep) | 1-2 |
| Forms standardization sweep (§37 grammar, inline validation, submit-guard) across existing forms | 2 |
| Action-sheet quality bar (focus trap, backdrop dismissal, Escape) verified/fixed where missing | 1 |
| Create Case progressive-flow rebuild (§13) | 1 |
| Propagate the system to PM / Spares / More (§10 of the Prompt's own sequencing) | 2-3 |
| Desktop/tablet responsive enhancement pass (§16) | 1-2 |
| Accessibility pass (focus, keyboard, reduced motion, color-not-only-indicator) | 1-2 |
| Performance UX investigation (§24, §38) | 1 |
| Full multi-viewport browser verification + screenshot evidence (folded into the above, plus one dedicated regression pass) | 1-2 |
| Final `MOBILE_UX_RECONSTRUCTION_REPORT.md` + regression review (§31, §44) | 1 |

**Total estimate: roughly 18-26 additional loops** to genuinely satisfy the full §29/§45/§46 acceptance
bar (enterprise-credible, all 21 mockup screens propagated, full accessibility/performance verified) —
i.e., realistically **Loop 61 through roughly Loop 80-87**, not Loop 70. The 10 loops the Boss approved
(61-70) are enough to land the highest-leverage core journey — Module Hub, relabeled nav, Case Queue,
Case Detail's cockpit delta, and the shared component foundation everything else propagates from — but
not the full 21-screen, full-accessibility, full-desktop-enhancement bar in one batch. This matches the
Prompt's own §25 instruction not to spread effort across every page before the core journey works: the
core journey is achievable in this batch, full propagation is not.

This is a range, not a committed number — it will be refreshed with real evidence at each 5-loop gate
(Loop 65, Loop 70) as work proceeds, the same way every other estimate in this project has been
grounded in actual loop output rather than promised in advance.
