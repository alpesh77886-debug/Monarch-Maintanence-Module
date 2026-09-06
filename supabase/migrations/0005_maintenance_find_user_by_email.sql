-- Small helper so staff can resolve a technician's email to a user id when
-- assigning them to a case. Staff-only; returns null rather than leaking
-- whether an email exists to non-staff callers.
create or replace function maintenance.find_user_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = maintenance, public, auth
as $$
declare
  v_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may look up users';
  end if;

  select id into v_id from auth.users where lower(email) = lower(p_email) limit 1;
  return v_id;
end;
$$;
