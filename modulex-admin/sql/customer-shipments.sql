begin;

-- ============================================================
-- MODULEX CUSTOMER SHIPMENTS / WAREHOUSE FULFILLMENT
-- Shipment quantities are allocated from order lines and stock
-- is deducted only when a shipment is marked Shipped.
-- ============================================================

create sequence if not exists public.customer_shipment_number_seq
  start with 1 increment by 1 minvalue 1;

create table if not exists public.customer_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique,
  customer_id uuid not null references public.customers(id) on update cascade on delete restrict,
  order_id uuid not null references public.customer_orders(id) on update cascade on delete restrict,
  status text not null default 'draft',
  shipping_address_snapshot jsonb,
  carrier text,
  service_level text,
  tracking_number text,
  customer_reference text,
  notes text,
  internal_notes text,
  picking_started_at timestamptz,
  packed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_shipments_number_not_empty check (length(trim(shipment_number)) > 0),
  constraint customer_shipments_status_valid check (status in ('draft','picking','packed','shipped','delivered','cancelled'))
);

create index if not exists customer_shipments_order_idx on public.customer_shipments(order_id, created_at desc);
create index if not exists customer_shipments_customer_idx on public.customer_shipments(customer_id, created_at desc);
create index if not exists customer_shipments_status_idx on public.customer_shipments(status);
create index if not exists customer_shipments_tracking_idx on public.customer_shipments(tracking_number) where tracking_number is not null;

create table if not exists public.customer_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.customer_shipments(id) on update cascade on delete cascade,
  order_item_id uuid not null references public.customer_order_items(id) on update cascade on delete restrict,
  product_id uuid references public.products(id) on update cascade on delete restrict,
  line_no integer not null,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  ordered_quantity_snapshot numeric(18,4) not null,
  shipment_quantity numeric(18,4) not null,
  source_warehouse_id uuid references public.warehouses(id) on update cascade on delete restrict,
  source_location_id uuid references public.inventory_locations(id) on update cascade on delete restrict,
  stock_deducted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_shipment_items_line_positive check (line_no > 0),
  constraint customer_shipment_items_quantities_valid check (
    ordered_quantity_snapshot > 0
    and shipment_quantity > 0
    and shipment_quantity <= ordered_quantity_snapshot
  ),
  constraint customer_shipment_items_unique_line unique(shipment_id, line_no),
  constraint customer_shipment_items_unique_order_line unique(shipment_id, order_item_id)
);

create index if not exists customer_shipment_items_shipment_idx on public.customer_shipment_items(shipment_id, line_no);
create index if not exists customer_shipment_items_order_item_idx on public.customer_shipment_items(order_item_id);
create index if not exists customer_shipment_items_source_idx on public.customer_shipment_items(source_warehouse_id, source_location_id);

create or replace function public.set_customer_shipment_metadata()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_customer_shipments_updated on public.customer_shipments;
create trigger trg_customer_shipments_updated
before update on public.customer_shipments
for each row execute function public.set_customer_shipment_metadata();

create or replace function public.set_customer_shipment_defaults()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.shipment_number is null or trim(new.shipment_number) = '' then
    new.shipment_number := 'SHP-' || lpad(nextval('public.customer_shipment_number_seq')::text, 6, '0');
  end if;
  new.shipment_number := upper(trim(new.shipment_number));
  return new;
end;
$$;

drop trigger if exists trg_set_customer_shipment_defaults on public.customer_shipments;
create trigger trg_set_customer_shipment_defaults
before insert on public.customer_shipments
for each row execute function public.set_customer_shipment_defaults();

-- Remaining quantity for an order line across all non-cancelled shipments.
create or replace function public.customer_order_item_remaining_to_ship(p_order_item_id uuid)
returns numeric language sql stable security invoker set search_path = public
as $$
  select greatest(
    oi.quantity - coalesce((
      select sum(si.shipment_quantity)
      from public.customer_shipment_items si
      join public.customer_shipments s on s.id = si.shipment_id
      where si.order_item_id = oi.id
        and s.status <> 'cancelled'
    ), 0),
    0
  )
  from public.customer_order_items oi
  where oi.id = p_order_item_id;
$$;

