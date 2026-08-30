begin;

-- A2.4 source of truth:
--   products.min_stock_level = 0 means "threshold not configured".
--   A configured product is low when Available (On Hand - Reserved) <= threshold.
create or replace view public.v_product_stock_summary
with (security_invoker = true)
as
select
  p.id as product_id, p.sku, p.barcode, p.name as product_name, p.brand,
  p.category, p.unit, p.min_stock_level, p.status as product_status,
  count(distinct i.location_id) as location_count,
  count(distinct i.warehouse_id) as warehouse_count,
  coalesce(sum(i.quantity), 0::numeric) as total_quantity,
  coalesce(sum(i.reserved_quantity), 0::numeric) as total_reserved_quantity,
  coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) as total_available_quantity,
  p.min_stock_level > 0
    and coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) <= p.min_stock_level as is_low_stock,
  case
    when p.min_stock_level > 0
      and coalesce(sum(i.quantity - i.reserved_quantity), 0::numeric) <= p.min_stock_level then 'LOW_STOCK'::text
    when coalesce(sum(i.reserved_quantity), 0::numeric) > 0 then 'PARTIALLY_RESERVED'::text
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
  product_id, sku, barcode, product_name, brand, category, unit, min_stock_level,
  product_status, total_quantity, total_reserved_quantity, total_available_quantity,
  is_low_stock
from public.v_product_stock_summary
where product_status = 'active'::product_status and is_low_stock;

create index if not exists inventory_movements_from_warehouse_created_at_idx
  on public.inventory_movements (from_warehouse_id, created_at desc) where from_warehouse_id is not null;
create index if not exists inventory_movements_to_warehouse_created_at_idx
  on public.inventory_movements (to_warehouse_id, created_at desc) where to_warehouse_id is not null;

create or replace function public.get_inventory_report_filter_options()
returns table(filter_kind text, filter_key text, filter_label text)
language sql stable set search_path = public
as $$
  select 'brand', p.brand, p.brand from public.products p
  where p.status = 'active'::product_status and nullif(trim(p.brand), '') is not null
  group by p.brand
  union all
  select 'category', p.category, p.category from public.products p
  where p.status = 'active'::product_status and nullif(trim(p.category), '') is not null
  group by p.category
  union all
  select 'warehouse', w.id::text, w.code || ' · ' || w.name from public.warehouses w
  where w.is_active
  order by 1, 3;
$$;

create or replace function public.search_low_stock_page(
  p_query text default '', p_view text default 'alerts', p_offset integer default 0,
  p_limit integer default 25, p_export_all boolean default false
)
returns table(
  product_id uuid, sku text, barcode text, product_name text, brand text, category text,
  unit text, min_stock_level numeric, product_status product_status, location_count bigint,
  warehouse_count bigint, total_quantity numeric, total_reserved_quantity numeric,
  total_available_quantity numeric, is_low_stock boolean, stock_status text,
  last_inventory_update timestamptz, total_count bigint
)
language sql stable set search_path = public
as $$
  select v.*, count(*) over ()
  from public.v_product_stock_summary v
  where v.product_status = 'active'::product_status
    and (coalesce(p_view, 'alerts') = 'all'
      or (p_view = 'alerts' and v.is_low_stock)
      or (p_view = 'unset' and v.min_stock_level = 0))
    and (coalesce(trim(p_query), '') = '' or concat_ws(' ', v.sku, v.barcode, v.product_name, v.brand, v.category) ilike '%' || trim(p_query) || '%')
  order by v.sku, v.product_id
  limit case when p_export_all then null else greatest(1, least(coalesce(p_limit, 25), 100)) end
  offset case when p_export_all then 0 else greatest(0, coalesce(p_offset, 0)) end;
$$;

create or replace function public.search_inventory_product_report_page(
  p_query text default '', p_status text default null, p_category text default null,
  p_brand text default null, p_offset integer default 0, p_limit integer default 25,
  p_export_all boolean default false
)
returns table(
  product_id uuid, sku text, barcode text, product_name text, brand text, category text,
  unit text, min_stock_level numeric, product_status product_status, location_count bigint,
  warehouse_count bigint, total_quantity numeric, total_reserved_quantity numeric,
  total_available_quantity numeric, is_low_stock boolean, stock_status text,
  last_inventory_update timestamptz, total_count bigint
)
language sql stable set search_path = public
as $$
  select v.*, count(*) over ()
  from public.v_product_stock_summary v
  where v.product_status = 'active'::product_status
    and (p_status is null or p_status = 'all'
      or (p_status = 'low' and v.is_low_stock and v.total_available_quantity > 0)
      or (p_status = 'out' and v.total_available_quantity <= 0)
      or (p_status = 'reserved' and not v.is_low_stock and v.total_reserved_quantity > 0)
      or (p_status = 'ok' and not v.is_low_stock and v.total_reserved_quantity = 0))
    and (p_category is null or p_category = 'all' or v.category = p_category)
    and (p_brand is null or p_brand = 'all' or v.brand = p_brand)
    and (coalesce(trim(p_query), '') = '' or concat_ws(' ', v.sku, v.barcode, v.product_name, v.brand, v.category) ilike '%' || trim(p_query) || '%')
  order by v.sku, v.product_id
  limit case when p_export_all then null else greatest(1, least(coalesce(p_limit, 25), 100)) end
  offset case when p_export_all then 0 else greatest(0, coalesce(p_offset, 0)) end;
