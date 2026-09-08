-- Loop 42 — the test-data cleanup was scoped to CASES ONLY. Two whole
-- categories of synthetic residue were never touched by Loops 40/41.
--
-- F-42-1 — pm_plans and recurrence_rules accumulate forever.
--   Live counts at the time of writing:
--       pm_plans          484 rows, 484 of them '[AUTOTEST'-tagged (100%)
--       recurrence_rules  183 rows, 183 of them '[AUTOTEST'-tagged (100%)
--   ~5 plans and ~3-6 rules are added by every CI run, and nothing removes
--   them. Neither table hangs off a case, so cleanup_synthetic_cases — which
--   walks a case's dependents — never sees them.
--
--   This is not only clutter. 182 of those plans are RECURRING, active,
--   approved, with frequency_days between 14 and 30, approved on 2026-09-06/07.
--   run_pm_scan (hourly) generates an instance once approved_at +
--   frequency_days passes, then flags it OVERDUE and sends a PM_OVERDUE
--   notification to every active Manager. So in 2-4 weeks a real manager starts
--   receiving hundreds of overdue alerts for preventive maintenance that does
--   not exist. Today's silent residue has a known fuse.
--
-- F-42-2 — the cleanup left dangling audit rows, and my Loop 40 report's
--   "zero orphans" claim was wrong.
--   cleanup_synthetic_cases removes audit_log rows for
--   target_table = 'maintenance.cases' and nothing else. Every child row it
--   deletes (spare_requests, waits, safety_stops, interventions, clearances,
--   ...) leaves its audit row behind pointing at an id that no longer exists.
--
--       total audit rows   5,659
--       dangling           4,175  (74%)
--
--   The Loop 40 orphan probe checked the eleven FK-linked dependent tables and
--   reported zero. audit_log deliberately has NO foreign key to cases (that is
--   what keeps history append-only), so it was never in the probe. The claim
--   was true of what it measured and false of the database.
--
-- Honest limitation, stated rather than implied: clauses (1)-(3) are run-tag
-- scoped, but clause (4) CANNOT be. An audit row carries no run tag - only the
-- row it points at ever did, and by the time the row is sweepable that subject
-- is gone. So the audit sweep is window-scoped only, and a concurrent run could
-- sweep another run's dangling audit rows. That is safe rather than merely
-- tolerated: a row is only ever swept once its subject NO LONGER EXISTS, so
-- nothing a running test can still observe is removed. An audit row whose
-- subject survives is untouchable by this function - proven live, see below.

-- On append-only history (CLAUDE.md §0 rule 6 / §27): business history is
-- append-only and is never deleted. That rule is about REAL history. These rows
-- describe synthetic '[AUTOTEST' fixtures whose subjects the cleanup already
-- removed; a pointer to a deleted test fixture is not business history. The
-- function below can only ever remove an audit row whose target has ALREADY
-- ceased to exist, inside a <=24h window, for a specific run tag. It cannot
-- touch an audit row whose subject is still present, and it cannot reach
-- outside the window at all.

