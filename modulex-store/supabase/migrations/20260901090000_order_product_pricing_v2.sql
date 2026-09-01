-- Orders Product Type pricing v2. Additive only; no production data mutation.
-- UOM describes quantity/measure semantics and never selects a pricing engine.

create or replace function private.resolve_customer_order_product_price(
  p_product_id uuid,
  p_price_group_id uuid,
  p_currency_code text
) returns numeric
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_model text;
  v_sku text;
  v_price numeric;
begin
  select pt.pricing_model, p.sku
    into v_model, v_sku
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  where p.id = p_product_id and p.status <> 'archived';

  if v_model is null then
    raise exception 'Product does not exist or is archived.';
  end if;
  if v_model = 'countertop_material_band' then
    raise exception 'Countertop material products cannot be added as ordinary order lines. Use the Countertop configurator.';
  end if;
  if v_model = 'none' then
    raise exception 'This Product Type has no commercial pricing route.';
  end if;
  if v_model <> 'price_group' then
    raise exception 'Unsupported Product Type pricing route.';
  end if;

  -- Canonical Price Group current-price source. Same effective-row contract used by A3.3.
  select pp.amount into v_price
  from public.product_prices pp
  where pp.product_id = p_product_id
    and pp.price_group_id = p_price_group_id
    and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc
  limit 1;

  if v_price is null then
    raise exception 'No current % price exists for SKU % in the selected price group.',
      upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD')), v_sku;
  end if;
  return round(v_price, 4);
end;
$$;
revoke all on function private.resolve_customer_order_product_price(uuid,uuid,text) from public, anon, authenticated;

create or replace function public.get_customer_order_product_quotes(
  p_product_ids uuid[],
  p_price_group_id uuid,
  p_currency_code text default 'USD'
) returns table(
  product_id uuid,
  unit_price numeric,
  product_type_name text,
  pricing_model text,
  uom_code text,
  pricing_route_reason text,
  can_add_ordinary_line boolean
)
language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select p.id,
    case when pt.pricing_model = 'price_group' then (
      select pp.amount from public.product_prices pp
      where pp.product_id = p.id and pp.price_group_id = p_price_group_id
        and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
        and pp.is_active = true and pp.valid_to is null
      order by pp.valid_from desc limit 1
    ) else null end,
    pt.name,
    pt.pricing_model,
    u.code,
    case
      when pt.pricing_model = 'countertop_material_band' then 'Use the Countertop configurator for material-band pricing.'
      when pt.pricing_model = 'none' then 'This Product Type has no commercial pricing route.'
      when not exists (
        select 1 from public.product_prices pp
        where pp.product_id = p.id and pp.price_group_id = p_price_group_id
          and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
          and pp.is_active = true and pp.valid_to is null
      ) then 'No current Price Group price is available.'
      else null
    end,
    pt.pricing_model = 'price_group' and exists (
      select 1 from public.product_prices pp
      where pp.product_id = p.id and pp.price_group_id = p_price_group_id
        and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
        and pp.is_active = true and pp.valid_to is null
    )
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  join public.units_of_measure u on u.id = p.uom_id
  where p.id = any(coalesce(p_product_ids, '{}'::uuid[])) and p.status <> 'archived';
$$;
revoke all on function public.get_customer_order_product_quotes(uuid[],uuid,text) from public, anon;
grant execute on function public.get_customer_order_product_quotes(uuid[],uuid,text) to authenticated;