$$;

create or replace function public.search_inventory_location_report_page(
  p_query text default '', p_warehouse_id uuid default null, p_offset integer default 0,
  p_limit integer default 25, p_export_all boolean default false
)
returns table(
  location_id uuid, location_code text, location_name text, location_type location_type,
  warehouse_id uuid, warehouse_code text, warehouse_name text, zone_id uuid, zone_code text,
  zone_name text, product_count bigint, total_quantity numeric, total_reserved_quantity numeric,
  total_available_quantity numeric, max_capacity numeric, current_capacity numeric,
  capacity_usage_percent numeric, is_active boolean, total_count bigint
)
language sql stable set search_path = public
as $$
  select
    v.location_id, v.location_code, v.location_name, v.location_type,
    v.warehouse_id, v.warehouse_code, v.warehouse_name,
    v.zone_id, v.zone_code, v.zone_name, v.product_count,
    v.total_quantity, v.total_reserved_quantity, v.total_available_quantity,
    v.max_capacity, v.current_capacity, v.capacity_usage_percent, v.is_active,
    count(*) over ()
  from public.v_location_stock_summary v
  where v.is_active
    and (p_warehouse_id is null or v.warehouse_id = p_warehouse_id)
    and (coalesce(trim(p_query), '') = '' or concat_ws(' ', v.location_code, v.location_name, v.warehouse_code, v.warehouse_name, v.zone_code, v.zone_name) ilike '%' || trim(p_query) || '%')
  order by v.warehouse_code, v.location_code, v.location_id
  limit case when p_export_all then null else greatest(1, least(coalesce(p_limit, 25), 100)) end
  offset case when p_export_all then 0 else greatest(0, coalesce(p_offset, 0)) end;
$$;

create or replace function public.search_inventory_movement_report_page(
  p_query text default '', p_movement_type text default null, p_warehouse_id uuid default null,
  p_date_from timestamptz default null, p_date_to timestamptz default null,
  p_offset integer default 0, p_limit integer default 50, p_export_all boolean default false
)
returns table(
  movement_id uuid, product_id uuid, sku text, product_name text, barcode text,
  movement_type inventory_movement_type, quantity numeric, reference_no text, reason text, notes text,
  from_warehouse_id uuid, from_warehouse_code text, from_warehouse_name text,
  from_location_id uuid, from_location_code text, from_location_name text,
  to_warehouse_id uuid, to_warehouse_code text, to_warehouse_name text,
  to_location_id uuid, to_location_code text, to_location_name text,
  created_by_id uuid, created_by_email text, created_by_name text, created_at timestamptz,
  total_count bigint
)
language sql stable set search_path = public
as $$
  select v.*, count(*) over ()
  from public.v_inventory_movement_history v
  where (p_movement_type is null or p_movement_type = 'all' or v.movement_type::text = p_movement_type)
    and (p_warehouse_id is null or v.from_warehouse_id = p_warehouse_id or v.to_warehouse_id = p_warehouse_id)
    and (p_date_from is null or v.created_at >= p_date_from)
    and (p_date_to is null or v.created_at < p_date_to)
    and (coalesce(trim(p_query), '') = '' or concat_ws(' ', v.reference_no, v.sku, v.product_name, v.barcode, v.reason, v.notes, v.created_by_name, v.created_by_email, v.from_location_code, v.to_location_code) ilike '%' || trim(p_query) || '%')
  order by v.created_at desc, v.movement_id desc
  limit case when p_export_all then null else greatest(1, least(coalesce(p_limit, 50), 200)) end
  offset case when p_export_all then 0 else greatest(0, coalesce(p_offset, 0)) end;
$$;

revoke all on function public.search_low_stock_page(text, text, integer, integer, boolean) from public;
revoke all on function public.search_inventory_product_report_page(text, text, text, text, integer, integer, boolean) from public;
revoke all on function public.search_inventory_location_report_page(text, uuid, integer, integer, boolean) from public;
revoke all on function public.search_inventory_movement_report_page(text, text, uuid, timestamptz, timestamptz, integer, integer, boolean) from public;
revoke all on function public.get_inventory_report_filter_options() from public;

grant execute on function public.search_low_stock_page(text, text, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.search_inventory_product_report_page(text, text, text, text, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.search_inventory_location_report_page(text, uuid, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.search_inventory_movement_report_page(text, text, uuid, timestamptz, timestamptz, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.get_inventory_report_filter_options() to authenticated, service_role;

commit;
