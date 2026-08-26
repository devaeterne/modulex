begin;

-- ============================================================
-- MODULEX CUSTOMER ORDERS
-- ============================================================

create sequence if not exists public.customer_order_number_seq
  start with 1
  increment by 1
  minvalue 1;

create table if not exists public.customer_orders (
  id uuid primary key default gen_random_uuid(),

  order_number text not null unique,

  customer_id uuid not null
    references public.customers(id)
    on update cascade
    on delete restrict,

  status text not null default 'draft',

  order_date date not null default current_date,
  expected_delivery_date date,

  price_group_id uuid
    references public.price_groups(id)
    on update cascade
    on delete restrict,

  price_group_name_snapshot text,

  currency_code varchar(3) not null default 'USD',

  billing_address_id uuid
    references public.customer_addresses(id)
    on update cascade
    on delete set null,

  shipping_address_id uuid
    references public.customer_addresses(id)
    on update cascade
    on delete set null,

  billing_address_snapshot jsonb,
  shipping_address_snapshot jsonb,

  customer_reference text,

  customer_notes text,
  internal_notes text,

  item_count integer not null default 0,

  subtotal numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  tax_rate numeric(7,3) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  total_amount numeric(18,4) not null default 0,

  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  created_by uuid default auth.uid()
    references public.profiles(id)
    on delete set null,

  updated_by uuid default auth.uid()
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_orders_number_not_empty
    check (length(trim(order_number)) > 0),

  constraint customer_orders_status_valid
    check (
      status in (
        'draft',
        'confirmed',
        'in_preparation',
        'ready_for_shipment',
        'shipped',
        'delivered',
        'installation_scheduled',
        'installation_in_progress',
        'completed',
        'cancelled'
      )
    ),

  constraint customer_orders_currency_valid
    check (
      currency_code = upper(currency_code)
      and length(currency_code) = 3
    ),

  constraint customer_orders_amounts_non_negative
    check (
      item_count >= 0
      and subtotal >= 0
      and discount_amount >= 0
      and tax_amount >= 0
      and total_amount >= 0
      and tax_rate >= 0
      and tax_rate <= 100
    )
);

create index if not exists customer_orders_customer_idx
  on public.customer_orders(customer_id, order_date desc);

create index if not exists customer_orders_status_idx
  on public.customer_orders(status);

create index if not exists customer_orders_date_idx
  on public.customer_orders(order_date desc);

create index if not exists customer_orders_price_group_idx
  on public.customer_orders(price_group_id);


-- ============================================================
-- ORDER ITEMS
-- Product / price information is snapshotted intentionally.
-- ============================================================

create table if not exists public.customer_order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.customer_orders(id)
    on update cascade
    on delete cascade,

  product_id uuid
    references public.products(id)
    on update cascade
    on delete set null,

  line_no integer not null,

  sku_snapshot text not null,
  product_name_snapshot text not null,

  quantity numeric(18,4) not null,
  unit_price numeric(18,4) not null,

  discount_percent numeric(7,3) not null default 0,
  discount_amount numeric(18,4) not null default 0,

  line_subtotal numeric(18,4) not null,
  line_total numeric(18,4) not null,

  price_source text not null default 'price_group',

  created_by uuid default auth.uid()
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),

  constraint customer_order_items_line_positive
    check (line_no > 0),

  constraint customer_order_items_quantity_positive
    check (quantity > 0),

  constraint customer_order_items_prices_non_negative
    check (
      unit_price >= 0
      and discount_percent >= 0
      and discount_percent <= 100
      and discount_amount >= 0
      and line_subtotal >= 0
      and line_total >= 0
    ),

  constraint customer_order_items_price_source_valid
    check (price_source in ('price_group', 'manual')),

  constraint customer_order_items_order_line_unique
    unique(order_id, line_no)
);

create index if not exists customer_order_items_order_idx
  on public.customer_order_items(order_id, line_no);

create index if not exists customer_order_items_product_idx
  on public.customer_order_items(product_id);


-- ============================================================
-- STATUS HISTORY
-- ============================================================

create table if not exists public.customer_order_status_history (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.customer_orders(id)
    on update cascade
    on delete cascade,

  from_status text,
  to_status text not null,

  note text,

  changed_by uuid default auth.uid()
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),

  constraint customer_order_status_history_to_valid
    check (
      to_status in (
        'draft',
        'confirmed',
        'in_preparation',
        'ready_for_shipment',
        'shipped',
        'delivered',
        'installation_scheduled',
        'installation_in_progress',
        'completed',
        'cancelled'
      )
    )
);

create index if not exists customer_order_status_history_order_idx
  on public.customer_order_status_history(order_id, created_at desc);


-- ============================================================
-- UPDATED METADATA
-- ============================================================

create or replace function public.set_customer_order_updated_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_customer_orders_updated
on public.customer_orders;

