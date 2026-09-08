-- PB-8 follow-up: make customer-scoped Project pagination reachable from Portal UI.

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
  v_total_count integer := 0;
  v_projects jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select count(*)::integer
  into v_total_count
  from public.customer_projects cp
  where cp.customer_id = v_customer_id;

  select coalesce(jsonb_agg(row_data order by created_at desc, project_id desc), '[]'::jsonb)
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
      cp.created_at,
      cp.id as project_id
    from public.customer_projects cp
    where cp.customer_id = v_customer_id
    order by cp.created_at desc, cp.id desc
    limit v_limit offset v_offset
  ) scoped;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'projects', v_projects,
    'total_count', v_total_count,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke execute on function private.get_store_portal_projects(integer, integer) from public, anon, authenticated, service_role;
grant execute on function private.get_store_portal_projects(integer, integer) to authenticated;
