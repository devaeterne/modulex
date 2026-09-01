-- Order Product Type/UOM pricing routing. Additive only; no production execution here.
-- Canonical engines remain: product_prices/price_groups for ordinary order lines and
-- calculate_countertop_price -> attach_countertop_configuration for countertops.

alter table public.customer_order_items
  add column if not exists product_type_code_snapshot text,
  add column if not exists product_type_name_snapshot text,
  add column if not exists uom_code_snapshot text,
  add column if not exists uom_name_snapshot text,
  add column if not exists pricing_model_snapshot text;

comment on column public.customer_order_items.pricing_model_snapshot is
  'Historical Product Type pricing route. UOM is measurement semantics only and never selects a pricing engine.';

create or replace function private.enforce_customer_order_product_pricing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product record;
  v_order record;
  v_group_price numeric(18,4);
  v_is_configured_countertop boolean := false;
begin
  if new.product_id is null then return new; end if;

  select p.sku, p.name, pt.code as product_type_code, pt.name as product_type_name,
         pt.pricing_model, u.code as uom_code, u.name as uom_name
  into v_product
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id and pt.is_active = true
  join public.units_of_measure u on u.id = p.uom_id and u.is_active = true
  where p.id = new.product_id and p.status <> 'archived';

  if not found then raise exception 'Product does not exist, is archived, or has inactive Product Type/UOM semantics.'; end if;

  -- Preserve snapshot history. Refresh only for a new line or an explicit product change.
  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    new.product_type_code_snapshot := v_product.product_type_code;
    new.product_type_name_snapshot := v_product.product_type_name;
    new.uom_code_snapshot := v_product.uom_code;
    new.uom_name_snapshot := v_product.uom_name;
    new.pricing_model_snapshot := v_product.pricing_model;
  end if;

  select o.price_group_id, o.currency_code, o.status into v_order
  from public.customer_orders o where o.id = new.order_id;
  if not found then raise exception 'Order not found.'; end if;

  if v_product.pricing_model = 'none' then
    raise exception 'No Commercial Pricing: this Product Type cannot be used on a commercial order line.';
  end if;

  if v_product.pricing_model = 'countertop_material_band' then
    -- Canonical countertop configuration updates an existing draft line and supplies
    -- countertop_reservation_quantity. Ordinary create/update must never price Stone
    -- from product_prices. calculate_countertop_price -> attach_countertop_configuration
    -- remains the only supported pricing route; slab stock remains governed by
    -- countertop_reservation_quantity and the existing reservation engine.
    v_is_configured_countertop := new.countertop_reservation_quantity is not null
      and new.countertop_reservation_quantity > 0;
    if not v_is_configured_countertop then
      raise exception 'Countertop Material Band: configure Stone through the canonical Countertop workspace; ordinary Order pricing is not supported.';
    end if;
    return new;
  end if;

  if v_product.pricing_model <> 'price_group' then
    raise exception 'Unsupported Product Type pricing route.';
  end if;

  select pp.amount into v_group_price
  from public.product_prices pp
  where pp.product_id = new.product_id
    and pp.price_group_id = v_order.price_group_id
    and pp.currency_code = coalesce(v_order.currency_code, 'USD')
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc
  limit 1;

  if v_group_price is null then
    raise exception 'Price Group pricing is unavailable for this product and order price group.';
  end if;

  -- Client-provided unit_price is ignored. Recompute all line money server-side.
  new.unit_price := round(v_group_price, 4);
  new.price_source := 'price_group';
  new.line_subtotal := round(new.quantity * new.unit_price, 4);
  new.discount_amount := round(new.line_subtotal * (coalesce(new.discount_percent,0) / 100), 4);
  new.line_total := round(new.line_subtotal - new.discount_amount, 4);
  return new;
end;
$$;

revoke all on function private.enforce_customer_order_product_pricing() from public, anon, authenticated;

drop trigger if exists trg_customer_order_product_pricing on public.customer_order_items;
create trigger trg_customer_order_product_pricing
before insert or update of product_id, quantity, unit_price, discount_percent, order_id, countertop_reservation_quantity
on public.customer_order_items
for each row execute function private.enforce_customer_order_product_pricing();

-- Backfill semantics only. Historical money remains untouched and is never re-priced.
update public.customer_order_items oi
set product_type_code_snapshot = pt.code,
    product_type_name_snapshot = pt.name,
    uom_code_snapshot = u.code,
    uom_name_snapshot = u.name,
    pricing_model_snapshot = pt.pricing_model
from public.products p
join public.product_types pt on pt.id = p.product_type_id
join public.units_of_measure u on u.id = p.uom_id
where oi.product_id = p.id
  and oi.product_type_code_snapshot is null;

-- Existing canonical Countertop pricing and inventory paths intentionally remain unchanged:
-- public.calculate_countertop_price -> public.attach_countertop_configuration
-- private.reserve_customer_order_item_stock consumes countertop_reservation_quantity for slabs.
