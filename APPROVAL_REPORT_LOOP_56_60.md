# Approval Gate Report — Loops 56-60

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is the mandatory hard stop
after the 5th completed loop. Autonomous loop work is PAUSED. Loop 61 will
not start without explicit continuation language from the Boss — silence,
"looks good," or an unrelated reply is not approval.

This batch ran on "Continue...Loop 56 to 60" — no specific candidate was
picked from `APPROVAL_REPORT_LOOP_51_55.md`'s list of 4, so it proceeded on
candidate 1 (the lowest-risk, most concrete one): a full golden-scenario
(§32) and negative-test (§33) re-verification pass against the Blueprint's
own registry, since that confirms existing claimed coverage rather than
inventing new scope.

## What happened across these 5 loops

| Loop | What | Result |
|---|---|---|
| 56 | Full §32/§33 golden-scenario/negative-test re-verification against the 216-test suite | 2 real, previously-undetected LOCKED-rule violations found (RISK-32, RISK-33 — see below); 2 genuine test-coverage gaps closed (NS-007, NS-019); 1 assertion strengthened (NS-009) |
| 57 | Two follow-up sweeps from Loop 56's findings | Confirmed RISK-32 has no siblings among joint-authority rules already buildable in this standalone module (only §20's Planned Maintenance Window is a sibling, and it's legitimately unbuilt Phase-3 scope — needs a Production Manager actor this module doesn't have); re-swept the whole app for pre-redesign Tailwind patterns, confirmed Loop 50-53's visual redesign held with zero regressions |
| 58 | Refreshed the V1 completion snapshot against `IMPLEMENTATION_PACK.md` §32's 25-item acceptance checklist | 23/25 fully compliant; the 2 partial items share root cause with RISK-32/RISK-33, not double-counted as new gaps |
| 59 | Dependency security audit | `npm audit`: 0 vulnerabilities across 640 deps; patch-bumped the 2 most security-relevant packages (`@supabase/ssr`, `@supabase/supabase-js`); left 3 major-version jumps alone deliberately |
| 60 | Live Boss bug report on `/pm`, fixed; this gate report | See below |

Full detail for each loop is in its own `LOOP_<N>_REPORT.md` (56-59); Loop
60's investigation is detailed in the `CHANGELOG.md` "Interstitial" entry
dated 2026-09-08, since it was a live bug fix rather than a planned
verification loop.

## Loop 56 in more depth — RISK-32 and RISK-33

The systematic re-verification found two real gaps between LOCKED text and
shipped behavior, neither guessed at or fixed unilaterally, per "no silent
architecture drift":

- **RISK-32 (CRITICAL)**: `reopen_case` only checks `is_staff()` — any
  single Executive OR Manager can reopen a `CLOSED` case alone. This
  contradicts `IMPLEMENTATION_PACK.md` line 150's own LOCKED text —
  "Reopen authority = Executive + Manager" — confirmed in the pack itself,
  not just the new Blueprint (which independently states the same rule in
  its permission matrix and NS-014). Not fixed: the exact mechanism
  ("Executive + Manager" could mean Manager-only override, a genuine
  two-actor joint action like the emergency claim-then-confirm two-step, or
  something else) is a design decision, not a bug with one obvious fix.
- **RISK-33 (MEDIUM)**: the "complainant disagreement" path (§11 —
  "complainant + Executive jointly decide... no unilateral closure") has
  zero implementation anywhere — no RPC, state field, or gate represents
  it. Also awaiting a Boss decision on what "jointly decide" means as an
  actual interaction.

Both logged in `RISK_REGISTER.md`, both still `OPEN`, both explicitly
described as "not yet fixed — awaiting Boss decision" with the specific
ambiguity spelled out for each.

## Loop 60 in more depth — the live PM screen bug

The Boss reported, live and in Hinglish: *"PM wali screen broken lag rahi
hai...jab bhi click karte hai to niche ke 5 options 4 ho jate hai aur
screen mobile application nahi rehti aisa fill hota hai."* (The `/pm`
screen looks broken — clicking anything turns the bottom nav's 5 options
into 4, and the screen stops looking like a mobile app.)

`app-nav.tsx` was read first and ruled out — `NAV_ITEMS` is a static
5-entry array with no conditional logic. Reproduced with a throwaway,
dummy-data preview route mirroring `/pm`'s real component tree (deleted
before commit, along with the local-only `proxy.ts` bypass used to serve
it — same technique as Loop 53, confirmed via `git status --short` empty
before committing). The very first screenshot, before any interaction,
already showed the cause: the Next.js dev "N — 1 Issue" overlay rendered
directly on top of the fixed bottom nav bar, covering the Cases icon — a
React hydration mismatch, confirmed in the dev log.

