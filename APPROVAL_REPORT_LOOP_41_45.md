# Approval Report — Loops 41–45 (Gate 9)

**Status: AWAITING BOSS.** Autonomous loop work is PAUSED per
`IMPLEMENTATION_PACK.md` §19.9/§19.13. Loop 46 will not start without explicit
continuation language.

---

## The batch in one line

Five loops, **six defects**, of which **two are the most serious found in this
project to date** — and three of the six were in work I had shipped and reported
as done in the previous batch.

| Loop | Finding | Severity | Status |
|---|---|---|---|
| 41 | F-41-1 Playwright had no teardown — 4 leaked cases per CI run | MEDIUM | fixed |
| 41 | F-41-2 a run could delete a concurrent run's in-flight cases | HIGH | fixed |
| 42 | F-42-1 pm_plans / recurrence_rules accumulate forever, with a fuse | MEDIUM | fixed |
| 42 | F-42-2 74% of the audit log dangles; Loop 40's "zero orphans" was wrong | MEDIUM | fixed |
| 43 | **RISK-28 the §4 LOCKED lifecycle graph was writable by anyone** | **CRITICAL** | fixed |
| 44 | **RISK-29 schema defaults grant every new object to `anon`** | **HIGH** | fixed |
| 45 | RISK-30 evidence could be attached to any case by any signed-in user | HIGH | fixed |

---

## The two that matter most

### RISK-28 (Loop 43) — CRITICAL

`maintenance.status_transitions` **is** the §4 LOCKED lifecycle graph. Migration
0003 created it and never enabled RLS. Proven live as the `anon` role with **no
JWT** — any holder of the public anon key, signed in or not:

| Attack | Result |
|---|---|
| `insert ('REPORTED','CLOSED')` | **SUCCEEDED** |
| `delete from status_transitions` (no WHERE) | **SUCCEEDED — 0 edges left** |

The first closes any case straight from REPORTED with no diagnosis, no repair,
no QC clearance — and `transition_case` would have accepted it as legitimate,
writing a **clean audit trail for a closure that skipped every control**. The
second is a total denial of service on the lifecycle.

Both reverted immediately; graph verified back to its canonical 26 edges
**set-wise** (0 missing, 0 extra).

### RISK-29 (Loop 44) — HIGH, and the reason RISK-28 was fatal

`pg_default_acl` grants **every new object** in this schema to `anon`
automatically — tables `arwdDxtm` (full DML), functions EXECUTE, sequences
`rwU`. So RLS was the *only* thing standing between an unauthenticated caller
and every table, and any future table would carry the same loaded default.
Three live leaks came with it: the manager roster, an is-this-an-emergency
oracle, and `next_case_number()` burning MC numbers.

---

## What I got wrong, stated plainly

Three of the six findings were defects in work I had already reported as
complete:

1. **Loop 40 reported the test-data refill as closed. It was not.** The cleanup
   ran only from Vitest, and its mechanism could destroy a concurrently-running
   run's data (F-41-1, F-41-2).
2. **Loop 40's "zero orphans across every dependent table" was wrong** (F-42-2).
   It was true of what it measured — the eleven FK-linked dependents — and false
   of the database: `audit_log` deliberately has no FK, so the one table that
   could dangle was the one table not checked. **4,175 of 5,659 audit rows
   (74%) were dangling.**
3. **Loop 41's own fix was wrong on its first attempt** and was caught by its own
   red-team test: it matched the run tag with `LIKE` and allowed `_` in the
   charset, and `_` is a single-character LIKE wildcard — so `RUN___` matched
   `RUNBBB` and deleted the other run's case. The exact bug the parameter existed
   to prevent.

Two smaller ones, recorded rather than buried:

- Loop 42's audit sweep was written against `audit_log.created_at`, a column that
  does not exist (`occurred_at`). It failed loudly on the first live call, which
  is the right failure mode, but the column should have been read from
  `information_schema` rather than assumed.
- Loop 44's own new test built its case symptom by hand, without the
  `[run=<tag>]` marker — so the teardown would have leaked it permanently,
  precisely the leak Loop 41 closed. Caught before pushing.
- Proving RISK-29's third leak **burned two real case numbers, MC-010550 and
  MC-010551.** That gap is permanent and is recorded rather than quietly ignored.

---

## The method, and why the earlier loops missed these

Loops 26–39 audited RPC bodies, policy predicates and business rules carefully
and correctly. They were reading the things that were there to be read. The gap
was never depth:

> **Enumerate the objects first. Then audit the ones that exist.**

