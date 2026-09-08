-- Loop 44 — RISK-29. The default that made RISK-28 possible.
--
-- Loop 43 fixed ONE table whose RLS was never enabled. This migration fixes the
-- reason a mistake like that was fatal in the first place.
--
-- pg_default_acl for this schema grants, automatically and to EVERY new object:
--
--     tables    (r)  anon=arwdDxtm   <- SELECT/INSERT/UPDATE/DELETE/TRUNCATE
--     functions (f)  anon=X          <- EXECUTE
--     sequences (S)  anon=rwU
--
-- So every table created in this schema hands an UNAUTHENTICATED caller full
-- DML the moment it exists, and the only thing standing between that caller and
-- the data is whether somebody remembered to enable RLS. For
-- status_transitions nobody did, and the §4 LOCKED lifecycle graph was writable
-- with no session at all (RISK-28). The next table added here would carry the
-- same loaded default.
--
-- `anon` needs NOTHING in this schema. Verified, not assumed: every `.from(` and
-- `.rpc(` call in src/ lives under src/app/(app)/ (the authenticated area), the
-- login page calls only auth.signInWithPassword, and the single API route
-- (sentry-test) touches no data.
--
-- Three concrete leaks this closes, all found by probing as the `anon` role with
-- no JWT and all caused by the blanket EXECUTE default:
--
--   1. case_notification_recipients(null) returned every active Maintenance
--      Manager's user id. It is SECURITY DEFINER, so it bypasses the staff
--      table's RLS. Those ids are the input to assign_technician, handover_case
--      and raise_capa.
--   2. case_is_confirmed_emergency(<real case id>) returned TRUE — an oracle
--      telling an unauthenticated caller whether a given case is a confirmed
--      emergency.
--   3. next_case_number() advanced the case-number sequence on every call, so an
--      unauthenticated caller could burn MC numbers indefinitely and leave
--      permanent gaps in an audit-visible identifier series. (Two numbers,
--      MC-010550 and MC-010551, were burned proving this; that gap is real and
--      is recorded here rather than quietly ignored.)
--
-- What is deliberately NOT revoked: `authenticated` keeps what it has. Three of
-- these helpers are evaluated as the CALLING user and revoking them there would
-- break authorization rather than tighten it —
--     can_read_case               -> evidence_select, safety_stops_select,
--                                    production_boundary_events_select (USING)
--     case_is_confirmed_emergency -> case_assignments_insert (WITH CHECK)
--     next_case_number            -> DEFAULT on cases.case_number
-- That was checked against pg_policy and the column default BEFORE writing this,
-- because the same mistake has already been made once in this repo: tightening
-- cases_select broke case_assignments_insert, whose EXISTS was evaluated as the
-- inserting user.

-- (1) Stop the bleeding at the source: new objects no longer grant anon anything.
alter default privileges in schema maintenance revoke all on tables from anon;
alter default privileges in schema maintenance revoke all on functions from anon;
alter default privileges in schema maintenance revoke all on sequences from anon;

-- (2) Existing objects.
revoke all on all tables in schema maintenance from anon;
revoke all on all functions in schema maintenance from anon;
revoke all on all sequences in schema maintenance from anon;

-- (3) anon cannot even see into the schema.
revoke usage on schema maintenance from anon;
