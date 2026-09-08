# Loop 45 — evidence could be attached to any case by anyone

Last loop of the 41–45 batch. Same method as 43 and 44, one layer further in:
**enumerate the objects, lay them side by side, and look for the odd one out.**

**RISK-30.**

---

## The sweep

Loops 43 and 44 audited tables with *no* policies and functions with *default*
grants. Loop 45 audited the policies that **do** exist, by listing every INSERT
policy's `WITH CHECK` side by side instead of reading them one at a time.

Fourteen tables are `with check (false)` — RPC-only, correct. Six allow a direct
client insert. **The asymmetry was the tell:**

| Table | WITH CHECK |
|---|---|
| `observations` | `is_staff() AND actor_user_id = auth.uid()` |
| `restorations` | `is_staff() AND recorded_by = auth.uid()` |
| `case_assets` | `is_staff() AND linked_by = auth.uid()` |
| `case_assignments` | emergency path + `case_is_confirmed_emergency(case_id)` |
| `cases` | exhaustive column lockdown (the RISK-19 fix) |
| **`evidence`** | **`uploaded_by = auth.uid()`** |

No staff check, and — the part that matters — **no case predicate at all.**

Two other sweeps in the same pass came back clean and are recorded as such:

| Sweep | Result |
|---|---|
| policies still `USING (true)` | only `status_transitions_select`, created deliberately in Loop 43 |
| UPDATE / DELETE policies | both UPDATE policies are `USING (false)`; **zero** DELETE policies |

---

## Proven live

As the seeded technician identity — a real auth user with **no**
`maintenance.staff` row and no assignment to the target case:

| Step | Result |
|---|---|
| cases visible to that identity for MC-009600 | **0** |
| `INSERT INTO evidence` for MC-009600 | **SUCCEEDED** |
| that row visible back to its own writer | **0** |
| that row visible to Maintenance staff | **YES — ordinary attached evidence** |

So an unrelated signed-in user can write into a case's evidence trail **blind**:
they cannot read the case, cannot see the row afterwards, and cannot retract
it — but a Maintenance Executive opening MC-009600 sees it as legitimate
evidence, with the technician named as uploader.

Same class as RISK-22 (fabricating an intervention on any case). The probe row
was deleted immediately.

---

## This is not a reversal of a deliberate decision — it implements it

`evidence-panel.tsx` records the intent explicitly:

> *§5.1 lists evidence as an intake field, so the reporter — not just staff —
> needs to be able to attach it, potentially before any staff RPC has touched
> the case at all.*

**That intent is right and is preserved.** The defect is that the code said
something *wider* than the intent:

| | |
|---|---|
| Intent | the reporter, on **their** case |
| Policy | **anyone**, on **any** case |

Exactly the shape of RISK-22, where migration 0009's comment described an intent
that 0004's code never implemented.

The same comment also claimed the policy was *"already correct"*. It was not.
That line has been corrected rather than left to mislead the next reader.

---

## The fix

`0045_maintenance_evidence_insert_scope.sql` reuses the predicate this schema
already has for exactly this question, rather than inventing a rule:

```sql
with check (
  uploaded_by = auth.uid()
  and maintenance.can_read_case(case_id)
)
```

`can_read_case` = staff **or** that case's reporter **or** an assigned
technician — precisely the three parties the intent names. INSERT scope now
matches SELECT scope (`evidence_select` already uses the same predicate), so the
asymmetry that *was* the defect is gone.

`can_read_case` is evaluated **as the calling user** here — which is exactly why
Loop 44 deliberately kept its `authenticated` EXECUTE grant when it revoked
anon's.

---

## Verified in four directions

| Case | Expected | Result |
|---|---|---|
| non-staff → someone else's case | refused | **`new row violates row-level security policy`** |
| **non-staff reporter → their own case** (§5.1 intake) | **still works** | **succeeded** |
| staff → a case they did not report | still works | **succeeded** |
| impersonation (`uploaded_by` = another user) | refused | **refused** |

The second row is the one that matters most: if it had failed, the fix would
have overreached and broken the intent rather than implementing it.

All probe rows and the probe case removed afterwards (`0` left).

---

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files) | clean |

4 regression tests in `tests/evidence-insert-scope.test.ts`.

---

## The batch's method, stated once

Loops 43, 44 and 45 found three defects the previous seventeen loops did not,
using one idea:

> **Enumerate the objects first. Then audit the ones that exist.**

- Loop 43: a table with **no policies** does not appear when you audit policies.
- Loop 44: a **default privilege** is invisible when you audit objects.
- Loop 45: an odd policy is invisible when you read policies **one at a time**
  instead of side by side.

Loops 26–39 audited RPC bodies and business rules carefully and correctly. They
were reading the things that were there to be read. The gap was never depth — it
was that nothing had listed the whole surface first.
