-- Product Type-aware pricing routing.
--
-- Product Type selects the supported pricing engine:
--   price_group                -> public.product_prices + public.price_groups
--   countertop_material_band   -> countertop stone profile -> material band
--   none                       -> no commercial product price
--
-- Keep the legacy pricing directory RPC intact for rollout compatibility and add
-- a v2 directory for the Admin UI. Harden the canonical price mutation boundary
-- so a non-price_group Product Type cannot receive a new Price Group amount.

create or replace function public.get_product_prices_page_v2(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 50,
  p_status text default null,
  p_brand_id uuid default null,
  p_category_id uuid default null,
  p_stock_filter text default null,
  p_product_type_id uuid default null,
  p_uom_id uuid default null,
  p_sort_by text default 'sku',
  p_sort_direction text default 'asc',
  p_currency_code text default 'USD'
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page_number,
    greatest(10, least(coalesce(p_page_size, 50), 100)) as page_size,
    nullif(btrim(coalesce(p_query, '')), '') as search_query,
    case when p_status in ('active', 'inactive') then p_status else null end as status_filter,
    p_brand_id as brand_filter,
    p_category_id as category_filter,
    case when p_stock_filter in ('in_stock', 'out_of_stock') then p_stock_filter else null end as stock_filter,
    p_product_type_id as product_type_filter,
    p_uom_id as uom_filter,
    case
      when lower(coalesce(p_sort_by, 'sku')) in ('sku', 'name', 'brand', 'category', 'stock', 'status', 'product_type', 'uom')
        then lower(coalesce(p_sort_by, 'sku'))
      else 'sku'
    end as sort_by,
    case when lower(coalesce(p_sort_direction, 'asc')) = 'desc' then 'desc' else 'asc' end as sort_direction,
    upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD')) as currency_code
),
active_groups as (
  select pg.id, pg.system_key, pg.name, pg.sort_order, pg.is_base_price, pg.is_active, pg.color_key
  from public.price_groups pg
  where pg.is_active = true
),
current_prices as (
  select pp.product_id, pp.price_group_id, pp.amount
  from public.product_prices pp
  join active_groups g on g.id = pp.price_group_id
  cross join params x
  where pp.is_active = true
    and pp.valid_to is null
    and pp.currency_code = x.currency_code
),
price_maps as (
  select
    cp.product_id,
    jsonb_object_agg(cp.price_group_id::text, cp.amount order by cp.price_group_id::text) as prices
  from current_prices cp
  group by cp.product_id
),
stock as (
  select
    i.product_id,
    coalesce(sum(i.quantity - i.reserved_quantity), 0)::numeric as available_stock
  from public.inventory i
  group by i.product_id
),
base as (
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
    p.product_type_id,
    pt.code as product_type_code,
    pt.name as product_type_name,
    pt.pricing_model,
    p.uom_id,
    u.code as uom_code,
    u.name as uom_name,
    coalesce(s.available_stock, 0)::numeric as available_stock,
    coalesce(pm.prices, '{}'::jsonb) as prices
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  join public.units_of_measure u on u.id = p.uom_id
  left join public.product_brands pb on pb.id = p.brand_id
  left join public.product_categories pc on pc.id = p.category_id
  left join stock s on s.product_id = p.id
  left join price_maps pm on pm.product_id = p.id
  where p.status::text in ('active', 'inactive')
    and pt.pricing_model = 'price_group'
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
      or b.product_type_name ilike '%' || x.search_query || '%'
      or b.product_type_code ilike '%' || x.search_query || '%'
      or b.uom_name ilike '%' || x.search_query || '%'
      or b.uom_code ilike '%' || x.search_query || '%'
    )
    and (x.status_filter is null or b.product_status = x.status_filter)
    and (x.brand_filter is null or b.brand_id = x.brand_filter)
    and (x.category_filter is null or b.category_id = x.category_filter)
    and (x.product_type_filter is null or b.product_type_id = x.product_type_filter)
    and (x.uom_filter is null or b.uom_id = x.uom_filter)
    and (
      x.stock_filter is null
      or (x.stock_filter = 'in_stock' and b.available_stock > 0)
      or (x.stock_filter = 'out_of_stock' and b.available_stock <= 0)
    )
),
totals as (
  select count(*)::integer as total_count
  from filtered
),
ordered as (
  select
    f.*,
    row_number() over (
      order by
        case when x.sort_by = 'sku' and x.sort_direction = 'asc' then lower(f.sku) end asc,
        case when x.sort_by = 'sku' and x.sort_direction = 'desc' then lower(f.sku) end desc,
        case when x.sort_by = 'name' and x.sort_direction = 'asc' then lower(f.product_name) end asc,
        case when x.sort_by = 'name' and x.sort_direction = 'desc' then lower(f.product_name) end desc,
        case when x.sort_by = 'brand' and x.sort_direction = 'asc' then lower(coalesce(f.brand, '')) end asc,
        case when x.sort_by = 'brand' and x.sort_direction = 'desc' then lower(coalesce(f.brand, '')) end desc,
        case when x.sort_by = 'category' and x.sort_direction = 'asc' then lower(coalesce(f.category, '')) end asc,
        case when x.sort_by = 'category' and x.sort_direction = 'desc' then lower(coalesce(f.category, '')) end desc,
        case when x.sort_by = 'product_type' and x.sort_direction = 'asc' then lower(f.product_type_name) end asc,
        case when x.sort_by = 'product_type' and x.sort_direction = 'desc' then lower(f.product_type_name) end desc,
        case when x.sort_by = 'uom' and x.sort_direction = 'asc' then lower(f.uom_code) end asc,
        case when x.sort_by = 'uom' and x.sort_direction = 'desc' then lower(f.uom_code) end desc,
        case when x.sort_by = 'stock' and x.sort_direction = 'asc' then f.available_stock end asc,
        case when x.sort_by = 'stock' and x.sort_direction = 'desc' then f.available_stock end desc,
        case when x.sort_by = 'status' and x.sort_direction = 'asc' then f.product_status end asc,
        case when x.sort_by = 'status' and x.sort_direction = 'desc' then f.product_status end desc,
        lower(f.sku) asc,
        f.product_id asc
    ) as page_order
  from filtered f
  cross join params x
),
page_rows as (
  select o.*
  from ordered o
  cross join params x
  where o.page_order > (x.page_number - 1) * x.page_size
    and o.page_order <= x.page_number * x.page_size
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
        'product_type_id', r.product_type_id,
        'product_type_code', r.product_type_code,
        'product_type_name', r.product_type_name,
        'pricing_model', r.pricing_model,
        'uom_id', r.uom_id,
        'uom_code', r.uom_code,
        'uom_name', r.uom_name,
        'available_stock', r.available_stock,
        'prices', r.prices
      ) order by r.page_order
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
    (select count(*)::integer from base) as total_products,
    (select count(*)::integer from active_groups) as price_groups,
    (
      select count(distinct (cp.product_id, cp.price_group_id))::integer
      from current_prices cp
      join base b on b.product_id = cp.product_id
    ) as filled_prices
),
routing_summary as (
  select
    count(*) filter (where pt.pricing_model = 'price_group')::integer as price_group_products,
    count(*) filter (where pt.pricing_model = 'countertop_material_band')::integer as material_band_products,
    count(*) filter (where pt.pricing_model = 'none')::integer as no_pricing_products
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  where p.status::text in ('active', 'inactive')
),
brand_options as (
  select coalesce(
    jsonb_agg(jsonb_build_object('id', pb.id, 'name', pb.name) order by lower(pb.name)),
    '[]'::jsonb
  ) as rows
  from public.product_brands pb
),
category_options as (
  select coalesce(
    jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name) order by lower(pc.name)),
    '[]'::jsonb
  ) as rows
  from public.product_categories pc
),
product_type_options as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', x.id, 'name', x.name, 'code', x.code)
      order by lower(x.name), x.code
    ),
    '[]'::jsonb
  ) as rows
  from (
    select distinct pt.id, pt.name, pt.code
    from base b
    join public.product_types pt on pt.id = b.product_type_id
  ) x
),
uom_options as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', x.id, 'name', x.name, 'code', x.code)
      order by lower(x.name), x.code
    ),
    '[]'::jsonb
  ) as rows
  from (
    select distinct u.id, u.name, u.code
    from base b
    join public.units_of_measure u on u.id = b.uom_id
  ) x
),
group_options as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'system_key', g.system_key,
        'name', g.name,
        'sort_order', g.sort_order,
        'is_base_price', g.is_base_price,
        'is_active', g.is_active,
        'color_key', g.color_key
      ) order by g.sort_order, g.name
    ),
    '[]'::jsonb
  ) as rows
  from active_groups g
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
    'price_groups', s.price_groups,
    'filled_prices', s.filled_prices,
    'missing_prices', greatest(0, s.total_products * s.price_groups - s.filled_prices)
  ),
  'routing_summary', jsonb_build_object(
    'price_group_products', rs.price_group_products,
    'material_band_products', rs.material_band_products,
    'no_pricing_products', rs.no_pricing_products
  ),
  'filters', jsonb_build_object(
    'brands', bo.rows,
    'categories', co.rows,
    'product_types', pto.rows,
    'uoms', uo.rows
  ),
  'price_groups', go.rows
)
from items i
cross join filtered_ids fi
cross join totals t
cross join params x
cross join summary s
cross join routing_summary rs
cross join brand_options bo
cross join category_options co
cross join product_type_options pto
cross join uom_options uo
cross join group_options go;
$function$;