Root cause: `pm-plan-card.tsx` and `pm-instance-card.tsx` formatted dates
(`approved_at`, `due_at`, `overdue_since`) with a bare `.toLocaleString()`,
which resolves the runtime's own locale/timezone — different on the
server (container, UTC) than the client browser (plant floor, IST). The
server-rendered HTML and the client's first render disagreed, React
discarded and re-rendered the affected subtree, and `/pm` renders
everything unconditionally with no tabs (unlike Case Detail after Loop
51's restructure), so this was immediately visible on load.

Fixed with a new `src/lib/format.ts` (`formatIst()`: fixed `"en-IN"`
locale + `"Asia/Kolkata"` timeZone) used at both call sites — no other
behavior changed. Re-ran the same repro after the fix: no hydration error,
all 5 nav icons render cleanly at every step. `tsc --noEmit`, `eslint`,
and `next build` all clean. Pushed directly (this was a live production
bug affecting the Boss's actual use of the app, not batch verification
work) and folded into PR #59, which was already open and green — merged
together after CI passed on the combined head.

**Scope note, not fixed this loop**: the same bare-`toLocaleString()`
pattern exists in 15 other files repo-wide (grepped, not individually
confirmed to be user-visible in each). Not touched here — only `/pm` was
reported broken and reproduced, and pages like Case Detail likely mask the
same latent issue by rendering most date-bearing content behind tabs/
sheets that delay first paint past hydration. Candidate for a dedicated
follow-up sweep if the Boss wants one.

## Defects found and fixed this batch

- **NS-007, NS-019**: 2 genuine test-coverage gaps closed on already-correct
  code (no business-logic change).
- **RISK-32 (CRITICAL, not fixed — Boss decision needed)**: reopen
  authority enforced as single-actor `is_staff()`, contradicting the LOCKED
  "Executive + Manager" rule.
- **RISK-33 (MEDIUM, not fixed — Boss decision needed)**: complainant-
  disagreement joint-decision path has zero implementation.
- **The `/pm` hydration bug (Loop 60, fixed and shipped)**: real, live,
  user-visible defect on a page the Boss was actively using — the most
  concrete finding this batch, and the only one that shipped a fix without
  waiting for a decision, since the correct fix was unambiguous (pin
  locale/timeZone) and touched no business logic.

RISK-32 remains the most serious open item in the project — a LOCKED
financial/authority-adjacent rule (reopening a closed case) that is
currently enforced more loosely than the pack requires.

## Verification posture this batch

Every loop's `tsc --noEmit`/`eslint`/`next build` came back clean
throughout. `npm test` (Vitest) remains blocked from running locally by
RISK-05 (this sandbox cannot reach the live Supabase project directly) for
every loop this batch — CI is and remains the verification path for the
full lifecycle/E2E suite. Two CI failures this batch (`handover.test.ts`
on an earlier PR, `spares.test.ts` on PR #59) were diagnosed as the
now-familiar shared-live-DB concurrency flake pattern, each confirmed with
exactly one re-run per the standing rule, both green on retry.

## Open items — none newly introduced except Loop 60's scope note

- **RISK-32** (CRITICAL) and **RISK-33** (MEDIUM) — both `OPEN` in
  `RISK_REGISTER.md`, both need a Boss decision before they can be fixed
  (see "What the Boss needs to decide," below).
- Type B items unchanged from earlier gates: shared test/prod Supabase
  project (mitigated by run-tagging, not resolved), leaked-password
  protection (Boss: last), §35 PENDING-01/02/03/04 (LOTO/PTW SOP,
  Production integration contract, granular permissions, recurrence
  threshold — Boss: keep PENDING).
- New this batch: the same `toLocaleString()` hydration-risk pattern in 15
  files outside `/pm`, not yet confirmed user-visible anywhere else, not
  fixed.

## What the Boss needs to decide before Loop 61

Per §19.9/§19.13: explicit continuation language is required, e.g. "Loop 61
se aage badho" or "Approved, continue." This report itself is not a request
to proceed on its own — it is the mandatory checkpoint.

Two specific decisions are needed before RISK-32/RISK-33 can be fixed —
these are not guesses to make on our own, per "no silent architecture
drift":

1. **RISK-32 — what does "Reopen authority = Executive + Manager" actually
   mean as an interaction?** Candidates: (a) Manager-only override (any
   Executive currently allowed today is wrong, tighten to Manager-only),
   (b) a genuine two-actor joint action, mirroring the existing emergency
   claim-then-confirm two-step (an Executive requests reopen, a Manager
   confirms it, or vice versa), (c) something else entirely.
2. **RISK-33 — what does "complainant + Executive jointly decide" mean as
   an actual interaction?** There is currently no complainant-facing
   surface in the app at all — this may need one, or may route through the
   Executive with the complainant's input captured out-of-band.

Candidates for the next batch, for the Boss to prioritize or redirect:

1. A Boss decision on RISK-32 and/or RISK-33, implemented once decided.
2. A dedicated sweep fixing the `toLocaleString()` hydration-risk pattern
   across the other 15 files, closing the whole bug class rather than one
   page at a time.
3. Anything else the Boss wants prioritized — this report does not assume
   the next batch's shape.
