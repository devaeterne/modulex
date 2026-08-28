create unique index if not exists customer_portal_users_auth_user_unique_idx
  on public.customer_portal_users (auth_user_id)
  where auth_user_id is not null;

create or replace function private.current_store_dealer_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cpu.customer_id
  from public.customer_portal_users as cpu
  join public.customers as c
    on c.id = cpu.customer_id
  where cpu.auth_user_id = (select auth.uid())
    and cpu.status = 'active'
    and c.portal_enabled = true
  limit 1;
$$;

revoke all on function private.current_store_dealer_customer_id() from public;
grant execute on function private.current_store_dealer_customer_id() to authenticated;

create or replace function private.get_store_dealer_portal_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_context jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  select jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'portal_user_id', cpu.id,
    'customer_id', c.id,
    'customer_name', c.name,
    'customer_status', c.status,
    'portal_role', cpu.portal_role
  )
  into v_context
  from public.customer_portal_users as cpu
  join public.customers as c
    on c.id = cpu.customer_id
  where cpu.auth_user_id = v_user_id
    and cpu.status = 'active'
    and c.portal_enabled = true
  limit 1;

  return coalesce(
    v_context,
    jsonb_build_object('ok', false, 'reason', 'portal_access_denied')
  );
end;
$$;

revoke all on function private.get_store_dealer_portal_context() from public;
grant execute on function private.get_store_dealer_portal_context() to authenticated;

grant usage on schema private to authenticated;

create or replace function public.get_store_dealer_portal_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_dealer_portal_context();
$$;

revoke all on function public.get_store_dealer_portal_context() from public;
grant execute on function public.get_store_dealer_portal_context() to authenticated;
