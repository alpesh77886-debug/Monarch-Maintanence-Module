# Loop 46 — triggers/constraints enumerate-first sweep

First loop of the Boss-approved "Type A" scope. Same method as Loops 43–45,
applied one layer further: **enumerate every trigger and every CHECK
constraint in the schema, read each one in full, then look for the one that
doesn't match its business rule.**

---

## Triggers — 1 in the whole schema

| Trigger | Table | Fires | Function |
|---|---|---|---|
| `case_assets_mark_known` | `case_assets` | AFTER INSERT | `mark_asset_known()` |

Read in full: `update maintenance.cases set asset_known = true where id = new.case_id`.

**Correctly scoped, no finding.** `case_assets_insert`'s WITH CHECK is
`is_staff() AND linked_by = auth.uid()`, so the trigger's effect only ever
follows an already staff-authorized insert. There is no case-scoping gap to
find — staff can act on any case per the pack's model (0002's own comment:
"All staff can see all open work"), so no additional restriction was missing.

---

## CHECK constraints — 24, read in full

23 of 24 matched their business rule exactly. Two clean sub-checks worth
recording as such:

| Check | Result |
|---|---|
| every `notification_type` literal used at any insert site across all 47 migrations, diffed against `notifications_notification_type_check`'s 12-value list | **zero mismatches** — every value used is allowed, every allowed value is used |
| `waits_internal_reason_check` / `waits_reason_type_check` / `waits_resume_type_check` (the RISK-25 surface) | consistent with the Loop 37/38 fix, no drift |

---

## RISK-31 — the one that didn't match

`spare_requests_initiated_role_check` allowed exactly `'TECHNICIAN'` and
`'EXECUTIVE'`. `raise_spare_request` set the value with:

```sql
v_initiated_role := case when maintenance.is_staff() then 'EXECUTIVE' else 'TECHNICIAN' end;
```

`is_staff()` is true for **both** locked software roles (§3.1:
`MAINTENANCE_EXECUTIVE` and `MAINTENANCE_MANAGER`). So a Manager who raised a
spare request was recorded — and **displayed** — as if an Executive had raised
it.

### Proven live

Signed in as the seeded Manager identity:

| Field | Value |
|---|---|
| `initiated_by` | the Manager's own uuid — **correct** |
| `initiated_role` | `'EXECUTIVE'` — **wrong** |

And it is not just a database curiosity — `spares-panel.tsx` renders
`Requested by {initiated_role.toLowerCase()}`, so this was shown to every user
who opened that case.

### Severity, stated plainly

**Not a security or authorization defect.** Approval routing
(`requires_manager_approval`) is derived from `estimated_amount` against the
§3.3 ₹12,000 boundary — entirely independent of `initiated_role`. This is a
§16.3 / §29 **audit-trail accuracy** defect: the record of who did what said
the wrong thing about a real, otherwise-correct action.

### Why the fix is not "restrict Managers from raising requests"

§16.3 names exactly two initiation paths — Technician (direct) and Executive
(relayed) — and never mentions Manager. It would have been tempting to read
that as "only Executives may call this RPC" and gate it there. That would have
been **inventing an authority restriction the pack never states**: §3.2 gives
Manager override authority over Executive decisions and never says a Manager
cannot do what an Executive can do. So the fix records the role that already
exists rather than restricting who may act — `maintenance.current_staff_role()`
already returned the exact staff role and was available before this fix; it
was simply never used in this one function.

---

## The fix

`0047_maintenance_spare_request_initiated_role_fix.sql`:

- `spare_requests_initiated_role_check` widened to allow `'MANAGER'`.
- `raise_spare_request` recreated to derive the label from
  `current_staff_role()` (`MAINTENANCE_MANAGER` → `'MANAGER'`,
  `MAINTENANCE_EXECUTIVE` → `'EXECUTIVE'`, otherwise `'TECHNICIAN'`) instead of
  the collapsing `is_staff()` check.
- **Same 5-argument signature, both trailing defaults preserved** — this
  needed a second apply after the first attempt hit
  `cannot remove parameter defaults from existing function`, a live reminder
  that `create or replace` checks more than just argument count.
- `SpareRequest.initiated_role` in `database.types.ts` was also missing
  `"MANAGER"` — corrected alongside, since a future exhaustive UI switch on
  this union would otherwise have silently mishandled a value the database can
  now genuinely produce.

---

## Verified in all three directions, plus the boundary

| Caller | `initiated_role` | `initiated_by` |
|---|---|---|
| Executive | `EXECUTIVE` | Executive's uuid |
| **Manager** | **`MANAGER`** — the regression this fixes | Manager's uuid |
| Technician (non-staff) | `TECHNICIAN` | Technician's uuid |

And the §3.3 boundary, re-verified unaffected: a Manager-raised request at
₹15,000 still returns `requires_manager_approval: true`, exactly as an
Executive-raised one would.

All probe cases and spare requests removed via the run-tag cleanup afterward.

---

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files) | clean |
| function arity after fix | unchanged — one overload, 5 args |

4 new tests in `tests/spare-request-initiated-role.test.ts`.

---

## What this loop adds to the method

Loops 43–45 found authorization defects — a table with no policy, a schema
default, an asymmetric WITH CHECK. This one is different in kind: **the
defect was a business-rule constraint that didn't match the role model it was
supposed to enforce.** Same discipline applies regardless of category —
enumerate the objects, read every one in full, and check each against the
locked contract rather than against what the code appears to intend.
