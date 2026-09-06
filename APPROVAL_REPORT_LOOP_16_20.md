# APPROVAL REPORT — Loops 16-20

**Module:** MONARCH — Maintenance
**Design version:** `IMPLEMENTATION_PACK.md` v0.2 LOCKED
**Batch:** Loops 16, 17, 18, 19, 20
**Date:** 2026-09-06
**Gate:** `IMPLEMENTATION_PACK.md` §19.9 / §19.13 — **autonomous development is
now PAUSED.** Loop 21 does not begin until you explicitly say something
equivalent to *"Approved, continue next 5 loops."*

Previous gate (Loops 11-15) was approved by you selecting *"Haan, Loop 16-20
shuru karo"* through a direct confirmation prompt after the gate report was
re-surfaced following a model switch to Sonnet 5.

---

## A. What this batch actually was

Loops 11-15 built whole new subsystems (E2E in CI, handover, production
boundary, KPIs, recurrence/CAPA). This batch was different in kind: every
one of its five loops closed a **narrow, real gap found by auditing the
locked pack section-by-section against the live schema and the actual `src/`
tree**, not by guessing what might be missing. Four of the five gaps were the
same shape — a real database column or table that had existed since **Loop
1**, with correct RLS in some cases, and **zero UI or code reference anywhere
in this repo** until this batch touched it:

| Loop | Gap | Dead since | Pack citation |
|---|---|---|---|
| 16 | Priority never changeable after intake; `ptw_required`/`ptw_proof_ref` never used | Loop 1 | §5.4, §14.2 |
| 17 | Root cause recordable only behind a recurrence flag that (per Loop 15) is currently inert | — | §9 item 6, §9.1 |
| 18 | `maintenance.evidence` never written to | Loop 1 | §5.1, §26 |
| 19 | `cases.major_complex_flag` never set | Loop 1 | §5.1, §24 |
| 20 | `maintenance.case_assets` never written to | Loop 1 | §5.1 |

Four dead columns from the very first migration, found only now. That is the
headline finding of this batch, and it changes how I'd frame the earlier
"V1 must-have" self-assessment: **a table existing in the schema is not
evidence a requirement is met.** The method that found them — reading every
column of every table against `grep -rl` on `src/`, not re-reading my own
prior CHANGELOG entries — is now something I'd recommend running again
before any future claim that §32's acceptance list is satisfied.

---

## B. Loop-by-loop

**Loop 16 — §5.4 priority Manager-override + §14.2 PTW safety gate seam.**
`change_priority`: an Executive may change priority freely until a Manager
sets it, after which only a Manager can move it further — literal reading of
"Manager has final override." PTW seam (`set_ptw_required`/`link_ptw_proof`)
gates `DIAGNOSING -> IN_REPAIR` when required and unproven, while explicitly
leaving PENDING-01's exact authority matrix (issuer/performer/permit
authority) untouched. `transition_case` was touched a third time; per the
standing RISK-14 process rule, the base was pulled from the *live* function
via `pg_get_functiondef` before writing a line, and every pre-existing guard
was re-verified live immediately after applying.

**Loop 17 — §9 item 6 / §9.1 validated root cause.** `record_root_cause`,
staff-only, mandatory validation basis, append-only. The second reporting
view in this schema (`case_current_root_cause`) was built *with*
`security_invoker = true` from its first line — the RISK-15 lesson applied
prospectively rather than needing a second fix.

**Loop 18 — §5.1/§26 evidence attachment.** No migration: the six-loop-old
RLS was already correct. A test-writing mistake was caught before shipping —
RLS-blocked UPDATE/DELETE via PostgREST reports success with zero rows
affected, not an error — and fixed to match an existing correct precedent
elsewhere in this suite before it could have shipped a false-negative test.

**Loop 19 — §5.1/§24 major/complex classification.** UI-only, no
migration/RPC. Deliberately did not add a later change/override flow, since
the pack documents this classification happening at creation and says
nothing about revising it — unlike priority, which §5.4 explicitly gives a
Manager override for.

**Loop 20 — §5.1 asset/machine linkage.** No RPC (same shape as evidence).
One new trigger, confirmed necessary before writing it: `cases` has no
direct UPDATE policy for `authenticated` at all, so a non-`SECURITY DEFINER`
trigger would have failed outright. Closing this gap also repaired a
**second**, previously invisible defect: §18's `ASSET_REF` recurrence tier
(built in Loop 15) could never have produced a match, ever, because no case
had a `case_assets` row to match on — verified live, before and after.

---

## C. Two real defects found and fixed in this batch

### PR #12 (Loop 16) — a genuine Next.js server/client boundary bug (MEDIUM)

`priority-panel.tsx` is a `"use client"` file. I exported a second, plain
helper function from it (`isPriorityLockedByManager`) and called it directly
from the Server Component (`page.tsx`). Next.js treats **every** export of a
`"use client"` file as a client-only reference, not just the default
component — calling the helper server-side threw at render time:

```
Error: Attempted to call isPriorityLockedByManager() from the server but
isPriorityLockedByManager is on the client.
```

**Invisible to `tsc`, `eslint`, and `next build`** — this is a runtime
boundary rule, not a type or syntax error. It only surfaced on an actual
authenticated page render, which is exactly what CI's `e2e` job does and
this sandbox cannot (RISK-05, no live Supabase access). It broke 4 of 8 e2e
tests. Fixed by inlining the one-line check directly in the server
component. After finding it, I re-scanned **every** `"use client"` file in
the app for the same pattern (a second export called from a server
component) — none existed elsewhere — and repeated that scan after every
subsequent loop in this batch, before considering any of their UI work done.

