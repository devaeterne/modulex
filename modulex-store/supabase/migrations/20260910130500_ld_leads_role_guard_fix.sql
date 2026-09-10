-- LD follow-up hardening: make every Lead RPC fail closed before its local role checks.

begin;

create or replace function private.store_lead_staff_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role::text
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
    and p.role::text in ('super_admin', 'admin', 'sales')
  limit 1;

  if v_role is null then
    raise exception 'Not authorized to access Store leads' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

revoke all on function private.store_lead_staff_role() from public, anon, authenticated;
grant execute on function private.store_lead_staff_role() to service_role;

notify pgrst, 'reload schema';
commit;
