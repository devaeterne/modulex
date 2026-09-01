-- Additive order-line route snapshots. Existing historical rows are intentionally not backfilled.
alter table public.customer_order_items
  add column if not exists product_type_name_snapshot text,
  add column if not exists uom_code_snapshot text,
  add column if not exists pricing_model_snapshot text;

create or replace function private.snapshot_customer_order_item_product_route()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_type_name text;
  v_pricing_model text;
  v_uom_code text;
begin
  if new.product_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.product_id is not distinct from old.product_id then
    return new;
  end if;

  select pt.name, pt.pricing_model, u.code
    into v_type_name, v_pricing_model, v_uom_code
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  join public.units_of_measure u on u.id = p.uom_id
  where p.id = new.product_id;

  if v_type_name is null or v_uom_code is null then
    raise exception 'Order item requires canonical Product Type and UOM.';
  end if;

  new.product_type_name_snapshot := v_type_name;
  new.pricing_model_snapshot := v_pricing_model;
  new.uom_code_snapshot := v_uom_code;
  return new;
end;
$$;

revoke all on function private.snapshot_customer_order_item_product_route() from public, anon, authenticated;

drop trigger if exists trg_customer_order_items_product_route_snapshot on public.customer_order_items;
create trigger trg_customer_order_items_product_route_snapshot
before insert or update of product_id on public.customer_order_items
for each row execute function private.snapshot_customer_order_item_product_route();

comment on column public.customer_order_items.product_type_name_snapshot is 'Product Type display snapshot captured when product identity is written.';
comment on column public.customer_order_items.uom_code_snapshot is 'UOM snapshot for quantity semantics; never a pricing source.';
comment on column public.customer_order_items.pricing_model_snapshot is 'Pricing route snapshot captured at line identity write; history does not rebind to live Product Type pricing.';
