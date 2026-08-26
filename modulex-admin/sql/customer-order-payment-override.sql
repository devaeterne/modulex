begin;

alter table public.customer_orders
  add column if not exists payment_commission_default_percent numeric(7,3) not null default 0;

update public.customer_orders
set payment_commission_default_percent = payment_commission_percent
where payment_commission_default_percent = 0
  and payment_commission_percent <> 0;

alter table public.customer_orders
  drop constraint if exists customer_orders_payment_default_commission_range;

alter table public.customer_orders
  add constraint customer_orders_payment_default_commission_range
  check (
    payment_commission_default_percent >= 0
    and payment_commission_default_percent <= 100
  );

-- Replace the previous payment-aware RPC with an optional per-order override.
drop function if exists public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, uuid, text
);

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
  p_payment_method_id uuid default null,
  p_payment_commission_percent numeric default null,
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

  if p_customer_id is null then raise exception 'Customer is required.'; end if;

  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.status <> 'inactive'
  ) then
    raise exception 'Customer does not exist or is inactive.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required.';
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

    if v_quantity <= 0 then raise exception 'Order item quantity must be greater than zero.'; end if;
    if v_discount_percent < 0 or v_discount_percent > 100 then
      raise exception 'Line discount must be between 0 and 100.';
    end if;

    select p.sku, p.name into v_sku, v_product_name
    from public.products p
    where p.id = v_product_id and p.status <> 'archived';

    if v_sku is null then
      raise exception 'Product % does not exist or is archived.', v_product_id;
    end if;

    if v_item ? 'unit_price'
       and v_item->'unit_price' <> 'null'::jsonb
       and trim(coalesce(v_item->>'unit_price','')) <> '' then
      v_manual_price := (v_item->>'unit_price')::numeric;
      if v_manual_price < 0 then raise exception 'Manual unit price cannot be negative.'; end if;
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

    v_line_subtotal := round(v_quantity * v_unit_price, 4);
    v_line_discount := round(v_line_subtotal * (v_discount_percent / 100), 4);
    v_line_total := round(v_line_subtotal - v_line_discount, 4);

    insert into public.customer_order_items (
      order_id, product_id, line_no, sku_snapshot, product_name_snapshot,
      quantity, unit_price, discount_percent, discount_amount,
      line_subtotal, line_total, price_source
    ) values (
      v_order_id, v_product_id, v_line_no, v_sku, v_product_name,
      round(v_quantity, 4), round(v_unit_price, 4), round(v_discount_percent, 3),
      v_line_discount, v_line_subtotal, v_line_total, v_price_source
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
end;
$$;

revoke all on function public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, uuid, numeric, text
) from public;
revoke all on function public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, uuid, numeric, text
) from anon;
grant execute on function public.create_customer_order(
  uuid, jsonb, uuid, uuid, uuid, date, text, text, text, numeric, numeric, uuid, numeric, text
) to authenticated;

commit;