create or replace function maintenance.cleanup_test_artifacts_since(
  p_since timestamptz,
  p_run_tag text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_marker text;
  v_rules int := 0;
  v_instances int := 0;
  v_plans int := 0;
  v_audit int := 0;
  v_tbl text;
  v_deleted int;
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

  -- Same charset and same literal (non-pattern) matching as
  -- cleanup_test_cases_since. '_' is excluded because it is a LIKE wildcard and
  -- allowing it once already caused one run to delete another run's rows.
  if p_run_tag is not null then
    if p_run_tag !~ '^[A-Za-z0-9.-]{4,64}$' then
      raise exception 'INVALID_RUN_TAG: a run tag must be 4-64 chars of [A-Za-z0-9.-] (got: %)', p_run_tag;
    end if;
    v_marker := '[run=' || p_run_tag || ']';
  end if;

  -- (1) recurrence_rules. Refused if any recurrence_flag references the rule:
  --     a flag is a finding about real cases and must never be orphaned.
  with doomed as (
    select r.id from maintenance.recurrence_rules r
    where r.created_at >= p_since
      and r.tier_name like '[AUTOTEST%'
      and (v_marker is null or strpos(r.tier_name, v_marker) > 0)
      and not exists (select 1 from maintenance.recurrence_flags f where f.rule_id = r.id)
  )
  delete from maintenance.recurrence_rules r using doomed d where r.id = d.id;
  get diagnostics v_rules = row_count;

  -- (2) pm_instances belonging to a deletable plan. An instance that is linked
  --     to a CASE is left alone, and (3) then refuses its plan too — deleting it
  --     would silently strip a surviving case's PM linkage.
  with doomed_plans as (
    select p.id from maintenance.pm_plans p
    where p.created_at >= p_since
      and p.title like '[AUTOTEST%'
      and (v_marker is null or strpos(p.title, v_marker) > 0)
      and not exists (select 1 from maintenance.pm_instances i
                        where i.pm_plan_id = p.id and i.case_id is not null)
  )
  delete from maintenance.pm_instances i using doomed_plans d where i.pm_plan_id = d.id;
  get diagnostics v_instances = row_count;

  -- (3) the plans themselves, now that nothing points at them.
  with doomed_plans as (
    select p.id from maintenance.pm_plans p
    where p.created_at >= p_since
      and p.title like '[AUTOTEST%'
      and (v_marker is null or strpos(p.title, v_marker) > 0)
      and not exists (select 1 from maintenance.pm_instances i where i.pm_plan_id = p.id)
  )
  delete from maintenance.pm_plans p using doomed_plans d where p.id = d.id;
  get diagnostics v_plans = row_count;

  -- (4) audit rows inside the window whose subject no longer exists.
  --
  --     Each target_table is checked against ITSELF by name rather than against
  --     "any maintenance table", so a row is only ever removed when the exact
  --     table it names no longer holds that id. A target_table this function
  --     does not recognise is skipped, never guessed at.
  --     audit_log timestamps its rows with occurred_at, not created_at. The
  --     first version of this used created_at and failed loudly on the very
  --     first live call - which is the right failure mode, but it should have
  --     been read from information_schema rather than assumed.
  for v_tbl in
    select distinct target_table from maintenance.audit_log
    where occurred_at >= p_since and target_table like 'maintenance.%'
  loop
    if to_regclass(v_tbl) is null then
      continue;
    end if;
    execute format(
      'delete from maintenance.audit_log a
         where a.occurred_at >= $1
           and a.target_table = $2
           and a.target_id is not null
           and not exists (select 1 from %s t where t.id = a.target_id)',
      v_tbl
    ) using p_since, v_tbl;
    get diagnostics v_deleted = row_count;
    v_audit := v_audit + v_deleted;
  end loop;

  return jsonb_build_object(
    'recurrence_rules_deleted', v_rules,
    'pm_instances_deleted', v_instances,
    'pm_plans_deleted', v_plans,
    'dangling_audit_rows_deleted', v_audit,
    'since', p_since,
    'run_tag', p_run_tag
  );
end;
$$;

revoke all on function maintenance.cleanup_test_artifacts_since(timestamptz, text) from public;
revoke all on function maintenance.cleanup_test_artifacts_since(timestamptz, text) from anon;
grant execute on function maintenance.cleanup_test_artifacts_since(timestamptz, text) to authenticated;

comment on function maintenance.cleanup_test_artifacts_since(timestamptz, text) is
  'Removes a test run''s synthetic pm_plans and recurrence_rules (neither hangs off a case, so the case cleanup never reached them) and the audit rows inside the window whose subject no longer exists. Staff-only, <=24h window, run-tag scoped, and structurally unable to touch a row that is not [AUTOTEST-prefixed or an audit row whose subject still exists.';
