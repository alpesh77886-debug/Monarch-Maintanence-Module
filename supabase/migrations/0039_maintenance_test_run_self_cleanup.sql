-- ---------------------------------------------------------------------------
-- §21 — successful test runs clean up their own synthetic data.
--
-- The underlying problem, not just the symptom: before this, every CI run
-- added cases and nothing ever removed them, so the database refilled
-- indefinitely. A one-off cleanup would have been undone within a day.
--
-- Design constraint: `cleanup_synthetic_cases` has EXECUTE revoked from every
-- client role on purpose, so a test cannot call it. Rather than weaken that,
-- this wrapper is the ONLY client-reachable entry point, and it is narrow:
--
--   * staff-only
--   * requires an explicit run-start timestamp — it can never mean "clean
--     everything"
--   * refuses a window wider than 24 hours
--   * delegates every actual deletion to cleanup_synthetic_cases, which
--     refuses any case that is not [AUTOTEST-prefixed. So even a staff account
--     that called this maliciously could only ever remove test fixtures; in a
--     production database with no synthetic cases it is inert.
--
-- No duplicate cleanup system (§29): the deletion logic lives in exactly one
-- function and this only chooses which ids to hand it.
-- ---------------------------------------------------------------------------

create or replace function maintenance.cleanup_test_cases_since(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_ids uuid[];
  v_res jsonb;
  v_deleted int := 0;
  v_rounds int := 0;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may clean up a test run';
  end if;
  if p_since is null then
    raise exception 'SINCE_REQUIRED: a run start timestamp is mandatory - this function never cleans "everything"';
  end if;
  if p_since < now() - interval '24 hours' then
    raise exception 'WINDOW_TOO_WIDE: refusing to clean more than the last 24 hours in one call';
  end if;

  loop
    select array_agg(c.id) into v_ids from (
      select c.id from maintenance.cases c
      where c.created_at >= p_since
        and c.symptom like '[AUTOTEST%'
        and not exists (select 1 from maintenance.pm_instances p where p.case_id = c.id)
        and not exists (select 1 from maintenance.cases d where d.duplicate_of_case_id = c.id)
        and not exists (select 1 from maintenance.recurrence_flags f
                          where f.case_id <> c.id and c.id = any(f.related_case_ids))
      limit 200
    ) c;
    exit when v_ids is null or array_length(v_ids,1) = 0;

    v_res := maintenance.cleanup_synthetic_cases(v_ids);
    v_deleted := v_deleted + (v_res->>'deleted_cases')::int;
    v_rounds := v_rounds + 1;
    exit when v_rounds >= 60;
  end loop;

  return jsonb_build_object('deleted_cases', v_deleted, 'since', p_since, 'rounds', v_rounds);
end;
$$;

comment on function maintenance.cleanup_test_cases_since(timestamptz) is
  'Test-run self-cleanup. Staff-only and structurally incapable of touching anything but a [AUTOTEST-prefixed case created inside the given window.';

grant execute on function maintenance.cleanup_test_cases_since(timestamptz) to authenticated;
