# Loop 44 — the default that made Loop 43 fatal

Loop 43 fixed **one** table whose RLS was never enabled. Loop 44 asked the
obvious follow-up: *why was that one mistake fatal?*

**RISK-29.**

---

## The root cause

`pg_default_acl` for the `maintenance` schema grants, automatically, to **every
new object**:

| Object type | Granted to `anon` |
|---|---|
| tables (`r`) | `arwdDxtm` — SELECT, **INSERT, UPDATE, DELETE, TRUNCATE** |
| functions (`f`) | `X` — EXECUTE |
| sequences (`S`) | `rwU` |

So every table created in this schema hands an **unauthenticated** caller full
DML the moment it exists, and the only thing standing between that caller and
the data is whether somebody remembered to enable RLS.

For `status_transitions`, nobody did — and the §4 LOCKED lifecycle graph was
writable with no session at all (RISK-28). **The next table added here would
carry the same loaded default.** Patching the three functions below would have
left that intact.

---

## Three live leaks, proven as `anon` with no JWT

| # | Call | Result before the fix |
|---|---|---|
| 1 | `case_notification_recipients(null)` | returned **every active Manager's user id** |
| 2 | `case_is_confirmed_emergency(<real case id>)` | returned **TRUE** |
| 3 | `next_case_number()` | **advanced the sequence** |

**(1)** is SECURITY DEFINER, so it bypasses the `staff` table's RLS. Those ids
are the input to `assign_technician`, `handover_case` and `raise_capa`.

**(2)** is an oracle: an unauthenticated caller can ask whether any given case is
a confirmed emergency. Tested against a *real* emergency case, not just a
non-existent id — a non-existent id returns `false` and would have been a
misleadingly reassuring test.

**(3)** burns MC numbers. Every call permanently advances the series and leaves a
gap in an audit-visible identifier — for a plant maintenance record, a missing
MC number reads like a deleted record. **Two numbers, MC-010550 and MC-010551,
were burned proving this. That gap is real and is recorded here rather than
quietly ignored.**

---

## Two sweeps that found nothing

Reported because "found nothing" is a result.

| Sweep | Result |
|---|---|
| SECURITY DEFINER functions missing a pinned `search_path` | **zero** — every function in the schema pins it |
| SECURITY INVOKER/DEFINER mismatches | none found |

The finding came from the third sweep — *which roles hold EXECUTE* — and then
from asking **why** they held it.

---

## The fix

`0044_maintenance_anon_privilege_lockdown.sql`:

```sql
alter default privileges in schema maintenance revoke all on tables    from anon;
alter default privileges in schema maintenance revoke all on functions from anon;
alter default privileges in schema maintenance revoke all on sequences from anon;

revoke all on all tables    in schema maintenance from anon;
revoke all on all functions in schema maintenance from anon;
revoke all on all sequences in schema maintenance from anon;

revoke usage on schema maintenance from anon;
```

**Fixing the default matters more than fixing the three functions.**

`anon` needing nothing was **verified, not assumed**: every `.from(` / `.rpc(`
call in `src/` lives under `src/app/(app)/` (the authenticated area), the login
page calls only `auth.signInWithPassword`, and the single API route
(`sentry-test`) touches no data.

---

## What was deliberately NOT revoked, and why

`authenticated` keeps everything. Three of these helpers are evaluated **as the
calling user**, so revoking them there would break authorization rather than
tighten it:

| Helper | Evaluated as caller in |
|---|---|
| `can_read_case` | `evidence_select`, `safety_stops_select`, `production_boundary_events_select` (USING) |
| `case_is_confirmed_emergency` | `case_assignments_insert` (WITH CHECK) |
| `next_case_number` | `DEFAULT` on `cases.case_number` |

This was checked against `pg_policy` and the column default **before** the
migration was written, because **this repo has already made that exact mistake
once**: tightening `cases_select` broke `case_assignments_insert`, whose `EXISTS`
was evaluated as the inserting user.

---

## Verified after the fix

| Probe (as `anon`, no JWT) | Result |
|---|---|
| `case_notification_recipients(null)` | `permission denied for schema maintenance` |
| `next_case_number()` | `permission denied for schema maintenance` |
| `case_is_confirmed_emergency(...)` | `permission denied for schema maintenance` |

And the authenticated path, end-to-end:

| Check | Result |
|---|---|
| staff read `cases` | **465 rows** |
| staff read the lifecycle graph | **26 edges** |
| `is_staff()` / `can_read_case()` | **true / true** |
| case INSERT (exercises the `case_number` default) | **succeeded — MC-010665** |
| `acknowledge_case` RPC | **succeeded — REPORTED → ACKNOWLEDGED** |

Probe case removed afterwards via the run-tag cleanup.

---

## A mistake in this loop's own test, caught before pushing

The new test file first built its case symptom by hand as
`` `[AUTOTEST] anon lockdown regression (...)` ``. That string carries **no
`[run=<tag>]` marker**, so the tag-scoped teardown would have left the row behind
permanently — precisely the leak Loop 41 was written to close. Changed to
`testSymptom()`, which applies the marker.

Worth recording: the fix from three loops ago is only as good as every new call
site remembering to use it.

---

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files) | clean |

7 regression tests in `tests/anon-privilege-lockdown.test.ts`, using a genuinely
**signed-out** client holding the anon key — which is what an attacker has, since
that key ships in the browser bundle. Five pin the lockdown; two are regression
guards proving the authenticated path still works.
