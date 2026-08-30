begin;

-- A2.2 quantity semantics
-- quantity is physical on-hand stock.
-- available quantity remains quantity - reserved_quantity.
-- LOW_STOCK is computed from quantity - reserved_quantity, never raw on-hand quantity.
create or replace view public.v_stock_overview
with (security_invoker = true)
as
select
  i.id as inventory_id,
  p.id as product_id,
  p.sku,
  p.barcode,
  p.name as product_name,
  p.brand,
  p.category,
  p.unit,
  p.min_stock_level,
  p.status as product_status,
  w.id as warehouse_id,
  w.code as warehouse_code,
  w.name as warehouse_name,
  z.id as zone_id,
  z.code as zone_code,
  z.name as zone_name,
  l.id as location_id,
  l.code as location_code,
  l.name as location_name,
  l.location_type,
  l.qr_code,
  l.aisle,
  l.rack,
  l.shelf,
  l.bin,
  i.quantity,
  i.reserved_quantity,
  i.quantity - i.reserved_quantity as available_quantity,
  case
    when (i.quantity - i.reserved_quantity) <= p.min_stock_level then true
    else false
  end as is_low_stock,
  case
    when (i.quantity - i.reserved_quantity) <= p.min_stock_level then 'LOW_STOCK'::text
    when i.reserved_quantity > 0 then 'PARTIALLY_RESERVED'::text
    else 'OK'::text
  end as stock_status,
  i.created_at,
  i.updated_at
from public.inventory i
join public.products p on p.id = i.product_id
join public.warehouses w on w.id = i.warehouse_id
join public.locations l on l.id = i.location_id
left join public.zones z on z.id = l.zone_id;

