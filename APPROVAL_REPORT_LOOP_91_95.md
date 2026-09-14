# Approval Gate Report — Loops 91-95

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is the mandatory hard stop
after the 5th completed loop. Autonomous loop work is PAUSED. Loop 96 will
not start without explicit continuation language from the Boss — silence,
"looks good," or an unrelated reply is not approval.

This batch opened differently from the last one it can be compared
against: the Gate 18 report's own recommendation was RISK-32/RISK-33 —
both are business-rule design decisions that need the Boss, not a guess —
and the Boss's "Loop start karo 91 se 95" replied to the batch as a whole
without answering either question. Rather than stall the batch or invent
an answer (both barred), every other item in `RISK_REGISTER.md` was
checked first and confirmed Boss/access-blocked (RISK-01 through 06), and
the batch pivoted to fresh, self-directed, mechanically-verifiable
investigation work — the same posture used whenever a prior batch ran out
of Boss-answerable direction.

## What happened across these 5 loops

| Loop | What | Result |
|---|---|---|
| 91 | RPC test-coverage audit across all `maintenance.*` functions (mirrors Loop 43/44's authorization-boundary sweep) | Found exactly 3 zero-literal-coverage functions after fixing a too-narrow grep (`decide_recurrence_flag`, `is_qc_authority`, `mark_asset_known`). `decide_recurrence_flag` was the one real gap — a locked, staff-only, client-callable RPC with zero tests. Added 4 tests covering every guard reachable without a seeded flag row (FORBIDDEN, INVALID_DECISION, REASON_REQUIRED, FLAG_NOT_FOUND) |
| 92 | Live re-verification of CLAUDE.md's non-negotiable append-only rule, directly against the deployed Supabase project | Queried `pg_policies` for `case_events`/`audit_log` — confirmed neither has any INSERT/UPDATE/DELETE policy, RLS enabled on both. Clean; no code change |
| 93 | Extended Loop 92 into a full-schema sweep — every table and view in `maintenance` | All 28 tables have RLS enabled; the second reporting view (`case_current_root_cause`) already correctly carries `security_invoker=true`, holding the RISK-15 precedent without anyone re-deriving it. Clean; no code change |
| 94 | Live Vercel/Sentry runtime-config re-check (Loop 47's original scope, ~6 days stale) | Found a real new item this time: a Sentry issue that was actually 145 occurrences of CI/Playwright e2e test noise mistagged as `environment:"production"`, masking real errors behind false "escalating" alerts. Root-caused, fixed both instrumentation files, resolved the Sentry issue with a full root-cause comment |
| 95 | Final loop + this gate report | Wrap-up, no new investigation |

Full commit-level detail: Loop 91 in PR #90 (bundled with Loop 92's
docs-only commit after the stop-hook required it be committed), Loop 93
in PR #91, Loop 94 in PR #92 (two commits — the original fix plus a
follow-up after an automated Codex review caught a real gap in the
client-side half of it).

## Defects found and fixed this batch

- **`decide_recurrence_flag` had zero test coverage** (Loop 91): a real,
  locked, staff-only authority boundary with no regression protection at
  all. Not a live defect — the RPC's guards were all correctly enforced —
  but a real gap in "every material state change must be testable,"
  closed for everything reachable without a seeded flag row. The
  CONFIRMED/DISMISSED happy path and ALREADY_DECIDED guard still can't be
  covered without a live `run_recurrence_scan` firing (cron-only,
  permission-denied for any client) — same reasoning the test file's own
  header already gives for why that full chain was only ever verified
  live (CHANGELOG Loop 15). Deliberately did not invent a test-only
  backdoor RPC to force it — that would be its own schema/authority
  change, out of proportion to a coverage gap.
- **CI test traffic mistagged as production in Sentry** (Loop 94): a
  real, if low-severity, observability defect — genuinely new since
  Loop 47's clean sweep, not carried over. `src/instrumentation.ts` and
  `src/instrumentation-client.ts` both fell back to `process.env.NODE_ENV`
  whenever `VERCEL_ENV` was unset, and `next start` always sets
  `NODE_ENV=production` — CI included. Every Playwright e2e run's
  "destination stream closed early" (expected, when the browser
  navigates away mid-RSC-stream) got recorded in Sentry as a
  **production** error, accumulating to 145 occurrences and an
  "escalating" status that would eventually have drowned out a real
  production regression in the noise. Fixed by branching on GitHub
  Actions' own `CI=true` first. An automated Codex review on the PR then
  caught that the client-side half of the fix — a bare
  `process.env.CI` reference in `instrumentation-client.ts` — could not
  actually work, since Next.js only reliably inlines
  `NEXT_PUBLIC_*`/configured vars into the browser bundle. That gap had
  already been flagged honestly as unconfirmed in the PR description
  rather than claimed fixed; once flagged by review, fixed properly via
  `next.config.ts`'s `env` key and re-verified against the actual
  compiled client bundle output (not just the source) before pushing.