create trigger trg_customer_orders_updated
before update on public.customer_orders
for each row
execute function public.set_customer_order_updated_metadata();


-- ============================================================
-- ORDER NUMBER
-- ============================================================

create or replace function public.set_customer_order_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_number is null
     or trim(new.order_number) = ''
  then
    new.order_number :=
      'ORD-' ||
      lpad(
        nextval('public.customer_order_number_seq')::text,
        6,
        '0'
      );
  end if;

  new.order_number := upper(trim(new.order_number));
  new.currency_code := upper(trim(coalesce(new.currency_code, 'USD')));

  return new;
end;
$$;

drop trigger if exists trg_set_customer_order_defaults
on public.customer_orders;

create trigger trg_set_customer_order_defaults
before insert on public.customer_orders
for each row
execute function public.set_customer_order_defaults();


-- ============================================================
-- CREATE ORDER RPC
-- Transaction-safe creation + price / product snapshots.
-- ============================================================

create or replace function public.create_customer_order(
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
  p_initial_status text default 'draft'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_price_group_id uuid;
  v_price_group_name text;
  v_currency varchar(3);

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
  if not public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  ) then
    raise exception 'You do not have permission to create customer orders.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required.';
  end if;

  if not exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.status <> 'inactive'
  ) then
    raise exception 'Customer does not exist or is inactive.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
  then
    raise exception 'At least one order item is required.';
  end if;

  if p_tax_rate is null
     or p_tax_rate < 0
     or p_tax_rate > 100
  then
    raise exception 'Tax rate must be between 0 and 100.';
  end if;

  if p_order_discount_amount is null
     or p_order_discount_amount < 0
  then
    raise exception 'Order discount cannot be negative.';
  end if;

  if p_initial_status not in (
    'draft',
    'confirmed'
  ) then
    raise exception 'New orders can only start as Draft or Confirmed.';
  end if;

  if p_price_group_id is null then
    select c.price_group_id
    into v_price_group_id
    from public.customers c
    where c.id = p_customer_id;
  else
    v_price_group_id := p_price_group_id;
  end if;

  if v_price_group_id is null then
    select pg.id
    into v_price_group_id
    from public.price_groups pg
    where pg.is_base_price = true
      and pg.is_active = true
    order by pg.sort_order
    limit 1;
  end if;

  select pg.name
  into v_price_group_name
  from public.price_groups pg
  where pg.id = v_price_group_id
    and pg.is_active = true;

  if v_price_group_name is null then
    raise exception 'Price group does not exist or is inactive.';
  end if;

  select coalesce(c.currency_code, 'USD')
  into v_currency
  from public.customers c
  where c.id = p_customer_id;

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
    )
    into v_billing_snapshot
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
    )
    into v_shipping_snapshot
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
  )
  values (
    '',
    p_customer_id,
    p_initial_status,
    v_price_group_id,
    v_price_group_name,
    upper(v_currency),
    p_billing_address_id,
    p_shipping_address_id,
    v_billing_snapshot,
    v_shipping_snapshot,
    p_expected_delivery_date,
    nullif(trim(p_customer_reference), ''),
    nullif(trim(p_customer_notes), ''),
    nullif(trim(p_internal_notes), ''),
    round(p_order_discount_amount, 4),
    round(p_tax_rate, 3),
    case when p_initial_status = 'confirmed' then now() else null end
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;

    if v_item->>'product_id' is null then
      raise exception 'product_id is required for every order item.';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_discount_percent := coalesce((v_item->>'discount_percent')::numeric, 0);

    if v_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if v_discount_percent < 0 or v_discount_percent > 100 then
      raise exception 'Line discount must be between 0 and 100.';
    end if;

    select p.sku, p.name
    into v_sku, v_product_name
    from public.products p
    where p.id = v_product_id
      and p.status <> 'archived';

    if v_sku is null then
      raise exception 'Product % does not exist or is archived.', v_product_id;
    end if;

    if v_item ? 'unit_price'
       and v_item->'unit_price' <> 'null'::jsonb
       and trim(coalesce(v_item->>'unit_price', '')) <> ''
    then
      v_manual_price := (v_item->>'unit_price')::numeric;

      if v_manual_price < 0 then
        raise exception 'Manual unit price cannot be negative.';
      end if;

      v_unit_price := round(v_manual_price, 4);
      v_price_source := 'manual';
    else
      select pp.amount
      into v_unit_price
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

    v_line_subtotal := round(v_quantity * v_unit_price, 4);
    v_line_discount := round(v_line_subtotal * (v_discount_percent / 100), 4);
    v_line_total := round(v_line_subtotal - v_line_discount, 4);

    insert into public.customer_order_items (
      order_id,
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
      price_source
    )
    values (
      v_order_id,
      v_product_id,
      v_line_no,
      v_sku,
      v_product_name,
      round(v_quantity, 4),
      round(v_unit_price, 4),
      round(v_discount_percent, 3),
      v_line_discount,
      v_line_subtotal,
      v_line_total,
      v_price_source
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

  update public.customer_orders
  set
    item_count = v_item_count,
    subtotal = round(v_subtotal, 4),
    discount_amount = round(p_order_discount_amount, 4),
    tax_amount = v_tax_amount,
    total_amount = v_total
  where id = v_order_id;

  insert into public.customer_order_status_history (
    order_id,
    from_status,
    to_status,
    note
  )
  values (
    v_order_id,
    null,
    p_initial_status,
    'Order created'
  );

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata
  )
  values (
    p_customer_id,
    'order_created',
    'Order created',
    (select order_number from public.customer_orders where id = v_order_id),
    jsonb_build_object('order_id', v_order_id)
  );

  return v_order_id;
end;
$$;


-- ============================================================
-- SET ORDER STATUS RPC
-- ============================================================

create or replace function public.set_customer_order_status(
  p_order_id uuid,
  p_status text,
  p_note text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_status text;
  v_customer_id uuid;
  v_order_number text;
begin
  if not public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  ) then
    raise exception 'You do not have permission to update customer orders.';
  end if;

  if p_status not in (
    'draft',
    'confirmed',
    'in_preparation',
    'ready_for_shipment',
    'shipped',
    'delivered',
    'installation_scheduled',
    'installation_in_progress',
    'completed',
    'cancelled'
  ) then
    raise exception 'Invalid order status.';
  end if;

  select o.status, o.customer_id, o.order_number
  into v_old_status, v_customer_id, v_order_number
  from public.customer_orders o
  where o.id = p_order_id
  for update;

  if v_old_status is null then
    raise exception 'Order not found.';
  end if;

  if v_old_status = p_status then
    return v_old_status;
  end if;

  update public.customer_orders
  set
    status = p_status,
    confirmed_at = case
      when p_status = 'confirmed' and confirmed_at is null then now()
      else confirmed_at
    end,
    completed_at = case
      when p_status = 'completed' then now()
      else completed_at
    end,
    cancelled_at = case
      when p_status = 'cancelled' then now()
      else cancelled_at
    end
  where id = p_order_id;

  insert into public.customer_order_status_history (
    order_id,
    from_status,
    to_status,
    note
  )
  values (
    p_order_id,
    v_old_status,
    p_status,
    nullif(trim(p_note), '')
  );

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata
  )
  values (
    v_customer_id,
    'order_status_changed',
    'Order status changed',
    v_order_number || ': ' || replace(v_old_status, '_', ' ') || ' → ' || replace(p_status, '_', ' '),
    jsonb_build_object(
      'order_id', p_order_id,
      'from_status', v_old_status,
      'to_status', p_status
    )
  );

  return p_status;
