-- A2.4 — Low-stock & Reporting
-- Source of truth:
--   available = on_hand - reserved
--   min_stock_level = 0 means threshold is unset
--   Out of Stock is threshold-independent
--   Low Stock requires min_stock_level > 0 and positive available stock at/below threshold

create or replace view public.v_product_stock_summary
with (security_invoker = true)
as
with stock as (
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
    max(i.updated_at) as last_inventory_update
  from public.products p
  left join public.inventory i on i.product_id = p.id
  group by p.id, p.sku, p.barcode, p.name, p.brand, p.category, p.unit, p.min_stock_level, p.status
)
select
  stock.product_id,
  stock.sku,
  stock.barcode,
  stock.product_name,
  stock.brand,
  stock.category,
  stock.unit,
  stock.min_stock_level,
  stock.product_status,
  stock.location_count,
  stock.warehouse_count,
  stock.total_quantity,
  stock.total_reserved_quantity,
  stock.total_available_quantity,
  (
    stock.min_stock_level > 0
    and stock.total_available_quantity > 0
    and stock.total_available_quantity <= stock.min_stock_level
  ) as is_low_stock,
  case
    when stock.total_available_quantity <= 0 then 'OUT_OF_STOCK'::text
    when stock.min_stock_level > 0 and stock.total_available_quantity <= stock.min_stock_level then 'LOW_STOCK'::text
    when stock.total_reserved_quantity > 0 then 'PARTIALLY_RESERVED'::text
    else 'OK'::text
  end as stock_status,
  stock.last_inventory_update,
  (stock.min_stock_level > 0) as threshold_configured,
  (stock.total_available_quantity <= 0) as is_out_of_stock,
  (
    stock.total_available_quantity <= 0
    or (
      stock.min_stock_level > 0
      and stock.total_available_quantity <= stock.min_stock_level
    )
  ) as is_stock_alert
from stock;

create or replace view public.v_low_stock_products
with (security_invoker = true)
as
select
  s.product_id,
  s.sku,
  s.barcode,
  s.product_name,
  s.brand,
  s.category,
  s.unit,
  s.min_stock_level,
  s.product_status,
  s.total_quantity,
  s.total_reserved_quantity,
  s.total_available_quantity,
  s.is_low_stock,
  s.threshold_configured,
  s.is_out_of_stock,
  s.is_stock_alert,
  s.stock_status
from public.v_product_stock_summary s
where s.product_status = 'active'::public.product_status
  and s.is_stock_alert;

create or replace function public.get_low_stock_summary()
returns table (
  summary_active_products bigint,
  summary_stock_alerts bigint,
  summary_out_of_stock bigint,
  summary_thresholds_set bigint,
  summary_threshold_shortfall numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as summary_active_products,
    count(*) filter (where s.is_stock_alert)::bigint as summary_stock_alerts,
    count(*) filter (where s.is_out_of_stock)::bigint as summary_out_of_stock,
    count(*) filter (where s.threshold_configured)::bigint as summary_thresholds_set,
    coalesce(
      sum(
        case
          when s.is_low_stock then greatest(s.min_stock_level - s.total_available_quantity, 0::numeric)
          else 0::numeric
        end
      ),
      0::numeric
    ) as summary_threshold_shortfall
  from public.v_product_stock_summary s
  where s.product_status = 'active'::public.product_status;
$$;

create or replace function public.search_low_stock_page(
  p_query text default null,
  p_view text default 'alerts',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  product_id uuid,
  sku text,
  barcode text,
  product_name text,
  brand text,
  category text,
  unit text,
  min_stock_level numeric,
  product_status text,
  location_count bigint,
  warehouse_count bigint,
  total_quantity numeric,
  total_reserved_quantity numeric,
  total_available_quantity numeric,
  is_low_stock boolean,
  stock_status text,
  last_inventory_update timestamptz,
  threshold_configured boolean,
  is_out_of_stock boolean,
  is_stock_alert boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select s.*
    from public.v_product_stock_summary s
    where s.product_status = 'active'::public.product_status
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or lower(s.sku) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.barcode, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(s.product_name) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.brand, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.category, '')) like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        coalesce(nullif(p_view, ''), 'alerts') = 'all'
        or (coalesce(nullif(p_view, ''), 'alerts') = 'alerts' and s.is_stock_alert)
        or (coalesce(nullif(p_view, ''), 'alerts') = 'unset' and not s.threshold_configured)
      )
  ), totals as (
    select count(*)::bigint as total_count from filtered
  )
  select
    f.product_id,
    f.sku,
    f.barcode,
    f.product_name,
    f.brand,
    f.category,
    f.unit,
    f.min_stock_level,
    f.product_status::text,
    f.location_count,
    f.warehouse_count,
    f.total_quantity,
    f.total_reserved_quantity,
    f.total_available_quantity,
    f.is_low_stock,
    f.stock_status,
    f.last_inventory_update,
    f.threshold_configured,
    f.is_out_of_stock,
    f.is_stock_alert,
    t.total_count
  from filtered f
  cross join totals t
  order by f.sku, f.product_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 25), 500));
