-- Low stock and reporting support
-- Keeps low-stock calculations aligned with sellable availability:
-- available stock = physical quantity - reserved quantity.

create or replace view public.v_product_stock_summary
with (security_invoker = true)
as
select
  p.id as product_id,
  p.sku,
  p.barcode,
  p.name as product_name,
  p.brand,
  p.category,
  p.unit,
  p.min_stock_level,
  p.status as product_status,
  count(distinct i.location_id) as location_count,
  count(distinct i.warehouse_id) as warehouse_count,
  coalesce(sum(i.quantity), 0::numeric) as total_quantity,
  coalesce(sum(i.reserved_quantity), 0::numeric) as total_reserved_quantity,
  coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) as total_available_quantity,
  coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) <= p.min_stock_level as is_low_stock,
  case
    when coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) <= p.min_stock_level then 'LOW_STOCK'::text
    when coalesce(sum(i.reserved_quantity), 0::numeric) > 0::numeric then 'PARTIALLY_RESERVED'::text
    else 'OK'::text
  end as stock_status,
  max(i.updated_at) as last_inventory_update
from public.products p
left join public.inventory i on i.product_id = p.id
group by p.id, p.sku, p.barcode, p.name, p.brand, p.category, p.unit, p.min_stock_level, p.status;

create or replace view public.v_low_stock_products
with (security_invoker = true)
as
select
  p.id as product_id,
  p.sku,
  p.barcode,
  p.name as product_name,
  p.brand,
  p.category,
  p.unit,
  p.min_stock_level,
  p.status as product_status,
  coalesce(sum(i.quantity), 0::numeric) as total_quantity,
  coalesce(sum(i.reserved_quantity), 0::numeric) as total_reserved_quantity,
  coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) as total_available_quantity,
  true as is_low_stock
from public.products p
left join public.inventory i on i.product_id = p.id
where p.status = 'active'::product_status
group by p.id, p.sku, p.barcode, p.name, p.brand, p.category, p.unit, p.min_stock_level, p.status
having coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) <= p.min_stock_level;
