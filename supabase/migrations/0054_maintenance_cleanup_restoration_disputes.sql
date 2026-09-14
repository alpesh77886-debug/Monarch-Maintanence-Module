-- MONARCH Maintenance — Loop 105 hotfix: cleanup_synthetic_cases did not
-- know about restoration_disputes (migration 0051, Gate 21 Loop 102).
--
-- Live-caught in CI: cleanup_test_cases_since -> cleanup_synthetic_cases
-- deletes maintenance.restorations for a batch of synthetic cases, but
-- restoration_disputes.restoration_id references restorations with no
-- CASCADE (this schema has zero CASCADEs on purpose, per migration 0036's
-- own header — every dependent row must be removed explicitly, in FK
-- order). A synthetic case with a dispute on its restoration therefore hit
-- "update or delete on table restorations violates foreign key constraint
-- restoration_disputes_restoration_id_fkey" and the whole cleanup call
-- failed for that batch (caught, not fatal — cleanup failures only warn,
-- never fail a green run per tests/cleanup-run.ts, but real test rows were
-- silently piling up).
--
-- Fix: one more line, in the same "children first, FK order" list, deleted
-- by the row's own case_id column (restoration_disputes carries it
-- directly, same as every other case-scoped table here) — placed before
-- the restorations delete it must precede.

create or replace function maintenance.cleanup_synthetic_cases(p_case_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_total int := coalesce(array_length(p_case_ids, 1), 0);
  v_found int;
  v_bad int;
  v_deleted int;
begin
  if v_total = 0 then
    return jsonb_build_object('deleted', 0, 'note', 'empty input');
  end if;

  select count(*) into v_found from maintenance.cases where id = any(p_case_ids);
  if v_found <> v_total then
    raise exception 'CLEANUP_REFUSED: % of % ids do not exist — refusing a partial batch rather than guessing', v_total - v_found, v_total;
  end if;

  select count(*) into v_bad from maintenance.cases
   where id = any(p_case_ids) and symptom not like '[AUTOTEST%';
  if v_bad > 0 then
    raise exception 'CLEANUP_REFUSED: % case(s) are not provably synthetic — a case is deletable only if repository test code is proven to have created it', v_bad;
  end if;

  select count(*) into v_bad from maintenance.pm_instances
   where case_id = any(p_case_ids);
  if v_bad > 0 then
    raise exception 'CLEANUP_REFUSED: % case(s) are referenced by pm_instances — that row is not exclusively theirs', v_bad;
  end if;

  select count(*) into v_bad from maintenance.cases
   where duplicate_of_case_id = any(p_case_ids) and not (id = any(p_case_ids));
  if v_bad > 0 then
    raise exception 'CLEANUP_REFUSED: % case(s) are the primary of a duplicate outside this batch', v_bad;
  end if;

  select count(*) into v_bad from maintenance.recurrence_flags f
   where not (f.case_id = any(p_case_ids))
     and exists (select 1 from unnest(f.related_case_ids) rc where rc = any(p_case_ids));
  if v_bad > 0 then
    raise exception 'CLEANUP_REFUSED: % surviving recurrence flag(s) reference a case in this batch', v_bad;
  end if;

  -- Children first, in FK order. spare_usage before spare_requests and
  -- interventions; production_boundary_events before safety_stops;
  -- capa_links before recurrence_flags; restoration_disputes before
  -- restorations (migration 0054, RISK-33's restoration_disputes has no
  -- CASCADE either, same as everything else in this schema).
  delete from maintenance.notifications              where case_id = any(p_case_ids);
  delete from maintenance.observations               where case_id = any(p_case_ids);
  delete from maintenance.spare_usage                where case_id = any(p_case_ids);
  delete from maintenance.spare_requests             where case_id = any(p_case_ids);
  delete from maintenance.interventions              where case_id = any(p_case_ids);
  delete from maintenance.restoration_disputes       where case_id = any(p_case_ids);
  delete from maintenance.restorations               where case_id = any(p_case_ids);
  delete from maintenance.waits                      where case_id = any(p_case_ids);
  delete from maintenance.clearances                 where case_id = any(p_case_ids);
  delete from maintenance.case_assignments           where case_id = any(p_case_ids);
  delete from maintenance.case_ownership             where case_id = any(p_case_ids);
  delete from maintenance.case_assets                where case_id = any(p_case_ids);
  delete from maintenance.case_impact_records        where case_id = any(p_case_ids);
  delete from maintenance.case_root_causes           where case_id = any(p_case_ids);
  delete from maintenance.evidence                   where case_id = any(p_case_ids);
  delete from maintenance.production_boundary_events where case_id = any(p_case_ids);
  delete from maintenance.safety_stops               where case_id = any(p_case_ids);
  delete from maintenance.capa_links                 where case_id = any(p_case_ids);
  delete from maintenance.recurrence_flags           where case_id = any(p_case_ids);
  delete from maintenance.case_events                where case_id = any(p_case_ids);
  delete from maintenance.idempotency_keys           where case_id = any(p_case_ids);

  delete from maintenance.audit_log
   where target_table = 'maintenance.cases' and target_id = any(p_case_ids);

  delete from maintenance.cases
   where id = any(p_case_ids) and duplicate_of_case_id is not null;
  delete from maintenance.cases where id = any(p_case_ids);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('requested', v_total, 'deleted_cases', v_deleted);
end;
$$;

comment on function maintenance.cleanup_synthetic_cases(uuid[]) is
  'Removes VERIFIED synthetic [AUTOTEST] cases and only their exclusive dependent rows, including restoration_disputes (migration 0054). Refuses, all-or-nothing, any case that is not prefix-proven synthetic, is referenced by a pm_instance, is the primary of a duplicate outside the batch, or is referenced by a surviving recurrence flag. Never callable by a client: EXECUTE is revoked below.';

revoke all on function maintenance.cleanup_synthetic_cases(uuid[]) from public;
revoke all on function maintenance.cleanup_synthetic_cases(uuid[]) from anon;
revoke all on function maintenance.cleanup_synthetic_cases(uuid[]) from authenticated;
