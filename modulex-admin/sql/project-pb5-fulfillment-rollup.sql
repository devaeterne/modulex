-- PB-5 — Delivery & Installation Rollup
-- Project-level read projection only. Shipment, Installation, Order and Procurement remain canonical.

create or replace function private.get_customer_project_fulfillment(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','sales']::text[]) then
    raise exception 'You do not have permission to view Project fulfillment data.' using errcode = '42501';
  end if;

  if p_project_id is null
     or not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    raise exception 'Project not found.';
  end if;

  with project_orders as (
    select
      o.id,
      o.order_number,
      o.status,
      o.order_date,
      o.expected_delivery_date,
      o.fulfillment_type,
      o.completed_at,
      (o.status <> 'cancelled') as is_active
    from public.customer_orders o
    where o.project_id = p_project_id
  ),
  shipment_rollup as (
    select
      po.id as order_id,
      count(s.id) filter (where s.status <> 'cancelled')::int as active_count,
      count(s.id) filter (where s.status = 'delivered')::int as delivered_count,
      count(s.id) filter (where s.status in ('picking','packed','shipped'))::int as moving_count,
      max(s.delivered_at) filter (where s.status = 'delivered') as delivered_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'shipment_number', s.shipment_number,
            'status', s.status,
            'shipped_at', s.shipped_at,
            'delivered_at', s.delivered_at,
            'cancelled_at', s.cancelled_at
          ) order by s.created_at, s.id
        ) filter (where s.id is not null),
        '[]'::jsonb
      ) as shipments
    from project_orders po
    left join public.customer_shipments s on s.order_id = po.id
    group by po.id
  ),
  installation_rollup as (
    select
      po.id as order_id,
      count(i.id) filter (where i.status <> 'cancelled')::int as active_count,
      count(i.id) filter (where i.status = 'completed')::int as completed_count,
      count(i.id) filter (where i.status = 'in_progress')::int as in_progress_count,
      min(i.scheduled_start_at) filter (where i.status <> 'cancelled') as next_scheduled_at,
      max(i.completed_at) filter (where i.status = 'completed') as completed_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'installation_number', i.installation_number,
            'status', i.status,
            'scheduled_start_at', i.scheduled_start_at,
            'scheduled_end_at', i.scheduled_end_at,
            'confirmed_at', i.confirmed_at,
            'started_at', i.started_at,
            'completed_at', i.completed_at,
            'cancelled_at', i.cancelled_at
          ) order by i.scheduled_start_at, i.id
        ) filter (where i.id is not null),
        '[]'::jsonb
      ) as installations
    from project_orders po
    left join public.customer_installations i on i.order_id = po.id
    group by po.id
  ),
  procurement_requirement_state as (
    select
      r.order_id,
      r.id,
      r.required_quantity,
      coalesce((
        select sum(c.ordered_quantity)
        from public.customer_project_procurement_commitments c
        where c.requirement_id = r.id
          and c.status <> 'cancelled'
      ), 0::numeric) as ordered_quantity,
      coalesce((
        select sum(de.quantity_delta)
        from public.customer_project_procurement_delivery_events de
        join public.customer_project_procurement_commitments c on c.id = de.commitment_id
        where c.requirement_id = r.id
          and c.status <> 'cancelled'
      ), 0::numeric) as delivered_quantity
    from public.customer_project_procurement_requirements r
    join project_orders po on po.id = r.order_id and po.is_active
    where r.project_id = p_project_id
      and r.is_current
  ),
  procurement_blocker_rows as (
    select
      prs.order_id,
      prs.id,
      case
        when prs.required_quantity is null then 'quantity_required'
        when prs.ordered_quantity <= 0 then 'not_ordered'
        when prs.ordered_quantity < prs.required_quantity then 'partially_ordered'
        when prs.delivered_quantity <= 0 then 'not_delivered'
        when prs.delivered_quantity < prs.required_quantity then 'partially_delivered'
        else null
      end as blocker_state
    from procurement_requirement_state prs
  ),
  procurement_by_order as (
    select
      pbr.order_id,
      count(*) filter (where pbr.blocker_state is not null)::int as blocker_count,
      coalesce(
        jsonb_agg(pbr.blocker_state order by pbr.blocker_state, pbr.id)
          filter (where pbr.blocker_state is not null),
        '[]'::jsonb
      ) as blocker_states
    from procurement_blocker_rows pbr
    group by pbr.order_id
  ),
  order_rows as (
    select
      po.*,
      coalesce(sr.active_count, 0) as active_shipment_count,
      coalesce(sr.delivered_count, 0) as delivered_shipment_count,
      coalesce(sr.moving_count, 0) as moving_shipment_count,
      sr.delivered_at,
      coalesce(sr.shipments, '[]'::jsonb) as shipments,
      coalesce(ir.active_count, 0) as active_installation_count,
      coalesce(ir.completed_count, 0) as completed_installation_count,
      coalesce(ir.in_progress_count, 0) as in_progress_installation_count,
      ir.next_scheduled_at,
      ir.completed_at as installation_completed_at,
      coalesce(ir.installations, '[]'::jsonb) as installations,
      coalesce(pb.blocker_count, 0) as blocker_count,
      coalesce(pb.blocker_states, '[]'::jsonb) as blocker_states
    from project_orders po
    left join shipment_rollup sr on sr.order_id = po.id
    left join installation_rollup ir on ir.order_id = po.id
    left join procurement_by_order pb on pb.order_id = po.id
  ),
  derived_rows as (
    select
      r.*,
      (r.fulfillment_type = 'delivery_installation' or r.active_installation_count > 0) as installation_relevant,
      case
        when not r.is_active then 'cancelled_history'
        when r.fulfillment_type = 'pickup' then 'customer_pickup'
        when r.active_shipment_count = 0 then 'pending'
        when r.delivered_shipment_count = r.active_shipment_count then 'delivered'
        when r.delivered_shipment_count > 0 then 'partial'
        when r.moving_shipment_count > 0 then 'in_progress'
        else 'pending'
      end as delivery_state,
      case
        when not r.is_active then 'cancelled_history'
        when r.fulfillment_type <> 'delivery_installation' and r.active_installation_count = 0 then 'not_required'
        when r.active_installation_count = 0 then 'not_scheduled'
        when r.completed_installation_count = r.active_installation_count then 'completed'
        when r.completed_installation_count > 0 then 'partial'
        when r.in_progress_installation_count > 0 then 'in_progress'
        else 'scheduled'
      end as installation_state,
      case
        when not r.is_active then 'cancelled_history'
        when r.blocker_count > 0 then 'blocked'
        when r.status in ('ready_for_shipment','shipped','delivered','installation_scheduled','installation_in_progress','completed') then 'ready'
        else 'pending'
      end as readiness_state
    from order_rows r
  ),
  project_summary as (
    select
      count(*) filter (where d.is_active)::int as active_order_count,
      count(*) filter (where d.is_active and d.readiness_state = 'ready')::int as ready_order_count,
      count(*) filter (where d.is_active and d.readiness_state <> 'ready')::int as pending_order_count,
      count(*) filter (where d.is_active and d.fulfillment_type = 'pickup')::int as pickup_order_count,
      count(*) filter (where not d.is_active)::int as cancelled_order_count,
      coalesce(sum(d.blocker_count) filter (where d.is_active), 0)::int as procurement_blocker_count,
      count(*) filter (where d.is_active and d.fulfillment_type <> 'pickup')::int as delivery_required_count,
      count(*) filter (where d.is_active and d.installation_relevant)::int as installation_required_count,
      case
        when count(*) filter (where d.is_active and d.fulfillment_type <> 'pickup') = 0 then 'not_required'
        when bool_and(d.delivery_state = 'delivered') filter (where d.is_active and d.fulfillment_type <> 'pickup') then 'delivered'
        when bool_or(d.delivery_state in ('delivered','partial')) filter (where d.is_active and d.fulfillment_type <> 'pickup') then 'partial'
        when bool_or(d.delivery_state = 'in_progress') filter (where d.is_active and d.fulfillment_type <> 'pickup') then 'in_progress'
        else 'pending'
      end as delivery_state,
      case
        when count(*) filter (where d.is_active and d.installation_relevant) = 0 then 'not_required'
        when bool_and(d.installation_state = 'completed') filter (where d.is_active and d.installation_relevant) then 'completed'
        when bool_or(d.installation_state in ('completed','partial')) filter (where d.is_active and d.installation_relevant) then 'partial'
        when bool_or(d.installation_state = 'in_progress') filter (where d.is_active and d.installation_relevant) then 'in_progress'
        when bool_or(d.installation_state = 'scheduled') filter (where d.is_active and d.installation_relevant) then 'scheduled'
        else 'not_scheduled'
      end as installation_state
    from derived_rows d
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'summary', jsonb_build_object(
      'active_order_count', ps.active_order_count,
      'ready_order_count', ps.ready_order_count,
      'pending_order_count', ps.pending_order_count,
      'pickup_order_count', ps.pickup_order_count,
      'cancelled_order_count', ps.cancelled_order_count,
      'procurement_blocker_count', ps.procurement_blocker_count,
      'delivery_required_count', ps.delivery_required_count,
      'delivery_state', ps.delivery_state,
      'installation_required_count', ps.installation_required_count,
      'installation_state', ps.installation_state
    ),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'order_number', d.order_number,
          'status', d.status,
          'order_date', d.order_date,
          'expected_date', d.expected_delivery_date,
          'fulfillment_type', d.fulfillment_type,
          'is_active', d.is_active,
          'readiness_state', d.readiness_state,
          'delivery_state', d.delivery_state,
          'delivered_at', d.delivered_at,
          'installation_state', d.installation_state,
          'next_installation_at', d.next_scheduled_at,
          'installation_completed_at', d.installation_completed_at,
          'blocker_count', d.blocker_count,
          'blocker_states', d.blocker_states,
          'shipments', d.shipments,
          'installations', d.installations
        ) order by d.is_active desc, d.order_date desc, d.order_number desc
      ) from derived_rows d
    ), '[]'::jsonb)
  )
  from project_summary ps
  into v_result;

  return v_result;
end;
$$;

create or replace function public.get_customer_project_fulfillment(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = 'pg_catalog', 'private'
as $$
  select private.get_customer_project_fulfillment($1);
$$;

revoke all on function private.get_customer_project_fulfillment(uuid) from public, anon;
revoke all on function public.get_customer_project_fulfillment(uuid) from public, anon;
grant execute on function private.get_customer_project_fulfillment(uuid) to authenticated;
grant execute on function public.get_customer_project_fulfillment(uuid) to authenticated;