revoke all on function public.get_product_prices_page_v2(
  text, integer, integer, text, uuid, uuid, text, uuid, uuid, text, text, text
) from public;
revoke all on function public.get_product_prices_page_v2(
  text, integer, integer, text, uuid, uuid, text, uuid, uuid, text, text, text
) from anon;
grant execute on function public.get_product_prices_page_v2(
  text, integer, integer, text, uuid, uuid, text, uuid, uuid, text, text, text
) to authenticated;

create or replace function public.set_product_price(
  p_product_id uuid,
  p_price_group_id uuid,
  p_amount numeric,
  p_currency_code text default 'EUR'
)
returns uuid
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_currency varchar(3);
  v_current_id uuid;
  v_current_amount numeric(18,4);
  v_new_id uuid;
  v_pricing_model text;
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin']) then
    raise exception 'You do not have permission to manage prices.';
  end if;

  if p_product_id is null then
    raise exception 'Product is required.';
  end if;

  if p_price_group_id is null then
    raise exception 'Price group is required.';
  end if;

  if p_amount is not null and p_amount < 0 then
    raise exception 'Price cannot be negative.';
  end if;

  v_currency := upper(trim(p_currency_code));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency code.';
  end if;

  select pt.pricing_model
  into v_pricing_model
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  where p.id = p_product_id
    and p.status <> 'archived';

  if v_pricing_model is null then
    raise exception 'Product does not exist or is archived.';
  end if;

  -- NULL remains a safe cleanup path for legacy Price Group rows. A new/current
  -- commercial amount may only be created for Product Types routed to price_group.
  if v_pricing_model <> 'price_group' and p_amount is not null then
    raise exception 'This Product Type does not use Price Group pricing.';
  end if;

  if not exists (
    select 1
    from public.price_groups pg
    where pg.id = p_price_group_id
      and pg.is_active = true
  ) then
    raise exception 'Price group does not exist or is inactive.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_product_id::text || ':' || p_price_group_id::text || ':' || v_currency,
      0
    )
  );

  select pp.id, pp.amount
  into v_current_id, v_current_amount
  from public.product_prices pp
  where pp.product_id = p_product_id
    and pp.price_group_id = p_price_group_id
    and pp.currency_code = v_currency
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc
  limit 1
  for update;

  if v_current_id is not null
     and p_amount is not null
     and v_current_amount = round(p_amount, 4)
  then
    return v_current_id;
  end if;

  if v_current_id is not null then
    update public.product_prices
    set is_active = false,
        valid_to = v_now
    where id = v_current_id;
  end if;

  if p_amount is null then
    return null;
  end if;

  insert into public.product_prices (
    product_id,
    price_group_id,
    amount,
    currency_code,
    valid_from,
    valid_to,
    is_active
  )
  values (
    p_product_id,
    p_price_group_id,
    round(p_amount, 4),
    v_currency,
    v_now,
    null,
    true
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.set_product_price(uuid, uuid, numeric, text) from public;
revoke all on function public.set_product_price(uuid, uuid, numeric, text) from anon;
grant execute on function public.set_product_price(uuid, uuid, numeric, text) to authenticated;
