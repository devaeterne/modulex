begin;

-- Manual Service order lines are a first-class Product Type pricing route.
-- They use one canonical SERVICE product, require an explicit order-line note
-- and price, never reserve inventory, and snapshot the note into invoices.

alter table public.product_types
  drop constraint if exists product_types_pricing_model_check;

alter table public.product_types
  add constraint product_types_pricing_model_check
  check (pricing_model = any (array[
    'price_group'::text,
    'countertop_material_band'::text,
    'manual_service'::text,
    'none'::text
  ]));

alter table public.customer_order_items
  add column if not exists line_note text;

alter table public.customer_invoice_items
  add column if not exists line_note text;

comment on column public.customer_order_items.line_note is
  'Immutable-at-invoice order-time detail for manual Service lines.';
comment on column public.customer_invoice_items.line_note is
  'Invoice-time snapshot of the source order Service line detail.';

-- Product Master requires a category, an active brand, and an allowed UOM.
-- Resolve generated IDs by stable business keys only.
insert into public.product_categories (name, status)
values ('Service', 'active')
on conflict (name) do update
set status = excluded.status,
    updated_at = now();

do $$
declare
  v_piece_id uuid;
  v_service_type_id uuid;
  v_oakwell_brand_id uuid;
  v_service_category_id uuid;
  v_service_product_id uuid;
  v_existing_type public.product_types%rowtype;
  v_existing_product public.products%rowtype;
begin
  select u.id
  into v_piece_id
  from public.units_of_measure u
  where u.code = 'PIECE'
    and u.is_active = true
  limit 1;

  if v_piece_id is null then
    raise exception 'Active PIECE unit of measure is required for the Service Product Type.';
  end if;

  insert into public.product_types (
    code,
    name,
    description,
    default_uom_id,
    inventory_tracking,
    reservable,
    pricing_model,
    requires_variant_identity,
    qr_required,
    store_eligible,
    is_active,
    sort_order
  )
  values (
    'SERVICE',
    'Service',
    'Manual service order line',
    v_piece_id,
    false,
    false,
    'manual_service',
    false,
    false,
    false,
    true,
    (select coalesce(max(pt.sort_order), 0) + 10 from public.product_types pt)
  )
  on conflict (code) do nothing;

  select *
  into v_existing_type
  from public.product_types pt
  where pt.code = 'SERVICE';

  if v_existing_type.id is null
     or v_existing_type.name <> 'Service'
     or v_existing_type.default_uom_id is distinct from v_piece_id
     or v_existing_type.pricing_model <> 'manual_service'
     or v_existing_type.inventory_tracking
     or v_existing_type.reservable
     or v_existing_type.requires_variant_identity
     or v_existing_type.qr_required
     or v_existing_type.store_eligible
     or not v_existing_type.is_active
  then
    raise exception 'Existing SERVICE Product Type conflicts with the canonical manual Service contract.';
  end if;

  v_service_type_id := v_existing_type.id;

  insert into public.product_type_allowed_uoms (product_type_id, uom_id, is_default)
  values (v_service_type_id, v_piece_id, true)
  on conflict (product_type_id, uom_id) do update
  set is_default = true;

  select b.id
  into v_oakwell_brand_id
  from public.product_brands b
  where b.name = 'Oakwell'
    and b.status = 'active'
  limit 1;

  if v_oakwell_brand_id is null then
    raise exception 'Active Oakwell brand is required for the canonical Service product.';
  end if;

  select c.id
  into v_service_category_id
  from public.product_categories c
  where c.name = 'Service'
    and c.status = 'active'
  limit 1;

  if v_service_category_id is null then
    raise exception 'Active Service category is required for the canonical Service product.';
  end if;

  insert into public.products (
    sku,
    name,
    description,
    brand_id,
    category_id,
    unit,
    min_stock_level,
    status,
    metadata,
    base_product_code,
    color_code,
    color_name,
    product_type_id,
    uom_id
  )
  values (
    'SERVICE',
    'Service',
    'Manual service order line',
    v_oakwell_brand_id,
    v_service_category_id,
    'piece',
    0,
    'active',
    '{}'::jsonb,
    'SERVICE',
    'SERVICE',
    null,
    v_service_type_id,
    v_piece_id
  )
  on conflict (sku) do nothing;

  select *
  into v_existing_product
  from public.products p
  where p.sku = 'SERVICE';

  if v_existing_product.id is null
     or v_existing_product.name <> 'Service'
     or v_existing_product.status::text <> 'active'
     or v_existing_product.product_type_id is distinct from v_service_type_id
     or v_existing_product.uom_id is distinct from v_piece_id
     or v_existing_product.brand_id is distinct from v_oakwell_brand_id
     or v_existing_product.category_id is distinct from v_service_category_id
  then
    raise exception 'Existing SERVICE product conflicts with the canonical manual Service contract.';
  end if;

  v_service_product_id := v_existing_product.id;

  if exists (
    select 1
    from public.product_prices pp
    where pp.product_id = v_service_product_id
      and pp.is_active = true
      and pp.valid_to is null
  ) then
    raise exception 'Canonical SERVICE product must not have an active Product Group price.';
  end if;
