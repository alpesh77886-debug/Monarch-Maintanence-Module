# Approval Gate Report — Loops 101-105

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is the mandatory hard stop
after the 5th completed loop. Autonomous loop work is PAUSED. Loop 106 will
not start without explicit continuation language from the Boss — silence,
"looks good," or an unrelated reply is not approval.

## What this batch was

Gate 20's report ended with three options for Loop 101, none pre-selected.
The Boss chose option 1 directly: **"Continue loop 101 to 105"**, and in
the same message supplied the exact design decisions RISK-32 and RISK-33
had been waiting on since Gate 12 — the 9th consecutive gate report to
raise them unanswered. This batch is entirely that: implementing both
decisions, server-side first, exactly as specified, with no invention
beyond what the Boss said.

## The two decisions, as given

1. **RISK-32 (reopen authority).** Boss: *"Case reopen — abhi koi bhi akela
   Executive ya Manager band case reopen kar sakta hai - Yaha Sirf
   Maintenance Manager rakho."* Reopen authority = **MAINTENANCE_MANAGER
   only**. Not a joint two-actor step, not Executive-eligible at all — the
   simplest of the three shapes the pack's ambiguous "Executive + Manager"
   phrase could have taken, and the one the Boss picked.
2. **RISK-33 (complainant disagreement).** Boss: *"Complainant disagree
   wala case... Yaha samne se request aayegi user ki ke Kaam nahi huva tab
   Executive usko acknowledge karega ke huva ya nahi huva."* A
   complainant-raises, Executive-acknowledges interaction — the complainant
   files "not fixed," the Executive reviews and records whether it actually
   is or isn't.

## What happened across these 5 loops

