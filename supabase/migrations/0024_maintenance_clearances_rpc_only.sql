-- MONARCH Maintenance — Loop 25: close the direct-insert bypass on
-- `clearances` (§12 QC gate).
--
-- Systematic sweep for RLS-enabled tables with zero automated test
-- coverage (grep of every `enable row level security` against every test
-- file). `clearances` came back untested, and live-verifying its policy
-- before writing a test turned up a real gap, not just a coverage gap:
--
--   clearances_insert: with check (is_staff() AND sent_to_qc_by = auth.uid())
--
-- This allows ANY staff member to insert a `clearances` row directly for
-- ANY case, in ANY status — completely bypassing `send_to_qc`'s own guard
-- (`if v_status <> 'TECHNICALLY_RESTORED' then raise INVALID_OPERATION`).
-- Verified live: a direct insert against a case still sitting at `REPORTED`
-- (never even acknowledged) succeeded and created a `clearances` row with
-- `decision = 'PENDING'`, with no case-status check at all.
--
-- The orphaned row could not actually move the case forward on its own —
-- `qc_decision(CLEARED)` still calls `transition_case(..., 'MAINTENANCE_RELEASED')`,
-- and that RPC's own `status_transitions` graph check would reject the edge
-- from anything other than TECHNICALLY_RESTORED/CLEARANCE_PENDING — so this
-- was not a live-exploitable lifecycle bypass. But it is exactly the class
-- of "server-side enforcement gap on a locked boundary" CLAUDE.md names
-- explicitly, and precisely the same shape of bug Loop 8 already fixed once
-- in this schema for `spare_requests`/`spare_usage` (direct-insert policies
-- that let a client set fields a dedicated RPC was supposed to gate). Same
-- fix here: RPC-only, matching every other financially/audit-sensitive
-- table in this schema.

drop policy if exists clearances_insert on maintenance.clearances;

create policy clearances_insert on maintenance.clearances
  for insert to authenticated
  with check (false); -- send_to_qc is the only way in