end
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
begin
  select * into v_order
  from public.customer_orders
  where id = new.order_id;

  if v_order.id is null then
    raise exception 'Customer order does not exist.';
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
    if not v_type.is_active
       or v_product.status::text <> 'active'
       or not v_uom.is_active
    then
      raise exception 'Manual Service product, Product Type, and UOM must be active.';
    end if;

    if nullif(btrim(coalesce(new.line_note, '')), '') is null then
      raise exception 'Service detail is required.';
    end if;

    if new.quantity <> 1 then
      raise exception 'Manual Service quantity must be exactly 1.';
    end if;

    if new.unit_price is null or new.unit_price < 0 then
      raise exception 'Manual Service price must be explicit and nonnegative.';
    end if;

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
end
$$;

revoke all on function private.enforce_customer_order_item_pricing_v2() from public, anon, authenticated;
grant execute on function private.enforce_customer_order_item_pricing_v2() to postgres;

create or replace function private.create_customer_order_core(
  p_customer_id uuid,
  p_items jsonb,
  p_price_group_id uuid default null,
  p_billing_address_id uuid default null,
  p_shipping_address_id uuid default null,
  p_expected_delivery_date date default null,
  p_customer_reference text default null,
  p_customer_notes text default null,
  p_internal_notes text default null,
  p_tax_rate numeric default 0,
  p_order_discount_amount numeric default 0,
  p_payment_method_id uuid default null,
  p_payment_commission_percent numeric default null,
  p_initial_status text default 'draft'
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_price_group_id uuid;
  v_price_group_name text;
  v_currency varchar(3);
  v_payment_method_id uuid;
  v_payment_method_name text;
  v_payment_default_commission_percent numeric(7,3) := 0;
  v_payment_applied_commission_percent numeric(7,3) := 0;
  v_payment_commission_amount numeric(18,4) := 0;
  v_grand_total numeric(18,4) := 0;
  v_billing_snapshot jsonb;
  v_shipping_snapshot jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_discount_percent numeric;
  v_manual_price numeric;
  v_unit_price numeric;
  v_price_source text;
  v_sku text;
  v_product_name text;
  v_pricing_model text;
  v_line_note text;
  v_line_subtotal numeric;
  v_line_discount numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_line_no integer := 0;
  v_item_count integer := 0;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to create customer orders.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required.';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.status <> 'inactive'
  ) then
    raise exception 'Customer does not exist or is inactive.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be a JSON array.';
  end if;

  if jsonb_array_length(p_items) = 0 and p_initial_status <> 'draft' then
    raise exception 'Empty customer orders are only allowed as Draft countertop shells.';
  end if;

  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then
    raise exception 'Tax rate must be between 0 and 100.';
  end if;

  if p_order_discount_amount is null or p_order_discount_amount < 0 then
    raise exception 'Order discount cannot be negative.';
  end if;

  if p_payment_commission_percent is not null
     and (p_payment_commission_percent < 0 or p_payment_commission_percent > 100) then
    raise exception 'Payment commission must be between 0 and 100.';
  end if;

  if p_initial_status not in ('draft','confirmed') then
    raise exception 'New orders can only start as Draft or Confirmed.';
  end if;

  if p_price_group_id is null then
    select c.price_group_id into v_price_group_id
    from public.customers c where c.id = p_customer_id;
  else
    v_price_group_id := p_price_group_id;
  end if;

  if v_price_group_id is null then
    select pg.id into v_price_group_id
    from public.price_groups pg
    where pg.is_base_price = true and pg.is_active = true
    order by pg.sort_order limit 1;
  end if;

  select pg.name into v_price_group_name
  from public.price_groups pg
  where pg.id = v_price_group_id and pg.is_active = true;

  if v_price_group_name is null then
    raise exception 'Price group does not exist or is inactive.';
  end if;

  select coalesce(c.currency_code, 'USD') into v_currency
  from public.customers c where c.id = p_customer_id;

  if p_payment_method_id is null then
    select pm.id, pm.name, pm.commission_percent
    into v_payment_method_id, v_payment_method_name, v_payment_default_commission_percent
    from public.payment_methods pm
    where pm.system_key = 'cash' and pm.is_active = true
    limit 1;
  else
    select pm.id, pm.name, pm.commission_percent
    into v_payment_method_id, v_payment_method_name, v_payment_default_commission_percent
    from public.payment_methods pm
    where pm.id = p_payment_method_id and pm.is_active = true;
  end if;

  if v_payment_method_id is null then
    raise exception 'Payment method does not exist or is inactive.';
  end if;

  v_payment_applied_commission_percent := round(
    coalesce(p_payment_commission_percent, v_payment_default_commission_percent),
    3
  );

  if p_billing_address_id is not null then
    select jsonb_build_object(
      'id', ca.id,
      'address_name', ca.address_name,
      'company_name', ca.company_name,
      'contact_name', ca.contact_name,
      'address_line_1', ca.address_line_1,
      'address_line_2', ca.address_line_2,
      'postal_code', ca.postal_code,
      'city', ca.city,
      'state_region', ca.state_region,
      'country_code', ca.country_code,
      'phone', ca.phone
    ) into v_billing_snapshot
    from public.customer_addresses ca
    where ca.id = p_billing_address_id
      and ca.customer_id = p_customer_id
      and ca.is_active = true;

    if v_billing_snapshot is null then
      raise exception 'Billing address does not belong to this customer.';
    end if;
  end if;

  if p_shipping_address_id is not null then
    select jsonb_build_object(
      'id', ca.id,
      'address_name', ca.address_name,
      'company_name', ca.company_name,
      'contact_name', ca.contact_name,
      'address_line_1', ca.address_line_1,
      'address_line_2', ca.address_line_2,
      'postal_code', ca.postal_code,
      'city', ca.city,
      'state_region', ca.state_region,
      'country_code', ca.country_code,
      'phone', ca.phone
    ) into v_shipping_snapshot
    from public.customer_addresses ca
    where ca.id = p_shipping_address_id
      and ca.customer_id = p_customer_id
      and ca.is_active = true;

    if v_shipping_snapshot is null then
      raise exception 'Shipping address does not belong to this customer.';
    end if;
  end if;

  insert into public.customer_orders (
    order_number,
    customer_id,
    status,
    price_group_id,
    price_group_name_snapshot,
    currency_code,
    payment_method_id,
    payment_method_name_snapshot,
    payment_commission_default_percent,
    payment_commission_percent,
    billing_address_id,
    shipping_address_id,
    billing_address_snapshot,
    shipping_address_snapshot,
    expected_delivery_date,
    customer_reference,
    customer_notes,
    internal_notes,
    discount_amount,
    tax_rate,
    confirmed_at
  ) values (
    '', p_customer_id, p_initial_status, v_price_group_id,
    v_price_group_name, upper(v_currency),
    v_payment_method_id, v_payment_method_name,
    v_payment_default_commission_percent,
    v_payment_applied_commission_percent,
    p_billing_address_id, p_shipping_address_id,
    v_billing_snapshot, v_shipping_snapshot,
    p_expected_delivery_date,
    nullif(trim(p_customer_reference), ''),
    nullif(trim(p_customer_notes), ''),
    nullif(trim(p_internal_notes), ''),
    round(p_order_discount_amount, 4),
    round(p_tax_rate, 3),
    case when p_initial_status = 'confirmed' then now() else null end
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;

    if v_item->>'product_id' is null then
      raise exception 'product_id is required for every order item.';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_discount_percent := coalesce((v_item->>'discount_percent')::numeric, 0);
    v_line_note := nullif(btrim(coalesce(v_item ->> 'line_note', '')), '');

    if v_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;
    if v_discount_percent < 0 or v_discount_percent > 100 then
      raise exception 'Line discount must be between 0 and 100.';
    end if;

    select p.sku, p.name, pt.pricing_model
    into v_sku, v_product_name, v_pricing_model
    from public.products p
    join public.product_types pt on pt.id = p.product_type_id
    where p.id = v_product_id
      and p.status <> 'archived';

    if v_sku is null then
      raise exception 'Product % does not exist or is archived.', v_product_id;
    end if;

    if v_pricing_model = 'manual_service' then
      if v_quantity <> 1 then
        raise exception 'Manual Service quantity must be exactly 1.';
      end if;
      if v_line_note is null then
        raise exception 'Service detail is required.';
      end if;
      if not (v_item ? 'unit_price')
         or v_item->'unit_price' = 'null'::jsonb
         or btrim(coalesce(v_item->>'unit_price', '')) = '' then
        raise exception 'Manual Service price is required.';
      end if;
      v_manual_price := (v_item->>'unit_price')::numeric;
      if v_manual_price < 0 then
        raise exception 'Manual Service price cannot be negative.';
      end if;
      v_unit_price := round(v_manual_price, 4);
      v_price_source := 'manual';
    else
      v_line_note := null;
      if v_item ? 'unit_price'
         and v_item->'unit_price' <> 'null'::jsonb
         and trim(coalesce(v_item->>'unit_price','')) <> '' then
        v_manual_price := (v_item->>'unit_price')::numeric;
        if v_manual_price < 0 then
          raise exception 'Manual unit price cannot be negative.';
        end if;
        v_unit_price := round(v_manual_price, 4);
        v_price_source := 'manual';
      else
        select pp.amount into v_unit_price
        from public.product_prices pp
        where pp.product_id = v_product_id
          and pp.price_group_id = v_price_group_id
          and pp.currency_code = upper(v_currency)
          and pp.is_active = true
          and pp.valid_to is null
        order by pp.valid_from desc
        limit 1;

        if v_unit_price is null then
          raise exception 'No current % price exists for SKU % in price group %.', upper(v_currency), v_sku, v_price_group_name;
        end if;
        v_price_source := 'price_group';
      end if;
    end if;

    v_line_subtotal := round(v_quantity * v_unit_price, 4);
    v_line_discount := round(v_line_subtotal * (v_discount_percent / 100), 4);
    v_line_total := round(v_line_subtotal - v_line_discount, 4);

    insert into public.customer_order_items (
      order_id, product_id, line_no, sku_snapshot, product_name_snapshot,
      quantity, unit_price, discount_percent, discount_amount,
      line_subtotal, line_total, price_source, line_note
    ) values (
      v_order_id, v_product_id, v_line_no, v_sku, v_product_name,
      round(v_quantity, 4), round(v_unit_price, 4), round(v_discount_percent, 3),
      v_line_discount, v_line_subtotal, v_line_total, v_price_source, v_line_note
    );

    v_subtotal := v_subtotal + v_line_total;
    v_item_count := v_item_count + 1;
  end loop;

  if p_order_discount_amount > v_subtotal then
    raise exception 'Order discount cannot exceed order subtotal.';
  end if;

  v_taxable := greatest(v_subtotal - p_order_discount_amount, 0);
  v_tax_amount := round(v_taxable * (p_tax_rate / 100), 4);
  v_total := round(v_taxable + v_tax_amount, 4);
  v_payment_commission_amount := round(v_total * (v_payment_applied_commission_percent / 100), 4);
  v_grand_total := round(v_total + v_payment_commission_amount, 4);

  update public.customer_orders
  set
    item_count = v_item_count,
    subtotal = round(v_subtotal, 4),
    discount_amount = round(p_order_discount_amount, 4),
    tax_amount = v_tax_amount,
    total_amount = v_total,
    payment_commission_amount = v_payment_commission_amount,
    grand_total = v_grand_total
  where id = v_order_id;

  insert into public.customer_order_status_history (order_id, from_status, to_status, note)
  values (v_order_id, null, p_initial_status, 'Order created');

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata
  ) values (
    p_customer_id,
    'order_created',
    'Order created',
    (select order_number from public.customer_orders where id = v_order_id),
    jsonb_build_object(
      'order_id', v_order_id,
      'payment_method_id', v_payment_method_id,
      'payment_default_commission_percent', v_payment_default_commission_percent,
      'payment_applied_commission_percent', v_payment_applied_commission_percent
    )
  );

  return v_order_id;