$$;

create or replace function public.search_inventory_product_report_page(
  p_query text default null,
  p_status text default 'all',
  p_category text default null,
  p_brand text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  product_id uuid,
  sku text,
  barcode text,
  product_name text,
  brand text,
  category text,
  unit text,
  min_stock_level numeric,
  product_status text,
  location_count bigint,
  warehouse_count bigint,
  total_quantity numeric,
  total_reserved_quantity numeric,
  total_available_quantity numeric,
  is_low_stock boolean,
  stock_status text,
  last_inventory_update timestamptz,
  threshold_configured boolean,
  is_out_of_stock boolean,
  is_stock_alert boolean,
  total_count bigint,
  summary_on_hand numeric,
  summary_reserved numeric,
  summary_available numeric,
  summary_low_stock bigint,
  summary_out_of_stock bigint,
  summary_thresholds_set bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select s.*
    from public.v_product_stock_summary s
    where s.product_status = 'active'::public.product_status
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or lower(s.sku) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.barcode, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(s.product_name) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.brand, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.category, '')) like '%' || lower(btrim(p_query)) || '%'
      )
      and (nullif(p_category, '') is null or s.category = p_category)
      and (nullif(p_brand, '') is null or s.brand = p_brand)
      and (
        coalesce(nullif(p_status, ''), 'all') = 'all'
        or (p_status = 'low' and s.is_low_stock)
        or (p_status = 'out' and s.is_out_of_stock)
        or (p_status = 'reserved' and s.stock_status = 'PARTIALLY_RESERVED')
        or (p_status = 'ok' and s.stock_status = 'OK')
        or (p_status = 'unset' and not s.threshold_configured)
        or (p_status = 'alert' and s.is_stock_alert)
      )
  ), totals as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(f.total_quantity), 0::numeric) as summary_on_hand,
      coalesce(sum(f.total_reserved_quantity), 0::numeric) as summary_reserved,
      coalesce(sum(f.total_available_quantity), 0::numeric) as summary_available,
      count(*) filter (where f.is_low_stock)::bigint as summary_low_stock,
      count(*) filter (where f.is_out_of_stock)::bigint as summary_out_of_stock,
      count(*) filter (where f.threshold_configured)::bigint as summary_thresholds_set
    from filtered f
  )
  select
    f.product_id,
    f.sku,
    f.barcode,
    f.product_name,
    f.brand,
    f.category,
    f.unit,
    f.min_stock_level,
    f.product_status::text,
    f.location_count,
    f.warehouse_count,
    f.total_quantity,
    f.total_reserved_quantity,
    f.total_available_quantity,
    f.is_low_stock,
    f.stock_status,
    f.last_inventory_update,
    f.threshold_configured,
    f.is_out_of_stock,
    f.is_stock_alert,
    t.total_count,
    t.summary_on_hand,
    t.summary_reserved,
    t.summary_available,
    t.summary_low_stock,
    t.summary_out_of_stock,
    t.summary_thresholds_set
  from filtered f
  cross join totals t
  order by f.sku, f.product_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

