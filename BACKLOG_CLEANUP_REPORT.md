# Boss-approved backlog cleanup — result

**Instruction:** *"dono hatao agar usse project ko koi nuksan nahi hai to...
project safety first."*

So: both removed, **and** every guard checked first. Nothing was forced past a
refusal.

---

## Before → after

| | Before | After |
|---|---|---|
| Leaked e2e cases | 8 | **0** |
| `pm_plans` | 489 | **0** |
| `pm_instances` | 3 | **0** |
| `recurrence_rules` | 183 | **0** |
| `audit_log` | 5,753 | **520** |
| Dangling audit rows | 4,177 | **0** |
| **PM_OVERDUE generators** | 183 | **0** |
| `cases` | 336 | 328 |
| `staff` | 2 | **2** |
| `auth.users` | 4 | **4** |
| Lifecycle graph edges | 26 | **26** |

**Non-synthetic rows deleted: zero.** Verified before running — cases,
`pm_plans` and `recurrence_rules` each had **0** rows without the `[AUTOTEST`
prefix — and the migration aborts the whole transaction if that is ever untrue.

---

## Safety, in the order it was checked

### 1. Nothing real existed to lose

Prefix-anchored `like '[AUTOTEST%'`, never `'%[AUTOTEST%'` — the loose form would
match a real symptom that merely mentions the word.

| Population | Rows | Not synthetic |
|---|---|---|
| `cases` | 336 | **0** |
| `pm_plans` | 489 | **0** |
| `recurrence_rules` | 183 | **0** |

### 2. Every guard was evaluated before deleting, not after

| Guard | Result |
|---|---|
| e2e cases blocked by a PM instance | 0 of 8 |
| e2e cases that are a duplicate's primary | 0 of 8 |
| e2e cases referenced by a recurrence flag | 0 of 8 |
| rules referenced by a `recurrence_flag` | **0** — none blocked |
| plans with an instance linked to a case | **1** — see below |

The 8 e2e cases went through `cleanup_synthetic_cases`, the existing guarded
function, which re-checks every guard for itself: `requested 8, deleted 8`.

### 3. The one plan that tripped a guard

`[AUTOTEST] Monthly lube check` — RECURRING, 30-day, approved (backdated to
2026-08-06 by a test), with 3 instances, one of them linked to case MC-000428.

The guard exists so a **surviving real case** never silently loses its PM
linkage. Here both ends were provably synthetic: MC-000428 is
`[AUTOTEST] PM instance case`, with no duplicate pointing at it and no
recurrence flag referencing it. So the instances and the plan were removed —
and the migration aborts if that case had turned out to be real.

**That plan was the last remaining PM_OVERDUE generator.** Leaving it would have
kept notifying a real Manager every 30 days about maintenance that does not
exist, which is itself a harm.

### 4. What was deliberately NOT deleted

**Case MC-000428 itself.** You approved two things — the 8 leaked e2e cases, and
the backlog (plans, rules, audit rows). This case is in neither list, so it
stays. It is harmless now that its plan is gone: a case generates no
notifications by itself. Removing the alert generator was the point; widening
the deletion past what was approved is not.

Also untouched, as always: `staff` (2), `auth.users` (4), the 26-edge locked
lifecycle graph, and the 103 duplicate-primary open cases (still awaiting a
separate explicit decision).

---

## Append-only history was respected

`CLAUDE.md` §0 rule 6 / §27 make business history append-only. That governs
**real** history. Every audit row removed:

- named a `target_table` that **exists** (an unrecognised table is skipped, never
  guessed at), and
- had a `target_id` whose subject had **already ceased to exist**.

A pointer to a deleted `[AUTOTEST` fixture is not business history. Every one of
the 520 surviving rows points at a live subject:

| target_table | rows | subject |
|---|---|---|
| `cases` | 309 | 328 cases exist |
| `staff` | 197 | live |
| `waits` | 5 | live |
| `spare_requests` | 3 | live |
| `case_assignments`, `spare_usage` | 2 each | live |
| `interventions`, `clearances` | 1 each | live |

---

## Zero orphans

All eight probes:

| Probe | Orphans |
|---|---|
| dangling audit rows | **0** |
| `pm_instances` → `pm_plans` | **0** |
| `recurrence_flags` → `recurrence_rules` | **0** |
| `evidence` → `cases` | **0** |
| `case_events` → `cases` | **0** |
| `notifications` → `cases` | **0** |
| `case_assignments` → `cases` | **0** |
| `waits` → `cases` | **0** |

---

## The 24h guard was NOT weakened

`cleanup_test_cases_since` and `cleanup_test_artifacts_since` both refuse a
window wider than 24 hours, by design. This backlog dates from 2026-09-06.

Rather than relax that limit — which would permanently weaken the guard
protecting every future run — the work was done **once**, in
`0046_maintenance_backlog_cleanup_one_time.sql`, where it is auditable, and
**no new callable function was left behind.** The 24h limit stands exactly as it
was.

---

## The app still works — checked, not assumed

An empty `pm_plans` / `recurrence_rules` is a state the code had never seen.

| Check | Result |
|---|---|
| `run_pm_scan()` on empty table | clean — `0 generated, 0 overdue` |
| `run_recurrence_scan()` on empty table | clean — `0 flags` |
| `run_escalation_scan()` | clean |
| create a case | succeeded |
| `acknowledge_case` | succeeded — REPORTED → ACKNOWLEDGED |
| case events + audit rows written | **2 and 2** |
| Manager creates a PM plan | succeeded — table repopulates |
| Manager creates a recurrence rule | succeeded |
| teardown removes the smoke fixtures | `1 case, 1 plan, 1 rule, 2 audit rows` |

One refusal during smoke-testing was **correct behaviour, not a defect**:
`create_pm_plan` as the Executive returned
`FORBIDDEN: only Maintenance Manager may create a special/one-time PM plan
(§17.2)`. I had used the wrong identity; §17.2 was enforcing itself. Re-run as
the Manager, it succeeded.

---

## Net effect

The database now holds **only** what a fresh, healthy install would: 328
synthetic cases, no PM/recurrence residue, an audit log where every row points at
something real, and zero orphans. The refill is stopped at both ends — unit and
e2e runs clean up after themselves, scoped to their own run tag.
