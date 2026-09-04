-- Align Customer Order stock reservation with Project Procurement demand.
-- Project-linked Orders may confirm with partial sellable stock; Procurement owns the unfulfilled purchase need.
-- Standalone Orders remain fail-closed on stock shortage because they have no Project Procurement surface.

create or replace function private.reserve_customer_order_item_stock(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $$
declare
  v_item record;
  v_consumed numeric(18,4) := 0;
  v_active numeric(18,4) := 0;
  v_target numeric(18,4) := 0;
  v_needed numeric(18,4) := 0;
  v_excess numeric(18,4) := 0;
  v_take numeric(18,4) := 0;
  v_res record;
  v_inv record;
begin
  select
    oi.id,
    oi.order_id,
    oi.product_id,
    oi.quantity,
    oi.countertop_reservation_quantity,
    oi.sku_snapshot,
    oi.product_name_snapshot,
    o.order_number,
    o.status as order_status,
    o.project_id,
    pt.inventory_tracking,
    pt.reservable
  into v_item
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  join public.product_types pt on pt.id = p.product_type_id
  where oi.id = p_order_item_id
  for share of oi, o;

  if not found or v_item.product_id is null then
    return;
  end if;

  if not coalesce(v_item.inventory_tracking, false)
     or not coalesce(v_item.reservable, false)
  then
    return;
  end if;

  if not private.order_status_reserves_stock(v_item.order_status) then
    return;
  end if;

  select
    coalesce(sum(r.consumed_quantity), 0),
    coalesce(sum(r.remaining_quantity) filter (
      where r.status = 'active' and r.remaining_quantity > 0
    ), 0)
  into v_consumed, v_active
  from public.customer_order_reservations r
  where r.order_item_id = p_order_item_id;

  v_target := greatest(
    coalesce(v_item.countertop_reservation_quantity, v_item.quantity) - v_consumed,
    0
  );

  if v_active > v_target then
    v_excess := v_active - v_target;

    for v_res in
      select
        r.id,
        r.product_id,
        r.warehouse_id,
        r.location_id,
        r.order_number_snapshot,
        r.remaining_quantity
      from public.customer_order_reservations r
      where r.order_item_id = p_order_item_id
        and r.status = 'active'
        and r.remaining_quantity > 0
      order by r.created_at desc, r.id desc
      for update
    loop
      exit when v_excess <= 0;
      v_take := least(v_res.remaining_quantity, v_excess);

      perform 1
      from public.inventory i
      where i.product_id = v_res.product_id
        and i.warehouse_id = v_res.warehouse_id
        and i.location_id = v_res.location_id
      for update;

      if not found then
        raise exception 'ORDER_RESERVATION_INVENTORY_MISSING: inventory record not found for reservation %', v_res.id;
      end if;

      update public.inventory
      set reserved_quantity = reserved_quantity - v_take
      where product_id = v_res.product_id
        and warehouse_id = v_res.warehouse_id
        and location_id = v_res.location_id
        and reserved_quantity >= v_take;

      if not found then
        raise exception 'ORDER_RESERVATION_DRIFT: inventory reserved quantity is lower than order reservation %', v_res.id;
      end if;

      insert into public.inventory_movements (
        product_id,
        from_warehouse_id,
        from_location_id,
        movement_type,
        quantity,
        reference_no,
        reason,
        notes,
        created_by
      ) values (
        v_res.product_id,
        v_res.warehouse_id,
        v_res.location_id,
        'release',
        v_take,
        'ORDER:' || v_res.order_number_snapshot,
        'Customer order reservation reconciliation',
        'Reservation reduced after order line change',
        auth.uid()
      );

      update public.customer_order_reservations
      set released_quantity = released_quantity + v_take,
          status = case when remaining_quantity - v_take <= 0 then 'released' else 'active' end,
          released_at = case when remaining_quantity - v_take <= 0 then now() else released_at end,
          updated_at = now()
      where id = v_res.id;

      v_excess := v_excess - v_take;
    end loop;

    v_active := v_target;
  end if;

  v_needed := v_target - v_active;
  if v_needed <= 0 then
    return;
  end if;

  for v_inv in
    select
      i.id as inventory_id,
      i.product_id,
      i.warehouse_id,
      i.location_id,
      i.quantity - i.reserved_quantity as available_quantity,
      w.code as warehouse_code,
      l.code as location_code
    from public.inventory i
    join public.warehouses w on w.id = i.warehouse_id
    join public.locations l on l.id = i.location_id
    where i.product_id = v_item.product_id
      and w.is_active = true
      and w.warehouse_type = 'sellable'
      and l.is_active = true
      and i.quantity - i.reserved_quantity > 0
    order by w.code, l.code, i.id
    for update of i
  loop
    exit when v_needed <= 0;
    v_take := least(v_inv.available_quantity, v_needed);

    update public.inventory
    set reserved_quantity = reserved_quantity + v_take
    where id = v_inv.inventory_id;

    insert into public.customer_order_reservations (
      order_id,
      order_item_id,
      product_id,
      warehouse_id,
      location_id,
      order_number_snapshot,
      sku_snapshot,
      product_name_snapshot,
      quantity,
      status,
      created_by
    ) values (
      v_item.order_id,
      v_item.id,
      v_item.product_id,
      v_inv.warehouse_id,
      v_inv.location_id,
      v_item.order_number,
      v_item.sku_snapshot,
      v_item.product_name_snapshot,
      v_take,
      'active',
      auth.uid()
    );

    insert into public.inventory_movements (
      product_id,
      from_warehouse_id,
      from_location_id,
      movement_type,
      quantity,
      reference_no,
      reason,
      notes,
      created_by
    ) values (
      v_item.product_id,
      v_inv.warehouse_id,
      v_inv.location_id,
      'reservation',
      v_take,
      'ORDER:' || v_item.order_number,
      'Customer order reservation',
      'Reserved for order item ' || v_item.sku_snapshot,
      auth.uid()
    );

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 and v_item.project_id is null then
    raise exception 'STANDALONE_STOCK_SHORTAGE: SKU % requires % more unit(s) of sellable stock.', v_item.sku_snapshot, v_needed;
  end if;

  -- Project-linked shortage is intentionally non-fatal. The later Project Procurement
  -- trigger derives the still-unfulfilled quantity after these reservations.
  return;
end;
$$;

create or replace function private.get_customer_order_procurement_components(p_order_id uuid)
returns table(
  order_item_id uuid,
  source_kind text,
  configuration_id uuid,
  product_id uuid,
  required_quantity numeric
)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  with reservation_totals as (
    select
      r.order_item_id,
      coalesce(sum(r.consumed_quantity), 0)::numeric(18,4) as consumed_quantity,
      coalesce(sum(r.remaining_quantity) filter (
        where r.status = 'active' and r.remaining_quantity > 0
      ), 0)::numeric(18,4) as reserved_quantity
    from public.customer_order_reservations r
    where r.order_id = $1
    group by r.order_item_id
  ),
  ordinary_components as (
    select
      oi.id as order_item_id,
      'order_item'::text as source_kind,
      null::uuid as configuration_id,
      oi.product_id,
      case
        when coalesce(pt.inventory_tracking, false)
          and coalesce(pt.reservable, false)
        then greatest(
          coalesce(oi.countertop_reservation_quantity, oi.quantity)::numeric(18,4)
            - coalesce(rt.consumed_quantity, 0)
            - coalesce(rt.reserved_quantity, 0),
          0
        )::numeric(18,4)
        else oi.quantity::numeric(18,4)
      end as required_quantity
    from public.customer_order_items oi
    join public.products p on p.id = oi.product_id
    join public.product_types pt on pt.id = p.product_type_id
    left join public.countertop_configurations cc on cc.order_item_id = oi.id
    left join reservation_totals rt on rt.order_item_id = oi.id
    where oi.order_id = $1
      and pt.code <> 'SERVICE'
      and cc.id is null
  )
  select
    oc.order_item_id,
    oc.source_kind,
    oc.configuration_id,
    oc.product_id,
    oc.required_quantity
  from ordinary_components oc
  where oc.required_quantity > 0

  union all

  select
    cc.order_item_id,
    'countertop_stone'::text,
    cc.id,
    cc.stone_product_id,
    case
      when cc.slab_quantity > 0 then cc.slab_quantity::numeric(18,4)
      else null
    end
  from public.countertop_configurations cc
  where cc.order_id = $1

  union all

  select
    cc.order_item_id,
    'countertop_sink'::text,
    cc.id,
    cc.sink_product_id,
    1::numeric(18,4)
  from public.countertop_configurations cc
  where cc.order_id = $1
    and cc.sink_product_id is not null;
$$;

-- PostgreSQL fires triggers for the same event in trigger-name order. Stock reservation
-- must run first so Procurement sees the post-reservation open quantity.
drop trigger if exists trg_customer_order_project_procurement_sync on public.customer_orders;
drop trigger if exists trg_customer_order_z_project_procurement_sync on public.customer_orders;

create trigger trg_customer_order_z_project_procurement_sync
after update of status, project_id on public.customer_orders
for each row
execute function private.sync_customer_order_procurement_on_order_change();

-- Backfill only active Project Orders that have no current Procurement truth yet.
-- This fixes pre-PB-3B confirmed Orders without rewriting existing commitment history.
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select o.id
    from public.customer_orders o
    where o.project_id is not null
      and o.status <> 'draft'
      and o.status <> 'cancelled'
      and not exists (
        select 1
        from public.customer_project_procurement_requirements r
        where r.order_id = o.id
          and r.is_current
      )
    order by o.id
  loop
    perform private.sync_customer_order_procurement(v_order_id);
  end loop;
end;
$$;
