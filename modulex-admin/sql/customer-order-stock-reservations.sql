-- ============================================================
-- MODULEX CUSTOMER ORDER STOCK RESERVATIONS
-- confirmed orders own sellable stock until shipment/cancel.
-- ============================================================

create table public.customer_order_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on update cascade on delete cascade,
  order_item_id uuid references public.customer_order_items(id) on update cascade on delete set null,
  product_id uuid not null references public.products(id) on update cascade on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on update cascade on delete restrict,
  location_id uuid not null references public.locations(id) on update cascade on delete restrict,
  order_number_snapshot text not null,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  quantity numeric(18,4) not null,
  consumed_quantity numeric(18,4) not null default 0,
  released_quantity numeric(18,4) not null default 0,
  remaining_quantity numeric(18,4) generated always as (quantity - consumed_quantity - released_quantity) stored,
  status text not null default 'active',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  constraint customer_order_reservations_quantity_positive check (quantity > 0),
  constraint customer_order_reservations_amounts_valid check (
    consumed_quantity >= 0
    and released_quantity >= 0
    and consumed_quantity + released_quantity <= quantity
  ),
  constraint customer_order_reservations_status_valid check (status in ('active','consumed','released'))
);

create index customer_order_reservations_order_idx
  on public.customer_order_reservations(order_id, status);
create index customer_order_reservations_order_item_idx
  on public.customer_order_reservations(order_item_id, status)
  where order_item_id is not null;
create index customer_order_reservations_product_idx
  on public.customer_order_reservations(product_id, status);
create index customer_order_reservations_source_idx
  on public.customer_order_reservations(warehouse_id, location_id, status);
create index customer_order_reservations_active_idx
  on public.customer_order_reservations(order_id, order_item_id, warehouse_id, location_id)
  where status = 'active';
create index customer_order_reservations_created_by_idx
  on public.customer_order_reservations(created_by);
create index customer_order_reservations_location_idx
  on public.customer_order_reservations(location_id);

alter table public.customer_order_reservations enable row level security;
grant select on table public.customer_order_reservations to authenticated;
revoke all on table public.customer_order_reservations from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.customer_order_reservations from authenticated;

create policy customer_order_reservations_read
on public.customer_order_reservations
for select
to authenticated
using (
  (select public.current_user_has_any_role(
    array['super_admin','admin','sales','warehouse','shipping']
  ))
);

comment on table public.customer_order_reservations is
  'Order-item stock allocations. Active remaining quantities are reflected in inventory.reserved_quantity.';