No CRITICAL or HIGH findings this batch. Loop 91's gap was a coverage
hole on an already-correctly-enforced boundary, not a live authority
bypass. Loop 94's defect was real but capped at MEDIUM at most — it never
affected the app's actual lifecycle, authority, or data, only the
signal-to-noise ratio of error monitoring.

## What this batch is NOT claiming

- **Not a claim that RISK-32/RISK-33 are addressed.** Both remain `OPEN`
  in `RISK_REGISTER.md`, completely untouched this batch — the Boss's
  batch-level continuation ("Loop start karo 91 se 95") did not answer
  either open design question from the Gate 18 report, and neither was
  guessed at.
- **Not a claim that every RISK_REGISTER item was re-litigated.**
  RISK-01 through 06 were checked to confirm they remain genuinely
  Boss/access-blocked (not to attempt them) before this batch pivoted to
  self-directed work — that check is recorded, not a re-investigation of
  each one's substance.
- **Not a business-logic or authority change of any kind.** Loop 91 adds
  tests only; Loops 92/93 are read-only database queries, zero writes;
  Loop 94 touches only Sentry SDK initialization config — zero RPC
  signatures, zero RLS policies, zero `.insert()`/`.update()` payloads
  changed across the whole batch.
- **Not a full observability audit.** Loop 94's Vercel/Sentry re-check
  matched Loop 47's original scope (deployment protection, env var
  exposure, unresolved-issue triage) — not a bundle-size pass, not a
  Web-Vitals/Lighthouse run, not a database query-plan review.

## Verification posture this batch

Every loop's `tsc --noEmit`/`eslint` came back clean. Loop 91's new
tests were verified via GitHub Actions CI (this sandbox's own egress
proxy returns 403 for direct `*.supabase.co` access — a genuine,
newly-observed sandbox network restriction distinct from RISK-05's
browser-auth-specific block, reported rather than worked around; this
suite has only ever run for real in CI regardless). Loops 92/93 were
verified by live `execute_sql` queries against the actual deployed
Supabase project, not by trusting existing test code. Loop 94 was
verified by two full `next build` runs (default env and `CI=true`) and,
after the Codex review, by directly grepping the compiled client bundle
output to confirm the environment tag actually constant-folds to the
right literal in both cases — not just re-reading the source and
assuming it works.

One real CI flake this batch, correctly triaged rather than assumed: PR
#91's `tests/emergency-and-notifications.test.ts` failed with a
read-after-write race reading back a case the same test had just
inserted, on the shared live Supabase test project — the same recurring
pattern as PR #89's `CASE_NOT_FOUND` flake. A standing-down comment was
posted naming the failure and why it wasn't this PR's diff (docs-only)
before using the one permitted re-run; it came back green.

## Open items — unchanged from every prior gate this span

- **RISK-32** (CRITICAL, reopen authority) and **RISK-33** (MEDIUM,
  complainant disagreement) remain `OPEN` in `RISK_REGISTER.md`,
  unchanged since Gate 12 — now flagged to the Boss across four
  consecutive gate reports (17, 18, and now this one) with no design
  decision yet on either:
  1. **RISK-32**: what should "reopen authority = Executive + Manager"
     mean as an implementation? Manager-only? A genuine two-actor joint
     action?
  2. **RISK-33**: what should "complainant + Executive jointly decide"
     look like as a real interaction?
- RISK-01 through 06 unchanged — all confirmed Boss/access-blocked this
  batch (Production module not built; LOTO/PTW SOP pending evidence;
  recurrence threshold pending approval; RLS design for 4 tables using
  `using (true)` pending Boss confirmation; anon key/Sentry DSN source
  fallbacks needing Vercel dashboard access this environment doesn't
  have — all §35 PENDING items unchanged).
- Type B items unchanged: shared test/prod Supabase project (mitigated
  by run-tagging), leaked-password protection (Boss: last).

## What the Boss needs to decide before Loop 96

Per §19.9/§19.13: explicit continuation language is required. With
RISK-32/RISK-33 now flagged across four gate reports running and no
other RISK_REGISTER item self-directable, the honest options for Loop 96
are narrowing:

1. **Answer RISK-32/RISK-33** so real progress can resume on the
   highest-severity open items in the repo — this is the strongest
   option and has been the recommendation since Gate 12.
2. **A new direction entirely** — a live bug report (like Loop 86), a
   new feature area, or explicit reprioritization. This report does not
   pre-select a direction if the Boss prefers something else.
3. If neither, the next self-directed batch will need to find a fourth
   angle beyond RPC-coverage, RLS-audit, and Vercel/Sentry-config —
   those three are now each freshly re-verified clean or fixed this
   batch, and repeating any of them again immediately would be
   re-treading ground rather than genuine new verification.
