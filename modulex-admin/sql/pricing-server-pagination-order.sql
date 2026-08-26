-- Follow-up wrapper for pricing-server-pagination.sql.
-- The base RPCs choose the correct page using the requested server-side sort.
-- These wrappers preserve that same sort order in the JSON items array.
-- Apply immediately after pricing-server-pagination.sql.

alter function public.get_product_prices_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) rename to get_product_prices_page_raw;

create or replace function public.get_product_prices_page(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 50,
  p_status text default null,
  p_brand_id uuid default null,
  p_category_id uuid default null,
  p_stock_filter text default null,
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
with payload as (
  select public.get_product_prices_page_raw(
    p_query,
    p_page,
    p_page_size,
    p_status,
    p_brand_id,
    p_category_id,
    p_stock_filter,
    p_sort_by,
    p_sort_direction,
    p_currency_code
  ) as body
),
sorted_items as (
  select coalesce(
    jsonb_agg(
      item
      order by
        case when lower(coalesce(p_sort_by, 'sku')) = 'sku' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(item ->> 'sku') end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'sku' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(item ->> 'sku') end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'name' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(item ->> 'product_name') end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'name' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(item ->> 'product_name') end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'brand' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(coalesce(item ->> 'brand', '')) end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'brand' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(coalesce(item ->> 'brand', '')) end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'category' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(coalesce(item ->> 'category', '')) end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'category' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(coalesce(item ->> 'category', '')) end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'stock' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then nullif(item ->> 'available_stock', '')::numeric end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'stock' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then nullif(item ->> 'available_stock', '')::numeric end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'status' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then item ->> 'product_status' end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'status' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then item ->> 'product_status' end desc,
        lower(item ->> 'sku') asc,
        item ->> 'product_id' asc
    ),
    '[]'::jsonb
  ) as items
  from payload p
  cross join lateral jsonb_array_elements(coalesce(p.body -> 'items', '[]'::jsonb)) as e(item)
)
select jsonb_set(
  p.body,
  '{items}',
  s.items,
  true
)
from payload p
cross join sorted_items s;
$$;

alter function public.get_cost_margin_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) rename to get_cost_margin_page_raw;

create or replace function public.get_cost_margin_page(
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
with payload as (
  select public.get_cost_margin_page_raw(
    p_query,
    p_page,
    p_page_size,
    p_status,
    p_brand_id,
    p_category_id,
    p_stock_filter,
    p_margin_filter,
    p_sort_by,
    p_sort_direction,
    p_currency_code
  ) as body
),
sorted_items as (
  select coalesce(
    jsonb_agg(
      item
      order by
        case when lower(coalesce(p_sort_by, 'sku')) = 'sku' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(item ->> 'sku') end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'sku' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(item ->> 'sku') end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'name' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(item ->> 'product_name') end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'name' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(item ->> 'product_name') end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'brand' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(coalesce(item ->> 'brand', '')) end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'brand' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(coalesce(item ->> 'brand', '')) end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'category' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then lower(coalesce(item ->> 'category', '')) end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'category' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then lower(coalesce(item ->> 'category', '')) end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'stock' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then nullif(item ->> 'available_stock', '')::numeric end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'stock' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then nullif(item ->> 'available_stock', '')::numeric end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'status' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then item ->> 'product_status' end asc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'status' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then item ->> 'product_status' end desc,
        case when lower(coalesce(p_sort_by, 'sku')) = 'cost' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then nullif(item ->> 'cost_amount', '')::numeric end asc nulls last,
        case when lower(coalesce(p_sort_by, 'sku')) = 'cost' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then nullif(item ->> 'cost_amount', '')::numeric end desc nulls last,
        case when lower(coalesce(p_sort_by, 'sku')) = 'margin' and lower(coalesce(p_sort_direction, 'asc')) <> 'desc' then nullif(item ->> 'worst_margin', '')::numeric end asc nulls last,
        case when lower(coalesce(p_sort_by, 'sku')) = 'margin' and lower(coalesce(p_sort_direction, 'asc')) = 'desc' then nullif(item ->> 'worst_margin', '')::numeric end desc nulls last,
        lower(item ->> 'sku') asc,
        item ->> 'product_id' asc
    ),
    '[]'::jsonb
  ) as items
  from payload p
  cross join lateral jsonb_array_elements(coalesce(p.body -> 'items', '[]'::jsonb)) as e(item)
)
select jsonb_set(
  p.body,
  '{items}',
  s.items,
  true
)
from payload p
cross join sorted_items s;
$$;

revoke all on function public.get_product_prices_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) from public;
revoke all on function public.get_product_prices_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) from anon;
grant execute on function public.get_product_prices_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) to authenticated;

revoke all on function public.get_cost_margin_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) from public;
revoke all on function public.get_cost_margin_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) from anon;
grant execute on function public.get_cost_margin_page(
  text, integer, integer, text, uuid, uuid, text, text, text, text, text
) to authenticated;

-- The raw functions remain authenticated-only and SECURITY INVOKER so the wrappers
-- can call them without bypassing any underlying RLS policy.
revoke all on function public.get_product_prices_page_raw(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) from public;
revoke all on function public.get_product_prices_page_raw(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) from anon;
grant execute on function public.get_product_prices_page_raw(
  text, integer, integer, text, uuid, uuid, text, text, text, text
) to authenticated;

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