end
$$;

create or replace function private.update_customer_order(
  p_order_id uuid,
  p_items jsonb,
  p_price_group_id uuid,
  p_billing_address_id uuid default null,
  p_shipping_address_id uuid default null,
  p_expected_delivery_date date default null,
  p_customer_reference text default null,
  p_customer_notes text default null,
  p_internal_notes text default null,
  p_tax_rate numeric default 0,
  p_order_discount_amount numeric default 0,
  p_payment_method_id uuid default null,
  p_payment_commission_percent numeric default null,
  p_revision_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_revision_number integer;
  v_price_group_name text;
  v_payment_method_name text;
  v_payment_default_commission numeric(7,3) := 0;
  v_payment_applied_commission numeric(7,3) := 0;
  v_billing_snapshot jsonb;
  v_shipping_snapshot jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_discount_percent numeric;
  v_sku text;
  v_product_name text;
  v_pricing_model text;
  v_line_note text;
  v_current_group_price numeric;
  v_price_source text;
  v_line_subtotal numeric;
  v_line_discount numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_taxable numeric;
  v_tax_amount numeric;
  v_total numeric;
  v_commission_amount numeric;
  v_grand_total numeric;
  v_line_no integer := 0;
  v_item_count integer := 0;
  v_item_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_retained_ids uuid[] := '{}'::uuid[];
  v_line_offset integer;
  v_existing public.customer_order_items%rowtype;
  v_is_configured boolean;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to edit customer orders.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id
  for update;

  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status = 'cancelled' then raise exception 'Cancelled orders cannot be edited.'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required.';
  end if;
  if p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'Tax rate must be between 0 and 100.'; end if;
  if p_order_discount_amount < 0 then raise exception 'Order discount cannot be negative.'; end if;
  if p_payment_commission_percent is not null and (p_payment_commission_percent < 0 or p_payment_commission_percent > 100) then
    raise exception 'Payment commission must be between 0 and 100.';
  end if;

  select pg.name into v_price_group_name
  from public.price_groups pg
  where pg.id = p_price_group_id and pg.is_active = true;
  if v_price_group_name is null then raise exception 'Price group does not exist or is inactive.'; end if;

  select pm.name, pm.commission_percent
  into v_payment_method_name, v_payment_default_commission
  from public.payment_methods pm
  where pm.id = p_payment_method_id and pm.is_active = true;
  if v_payment_method_name is null then raise exception 'Payment method does not exist or is inactive.'; end if;
  v_payment_applied_commission := round(coalesce(p_payment_commission_percent, v_payment_default_commission), 3);

  if p_billing_address_id is not null then
    select jsonb_build_object('id',ca.id,'address_name',ca.address_name,'company_name',ca.company_name,'contact_name',ca.contact_name,'address_line_1',ca.address_line_1,'address_line_2',ca.address_line_2,'postal_code',ca.postal_code,'city',ca.city,'state_region',ca.state_region,'country_code',ca.country_code,'phone',ca.phone)
    into v_billing_snapshot
    from public.customer_addresses ca
    where ca.id = p_billing_address_id and ca.customer_id = v_order.customer_id and ca.is_active = true;
    if v_billing_snapshot is null then raise exception 'Billing address does not belong to this customer.'; end if;
  end if;

  if p_shipping_address_id is not null then
    select jsonb_build_object('id',ca.id,'address_name',ca.address_name,'company_name',ca.company_name,'contact_name',ca.contact_name,'address_line_1',ca.address_line_1,'address_line_2',ca.address_line_2,'postal_code',ca.postal_code,'city',ca.city,'state_region',ca.state_region,'country_code',ca.country_code,'phone',ca.phone)
    into v_shipping_snapshot
    from public.customer_addresses ca
    where ca.id = p_shipping_address_id and ca.customer_id = v_order.customer_id and ca.is_active = true;
    if v_shipping_snapshot is null then raise exception 'Shipping address does not belong to this customer.'; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item->>'id','')::uuid;
    if v_item_id is not null then
      if v_item_id = any(v_seen_ids) then raise exception 'Duplicate order item id in revision.'; end if;
      v_seen_ids := array_append(v_seen_ids, v_item_id);
      v_retained_ids := array_append(v_retained_ids, v_item_id);
      select * into v_existing from public.customer_order_items where id = v_item_id and order_id = p_order_id for update;
      if v_existing.id is null then raise exception 'Order item does not belong to this order.'; end if;
      v_is_configured := exists(select 1 from public.countertop_configurations where order_item_id = v_item_id);
      if v_is_configured and (v_existing.product_id is distinct from nullif(v_item->>'product_id','')::uuid or v_existing.quantity is distinct from coalesce((v_item->>'quantity')::numeric,0) or v_existing.unit_price is distinct from coalesce((v_item->>'unit_price')::numeric,-1) or v_existing.discount_percent is distinct from coalesce((v_item->>'discount_percent')::numeric,0)) then
        raise exception 'Configured countertop lines must be changed in the countertop configurator.';
      end if;
    end if;

    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, -1);
    v_discount_percent := coalesce((v_item->>'discount_percent')::numeric, 0);
    v_line_note := nullif(btrim(coalesce(v_item ->> 'line_note', '')), '');

    if v_product_id is null then raise exception 'Product is required for every line.'; end if;
    if v_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
    if v_unit_price < 0 then raise exception 'Unit price cannot be negative.'; end if;
    if v_discount_percent < 0 or v_discount_percent > 100 then raise exception 'Line discount must be between 0 and 100.'; end if;

    select p.sku, pt.pricing_model
    into v_sku, v_pricing_model
    from public.products p
    join public.product_types pt on pt.id = p.product_type_id
    where p.id = v_product_id and p.status <> 'archived';

    if v_sku is null then raise exception 'Product does not exist or is archived.'; end if;
    if v_pricing_model = 'manual_service' then
      if v_quantity <> 1 then raise exception 'Manual Service quantity must be exactly 1.'; end if;
      if v_line_note is null then raise exception 'Service detail is required.'; end if;
    end if;
  end loop;

  for v_existing in select * from public.customer_order_items where order_id = p_order_id for update loop
    if not (v_existing.id = any(v_retained_ids)) and exists(select 1 from public.countertop_configurations where order_item_id = v_existing.id) then
      raise exception 'Configured countertop lines cannot be removed in a generic revision.';
    end if;
  end loop;
  v_seen_ids := '{}'::uuid[];

  select coalesce(max(revision_number), 0) + 1 into v_revision_number
  from public.customer_order_revisions where order_id = p_order_id;

  insert into public.customer_order_revisions(order_id, revision_number, reason, order_snapshot, items_snapshot)
  values (p_order_id,v_revision_number,nullif(trim(p_revision_reason), ''),to_jsonb(v_order),coalesce((select jsonb_agg(to_jsonb(i) order by i.line_no) from public.customer_order_items i where i.order_id = p_order_id), '[]'::jsonb));

  delete from public.customer_order_items i
  where i.order_id = p_order_id
    and not (i.id = any(v_retained_ids))
    and not exists(select 1 from public.countertop_configurations c where c.order_item_id = i.id);

  select coalesce(max(line_no), 0) + jsonb_array_length(p_items) + 1000 into v_line_offset
  from public.customer_order_items where order_id = p_order_id;

  update public.customer_order_items
  set line_no = line_no + v_line_offset
  where order_id = p_order_id and id = any(v_retained_ids);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;
    v_item_id := nullif(v_item->>'id','')::uuid;
    if v_item_id is not null then
      if v_item_id = any(v_seen_ids) then raise exception 'Duplicate order item id in revision.'; end if;
      v_seen_ids := array_append(v_seen_ids, v_item_id);
      select * into v_existing from public.customer_order_items where id = v_item_id and order_id = p_order_id for update;
      if v_existing.id is null then raise exception 'Order item does not belong to this order.'; end if;
      v_is_configured := exists(select 1 from public.countertop_configurations where order_item_id = v_item_id);
      if v_is_configured and (v_existing.product_id is distinct from nullif(v_item->>'product_id','')::uuid or v_existing.quantity is distinct from coalesce((v_item->>'quantity')::numeric,0) or v_existing.unit_price is distinct from coalesce((v_item->>'unit_price')::numeric,-1) or v_existing.discount_percent is distinct from coalesce((v_item->>'discount_percent')::numeric,0)) then
        raise exception 'Configured countertop lines must be changed in the countertop configurator.';
      end if;
    end if;

    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, -1);
    v_discount_percent := coalesce((v_item->>'discount_percent')::numeric, 0);
    v_line_note := nullif(btrim(coalesce(v_item ->> 'line_note', '')), '');

    if v_product_id is null then raise exception 'Product is required for every line.'; end if;
    if v_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
    if v_unit_price < 0 then raise exception 'Unit price cannot be negative.'; end if;
    if v_discount_percent < 0 or v_discount_percent > 100 then raise exception 'Line discount must be between 0 and 100.'; end if;

    select p.sku, p.name, pt.pricing_model
    into v_sku, v_product_name, v_pricing_model
    from public.products p
    join public.product_types pt on pt.id = p.product_type_id
    where p.id = v_product_id and p.status <> 'archived';

    if v_sku is null then raise exception 'Product does not exist or is archived.'; end if;

    if v_pricing_model = 'manual_service' then
      if v_quantity <> 1 then raise exception 'Manual Service quantity must be exactly 1.'; end if;
      if v_line_note is null then raise exception 'Service detail is required.'; end if;
      v_price_source := 'manual';
    else
      v_line_note := null;
      select pp.amount into v_current_group_price
      from public.product_prices pp
      where pp.product_id = v_product_id
        and pp.price_group_id = p_price_group_id
        and pp.currency_code = v_order.currency_code
        and pp.is_active = true
        and pp.valid_to is null
      order by pp.valid_from desc
      limit 1;
      v_price_source := case when v_current_group_price is not null and round(v_unit_price,4) = round(v_current_group_price,4) then 'price_group' else 'manual' end;
    end if;

    v_line_subtotal := round(v_quantity * v_unit_price, 4);
    v_line_discount := round(v_line_subtotal * (v_discount_percent / 100), 4);
    v_line_total := round(v_line_subtotal - v_line_discount, 4);

    if v_item_id is null then
      insert into public.customer_order_items(
        order_id, product_id, line_no, sku_snapshot, product_name_snapshot,
        quantity, unit_price, discount_percent, discount_amount,
        line_subtotal, line_total, price_source, line_note
      ) values (
        p_order_id, v_product_id, v_line_no, v_sku, v_product_name,
        round(v_quantity,4), round(v_unit_price,4), round(v_discount_percent,3),
        v_line_discount, v_line_subtotal, v_line_total, v_price_source, v_line_note
      ) returning id into v_item_id;
      v_seen_ids := array_append(v_seen_ids, v_item_id);
    elsif not v_is_configured then
      update public.customer_order_items
      set product_id = v_product_id,
          line_no = v_line_no,
          sku_snapshot = v_sku,
          product_name_snapshot = v_product_name,
          quantity = round(v_quantity,4),
          unit_price = round(v_unit_price,4),
          discount_percent = round(v_discount_percent,3),
          discount_amount = v_line_discount,
          line_subtotal = v_line_subtotal,
          line_total = v_line_total,
          price_source = v_price_source,
          line_note = v_line_note
      where id = v_item_id;
    else
      update public.customer_order_items
      set line_no = v_line_no
      where id = v_item_id;
    end if;

    v_subtotal := v_subtotal + v_line_total;
    v_item_count := v_item_count + 1;
  end loop;

  if p_order_discount_amount > v_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  v_taxable := greatest(v_subtotal - p_order_discount_amount, 0);
  v_tax_amount := round(v_taxable * (p_tax_rate / 100), 4);
  v_total := round(v_taxable + v_tax_amount, 4);
  v_commission_amount := round(v_total * (v_payment_applied_commission / 100), 4);
  v_grand_total := round(v_total + v_commission_amount, 4);

  update public.customer_orders
  set price_group_id = p_price_group_id,
      price_group_name_snapshot = v_price_group_name,
      payment_method_id = p_payment_method_id,
      payment_method_name_snapshot = v_payment_method_name,
      payment_commission_default_percent = v_payment_default_commission,
      payment_commission_percent = v_payment_applied_commission,
      payment_commission_amount = v_commission_amount,
      billing_address_id = p_billing_address_id,
      shipping_address_id = p_shipping_address_id,
      billing_address_snapshot = v_billing_snapshot,
      shipping_address_snapshot = v_shipping_snapshot,
      expected_delivery_date = p_expected_delivery_date,
      customer_reference = nullif(trim(p_customer_reference), ''),
      customer_notes = nullif(trim(p_customer_notes), ''),
      internal_notes = nullif(trim(p_internal_notes), ''),
      item_count = v_item_count,
      subtotal = round(v_subtotal,4),
      discount_amount = round(p_order_discount_amount,4),
      tax_rate = round(p_tax_rate,3),
      tax_amount = v_tax_amount,
      total_amount = v_total,
      grand_total = v_grand_total
  where id = p_order_id;

  insert into public.customer_activity(customer_id, activity_type, title, description, metadata)
  values (
    v_order.customer_id,
    'order_revised',
    'Order revised',
    v_order.order_number || ' revision ' || v_revision_number,
    jsonb_build_object('order_id',p_order_id,'revision_number',v_revision_number,'reason',nullif(trim(p_revision_reason),''))
  );

  return v_revision_number;
