# APPROVAL REPORT — Loops 21-25

**Module:** MONARCH — Maintenance
**Design version:** `IMPLEMENTATION_PACK.md` v0.2 LOCKED
**Batch:** Loops 21, 22, 23, 24, 25
**Date:** 2026-09-07
**Gate:** `IMPLEMENTATION_PACK.md` §19.9 / §19.13 — **autonomous development is
now PAUSED.** Loop 26 does not begin until you explicitly say something
equivalent to *"Approved, continue next 5 loops."*

Previous gate (Loops 16-20) was approved by you choosing *"Abhi approve —
Loop 21-25 shuru karo"* via `AskUserQuestion`, after also scoping Loop 21's
UI request to visual-style-upgrade-only (several unrelated third-party CMMS
screenshots were shown as visual reference; you confirmed you wanted the
visual style, not new modules/nav sections).

---

## A. What this batch actually was

Loops 21-25 split into two different kinds of work:

- **Loop 21** was the one Boss-directed loop: a presentation-only visual
  upgrade to `/dashboard` and `/kpi` (coloured stat cards, a status-breakdown
  bar), explicitly scoped away from new modules/nav before it started.
- **Loops 22-25** returned to the systematic-sweep method from Loops 16-20,
  but widened it each time the previous sweep angle stopped finding anything
  new:
  - Loop 22: dead columns (`information_schema.columns` vs. `grep -rl` on
    `src/`) — the same method as Loops 16-20.
  - Loop 23: dead RPCs (every `create or replace function` vs. `grep -rl` on
    `src/`) — a new angle, since the column sweep was starting to turn up
    false positives faster than real gaps.
  - Loop 24: one pack section (§16.2) read closely against its own schema
    columns.
  - Loop 25: RLS-enabled tables with zero automated test coverage — a third
    angle, and the one that found this batch's most significant defect.

Four of the five loops found and closed a real gap; the fifth (Loop 21) did
exactly the scoped UI work and, along the way, found a real stale-copy
defect in `/kpi` that was already there before Loop 21 started touching it.

---

## B. Loop-by-loop

**Loop 21 — dashboard/KPI visual upgrade.** New `StatCard`/`BarBreakdown`
components (plain server components, no `"use client"`, invents no
thresholds). While rewriting `/kpi`'s summary, found its own comment block
still said "§18 recurrence / §19 CAPA are not implemented yet" — false since
Loop 15. Live query before touching it: 2 recurrence flags, 15 `capa_links`
rows already existed and had been completely invisible on the KPI page the
whole time. Fixed to show real counts, keeping the original page's
real-zero-vs-missing-data-zero discipline.

**Loop 22 — §10 permanent-repair follow-up responsibility.**
`restorations.follow_up_required` (Loop 1) was never set by
`record_restoration`. The rest of §10 was already correctly built (Loop 5's
RISK-12 transition-graph guard, the `FollowUpButton` UI) — the real gap was
narrower: the historical fact that a case ever needed a stop-gap fix became
unrecoverable once it moved past `TEMPORARILY_RESTORED`. Migration 0022,
built from the LIVE `record_restoration` definition per the standing
RISK-14 rule. New restoration-history panel on the case page (nothing showed
`TEMPORARY` restorations before this loop) and a `/kpi` metric.

**Loop 23 — §18 recurrence-rule configuration UI.** `create_recurrence_rule`
and `set_recurrence_rule_active` (Loop 15) were fully correct and fully
unreachable from this app — every "verified live" table in this project's
own CHANGELOG history used direct SQL to call them, then undid it. New
`/recurrence-rules` page, Manager-act / staff-read, matching each RPC's own
guard exactly. Does **not** resolve PENDING-04 — no field defaults a
threshold or window. Found and closed a real automated-test gap along the
way: `set_recurrence_rule_active` had zero coverage before this loop.

**Loop 24 — §16.2 explicit Stores reference identifiers.**
`stores_reference_status`/`stores_reference_id` on `spare_requests` and
`spare_usage` (Loop 1) had no RPC that could ever change them. Two new RPCs,
deliberately unconstrained text (no invented status enum — the column's own
lack of a `check` constraint, unlike almost every other status column in
this schema, reads as Stores' own vocabulary to define once Phase-3
integration exists). `spares-panel.tsx` now shows and lets staff update the
Stores status/reference per row.

