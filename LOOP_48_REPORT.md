# Loop 48 — Mobile-first UX pass (§30, §32 item 21) + Sarvam Type-A handoff intake

Third loop of the Boss-approved "Type A" scope, and the first to touch the
Sarvam handoff (`6eb628f4-MONARCH_Maintenance_Sarvam_TypeA_Handoff1.md`),
received mid-loop with the instruction: use it as non-binding Type A
guidance only, finish current Type A work, and expect the full Sarvam HTML
later as the verification oracle. DR-01 through DR-05 in that handoff
(bottom tab bar, bottom-sheet action screens, card-list, sticky primary
action, semantic badge colours) are marked PROPOSED there, not LOCKED — they
are treated that way here: read for guidance, not implemented as new
requirements, and not claimed as "Sarvam compliance."

## Correcting an overstated first pass

The percent-complete breakdown given to the Boss before this loop described
mobile UX as "only 4/36 client components use any responsive Tailwind
classes" — a real number, but measuring the wrong thing. Tailwind v4 is
mobile-first: unprefixed classes (`p-4`, `flex-col`, `text-base`) already
apply at every viewport, and `sm:`/`md:`/`lg:` prefixes only mark
*upward* enhancement. A component with zero responsive prefixes is not
necessarily desktop-only — it can simply need no viewport-specific
override because its base styling already works everywhere. Grepping for
prefix presence measures "how many components have a desktop-specific
enhancement," not "how many components are mobile-ready."

Re-checked the actual rendered structure instead of the prefix count, for
every screen that carries real user work:

| Surface | Structure found | Mobile-native already? |
|---|---|---|
| `/cases` (queue) | card list (`app-nav.tsx`/cases page), no `<table>` | Yes — DR-03's "cards not a dense table" was already true |
| Bottom navigation | fixed bottom tab bar, already present | Yes — DR-01's shape was already true |
| `/cases/new` | single-column form, no multi-column grid that would break under 640px | Yes |
| PM plans pages | list/card rows, no `<table>` | Yes |
| Recurrence rules pages | list/card rows, no `<table>` | Yes |
| Case detail forms (journal, spares, etc.) | click-to-expand sections, `text-base` inputs (prevents iOS auto-zoom-on-focus) | Yes |
| `<table>` anywhere in `src/app/` | exactly one — `dashboard/page.tsx`'s "By staff member" breakdown | Yes — already `<div className="mt-2 overflow-x-auto"><table className="w-full min-w-[28rem] ...">`, a standard scroll-container pattern, not an uncollapsed dense grid forcing zoom |

