# Loop 42 — the cleanup was scoped to cases, and "zero orphans" was wrong

Loop 41 fixed *where* the cleanup ran (Playwright had none) and *what it was
allowed to touch* (a run could delete another run's rows). Loop 42 asked a
different question: **what does the cleanup never look at?**

Two answers, and the second is a correction to my own Loop 40 report.

---

## F-42-1 — pm_plans and recurrence_rules accumulate forever

`cleanup_synthetic_cases` walks a **case's dependents**. Neither of these hangs
off a case, so it never sees them.

| Table | Rows | Synthetic | Added per CI run | Oldest |
|---|---|---|---|---|
| `pm_plans` | 484 | **484 / 484 (100%)** | ~5 | 2026-09-06 |
| `recurrence_rules` | 183 | **183 / 183 (100%)** | ~3–6 | 2026-09-06 |

### This is not just clutter — it has a fuse

| Fact | Value |
|---|---|
| RECURRING, active, approved synthetic plans | **182** |
| `frequency_days` range | 14–30 |
| Approved on | 2026-09-06 / 07 |
| `run_pm_scan` schedule | hourly (`0 * * * *`) |

`run_pm_scan` generates an instance once `approved_at + frequency_days` passes,
flags it `OVERDUE`, and sends a `PM_OVERDUE` notification to **every active
Manager** via `case_notification_recipients`. So in 2–4 weeks a real manager
starts receiving hundreds of overdue alerts for preventive maintenance that does
not exist — and the count grows by ~5 every CI run until then.

---

## F-42-2 — 74% of the audit log points at rows that no longer exist

`cleanup_synthetic_cases` removes audit rows for
`target_table = 'maintenance.cases'` **and nothing else**. Every child row it
deletes leaves its audit entry behind.

| target_table | audit rows | dangling |
|---|---|---|
| `spare_requests` | 1,139 | **1,134** |
| `waits` | 662 | **657** |
| `safety_stops` | 543 | **543** |
| `case_impact_records` | 402 | **402** |
| `spare_usage` | 349 | **347** |
| `case_root_causes` | 286 | **286** |
| `case_assignments` | 254 | **252** |
| `production_boundary_events` | 172 | **172** |
| `capa_links` | 160 | **160** |
| `interventions` | 157 | **156** |
| `clearances` | 65 | **64** |
| `recurrence_flags` | 2 | **2** |
| `cases` | 323 | 0 ✓ |
| `staff`, `pm_plans`, `pm_instances`, `recurrence_rules` | — | 0 ✓ |

**4,175 of 5,659 audit rows (74%) are dangling.**

### Correction to the Loop 40 report

Loop 40 stated: *"Zero orphans across every dependent table."*

**That was wrong about the database, and right only about what it measured.**
The orphan probe checked the eleven **FK-linked** dependent tables. `audit_log`
deliberately has **no foreign key** to `cases` — that absence is what keeps
history append-only — so it was never in the probe, and the one table that could
dangle was the one table not checked. The claim should have been "zero orphans
among FK-linked dependents; audit_log not checked."

---

## On append-only history

`CLAUDE.md` §0 rule 6 / §27 make business history append-only. That rule governs
**real** history. Every row this function can remove:

- is inside a **≤24h window**, and
- names a `target_table` that **exists**, and
- has a `target_id` whose subject has **already ceased to exist**.

It cannot touch an audit row whose subject survives, and it cannot reach outside
the window. A pointer to a deleted `[AUTOTEST` fixture is not business history.

---

## Live proof — every guard fired

Fixtures created for this, then removed (including deliberately "REAL PLANT"
ones, so no fake real record was left behind):

| Fixture | Expected | Result |
|---|---|---|
| plan `[run=loop42-AAA]` | deleted | **deleted (1)** |
| rule `[run=loop42-AAA]` | deleted | **deleted (1)** |
| plan `[run=loop42-BBB]` (another run, in flight) | survives | **survived** |
| `REAL PLANT PM PLAN - not synthetic` | refused | **survived** |
| `REAL PLANT RECURRENCE TIER - not synthetic` | refused | **survived** |

Audit sweep, three-way:

| Probe row | Expected | Result |
|---|---|---|
| target exists (`LOOP42_PROBE_LIVE`) | survives | **survived** |
| target gone (`LOOP42_PROBE_DANGLING`) | swept | **swept (1)** |
| unknown table (`LOOP42_PROBE_UNKNOWN_TABLE`) | skipped, not guessed | **skipped** |

All fixtures and probe rows verified removed afterwards: `0 / 0 / 0`.

---

## A defect in this loop's own work, caught on the first live call

The audit sweep was written against `audit_log.created_at`. **That column does
not exist** — the table timestamps with `occurred_at`. It failed loudly on the
first live call rather than silently sweeping nothing, which is the right
failure mode, but the column should have been read from `information_schema`
rather than assumed. Fixed and re-verified before anything else was trusted.

---

## Honest limitation, stated rather than implied

Clauses (1)–(3) are **run-tag scoped**. Clause (4) — the audit sweep — **cannot
be**: an audit row carries no run tag, and by the time it is sweepable its
subject is gone. So the audit sweep is **window-scoped only**, and a concurrent
run could sweep another run's dangling audit rows.

That is safe rather than merely tolerated: a row is swept only once its subject
**no longer exists**, so nothing a running test can still observe is removed.
Proven above — the audit row whose subject survived was untouchable.

---

## Two things checked that turned out to be nothing

Reported because "found nothing" is a result, not a gap to fill with a
manufactured finding.

- **Every business RPC is reachable from the UI.** All 48 were grepped against
  `src/`. Only `mark_asset_known` had no call site — and it is not an RPC at
  all, it is a trigger function bound in migration `0021`. No RISK-27-class dead
  feature. Every component under `src/` is imported somewhere; no orphans.
- **`run_pm_scan` has no bug.** 182 eligible plans against only 3 instances
  looked wrong. It is not: `should_generate_now` is **0** — no plan is due yet —
  and the single plan with a deliberately backdated `approved_at` (a test
  forcing generation) already has its instance. All three cron jobs are healthy:
  **394/394**, **29/29**, **24/24** succeeded, zero errors, last run on schedule.
  `cron.job_run_details` was used, not `cron.job`, because a job shows as
  registered even when every run errors.

---

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files, anchored) | clean |
| `cleanup_*` overloads | 1 each — no arity trap |
| `cleanup_synthetic_cases` grants | `postgres, service_role` only |
| `cleanup_test_artifacts_since` grants | `postgres, authenticated, service_role` (no PUBLIC, no anon) |

6 new tests in `tests/artifact-cleanup.test.ts`, pinning the refusal surface.
The destructive behaviours are proven live above rather than in the suite, for
the same reason as Loop 41: a test that leaves a second run's rows behind to
show they survived leaks exactly what the feature exists to stop leaking.

---

## Not done, and why

The **historical backlog** — 484 pm_plans, 183 recurrence_rules, 4,175 dangling
audit rows already in the database — has **not** been deleted. The mechanism is
built and proven, and it will stop the backlog growing from the next CI run
onward, but clearing what is already there is a bulk deletion outside any
window, and the Boss has an open question about the 8 leaked e2e cases that is
still unanswered. Asking twice costs nothing; deleting 4,800 rows on an
unanswered question is not reversible.