end;
$$;


-- ============================================================
-- RLS
-- ============================================================

alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;
alter table public.customer_order_status_history enable row level security;

drop policy if exists customer_orders_read on public.customer_orders;
create policy customer_orders_read
on public.customer_orders
for select
to authenticated
using (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);

drop policy if exists customer_orders_insert on public.customer_orders;
create policy customer_orders_insert
on public.customer_orders
for insert
to authenticated
with check (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);

drop policy if exists customer_orders_update on public.customer_orders;
create policy customer_orders_update
on public.customer_orders
for update
to authenticated
using (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
)
with check (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);

-- No delete policy intentionally.

drop policy if exists customer_order_items_read on public.customer_order_items;
create policy customer_order_items_read
on public.customer_order_items
for select
to authenticated
using (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);

drop policy if exists customer_order_items_insert on public.customer_order_items;
create policy customer_order_items_insert
on public.customer_order_items
for insert
to authenticated
with check (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);

drop policy if exists customer_order_status_history_read on public.customer_order_status_history;
create policy customer_order_status_history_read
on public.customer_order_status_history
for select
to authenticated
using (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);

drop policy if exists customer_order_status_history_insert on public.customer_order_status_history;
create policy customer_order_status_history_insert
on public.customer_order_status_history
for insert
to authenticated
with check (
  public.current_user_has_any_role(
    array['super_admin', 'admin', 'sales']
  )
);


-- ============================================================
-- GRANTS
-- ============================================================

revoke all on public.customer_orders from anon;
revoke all on public.customer_order_items from anon;
revoke all on public.customer_order_status_history from anon;

grant select, insert, update
on public.customer_orders
to authenticated;

grant select, insert
on public.customer_order_items
to authenticated;

grant select, insert
on public.customer_order_status_history
to authenticated;

revoke all on function public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, text
) from public;
revoke all on function public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, text
) from anon;
grant execute on function public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, text
) to authenticated;

revoke all on function public.set_customer_order_status(uuid, text, text) from public;
revoke all on function public.set_customer_order_status(uuid, text, text) from anon;
grant execute on function public.set_customer_order_status(uuid, text, text) to authenticated;

commit;
