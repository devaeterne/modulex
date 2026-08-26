-- Server-side pagination, filtering and sorting for the Product List.
-- Keeps the existing search_products(...) RPC untouched for backward compatibility.

create or replace function public.get_products_page(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 50,
  p_status text default null,
  p_brand_id uuid default null,
  p_category_id uuid default null,
  p_sort_by text default 'sku',
  p_sort_direction text default 'asc'
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
      case
        when p_status in ('active', 'inactive', 'archived') then p_status
        else null
      end as status_filter,
      p_brand_id as brand_filter,
      p_category_id as category_filter,
      case
        when lower(coalesce(p_sort_by, 'sku')) in (
          'sku', 'name', 'brand', 'category', 'min_stock', 'status', 'created_at'
        ) then lower(coalesce(p_sort_by, 'sku'))
        else 'sku'
      end as sort_by,
      case
        when lower(coalesce(p_sort_direction, 'asc')) = 'desc' then 'desc'
        else 'asc'
      end as sort_direction
  ),
  filtered as (
    select
      p.id as product_id,
      p.sku,
      p.barcode,
      p.name as product_name,
      p.brand_id,
      p.category_id,
      coalesce(pb.name, p.brand) as brand,
      coalesce(pc.name, p.category) as category,
      p.unit,
      p.min_stock_level,
      p.status::text as product_status,
      p.created_at
    from public.products p
    left join public.product_brands pb on pb.id = p.brand_id
    left join public.product_categories pc on pc.id = p.category_id
    cross join params x
    where
      (
        x.search_query is null
        or p.sku ilike '%' || x.search_query || '%'
        or coalesce(p.barcode, '') ilike '%' || x.search_query || '%'
        or p.name ilike '%' || x.search_query || '%'
        or coalesce(pb.name, p.brand, '') ilike '%' || x.search_query || '%'
        or coalesce(pc.name, p.category, '') ilike '%' || x.search_query || '%'
      )
      and (x.status_filter is null or p.status::text = x.status_filter)
      and (x.brand_filter is null or p.brand_id = x.brand_filter)
      and (x.category_filter is null or p.category_id = x.category_filter)
  ),
  totals as (
    select count(*)::integer as total_count
    from filtered
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
      case when x.sort_by = 'min_stock' and x.sort_direction = 'asc' then f.min_stock_level end asc,
      case when x.sort_by = 'min_stock' and x.sort_direction = 'desc' then f.min_stock_level end desc,
      case when x.sort_by = 'status' and x.sort_direction = 'asc' then f.product_status end asc,
      case when x.sort_by = 'status' and x.sort_direction = 'desc' then f.product_status end desc,
      case when x.sort_by = 'created_at' and x.sort_direction = 'asc' then f.created_at end asc,
      case when x.sort_by = 'created_at' and x.sort_direction = 'desc' then f.created_at end desc,
      lower(f.sku) asc,
      f.product_id asc
    limit (select page_size from params)
    offset (
      (select page_number from params) - 1
    ) * (select page_size from params)
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
          'unit', r.unit,
          'min_stock_level', r.min_stock_level,
          'product_status', r.product_status,
          'created_at', r.created_at
        )
      ),
      '[]'::jsonb
    ) as rows
    from page_rows r
  ),
  brand_options as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', pb.id, 'name', pb.name)
        order by lower(pb.name)
      ),
      '[]'::jsonb
    ) as rows
    from public.product_brands pb
    where pb.status = 'active'
  ),
  category_options as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', pc.id, 'name', pc.name)
        order by lower(pc.name)
      ),
      '[]'::jsonb
    ) as rows
    from public.product_categories pc
    where pc.status = 'active'
  )
  select jsonb_build_object(
    'items', i.rows,
    'total_count', t.total_count,
    'page', x.page_number,
    'page_size', x.page_size,
    'total_pages', greatest(1, ceil(t.total_count::numeric / x.page_size)::integer),
    'filters', jsonb_build_object(
      'brands', b.rows,
      'categories', c.rows
    )
  )
  from items i
  cross join totals t
  cross join params x
  cross join brand_options b
  cross join category_options c;
$$;

revoke all on function public.get_products_page(text, integer, integer, text, uuid, uuid, text, text) from public;
revoke all on function public.get_products_page(text, integer, integer, text, uuid, uuid, text, text) from anon;
grant execute on function public.get_products_page(text, integer, integer, text, uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
