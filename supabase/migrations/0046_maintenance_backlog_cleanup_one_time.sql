-- Boss-approved one-time backlog cleanup.
--
-- Instruction: "dono hatao agar usse project ko koi nuksan nahi hai to...
-- project safety first." So this removes ONLY what is provably safe, and any
-- part that trips a guard is left alone and reported rather than forced.
--
-- Why a one-time migration and not the existing functions: cleanup_test_cases_
-- since and cleanup_test_artifacts_since both refuse a window wider than 24
-- hours, by design. This backlog dates from 2026-09-06. Rather than relax that
-- limit — which would permanently weaken the guard that protects every future
-- run — this does the work once, here, where it is auditable, and leaves NO
-- new callable function behind. The 24h limit stays exactly as it is.
--
-- Everything below is prefix-anchored `like '[AUTOTEST%'`, never `'%[AUTOTEST%'`,
-- which would match a real symptom that merely mentions the word.
--
-- Verified immediately before running:
--     cases        336 rows, 0 not synthetic
--     pm_plans     489 rows, 0 not synthetic
--     rules        183 rows, 0 not synthetic
--     staff          2, auth.users 4        <- never touched by any clause here
--
-- The DO block below ABORTS the whole transaction if any non-synthetic row
-- would be affected. Nothing is deleted on a partial success.

do $$
declare
  v_guard int;
  v_plans int; v_rules int; v_instances int; v_audit int := 0;
  v_tbl text; v_n int;
  v_pm_case uuid;
begin
  -- ---------------------------------------------------------------------
  -- GUARD 0. Refuse outright if anything non-synthetic exists in the three
  -- populations this migration touches. If a real business row has appeared
  -- since the counts above, this must not run at all.
  -- ---------------------------------------------------------------------
  select count(*) into v_guard from maintenance.pm_plans where title not like '[AUTOTEST%';
  if v_guard > 0 then
    raise exception 'ABORT: % non-synthetic pm_plans present - refusing to run', v_guard;
  end if;
  select count(*) into v_guard from maintenance.recurrence_rules where tier_name not like '[AUTOTEST%';
  if v_guard > 0 then
    raise exception 'ABORT: % non-synthetic recurrence_rules present - refusing to run', v_guard;
  end if;
  select count(*) into v_guard from maintenance.cases where symptom not like '[AUTOTEST%';
  if v_guard > 0 then
    raise exception 'ABORT: % non-synthetic cases present - refusing to run', v_guard;
  end if;

  -- ---------------------------------------------------------------------
  -- (1) recurrence_rules. A rule referenced by a recurrence_flag is REFUSED:
  --     a flag is a finding about real cases and must never be orphaned.
  -- ---------------------------------------------------------------------
  with doomed as (
    select r.id from maintenance.recurrence_rules r
    where r.tier_name like '[AUTOTEST%'
      and not exists (select 1 from maintenance.recurrence_flags f where f.rule_id = r.id)
  )
  delete from maintenance.recurrence_rules r using doomed d where r.id = d.id;
  get diagnostics v_rules = row_count;

  -- ---------------------------------------------------------------------
  -- (2) The PM chain. 488 of 489 plans have no case-linked instance and go
  --     straight away. The 489th — '[AUTOTEST] Monthly lube check', RECURRING
  --     every 30 days, approved (backdated) 2026-08-06 — is the one the guard
  --     refuses, because one of its instances points at case MC-000428.
  --
  --     That case is itself '[AUTOTEST] PM instance case', provably synthetic,
  --     with no duplicate pointing at it and no recurrence flag referencing it.
  --     Because both ends of the link are synthetic, the instances and the plan
  --     are removed. This matters operationally: that plan is the LAST remaining
  --     PM_OVERDUE generator, and leaving it would keep notifying a real Manager
  --     every 30 days about maintenance that does not exist.
  --
  --     THE CASE ITSELF IS DELIBERATELY LEFT ALONE. The Boss approved two
  --     things: the 8 leaked e2e cases, and this backlog (plans, rules, audit
  --     rows). MC-000428 is in neither list, so it stays — and it is harmless
  --     once its plan is gone, because a case generates no notifications by
  --     itself. Removing the alert generator was the point; widening the
  --     deletion past what was approved is not.
  --
  --     If that case were NOT synthetic, the guard below aborts instead: a
  --     surviving REAL case must never silently lose its PM linkage.
  -- ---------------------------------------------------------------------
  select i.case_id into v_pm_case
  from maintenance.pm_instances i where i.case_id is not null limit 1;

  if v_pm_case is not null then
    perform 1 from maintenance.cases c
     where c.id = v_pm_case and c.symptom like '[AUTOTEST%';
    if not found then
      raise exception 'ABORT: the case-linked PM instance points at a NON-SYNTHETIC case (%) - refusing', v_pm_case;
    end if;
    perform 1 from maintenance.cases d where d.duplicate_of_case_id = v_pm_case;
    if found then
      raise exception 'ABORT: case % is the primary of a duplicate - refusing', v_pm_case;
    end if;
  end if;

  delete from maintenance.pm_instances i
   using maintenance.pm_plans p
   where i.pm_plan_id = p.id and p.title like '[AUTOTEST%';
  get diagnostics v_instances = row_count;

  delete from maintenance.pm_plans p
   where p.title like '[AUTOTEST%'
     and not exists (select 1 from maintenance.pm_instances i where i.pm_plan_id = p.id);
  get diagnostics v_plans = row_count;

  -- ---------------------------------------------------------------------
  -- (3) Audit rows whose subject no longer exists.
  --
  --     §0 rule 6 / §27 make business history append-only. That governs REAL
  --     history. Every row removed here names a target_table that EXISTS and a
  --     target_id whose subject has ALREADY ceased to exist — a pointer to a
  --     deleted '[AUTOTEST' fixture, not business history. Each target_table is
  --     checked against ITSELF by name; an unrecognised table is skipped, never
  --     guessed at. A row whose subject still exists is untouchable here.
  -- ---------------------------------------------------------------------
  for v_tbl in
    select distinct target_table from maintenance.audit_log
    where target_table like 'maintenance.%'
  loop
    if to_regclass(v_tbl) is null then
      continue;
    end if;
    execute format(
      'delete from maintenance.audit_log a
        where a.target_table = $1
          and a.target_id is not null
          and not exists (select 1 from %s t where t.id = a.target_id)', v_tbl
    ) using v_tbl;
    get diagnostics v_n = row_count;
    v_audit := v_audit + v_n;
  end loop;

  raise notice 'backlog cleanup: % rules, % pm_instances, % pm_plans, % dangling audit rows',
    v_rules, v_instances, v_plans, v_audit;
end $$;