-- Stable, server-side inventory discovery. Keep legacy search_stock for callers that
-- have not migrated yet; new Admin inventory surfaces use this paginated contract.
create or replace function public.search_stock_page(
  p_query text default '',
  p_warehouse_id uuid default null,
  p_zone_id uuid default null,
  p_location_id uuid default null,
  p_stock_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table(
  inventory_id uuid,
  product_id uuid,
  sku text,
  barcode text,
  product_name text,
  brand text,
  category text,
  warehouse_id uuid,
  warehouse_code text,
  warehouse_name text,
  zone_id uuid,
  zone_code text,
  zone_name text,
  location_id uuid,
  location_code text,
  location_name text,
  qr_code text,
  quantity numeric,
  reserved_quantity numeric,
  available_quantity numeric,
  stock_status text,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      v.inventory_id,
      v.product_id,
      v.sku,
      v.barcode,
      v.product_name,
      v.brand,
      v.category,
      v.warehouse_id,
      v.warehouse_code,
      v.warehouse_name,
      v.zone_id,
      v.zone_code,
      v.zone_name,
      v.location_id,
      v.location_code,
      v.location_name,
      v.qr_code,
      v.quantity,
      v.reserved_quantity,
      v.available_quantity,
      v.stock_status
    from public.v_stock_overview v
    where
      (
        coalesce(p_query, '') = ''
        or v.sku ilike '%' || p_query || '%'
        or v.barcode ilike '%' || p_query || '%'
        or v.product_name ilike '%' || p_query || '%'
        or v.brand ilike '%' || p_query || '%'
        or v.category ilike '%' || p_query || '%'
        or v.warehouse_code ilike '%' || p_query || '%'
        or v.warehouse_name ilike '%' || p_query || '%'
        or v.zone_code ilike '%' || p_query || '%'
        or v.zone_name ilike '%' || p_query || '%'
        or v.location_code ilike '%' || p_query || '%'
        or v.location_name ilike '%' || p_query || '%'
        or v.qr_code ilike '%' || p_query || '%'
      )
      and (p_warehouse_id is null or v.warehouse_id = p_warehouse_id)
      and (p_zone_id is null or v.zone_id = p_zone_id)
      and (p_location_id is null or v.location_id = p_location_id)
      and (p_stock_status is null or upper(v.stock_status) = upper(p_stock_status))
  )
  select
    f.inventory_id,
    f.product_id,
    f.sku,
    f.barcode,
    f.product_name,
    f.brand,
    f.category,
    f.warehouse_id,
    f.warehouse_code,
    f.warehouse_name,
    f.zone_id,
    f.zone_code,
    f.zone_name,
    f.location_id,
    f.location_code,
    f.location_name,
    f.qr_code,
    f.quantity,
    f.reserved_quantity,
    f.available_quantity,
    f.stock_status,
    count(*) over () as total_count
  from filtered f
  order by f.sku asc, f.location_code asc, f.inventory_id asc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_stock_page(text, uuid, uuid, uuid, text, integer, integer) from public;
grant execute on function public.search_stock_page(text, uuid, uuid, uuid, text, integer, integer) to authenticated, service_role;

-- Append-safe ledger metadata. Historical movements remain valid with null
-- idempotency/reversal metadata; all new idempotent operations populate them.
alter table public.inventory_movements
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint jsonb,
  add column if not exists reversal_of_movement_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inventory_movements'::regclass
      and conname = 'inventory_movements_reversal_of_movement_id_fkey'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_reversal_of_movement_id_fkey
      foreign key (reversal_of_movement_id)
      references public.inventory_movements(id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists inventory_movements_idempotency_key_uq
  on public.inventory_movements(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists inventory_movements_reversal_once_uq
  on public.inventory_movements(reversal_of_movement_id)
  where reversal_of_movement_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inventory_movements'::regclass
      and conname = 'inventory_movements_reason_required'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_reason_required
      check (reason is not null and btrim(reason) <> '') not valid;
    alter table public.inventory_movements
      validate constraint inventory_movements_reason_required;
  end if;
end;
$$;

comment on column public.inventory_movements.reason is
  'Required audit reason describing why the stock mutation occurred.';
comment on column public.inventory_movements.reference_no is
  'Optional external reference_no used to trace the movement to an order, receipt, transfer, or operational reference.';
comment on column public.inventory_movements.idempotency_key is
  'Client-generated UUID reused only when retrying the same logical stock operation.';
comment on column public.inventory_movements.request_fingerprint is
  'Canonical server-generated request fingerprint used to reject idempotency-key reuse with a changed payload.';
comment on column public.inventory_movements.reversal_of_movement_id is
  'Links a compensating movement to the immutable movement it reverses.';

-- No posted movement may be edited or deleted. Corrections are compensating rows.
create or replace function public.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'inventory_movements is append-only; create a reversal/correction movement instead';
end;
$$;

drop trigger if exists inventory_movements_append_only on public.inventory_movements;
create trigger inventory_movements_append_only before update or delete on public.inventory_movements
for each row execute function public.prevent_inventory_movement_mutation();

drop policy if exists inventory_movements_update_admin_only on public.inventory_movements;
drop policy if exists inventory_movements_delete_super_admin_only on public.inventory_movements;
revoke update, delete on table public.inventory_movements from authenticated, anon;

-- STOCK IN ---------------------------------------------------------------
create or replace function public.stock_in_idempotent(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_reference_no text default null,
  p_reason text default 'Stock in',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_manage_inventory() then
    raise exception 'Permission denied: stock_in_idempotent requires admin or warehouse role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if v_reason = '' then raise exception 'Reason is required'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'stock_in', 'product_id', p_product_id, 'warehouse_id', p_warehouse_id,
    'location_id', p_location_id, 'quantity', p_quantity, 'reference_no', v_reference_no,
    'reason', v_reason, 'notes', v_notes
  );

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  insert into public.inventory (product_id, warehouse_id, location_id, quantity, reserved_quantity, notes)
  values (p_product_id, p_warehouse_id, p_location_id, p_quantity, 0, v_notes)
  on conflict (product_id, warehouse_id, location_id)
  do update set quantity = public.inventory.quantity + excluded.quantity,
                notes = coalesce(excluded.notes, public.inventory.notes);

  insert into public.inventory_movements (
    product_id, to_warehouse_id, to_location_id, movement_type, quantity,
    reference_no, reason, notes, created_by, idempotency_key, request_fingerprint
  ) values (
    p_product_id, p_warehouse_id, p_location_id, 'in', p_quantity,
    v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- STOCK OUT --------------------------------------------------------------
create or replace function public.stock_out_idempotent(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_reference_no text default null,
  p_reason text default 'Stock out',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_available_quantity numeric;
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_operate_stock() then
    raise exception 'Permission denied: stock_out_idempotent requires stock operator role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if v_reason = '' then raise exception 'Reason is required'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'stock_out', 'product_id', p_product_id, 'warehouse_id', p_warehouse_id,
    'location_id', p_location_id, 'quantity', p_quantity, 'reference_no', v_reference_no,
    'reason', v_reason, 'notes', v_notes
  );

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  select quantity - reserved_quantity into v_available_quantity
  from public.inventory
  where product_id = p_product_id and warehouse_id = p_warehouse_id and location_id = p_location_id
  for update;

  if v_available_quantity is null then raise exception 'Inventory record not found'; end if;
  if v_available_quantity < p_quantity then
    raise exception 'Insufficient available stock. Available: %, requested: %', v_available_quantity, p_quantity;
  end if;

  update public.inventory
  set quantity = quantity - p_quantity, notes = coalesce(v_notes, notes)
  where product_id = p_product_id and warehouse_id = p_warehouse_id and location_id = p_location_id;

  insert into public.inventory_movements (
    product_id, from_warehouse_id, from_location_id, movement_type, quantity,
    reference_no, reason, notes, created_by, idempotency_key, request_fingerprint
  ) values (
    p_product_id, p_warehouse_id, p_location_id, 'out', p_quantity,
    v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- TRANSFER ---------------------------------------------------------------
create or replace function public.stock_transfer_idempotent(
  p_product_id uuid,
  p_from_warehouse_id uuid,
  p_from_location_id uuid,
  p_to_warehouse_id uuid,
  p_to_location_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_reference_no text default null,
  p_reason text default 'Stock transfer',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_available_quantity numeric;
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_manage_inventory() then
    raise exception 'Permission denied: stock_transfer_idempotent requires admin or warehouse role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_from_location_id = p_to_location_id then raise exception 'Source and target locations cannot be the same'; end if;
  if v_reason = '' then raise exception 'Reason is required'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'stock_transfer', 'product_id', p_product_id,
    'from_warehouse_id', p_from_warehouse_id, 'from_location_id', p_from_location_id,
    'to_warehouse_id', p_to_warehouse_id, 'to_location_id', p_to_location_id,
    'quantity', p_quantity, 'reference_no', v_reference_no, 'reason', v_reason, 'notes', v_notes
  );

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  select quantity - reserved_quantity into v_available_quantity
  from public.inventory
  where product_id = p_product_id and warehouse_id = p_from_warehouse_id and location_id = p_from_location_id
  for update;

  if v_available_quantity is null then raise exception 'Source inventory record not found'; end if;
  if v_available_quantity < p_quantity then
    raise exception 'Insufficient available stock. Available: %, requested: %', v_available_quantity, p_quantity;
  end if;

  update public.inventory
  set quantity = quantity - p_quantity, notes = coalesce(v_notes, notes)
  where product_id = p_product_id and warehouse_id = p_from_warehouse_id and location_id = p_from_location_id;

  insert into public.inventory (product_id, warehouse_id, location_id, quantity, reserved_quantity, notes)
  values (p_product_id, p_to_warehouse_id, p_to_location_id, p_quantity, 0, v_notes)
  on conflict (product_id, warehouse_id, location_id)
  do update set quantity = public.inventory.quantity + excluded.quantity,
                notes = coalesce(excluded.notes, public.inventory.notes);

  insert into public.inventory_movements (
    product_id, from_warehouse_id, from_location_id, to_warehouse_id, to_location_id,
    movement_type, quantity, reference_no, reason, notes, created_by,
    idempotency_key, request_fingerprint
  ) values (
    p_product_id, p_from_warehouse_id, p_from_location_id, p_to_warehouse_id, p_to_location_id,
    'transfer', p_quantity, v_reference_no, v_reason, v_notes, auth.uid(),
    p_idempotency_key, v_request_fingerprint
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- RESERVE ----------------------------------------------------------------
create or replace function public.reserve_stock_idempotent(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_reference_no text default null,
  p_reason text default 'Stock reservation',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_available_quantity numeric;
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_operate_stock() then
    raise exception 'Permission denied: reserve_stock_idempotent requires stock operator role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if v_reason = '' then raise exception 'Reason is required'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'reserve_stock', 'product_id', p_product_id, 'warehouse_id', p_warehouse_id,
    'location_id', p_location_id, 'quantity', p_quantity, 'reference_no', v_reference_no,
    'reason', v_reason, 'notes', v_notes
  );

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  select quantity - reserved_quantity into v_available_quantity
  from public.inventory
  where product_id = p_product_id and warehouse_id = p_warehouse_id and location_id = p_location_id
  for update;

  if v_available_quantity is null then raise exception 'Inventory record not found'; end if;
  if v_available_quantity < p_quantity then
    raise exception 'Insufficient available stock. Available: %, requested: %', v_available_quantity, p_quantity;
  end if;

  update public.inventory
  set reserved_quantity = reserved_quantity + p_quantity, notes = coalesce(v_notes, notes)
  where product_id = p_product_id and warehouse_id = p_warehouse_id and location_id = p_location_id;

  insert into public.inventory_movements (
    product_id, from_warehouse_id, from_location_id, movement_type, quantity,
    reference_no, reason, notes, created_by, idempotency_key, request_fingerprint
  ) values (
    p_product_id, p_warehouse_id, p_location_id, 'reservation', p_quantity,
    v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- RELEASE ----------------------------------------------------------------
create or replace function public.release_stock_idempotent(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_reference_no text default null,
  p_reason text default 'Stock reservation release',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_reserved_quantity numeric;
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_operate_stock() then
    raise exception 'Permission denied: release_stock_idempotent requires stock operator role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if v_reason = '' then raise exception 'Reason is required'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'release_stock', 'product_id', p_product_id, 'warehouse_id', p_warehouse_id,
    'location_id', p_location_id, 'quantity', p_quantity, 'reference_no', v_reference_no,
    'reason', v_reason, 'notes', v_notes
  );

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  select reserved_quantity into v_reserved_quantity
  from public.inventory
  where product_id = p_product_id and warehouse_id = p_warehouse_id and location_id = p_location_id
  for update;

  if v_reserved_quantity is null then raise exception 'Inventory record not found'; end if;
  if v_reserved_quantity < p_quantity then
    raise exception 'Release quantity cannot be greater than reserved quantity. Reserved: %, requested: %', v_reserved_quantity, p_quantity;
  end if;

  update public.inventory
  set reserved_quantity = reserved_quantity - p_quantity, notes = coalesce(v_notes, notes)
  where product_id = p_product_id and warehouse_id = p_warehouse_id and location_id = p_location_id;

  insert into public.inventory_movements (
    product_id, from_warehouse_id, from_location_id, movement_type, quantity,
    reference_no, reason, notes, created_by, idempotency_key, request_fingerprint
  ) values (
    p_product_id, p_warehouse_id, p_location_id, 'release', p_quantity,
    v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- REVERSAL / CORRECTION ---------------------------------------------------
-- Posted movements stay immutable. A correction creates one compensating movement
-- linked through reversal_of_movement_id. Ambiguous legacy adjustment/return/damage
-- semantics are deliberately rejected instead of guessed.
create or replace function public.reverse_inventory_movement(
  p_movement_id uuid,
  p_idempotency_key uuid,
  p_reason text,
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_original public.inventory_movements%rowtype;
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_existing_reversal_id uuid;
  v_available_quantity numeric;
  v_reserved_quantity numeric;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_manage_inventory() then
    raise exception 'Permission denied: reverse_inventory_movement requires admin or warehouse role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if v_reason = '' then raise exception 'Reason is required for movement reversal'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'reverse_inventory_movement', 'movement_id', p_movement_id,
    'reference_no', v_reference_no, 'reason', v_reason, 'notes', v_notes
  );

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  select * into v_original
  from public.inventory_movements
  where id = p_movement_id
  for update;
  if not found then raise exception 'Movement not found'; end if;
  if v_original.reversal_of_movement_id is not null then
    raise exception 'A reversal movement cannot itself be reversed';
  end if;

  select id into v_existing_reversal_id
  from public.inventory_movements
  where reversal_of_movement_id = p_movement_id;
  if found then raise exception 'Movement has already been reversed by %', v_existing_reversal_id; end if;

  v_reference_no := coalesce(v_reference_no, v_original.reference_no);

  case v_original.movement_type
    when 'in' then
      select quantity - reserved_quantity into v_available_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id
      for update;
      if v_available_quantity is null or v_available_quantity < v_original.quantity then
        raise exception 'Cannot reverse stock in: insufficient available stock at original target';
      end if;
      update public.inventory
      set quantity = quantity - v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id;
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.to_warehouse_id, v_original.to_location_id, 'out', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'out' then
      insert into public.inventory (product_id, warehouse_id, location_id, quantity, reserved_quantity, notes)
      values (v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, v_original.quantity, 0, v_notes)
      on conflict (product_id, warehouse_id, location_id)
      do update set quantity = public.inventory.quantity + excluded.quantity,
                    notes = coalesce(excluded.notes, public.inventory.notes);
      insert into public.inventory_movements (
        product_id, to_warehouse_id, to_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, 'in', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'transfer' then
      select quantity - reserved_quantity into v_available_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id
      for update;
      if v_available_quantity is null or v_available_quantity < v_original.quantity then
        raise exception 'Cannot reverse transfer: insufficient available stock at original target';
      end if;
      update public.inventory
      set quantity = quantity - v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id;
      insert into public.inventory (product_id, warehouse_id, location_id, quantity, reserved_quantity, notes)
      values (v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, v_original.quantity, 0, v_notes)
      on conflict (product_id, warehouse_id, location_id)
      do update set quantity = public.inventory.quantity + excluded.quantity,
                    notes = coalesce(excluded.notes, public.inventory.notes);
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, to_warehouse_id, to_location_id,
        movement_type, quantity, reference_no, reason, notes, created_by,
        idempotency_key, request_fingerprint, reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.to_warehouse_id, v_original.to_location_id,
        v_original.from_warehouse_id, v_original.from_location_id, 'transfer', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'reservation' then
      select reserved_quantity into v_reserved_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id
      for update;
      if v_reserved_quantity is null or v_reserved_quantity < v_original.quantity then
        raise exception 'Cannot reverse reservation: reserved quantity is no longer sufficient';
      end if;
      update public.inventory
      set reserved_quantity = reserved_quantity - v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id;
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, 'release', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'release' then
      select quantity - reserved_quantity into v_available_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id
      for update;
      if v_available_quantity is null or v_available_quantity < v_original.quantity then
        raise exception 'Cannot reverse reservation release: available quantity is no longer sufficient';
      end if;
      update public.inventory
      set reserved_quantity = reserved_quantity + v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id;
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, 'reservation', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    else
      raise exception 'Movement type % does not have an unambiguous automatic reversal contract', v_original.movement_type;
  end case;

  return v_movement_id;
end;
$$;

revoke all on function public.stock_in_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) from public;
revoke all on function public.stock_out_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) from public;
revoke all on function public.stock_transfer_idempotent(uuid, uuid, uuid, uuid, uuid, numeric, uuid, text, text, text) from public;
revoke all on function public.reserve_stock_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) from public;
revoke all on function public.release_stock_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) from public;
revoke all on function public.reverse_inventory_movement(uuid, uuid, text, text, text) from public;

grant execute on function public.stock_in_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.stock_out_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.stock_transfer_idempotent(uuid, uuid, uuid, uuid, uuid, numeric, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.reserve_stock_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.release_stock_idempotent(uuid, uuid, uuid, numeric, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.reverse_inventory_movement(uuid, uuid, text, text, text) to authenticated, service_role;

commit;
