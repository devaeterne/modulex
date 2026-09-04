-- PB-6 system participant roles are structural. Admin may relabel them but cannot deactivate them.

create or replace function public.upsert_customer_project_participant_role(
  p_role_key text,
  p_label text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_key text := lower(btrim(coalesce(p_role_key, '')));
  v_label text := btrim(coalesce(p_label, ''));
  v_existing_system boolean := false;
  v_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'PROJECT_PARTICIPANT_ROLE_MANAGE_FORBIDDEN';
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'PROJECT_PARTICIPANT_ROLE_KEY_INVALID';
  end if;
  if length(v_label) = 0 then
    raise exception 'PROJECT_PARTICIPANT_ROLE_LABEL_REQUIRED';
  end if;

  select r.is_system
  into v_existing_system
  from public.project_participant_roles r
  where r.role_key = v_key;

  if coalesce(v_existing_system, false) and not coalesce(p_is_active, true) then
    raise exception 'PROJECT_PARTICIPANT_SYSTEM_ROLE_REQUIRED';
  end if;

  insert into public.project_participant_roles(role_key, label, is_system, is_active, created_by)
  values (v_key, v_label, false, coalesce(p_is_active, true), auth.uid())
  on conflict (role_key) do update
  set label = excluded.label,
      is_active = case when public.project_participant_roles.is_system then true else excluded.is_active end,
      updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_customer_project_participant_role(text,text,boolean) from public;
grant execute on function public.upsert_customer_project_participant_role(text,text,boolean) to authenticated;
