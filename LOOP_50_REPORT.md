# Loop 50 — Design-token overhaul: MONARCH visual language adopted (Stage 1 of the visual redesign)

## Why this loop exists

The Boss's own live use of the app surfaced two things in the same conversation:
1. A functional confusion (§ addressed separately — the app looked empty because
   Loop 49's test-data cleanup had deleted every case, and most lifecycle
   actions only appear inside an existing case).
2. A genuine visual complaint: "Application ek basic web page jyada lag rahi
   hai" — the app looked like generic scaffolding, not a "top tier" product.

The Boss supplied two reference files for what "top tier" means concretely:
`current_AOS_index.html` (their Accounts Operating System) and
`Quality_Final.html` (their MONARCH Quality/QC module). Both were read in full
by dedicated research agents before any code was touched (see the two
design-system extraction reports in this session's transcript).

**The key finding that shaped this loop**: AOS and Quality are not two
different designs — they share the *exact same* CSS custom-property scheme
(identical hex values: `--bg:#0a0f18`, `--card:#131924`, `--brand:#3b82f6`,
`--good:#22c55e`/`--warn:#f59e0b`/`--bad:#ef4444`, identical `--r:12px`
radius token, identical `Inter` font choice). This is the Boss's company's
established MONARCH design language, already proven across two shipped
products — not something to invent, something to *adopt*. The Maintenance
module was using generic Tailwind slate/indigo defaults, disconnected from
either sibling app, which is the concrete reason it read as "basic."

A second finding validated Sarvam's own DR-02 proposal (bottom-sheet action
forms): Quality's "Disposition" wizard is a real, already-shipped bottom-sheet
modal in the same family — so that proposal isn't a speculative visual
opinion, it's consistency with a pattern the Boss's own team already ships.
That restructuring is **not** in this loop (see "What this loop does NOT do"
below) — it's the next one.

## Scope of this loop (Stage 1 — tokens, not structure)