**Loop 25 — RISK-17 + 3 RLS test gaps.** Systematic sweep for RLS-enabled
tables with zero test coverage (`observations`, `clearances`, `audit_log`).
Live-verifying `clearances` before writing its test turned up a real defect
(§C below), not just a coverage gap. Fixed via migration, then closed all
three tables' test coverage in one new file.

---

## C. One real defect found and fixed in this batch (RISK-17)

### `clearances_insert` let any staff member bypass the QC status guard (Loop 25, MEDIUM)

`clearances_insert`'s RLS policy (`with check (is_staff() AND
sent_to_qc_by = auth.uid())`) had no check that the target case was actually
`TECHNICALLY_RESTORED`. `send_to_qc` (the intended entry point) does check
that — but nothing stopped a staff member from skipping it and inserting a
`clearances` row directly.

Verified live before assuming this was exploitable, not just untidy: a
direct insert against a case still sitting at `REPORTED` (never even
acknowledged) succeeded, creating a `decision = 'PENDING'` clearance row
with no status check at all. Then verified the actual consequence: the
case's own status stayed `REPORTED` — the orphaned row could not move
anything forward on its own, because `qc_decision(CLEARED)` still calls
`transition_case(..., 'MAINTENANCE_RELEASED')`, and that RPC's own
`status_transitions` graph rejects the edge from anything but
`TECHNICALLY_RESTORED`/`CLEARANCE_PENDING`. **Not a live-exploitable
lifecycle bypass** — but a real server-side-enforcement gap on a locked
boundary (§12 QC gate) all the same, and precisely the same shape of bug
Loop 8 already fixed once in this schema for `spare_requests`/`spare_usage`.

Fixed: `clearances_insert` is now `with check (false)` — RPC-only, matching
every other financially/audit-sensitive table in this schema. Re-verified
live both directions: the direct insert now fails with a `42501` RLS
violation, and `send_to_qc` (SECURITY DEFINER, bypasses RLS by design)
still works end to end. Logged as RISK-17, RESOLVED, in `RISK_REGISTER.md`.

This is the same lesson as RISK-13/RISK-15 in earlier batches, restated:
**an RLS assumption is not verified until it has been checked live against
the real policy**, not read off a migration file from memory. The
`clearances_insert` policy had been sitting in `0002_maintenance_rls.sql`
since Loop 2 — five batches, twenty-four migrations — without anyone
actually attempting the direct insert it silently allowed.

---

## D. Where I deliberately did NOT invent business rules

- **§18 recurrence thresholds (Loop 23).** The new `/recurrence-rules` page
  builds the tool a Manager uses once PENDING-04 is resolved — it does not
  resolve PENDING-04 itself. No field defaults a threshold or window value;
  `approval_note` stays mandatory exactly so the Boss-approved basis is
  recorded, not assumed.
- **§16.2 Stores reference status vocabulary (Loop 24).** The new RPCs
  accept whatever status text a Maintenance staff member is told by Stores,
  rather than an invented enum — the column's own lack of a `check`
  constraint (unlike every other status column in this schema) was read as
  a deliberate signal that the real vocabulary belongs to Stores, not to
  this app, once Phase-3 integration exists.
- **§10 follow-up responsibility (Loop 22).** `follow_up_required` is set
  unconditionally for a `TEMPORARY` restoration — not a judgement call, just
  what the pack states happens every time. No "resolved" flag was added,
  since the schema and the pack define none; inventing one would have been
  adding a business concept the locked design doesn't have.
- **§16.2 evidence_ref (Loop 22, investigated and deliberately left alone).**
  Found the same "zero UI references" pattern on `evidence_ref`, but did
  not build a UI form for it — Loop 18's general evidence-attachment table
  already satisfies "preserve evidence" for restorations, and a second,
  parallel free-text pointer would have been redundant complexity, not a
  fix.

---

## E. Test and verification state

- **115 tests across 17 files**, all green in real GitHub Actions CI.
- Every RPC/RLS/trigger change in this batch verified live against Supabase
  with simulated JWTs before shipping, including — for the first time this
  batch — verifying the *absence* of a guard (Loop 25's `clearances` finding)
  before assuming the RLS policy was already correct.
- This sandbox cannot reach Supabase (RISK-05); `npm test` fails all 115
  identically at the network call here — real signal is CI, every time.
- PR history this batch: #17 (Loop 21, clean), #18 (Loop 22, clean), #19
  (Loops 23+24 combined — see §F), #20 (Loop 25, clean), all merged.

---

## F. One process deviation, disclosed

The same repo-configured git hook that affected the Loops 16-20 batch (PR
#14) did it again here: it required pushing Loop 24's locally committed work
before PR #19 (Loop 23) could be confirmed green, landing both loops on the
same branch/PR. Rather than force-pushing the commit back off, I updated PR
#19's title and body to honestly describe both loops before merging — same
handling as last time. Both loops' content and verification are exactly as
described in §B above regardless of which PR they shipped in.

---

## G. Open risks carried forward

| ID | Severity | State |
|---|---|---|
| RISK-01 | MEDIUM | OPEN — Production module still has no live schema |
| RISK-02 | HIGH (safety-adjacent) | OPEN — PENDING-01 LOTO/PTW SOP; the non-PENDING seam (§14.2) has been built since Loop 16, the authority matrix is not |
| RISK-03 | LOW | OPEN — PENDING-04 recurrence threshold; the mechanism is now fully configurable end-to-end (Loop 23 built the last missing UI piece) and still dormant by construction until a value is supplied |
| RISK-04 | MEDIUM | OPEN — PENDING-03 granular permission matrix |
| RISK-06 | LOW | OPEN — anon key / Sentry DSN as source fallbacks |
| RISK-05, 07-17 (all named-and-fixed this session) | — | RESOLVED |

**No CRITICAL or HIGH defect is currently open.**

---

## H. What I'd want you to know before the next batch

1. **The RLS-coverage sweep (Loop 25's method) found this batch's only real
   defect and should probably join the column/RPC sweeps as a routine
   check**, not a one-time pass. It's cheap to run (one query, one grep) and
   found a gap the other two sweep angles structurally couldn't — dead
   columns and dead RPCs both look "used" once an RPC is wired up; they
   don't tell you whether the RLS *underneath* that RPC is also correct on
   its own.
2. **PENDING-04 now has a complete, working configuration path** — a
   Manager can create and toggle recurrence rules from the app itself, not
   just via direct SQL. The only thing still missing is the number itself.
3. **PENDING-01 (LOTO/PTW SOP) remains the highest-severity open item**,
   unchanged since the last two gate reports.
4. Demo logins in `STATUS.md` still need rotation before any real
   rollout — restating this again since it still hasn't been actioned.
5. Sweep methods tried so far: dead columns (Loops 16-20), dead RPCs (Loop
   23), one pack section read closely (Loop 24), RLS coverage (Loop 25).
   Not yet tried: reading every RLS policy's `qual`/`with_check` expression
   directly against what its own migration's comment claims it does — Loop
   25 only caught `clearances` because I happened to live-verify it while
   writing a test; a systematic version of that check might find more.

---

## I. Confirmation on spending

Restating for the record, unchanged since every prior gate: **nothing paid
has been created or upgraded.** Supabase free tier, Vercel Hobby, Sentry
developer tier, GitHub Actions on a public repo. No payment details entered,
no domain purchased, no plan upgraded. I will not take a billable action
without asking first.

---

## J. Gate

**STOPPED at Loop 25, per `IMPLEMENTATION_PACK.md` §19.9.**

I will not start Loop 26 until you reply with explicit continuation
language. Silence, "looks good," or an unrelated reply is **not** approval.

Candidates for the next batch if approved: a systematic RLS-policy
audit (as noted in §H.5); §17 PM's `pm_plans.asset_ref` cross-referenced
against the recurrence engine's own `ASSET_REF` tier (both exist, never
checked against each other); the Production-module cross-reference columns
once/if that sibling repo ships real schema; and closing out any remaining
"hand-verified only" items from earlier gate reports if a safe automated
test can be found for them.
