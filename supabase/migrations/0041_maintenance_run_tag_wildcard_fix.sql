-- Loop 41 — fixes a hole in 0040, found by 0040's OWN red-team test.
--
-- 0040 matched the run tag with
--     symptom LIKE '%[run=' || p_run_tag || ']%'
-- and validated the tag against '^[A-Za-z0-9._-]{4,64}$'.
--
-- That charset ALLOWS the underscore, and in LIKE the underscore is a
-- single-character WILDCARD. So a tag of 'loop41-RUN___' matched
-- '[run=loop41-RUNBBB]' and deleted another run's in-flight case — the exact
-- cross-run deletion the tag parameter was added to prevent. Proven live: two
-- cases tagged loop41-RUNAAA and one tagged loop41-RUNBBB were created; a
-- correctly-tagged cleanup deleted exactly the 2 AAA cases and left BBB alone
-- (the fix working), and then a 'loop41-RUN___' call deleted BBB as well (the
-- hole). The '%' tag was refused by the charset check; the underscore was not,
-- because '_' was on the allow-list.
--
-- Two changes, either of which would close it; both are applied because the
-- point is to remove the whole bug class, not the one character that exposed it:
--
--   1. Matching moves from LIKE to strpos(), a literal substring search. No
--      pattern metacharacter has any meaning there, so no future addition to
--      the allowed charset can reintroduce a wildcard.
--   2. '_' is dropped from the allowed charset anyway, so a tag cannot even
--      look like a pattern. ('.' stays — it is not a LIKE metacharacter and is
--      useful in CI run identifiers.)
--
-- Arity is unchanged from 0040 (timestamptz, text), so `create or replace`
-- genuinely replaces here rather than adding an overload. Re-verified against
-- pg_proc after applying.

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
  v_marker text;
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

  if p_run_tag is not null then
    -- No '_' and no '%': see the header. The strpos() match below makes this
    -- belt-and-braces rather than the sole defence.
    if p_run_tag !~ '^[A-Za-z0-9.-]{4,64}$' then
      raise exception 'INVALID_RUN_TAG: a run tag must be 4-64 chars of [A-Za-z0-9.-] (got: %)', p_run_tag;
    end if;
    v_marker := '[run=' || p_run_tag || ']';
  end if;

  loop
    select array_agg(c.id) into v_ids from (
      select c.id from maintenance.cases c
      where c.created_at >= p_since
        and c.symptom like '[AUTOTEST%'
        -- Literal substring, NOT a pattern match.
        and (v_marker is null or strpos(c.symptom, v_marker) > 0)
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