Deliberately bounded to **presentation only**: every route, every RPC call,
every state-gating boolean, every business rule is byte-for-byte unchanged.
This is a colour/shadow/radius/typography pass across the existing structure,
not a layout rewrite (Case Detail is still one long page — that's Loop 51+,
pending this gate's approval).

### 1. Design tokens (`src/app/globals.css`)

Full MONARCH token set adopted verbatim from AOS/Quality (dark-first,
5-level surface stack: `--bg` → `--bg1` → `--bg2` → `--card` → `--card2`,
translucent-white borders at two opacities, the same 7-colour semantic
palette). Wired into Tailwind v4's `@theme inline` so ordinary utility
classes (`bg-card`, `text-muted`, `border-line`, `bg-brand`, …) are available
everywhere without any file re-declaring raw hex. Added:
- A shared `.chrome-blur` class (backdrop-filter blur) for fixed/sticky
  chrome — the one deliberately-reused "glass" effect both references share.
- A base-layer `input, select, textarea` rule giving every form control a
  translucent dark fill by default — closes a gap where ~27 form files set
  border/radius/padding but never a background/text colour, which would
  otherwise have fallen back to each browser's native (often white) control
  against the new dark page. Element-selector specificity is lower than any
  Tailwind class, so a file that already sets its own colour keeps it.
- `Inter` now actually loaded via `next/font/google` (`src/app/layout.tsx`).
  Both reference apps *name* Inter in their CSS but never load it anywhere
  (no `<link>`, no `@font-face`) — silently falling back to the OS system
  font on any device without Inter installed. Loading it for real is a
  small, deliberate improvement over both references, not a deviation.

### 2. Shared component library (`src/components/ui.tsx`)

Rewrote `Button` (gradient fill + colour-matched glow shadow + press-scale
feedback, matching AOS's primary-button treatment), `Card` (flat dark surface
+ two-layer shadow), and the badge system.

**New: a single canonical case-status colour map.** This directly closes
three findings from `SARVAM_VERIFICATION_REPORT.md`:
- Finding 1c (Case Detail's status badge was hardcoded to one blue tone
  regardless of the case's actual state).
- The "three separate, inconsistent status-colour maps" noted in that
  report's §2 (DR-05 row) — `cases/page.tsx`'s `STATUS_STYLES` (9 of 16
  statuses covered), `dashboard/page.tsx`'s `statusColor` (16 of 16, but a
  separate copy), and case-detail's hardcoded single tone.

`STATUS_TONE` now maps all 16 `case_status` enum values to one of 7 tones,
exported as `statusBadgeClass`/`StatusBadge` (tinted pill, for queue cards
and the case-detail header) and `statusFillClass` (solid fill, for the
dashboard's bar-chart segments) — same lookup table, two renderings. Colour
intent follows Sarvam's own DR-05 proposal (§8 state badges: rose = needs
triage, amber = active/waiting, violet = in-repair, teal = restored, green =
released, grey = terminal) rather than an invented scheme.

`cases/page.tsx`, `dashboard/page.tsx`, and `cases/[id]/page.tsx` were all
updated to import from this one source instead of maintaining their own
copies.

### 3. Chrome (`app-nav.tsx`, `(app)/layout.tsx`)

Bottom tab bar and desktop rail restyled with `.chrome-blur` (frosted glass,
matching AOS's topbar/bottom-nav treatment) and a glowing gradient active
state on the desktop rail (matching AOS's sidebar `.nav a.on`). Header logo
mark changed to the orange gradient + glow AOS/Quality both use for their
brand mark specifically (kept distinct from the blue "interactive" brand
colour, matching both references' convention of two accent colours: orange
for identity, blue for actionable UI).

### 4. Systematic palette sweep (41 files)

Every remaining file using the old Tailwind slate/indigo/light-semantic
palette (`bg-white`, `border-slate-200`, `text-slate-900`, `bg-red-50`/
`text-red-700` alert boxes, etc. — 24 distinct base patterns plus their
`hover:`/`focus:` variants, ~700 occurrences total) was mapped onto the new
tokens via a reviewed, whole-token regex substitution (word-boundary
matched, applied only to exact utility-class tokens, not partial matches)
and then verified, not just assumed correct:

- `tsc --noEmit`, `eslint`, `next build` all clean after every pass.
- The `"use client"` boundary re-scan (anchored regex across every changed
  file) clean — this loop touched no client/server export shape.
- One self-inflicted bug caught and fixed before it shipped: the first sweep
  pass also matched `bg-white/[opacity]` (a *translucent white overlay* I
  had just deliberately written into the new `ui.tsx`/`app-nav.tsx`) and
  rewrote it to `bg-card/[opacity]` — nonsensical (a dark colour tinted
  further onto an already-dark background is nearly invisible). Caught by
  reading the diff after the sweep, not assumed clean because tsc passed
  (tsc has no opinion on whether a colour choice makes visual sense).
  Fixed with a scoped follow-up substitution restricted to the two files
  actually affected.
- A second self-inflicted bug: an early CSS comment in `globals.css`
  literally contained the string `*/` inside its explanatory text (listing
  Tailwind class examples like `bg-*/text-*/border-*`), which closed the
  CSS comment early and broke the whole stylesheet parse — caught immediately
  by actually starting the dev server and hitting a 500, not by tsc/eslint
  (neither lints raw CSS comment content). Reworded to avoid the sequence,
  re-verified by re-running the dev server successfully afterward.

### 5. Live visual verification

`RISK-05` (this sandbox's egress proxy blocks the live Supabase project)
still applies — confirmed again this loop (`curl` to the project host
returns a proxy `connect_rejected`) — so the authenticated views (Cases,
Case Detail, Dashboard, KPI, PM) could not be rendered against real data
from here; CI (which can reach the live project) is the verification path
for those, same as every prior loop. But `/login` needs no data to render,
so it was actually built and screenshotted (desktop + mobile) via a local
`next dev` + Playwright script — not just assumed correct from reading the
diff. Both screenshots sent to the Boss directly. The new dark theme,
gradient button, translucent inputs, and Inter typography all render as
intended.

## What this loop does NOT do

- Does not restructure Case Detail into Sarvam's proposed bottom-sheet
  action model (still one long page) — that is genuinely the next stage,
  not folded in here, so this loop's diff stays reviewable and single-purpose.
- Does not touch the two `IMPLEMENTATION_PACK.md` gaps from
  `SARVAM_VERIFICATION_REPORT.md` (intake form missing `shift`/`priority`;
  2 of 8 §9 diagnosis fields uncaptured) — those are business-logic/schema
  questions, not a colour pass, and stay explicitly separate.
- Does not change any RPC, migration, RLS policy, or lifecycle rule. Grepped
  the full diff for anything touching `supabase/migrations/` or any
  `.sql` file: zero matches. This loop is `src/` only.
- Does not claim full visual parity with AOS/Quality — this is the token
  and shared-component foundation; several page-specific layouts (dense
  KPI grids, PM cards, etc.) still use the *old* structural layout with
  the *new* colours, which is a coherent, intentional midpoint, not a
  finished redesign.

## Checks run

`tsc --noEmit`: clean. `eslint`: clean. `next build`: clean (all 11 routes
compile). `"use client"` boundary re-scan: clean. Existing
`tests/button-touch-target.test.ts`: still 3/3 passing (the Loop 48 48px
touch-target guarantee survived this rewrite of `ui.tsx`). Live-rendered
and screenshotted `/login` (the one route this sandbox can actually reach
without live Supabase data).
