-- Dealer portal activation is caller-resolved and dealer writes remain narrow.
-- Internal portal lifecycle mutations move to the server-side Admin API in P1.2.

revoke insert, update, delete on table public.customer_portal_users from authenticated;

create or replace function private.activate_store_dealer_portal_user()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  if not exists (
    select 1
    from auth.users as u
    where u.id = v_user_id
      and coalesce(u.raw_app_meta_data ->> 'account_type', '') = 'dealer_portal'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  update public.customer_portal_users as cpu
  set
    status = 'active',
    activated_at = coalesce(cpu.activated_at, now()),
    updated_by = null,
    updated_at = now()
  from public.customers as c
  where cpu.auth_user_id = v_user_id
    and cpu.customer_id = c.id
    and cpu.status = 'invited'
    and c.portal_enabled = true
  returning cpu.customer_id into v_customer_id;

  if v_customer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  )
  values (
    v_customer_id,
    'portal_user_activated',
    'Dealer portal account activated',
    'Dealer completed the invitation password setup flow.',
    jsonb_build_object('auth_user_id', v_user_id),
    null
  );

  return jsonb_build_object('ok', true, 'reason', 'activated');
end;
$$;

revoke all on function private.activate_store_dealer_portal_user() from public;
revoke execute on function private.activate_store_dealer_portal_user() from anon;
grant execute on function private.activate_store_dealer_portal_user() to authenticated;

create or replace function public.activate_store_dealer_portal_user()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.activate_store_dealer_portal_user();
$$;

revoke all on function public.activate_store_dealer_portal_user() from public;
revoke execute on function public.activate_store_dealer_portal_user() from anon;
grant execute on function public.activate_store_dealer_portal_user() to authenticated;
