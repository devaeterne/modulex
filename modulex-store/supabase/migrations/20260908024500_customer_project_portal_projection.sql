-- PB-8: narrow Project projection for authenticated Customer/Dealer portal users.
-- Canonical Project/Order/Shipment/Installation tables remain authoritative.

create or replace function private.get_store_portal_projects(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_projects jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_projects
  from (
    select
      jsonb_build_object(
        'id', cp.id,
        'project_number', cp.project_number,
        'name', cp.name,
        'status', cp.status,
        'project_address', cp.project_address_snapshot,
        'start_date', cp.start_date,
        'target_date', cp.target_date,
        'planned_delivery_date', cp.planned_delivery_date,
        'order_count', (
          select count(*)::integer
          from public.customer_orders o
          where o.project_id = cp.id
            and o.customer_id = v_customer_id
        ),
        'shipment_count', (
          select count(*)::integer
          from public.customer_orders o
          join public.customer_shipments s
            on s.order_id = o.id
           and s.customer_id = v_customer_id
          where o.project_id = cp.id
            and o.customer_id = v_customer_id
        ),
        'installation_count', (
          select count(*)::integer
          from public.customer_orders o
          join public.customer_installations i
            on i.order_id = o.id
           and i.customer_id = v_customer_id
          where o.project_id = cp.id
            and o.customer_id = v_customer_id
        )
      ) as row_data,
      cp.created_at
    from public.customer_projects cp
    where cp.customer_id = v_customer_id
    order by cp.created_at desc
    limit v_limit offset v_offset
  ) scoped;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'projects', v_projects,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function private.get_store_portal_project(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_project jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select jsonb_build_object(
    'id', cp.id,
    'project_number', cp.project_number,
    'name', cp.name,
    'status', cp.status,
    'project_address', cp.project_address_snapshot,
    'start_date', cp.start_date,
    'target_date', cp.target_date,
    'planned_delivery_date', cp.planned_delivery_date,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'status', o.status,
        'order_date', o.order_date,
        'expected_delivery_date', o.expected_delivery_date,
        'customer_reference', o.customer_reference,
        'item_count', o.item_count,
        'fulfillment_type', o.fulfillment_type
      ) order by o.order_date desc, o.created_at desc)
      from public.customer_orders o
      where o.project_id = cp.id
        and o.customer_id = v_customer_id
    ), '[]'::jsonb),
    'shipments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'shipment_number', s.shipment_number,
        'order_id', o.id,
        'order_number', o.order_number,
        'status', s.status,
        'customer_reference', s.customer_reference,
        'carrier', s.carrier,
        'service_level', s.service_level,
        'tracking_number', s.tracking_number,
        'shipped_at', s.shipped_at,
        'delivered_at', s.delivered_at
      ) order by s.created_at desc)
      from public.customer_orders o
      join public.customer_shipments s
        on s.order_id = o.id
       and s.customer_id = v_customer_id
      where o.project_id = cp.id
        and o.customer_id = v_customer_id
    ), '[]'::jsonb),
    'installations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'installation_number', i.installation_number,
        'order_id', o.id,
        'order_number', o.order_number,
        'status', i.status,
        'scheduled_start_at', i.scheduled_start_at,
        'scheduled_end_at', i.scheduled_end_at,
        'completed_at', i.completed_at
      ) order by coalesce(i.scheduled_start_at, i.created_at) desc)
      from public.customer_orders o
      join public.customer_installations i
        on i.order_id = o.id
       and i.customer_id = v_customer_id
      where o.project_id = cp.id
        and o.customer_id = v_customer_id
    ), '[]'::jsonb)
  )
  into v_project
  from public.customer_projects cp
  where cp.id = p_project_id
    and cp.customer_id = v_customer_id
  limit 1;

  if v_project is null then
    return jsonb_build_object('ok', false, 'reason', 'project_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'project', v_project);
end;
$$;

create or replace function public.get_store_portal_projects(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path to ''
as $$
  select private.get_store_portal_projects(p_limit, p_offset);
$$;

create or replace function public.get_store_portal_project(p_project_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $$
  select private.get_store_portal_project(p_project_id);
$$;

-- Match the established Store Portal pattern: authenticated callers may execute
-- the context-scoped read cores used by SECURITY INVOKER public wrappers; anon and
-- service-role direct core execution remain denied.
revoke execute on function private.get_store_portal_projects(integer, integer) from public, anon, authenticated, service_role;
revoke execute on function private.get_store_portal_project(uuid) from public, anon, authenticated, service_role;
grant execute on function private.get_store_portal_projects(integer, integer) to authenticated;
grant execute on function private.get_store_portal_project(uuid) to authenticated;

revoke execute on function public.get_store_portal_projects(integer, integer) from public, anon;
revoke execute on function public.get_store_portal_project(uuid) from public, anon;
grant execute on function public.get_store_portal_projects(integer, integer) to authenticated, service_role;
grant execute on function public.get_store_portal_project(uuid) to authenticated, service_role;
