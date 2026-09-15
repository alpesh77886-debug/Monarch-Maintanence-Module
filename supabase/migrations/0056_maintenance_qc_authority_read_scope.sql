-- MONARCH Maintenance — Loop 112: a more severe sibling of Loop 111's
-- restorations_select finding (RISK-35), found by the same method —
-- reading the actual live RLS policies against what the UI/RPC layer
-- already assumes, not just trusting that a shipped feature works.
--
-- F-01 (migration 0031, §1/§43.8) deliberately made the QC-authority
-- identity NOT a maintenance.staff row — QC clearance truth is meant to sit
-- outside Maintenance's ownership. maintenance.is_qc_authority() exists and
-- is correctly checked inside qc_decision's own authority guard. But no
-- read-side policy was ever updated to match: cases_select (migration 0032)
-- only ever granted staff / the case's own reporter / an assigned
-- technician, and clearances_select (migration 0002) was staff-only from
-- this schema's very first RLS pass, before qc_authority existed at all.
--
-- The result: a real QC-authority holder — someone with NO maintenance.staff
-- row by design — gets zero rows back from `cases_select` for the very case
-- they are supposed to clear. The case-detail page's own first query
-- (fetching the case row itself) returns null under RLS, so the QC person
-- cannot even load /cases/[id], let alone reach the "QC cleared / QC
-- rejected" buttons QcPanel renders. The entire §12 QC-decision UI has been
-- unreachable via the browser for the actual QC-authority identity since
-- Loop 31 shipped is_qc_authority() — only reachable by calling qc_decision
-- directly via RPC, exactly how tests/qc-and-restoration.test.ts exercises
-- it, which is why no automated test ever caught this.
--
-- Fixed by extending maintenance.can_read_case() — the schema's one shared
-- case-read-scope predicate (migration 0032's own comment: "Case-scoped
-- tables inherit their authorization from this rather than defining their
-- own") — with a QC-authority branch, SCOPED to cases that actually have a
-- clearance record (not a blanket all-cases grant, which would be broader
-- access than QC authority is meant to carry): a QC-authority holder can
-- read a case only once Maintenance has actually sent it to QC. The same
-- expression is inlined into cases_select (which does not call
-- can_read_case, for the InitPlan-cost reason its own migration 0032
-- comment already explains) so both stay consistent. clearances_select gets
-- the direct is_qc_authority() branch it should have had from the start.
--
-- No new authority invented: this only makes an authority that has existed
-- and been RPC-enforced since Loop 31 actually reachable through the UI it
-- was built for.

create or replace function maintenance.can_read_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = maintenance, public
as $$
  select
    maintenance.is_staff()
    or exists (
      select 1 from maintenance.cases c
      where c.id = p_case_id and c.reporter_user_id = auth.uid()
    )
    or exists (
      select 1 from maintenance.case_assignments a
      where a.case_id = p_case_id and a.technician_user_id = auth.uid()
    )
    or (
      maintenance.is_qc_authority()
      and exists (
        select 1 from maintenance.clearances cl where cl.case_id = p_case_id
      )
    );
$$;

comment on function maintenance.can_read_case(uuid) is
  'F-02 + F-01 read-scope: Maintenance staff (all cases), the case reporter (own case), a technician assigned to that case, or a QC-authority holder for a case actually sent to QC (has a clearances row). Case-scoped tables inherit their authorization from this rather than defining their own.';

drop policy if exists cases_select on maintenance.cases;
create policy cases_select on maintenance.cases
  for select to authenticated
  using (
    (select maintenance.is_staff())
    or reporter_user_id = auth.uid()
    or exists (
      select 1 from maintenance.case_assignments a
      where a.case_id = cases.id and a.technician_user_id = auth.uid()
    )
    or (
      (select maintenance.is_qc_authority())
      and exists (select 1 from maintenance.clearances cl where cl.case_id = cases.id)
    )
  );

drop policy if exists clearances_select on maintenance.clearances;
create policy clearances_select on maintenance.clearances
  for select to authenticated
  using ((select maintenance.is_staff()) or (select maintenance.is_qc_authority()));