end
$$;

-- Service lines are commercial-only and never touch stock. The snapshot is set
-- before the AFTER reserve trigger and remains available to BEFORE release paths.
create or replace function private.reserve_order_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if new.pricing_model_snapshot = 'manual_service' then
    return new;
  end if;

  select status into v_status
  from public.customer_orders
  where id = new.order_id;

  if private.order_status_reserves_stock(v_status) then
    perform private.reserve_customer_order_item_stock(new.id);
  end if;

  return new;
end
$$;

create or replace function private.release_order_item_reservation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.pricing_model_snapshot = 'manual_service' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    perform private.release_customer_order_item_stock(
      old.id,
      'Order item removed'
    );
    return old;
  end if;

  if old.product_id is distinct from new.product_id
     or old.quantity is distinct from new.quantity
  then
    perform private.release_customer_order_item_stock(
      old.id,
      'Order item changed'
    );
  end if;

  return new;
end
$$;

create or replace function private.create_customer_invoice_from_order(
  p_order_id uuid,
  p_due_date date default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_issue_now boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.customer_orders%rowtype;
  v_invoice_id uuid;
  v_total numeric(18,4);
  v_payment_term_days integer := 0;
  v_due_date date;
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin', 'sales', 'finance']) then
    raise exception 'You do not have permission to create customer invoices.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id
  for share;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'A cancelled order cannot be invoiced.';
  end if;

  if v_order.status = 'draft' then
    raise exception 'Confirm the order before creating an invoice.';
  end if;

  if exists (
    select 1
    from public.customer_invoices i
    where i.order_id = p_order_id
      and i.status <> 'void'
  ) then
    raise exception 'This order already has an active invoice.';
  end if;

  if p_due_date is not null and p_due_date < current_date then
    raise exception 'Due date cannot be before today when creating an invoice.';
  end if;

  if p_due_date is null then
    select coalesce(pt.days, 0)
    into v_payment_term_days
    from public.customer_commercial_settings ccs
    join public.payment_terms pt
      on pt.id = ccs.payment_term_id
     and pt.is_active = true
    where ccs.customer_id = v_order.customer_id
    limit 1;
  end if;

  v_due_date := coalesce(
    p_due_date,
    current_date + coalesce(v_payment_term_days, 0)
  );

  v_total := case
    when coalesce(v_order.grand_total, 0) > 0 or coalesce(v_order.total_amount, 0) = 0
      then coalesce(v_order.grand_total, 0)
    else coalesce(v_order.total_amount, 0)
  end;

  insert into public.customer_invoices (
    invoice_number,
    customer_id,
    order_id,
    status,
    invoice_date,
    due_date,
    currency_code,
    customer_reference,
    order_number_snapshot,
    billing_address_snapshot,
    subtotal,
    discount_amount,
    tax_rate,
    tax_amount,
    payment_commission_percent,
    payment_commission_amount,
    total_amount,
    notes,
    internal_notes,
    issued_at
  ) values (
    '',
    v_order.customer_id,
    v_order.id,
    case when p_issue_now then 'issued' else 'draft' end,
    current_date,
    v_due_date,
    v_order.currency_code,
    v_order.customer_reference,
    v_order.order_number,
    v_order.billing_address_snapshot,
    v_order.subtotal,
    v_order.discount_amount,
    v_order.tax_rate,
    v_order.tax_amount,
    coalesce(v_order.payment_commission_percent, 0),
    coalesce(v_order.payment_commission_amount, 0),
    v_total,
    nullif(trim(p_notes), ''),
    nullif(trim(p_internal_notes), ''),
    case when p_issue_now then now() else null end
  ) returning id into v_invoice_id;

  insert into public.customer_invoice_items (
    invoice_id,
    order_item_id,
    product_id,
    line_no,
    sku_snapshot,
    product_name_snapshot,
    quantity,
    unit_price,
    discount_percent,
    discount_amount,
    line_subtotal,
    line_total,
    line_note
  )
  select
    v_invoice_id,
    oi.id,
    oi.product_id,
    oi.line_no,
    oi.sku_snapshot,
    oi.product_name_snapshot,
    oi.quantity,
    oi.unit_price,
    oi.discount_percent,
    oi.discount_amount,
    oi.line_subtotal,
    oi.line_total,
    oi.line_note
  from public.customer_order_items oi
  where oi.order_id = p_order_id
  order by oi.line_no;

  if not exists (
    select 1
    from public.customer_invoice_items ii
    where ii.invoice_id = v_invoice_id
  ) then
    raise exception 'The order has no invoiceable items.';
  end if;

  return v_invoice_id;
end
$$;

notify pgrst, 'reload schema';

commit;
