-- Optimize Cost & Margin page by calculating per-product margin metrics once.
-- Keeps the public wrapper introduced by pricing-server-pagination-order.sql unchanged.

create or replace function public.get_cost_margin_page_raw(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 50,
  p_status text default null,
  p_brand_id uuid default null,
  p_category_id uuid default null,
  p_stock_filter text default null,
  p_margin_filter text default null,
  p_sort_by text default 'sku',
  p_sort_direction text default 'asc',
  p_currency_code text default 'USD'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page_number,
    greatest(10, least(coalesce(p_page_size, 50), 100)) as page_size,
    nullif(btrim(coalesce(p_query, '')), '') as search_query,
    case when p_status in ('active', 'inactive') then p_status else null end as status_filter,
    p_brand_id as brand_filter,
    p_category_id as category_filter,
    case when p_stock_filter in ('in_stock', 'out_of_stock') then p_stock_filter else null end as stock_filter,
    case when p_margin_filter in ('healthy', 'warning', 'critical', 'loss', 'missing_cost', 'no_price') then p_margin_filter else null end as margin_filter,
    case when lower(coalesce(p_sort_by, 'sku')) in ('sku', 'name', 'brand', 'category', 'stock', 'status', 'cost', 'margin')
      then lower(coalesce(p_sort_by, 'sku')) else 'sku' end as sort_by,
    case when lower(coalesce(p_sort_direction, 'asc')) = 'desc' then 'desc' else 'asc' end as sort_direction,
    upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD')) as currency_code
),
settings as (
  select
    coalesce(ps.default_min_margin_percent, 20)::numeric as default_min_margin_percent,
    coalesce(ps.warning_margin_buffer_percent, 5)::numeric as warning_margin_buffer_percent,
    coalesce(ps.currency_code, 'USD') as currency_code
  from public.pricing_settings ps
  where ps.id = 1
),
active_groups as (
  select pg.id, pg.system_key, pg.name, pg.sort_order, pg.is_base_price, pg.is_active, pg.color_key
  from public.price_groups pg
  where pg.is_active = true
),
current_prices as materialized (
  select pp.product_id, pp.price_group_id, pp.amount
  from public.product_prices pp
  join active_groups g on g.id = pp.price_group_id
  cross join params x
  where pp.is_active = true
    and pp.valid_to is null
    and pp.currency_code = x.currency_code
),
price_maps as (
  select cp.product_id,
         jsonb_object_agg(cp.price_group_id::text, cp.amount order by cp.price_group_id::text) as prices
  from current_prices cp
  group by cp.product_id
),
current_costs as materialized (
  select pc.product_id, pc.amount
  from public.product_costs pc
  cross join params x
  where pc.is_active = true
    and pc.valid_to is null
    and pc.currency_code = x.currency_code
),
stock as (
  select i.product_id,
         coalesce(sum(i.quantity - i.reserved_quantity), 0)::numeric as available_stock
  from public.inventory i
  group by i.product_id
),
base0 as materialized (
  select
    p.id as product_id,
    p.sku,
    p.barcode,
    p.name as product_name,
    p.brand_id,
    p.category_id,
    coalesce(pb.name, p.brand) as brand,
    coalesce(pc.name, p.category) as category,
    p.status::text as product_status,
    coalesce(st.available_stock, 0)::numeric as available_stock,
    cc.amount::numeric as cost_amount,
    pms.min_margin_percent::numeric as min_margin_override,
    coalesce(pm.prices, '{}'::jsonb) as prices,
    coalesce(pms.min_margin_percent, s.default_min_margin_percent, 20)::numeric as effective_min_margin,
    coalesce(s.warning_margin_buffer_percent, 5)::numeric as warning_buffer
  from public.products p
  left join public.product_brands pb on pb.id = p.brand_id
  left join public.product_categories pc on pc.id = p.category_id
  left join stock st on st.product_id = p.id
  left join current_costs cc on cc.product_id = p.id
  left join public.product_margin_settings pms on pms.product_id = p.id
  left join price_maps pm on pm.product_id = p.id
  cross join settings s
  where p.status::text in ('active', 'inactive')
),
margin_metrics as (
  select
    b.product_id,
    min(((cp.amount - b.cost_amount) / cp.amount) * 100)
      filter (where cp.amount > 0 and b.cost_amount is not null) as worst_margin,
    bool_or(cp.amount > 0) as has_price
  from base0 b
  left join current_prices cp on cp.product_id = b.product_id
  group by b.product_id
),
base as (
  select b.*,
    case
      when b.cost_amount is null then 'missing_cost'
      when coalesce(m.has_price, false) = false then 'no_price'
      when m.worst_margin < 0 then 'loss'
      when m.worst_margin < (b.effective_min_margin - b.warning_buffer) then 'critical'
      when m.worst_margin < b.effective_min_margin then 'warning'
      else 'healthy'
    end as margin_health,
    m.worst_margin
  from base0 b
  left join margin_metrics m on m.product_id = b.product_id
),
filtered as (
  select b.*
  from base b
  cross join params x
  where (
      x.search_query is null
      or b.sku ilike '%' || x.search_query || '%'
      or coalesce(b.barcode, '') ilike '%' || x.search_query || '%'
      or b.product_name ilike '%' || x.search_query || '%'
      or coalesce(b.brand, '') ilike '%' || x.search_query || '%'
      or coalesce(b.category, '') ilike '%' || x.search_query || '%'
    )
    and (x.status_filter is null or b.product_status = x.status_filter)
    and (x.brand_filter is null or b.brand_id = x.brand_filter)
    and (x.category_filter is null or b.category_id = x.category_filter)
    and (
      x.stock_filter is null
      or (x.stock_filter = 'in_stock' and b.available_stock > 0)
      or (x.stock_filter = 'out_of_stock' and b.available_stock <= 0)
    )
    and (x.margin_filter is null or b.margin_health = x.margin_filter)
),
totals as (
  select count(*)::integer as total_count from filtered
),
page_rows as (
  select f.*
  from filtered f
  cross join params x
  order by
    case when x.sort_by = 'sku' and x.sort_direction = 'asc' then lower(f.sku) end asc,
    case when x.sort_by = 'sku' and x.sort_direction = 'desc' then lower(f.sku) end desc,
    case when x.sort_by = 'name' and x.sort_direction = 'asc' then lower(f.product_name) end asc,
    case when x.sort_by = 'name' and x.sort_direction = 'desc' then lower(f.product_name) end desc,
    case when x.sort_by = 'brand' and x.sort_direction = 'asc' then lower(coalesce(f.brand, '')) end asc,
    case when x.sort_by = 'brand' and x.sort_direction = 'desc' then lower(coalesce(f.brand, '')) end desc,
    case when x.sort_by = 'category' and x.sort_direction = 'asc' then lower(coalesce(f.category, '')) end asc,
    case when x.sort_by = 'category' and x.sort_direction = 'desc' then lower(coalesce(f.category, '')) end desc,
    case when x.sort_by = 'stock' and x.sort_direction = 'asc' then f.available_stock end asc,
    case when x.sort_by = 'stock' and x.sort_direction = 'desc' then f.available_stock end desc,
    case when x.sort_by = 'status' and x.sort_direction = 'asc' then f.product_status end asc,
    case when x.sort_by = 'status' and x.sort_direction = 'desc' then f.product_status end desc,
    case when x.sort_by = 'cost' and x.sort_direction = 'asc' then f.cost_amount end asc nulls last,
    case when x.sort_by = 'cost' and x.sort_direction = 'desc' then f.cost_amount end desc nulls last,
    case when x.sort_by = 'margin' and x.sort_direction = 'asc' then f.worst_margin end asc nulls last,
    case when x.sort_by = 'margin' and x.sort_direction = 'desc' then f.worst_margin end desc nulls last,
    lower(f.sku) asc,
    f.product_id asc
  limit (select page_size from params)
  offset ((select page_number from params) - 1) * (select page_size from params)
),
items as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', r.product_id,
        'sku', r.sku,
        'barcode', r.barcode,
        'product_name', r.product_name,
        'brand_id', r.brand_id,
        'category_id', r.category_id,
        'brand', r.brand,
        'category', r.category,
        'product_status', r.product_status,
        'available_stock', r.available_stock,
        'cost_amount', r.cost_amount,
        'min_margin_override', r.min_margin_override,
        'effective_min_margin', r.effective_min_margin,
        'warning_buffer', r.warning_buffer,
        'margin_health', r.margin_health,
        'worst_margin', r.worst_margin,
        'prices', r.prices
      ) order by lower(r.sku), r.product_id
    ),
    '[]'::jsonb
  ) as rows
  from page_rows r
),
filtered_ids as (
  select coalesce(jsonb_agg(f.product_id order by lower(f.sku), f.product_id), '[]'::jsonb) as rows
  from filtered f
),
summary as (
  select
    count(*)::integer as total_products,
    count(*) filter (where cost_amount is not null)::integer as products_with_cost,
    count(*) filter (where cost_amount is null)::integer as missing_cost,
    count(*) filter (where margin_health in ('warning', 'critical', 'loss'))::integer as below_margin,
    count(*) filter (where margin_health = 'healthy')::integer as healthy
  from base
),
brand_options as (
  select coalesce(jsonb_agg(jsonb_build_object('id', pb.id, 'name', pb.name) order by lower(pb.name)), '[]'::jsonb) as rows
  from public.product_brands pb
),
category_options as (
  select coalesce(jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name) order by lower(pc.name)), '[]'::jsonb) as rows
  from public.product_categories pc
),
group_options as (
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', g.id,
      'system_key', g.system_key,
      'name', g.name,
      'sort_order', g.sort_order,
      'is_base_price', g.is_base_price,
      'is_active', g.is_active,
      'color_key', g.color_key
    ) order by g.sort_order, g.name),
    '[]'::jsonb
  ) as rows
  from active_groups g
),
setting_json as (
  select jsonb_build_object(
    'default_min_margin_percent', s.default_min_margin_percent,
    'warning_margin_buffer_percent', s.warning_margin_buffer_percent,
    'currency_code', s.currency_code
  ) as row
  from settings s
)
select jsonb_build_object(
  'items', i.rows,
  'filtered_ids', fi.rows,
  'total_count', t.total_count,
  'page', x.page_number,
  'page_size', x.page_size,
  'total_pages', greatest(1, ceil(t.total_count::numeric / x.page_size)::integer),
  'summary', jsonb_build_object(
    'total_products', s.total_products,
    'products_with_cost', s.products_with_cost,
    'missing_cost', s.missing_cost,
    'below_margin', s.below_margin,
    'healthy', s.healthy
  ),
  'filters', jsonb_build_object('brands', bo.rows, 'categories', co.rows),
  'price_groups', go.rows,
  'settings', sj.row
)
from items i
cross join filtered_ids fi
cross join totals t
cross join params x
cross join summary s
cross join brand_options bo
cross join category_options co
cross join group_options go
cross join setting_json sj;
$$;

revoke all on function public.get_cost_margin_page_raw(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) from public;
revoke all on function public.get_cost_margin_page_raw(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) from anon;
grant execute on function public.get_cost_margin_page_raw(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';