create or replace function private.order_status_reserves_stock(p_status text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_status in (
    'confirmed',
    'in_preparation',
    'ready_for_shipment',
    'installation_scheduled',
    'installation_in_progress'
  );
$$;
revoke all on function private.order_status_reserves_stock(text)
from public, anon, authenticated;

create or replace function private.release_customer_order_item_stock(
  p_order_item_id uuid,
  p_reason text default 'Customer order reservation release'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res record;
  v_remaining numeric(18,4);
begin
  for v_res in
    select r.id, r.product_id, r.warehouse_id, r.location_id,
           r.order_number_snapshot, r.remaining_quantity
    from public.customer_order_reservations r
    where r.order_item_id = p_order_item_id
      and r.status = 'active'
      and r.remaining_quantity > 0
    order by r.created_at, r.id
    for update
  loop
    v_remaining := v_res.remaining_quantity;

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
    set reserved_quantity = reserved_quantity - v_remaining
    where product_id = v_res.product_id
      and warehouse_id = v_res.warehouse_id
      and location_id = v_res.location_id
      and reserved_quantity >= v_remaining;

    if not found then
      raise exception 'ORDER_RESERVATION_DRIFT: inventory reserved quantity is lower than order reservation %', v_res.id;
    end if;

    insert into public.inventory_movements (
      product_id, from_warehouse_id, from_location_id, movement_type,
      quantity, reference_no, reason, notes, created_by
    ) values (
      v_res.product_id, v_res.warehouse_id, v_res.location_id, 'release',
      v_remaining, 'ORDER:' || v_res.order_number_snapshot,
      p_reason, 'Order reservation released', auth.uid()
    );

    update public.customer_order_reservations
    set released_quantity = released_quantity + v_remaining,
        status = 'released',
        released_at = now(),
        updated_at = now()
    where id = v_res.id;
  end loop;
end;
$$;
revoke all on function private.release_customer_order_item_stock(uuid, text)
from public, anon, authenticated;

create or replace function private.reserve_customer_order_item_stock(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
  select oi.id, oi.order_id, oi.product_id, oi.quantity,
         oi.countertop_reservation_quantity,
         oi.sku_snapshot, oi.product_name_snapshot,
         o.order_number, o.status as order_status
  into v_item
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for share of oi, o;

  if not found or v_item.product_id is null then return; end if;
  if not private.order_status_reserves_stock(v_item.order_status) then return; end if;

  select
    coalesce(sum(r.consumed_quantity), 0),
    coalesce(sum(r.remaining_quantity) filter (
      where r.status = 'active' and r.remaining_quantity > 0
    ), 0)
  into v_consumed, v_active
  from public.customer_order_reservations r
  where r.order_item_id = p_order_item_id;

  -- Countertop jobs reserve physical slabs independently from commercial job quantity.
  v_target := greatest(coalesce(v_item.countertop_reservation_quantity, v_item.quantity) - v_consumed, 0);

  if v_active > v_target then
    v_excess := v_active - v_target;

    for v_res in
      select r.id, r.product_id, r.warehouse_id, r.location_id,
             r.order_number_snapshot, r.remaining_quantity
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
        product_id, from_warehouse_id, from_location_id, movement_type,
        quantity, reference_no, reason, notes, created_by
      ) values (
        v_res.product_id, v_res.warehouse_id, v_res.location_id, 'release',
        v_take, 'ORDER:' || v_res.order_number_snapshot,
        'Customer order reservation reconciliation',
        'Reservation reduced after order line change', auth.uid()
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
  if v_needed <= 0 then return; end if;

  for v_inv in
    select i.id as inventory_id, i.product_id, i.warehouse_id, i.location_id,
           i.quantity - i.reserved_quantity as available_quantity,
           w.code as warehouse_code, l.code as location_code
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
      order_id, order_item_id, product_id, warehouse_id, location_id,
      order_number_snapshot, sku_snapshot, product_name_snapshot,
      quantity, status, created_by
    ) values (
      v_item.order_id, v_item.id, v_item.product_id,
      v_inv.warehouse_id, v_inv.location_id,
      v_item.order_number, v_item.sku_snapshot, v_item.product_name_snapshot,
      v_take, 'active', auth.uid()
    );

    insert into public.inventory_movements (
      product_id, from_warehouse_id, from_location_id, movement_type,
      quantity, reference_no, reason, notes, created_by
    ) values (
      v_item.product_id, v_inv.warehouse_id, v_inv.location_id, 'reservation',
      v_take, 'ORDER:' || v_item.order_number,
      'Customer order reservation',
      'Reserved for order item ' || v_item.sku_snapshot,
      auth.uid()
    );

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception 'ORDER_STOCK_SHORTAGE: SKU % requires % more unit(s) of sellable stock.',
      v_item.sku_snapshot, v_needed;
  end if;
end;
$$;
revoke all on function private.reserve_customer_order_item_stock(uuid)
from public, anon, authenticated;

create or replace function private.reserve_customer_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_item record;
begin
  select status into v_status
  from public.customer_orders
  where id = p_order_id
  for share;

  if not found or not private.order_status_reserves_stock(v_status) then return; end if;

  for v_item in
    select id
    from public.customer_order_items
    where order_id = p_order_id and product_id is not null
    order by line_no, id
  loop
    perform private.reserve_customer_order_item_stock(v_item.id);
  end loop;
end;
$$;
revoke all on function private.reserve_customer_order_stock(uuid)
from public, anon, authenticated;

create or replace function private.release_customer_order_stock(
  p_order_id uuid,
  p_reason text default 'Customer order reservation release'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res record;
  v_remaining numeric(18,4);
begin
  for v_res in
    select r.id, r.product_id, r.warehouse_id, r.location_id,
           r.order_number_snapshot, r.remaining_quantity
    from public.customer_order_reservations r
    where r.order_id = p_order_id
      and r.status = 'active'
      and r.remaining_quantity > 0
    order by r.created_at, r.id
    for update
  loop
    v_remaining := v_res.remaining_quantity;

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
    set reserved_quantity = reserved_quantity - v_remaining
    where product_id = v_res.product_id
      and warehouse_id = v_res.warehouse_id
      and location_id = v_res.location_id
      and reserved_quantity >= v_remaining;

    if not found then
      raise exception 'ORDER_RESERVATION_DRIFT: inventory reserved quantity is lower than order reservation %', v_res.id;
    end if;

    insert into public.inventory_movements (
      product_id, from_warehouse_id, from_location_id, movement_type,
      quantity, reference_no, reason, notes, created_by
    ) values (
      v_res.product_id, v_res.warehouse_id, v_res.location_id, 'release',
      v_remaining, 'ORDER:' || v_res.order_number_snapshot,
      p_reason, 'Order reservation released', auth.uid()
    );

    update public.customer_order_reservations
    set released_quantity = released_quantity + v_remaining,
        status = 'released', released_at = now(), updated_at = now()
    where id = v_res.id;
  end loop;
end;
$$;
revoke all on function private.release_customer_order_stock(uuid, text)
from public, anon, authenticated;

create or replace function private.consume_customer_order_reservation(
  p_order_item_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_reference_no text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_available_reserved numeric(18,4) := 0;
  v_to_consume numeric(18,4);
  v_take numeric(18,4);
  v_res record;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to consume customer order reservations.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Shipment quantity must be greater than zero.';
  end if;

  select oi.order_id, oi.product_id, oi.sku_snapshot, o.order_number
  into v_item
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for share of oi, o;

  if not found or v_item.product_id is null then
    raise exception 'Order item not found.';
  end if;

  select coalesce(sum(r.remaining_quantity), 0)
  into v_available_reserved
  from public.customer_order_reservations r
  where r.order_item_id = p_order_item_id
    and r.warehouse_id = p_warehouse_id
    and r.location_id = p_location_id
    and r.status = 'active'
    and r.remaining_quantity > 0;

  if v_available_reserved < p_quantity then
    raise exception 'ORDER_RESERVATION_SHORTAGE: reserved quantity at the selected location is %, requested %.',
      v_available_reserved, p_quantity;
  end if;

  perform 1
  from public.inventory i
  where i.product_id = v_item.product_id
    and i.warehouse_id = p_warehouse_id
    and i.location_id = p_location_id
  for update;

  if not found then
    raise exception 'Inventory record not found for reserved shipment stock.';
  end if;

  update public.inventory
  set quantity = quantity - p_quantity,
      reserved_quantity = reserved_quantity - p_quantity
  where product_id = v_item.product_id
    and warehouse_id = p_warehouse_id
    and location_id = p_location_id
    and quantity >= p_quantity
    and reserved_quantity >= p_quantity;

  if not found then
    raise exception 'ORDER_RESERVATION_DRIFT: physical or reserved stock is lower than the shipment quantity.';
  end if;

  insert into public.inventory_movements (
    product_id, from_warehouse_id, from_location_id, movement_type,
    quantity, reference_no, reason, notes, created_by
  ) values (
    v_item.product_id, p_warehouse_id, p_location_id, 'out',
    p_quantity, p_reference_no, 'Customer shipment fulfillment',
    coalesce(p_notes, 'Order ' || v_item.order_number || ' / ' || v_item.sku_snapshot),
    auth.uid()
  );

  v_to_consume := p_quantity;

  for v_res in
    select r.id, r.remaining_quantity
    from public.customer_order_reservations r
    where r.order_item_id = p_order_item_id
      and r.warehouse_id = p_warehouse_id
      and r.location_id = p_location_id
      and r.status = 'active'
      and r.remaining_quantity > 0
    order by r.created_at, r.id
    for update
  loop
    exit when v_to_consume <= 0;
    v_take := least(v_res.remaining_quantity, v_to_consume);

    update public.customer_order_reservations
    set consumed_quantity = consumed_quantity + v_take,
        status = case when remaining_quantity - v_take <= 0 then 'consumed' else 'active' end,
        consumed_at = case when remaining_quantity - v_take <= 0 then now() else consumed_at end,
        updated_at = now()
    where id = v_res.id;

    v_to_consume := v_to_consume - v_take;
  end loop;

  if v_to_consume > 0 then
    raise exception 'ORDER_RESERVATION_DRIFT: reservation rows could not satisfy shipment consumption.';
  end if;
end;
$$;
revoke all on function private.consume_customer_order_reservation(uuid, uuid, uuid, numeric, text, text)
from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.consume_customer_order_reservation(uuid, uuid, uuid, numeric, text, text)
to authenticated;

create or replace function private.release_order_item_reservation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform private.release_customer_order_item_stock(old.id, 'Order item removed');
    return old;
  end if;

  if old.product_id is distinct from new.product_id
     or old.quantity is distinct from new.quantity then
    perform private.release_customer_order_item_stock(old.id, 'Order item changed');
  end if;

  return new;
end;
$$;
revoke all on function private.release_order_item_reservation_trigger()
from public, anon, authenticated;

create or replace function private.reserve_order_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.customer_orders
  where id = new.order_id;

  if private.order_status_reserves_stock(v_status) then
    perform private.reserve_customer_order_item_stock(new.id);
  end if;

  return new;
end;
$$;
revoke all on function private.reserve_order_item_trigger()
from public, anon, authenticated;

drop trigger if exists trg_customer_order_item_release_on_delete on public.customer_order_items;
create trigger trg_customer_order_item_release_on_delete
before delete on public.customer_order_items
for each row execute function private.release_order_item_reservation_trigger();

drop trigger if exists trg_customer_order_item_release_on_update on public.customer_order_items;
create trigger trg_customer_order_item_release_on_update
before update of product_id, quantity on public.customer_order_items
for each row execute function private.release_order_item_reservation_trigger();

drop trigger if exists trg_customer_order_item_reserve_on_insert on public.customer_order_items;
create trigger trg_customer_order_item_reserve_on_insert
after insert on public.customer_order_items
for each row execute function private.reserve_order_item_trigger();

drop trigger if exists trg_customer_order_item_reserve_on_update on public.customer_order_items;
create trigger trg_customer_order_item_reserve_on_update
after update of product_id, quantity on public.customer_order_items
for each row execute function private.reserve_order_item_trigger();

create or replace function private.guard_customer_order_stock_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('shipped','delivered','completed')
     and exists (
       select 1
       from public.customer_order_reservations r
       where r.order_id = old.id
         and r.status = 'active'
         and r.remaining_quantity > 0
     ) then
    raise exception 'ORDER_HAS_RESERVED_STOCK: fulfill or release reserved stock before setting order status to %.', new.status;
  end if;

  return new;
end;
$$;
revoke all on function private.guard_customer_order_stock_status_trigger()
from public, anon, authenticated;

create or replace function private.sync_customer_order_stock_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is not distinct from new.status then return new; end if;

  if private.order_status_reserves_stock(new.status) then
    perform private.reserve_customer_order_stock(new.id);
  elsif new.status in ('draft','cancelled') then
    perform private.release_customer_order_stock(
      new.id,
      case when new.status = 'cancelled'
        then 'Customer order cancelled'
        else 'Customer order returned to draft'
      end
    );
  end if;

  return new;
end;
$$;
revoke all on function private.sync_customer_order_stock_status_trigger()
from public, anon, authenticated;

drop trigger if exists trg_customer_order_stock_status_guard on public.customer_orders;
create trigger trg_customer_order_stock_status_guard
before update of status on public.customer_orders
for each row execute function private.guard_customer_order_stock_status_trigger();

drop trigger if exists trg_customer_order_stock_status_sync on public.customer_orders;
create trigger trg_customer_order_stock_status_sync
after update of status on public.customer_orders
for each row execute function private.sync_customer_order_stock_status_trigger();

create or replace function public.create_customer_shipment_from_order(
  p_order_id uuid,
  p_notes text default null,
  p_internal_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_shipment_id uuid;
  v_line_count integer := 0;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to create customer shipments.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id
  for share;

  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status in ('draft','cancelled') then
    raise exception 'Only confirmed active orders can be shipped.';
  end if;

  if not exists (
    select 1
    from public.customer_order_reservations r
    where r.order_id = p_order_id
      and r.status = 'active'
      and r.remaining_quantity > 0
  ) then
    raise exception 'This order has no reserved stock remaining to ship.';
  end if;

  insert into public.customer_shipments (
    shipment_number, customer_id, order_id, status,
    shipping_address_snapshot, customer_reference, notes, internal_notes
  ) values (
    '', v_order.customer_id, v_order.id, 'draft',
    v_order.shipping_address_snapshot, v_order.customer_reference,
    nullif(trim(p_notes), ''), nullif(trim(p_internal_notes), '')
  ) returning id into v_shipment_id;

  with reserved as (
    select r.order_item_id, r.product_id, r.warehouse_id, r.location_id,
           sum(r.remaining_quantity)::numeric(18,4) as reserved_quantity
    from public.customer_order_reservations r
    where r.order_id = p_order_id
      and r.order_item_id is not null
      and r.status = 'active'
      and r.remaining_quantity > 0
    group by r.order_item_id, r.product_id, r.warehouse_id, r.location_id
  ), open_allocations as (
    select si.order_item_id,
           si.source_warehouse_id as warehouse_id,
           si.source_location_id as location_id,
           sum(si.shipment_quantity)::numeric(18,4) as allocated_quantity
    from public.customer_shipment_items si
    join public.customer_shipments s on s.id = si.shipment_id
    where s.order_id = p_order_id
      and s.id <> v_shipment_id
      and s.status in ('draft','picking','packed')
      and si.source_warehouse_id is not null
      and si.source_location_id is not null
    group by si.order_item_id, si.source_warehouse_id, si.source_location_id
  ), available as (
    select r.order_item_id, r.product_id, r.warehouse_id, r.location_id,
           greatest(r.reserved_quantity - coalesce(a.allocated_quantity,0),0)::numeric(18,4) as available_quantity
    from reserved r
    left join open_allocations a
      on a.order_item_id = r.order_item_id
     and a.warehouse_id = r.warehouse_id
     and a.location_id = r.location_id
  )
  insert into public.customer_shipment_items (
    shipment_id, order_item_id, product_id, line_no,
    sku_snapshot, product_name_snapshot, ordered_quantity_snapshot,
    shipment_quantity, source_warehouse_id, source_location_id
  )
  select v_shipment_id, oi.id, oi.product_id,
         row_number() over (order by oi.line_no, w.code, l.code, a.location_id)::integer,
         oi.sku_snapshot, oi.product_name_snapshot, oi.quantity,
         a.available_quantity, a.warehouse_id, a.location_id
  from available a
  join public.customer_order_items oi on oi.id = a.order_item_id
  join public.warehouses w on w.id = a.warehouse_id
  join public.locations l on l.id = a.location_id
  where a.available_quantity > 0
  order by oi.line_no, w.code, l.code, a.location_id;

  get diagnostics v_line_count = row_count;
  if v_line_count = 0 then
    raise exception 'No unallocated reserved stock is available for a new shipment.';
  end if;

  return v_shipment_id;
end;
$$;

create or replace function public.configure_customer_shipment_item(
  p_shipment_item_id uuid,
  p_quantity numeric,
  p_warehouse_id uuid,
  p_location_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.customer_shipment_items%rowtype;
  v_shipment public.customer_shipments%rowtype;
  v_other_allocated numeric(18,4);
  v_ordered numeric(18,4);
  v_reserved_at_source numeric(18,4);
  v_other_source_allocated numeric(18,4);
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to configure shipments.';
  end if;

  select * into v_item
  from public.customer_shipment_items
  where id = p_shipment_item_id
  for update;
  if v_item.id is null then raise exception 'Shipment item not found.'; end if;

  select * into v_shipment
  from public.customer_shipments
  where id = v_item.shipment_id
  for update;
  if v_shipment.status not in ('draft','picking') then
    raise exception 'Only Draft or Picking shipments can be edited.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Shipment quantity must be greater than zero.';
  end if;
  if p_warehouse_id is null or p_location_id is null then
    raise exception 'Warehouse and inventory location are required.';
  end if;

  if not exists (
    select 1
    from public.locations l
    join public.warehouses w on w.id = l.warehouse_id
    where l.id = p_location_id
      and l.warehouse_id = p_warehouse_id
      and l.is_active = true
      and w.is_active = true
      and w.warehouse_type = 'sellable'
  ) then
    raise exception 'Selected location is not an active sellable warehouse location.';
  end if;

  select oi.quantity into v_ordered
  from public.customer_order_items oi
  where oi.id = v_item.order_item_id;

  select coalesce(sum(si.shipment_quantity),0)
  into v_other_allocated
  from public.customer_shipment_items si
  join public.customer_shipments s on s.id = si.shipment_id
  where si.order_item_id = v_item.order_item_id
    and si.id <> v_item.id
    and s.status <> 'cancelled';

  if p_quantity + v_other_allocated > v_ordered then
    raise exception 'Shipment quantity exceeds the remaining order quantity.';
  end if;

  select coalesce(sum(r.remaining_quantity),0)
  into v_reserved_at_source
  from public.customer_order_reservations r
  where r.order_item_id = v_item.order_item_id
    and r.warehouse_id = p_warehouse_id
    and r.location_id = p_location_id
    and r.status = 'active'
    and r.remaining_quantity > 0;

  select coalesce(sum(si.shipment_quantity),0)
  into v_other_source_allocated
  from public.customer_shipment_items si
  join public.customer_shipments s on s.id = si.shipment_id
  where si.order_item_id = v_item.order_item_id
    and si.id <> v_item.id
    and si.source_warehouse_id = p_warehouse_id
    and si.source_location_id = p_location_id
    and s.status in ('draft','picking','packed');

  if p_quantity + v_other_source_allocated > v_reserved_at_source then
    raise exception 'Selected source does not have enough reservation for this order item. Reserved: %, already allocated: %, requested: %.',
      v_reserved_at_source, v_other_source_allocated, p_quantity;
  end if;

  update public.customer_shipment_items
  set shipment_quantity = p_quantity,
      source_warehouse_id = p_warehouse_id,
      source_location_id = p_location_id
  where id = p_shipment_item_id;
end;
$$;

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

  if v_shipment.id is null then raise exception 'Shipment not found.'; end if;
  if v_shipment.status not in ('draft','picking','packed') then
    raise exception 'Only an active unshipped shipment can be shipped.';
  end if;

  if not exists (select 1 from public.customer_shipment_items where shipment_id = p_shipment_id) then
    raise exception 'Shipment has no items.';
  end if;

  if exists (
    select 1
    from public.customer_shipment_items
    where shipment_id = p_shipment_id
      and (product_id is null or order_item_id is null
        or source_warehouse_id is null or source_location_id is null
        or shipment_quantity <= 0)
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
      ),0)
  ) into v_all_fulfilled;

  if v_all_fulfilled then
    perform public.set_customer_order_status(
      v_shipment.order_id, 'shipped',
      'Fully fulfilled by ' || v_shipment.shipment_number
    );
  elsif (
    select status from public.customer_orders where id = v_shipment.order_id
  ) not in ('shipped','delivered','completed') then
    perform public.set_customer_order_status(
      v_shipment.order_id, 'ready_for_shipment',
      'Partially fulfilled by ' || v_shipment.shipment_number
    );
  end if;

  return 'shipped';
end;
$$;

-- Legacy active orders are reconciled in creation order.
-- Any order that cannot be fully reserved is returned to Draft so
-- confirmed always means fully reserved after this migration.
do $$
declare
  v_order record;
  v_old_status text;
begin
  for v_order in
    select id, order_number, status
    from public.customer_orders
    where private.order_status_reserves_stock(status)
    order by created_at, id
  loop
    begin
      perform private.reserve_customer_order_stock(v_order.id);
    exception
      when others then
        if sqlerrm like 'ORDER_STOCK_SHORTAGE:%' then
          v_old_status := v_order.status;

          update public.customer_orders
          set status = 'draft', confirmed_at = null
          where id = v_order.id;

          insert into public.customer_order_status_history (
            order_id, from_status, to_status, note
          ) values (
            v_order.id, v_old_status, 'draft',
            'Automatically returned to Draft while enabling stock reservations: insufficient sellable stock.'
          );
        else
          raise;
        end if;
    end;
  end loop;
end;
$$;