A second, unrelated test-helper bug in the same PR (`seedToStatus` breaking
its walk loop one status short of the target) was found and fixed in the
same cycle.

### A testing-harness lesson (Loop 20, not a product defect)

Verifying the asset-linking guards, a `set_config` role switch placed inside
a caught PL/pgSQL exception block was silently undone by the exception's
implicit savepoint rollback, producing a confusing unrelated-looking RLS
failure on a later statement. Not a bug in the migration — a note now on
record for how this verification pattern needs to be structured (role
switches at the top level, never inside an exception-catching sub-block).

---

## D. Where I deliberately did NOT invent business rules

- **§14.1 PTW authority (Loop 16).** The exact issuer/performer/permit
  authority/authorized-person matrix stays PENDING-01. Only what §14.2
  explicitly locks — Required Y/N, a linked proof, refusing governed work
  without one when required — was built.
- **§9.1 root cause (Loop 17).** `record_root_cause` is human-only by
  construction: staff-gated, mandatory basis, and there is no automated
  caller anywhere in this schema.
- **§5.1 evidence (Loop 18).** `file_ref` is a reference, not an uploaded
  document this app stores — building real file/Storage upload would be
  inventing infrastructure the pack never asked for.
- **§24 major/complex (Loop 19).** No later change/override mechanism was
  added, because the pack documents the classification happening at
  creation and says nothing about revising it afterward — unlike priority.
- **§5.1 asset linkage (Loop 20).** No auto-suggestion, no inference from
  symptom text. An asset is linked only by a deliberate staff action, never
  guessed — exactly what §5.1's "never silently map an unknown asset" means.

---

## E. Test and verification state

- **97 tests across 16 files**, all green in real GitHub Actions CI.
- Every RPC/trigger/RLS change in this batch verified live against Supabase
  with simulated JWTs before shipping — full result tables in
  `CHANGELOG.md` per loop, including the two "found it was broken, fixed it,
  re-verified" sequences above.
- This sandbox cannot reach Supabase (RISK-05); `npm test` here fails all 97
  identically at the network call. Real pass/fail is CI, every time, no
  exceptions taken in this batch.
- PR history this batch: #12 (Loop 16, needed 2 fixes before merging), #13
  (Loop 17, clean), #14 (Loops 18+19 combined — see §F), all merged.

---

## F. One process deviation, disclosed

A repo-configured git hook required pushing a locally committed change
before I could confirm PR #14 (Loop 18) was green. That push landed Loop
19's commit on the same branch as the still-open Loop 18 PR before I could
split them onto separate branches the way Loops 16→17→18 had been kept
strictly one-per-PR. Rather than force-pushing the commit back off (which
would have just re-triggered the same hook requirement), I updated PR #14's
title and body to honestly describe both loops before merging. Both loops'
content and verification are exactly as described in §B above regardless of
which PR they shipped in; the only casualty was the one-PR-per-loop
bookkeeping convention, not correctness.

---

## G. Open risks carried forward

| ID | Severity | State |
|---|---|---|
| RISK-01 | MEDIUM | OPEN — Production module still has no live schema |
| RISK-02 | HIGH (safety-adjacent) | OPEN — PENDING-01 LOTO/PTW SOP; §14.2's non-PENDING seam is now built (Loop 16), the authority matrix is not |
| RISK-03 | LOW | OPEN — PENDING-04 recurrence threshold; mechanism built and dormant since Loop 15, now with a working `ASSET_REF` tier once it's configured |
| RISK-04 | MEDIUM | OPEN — PENDING-03 granular permission matrix |
| RISK-06 | LOW | OPEN — anon key / Sentry DSN as source fallbacks |
| RISK-05, 07-20 (all named-and-fixed this session) | — | RESOLVED |

**No CRITICAL or HIGH defect is currently open.**

---

## H. What I'd want you to know before the next batch

1. **This batch's method — auditing every column against actual usage —
   should probably become routine**, not a one-time sweep. It found four
   six-loop-old dead columns that "V1 must-have" self-assessments had missed
   entirely. I don't know how many more exist without running it again
   across sections I haven't yet re-audited this way (§17 PM, §22 handover,
   §16 spares — I spot-checked these and found them genuinely complete, but
   spot-checking is not the same rigor as the systematic sweep that found
   Loops 18/19/20's gaps).
2. **PENDING-04 still blocks real recurrence value.** The mechanism is more
   complete now (both `LINE`/`AREA` and, as of this loop, `ASSET_REF` all
   genuinely work), but it produces nothing until you supply a threshold and
   window.
3. **PENDING-01 (LOTO/PTW SOP) remains the highest-severity open item.**
   Loop 16 built everything §14.2 explicitly allows without it; the
   authority matrix itself is untouched, as instructed.
4. Demo logins in `STATUS.md` still need rotation before any real rollout —
   restating this from the last gate report since it hasn't been actioned.

---

## I. Confirmation on spending

Restating for the record, unchanged since the last gate: **nothing paid has
been created or upgraded.** Supabase free tier, Vercel Hobby, Sentry
developer tier, GitHub Actions on a public repo. No payment details entered,
no domain purchased, no plan upgraded. I will not take a billable action
without asking first.

---

## J. Gate

**STOPPED at Loop 20, per `IMPLEMENTATION_PACK.md` §19.9.**

I will not start Loop 21 until you reply with explicit continuation
language. Silence, "looks good," or an unrelated reply is **not** approval.

Candidates for the next batch if approved: a repeat systematic column-sweep
over the sections not yet re-audited that way (§17 PM, §22 handover, §16
spares); §20 planned maintenance window / production dependency (currently
untouched); and closing out the "hand-verified only" items from earlier gate
reports (escalation timer durations, PM instance lifecycle) if a safe way to
test them is found.
