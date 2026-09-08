-- Loop 43 — CRITICAL. RISK-28.
--
-- maintenance.status_transitions IS the §4 LOCKED lifecycle graph. Its own
-- comment, written in 0003, says:
--
--     'Locked lifecycle graph, IMPLEMENTATION_PACK.md §4. Changing this table
--      changes business rules - requires a §42 Change Control entry and Boss
--      approval, not a routine edit.'
--
-- Every transition check in the system validates against it:
--     0003 transition_case, 0007 restoration/QC, 0011 duplicate/false-complaint,
--     0012, 0019 priority/PTW, 0034 QC transition fix
-- all run `select 1 from maintenance.status_transitions where from_status = ...
-- and to_status = ...`.
--
-- 0003 created the table and NEVER ENABLED RLS on it. Every other table in the
-- schema has it; this one was missed. Supabase grants full DML on a schema's
-- tables to `anon` and `authenticated` by default, and with RLS off there is
-- nothing left to stop them.
--
-- Proven live, not inferred, as the `anon` role with NO JWT at all - i.e. any
-- holder of the public anon key, signed in or not:
--
--   1. INSERT ('REPORTED','CLOSED')  -> SUCCEEDED.
--      That edge alone lets any case be closed straight from REPORTED: no
--      diagnosis, no repair, no QC clearance, no restoration verification. The
--      entire §4 graph, the §6 emergency gate and the QC boundary are bypassed
--      at the root, and transition_case would have accepted it as legitimate.
--   2. DELETE FROM maintenance.status_transitions (no WHERE) -> SUCCEEDED,
--      leaving 0 edges. With an empty graph every transition in the product
--      fails: a total denial of service on the case lifecycle.
--
-- Both were reverted immediately and the graph verified back to exactly its
-- canonical 26 edges (0 missing, 0 extra, compared set-wise against 0003).
--
-- This is the same class as RISK-19 (cases_insert validating only
-- reporter_user_id) but strictly worse in reach: RISK-19 needed a signed-in
-- user and forged one case, whereas this needs no session at all and rewrites
-- the rule every case is judged by.
--
-- The RPCs are SECURITY DEFINER and run as the table owner, so enabling RLS
-- without FORCE leaves them unaffected - consistent with every other table
-- here (relforcerowsecurity is false schema-wide). Nothing in src/ reads this
-- table from a client; the only reference is a comment.

alter table maintenance.status_transitions enable row level security;

-- Readable by a signed-in user (the graph is not a secret and a future UI may
-- want to render it), writable by nobody. There is deliberately no INSERT,
-- UPDATE or DELETE policy: changing this table is a §42 Change Control action
-- performed by a migration, never by a client.
drop policy if exists status_transitions_select on maintenance.status_transitions;
create policy status_transitions_select on maintenance.status_transitions
  for select to authenticated using (true);

-- Defence in depth: RLS with no write policy already denies writes, but the
-- default schema grants should not be sitting there either.
revoke insert, update, delete, truncate on maintenance.status_transitions from anon;
revoke insert, update, delete, truncate on maintenance.status_transitions from authenticated;
revoke select on maintenance.status_transitions from anon;

-- idempotency_keys was the other table flagged by the same sweep. It already
-- fails closed - RLS enabled with ZERO policies denies everything - and nothing
-- in src/ reads it. The default DML grants are revoked here for the same
-- defence-in-depth reason, so the sweep leaves no table in the schema where a
-- client role holds a write grant it can never legitimately use.
revoke insert, update, delete, truncate on maintenance.idempotency_keys from anon;
revoke insert, update, delete, truncate on maintenance.idempotency_keys from authenticated;