-- Creates a draft shipment with every order line that still has quantity remaining.
create or replace function public.create_customer_shipment_from_order(
  p_order_id uuid,
  p_notes text default null,
  p_internal_notes text default null
)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_shipment_id uuid;
  v_line_count integer := 0;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to create customer shipments.';
  end if;

  select * into v_order from public.customer_orders where id = p_order_id for share;
  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status in ('draft','cancelled') then
    raise exception 'Only confirmed active orders can be shipped.';
  end if;

  if not exists (
    select 1 from public.customer_order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
      and public.customer_order_item_remaining_to_ship(oi.id) > 0
  ) then
    raise exception 'This order has no remaining quantity to ship.';
  end if;

  insert into public.customer_shipments (
    shipment_number, customer_id, order_id, status,
    shipping_address_snapshot, customer_reference, notes, internal_notes
  ) values (
    '', v_order.customer_id, v_order.id, 'draft',
    v_order.shipping_address_snapshot, v_order.customer_reference,
    nullif(trim(p_notes), ''), nullif(trim(p_internal_notes), '')
  ) returning id into v_shipment_id;

  insert into public.customer_shipment_items (
    shipment_id, order_item_id, product_id, line_no,
    sku_snapshot, product_name_snapshot,
    ordered_quantity_snapshot, shipment_quantity
  )
  select
    v_shipment_id, oi.id, oi.product_id, row_number() over (order by oi.line_no),
    oi.sku_snapshot, oi.product_name_snapshot,
    oi.quantity, public.customer_order_item_remaining_to_ship(oi.id)
  from public.customer_order_items oi
  where oi.order_id = p_order_id
    and oi.product_id is not null
    and public.customer_order_item_remaining_to_ship(oi.id) > 0
  order by oi.line_no;

  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then raise exception 'No shippable order items were found.'; end if;

  return v_shipment_id;
end;
$$;

-- Draft/picking shipments may adjust quantity and source stock location.
create or replace function public.configure_customer_shipment_item(
  p_shipment_item_id uuid,
  p_quantity numeric,
  p_warehouse_id uuid,
  p_location_id uuid
)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_item public.customer_shipment_items%rowtype;
  v_shipment public.customer_shipments%rowtype;
  v_other_allocated numeric(18,4);
  v_ordered numeric(18,4);
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to configure shipments.';
  end if;

  select * into v_item from public.customer_shipment_items where id = p_shipment_item_id for update;
  if v_item.id is null then raise exception 'Shipment item not found.'; end if;
  select * into v_shipment from public.customer_shipments where id = v_item.shipment_id for update;
  if v_shipment.status not in ('draft','picking') then
    raise exception 'Only Draft or Picking shipments can be edited.';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Shipment quantity must be greater than zero.'; end if;
  if p_warehouse_id is null or p_location_id is null then raise exception 'Warehouse and inventory location are required.'; end if;

  if not exists (
    select 1 from public.inventory_locations l
    where l.id = p_location_id and l.warehouse_id = p_warehouse_id
  ) then
    raise exception 'Selected location does not belong to the selected warehouse.';
  end if;

  select oi.quantity into v_ordered from public.customer_order_items oi where oi.id = v_item.order_item_id;
  select coalesce(sum(si.shipment_quantity), 0) into v_other_allocated
  from public.customer_shipment_items si
  join public.customer_shipments s on s.id = si.shipment_id
  where si.order_item_id = v_item.order_item_id
    and si.id <> v_item.id
    and s.status <> 'cancelled';

  if p_quantity + v_other_allocated > v_ordered then
    raise exception 'Shipment quantity exceeds the remaining order quantity.';
  end if;

  update public.customer_shipment_items
  set shipment_quantity = p_quantity,
      source_warehouse_id = p_warehouse_id,
      source_location_id = p_location_id
  where id = p_shipment_item_id;
end;
$$;

create or replace function public.set_customer_shipment_status(
  p_shipment_id uuid,
  p_status text
)
returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_current text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to update shipments.';
  end if;
  if p_status not in ('draft','picking','packed','cancelled') then
    raise exception 'Use shipment fulfillment actions for Shipped or Delivered states.';
  end if;

  select status into v_current from public.customer_shipments where id = p_shipment_id for update;
  if v_current is null then raise exception 'Shipment not found.'; end if;
  if v_current in ('shipped','delivered','cancelled') then
    raise exception 'This shipment can no longer be changed through this action.';
  end if;
  if p_status = 'cancelled' then
    update public.customer_shipments set status='cancelled', cancelled_at=now() where id=p_shipment_id;
  elsif p_status = 'picking' then
    update public.customer_shipments set status='picking', picking_started_at=coalesce(picking_started_at,now()) where id=p_shipment_id;
  elsif p_status = 'packed' then
    update public.customer_shipments set status='packed', picking_started_at=coalesce(picking_started_at,now()), packed_at=coalesce(packed_at,now()) where id=p_shipment_id;
  else
    update public.customer_shipments set status='draft' where id=p_shipment_id;
  end if;
  return p_status;
end;
$$;