- A table with **no policies** does not appear when you audit policies (43).
- A **default privilege** is invisible when you audit objects (44).
- An odd policy is invisible when you read policies **one at a time** instead of
  side by side (45).

The same idea produced the cleanup findings: the case-walker never saw tables
that do not hang off a case (42).

---

## Checked and found nothing

Recorded because "found nothing" is a result, not a gap to fill with a
manufactured finding.

| Sweep | Result |
|---|---|
| SECURITY DEFINER functions missing a pinned `search_path` | **zero** |
| SECURITY INVOKER/DEFINER mismatches | none |
| business RPCs unreachable from the UI | none (`mark_asset_known` is a trigger function, not an RPC) |
| components never imported | none |
| `run_pm_scan` correctness | no bug — `should_generate_now` is 0; all three cron jobs healthy (394/394, 29/29, 24/24, zero errors) |
| policies still `USING (true)` | one, created deliberately in Loop 43 |
| UPDATE / DELETE policies | both UPDATEs are `USING (false)`; zero DELETE policies |

---

## Verification standard used throughout

Every finding in this batch was **proven live against the database**, not
inferred from reading code — and every fix was re-probed afterwards in both
directions: the attack refused, **and** the legitimate path still working.

That second half caught a real risk twice. Loop 43's lockdown was verified not to
break the SECURITY DEFINER path (`REPORTED → ACKNOWLEDGED` still succeeds,
`ACKNOWLEDGED → CLOSED` still raises `INVALID_TRANSITION`). Loop 45's fix was
verified not to break the §5.1 intake path (a non-staff reporter can still attach
evidence to their own case) — if that had failed, the fix would have overreached
and broken the intent rather than implementing it.

Loop 44 checked `pg_policy` and a column default **before** writing its
migration, because this repo has already made that exact mistake once: tightening
`cases_select` broke `case_assignments_insert`, whose `EXISTS` was evaluated as
the inserting user.

---

## Two questions for you, still unanswered

Both are deletions. I have not acted on either, because a deletion on an
unanswered question is not reversible.

**1. The 8 leaked e2e cases.** Created by CI runs before Loop 41's fix. They are
prefix-proven synthetic. New leaks have stopped — the CI run on PR #43 created
**0** residue against the old code's **+5 plans / +3 rules / +68 audit rows**.
Delete these 8?

**2. The historical backlog.** Also all prefix-proven synthetic:

| | Count |
|---|---|
| `pm_plans` | 484 (484/484 synthetic) |
| `recurrence_rules` | 183 (183/183 synthetic) |
| dangling `audit_log` rows | 4,175 |

The mechanism to remove them is built and proven, and it stops the backlog
growing from the next CI run onward. Clearing what is already there is a bulk
deletion outside any run window. **The 182 RECURRING plans are the time-sensitive
part** — in 2–4 weeks the hourly PM scan starts generating instances for them and
firing `PM_OVERDUE` notifications at a real Manager for maintenance that does not
exist. Delete the backlog?

---

## Still open from earlier gates, unchanged

| # | Item | State |
|---|---|---|
| 1 | QC identities | **ANSWERED** — comes from the Quality module at integration |
| 2 | Separate test and production databases | **STILL OPEN** — mitigated by run tagging, not removed |
| 3 | Leaked-password protection | **DEFERRED BY YOU** to last |
| 4 | RISK-25 INTERNAL wait escalation | **CLOSED** |
| 5 | The 103 open cases a DUPLICATE points at | needs an explicit yes |
| 6 | Sarvam Maintenance Screen Architecture document | never supplied; §4/§5/§27 UX work recorded as NOT TOUCHED |

---

## Ledger

| | |
|---|---|
| Migrations | 0040–0045 |
| New tests | 29 (7 + 6 + 5 + 7 + 4) |
| New risks logged | RISK-28 (CRITICAL), RISK-29 (HIGH), RISK-30 (HIGH) — all RESOLVED |
| PRs | #42, #43, #44, #45 — all merged green |
| `tsc` / `lint` / `build` | clean on every loop |
| `"use client"` boundary re-scan | clean on every loop (36 files) |

---

## What I would do next, if you approve

Continue the enumerate-first method on the surfaces it has not reached yet:
triggers and constraints (a trigger with no counterpart policy is the next
invisible object), then the Vercel/Sentry runtime configuration, which no loop
has swept at all.

**Gate 9 requires explicit continuation language.** Silence, "looks good", or an
unrelated reply is not approval (§19.13).
