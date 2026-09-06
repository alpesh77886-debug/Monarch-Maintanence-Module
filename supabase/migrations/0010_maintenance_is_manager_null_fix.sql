-- MONARCH Maintenance — fix `is_manager()` NULL-propagation bug found while
-- building Loop 8's approve_spare_request.
--
-- `current_staff_role()` returns NULL for any caller with no maintenance.staff
-- row (any non-staff authenticated user — a reporter, a technician). The old
-- definition `current_staff_role() = 'MAINTENANCE_MANAGER'` then also returns
-- NULL, not false, for such a caller.
--
-- The one existing use of is_manager() before this loop was inside an RLS
-- `with check (...)` clause (0002, pm_plans approval), where Postgres RLS
-- semantics already treat NULL as "row rejected" — same as false, so that
-- call site was never actually exploitable. But `approve_spare_request`
-- (0009) uses the standard `if not maintenance.is_manager() then raise
-- exception` guard pattern used everywhere else in this schema, and
-- PL/pgSQL's IF treats a NULL condition as "skip the branch" — i.e. `if not
-- NULL` does NOT raise. A non-staff authenticated caller (is_manager() =
-- NULL) could therefore fall through the FORBIDDEN check undetected. This is
-- the same class of bug as RISK-11 (QC guard NULL bypass): guard against
-- NULL, not just an explicit false.
--
-- Fixing the function itself (rather than patching every call site) makes
-- every future `if not maintenance.is_manager()` guard safe by construction.

create or replace function maintenance.is_manager()
returns boolean
language sql
stable
as $$
  select coalesce(maintenance.current_staff_role() = 'MAINTENANCE_MANAGER', false);
$$;