-- Atomic fulfillment. Existing stock_out RPC remains the single stock mutation path.
create or replace function public.ship_customer_shipment(
  p_shipment_id uuid,
  p_carrier text default null,
  p_service_level text default null,
  p_tracking_number text default null
)
returns text language plpgsql security invoker set search_path = public
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

  select * into v_shipment from public.customer_shipments where id=p_shipment_id for update;
  if v_shipment.id is null then raise exception 'Shipment not found.'; end if;
  if v_shipment.status not in ('draft','picking','packed') then raise exception 'Only an active unshipped shipment can be shipped.'; end if;
  if not exists (select 1 from public.customer_shipment_items where shipment_id=p_shipment_id) then raise exception 'Shipment has no items.'; end if;
  if exists (
    select 1 from public.customer_shipment_items
    where shipment_id=p_shipment_id
      and (product_id is null or source_warehouse_id is null or source_location_id is null or shipment_quantity <= 0)
  ) then raise exception 'Every shipment line needs a valid source warehouse/location and quantity.'; end if;

  v_reference := 'SHIPMENT:' || v_shipment.shipment_number;

  for v_item in
    select * from public.customer_shipment_items where shipment_id=p_shipment_id order by line_no for update
  loop
    -- stock_out performs available-stock validation and writes stock_movements.
    perform public.stock_out(
      p_product_id => v_item.product_id,
      p_warehouse_id => v_item.source_warehouse_id,
      p_location_id => v_item.source_location_id,
      p_qty => v_item.shipment_quantity,
      p_reference => v_reference
    );
    update public.customer_shipment_items set stock_deducted_at=now() where id=v_item.id;
  end loop;

  update public.customer_shipments
  set status='shipped',
      carrier=nullif(trim(p_carrier),''),
      service_level=nullif(trim(p_service_level),''),
      tracking_number=nullif(trim(p_tracking_number),''),
      shipped_at=now(),
      picking_started_at=coalesce(picking_started_at,now()),
      packed_at=coalesce(packed_at,now())
  where id=p_shipment_id;

  select not exists (
    select 1
    from public.customer_order_items oi
    where oi.order_id=v_shipment.order_id
      and oi.product_id is not null
      and oi.quantity > coalesce((
        select sum(si.shipment_quantity)
        from public.customer_shipment_items si
        join public.customer_shipments s on s.id=si.shipment_id
        where si.order_item_id=oi.id and s.status in ('shipped','delivered')
      ),0)
  ) into v_all_fulfilled;

  if v_all_fulfilled then
    perform public.set_customer_order_status(v_shipment.order_id, 'shipped', 'Fully fulfilled by ' || v_shipment.shipment_number);
  elsif (select status from public.customer_orders where id=v_shipment.order_id) not in ('shipped','delivered','completed') then
    perform public.set_customer_order_status(v_shipment.order_id, 'ready_for_shipment', 'Partially fulfilled by ' || v_shipment.shipment_number);
  end if;

  return 'shipped';
end;
$$;

create or replace function public.deliver_customer_shipment(p_shipment_id uuid)
returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_shipment public.customer_shipments%rowtype;
  v_all_delivered boolean;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to deliver customer shipments.';
  end if;
  select * into v_shipment from public.customer_shipments where id=p_shipment_id for update;
  if v_shipment.id is null then raise exception 'Shipment not found.'; end if;
  if v_shipment.status <> 'shipped' then raise exception 'Only a Shipped shipment can be marked Delivered.'; end if;

  update public.customer_shipments set status='delivered', delivered_at=now() where id=p_shipment_id;

  select not exists (
    select 1 from public.customer_shipments s
    where s.order_id=v_shipment.order_id
      and s.status='shipped'
  ) and not exists (
    select 1 from public.customer_order_items oi
    where oi.order_id=v_shipment.order_id
      and oi.product_id is not null
      and oi.quantity > coalesce((
        select sum(si.shipment_quantity)
        from public.customer_shipment_items si
        join public.customer_shipments s on s.id=si.shipment_id
        where si.order_item_id=oi.id and s.status='delivered'
      ),0)
  ) into v_all_delivered;

  if v_all_delivered then
    perform public.set_customer_order_status(v_shipment.order_id, 'delivered', 'All shipments delivered.');
  end if;
  return 'delivered';
end;
$$;

alter table public.customer_shipments enable row level security;
alter table public.customer_shipment_items enable row level security;

create policy customer_shipments_read on public.customer_shipments for select to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_shipments_insert on public.customer_shipments for insert to authenticated with check (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_shipments_update on public.customer_shipments for update to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales'])) with check (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_shipment_items_read on public.customer_shipment_items for select to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_shipment_items_insert on public.customer_shipment_items for insert to authenticated with check (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_shipment_items_update on public.customer_shipment_items for update to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales'])) with check (public.current_user_has_any_role(array['super_admin','admin','sales']));

revoke all on public.customer_shipments, public.customer_shipment_items from anon;
grant select,insert,update on public.customer_shipments, public.customer_shipment_items to authenticated;

revoke all on function public.create_customer_shipment_from_order(uuid,text,text) from public, anon;
grant execute on function public.create_customer_shipment_from_order(uuid,text,text) to authenticated;
revoke all on function public.configure_customer_shipment_item(uuid,numeric,uuid,uuid) from public, anon;
grant execute on function public.configure_customer_shipment_item(uuid,numeric,uuid,uuid) to authenticated;
revoke all on function public.set_customer_shipment_status(uuid,text) from public, anon;
grant execute on function public.set_customer_shipment_status(uuid,text) to authenticated;
revoke all on function public.ship_customer_shipment(uuid,text,text,text) from public, anon;
grant execute on function public.ship_customer_shipment(uuid,text,text,text) to authenticated;
revoke all on function public.deliver_customer_shipment(uuid) from public, anon;
grant execute on function public.deliver_customer_shipment(uuid) to authenticated;

commit;