create or replace function public.search_inventory_location_report_page(
  p_query text default null,
  p_warehouse_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  location_id uuid,
  location_code text,
  location_name text,
  location_type text,
  warehouse_id uuid,
  warehouse_code text,
  warehouse_name text,
  zone_id uuid,
  zone_code text,
  zone_name text,
  product_count bigint,
  total_quantity numeric,
  total_reserved_quantity numeric,
  total_available_quantity numeric,
  max_capacity numeric,
  current_capacity numeric,
  capacity_usage_percent numeric,
  is_active boolean,
  total_count bigint,
  summary_occupied bigint,
  summary_product_slots numeric,
  summary_on_hand numeric,
  summary_reserved numeric,
  summary_available numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select s.*
    from public.v_location_stock_summary s
    where s.is_active
      and (p_warehouse_id is null or s.warehouse_id = p_warehouse_id)
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or lower(s.location_code) like '%' || lower(btrim(p_query)) || '%'
        or lower(s.location_name) like '%' || lower(btrim(p_query)) || '%'
        or lower(s.warehouse_code) like '%' || lower(btrim(p_query)) || '%'
        or lower(s.warehouse_name) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.zone_code, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(s.zone_name, '')) like '%' || lower(btrim(p_query)) || '%'
      )
  ), totals as (
    select
      count(*)::bigint as total_count,
      count(*) filter (where f.product_count > 0)::bigint as summary_occupied,
      coalesce(sum(f.product_count), 0::numeric) as summary_product_slots,
      coalesce(sum(f.total_quantity), 0::numeric) as summary_on_hand,
      coalesce(sum(f.total_reserved_quantity), 0::numeric) as summary_reserved,
      coalesce(sum(f.total_available_quantity), 0::numeric) as summary_available
    from filtered f
  )
  select
    f.location_id,
    f.location_code,
    f.location_name,
    f.location_type::text,
    f.warehouse_id,
    f.warehouse_code,
    f.warehouse_name,
    f.zone_id,
    f.zone_code,
    f.zone_name,
    f.product_count,
    f.total_quantity,
    f.total_reserved_quantity,
    f.total_available_quantity,
    f.max_capacity,
    f.current_capacity,
    f.capacity_usage_percent,
    f.is_active,
    t.total_count,
    t.summary_occupied,
    t.summary_product_slots,
    t.summary_on_hand,
    t.summary_reserved,
    t.summary_available
  from filtered f
  cross join totals t
  order by f.warehouse_code, f.location_code, f.location_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

