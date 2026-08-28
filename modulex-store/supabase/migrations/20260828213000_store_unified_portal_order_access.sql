-- P1.4: unify Dealer/Customer Store portal identity and expose read-only customer-scoped orders.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') in ('dealer_portal', 'customer_portal') then
    return new;
  end if;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    is_active
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'sales',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function private.get_store_portal_context()
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
    'customer_type', ct.system_key,
    'portal_role', cpu.portal_role,
    'portal_kind', case when ct.system_key = 'dealer' then 'dealer' else 'customer' end
  )
  into v_context
  from public.customer_portal_users as cpu
  join public.customers as c on c.id = cpu.customer_id
  join public.customer_types as ct on ct.id = c.customer_type_id and ct.is_active = true
  join auth.users as u on u.id = cpu.auth_user_id
  where cpu.auth_user_id = v_user_id
    and cpu.status = 'active'
    and c.portal_enabled = true
    and c.status = 'active'
    and coalesce(u.raw_app_meta_data ->> 'account_type', '') =
      case when ct.system_key = 'dealer' then 'dealer_portal' else 'customer_portal' end
  limit 1;

  return coalesce(v_context, jsonb_build_object('ok', false, 'reason', 'portal_access_denied'));
end;
$$;

revoke all on function private.get_store_portal_context() from public;
revoke execute on function private.get_store_portal_context() from anon;
grant execute on function private.get_store_portal_context() to authenticated;

create or replace function public.get_store_portal_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_context();
$$;

revoke all on function public.get_store_portal_context() from public;
revoke execute on function public.get_store_portal_context() from anon;
grant execute on function public.get_store_portal_context() to authenticated;

create or replace function private.activate_store_portal_user()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_portal_kind text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  update public.customer_portal_users as cpu
  set
    status = 'active',
    activated_at = coalesce(cpu.activated_at, now()),
    updated_by = null,
    updated_at = now()
  from public.customers as c
  join public.customer_types as ct on ct.id = c.customer_type_id and ct.is_active = true
  join auth.users as u on u.id = v_user_id
  where cpu.auth_user_id = v_user_id
    and cpu.customer_id = c.id
    and cpu.status = 'invited'
    and c.portal_enabled = true
    and c.status = 'active'
    and coalesce(u.raw_app_meta_data ->> 'account_type', '') =
      case when ct.system_key = 'dealer' then 'dealer_portal' else 'customer_portal' end
  returning cpu.customer_id,
    (select case when ct2.system_key = 'dealer' then 'dealer' else 'customer' end
     from public.customers c2
     join public.customer_types ct2 on ct2.id = c2.customer_type_id
     where c2.id = cpu.customer_id)
  into v_customer_id, v_portal_kind;

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
  ) values (
    v_customer_id,
    'portal_user_activated',
    'Store portal account activated',
    'Portal user completed the invitation password setup flow.',
    jsonb_build_object('auth_user_id', v_user_id, 'portal_kind', v_portal_kind),
    null
  );

  return jsonb_build_object('ok', true, 'reason', 'activated', 'portal_kind', v_portal_kind);
end;
$$;

revoke all on function private.activate_store_portal_user() from public;
revoke execute on function private.activate_store_portal_user() from anon;
grant execute on function private.activate_store_portal_user() to authenticated;

create or replace function public.activate_store_portal_user()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.activate_store_portal_user();
$$;

revoke all on function public.activate_store_portal_user() from public;
revoke execute on function public.activate_store_portal_user() from anon;
grant execute on function public.activate_store_portal_user() to authenticated;

create or replace function private.get_store_portal_orders(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_orders jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select coalesce(jsonb_agg(row_data order by order_date desc, created_at desc), '[]'::jsonb)
  into v_orders
  from (
    select jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'order_date', o.order_date,
      'expected_delivery_date', o.expected_delivery_date,
      'customer_reference', o.customer_reference,
      'item_count', o.item_count,
      'fulfillment_type', o.fulfillment_type
    ) as row_data,
    o.order_date,
    o.created_at
    from public.customer_orders as o
    where o.customer_id = v_customer_id
    order by o.order_date desc, o.created_at desc
    limit v_limit offset v_offset
  ) as scoped;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'orders', v_orders,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function private.get_store_portal_orders(integer, integer) from public;
revoke execute on function private.get_store_portal_orders(integer, integer) from anon;
grant execute on function private.get_store_portal_orders(integer, integer) to authenticated;

create or replace function public.get_store_portal_orders(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_orders(p_limit, p_offset);
$$;

revoke all on function public.get_store_portal_orders(integer, integer) from public;
revoke execute on function public.get_store_portal_orders(integer, integer) from anon;
grant execute on function public.get_store_portal_orders(integer, integer) to authenticated;

create or replace function private.get_store_portal_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_order jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'order_date', o.order_date,
    'expected_delivery_date', o.expected_delivery_date,
    'customer_reference', o.customer_reference,
    'item_count', o.item_count,
    'fulfillment_type', o.fulfillment_type,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'line_no', oi.line_no,
        'sku_snapshot', oi.sku_snapshot,
        'product_name_snapshot', oi.product_name_snapshot,
        'quantity', oi.quantity
      ) order by oi.line_no)
      from public.customer_order_items as oi
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_order
  from public.customer_orders as o
  where o.id = p_order_id
    and o.customer_id = v_customer_id;

  if v_order is null then
    return jsonb_build_object('ok', false, 'reason', 'order_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'order', v_order);
end;
$$;

revoke all on function private.get_store_portal_order(uuid) from public;
revoke execute on function private.get_store_portal_order(uuid) from anon;
grant execute on function private.get_store_portal_order(uuid) to authenticated;

create or replace function public.get_store_portal_order(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_order(p_order_id);
$$;

revoke all on function public.get_store_portal_order(uuid) from public;
revoke execute on function public.get_store_portal_order(uuid) from anon;
grant execute on function public.get_store_portal_order(uuid) to authenticated;