create or replace function public.create_customer_order_v2(
  p_customer_id uuid, p_items jsonb, p_price_group_id uuid,
  p_billing_address_id uuid default null, p_shipping_address_id uuid default null,
  p_expected_delivery_date date default null, p_customer_reference text default null,
  p_customer_notes text default null, p_internal_notes text default null,
  p_tax_rate numeric default 0, p_order_discount_amount numeric default 0,
  p_payment_method_id uuid default null, p_payment_commission_percent numeric default null,
  p_initial_status text default 'draft', p_fulfillment_type text default 'delivery'
) returns uuid
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_sanitized jsonb := '[]'::jsonb;
  v_currency text;
  v_product_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'At least one order item is required.';
  end if;
  select coalesce(c.currency_code,'USD') into v_currency from public.customers c where c.id=p_customer_id;
  if v_currency is null then raise exception 'Customer does not exist.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    perform private.resolve_customer_order_product_price(v_product_id,p_price_group_id,v_currency);
    v_sanitized := v_sanitized || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'quantity', v_item->'quantity',
      'discount_percent', coalesce(v_item->'discount_percent','0'::jsonb)
    ));
  end loop;
  -- The canonical create RPC computes snapshots/totals and resolves the same current Price Group row.
  return public.create_customer_order(
    p_customer_id,v_sanitized,p_price_group_id,p_billing_address_id,p_shipping_address_id,
    p_expected_delivery_date,p_customer_reference,p_customer_notes,p_internal_notes,p_tax_rate,
    p_order_discount_amount,p_payment_method_id,p_payment_commission_percent,p_initial_status,p_fulfillment_type
  );
end;
$$;
revoke all on function public.create_customer_order_v2(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text) from public, anon;
grant execute on function public.create_customer_order_v2(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text) to authenticated;

create or replace function public.update_customer_order_v2(
  p_order_id uuid, p_items jsonb, p_price_group_id uuid,
  p_billing_address_id uuid default null, p_shipping_address_id uuid default null,
  p_expected_delivery_date date default null, p_customer_reference text default null,
  p_customer_notes text default null, p_internal_notes text default null,
  p_tax_rate numeric default 0, p_order_discount_amount numeric default 0,
  p_payment_method_id uuid default null, p_payment_commission_percent numeric default null,
  p_revision_reason text default null, p_fulfillment_type text default null
) returns integer
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_sanitized jsonb := '[]'::jsonb;
  v_currency text;
  v_product_id uuid;
  v_item_id uuid;
  v_price numeric;
  v_existing public.customer_order_items%rowtype;
begin
  select o.currency_code into v_currency from public.customer_orders o where o.id=p_order_id;
  if v_currency is null then raise exception 'Order not found.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_item_id := nullif(v_item->>'id','')::uuid;
    if v_item_id is not null and exists(select 1 from public.countertop_configurations c where c.order_item_id=v_item_id) then
      select * into v_existing from public.customer_order_items where id=v_item_id and order_id=p_order_id;
      if v_existing.id is null or v_existing.product_id is distinct from v_product_id then
        raise exception 'Configured countertop lines must be changed in the Countertop configurator.';
      end if;
      v_price := v_existing.unit_price;
    else
      v_price := private.resolve_customer_order_product_price(v_product_id,p_price_group_id,v_currency);
    end if;
    v_sanitized := v_sanitized || jsonb_build_array(jsonb_build_object(
      'id', v_item_id, 'product_id', v_product_id, 'quantity', v_item->'quantity',
      'unit_price', v_price, 'discount_percent', coalesce(v_item->'discount_percent','0'::jsonb)
    ));
  end loop;
  -- Canonical revision RPC owns snapshots, revision history, totals, approvals and configured-line guards.
  return public.update_customer_order(
    p_order_id,v_sanitized,p_price_group_id,p_billing_address_id,p_shipping_address_id,
    p_expected_delivery_date,p_customer_reference,p_customer_notes,p_internal_notes,p_tax_rate,
    p_order_discount_amount,p_payment_method_id,p_payment_commission_percent,p_revision_reason,p_fulfillment_type
  );
end;
$$;
revoke all on function public.update_customer_order_v2(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text) from public, anon;
grant execute on function public.update_customer_order_v2(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text) to authenticated;

-- Existing customer_order_items snapshots and countertop_reservation_quantity remain canonical;
-- no history is re-priced from live data and no second inventory/slab engine is introduced.
