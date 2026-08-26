begin;

-- Align shipment fulfillment with the current stock_out RPC signature.
-- Apply after customer-shipments.sql.
create or replace function public.ship_customer_shipment(
  p_shipment_id uuid,
  p_carrier text default null,
  p_service_level text default null,
  p_tracking_number text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shipment public.customer_shipments%rowtype;
  v_item record;
  v_reference text;
  v_all_fulfilled boolean;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to ship customer orders.';
  end if;

  select * into v_shipment
  from public.customer_shipments
  where id = p_shipment_id
  for update;

  if v_shipment.id is null then
    raise exception 'Shipment not found.';
  end if;

  if v_shipment.status not in ('draft','picking','packed') then
    raise exception 'Only an active unshipped shipment can be shipped.';
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
        or source_warehouse_id is null
        or source_location_id is null
        or shipment_quantity <= 0
      )
  ) then
    raise exception 'Every shipment line needs a valid source warehouse/location and quantity.';
  end if;

  v_reference := 'SHIPMENT:' || v_shipment.shipment_number;

  for v_item in
    select *
    from public.customer_shipment_items
    where shipment_id = p_shipment_id
    order by line_no
    for update
  loop
    perform public.stock_out(
      p_product_id => v_item.product_id,
      p_warehouse_id => v_item.source_warehouse_id,
      p_location_id => v_item.source_location_id,
      p_quantity => v_item.shipment_quantity,
      p_reference_no => v_reference,
      p_reason => 'Customer shipment fulfillment',
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

  if v_all_fulfilled then
    perform public.set_customer_order_status(
      v_shipment.order_id,
      'shipped',
      'Fully fulfilled by ' || v_shipment.shipment_number
    );
  elsif (
    select status
    from public.customer_orders
    where id = v_shipment.order_id
  ) not in ('shipped','delivered','completed') then
    perform public.set_customer_order_status(
      v_shipment.order_id,
      'ready_for_shipment',
      'Partially fulfilled by ' || v_shipment.shipment_number
    );
  end if;

  return 'shipped';
end;
$$;

revoke all on function public.ship_customer_shipment(uuid,text,text,text) from public, anon;
grant execute on function public.ship_customer_shipment(uuid,text,text,text) to authenticated;

commit;
