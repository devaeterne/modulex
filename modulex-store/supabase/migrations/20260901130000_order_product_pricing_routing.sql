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

-- Keep the existing canonical countertop attach implementation intact, but run it through
-- a transaction-local marker so ordinary Order DML cannot impersonate countertop configuration.
alter function private.attach_countertop_configuration(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, jsonb, numeric, numeric, text)
  rename to attach_countertop_configuration_order_pricing_v1;
revoke all on function private.attach_countertop_configuration_order_pricing_v1(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, jsonb, numeric, numeric, text)
  from public, anon, authenticated;

create function private.attach_countertop_configuration(
  p_order_item_id uuid,
  p_stone_product_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result uuid;
begin
  perform set_config('modulex.countertop_attach', '1', true);
  v_result := private.attach_countertop_configuration_order_pricing_v1(
    p_order_item_id, p_stone_product_id, p_price_group_id, p_sqft,
    p_edge_profile_id, p_edge_linear_ft, p_sink_product_id, p_services,
    p_configuration, p_manual_material_price, p_slab_quantity, p_override_reason
  );
  perform set_config('modulex.countertop_attach', '0', true);
  return v_result;
exception when others then
  perform set_config('modulex.countertop_attach', '0', true);
  raise;
end;
$$;
revoke all on function private.attach_countertop_configuration(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, jsonb, numeric, numeric, text)
  from public, anon;
grant execute on function private.attach_countertop_configuration(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, jsonb, numeric, numeric, text)
  to authenticated;

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
  v_countertop_attach boolean := false;
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
    v_countertop_attach := coalesce(current_setting('modulex.countertop_attach', true), '0') = '1';
    if not v_countertop_attach then
      raise exception 'Countertop Material Band: configure Stone through the canonical Countertop workspace; ordinary Order pricing is not supported.';
    end if;
    if new.countertop_reservation_quantity is null or new.countertop_reservation_quantity <= 0 then
      raise exception 'Countertop slab reservation quantity must be greater than zero.';
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
  order by pp.valid_from desc, pp.created_at desc
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

-- Legacy create/update functions calculate header totals inside their transaction. Re-project
-- those totals at transaction end from the already-authoritative line snapshots so a caller
-- cannot make header totals disagree with line totals by supplying a forged unit_price.
create or replace function private.reconcile_customer_order_totals_from_lines()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_order public.customer_orders%rowtype;
  v_subtotal numeric(18,4);
  v_taxable numeric(18,4);
  v_tax numeric(18,4);
  v_total numeric(18,4);
  v_commission numeric(18,4);
begin
  select * into v_order from public.customer_orders where id = v_order_id for update;
  if not found then return null; end if;

  select coalesce(sum(i.line_total),0) into v_subtotal
  from public.customer_order_items i where i.order_id = v_order_id;

  if coalesce(v_order.discount_amount,0) > v_subtotal then
    raise exception 'Order discount cannot exceed subtotal.';
  end if;

  v_taxable := greatest(v_subtotal - coalesce(v_order.discount_amount,0),0);
  v_tax := round(v_taxable * (coalesce(v_order.tax_rate,0) / 100),4);
  v_total := round(v_taxable + v_tax,4);
  v_commission := round(v_total * (coalesce(v_order.payment_commission_percent,0) / 100),4);

  update public.customer_orders
  set item_count = (select count(*) from public.customer_order_items where order_id = v_order_id),
      subtotal = round(v_subtotal,4),
      tax_amount = v_tax,
      total_amount = v_total,
      payment_commission_amount = v_commission,
      grand_total = round(v_total + v_commission,4)
  where id = v_order_id;
  return null;
end;
$$;
revoke all on function private.reconcile_customer_order_totals_from_lines() from public, anon, authenticated;

drop trigger if exists trg_customer_order_totals_authoritative on public.customer_order_items;
create constraint trigger trg_customer_order_totals_authoritative
after insert or update or delete on public.customer_order_items
deferrable initially deferred
for each row execute function private.reconcile_customer_order_totals_from_lines();

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
notify pgrst, 'reload schema';
