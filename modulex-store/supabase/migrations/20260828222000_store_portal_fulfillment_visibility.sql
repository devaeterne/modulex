-- P1.5B: read-only customer-scoped shipment and installation visibility.

create or replace function private.get_store_portal_shipments(
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
  v_shipments jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select coalesce(jsonb_agg(row_data order by sort_at desc), '[]'::jsonb)
  into v_shipments
  from (
    select
      jsonb_build_object(
        'id', s.id,
        'shipment_number', s.shipment_number,
        'order_id', s.order_id,
        'order_number', o.order_number,
        'status', s.status,
        'customer_reference', s.customer_reference,
        'carrier', s.carrier,
        'service_level', s.service_level,
        'tracking_number', s.tracking_number,
        'picking_started_at', s.picking_started_at,
        'packed_at', s.packed_at,
        'shipped_at', s.shipped_at,
        'delivered_at', s.delivered_at,
        'cancelled_at', s.cancelled_at
      ) as row_data,
      s.created_at as sort_at
    from public.customer_shipments as s
    join public.customer_orders as o
      on o.id = s.order_id
     and o.customer_id = v_customer_id
    where s.customer_id = v_customer_id
    order by s.created_at desc
    limit v_limit offset v_offset
  ) as scoped;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'shipments', v_shipments,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function private.get_store_portal_shipments(integer, integer) from public;
revoke execute on function private.get_store_portal_shipments(integer, integer) from anon;
grant execute on function private.get_store_portal_shipments(integer, integer) to authenticated;

create or replace function public.get_store_portal_shipments(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_shipments(p_limit, p_offset);
$$;

revoke all on function public.get_store_portal_shipments(integer, integer) from public;
revoke execute on function public.get_store_portal_shipments(integer, integer) from anon;
grant execute on function public.get_store_portal_shipments(integer, integer) to authenticated;

create or replace function private.get_store_portal_shipment(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_shipment jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select jsonb_build_object(
    'id', s.id,
    'shipment_number', s.shipment_number,
    'order_id', s.order_id,
    'order_number', o.order_number,
    'status', s.status,
    'customer_reference', s.customer_reference,
    'shipping_address', s.shipping_address_snapshot,
    'carrier', s.carrier,
    'service_level', s.service_level,
    'tracking_number', s.tracking_number,
    'picking_started_at', s.picking_started_at,
    'packed_at', s.packed_at,
    'shipped_at', s.shipped_at,
    'delivered_at', s.delivered_at,
    'cancelled_at', s.cancelled_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', si.id,
          'line_no', si.line_no,
          'sku_snapshot', si.sku_snapshot,
          'product_name_snapshot', si.product_name_snapshot,
          'ordered_quantity_snapshot', si.ordered_quantity_snapshot,
          'shipment_quantity', si.shipment_quantity
        )
        order by si.line_no, si.created_at
      )
      from public.customer_shipment_items as si
      where si.shipment_id = s.id
    ), '[]'::jsonb)
  )
  into v_shipment
  from public.customer_shipments as s
  join public.customer_orders as o
    on o.id = s.order_id
   and o.customer_id = v_customer_id
  where s.id = p_shipment_id
    and s.customer_id = v_customer_id
  limit 1;

  if v_shipment is null then
    return jsonb_build_object('ok', false, 'reason', 'shipment_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'shipment', v_shipment);
end;
$$;

revoke all on function private.get_store_portal_shipment(uuid) from public;
revoke execute on function private.get_store_portal_shipment(uuid) from anon;
grant execute on function private.get_store_portal_shipment(uuid) to authenticated;

create or replace function public.get_store_portal_shipment(p_shipment_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_shipment(p_shipment_id);
$$;

revoke all on function public.get_store_portal_shipment(uuid) from public;
revoke execute on function public.get_store_portal_shipment(uuid) from anon;
grant execute on function public.get_store_portal_shipment(uuid) to authenticated;

create or replace function private.get_store_portal_installations(
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
  v_installations jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select coalesce(jsonb_agg(row_data order by sort_at desc), '[]'::jsonb)
  into v_installations
  from (
    select
      jsonb_build_object(
        'id', i.id,
        'installation_number', i.installation_number,
        'order_id', i.order_id,
        'order_number', o.order_number,
        'shipment_id', i.shipment_id,
        'shipment_number', s.shipment_number,
        'status', i.status,
        'scheduled_start_at', i.scheduled_start_at,
        'scheduled_end_at', i.scheduled_end_at,
        'team_name', i.team_name,
        'contact_name', i.contact_name,
        'contact_phone', i.contact_phone,
        'confirmed_at', i.confirmed_at,
        'started_at', i.started_at,
        'completed_at', i.completed_at,
        'cancelled_at', i.cancelled_at
      ) as row_data,
      coalesce(i.scheduled_start_at, i.created_at) as sort_at
    from public.customer_installations as i
    join public.customer_orders as o
      on o.id = i.order_id
     and o.customer_id = v_customer_id
    left join public.customer_shipments as s
      on s.id = i.shipment_id
     and s.customer_id = v_customer_id
    where i.customer_id = v_customer_id
    order by coalesce(i.scheduled_start_at, i.created_at) desc
    limit v_limit offset v_offset
  ) as scoped;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'installations', v_installations,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function private.get_store_portal_installations(integer, integer) from public;
revoke execute on function private.get_store_portal_installations(integer, integer) from anon;
grant execute on function private.get_store_portal_installations(integer, integer) to authenticated;

create or replace function public.get_store_portal_installations(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_installations(p_limit, p_offset);
$$;

revoke all on function public.get_store_portal_installations(integer, integer) from public;
revoke execute on function public.get_store_portal_installations(integer, integer) from anon;
grant execute on function public.get_store_portal_installations(integer, integer) to authenticated;

create or replace function private.get_store_portal_installation(p_installation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_installation jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select jsonb_build_object(
    'id', i.id,
    'installation_number', i.installation_number,
    'order_id', i.order_id,
    'order_number', o.order_number,
    'shipment_id', i.shipment_id,
    'shipment_number', s.shipment_number,
    'status', i.status,
    'scheduled_start_at', i.scheduled_start_at,
    'scheduled_end_at', i.scheduled_end_at,
    'address', i.address_snapshot,
    'team_name', i.team_name,
    'contact_name', i.contact_name,
    'contact_phone', i.contact_phone,
    'notes', i.notes,
    'completion_notes', i.completion_notes,
    'confirmed_at', i.confirmed_at,
    'started_at', i.started_at,
    'completed_at', i.completed_at,
    'cancelled_at', i.cancelled_at
  )
  into v_installation
  from public.customer_installations as i
  join public.customer_orders as o
    on o.id = i.order_id
   and o.customer_id = v_customer_id
  left join public.customer_shipments as s
    on s.id = i.shipment_id
   and s.customer_id = v_customer_id
  where i.id = p_installation_id
    and i.customer_id = v_customer_id
  limit 1;

  if v_installation is null then
    return jsonb_build_object('ok', false, 'reason', 'installation_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'installation', v_installation);
end;
$$;

revoke all on function private.get_store_portal_installation(uuid) from public;
revoke execute on function private.get_store_portal_installation(uuid) from anon;
grant execute on function private.get_store_portal_installation(uuid) to authenticated;

create or replace function public.get_store_portal_installation(p_installation_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_installation(p_installation_id);
$$;

revoke all on function public.get_store_portal_installation(uuid) from public;
revoke execute on function public.get_store_portal_installation(uuid) from anon;
grant execute on function public.get_store_portal_installation(uuid) to authenticated;

create or replace function private.get_store_portal_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_orders jsonb;
  v_shipments jsonb;
  v_installations jsonb;
  v_open_orders integer;
  v_active_shipments integer;
  v_active_installations integer;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;
  v_orders := private.get_store_portal_orders(4, 0) -> 'orders';
  v_shipments := private.get_store_portal_shipments(4, 0) -> 'shipments';
  v_installations := private.get_store_portal_installations(4, 0) -> 'installations';

  select count(*)::integer into v_open_orders
  from public.customer_orders
  where customer_id = v_customer_id
    and status not in ('completed', 'cancelled');

  select count(*)::integer into v_active_shipments
  from public.customer_shipments
  where customer_id = v_customer_id
    and status not in ('delivered', 'cancelled');

  select count(*)::integer into v_active_installations
  from public.customer_installations
  where customer_id = v_customer_id
    and status not in ('completed', 'cancelled');

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'orders', jsonb_build_object('recent', coalesce(v_orders, '[]'::jsonb), 'open_count', v_open_orders),
    'shipments', jsonb_build_object('recent', coalesce(v_shipments, '[]'::jsonb), 'active_count', v_active_shipments),
    'installations', jsonb_build_object('recent', coalesce(v_installations, '[]'::jsonb), 'active_count', v_active_installations)
  );
end;
$$;

revoke all on function private.get_store_portal_dashboard_summary() from public;
revoke execute on function private.get_store_portal_dashboard_summary() from anon;
grant execute on function private.get_store_portal_dashboard_summary() to authenticated;

create or replace function public.get_store_portal_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_portal_dashboard_summary();
$$;

revoke all on function public.get_store_portal_dashboard_summary() from public;
revoke execute on function public.get_store_portal_dashboard_summary() from anon;
grant execute on function public.get_store_portal_dashboard_summary() to authenticated;
