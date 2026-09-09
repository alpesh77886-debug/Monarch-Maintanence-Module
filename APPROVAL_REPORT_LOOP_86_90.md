# Approval Gate Report — Loops 86-90

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is the mandatory hard stop
after the 5th completed loop. Autonomous loop work is PAUSED. Loop 91 will
not start without explicit continuation language from the Boss — silence,
"looks good," or an unrelated reply is not approval. This applies even
though the Boss's "loop 86 se 90 continue karo" pre-approved this batch in
advance — the mandatory stop is independent of pre-approval, per standing
practice since Gate 8.

This batch opened differently from every prior one: the Boss reported a
real, live-app bug directly (with screenshots), rather than the report
self-selecting a direction from a prior gate's flagged candidates. Loop 86
targeted that report first. Loops 87-89 then followed the investigation
trail it opened, closing two items that had sat flagged-but-unaddressed
across several gate reports. Loop 90 is this wrap-up and stop.

## What happened across these 5 loops

| Loop | What | Result |
|---|---|---|
| 86 | Boss-reported bug: no way back after navigating Home → a section | Investigated with an isolated Playwright test before assuming a fix — proved browser/device back navigation (`page.goBack()`) works correctly, twice in a row. Real gap was discoverability: `(app)/layout.tsx`'s header showed only a bare "M" logo on mobile (the Boss's own screenshot width), no visible back-indicator. Added an explicit "‹" chevron + `aria-label="Back to Home"`, always visible |
| 87 | Two related gaps found while investigating Loop 86 | Loop 82's `role="alert"` sweep had missed 6 files using a multi-line `{error && (` variant its exact-match sed skipped — fixed. `cases/new` (Create Case flow) had no way out at step 0, the same class of gap as Loop 86 one level deeper — added the same `← All cases` link pattern Case Detail already uses |
| 88 | Closed the "toLocaleString() latent-hydration-risk" gap flagged since before Loop 61, never addressed until now | Root-caused as a real Next.js hydration-mismatch source (server/client locale mismatch) for 12 of 15 flagged files. The fix already existed (`formatIst()` in `src/lib/format.ts`, already used correctly in 2 files) — applied it to the other 15 |
| 89 | Closed the "Performance UX investigation (§24/§38)" gap flagged since Gate 13, never addressed until now | Checked `loading.tsx` coverage across every route — found 7 of 12 had none, including `/home` (first screen after sign-in) and `/cases` (single most-visited screen). Added all 7, matching Loop 67's established Skeleton pattern |
| 90 | Final sweep + this gate report | Confirmed no further concrete loading.tsx gap remains (only `/` and `/login` lack one, both correctly — `/` is an instant redirect with no fetch, `/login` is a client-only form with no server data fetch) |

Full commit-level detail: Loop 86 in PR #85, Loop 87 in PR #86, Loop 88 in
PR #87, Loop 89 in PR #88. All four opened and merged cleanly with no
same-branch-PR conflicts this batch (a first since Gate 15) — every prior
PR had already merged by the time the next loop's commit was pushed.

## Defects found and fixed this batch

- **Case Detail/section-level "no way back" gap** (Loop 86, Boss-reported):
  real, user-facing, hit via actual use of the live app — not something a
  code-only investigation had caught. The header's back-to-Home affordance
  existed in code (`<Link href="/home">`) but was visually indistinguishable
  from a plain logo on mobile, since "MONARCH Maintenance" text is hidden
  below `sm:`. Fixed with an explicit chevron.
- **6-file `role="alert"` sweep gap** (Loop 87): a real accessibility
  regression left over from Loop 82's own sweep — sed's exact single-line
  match silently skipped a multi-line formatting variant used in 6 files,
  including the login page and the Case Queue itself.
- **Create Case flow step-0 trap** (Loop 87): the same navigation-gap class
  as Loop 86, one level deeper — no back-link at all until `step > 0`.
- **15-file hydration-mismatch risk** (Loop 88): a real, if latent, defect
  that had been correctly diagnosed and even partially fixed (2 files) in
  an earlier loop, then never finished — left flagged in gate report after
  gate report without anyone actually closing it out.
- **7-route loading.tsx gap** (Loop 89): also real and latent — not a
  crash, but a genuine blank-screen UX regression on the app's two most-
  visited screens (`/home`, `/cases`), also flagged repeatedly and never
  closed.

No CRITICAL or HIGH findings this batch — all five items above are real,
user-facing gaps but none touch lifecycle state, authority, or data
integrity.