create or replace function public.search_inventory_movement_report_page(
  p_query text default null,
  p_movement_type text default null,
  p_warehouse_id uuid default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  movement_id uuid,
  product_id uuid,
  sku text,
  product_name text,
  barcode text,
  movement_type text,
  quantity numeric,
  reference_no text,
  reason text,
  notes text,
  from_warehouse_id uuid,
  from_warehouse_code text,
  from_warehouse_name text,
  from_location_id uuid,
  from_location_code text,
  from_location_name text,
  to_warehouse_id uuid,
  to_warehouse_code text,
  to_warehouse_name text,
  to_location_id uuid,
  to_location_code text,
  to_location_name text,
  created_by_id uuid,
  created_by_email text,
  created_by_name text,
  created_at timestamptz,
  total_count bigint,
  summary_units numeric,
  summary_inbound numeric,
  summary_outbound numeric,
  summary_transfers numeric,
  summary_reservations numeric,
  summary_releases numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select h.*
    from public.v_inventory_movement_history h
    where (nullif(p_movement_type, '') is null or h.movement_type::text = p_movement_type)
      and (
        p_warehouse_id is null
        or h.from_warehouse_id = p_warehouse_id
        or h.to_warehouse_id = p_warehouse_id
      )
      and (p_created_from is null or h.created_at >= p_created_from)
      and (p_created_to is null or h.created_at <= p_created_to)
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or lower(coalesce(h.reference_no, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(h.sku) like '%' || lower(btrim(p_query)) || '%'
        or lower(h.product_name) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.barcode, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.reason, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.notes, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.created_by_name, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.created_by_email, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.from_location_code, '')) like '%' || lower(btrim(p_query)) || '%'
        or lower(coalesce(h.to_location_code, '')) like '%' || lower(btrim(p_query)) || '%'
      )
  ), totals as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(f.quantity), 0::numeric) as summary_units,
      coalesce(sum(f.quantity) filter (where f.movement_type::text in ('in', 'return')), 0::numeric) as summary_inbound,
      coalesce(sum(f.quantity) filter (where f.movement_type::text in ('out', 'damage')), 0::numeric) as summary_outbound,
      coalesce(sum(f.quantity) filter (where f.movement_type::text = 'transfer'), 0::numeric) as summary_transfers,
      coalesce(sum(f.quantity) filter (where f.movement_type::text = 'reservation'), 0::numeric) as summary_reservations,
      coalesce(sum(f.quantity) filter (where f.movement_type::text = 'release'), 0::numeric) as summary_releases
    from filtered f
  )
  select
    f.movement_id,
    f.product_id,
    f.sku,
    f.product_name,
    f.barcode,
    f.movement_type::text,
    f.quantity,
    f.reference_no,
    f.reason,
    f.notes,
    f.from_warehouse_id,
    f.from_warehouse_code,
    f.from_warehouse_name,
    f.from_location_id,
    f.from_location_code,
    f.from_location_name,
    f.to_warehouse_id,
    f.to_warehouse_code,
    f.to_warehouse_name,
    f.to_location_id,
    f.to_location_code,
    f.to_location_name,
    f.created_by_id,
    f.created_by_email,
    f.created_by_name,
    f.created_at,
    t.total_count,
    t.summary_units,
    t.summary_inbound,
    t.summary_outbound,
    t.summary_transfers,
    t.summary_reservations,
    t.summary_releases
  from filtered f
  cross join totals t
  order by f.created_at desc, f.movement_id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

create or replace function public.get_inventory_report_facets()
returns table (
  categories text[],
  brands text[],
  warehouses jsonb,
  movement_types text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(
      (
        select array_agg(x.category order by x.category)
        from (
          select distinct p.category
          from public.products p
          where p.status = 'active'::public.product_status
            and nullif(btrim(coalesce(p.category, '')), '') is not null
        ) x
      ),
      array[]::text[]
    ) as categories,
    coalesce(
      (
        select array_agg(x.brand order by x.brand)
        from (
          select distinct p.brand
          from public.products p
          where p.status = 'active'::public.product_status
            and nullif(btrim(coalesce(p.brand, '')), '') is not null
        ) x
      ),
      array[]::text[]
    ) as brands,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name)
          order by w.code
        )
        from public.warehouses w
        where w.is_active
      ),
      '[]'::jsonb
    ) as warehouses,
    coalesce(
      (
        select array_agg(x.movement_type order by x.movement_type)
        from (
          select distinct im.movement_type::text as movement_type
          from public.inventory_movements im
        ) x
      ),
      array[]::text[]
    ) as movement_types;
$$;

revoke execute on function public.get_low_stock_summary() from public, anon;
revoke execute on function public.search_low_stock_page(text, text, integer, integer) from public, anon;
revoke execute on function public.search_inventory_product_report_page(text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.search_inventory_location_report_page(text, uuid, integer, integer) from public, anon;
revoke execute on function public.search_inventory_movement_report_page(text, text, uuid, timestamptz, timestamptz, integer, integer) from public, anon;
revoke execute on function public.get_inventory_report_facets() from public, anon;

grant execute on function public.get_low_stock_summary() to authenticated;
grant execute on function public.search_low_stock_page(text, text, integer, integer) to authenticated;
grant execute on function public.search_inventory_product_report_page(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.search_inventory_location_report_page(text, uuid, integer, integer) to authenticated;
grant execute on function public.search_inventory_movement_report_page(text, text, uuid, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.get_inventory_report_facets() to authenticated;
