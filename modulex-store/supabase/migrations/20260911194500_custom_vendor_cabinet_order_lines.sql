-- Productless Vendor Cabinet order lines.
-- A Vendor Cabinet line represents one externally quoted cabinet package without
-- manufacturing a Product record. Vendor cost/markup stay internal while the
-- normal Order subtotal, Administrative Fee, tax and lifecycle remain authoritative.

alter table public.customer_order_items
  add column if not exists vendor_id uuid,
  add column if not exists vendor_name_snapshot text,
  add column if not exists manual_cost_amount numeric(18,4),
  add column if not exists manual_markup_percent numeric(7,3),
  add column if not exists source_document_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_vendor_id_fkey'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_source_document_id_fkey'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_source_document_id_fkey
      foreign key (source_document_id) references public.entity_documents(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_custom_vendor_cabinet_shape'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_custom_vendor_cabinet_shape
      check (
        coalesce(pricing_model_snapshot, '') <> 'manual_vendor_cabinet'
        or (
          product_id is null
          and vendor_id is not null
          and nullif(btrim(coalesce(vendor_name_snapshot, '')), '') is not null
          and source_document_id is not null
          and manual_cost_amount is not null and manual_cost_amount >= 0
          and manual_markup_percent is not null and manual_markup_percent between 0 and 1000
          and nullif(btrim(coalesce(display_name_override, '')), '') is not null
          and quantity = 1
          and discount_percent = 0
          and price_source = 'manual'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_vendor_metadata_scope'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_vendor_metadata_scope
      check (
        coalesce(pricing_model_snapshot, '') = 'manual_vendor_cabinet'
        or (
          vendor_id is null
          and vendor_name_snapshot is null
          and manual_cost_amount is null
          and manual_markup_percent is null
          and source_document_id is null
        )
      );
  end if;
end;
$$;

comment on column public.customer_order_items.vendor_id is
  'Canonical Vendor for a productless manual_vendor_cabinet line.';
comment on column public.customer_order_items.vendor_name_snapshot is
  'Immutable Vendor display-name snapshot for a manual_vendor_cabinet line.';
comment on column public.customer_order_items.manual_cost_amount is
  'Internal quoted total cost for a manual_vendor_cabinet line before Order confirmation.';
comment on column public.customer_order_items.manual_markup_percent is
  'Internal markup percent used to derive the customer sell price for a manual_vendor_cabinet line.';
comment on column public.customer_order_items.source_document_id is
  'Private Order PDF that is the source evidence for a manual_vendor_cabinet line.';

create index if not exists customer_order_items_vendor_id_idx
  on public.customer_order_items(vendor_id)
  where vendor_id is not null;
create index if not exists customer_order_items_source_document_id_idx
  on public.customer_order_items(source_document_id)
  where source_document_id is not null;

-- The ordinary item guard remains authoritative for Product-backed lines. The
-- custom path is accepted only when its distinct pricing marker is present; the
-- creation RPC separately gates INSERT with a transaction-local setting.
create or replace function private.guard_customer_order_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_status text;
  v_price_group_id uuid;
  v_currency_code text;
  v_group_price numeric;
  v_expected_sell numeric(18,4);
begin
  if coalesce(new.pricing_model_snapshot, '') = 'manual_vendor_cabinet' then
    if tg_op = 'INSERT'
       and coalesce(current_setting('modulex.custom_vendor_cabinet_line', true), '') <> 'on' then
      raise exception 'Vendor Cabinet lines must be created through the guarded Order workflow.';
    end if;
    if new.product_id is not null then
      raise exception 'Vendor Cabinet lines cannot reference a Product.';
    end if;
    if new.quantity is distinct from 1::numeric then
      raise exception 'Vendor Cabinet quantity must be exactly 1.';
    end if;
    if new.discount_percent is distinct from 0::numeric then
      raise exception 'Vendor Cabinet line discount must be zero; use the Order discount instead.';
    end if;
    if new.manual_cost_amount is null or new.manual_cost_amount < 0 then
      raise exception 'Vendor Cabinet Total Cost must be zero or greater.';
    end if;
    if new.manual_markup_percent is null or new.manual_markup_percent < 0 or new.manual_markup_percent > 1000 then
      raise exception 'Vendor Cabinet Markup must be between 0 and 1000.';
    end if;
    if new.vendor_id is null or new.source_document_id is null then
      raise exception 'Vendor Cabinet Vendor and source PDF are required.';
    end if;
    if nullif(btrim(coalesce(new.display_name_override, '')), '') is null then
      raise exception 'Vendor Cabinet Line Name is required.';
    end if;
    v_expected_sell := round(new.manual_cost_amount * (1 + new.manual_markup_percent / 100), 4);
    new.unit_price := v_expected_sell;
    new.price_source := 'manual';
    return new;
  end if;

  if new.product_id is null then
    raise exception 'Product is required for every order line.';
  end if;
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Order item quantity must be greater than zero.';
  end if;
  if new.unit_price is null or new.unit_price < 0 then
    raise exception 'Unit price cannot be negative.';
  end if;
  if new.discount_percent is null or new.discount_percent < 0 or new.discount_percent > 100 then
    raise exception 'Line discount must be between 0 and 100.';
  end if;

  select p.status
  into v_product_status
  from public.products p
  where p.id = new.product_id
    and p.status <> 'archived';

  if v_product_status is null then
    raise exception 'Product does not exist or is archived.';
  end if;

  select o.price_group_id, o.currency_code
  into v_price_group_id, v_currency_code
  from public.customer_orders o
  where o.id = new.order_id;

  if v_price_group_id is null then
    raise exception 'Order price group could not be resolved.';
  end if;

  select pp.amount
  into v_group_price
  from public.product_prices pp
  where pp.product_id = new.product_id
    and pp.price_group_id = v_price_group_id
    and pp.currency_code = v_currency_code
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc, pp.created_at desc
  limit 1;

  new.price_source := case
    when v_group_price is not null
      and round(new.unit_price, 4) = round(v_group_price, 4)
      then 'price_group'
    else 'manual'
  end;

  return new;
end;
$$;

create or replace function private.enforce_customer_order_item_pricing_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_product public.products%rowtype;
  v_type public.product_types%rowtype;
  v_uom public.units_of_measure%rowtype;
  v_price numeric;
  v_expected_sell numeric(18,4);
begin
  select * into v_order
  from public.customer_orders
  where id = new.order_id;

  if v_order.id is null then
    raise exception 'Customer order does not exist.';
  end if;

  if coalesce(new.pricing_model_snapshot, '') = 'manual_vendor_cabinet' then
    if tg_op = 'INSERT'
       and coalesce(current_setting('modulex.custom_vendor_cabinet_line', true), '') <> 'on' then
      raise exception 'Vendor Cabinet lines must be created through the guarded Order workflow.';
    end if;
    if new.product_id is not null then raise exception 'Vendor Cabinet lines cannot reference a Product.'; end if;
    if new.quantity is distinct from 1::numeric then raise exception 'Vendor Cabinet quantity must be exactly 1.'; end if;
    if new.discount_percent is distinct from 0::numeric then raise exception 'Vendor Cabinet line discount must be zero.'; end if;
    if new.manual_cost_amount is null or new.manual_cost_amount < 0 then raise exception 'Vendor Cabinet Total Cost must be zero or greater.'; end if;
    if new.manual_markup_percent is null or new.manual_markup_percent < 0 or new.manual_markup_percent > 1000 then raise exception 'Vendor Cabinet Markup must be between 0 and 1000.'; end if;
    if new.vendor_id is null or new.source_document_id is null then raise exception 'Vendor Cabinet Vendor and source PDF are required.'; end if;
    if nullif(btrim(coalesce(new.vendor_name_snapshot, '')), '') is null then raise exception 'Vendor Cabinet Vendor snapshot is required.'; end if;
    if nullif(btrim(coalesce(new.display_name_override, '')), '') is null then raise exception 'Vendor Cabinet Line Name is required.'; end if;

    v_expected_sell := round(new.manual_cost_amount * (1 + new.manual_markup_percent / 100), 4);
    new.sku_snapshot := 'VENDOR-CABINET';
    new.product_name_snapshot := btrim(new.display_name_override);
    new.display_name_override := btrim(new.display_name_override);
    new.vendor_name_snapshot := btrim(new.vendor_name_snapshot);
    new.product_type_code_snapshot := 'CUSTOM_VENDOR_CABINET';
    new.product_type_name_snapshot := 'Vendor Cabinet';
    new.uom_code_snapshot := 'JOB';
    new.uom_name_snapshot := 'Job';
    new.pricing_model_snapshot := 'manual_vendor_cabinet';
    new.line_note := null;
    new.quantity := 1;
    new.unit_price := v_expected_sell;
    new.discount_percent := 0;
    new.price_source := 'manual';
    new.countertop_reservation_quantity := null;
    new.line_subtotal := v_expected_sell;
    new.discount_amount := 0;
    new.line_total := v_expected_sell;
    return new;
  end if;

  select * into v_product
  from public.products
  where id = new.product_id
    and status <> 'archived';

  if v_product.id is null then
    raise exception 'Product does not exist or is archived.';
  end if;

  select * into v_type
  from public.product_types
  where id = v_product.product_type_id;

  select * into v_uom
  from public.units_of_measure
  where id = v_product.uom_id;

  if v_type.id is null or v_uom.id is null then
    raise exception 'Product Type and UOM are required for customer order lines.';
  end if;

  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    new.sku_snapshot := v_product.sku;
    new.product_name_snapshot := v_product.name;
    new.product_type_code_snapshot := v_type.code;
    new.product_type_name_snapshot := v_type.name;
    new.uom_code_snapshot := v_uom.code;
    new.uom_name_snapshot := v_uom.name;
    new.pricing_model_snapshot := v_type.pricing_model;
  else
    new.sku_snapshot := old.sku_snapshot;
    new.product_name_snapshot := old.product_name_snapshot;
    new.product_type_code_snapshot := old.product_type_code_snapshot;
    new.product_type_name_snapshot := old.product_type_name_snapshot;
    new.uom_code_snapshot := old.uom_code_snapshot;
    new.uom_name_snapshot := old.uom_name_snapshot;
    new.pricing_model_snapshot := old.pricing_model_snapshot;
  end if;

  if v_type.pricing_model = 'manual_service' then
    if v_type.code <> 'SERVICE' or v_product.sku <> 'SERVICE' then
      raise exception 'Manual unit price is only accepted for the canonical SERVICE manual_service product.';
    end if;
    if not v_type.is_active or v_product.status::text <> 'active' or not v_uom.is_active then
      raise exception 'Manual Service product, Product Type, and UOM must be active.';
    end if;
    if nullif(btrim(coalesce(new.line_note, '')), '') is null then
      raise exception 'Service detail is required.';
    end if;
    if new.quantity <> 1 then raise exception 'Manual Service quantity must be exactly 1.'; end if;
    if new.unit_price is null or new.unit_price < 0 then raise exception 'Manual Service price must be explicit and nonnegative.'; end if;
    new.line_note := btrim(new.line_note);
    new.price_source := 'manual';
    new.countertop_reservation_quantity := null;
    new.line_subtotal := round(new.quantity * new.unit_price, 4);
    new.discount_amount := round(new.line_subtotal * (new.discount_percent / 100), 4);
    new.line_total := round(new.line_subtotal - new.discount_amount, 4);
    return new;
  end if;

  if nullif(btrim(coalesce(new.line_note, '')), '') is not null then
    raise exception 'Line note is only supported for manual Service lines.';
  end if;
  new.line_note := null;

  if v_type.pricing_model = 'countertop_material_band' then
    if (
      tg_op = 'INSERT'
      or new.order_id is distinct from old.order_id
      or new.product_id is distinct from old.product_id
      or new.quantity is distinct from old.quantity
      or new.unit_price is distinct from old.unit_price
      or new.discount_percent is distinct from old.discount_percent
      or new.discount_amount is distinct from old.discount_amount
      or new.line_subtotal is distinct from old.line_subtotal
      or new.line_total is distinct from old.line_total
      or new.price_source is distinct from old.price_source
      or new.countertop_reservation_quantity is distinct from old.countertop_reservation_quantity
    ) and not exists (
      select 1
      from private.countertop_order_pricing_gate
      where backend_pid = pg_backend_pid()
        and transaction_id = txid_current()
        and order_item_id = new.id
    ) then
      raise exception 'Countertop Material Band products must be configured in the Countertop workspace.';
    end if;
    return new;
  elsif v_type.pricing_model = 'none' then
    raise exception 'No Commercial Pricing products cannot be added to customer orders.';
  elsif v_type.pricing_model <> 'price_group' then
    raise exception 'Unsupported Product Type pricing route.';
  end if;

  select pp.amount
  into v_price
  from public.product_prices pp
  where pp.product_id = new.product_id
    and pp.price_group_id = v_order.price_group_id
    and pp.currency_code = v_order.currency_code
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc, pp.created_at desc
  limit 1;

  if v_price is null then
    raise exception 'No current Price Group price exists for this product.';
  end if;

  new.unit_price := round(v_price, 4);
  new.price_source := 'price_group';
  new.line_subtotal := round(new.quantity * new.unit_price, 4);
  new.discount_amount := round(new.line_subtotal * (new.discount_percent / 100), 4);
  new.line_total := round(new.line_subtotal - new.discount_amount, 4);
  return new;
end;
$$;

create or replace function private.apply_customer_order_item_cost_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_currency text;
  v_confirmed_at timestamptz;
  v_cost record;
begin
  select upper(co.currency_code::text), co.confirmed_at
  into v_currency, v_confirmed_at
  from public.customer_orders co
  where co.id = new.order_id;

  if not found then return new; end if;

  if coalesce(new.pricing_model_snapshot, '') = 'manual_vendor_cabinet' then
    if v_confirmed_at is null then
      new.unit_cost_snapshot := null;
      new.cost_currency_code := null;
      new.cost_snapshot_at := null;
      new.cost_source := null;
      new.cost_source_id := null;
      return new;
    end if;

    if tg_op = 'UPDATE' and old.unit_cost_snapshot is not null then
      new.unit_cost_snapshot := old.unit_cost_snapshot;
      new.cost_currency_code := old.cost_currency_code;
      new.cost_snapshot_at := old.cost_snapshot_at;
      new.cost_source := old.cost_source;
      new.cost_source_id := old.cost_source_id;
      return new;
    end if;

    new.unit_cost_snapshot := new.manual_cost_amount;
    new.cost_currency_code := v_currency;
    new.cost_snapshot_at := v_confirmed_at;
    new.cost_source := 'manual_vendor_cabinet';
    new.cost_source_id := null;
    return new;
  end if;

  if v_confirmed_at is null then
    if tg_op = 'UPDATE' then
      if old.unit_cost_snapshot is not null
         and new.product_id is not distinct from old.product_id
         and new.order_id is not distinct from old.order_id then
        new.unit_cost_snapshot := old.unit_cost_snapshot;
        new.cost_currency_code := old.cost_currency_code;
        new.cost_snapshot_at := old.cost_snapshot_at;
        new.cost_source := old.cost_source;
        new.cost_source_id := old.cost_source_id;
        return new;
      end if;
    end if;
    new.unit_cost_snapshot := null;
    new.cost_currency_code := null;
    new.cost_snapshot_at := null;
    new.cost_source := null;
    new.cost_source_id := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.unit_cost_snapshot is not null
       and new.product_id is not distinct from old.product_id
       and new.order_id is not distinct from old.order_id then
      new.unit_cost_snapshot := old.unit_cost_snapshot;
      new.cost_currency_code := old.cost_currency_code;
      new.cost_snapshot_at := old.cost_snapshot_at;
      new.cost_source := old.cost_source;
      new.cost_source_id := old.cost_source_id;
      return new;
    end if;
  end if;

  select r.* into v_cost
  from private.resolve_cost_price(new.product_id, v_currency, v_confirmed_at) r
  limit 1;

  if v_cost.source_price_id is null then
    new.unit_cost_snapshot := null;
    new.cost_currency_code := null;
    new.cost_snapshot_at := null;
    new.cost_source := null;
    new.cost_source_id := null;
  else
    new.unit_cost_snapshot := v_cost.unit_cost;
    new.cost_currency_code := v_cost.currency_code;
    new.cost_snapshot_at := v_confirmed_at;
    new.cost_source := v_cost.source_type;
    new.cost_source_id := v_cost.source_price_id;
  end if;
  return new;
end;
$$;

create or replace function private.reserve_order_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if new.pricing_model_snapshot in ('manual_service', 'manual_vendor_cabinet') then
    return new;
  end if;
  select status into v_status from public.customer_orders where id = new.order_id;
  if private.order_status_reserves_stock(v_status) then
    perform private.reserve_customer_order_item_stock(new.id);
  end if;
  return new;
end;
$$;

create or replace function private.release_order_item_reservation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.pricing_model_snapshot in ('manual_service', 'manual_vendor_cabinet') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    perform private.release_customer_order_item_stock(old.id, 'Order item removed');
    return old;
  end if;
  if old.product_id is distinct from new.product_id or old.quantity is distinct from new.quantity then
    perform private.release_customer_order_item_stock(old.id, 'Order item changed');
  end if;
  return new;
end;
$$;

create or replace function private.guard_custom_vendor_cabinet_line_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.pricing_model_snapshot, '') = 'manual_vendor_cabinet'
     and coalesce(current_setting('modulex.custom_vendor_cabinet_line_delete', true), '') <> 'on' then
    raise exception 'Vendor Cabinet lines are historical Order evidence and cannot be removed through generic Order editing.';
  end if;
  return old;
end;
$$;

drop trigger if exists customer_order_items_custom_vendor_cabinet_delete_guard on public.customer_order_items;
create trigger customer_order_items_custom_vendor_cabinet_delete_guard
before delete on public.customer_order_items
for each row execute function private.guard_custom_vendor_cabinet_line_delete();

create or replace function private.guard_custom_vendor_cabinet_document_deactivation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.is_active = true and new.is_active = false and exists (
    select 1
    from public.customer_order_items oi
    where oi.source_document_id = old.id
      and oi.pricing_model_snapshot = 'manual_vendor_cabinet'
  ) then
    raise exception 'Vendor Cabinet source PDFs cannot be deactivated while referenced by an Order line.';
  end if;
  return new;
end;
$$;

drop trigger if exists entity_documents_custom_vendor_cabinet_source_guard on public.entity_documents;
create trigger entity_documents_custom_vendor_cabinet_source_guard
before update of is_active on public.entity_documents
for each row execute function private.guard_custom_vendor_cabinet_document_deactivation();

create or replace function private.create_custom_vendor_cabinet_order_line_v1(
  p_order_id uuid,
  p_vendor_id uuid,
  p_line_name text,
  p_total_cost numeric,
  p_markup_percent numeric,
  p_document_id uuid,
  p_order_discount_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_vendor record;
  v_document public.entity_documents%rowtype;
  v_line_name text := nullif(btrim(coalesce(p_line_name, '')), '');
  v_cost numeric(18,4);
  v_markup numeric(7,3);
  v_sell numeric(18,4);
  v_line_no integer;
  v_item_id uuid;
  v_discount numeric(18,4);
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to create Vendor Cabinet order lines.' using errcode = '42501';
  end if;
  if p_order_id is null or p_vendor_id is null or p_document_id is null then
    raise exception 'Order, Vendor and Vendor PDF are required.' using errcode = '22023';
  end if;
  if v_line_name is null or char_length(v_line_name) > 160 then
    raise exception 'Vendor Cabinet Line Name must contain 1 to 160 characters.' using errcode = '22023';
  end if;
  if p_total_cost is null or p_total_cost < 0 then
    raise exception 'Vendor Cabinet Total Cost must be zero or greater.' using errcode = '22023';
  end if;
  if p_markup_percent is null or p_markup_percent < 0 or p_markup_percent > 1000 then
    raise exception 'Vendor Cabinet Markup must be between 0 and 1000.' using errcode = '22023';
  end if;
  if p_order_discount_amount is null or p_order_discount_amount < 0 then
    raise exception 'Order discount cannot be negative.' using errcode = '22023';
  end if;

  select * into v_order
  from public.customer_orders o
  where o.id = p_order_id
  for update;
  if v_order.id is null then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if v_order.status <> 'draft' then
    raise exception 'Vendor Cabinet lines can only be added while the Order is Draft.' using errcode = '55000';
  end if;

  select v.id, v.code, v.legal_name, v.display_name
  into v_vendor
  from public.vendors v
  where v.id = p_vendor_id and v.status = 'active';
  if v_vendor.id is null then
    raise exception 'Vendor does not exist or is not active.' using errcode = '22023';
  end if;

  select * into v_document
  from public.entity_documents d
  where d.id = p_document_id
    and d.is_active = true
    and d.entity_type = 'order'
    and d.entity_id = p_order_id
    and lower(d.mime_type) = 'application/pdf';
  if v_document.id is null then
    raise exception 'Vendor PDF must be an active private document registered to this Order.' using errcode = '22023';
  end if;

  v_cost := round(p_total_cost, 4);
  v_markup := round(p_markup_percent, 3);
  v_sell := round(v_cost * (1 + v_markup / 100), 4);
  v_discount := round(p_order_discount_amount, 4);

  select coalesce(max(oi.line_no), 0) + 1
  into v_line_no
  from public.customer_order_items oi
  where oi.order_id = p_order_id;

  perform set_config('modulex.custom_vendor_cabinet_line', 'on', true);
  insert into public.customer_order_items (
    order_id,
    product_id,
    line_no,
    sku_snapshot,
    product_name_snapshot,
    display_name_override,
    quantity,
    unit_price,
    discount_percent,
    discount_amount,
    line_subtotal,
    line_total,
    price_source,
    product_type_code_snapshot,
    product_type_name_snapshot,
    uom_code_snapshot,
    uom_name_snapshot,
    pricing_model_snapshot,
    line_note,
    vendor_id,
    vendor_name_snapshot,
    manual_cost_amount,
    manual_markup_percent,
    source_document_id
  ) values (
    p_order_id,
    null,
    v_line_no,
    'VENDOR-CABINET',
    v_line_name,
    v_line_name,
    1,
    v_sell,
    0,
    0,
    v_sell,
    v_sell,
    'manual',
    'CUSTOM_VENDOR_CABINET',
    'Vendor Cabinet',
    'JOB',
    'Job',
    'manual_vendor_cabinet',
    null,
    v_vendor.id,
    coalesce(nullif(btrim(v_vendor.display_name), ''), v_vendor.legal_name),
    v_cost,
    v_markup,
    v_document.id
  ) returning id into v_item_id;
  perform set_config('modulex.custom_vendor_cabinet_line', 'off', true);

  -- The shell Order is intentionally created with zero discount so a custom-only
  -- order can exist before this line. Apply the requested Order discount only
  -- after the Vendor Cabinet sell amount participates in authoritative subtotal.
  update public.customer_orders
  set discount_amount = v_discount
  where id = p_order_id;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    v_order.customer_id,
    'order_updated',
    'Vendor Cabinet line added',
    format('%s added to %s from %s.', v_line_name, v_order.order_number, coalesce(v_vendor.display_name, v_vendor.legal_name)),
    jsonb_build_object(
      'order_id', p_order_id,
      'order_item_id', v_item_id,
      'vendor_id', v_vendor.id,
      'source_document_id', v_document.id,
      'line_name', v_line_name,
      'sell_price', v_sell
    ),
    v_actor
  );

  return v_item_id;
exception
  when others then
    perform set_config('modulex.custom_vendor_cabinet_line', 'off', true);
    raise;
end;
$$;

create or replace function public.create_custom_vendor_cabinet_order_line(
  p_order_id uuid,
  p_vendor_id uuid,
  p_line_name text,
  p_total_cost numeric,
  p_markup_percent numeric,
  p_document_id uuid,
  p_order_discount_amount numeric default 0
)
returns uuid
language sql
set search_path = pg_catalog, private
as $$
  select private.create_custom_vendor_cabinet_order_line_v1($1,$2,$3,$4,$5,$6,$7);
$$;

revoke all on function private.create_custom_vendor_cabinet_order_line_v1(uuid,uuid,text,numeric,numeric,uuid,numeric) from public, anon;
revoke all on function public.create_custom_vendor_cabinet_order_line(uuid,uuid,text,numeric,numeric,uuid,numeric) from public, anon;
grant execute on function private.create_custom_vendor_cabinet_order_line_v1(uuid,uuid,text,numeric,numeric,uuid,numeric) to authenticated;
grant execute on function public.create_custom_vendor_cabinet_order_line(uuid,uuid,text,numeric,numeric,uuid,numeric) to authenticated;

-- Extend the shared profitability basis so the productless Vendor Cabinet line is
-- a Cabinet with a known manual cost rather than an artificial missing-cost line.
create or replace view private.v_profitability_order_lines as
select
  co.id as order_id,
  oi.id as item_id,
  co.project_id,
  co.status as order_status,
  oi.product_id,
  p.category_id as product_category_id,
  upper(co.currency_code::text) as order_currency,
  co.confirmed_at,
  case
    when oi.pricing_model_snapshot = 'manual_vendor_cabinet' then 'Cabinet'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) in ('STANDARD', 'CABINETS') then 'Cabinet'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STONE' then 'Countertop'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SINK' then 'Sink'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SERVICE' then 'Labor'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'MATERIAL' then 'Material'
    when lower(coalesce(pc.name, '')) = 'cabinet' then 'Cabinet'
    when lower(coalesce(pc.name, '')) in ('stone', 'countertop', 'quartz', 'granite', 'quartzite', 'marble', 'printed quartz') then 'Countertop'
    when lower(coalesce(pc.name, '')) = 'sink' then 'Sink'
    when lower(coalesce(pc.name, '')) in ('service', 'labor') then 'Labor'
    when lower(coalesce(pc.name, '')) = 'material' then 'Material'
    else 'Other'
  end as financial_category,
  case
    when co.subtotal > 0::numeric
      then coalesce(oi.line_total, 0::numeric) * (coalesce(co.customer_visible_sell_amount, 0::numeric) / co.subtotal)
    else 0::numeric
  end as line_revenue,
  coalesce(oi.quantity, 0)::numeric as quantity,
  case
    when oi.pricing_model_snapshot = 'manual_vendor_cabinet' and co.confirmed_at is null then oi.manual_cost_amount
    when co.confirmed_at is not null then
      case
        when oi.unit_cost_snapshot is not null
             and upper(coalesce(oi.cost_currency_code, '')) = upper(co.currency_code::text)
          then oi.unit_cost_snapshot
        else null
      end
    else live_cost.amount
  end as unit_cost,
  case
    when oi.pricing_model_snapshot = 'manual_vendor_cabinet' and co.confirmed_at is null then upper(co.currency_code::text)
    when co.confirmed_at is not null then upper(oi.cost_currency_code::text)
    else live_cost.currency_code
  end as cost_currency,
  case
    when oi.pricing_model_snapshot = 'manual_vendor_cabinet' then
      case
        when co.confirmed_at is not null then
          oi.unit_cost_snapshot is null
          or upper(coalesce(oi.cost_currency_code, '')) <> upper(co.currency_code::text)
        else oi.manual_cost_amount is null
      end
    when oi.product_id is null then true
    when co.confirmed_at is not null then
      oi.unit_cost_snapshot is null
      or upper(coalesce(oi.cost_currency_code, '')) <> upper(co.currency_code::text)
    else live_cost.amount is null
  end as missing_cost
from public.customer_orders co
join public.customer_order_items oi on oi.order_id = co.id
left join public.products p on p.id = oi.product_id
left join public.product_types pt on pt.id = p.product_type_id
left join public.product_categories pc on pc.id = p.category_id
left join lateral (
  select pp.amount, upper(pp.currency_code::text) as currency_code
  from public.product_prices pp
  join public.price_groups pg on pg.id = pp.price_group_id
  where co.confirmed_at is null
    and pp.product_id = oi.product_id
    and upper(pp.currency_code::text) = upper(co.currency_code::text)
    and pg.system_key = 'cost'
    and coalesce(pg.internal_only, false) = true
    and coalesce(pg.is_active, true) = true
    and pp.is_active = true
    and pp.valid_from <= now()
    and (pp.valid_to is null or pp.valid_to > now())
  order by pp.valid_from desc, pp.created_at desc, pp.id desc
  limit 1
) live_cost on true;

revoke all on private.v_profitability_order_lines from public, anon, authenticated;
grant select on private.v_profitability_order_lines to service_role;