(`grep -rn "<table" src/app/` was re-run for this report and does find
that one match — an earlier draft of this report claimed "zero matches,"
which was wrong; corrected here rather than left in. It doesn't change
the conclusion: the one table that exists is already handled correctly
for mobile, it just isn't a *zero*.)

**No genuine structural mobile defect exists in any of the above.** The
codebase was already substantially mobile-considerate before this loop —
this correction was reported to the Boss directly rather than let the
overstated "4/36" framing stand uncorrected.

## The one real, verified gap

§30 asks for a minimum touch target around 48px on primary actions (the
Sarvam handoff's §C repeats the same "minimum touch target around 48px"
figure independently, so this is corroborated from two directions, not
invented from one). `src/components/ui.tsx`'s shared `Button`/`LinkButton`
`"md"` size — the default size, used for every "Save", "Acknowledge",
"Submit" action across the app's primary operating surface — rendered at
`px-4 py-2 text-sm`, which resolves to roughly 34-36px tall depending on
font metrics. Under the ~48px guideline.

`"sm"` (`px-2.5 py-1.5 text-xs`) was deliberately left untouched. It is
used at 26 call sites for secondary/inline actions — badges-with-actions,
table-row-style buttons in dense lists (e.g. the spares-panel request
list) — and is not the primary tap target either guideline is about;
enlarging it would make already-dense rows worse, not more usable.

### Fix

`src/components/ui.tsx`, `SIZE_CLASSES.md`: added `min-h-12` (`3rem` =
48px) to the `"md"` size only. One line changed, plus a comment recording
the reasoning so a future loop does not "fix" `sm` into the same treatment
without re-deriving why it shouldn't be. Every caller of `<Button>` /
`<LinkButton>` with the default or explicit `size="md"` — every screen in
the app — picks this up automatically; no per-call-site edits needed,
because the whole point of this shared component is that one change here
is one change everywhere.

### Test

No prior test in this repo asserts on Button/Badge className strings, so
this was safe to change without touching test coverage elsewhere. This
project's `tests/` directory is exclusively Supabase-RPC integration tests
(`vitest.config.ts`: `include: ["tests/**/*.test.ts"]`, `environment:
"node"`) — there is no component-render test infrastructure (no React
Testing Library, no jsdom). `buttonClass()` is a plain function that
returns a class string, so it fits the existing `.ts`-only test pattern
without needing to introduce new tooling for one line of CSS:

`tests/button-touch-target.test.ts` (new, 3 tests):
- default `"md"` size includes `min-h-12`
- `"sm"` size does **not** include `min-h-12` (guards the deliberate
  exception — if a future loop accidentally applies the change to `sm`
  too, this fails loudly)
- the rule applies to every variant (`primary`/`secondary`/`danger`/
  `warning`/`success`/`ghost`), not just the default `primary` one

Verified locally:

```
MAINTENANCE_TEST_WRITES_OK=1 npx vitest run tests/button-touch-target.test.ts
```

→ `Test Files 1 passed (1)`, `Tests 3 passed (3)`, 390ms. (Global teardown
printed its usual RISK-05 sandbox warning — "sign-in failed: Unexpected
token 'H', ... is not valid JSON" — because this sandbox's egress proxy
cannot reach the live Supabase project; harmless and expected per every
prior loop's experience, and the teardown is designed to warn-and-return
rather than fail the run.)

## Type-A forensic sweep (handoff §"TYPE A FORENSIC SWEEP")

The handoff requires enumerating 8 categories after any UX change, not
stopping at visual inspection. This change is a single Tailwind utility
class added to one shared function — no markup structure, event handler,
or data flow changed. Swept anyway, explicitly, rather than assumed safe:

1. **Triggers** — unaffected; no DB object touched, this is a pure
   front-end CSS change.
2. **Constraints** — unaffected, same reason.
3. **RPC / state-transition guards** — unaffected; `Button` carries no
   business logic, only forwards `onClick`/`disabled`/`type` props
   untouched (per the file's own header comment).
4. **RLS / grants** — unaffected, no DB object touched.
5. **Client-side state gating** — unaffected; `disabled` styling
   (`disabled:bg-*-300` etc.) is untouched, only the sizing class changed.
6. **Duplicate-submit / idempotency paths** — unaffected; button height
   has no bearing on click-handler idempotency, and no handler was edited.
7. **Error/rollback paths** — unaffected, same reasoning as #6.
8. **Mobile responsive behaviour** — this IS the change; verified by
   reading `buttonClass()`'s output directly (test #1 above) rather than
   only eyeballing a screenshot, and cross-checked against every variant
   (test #3) so the fix cannot silently apply to only one color.

No follow-on defect found in any of the 8 categories — the change is as
contained as it looks.

## What this loop does NOT claim

Per the handoff's completion protocol: this is **not** a Sarvam-compliance
claim. DR-01 (bottom tab bar) and DR-03 (card list) already existing in
this codebase is a fact about prior work, not evidence that the rest of
the Sarvam architecture (contextual bottom-sheet action forms, the
specific Case Detail local-nav tab set, the full permission matrix) has
been implemented — none of that was touched this loop, and none of it is
claimed here. The full mismatch-list exercise (Sarvam requirement /
current implementation / evidence / PASS-PARTIAL-FAIL / gap type) waits
for the full `MONARCH_Maintenance_Screen_Architecture.html` the Boss will
supply, as the handoff itself specifies.

## Checks

`tsc --noEmit`: clean. `eslint`: clean (including the anchored `"use
client"` re-scan — this loop touched no client-boundary export, `ui.tsx`
has no `"use client"` directive at all per its own header comment, and
nothing added one). `next build`: clean. New test: 3/3 passing, verified
above.
