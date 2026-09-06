# Evidence / Audit Model (IMPLEMENTATION_PACK.md §27)

Every material state or action change creates an immutable row in
`maintenance.case_events` (business-meaning event stream) and/or
`maintenance.audit_log` (technical audit trail: actor, action, before/after, reason,
idempotency key). Both tables are INSERT-only at the RLS policy level — no UPDATE or
DELETE grants for any application role, so a correction is always a new row, never a
mutation of history (§0 rule 6, §27).

Minimum columns tracked on every event: event_id, case_id, event_type, actor_user_id,
occurred_at, previous_state, new_state, reason, evidence/reference,
idempotency_key.

The Observation + Action Continuity Journal (§8) is `maintenance.observations`:
append-only rows per case with observation → action → result → current_condition →
pending_action → blocker → next_step, so a handover receiver can reconstruct full
progress without relying on verbal/WhatsApp history.