## What this batch is NOT claiming

- **Not a claim that RISK-32/RISK-33 are addressed.** Both remain `OPEN`,
  completely untouched this batch, per the Prompt's own §4 "DO NOT REBUILD
  THE BACKEND" constraint and because both are business-rule design
  decisions requiring the Boss, not a guess.
- **Not a full performance audit.** Loop 89's "Performance UX
  investigation" was scoped specifically to `loading.tsx` coverage (a
  concrete, mechanically-checkable gap) — not bundle-size analysis, not a
  Lighthouse/Web-Vitals pass, not database query-plan review. The sandbox
  cannot run a live authenticated Lighthouse pass (RISK-05), so this scope
  was chosen deliberately as something that could be investigated and
  verified without that dependency.
- **Not every possible navigation-affordance gap found.** Loop 87 checked
  specifically for the same "no way back at all" pattern Loop 86 surfaced
  (multi-step wizards trapped at step 0) and found `cases/new` was the
  only other instance in the whole codebase — a targeted follow-up, not an
  exhaustive UX audit of every screen's navigation options.
- **Not a business-logic or authority change of any kind.** All 5 loops
  are presentation-layer/UX-polish only — zero RPC signatures, zero
  `.insert()` payloads, zero RLS policies changed across the whole batch.

## Verification posture this batch

Every loop's `tsc --noEmit`/`eslint`/`next build` came back clean. Every
behavioral claim got real, empirical verification via the Loop 53
throwaway-route + local-only `proxy.ts`-bypass technique:

- Loop 86: two throwaway routes replicating the real `/home` vs.
  `(app)`-group layout structural difference, driven through
  `page.goBack()` twice round-trip to prove browser back navigation
  itself was never broken, before attributing the bug to discoverability.
- Loop 87: the `role="alert"` fixes reused Loop 82's already-verified
  pattern (no new render behavior); the Create Case back-link was live-
  rendered by re-exporting the real component.
- Loop 88: `formatIst("2026-09-09T09:30:00.000Z")` confirmed rendering
  "9 Sept 2026, 3:00 pm" (correct UTC→IST conversion), both directly and
  through `NotificationBell`'s real render path.
- Loop 89: all 7 new `loading.tsx` components rendered together on one
  throwaway route, confirmed zero page errors and visually reasonable
  shapes at 390px.

No CI flakes hit this batch's four PRs — all green on the first CI run.

## Open items — unchanged from every prior gate this span

- **RISK-32** (CRITICAL, reopen authority) and **RISK-33** (MEDIUM,
  complainant disagreement) remain `OPEN` in `RISK_REGISTER.md`, unchanged
  since Gate 12 — untouched across this batch and every batch since. These
  have now been explicitly flagged to the Boss twice (Gate 17's report and
  directly in this session's Hinglish reports) as the highest-severity
  open items in the repo, still awaiting a Boss design decision on the
  exact mechanism for "Executive + Manager" reopen authority and
  "complainant + Executive jointly decide."
- Type B items unchanged: shared test/prod Supabase project (mitigated by
  run-tagging), leaked-password protection (Boss: last), §35 PENDING-01
  through 04.
- **Both items that WERE flagged as unaddressed Type B risk across
  multiple gate reports are now closed this batch**: the
  `toLocaleString()` hydration-risk pattern (Loop 88) and the
  `loading.tsx` coverage gap (Loop 89). No open items of this shape
  remain that this project is aware of.

## What the Boss needs to decide before Loop 91

Per §19.9/§19.13: explicit continuation language is required, e.g. "Loop
91 se aage badho" or "Approved, continue." With both previously-flagged
Type B items now closed, and no fresh Boss-reported bug pending, **the
most concrete, highest-value next step is RISK-32 and RISK-33** — both
have been flagged as awaiting a Boss design decision since Gate 12, and no
further progress is possible on them without one:

1. **RISK-32 (CRITICAL)**: what should "reopen authority = Executive +
   Manager" actually mean as an implementation? Manager-only (since
   Manager already holds general override authority)? A genuine two-actor
   joint action (like the emergency claim-then-confirm two-step)?
   Something else?
2. **RISK-33 (MEDIUM)**: what should "complainant + Executive jointly
   decide" look like as a real interaction — a two-party confirmation
   step, a dispute flag the Manager resolves, something else?
3. Something else entirely — this report does not pre-select a direction
   if the Boss prefers a different focus.
