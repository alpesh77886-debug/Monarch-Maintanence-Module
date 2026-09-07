-- Loop 41 — two defects in the test-run self-cleanup shipped by Loop 40 (0039).
--
-- F-41-1: the cleanup only ever ran from Vitest. Playwright had no teardown at
--   all, so every CI run left its browser-E2E cases behind permanently. Live
--   evidence at the time of writing: the CI run that merged PR #41 left cases
--   a5e3caf2, 924af305, d18a4351 and a6a2a662 (all '[AUTOTEST-E2E]', created
--   18:13:07-18:13:46 UTC) in the database, because Vitest's teardown had
--   already run at 18:11:58 — before those cases existed. Four cases per run,
--   forever. That is fixed on the application side (playwright.config.ts).
--
-- F-41-2 is the one this migration exists for, and it is worse than F-41-1.
--   `cleanup_test_cases_since(p_since)` selects on nothing but
--       created_at >= p_since AND symptom like '[AUTOTEST%'
--   There is NO notion of which run owns a case. Meanwhile .github/workflows/ci.yml
--   scopes concurrency to `ci-${{ github.ref }}`, so a pull-request run and a
--   main-branch run are in DIFFERENT groups and may overlap. When they do, the
--   run that finishes first deletes the other run's IN-FLIGHT cases, and the
--   still-running suite fails on rows that vanished underneath it.
--
--   That is not a hypothetical ordering argument: merging PR #41 started a
--   main-branch run whose cases were being created at 18:17 UTC, minutes after
--   the PR run's own suite had finished at 18:13. Those two runs were
--   sequential by luck of timing, not by any mechanism.
--
--   So a run may now tag its cases and delete ONLY its own. The tag is opt-in:
--   when p_run_tag is null the function behaves exactly as before (window-only),
--   which is correct for a developer's local run, where no second run exists to
--   race. CI always passes one.
--
-- Least privilege: 0039 left EXECUTE on this function granted to PUBLIC, which
-- means `anon` as well. It was never exploitable — the first statement in the
-- body is an unconditional `is_staff()` refusal and an anonymous caller has no
-- auth.uid() — but an unauthenticated role should not hold EXECUTE on a
-- delete-capable function at all. Revoked below.
--
-- NOTE on the drop: adding a parameter changes the function's arity, and
-- `create or replace` with a different arity creates a SECOND OVERLOAD rather
-- than replacing. That trap has bitten this repo twice (0037's enter_waiting,
-- and earlier). The old single-argument version is therefore dropped
-- explicitly BEFORE the new one is created, and the catalogue is re-checked
-- after applying.

drop function if exists maintenance.cleanup_test_cases_since(timestamptz);

create or replace function maintenance.cleanup_test_cases_since(
  p_since timestamptz,
  p_run_tag text default null
)
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
  v_pattern text;
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

  -- A run tag is matched with LIKE, so it must not be allowed to carry its own
  -- wildcards: a tag of '%' would silently widen the delete back to every
  -- synthetic case in the window, i.e. exactly the bug this parameter exists to
  -- prevent. The tag is a bound parameter (no SQL injection is possible here) —
  -- this guard is about LIKE semantics, not about injection.
  if p_run_tag is not null then
    if p_run_tag !~ '^[A-Za-z0-9._-]{4,64}$' then
      raise exception 'INVALID_RUN_TAG: a run tag must be 4-64 chars of [A-Za-z0-9._-] (got: %)', p_run_tag;
    end if;
    v_pattern := '%[run=' || p_run_tag || ']%';
  end if;

  loop
    select array_agg(c.id) into v_ids from (
      select c.id from maintenance.cases c
      where c.created_at >= p_since
        and c.symptom like '[AUTOTEST%'
        and (v_pattern is null or c.symptom like v_pattern)
        and not exists (select 1 from maintenance.pm_instances p where p.case_id = c.id)
        and not exists (select 1 from maintenance.cases d where d.duplicate_of_case_id = c.id)
        and not exists (select 1 from maintenance.recurrence_flags f
                          where f.case_id <> c.id and c.id = any(f.related_case_ids))
      limit 200
    ) c;
    exit when v_ids is null or array_length(v_ids,1) = 0;

    -- cleanup_synthetic_cases re-checks the '[AUTOTEST' prefix and every other
    -- guard for itself. This function narrows what is offered to it; it never
    -- widens what that function is willing to delete.
    v_res := maintenance.cleanup_synthetic_cases(v_ids);
    v_deleted := v_deleted + (v_res->>'deleted_cases')::int;
    v_rounds := v_rounds + 1;
    exit when v_rounds >= 60;
  end loop;

  return jsonb_build_object(
    'deleted_cases', v_deleted,
    'since', p_since,
    'run_tag', p_run_tag,
    'rounds', v_rounds
  );
end;
$$;

revoke all on function maintenance.cleanup_test_cases_since(timestamptz, text) from public;
revoke all on function maintenance.cleanup_test_cases_since(timestamptz, text) from anon;
grant execute on function maintenance.cleanup_test_cases_since(timestamptz, text) to authenticated;

comment on function maintenance.cleanup_test_cases_since(timestamptz, text) is
  'Test-run self-cleanup. Staff-only, bounded to a <=24h window, and structurally incapable of touching anything but a [AUTOTEST-prefixed case. Pass p_run_tag so a run deletes only cases carrying its own [run=<tag>] marker and cannot delete a concurrently-running suite''s in-flight rows.';