| Loop | What | Result |
|---|---|---|
| 101 | RISK-32 fix | `reopen_case`'s guard changed from `is_staff()` to the pre-existing `maintenance.is_manager()` (migration `0050`). UI Reopen button now only renders for a Manager. `lifecycle.test.ts` updated: an Executive is now expected to get `FORBIDDEN`, a Manager then succeeds. `red-team-matrix.test.ts` gained a dedicated case — an Executive cannot reopen even a case they closed themselves. **RISK-32 → RESOLVED** in `RISK_REGISTER.md`. |
| 102 | RISK-33 raise side | New `maintenance.restoration_disputes` table (RPC-only, same pattern as `clearances`) and `raise_restoration_dispute` (migration `0051`) — callable only by the case's own `reporter_user_id`, only against a TECHNICAL restoration already verified PASSED, only while the case is still `TECHNICALLY_RESTORED` (§11's own placement in the pack, between §10 restoration and §12 QC — deliberately not a general post-closure reopen, which is RISK-32's job). Notifies the case's owning Executive. New `tests/restoration-dispute.test.ts`. |
| 103 | RISK-33 acknowledge side + enforcement | `acknowledge_restoration_dispute` (migration `0052`, staff-only) — not-fixed returns the case to DIAGNOSING/IN_REPAIR (reusing `verify_restoration`'s existing failure edges, no new lifecycle edge invented) and notifies the complainant; fixed leaves case status untouched. The actual "no unilateral closure" teeth: `transition_case` itself now refuses `TECHNICALLY_RESTORED -> {CLEARANCE_PENDING, MAINTENANCE_RELEASED}` while any dispute is `PENDING` — blocks both `send_to_qc` and the no-QC-required direct release. **RISK-33 → RESOLVED**. |
| 104 | UI wiring | Reopen button gated to `isManager` (server RPC is still the real enforcement). New `dispute-restoration-form.tsx` ("Machine still not okay," shown to the case's own reporter when eligible) and `acknowledge-dispute-card.tsx` (Confirmed fixed / Confirmed not fixed, shown to staff when a dispute is `PENDING`). Both are convenience gating only. `tsc --noEmit`, `eslint`, and a full `next build` all clean. |
| 105 | Verification + this report | Full test-suite review, CI drive-to-green, gate report. See "What Loop 105 deliberately did not add" below for a scope call made explicit rather than silently skipped. |

## Server-side enforcement, not UI dressing

Every rule change lives in a migration, checked by the RPC itself,
regardless of what the UI shows:

- `reopen_case`: `maintenance.is_manager()` — an Executive gets `FORBIDDEN`
  even on a case they own and closed themselves (pinned by a dedicated
  red-team test, not just the happy path).
- `raise_restoration_dispute`: `v_reporter_user_id <> v_actor` — even the
  case's own owning Executive cannot dispute their own restoration; only
  the actual reporter can.
- `acknowledge_restoration_dispute`: `is_staff()` — the complainant who
  raised the dispute cannot acknowledge their own dispute.
- `transition_case`'s new guard: verified live in `tests/restoration-
  dispute.test.ts` to actually block both `send_to_qc` and the direct
  no-QC-required release while a dispute is `PENDING` — and confirmed the
  blocked `send_to_qc` attempt leaves no orphaned `clearances` row (the
  exact class of bug migration `0024` closed once already for that same
  table).

## What Loop 105 deliberately did not add

The original plan for Loop 105 included new Playwright e2e coverage for
both flows. Writing it turned out to need driving a case through the full
UI lifecycle (Acknowledge → Assessment → Assign → an intervention that
auto-advances DIAGNOSING/IN_REPAIR → Restoration → QC) to even reach a
reopenable `CLOSED` case or a disputable `TECHNICALLY_RESTORED` one — a
multi-step UI walk no existing e2e spec in this repo has ever attempted,
and one this sandbox cannot verify locally (the egress proxy blocks direct
Supabase access, so e2e only ever runs for real in CI). Writing it blind
risked several iterate-push-wait cycles against a real, shared Supabase
project just to debug selectors, for a test whose actual job — per this
suite's own stated purpose (`case-flow.spec.ts`'s header comment) — is to
catch UI-wiring bugs the RPC-level tests cannot see, not to re-prove
authority the RPC tests already prove exhaustively.

Given that trade-off, this batch chose not to force it in. **This is a
real, acknowledged gap**, not a silently dropped task: browser-level UI
confirmation that the Reopen button and the two dispute forms actually
render for the right role in the right state is not yet covered by e2e,
only by the RPC-level Vitest suite plus a manual read of the gating
conditions in `page.tsx`. The RPC-level enforcement itself — which is what
actually matters per CLAUDE.md ("server-side enforced, never UI-only") —
is fully covered.

## Three real defects this batch caught, not just a flake

The second re-run narrowed further: to exactly 1 failure (227/228 passing),
confirming both fixes above actually worked. The remaining one:
`restoration-dispute.test.ts`'s own notification assertion read
`notifications` via `exec.client` while checking for a row addressed to
`tech` — but `notifications_select`'s RLS policy (migration 0008) is
`recipient_user_id = auth.uid()` only, so `exec.client` can never see a
row meant for `tech`, correctly inserted or not. Fixed by reading via
`tech.client` instead, matching the pattern the file's own first test
already used correctly for the reverse case (exec checking its own
notification via `exec.client`).

The same CI run's cleanup step also surfaced a real, non-blocking data
hygiene gap in its warning output: `cleanup_synthetic_cases` deletes
`maintenance.restorations` for a batch of synthetic cases without first
deleting `restoration_disputes` (new this batch, migration 0051, no
CASCADE — this schema has none by design), so any synthetic case with a
dispute failed that batch's cleanup with a live FK violation, silently
leaving rows behind run after run. Fixed in migration `0054` by adding
one line to the same "children first, FK order" delete list.

The first re-run (after the standing-down comment below) came back with a
narrower, deterministic 4-test failure — all four in this batch's own
`restoration-dispute.test.ts`, all `Cannot read properties of null` on the
very first case-insert. Root cause, found by reading `cases_insert`'s
actual RLS policy (migration `0026`) rather than assumed: `reporter_user_id
= auth.uid()` is required **unconditionally**, with no `is_staff()`
escape hatch — so `driveToTechnicallyRestoredAndPassed`'s insert, issued
from `exec.client` with `reporter_user_id: tech.userId`, was refused by
RLS every single time, and the test never checked the insert's `error`,
so it surfaced as a bare null-dereference instead of the real cause. Fixed
by inserting from the reporter's own client (`tech.client`) instead, and
by asserting `error` is null at every insert in this file going forward
so a future RLS refusal fails loudly, not as a `TypeError` three lines
away.

CI on this batch's own PR (#99) failed twice, identically, after Loop 105's
final push — a genuine regression, confirmed deterministic on a re-run
before being treated as anything else. Root cause: migration `0052` (Loop
103) redefined `transition_case` by copying migration **0007**'s body and
adding the new RISK-33 dispute guard on top of it. But `transition_case`
had already been redefined twice more since 0007 — by `0019` (the §14.2
PTW gate) and, most recently, `0034` (the QC-authority identity's narrow
CLEARANCE_PENDING-only transition grant, F-01/F-01b, plus the DUPLICATE
redirect and a refined QC-gate message). Building on the stale 0007 base
silently reverted all three, live, on the actual Maintenance Supabase
project — caught by 13 test failures across 5 files (including this
batch's own new `restoration-dispute.test.ts`), not by review.

Fixed in migration `0053`: `0034`'s full body restored verbatim, with only
the RISK-33 guard layered back on top in the same place. No other behavior
change. This is exactly the "no silent architecture drift" mistake
CLAUDE.md warns about, and it happened despite following the file — the
lesson for future loops touching a function with a long revision history
is to grep for every `create or replace` of that function first, not just
read the migration that originally introduced it.

## Verification posture this batch

- Every loop's `tsc --noEmit` and `eslint` came back clean.
- Loop 104 additionally ran a full `next build` (not just `tsc`), since UI
  wiring is exactly the kind of change a type check alone can miss.
- All four new/changed migrations (`0050`, `0051`, `0052`, `0053`) were
  applied live to the Maintenance Supabase project via the Supabase MCP
  tool, not just written and hoped for.
- CI (GitHub Actions, real network access to the live Supabase project)
  is this batch's actual test-execution evidence, same as every batch
  before it — this sandbox's own egress proxy still blocks direct
  Supabase access.

## Open items

- **RISK-32 and RISK-33 are both RESOLVED.** For the first time since
  Gate 12, this report does not need to re-raise them.
- RISK-01/02/03/04/06 unchanged — all still Boss/access-blocked (§35
  PENDING items, a Vercel-dashboard-access gap this environment doesn't
  have, and the Production module cross-reference correctly deferred
  until that sibling repo has real schema).
- **New, explicitly acknowledged this batch:** e2e (browser-level)
  coverage of the Reopen button and the two dispute forms does not exist
  yet — see "What Loop 105 deliberately did not add" above. Not a risk to
  the authority boundary itself (that's RPC-enforced and RPC-tested), but
  a real residual gap in "UI does not contradict the server rule"
  verification for these two specific flows.

## What the Boss needs to decide before Loop 106

With RISK-32 and RISK-33 both closed, this project has no other named,
locked, unimplemented business rule waiting on a design decision. Honest
options for Loop 106:

1. **Close the e2e gap named above** — write and verify the two new
   browser-level tests properly, budgeting for the iterate-push-wait cycle
   this report flagged rather than rushing it.
2. **A new direction** — a live bug report, a new feature area, explicit
   reprioritization. This report does not pre-select a direction.
3. **If neither:** a future self-directed batch needs a genuinely new
   angle — RPC-coverage, RLS-audit, Vercel/Sentry-config, dependency-
   security, and e2e-reliability were all freshly re-verified across the
   two batches before this one; repeating any of them again immediately
   would be re-treading ground.
