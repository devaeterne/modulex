begin;

-- A1 cross-domain compatibility: shipment events must advance shipment state
-- without regressing an order that has already entered installation scheduling.
-- The shipment row trigger remains authoritative for shipment transitions; these
-- functions fail early before reservation consumption unless the shipment is Packed.

create or replace function private.ship_customer_shipment(
  p_shipment_id uuid,
  p_carrier text default null,
  p_service_level text default null,
  p_tracking_number text default null
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shipment public.customer_shipments%rowtype;
  v_item record;
  v_reference text;
  v_all_fulfilled boolean;
  v_order_status text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping']) then
    raise exception 'You do not have permission to ship customer orders.';
  end if;

  select * into v_shipment
  from public.customer_shipments
  where id = p_shipment_id
  for update;

  if v_shipment.id is null then
    raise exception 'Shipment not found.';
  end if;

  if v_shipment.status <> 'packed' then
    raise exception 'Only a Packed shipment can be shipped.';
  end if;

  if not exists (
    select 1
    from public.customer_shipment_items
    where shipment_id = p_shipment_id
  ) then
    raise exception 'Shipment has no items.';
  end if;

  if exists (
    select 1
    from public.customer_shipment_items
    where shipment_id = p_shipment_id
      and (
        product_id is null
        or order_item_id is null
        or source_warehouse_id is null
        or source_location_id is null
        or shipment_quantity <= 0
      )
  ) then
    raise exception 'Every shipment line needs a valid order item, source warehouse/location and quantity.';
  end if;

  v_reference := 'SHIPMENT:' || v_shipment.shipment_number;

  for v_item in
    select *
    from public.customer_shipment_items
    where shipment_id = p_shipment_id
    order by line_no
    for update
  loop
    perform private.consume_customer_order_reservation(
      p_order_item_id => v_item.order_item_id,
      p_warehouse_id => v_item.source_warehouse_id,
      p_location_id => v_item.source_location_id,
      p_quantity => v_item.shipment_quantity,
      p_reference_no => v_reference,
      p_notes => 'Shipment ' || v_shipment.shipment_number
    );

    update public.customer_shipment_items
    set stock_deducted_at = now()
    where id = v_item.id;
  end loop;

  update public.customer_shipments
  set status = 'shipped',
      carrier = nullif(trim(p_carrier), ''),
      service_level = nullif(trim(p_service_level), ''),
      tracking_number = nullif(trim(p_tracking_number), ''),
      shipped_at = now(),
      picking_started_at = coalesce(picking_started_at, now()),
      packed_at = coalesce(packed_at, now())
  where id = p_shipment_id;

  select not exists (
    select 1
    from public.customer_order_items oi
    where oi.order_id = v_shipment.order_id
      and oi.product_id is not null
      and oi.quantity > coalesce((
        select sum(si.shipment_quantity)
        from public.customer_shipment_items si
        join public.customer_shipments s on s.id = si.shipment_id
        where si.order_item_id = oi.id
          and s.status in ('shipped','delivered')
      ), 0)
  ) into v_all_fulfilled;

  select o.status into v_order_status
  from public.customer_orders o
  where o.id = v_shipment.order_id;

  if v_all_fulfilled then
    if v_order_status in ('confirmed','in_preparation','ready_for_shipment') then
      perform private.apply_customer_order_status(
        v_shipment.order_id,
        'shipped',
        'Fully fulfilled by ' || v_shipment.shipment_number
      );
    end if;
  elsif v_order_status in ('confirmed','in_preparation') then
    perform private.apply_customer_order_status(
      v_shipment.order_id,
      'ready_for_shipment',
      'Partially fulfilled by ' || v_shipment.shipment_number
    );
  end if;

  -- Preserve later lifecycle states such as delivered, installation_scheduled,
  -- installation_in_progress and completed; shipment fulfillment must not regress them.
  return 'shipped';
end;
$$;

create or replace function private.deliver_customer_shipment(
  p_shipment_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shipment public.customer_shipments%rowtype;
  v_all_delivered boolean;
  v_order_status text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping']) then
    raise exception 'You do not have permission to deliver customer shipments.';
  end if;

  select * into v_shipment
  from public.customer_shipments
  where id = p_shipment_id
  for update;

  if v_shipment.id is null then
    raise exception 'Shipment not found.';
  end if;

  if v_shipment.status <> 'shipped' then
    raise exception 'Only a Shipped shipment can be marked Delivered.';
  end if;

  update public.customer_shipments
  set status = 'delivered', delivered_at = now()
  where id = p_shipment_id;

  select not exists (
    select 1
    from public.customer_shipments s
    where s.order_id = v_shipment.order_id
      and s.status = 'shipped'
  ) and not exists (
    select 1
    from public.customer_order_items oi
    where oi.order_id = v_shipment.order_id
      and oi.product_id is not null
      and oi.quantity > coalesce((
        select sum(si.shipment_quantity)
        from public.customer_shipment_items si
        join public.customer_shipments s on s.id = si.shipment_id
        where si.order_item_id = oi.id
          and s.status = 'delivered'
      ), 0)
  )
  into v_all_delivered;

  select o.status into v_order_status
  from public.customer_orders o
  where o.id = v_shipment.order_id;

  if v_all_delivered and v_order_status = 'shipped' then
    perform private.apply_customer_order_status(
      v_shipment.order_id,
      'delivered',
      'All shipments delivered.'
    );
  end if;

  -- If installation_scheduled / installation_in_progress (or completed) already
  -- owns the order lifecycle, delivery records the shipment event without regression.
  return 'delivered';
end;
$$;

notify pgrst, 'reload schema';

commit;
