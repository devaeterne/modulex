-- Preserve customer_order_items identity during revisions so countertop
-- configuration rows (and their historical snapshots) are not cascade-deleted.
+create or replace function public.update_customer_order(
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

  select coalesce(max(revision_number), 0) + 1 into v_revision_number
  from public.customer_order_revisions where order_id = p_order_id;

  insert into public.customer_order_revisions(order_id, revision_number, reason, order_snapshot, items_snapshot)
  values (
    p_order_id,
    v_revision_number,
    nullif(trim(p_revision_reason), ''),
    to_jsonb(v_order),
    coalesce((select jsonb_agg(to_jsonb(i) order by i.line_no) from public.customer_order_items i where i.order_id = p_order_id), '[]'::jsonb)
  );

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

    if v_product_id is null then raise exception 'Product is required for every line.'; end if;
    if v_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
    if v_unit_price < 0 then raise exception 'Unit price cannot be negative.'; end if;
    if v_discount_percent < 0 or v_discount_percent > 100 then raise exception 'Line discount must be between 0 and 100.'; end if;

    select p.sku, p.name into v_sku, v_product_name
    from public.products p where p.id = v_product_id and p.status <> 'archived';
    if v_sku is null then raise exception 'Product does not exist or is archived.'; end if;

    select pp.amount into v_current_group_price
    from public.product_prices pp
    where pp.product_id = v_product_id
      and pp.price_group_id = p_price_group_id
      and pp.currency_code = v_order.currency_code
      and pp.is_active = true and pp.valid_to is null
    order by pp.valid_from desc limit 1;

    v_price_source := case
      when v_current_group_price is not null and round(v_unit_price,4) = round(v_current_group_price,4) then 'price_group'
      else 'manual'
    end;

    v_line_subtotal := round(v_quantity * v_unit_price, 4);
    v_line_discount := round(v_line_subtotal * (v_discount_percent / 100), 4);
    v_line_total := round(v_line_subtotal - v_line_discount, 4);

    if v_item_id is null then
      insert into public.customer_order_items(order_id, product_id, line_no, sku_snapshot, product_name_snapshot, quantity, unit_price, discount_percent, discount_amount, line_subtotal, line_total, price_source)
      values (p_order_id, v_product_id, v_line_no, v_sku, v_product_name, round(v_quantity,4), round(v_unit_price,4), round(v_discount_percent,3), v_line_discount, v_line_subtotal, v_line_total, v_price_source)
      returning id into v_item_id;
      v_seen_ids := array_append(v_seen_ids, v_item_id);
    elsif not v_is_configured then
      update public.customer_order_items set product_id=v_product_id, line_no=v_line_no, sku_snapshot=v_sku, product_name_snapshot=v_product_name, quantity=round(v_quantity,4), unit_price=round(v_unit_price,4), discount_percent=round(v_discount_percent,3), discount_amount=v_line_discount, line_subtotal=v_line_subtotal, line_total=v_line_total, price_source=v_price_source where id=v_item_id;
    else
      update public.customer_order_items set line_no=v_line_no where id=v_item_id;
    end if;

    v_subtotal := v_subtotal + v_line_total;
    v_item_count := v_item_count + 1;
  end loop;

  for v_existing in select * from public.customer_order_items where order_id = p_order_id for update loop
    if not (v_existing.id = any(v_seen_ids)) and exists(select 1 from public.countertop_configurations where order_item_id = v_existing.id) then
      raise exception 'Configured countertop lines cannot be removed in a generic revision.';
    end if;
    if not (v_existing.id = any(v_seen_ids)) then delete from public.customer_order_items where id = v_existing.id; end if;
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
  values (v_order.customer_id, 'order_revised', 'Order revised', v_order.order_number || ' revision ' || v_revision_number,
    jsonb_build_object('order_id',p_order_id,'revision_number',v_revision_number,'reason',nullif(trim(p_revision_reason),'')));

  return v_revision_number;
end;
$$;

revoke all on function public.update_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text) from public;
