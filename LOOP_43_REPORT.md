# Loop 43 — the locked lifecycle graph was writable by anyone

Loops 41 and 42 were both test-hygiene. Loop 43 went back to the highest-cost
defect class — authorization — and found the worst defect in this project so far.

**RISK-28, CRITICAL.**

---

## What was wrong

`maintenance.status_transitions` **is** the §4 LOCKED lifecycle graph. Its own
comment, written in migration 0003, says so:

> *Locked lifecycle graph, IMPLEMENTATION_PACK.md §4. Changing this table changes
> business rules — requires a §42 Change Control entry and Boss approval, not a
> routine edit.*

Every transition check in the product validates against it — `transition_case`
(0003, rewritten 0034), restoration/QC (0007), duplicate and false-complaint
(0011), 0012, priority/PTW (0019) — all run:

```sql
select 1 from maintenance.status_transitions
 where from_status = ... and to_status = ...
```

**Migration 0003 created the table and never enabled RLS on it.** Every other
table in the schema has RLS. This one was missed. Supabase grants full DML on a
schema's tables to `anon` and `authenticated` by default, so with RLS off there
was nothing left.

---

## Proven live, not inferred

Run as the `anon` role with **no JWT at all** — i.e. any holder of the public
anon key, signed in or not:

| Attack | Result |
|---|---|
| `insert ('REPORTED','CLOSED')` | **SUCCEEDED** |
| `delete from maintenance.status_transitions` (no WHERE) | **SUCCEEDED — 0 edges left** |

**What the first one means.** That single injected edge lets any case go straight
from `REPORTED` to `CLOSED`: no diagnosis, no repair, no QC clearance, no
restoration verification. The §4 graph, the §6 two-step emergency gate and the
§12 QC boundary are all bypassed at the root — and `transition_case` would have
accepted it as legitimate, writing a clean audit trail for a closure that
skipped every control.

**What the second one means.** With an empty graph, *every* transition in the
product fails. Total denial of service on the case lifecycle, available to an
unauthenticated caller.

Both were reverted immediately. The graph was then verified back to its
canonical 26 edges **set-wise**, not by count:

| Check | Result |
|---|---|
| edges missing vs 0003 | **0** |
| extra edges vs 0003 | **0** |
| live edge count | **26** |

### Controls — the hole was specific, not general

The same anon probe was run against two other tables to be sure this was not a
schema-wide RLS failure:

| Table | anon INSERT |
|---|---|
| `cases` | refused — `new row violates row-level security policy` |
| `audit_log` | refused — `new row violates row-level security policy` |

RLS was working everywhere it was switched on. `status_transitions` was the only
table in the schema where it was never switched on.

---

## How it was found

By sweeping `pg_class.relrowsecurity` and `pg_policy` across **every** table in
the schema, rather than reading policy definitions. Reading policies only tells
you about tables that have them; the defect here was a table with none, and no
RLS to require any.

Two tables came back:

| Table | RLS | Policies | Verdict |
|---|---|---|---|
| `status_transitions` | **disabled** | 0 | **the hole** |
| `idempotency_keys` | enabled | 0 | **fails closed — safe** |

RLS enabled with zero policies denies everything, so `idempotency_keys` was
already correct.

---

## The fix

`0043_maintenance_lifecycle_graph_lockdown.sql`:

- RLS enabled on `status_transitions`.
- A **SELECT-only** policy for `authenticated` — the graph is not a secret and a
  future UI may want to render it.
- Deliberately **no** INSERT/UPDATE/DELETE policy. Changing this table is a §42
  Change Control action performed by a migration, never a runtime write.
- RLS enabled **without FORCE**, matching every other table here
  (`relforcerowsecurity` is false schema-wide), so the SECURITY DEFINER RPCs that
  read the graph as the table owner are unaffected.
- Defence in depth: default write grants revoked from `anon` and `authenticated`;
  SELECT revoked from `anon`.
- `idempotency_keys`' unusable default write grants revoked too, so the schema is
  left with no client role holding a write grant it can never legitimately use.

**Staff cannot write to it either.** Staff authority does not extend to
rewriting the rules staff are judged by.

---

## Verified after the fix

| Check | Result |
|---|---|
| anon INSERT | `permission denied for table status_transitions` |
| anon DELETE-all | `permission denied for table status_transitions` |
| staff-authenticated INSERT | `permission denied for table status_transitions` |
| `authenticated` SELECT | **26 edges** — read still works |

And the part that actually matters — **the lockdown did not break the product.**
End-to-end through the real RPC on a real case:

| Transition | Expected | Result |
|---|---|---|
| `REPORTED → ACKNOWLEDGED` (legal) | succeeds | **succeeded, status now ACKNOWLEDGED** |
| `ACKNOWLEDGED → CLOSED` (illegal) | refused | **`INVALID_TRANSITION`** |

The probe case was removed afterwards via the run-tag cleanup.

---

## Severity, stated plainly

This is the same class as RISK-19 (`cases_insert` validating only
`reporter_user_id`) but **strictly worse in reach**:

| | RISK-19 | RISK-28 |
|---|---|---|
| Needs a session | yes | **no** |
| Blast radius | forged one case | **rewrote the rule every case is judged by** |
| Denial of service | no | **yes — empty the graph** |

---

## Tests

5 regression tests in `tests/lifecycle-graph-lockdown.test.ts`: a non-staff
INSERT is refused, a **staff** INSERT is refused, a staff DELETE is refused and
the edge survives, an illegal transition is still refused end-to-end, and a
**canary** on the canonical edge count — so if anything ever writes to the graph
outside a migration, CI fails.

---

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files) | clean |
| schema-wide RLS sweep after fix | only `idempotency_keys`, which fails closed |

---

## What this says about the earlier loops

Loops 26–39 audited RPC bodies, policy predicates and business rules in
detail — and this defect sat underneath all of them, because **a table with no
policies does not show up when you audit policies.** The lesson is the sweep
itself: enumerate the objects first, then audit the ones that exist. Loops 41
and 42 learned the same thing about cleanup (the case-walker never saw tables
that do not hang off a case); this is that lesson again, in the authorization
layer, where it costs more.
