# Case Lifecycle (LOCKED — see IMPLEMENTATION_PACK.md §4)

```text
REPORTED → ACKNOWLEDGED → ASSESSED → ASSIGNED → DIAGNOSING → IN_REPAIR
  → TEMPORARILY_RESTORED (non-closure, loops back to DIAGNOSING/IN_REPAIR)
  → TECHNICALLY_RESTORED
      → (QC required) CLEARANCE_PENDING → QC_REJECTED → DIAGNOSING/IN_REPAIR
      → (QC required) CLEARANCE_PENDING → cleared → MAINTENANCE_RELEASED
      → (QC not required) → MAINTENANCE_RELEASED
  → CLOSED (Maintenance-side conditions clear; PRODUCTION_NOT_RESTARTED recorded if
            shift ended before Production restarted — this does NOT block closure)
  → CLOSED → REOPENED → DIAGNOSING/IN_REPAIR (same-problem recurrence)

Side states: NEEDS_INFORMATION, DUPLICATE (links to primary, primary stays active),
WAITING (dependency overlay, not a lifecycle state — see below).
```

Encoded as the canonical transition table in
`supabase/migrations/0001_maintenance_core_schema.sql` and enforced by the
`maintenance.transition_case` RPC. See `docs/architecture.md` for why this is a
Postgres RPC rather than app-layer logic.

## WAITING is an overlay, not a competing lifecycle (§7)

A case can be `IN WAITING` while its underlying `status` stays whatever it was
(e.g. `IN_REPAIR`). WAITING rows record `reason_type` (`INTERNAL`/`EXTERNAL`,
explicitly selected — never inferred from free text), free-text reason, owner,
entered_at, dependency reference, and resolution info. Case age keeps running during
WAITING; wait duration is tracked separately.

## What is intentionally NOT auto-enforced yet

Per §35 PENDING gates, the following are left as configurable seams, not hard-coded
business truth: LOTO/PTW authority matrix (PENDING-01), recurrence threshold/window
(PENDING-04), and any granular field-level permission beyond the two locked roles
(PENDING-03).
