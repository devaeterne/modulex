-- A3.1 Product Master Data
-- Canonical variant/family taxonomy, lifecycle and product-list read contract.
-- Apply only after the A3.1 Admin client is ready to release.

-- Production preflight for this package proved all current products have
-- brand_id/category_id/base_product_code/color_code populated and no
-- case-insensitive SKU/barcode or family/color duplicates.

alter table public.products
  alter column brand_id set not null,
  alter column category_id set not null,
  alter column base_product_code set not null,
  alter column color_code set not null;

alter table public.products
  drop constraint if exists products_brand_id_fkey,
  add constraint products_brand_id_fkey
    foreign key (brand_id)
    references public.product_brands(id)
    on update cascade
    on delete restrict;

alter table public.products
  drop constraint if exists products_category_id_fkey,
  add constraint products_category_id_fkey
    foreign key (category_id)
    references public.product_categories(id)
    on update cascade
    on delete restrict;

alter table public.product_brands
  drop constraint if exists product_brands_status_check,
  add constraint product_brands_status_check
    check (status in ('active', 'inactive'));

alter table public.product_categories
  drop constraint if exists product_categories_status_check,
  add constraint product_categories_status_check
    check (status in ('active', 'inactive'));

create unique index if not exists ux_products_sku_ci
  on public.products (lower(btrim(sku)));

create unique index if not exists ux_products_barcode_ci
  on public.products (lower(btrim(barcode)))
  where barcode is not null and btrim(barcode) <> '';

create unique index if not exists ux_products_family_color_ci
  on public.products (lower(btrim(base_product_code)), lower(btrim(color_code)));

create unique index if not exists ux_product_brands_name_ci
  on public.product_brands (lower(btrim(name)));

create unique index if not exists ux_product_categories_name_ci
  on public.product_categories (lower(btrim(name)));

create or replace function private.products_family_taxonomy_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_brand_name text;
  v_category_name text;
  v_brand_status text;
  v_category_status text;
begin
  new.sku := btrim(new.sku);
  new.barcode := nullif(btrim(new.barcode), '');
  new.name := btrim(new.name);
  new.base_product_code := btrim(new.base_product_code);
  new.color_code := btrim(new.color_code);
  new.color_name := nullif(btrim(new.color_name), '');
  new.unit := btrim(new.unit);

  if new.sku = '' then
    raise exception using errcode = '22023', message = 'SKU is required.';
  end if;
  if new.name = '' then
    raise exception using errcode = '22023', message = 'Product name is required.';
  end if;
  if new.base_product_code = '' then
    raise exception using errcode = '22023', message = 'Base product code is required.';
  end if;
  if new.color_code = '' then
    raise exception using errcode = '22023', message = 'Color code is required.';
  end if;
  if new.unit = '' then
    raise exception using errcode = '22023', message = 'Unit is required.';
  end if;
  if new.brand_id is null then
    raise exception using errcode = '22023', message = 'Brand is required.';
  end if;
  if new.category_id is null then
    raise exception using errcode = '22023', message = 'Category is required.';
  end if;

  select pb.name, pb.status
    into v_brand_name, v_brand_status
  from public.product_brands pb
  where pb.id = new.brand_id;

  if not found then
    raise exception using errcode = '23503', message = 'Selected brand does not exist.';
  end if;

  select pc.name, pc.status
    into v_category_name, v_category_status
  from public.product_categories pc
  where pc.id = new.category_id;

  if not found then
    raise exception using errcode = '23503', message = 'Selected category does not exist.';
  end if;

  if new.status = 'active'::public.product_status
     and (v_brand_status <> 'active' or v_category_status <> 'active') then
    raise exception using
      errcode = '23514',
      message = 'Active products require an active brand and category.';
  end if;

  if exists (
    select 1
    from public.products p
    where p.id is distinct from new.id
      and lower(btrim(p.base_product_code)) = lower(new.base_product_code)
      and (p.brand_id is distinct from new.brand_id or p.category_id is distinct from new.category_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'All variants in a product family must use the same brand and category.';
  end if;

  -- Keep compatibility mirrors aligned while brand_id/category_id remain canonical.
  new.brand := v_brand_name;
  new.category := v_category_name;

  return new;
end;
$$;

create or replace function private.products_lifecycle_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'archived'::public.product_status
     and new.status <> 'archived'::public.product_status then
    raise exception using
      errcode = '23514',
      message = 'Archived product status is terminal and cannot be reactivated.';
  end if;

  if new.status is distinct from old.status
     and new.status in ('inactive'::public.product_status, 'archived'::public.product_status)
     and old.status in ('active'::public.product_status, 'inactive'::public.product_status)
     and exists (
       select 1
       from public.inventory i
       where i.product_id = old.id
         and (i.quantity > 0 or i.reserved_quantity > 0)
     ) then
    raise exception using
      errcode = '23514',
      message = 'Product cannot be deactivated or archived while on-hand or reserved stock remains.';
  end if;

  return new;
end;
$$;

create or replace function private.normalize_product_taxonomy_name()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.name := btrim(new.name);
  if new.name = '' then
    raise exception using errcode = '22023', message = 'Taxonomy name is required.';
  end if;
  return new;
end;
$$;

create or replace function private.product_taxonomy_status_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'product_brands' and exists (
      select 1 from public.products p where p.brand_id = old.id
    ) then
      raise exception using
        errcode = '23503',
        message = 'Referenced brand cannot be deleted. Reassign products first.';
    end if;

    if tg_table_name = 'product_categories' and exists (
      select 1 from public.products p where p.category_id = old.id
    ) then
      raise exception using
        errcode = '23503',
        message = 'Referenced category cannot be deleted. Reassign products first.';
    end if;

    return old;
  end if;

  if new.status = 'inactive' and old.status is distinct from new.status then
    if tg_table_name = 'product_brands' and exists (
      select 1 from public.products p
      where p.brand_id = new.id and p.status = 'active'::public.product_status
    ) then
      raise exception using
        errcode = '23514',
        message = 'Brand used by active products cannot be deactivated.';
    end if;

    if tg_table_name = 'product_categories' and exists (
      select 1 from public.products p
      where p.category_id = new.id and p.status = 'active'::public.product_status
    ) then
      raise exception using
        errcode = '23514',
        message = 'Category used by active products cannot be deactivated.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.sync_product_taxonomy_mirror()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  if tg_table_name = 'product_brands' then
    update public.products
    set brand = new.name
    where brand_id = new.id
      and brand is distinct from new.name;
  elsif tg_table_name = 'product_categories' then
    update public.products
    set category = new.name
    where category_id = new.id
      and category is distinct from new.name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_a3_family_taxonomy_guard on public.products;
create trigger trg_products_a3_family_taxonomy_guard
before insert or update on public.products
for each row execute function private.products_family_taxonomy_guard();

drop trigger if exists trg_products_a3_lifecycle_guard on public.products;
create trigger trg_products_a3_lifecycle_guard
before update of status on public.products
for each row execute function private.products_lifecycle_guard();

drop trigger if exists trg_product_brands_a3_normalize on public.product_brands;
create trigger trg_product_brands_a3_normalize
before insert or update of name on public.product_brands
for each row execute function private.normalize_product_taxonomy_name();

drop trigger if exists trg_product_categories_a3_normalize on public.product_categories;
create trigger trg_product_categories_a3_normalize
before insert or update of name on public.product_categories
for each row execute function private.normalize_product_taxonomy_name();

drop trigger if exists trg_product_brands_a3_status_guard on public.product_brands;
create trigger trg_product_brands_a3_status_guard
before update of status or delete on public.product_brands
for each row execute function private.product_taxonomy_status_guard();

drop trigger if exists trg_product_categories_a3_status_guard on public.product_categories;
create trigger trg_product_categories_a3_status_guard
before update of status or delete on public.product_categories
for each row execute function private.product_taxonomy_status_guard();

drop trigger if exists trg_product_brands_a3_sync_mirror on public.product_brands;
create trigger trg_product_brands_a3_sync_mirror
after update of name on public.product_brands
for each row execute function private.sync_product_taxonomy_mirror();

drop trigger if exists trg_product_categories_a3_sync_mirror on public.product_categories;
create trigger trg_product_categories_a3_sync_mirror
after update of name on public.product_categories
for each row execute function private.sync_product_taxonomy_mirror();

-- Physical product deletion is not an Admin product-master operation.
drop policy if exists products_delete_super_admin_only on public.products;
revoke delete on table public.products from anon, authenticated;

create or replace function public.set_product_status(
  p_product_id uuid,
  p_status public.product_status
)
returns public.product_status
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_status public.product_status;
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin']::text[]) then
    raise exception using errcode = '42501', message = 'Product management requires Admin access.';
  end if;

  update public.products
  set status = p_status
  where id = p_product_id
  returning status into v_status;

  if v_status is null then
    raise exception using errcode = 'P0002', message = 'Product not found.';
  end if;

  return v_status;
end;
$$;

revoke all on function public.set_product_status(uuid, public.product_status) from public, anon;
grant execute on function public.set_product_status(uuid, public.product_status) to authenticated;

-- Preserve deterministic server-side list/pagination while adding canonical
-- family/color fields needed by A3.1 list/export.
create or replace function public.get_products_page(
  p_query text default ''::text,
  p_page integer default 1,
  p_page_size integer default 50,
  p_status text default null::text,
  p_brand_id uuid default null::uuid,
  p_category_id uuid default null::uuid,
  p_sort_by text default 'sku'::text,
  p_sort_direction text default 'asc'::text
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with params as (
    select
      greatest(coalesce(p_page, 1), 1) as page_number,
      greatest(10, least(coalesce(p_page_size, 50), 100)) as page_size,
      nullif(btrim(coalesce(p_query, '')), '') as search_query,
      case when p_status in ('active', 'inactive', 'archived') then p_status else null end as status_filter,
      p_brand_id as brand_filter,
      p_category_id as category_filter,
      case
        when lower(coalesce(p_sort_by, 'sku')) in ('sku','name','brand','category','min_stock','status','created_at')
          then lower(coalesce(p_sort_by, 'sku'))
        else 'sku'
      end as sort_by,
      case when lower(coalesce(p_sort_direction, 'asc')) = 'desc' then 'desc' else 'asc' end as sort_direction
  ),
  filtered as (
    select
      p.id as product_id,
      p.sku,
      p.barcode,
      p.name as product_name,
      p.base_product_code,
      p.color_code,
      p.color_name,
      p.brand_id,
      p.category_id,
      pb.name as brand,
      pc.name as category,
      p.unit,
      p.min_stock_level,
      p.status::text as product_status,
      p.created_at
    from public.products p
    join public.product_brands pb on pb.id = p.brand_id
    join public.product_categories pc on pc.id = p.category_id
    cross join params x
    where
      (
        x.search_query is null
        or p.sku ilike '%' || x.search_query || '%'
        or coalesce(p.barcode, '') ilike '%' || x.search_query || '%'
        or p.name ilike '%' || x.search_query || '%'
        or p.base_product_code ilike '%' || x.search_query || '%'
        or p.color_code ilike '%' || x.search_query || '%'
        or coalesce(p.color_name, '') ilike '%' || x.search_query || '%'
        or pb.name ilike '%' || x.search_query || '%'
        or pc.name ilike '%' || x.search_query || '%'
      )
      and (x.status_filter is null or p.status::text = x.status_filter)
      and (x.brand_filter is null or p.brand_id = x.brand_filter)
      and (x.category_filter is null or p.category_id = x.category_filter)
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
      case when x.sort_by = 'brand' and x.sort_direction = 'asc' then lower(f.brand) end asc,
      case when x.sort_by = 'brand' and x.sort_direction = 'desc' then lower(f.brand) end desc,
      case when x.sort_by = 'category' and x.sort_direction = 'asc' then lower(f.category) end asc,
      case when x.sort_by = 'category' and x.sort_direction = 'desc' then lower(f.category) end desc,
      case when x.sort_by = 'min_stock' and x.sort_direction = 'asc' then f.min_stock_level end asc,
      case when x.sort_by = 'min_stock' and x.sort_direction = 'desc' then f.min_stock_level end desc,
      case when x.sort_by = 'status' and x.sort_direction = 'asc' then f.product_status end asc,
      case when x.sort_by = 'status' and x.sort_direction = 'desc' then f.product_status end desc,
      case when x.sort_by = 'created_at' and x.sort_direction = 'asc' then f.created_at end asc,
      case when x.sort_by = 'created_at' and x.sort_direction = 'desc' then f.created_at end desc,
      lower(f.sku) asc,
      f.product_id asc
    limit (select page_size from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  ),
  items as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'product_id', r.product_id,
        'sku', r.sku,
        'barcode', r.barcode,
        'product_name', r.product_name,
        'base_product_code', r.base_product_code,
        'color_code', r.color_code,
        'color_name', r.color_name,
        'brand_id', r.brand_id,
        'category_id', r.category_id,
        'brand', r.brand,
        'category', r.category,
        'unit', r.unit,
        'min_stock_level', r.min_stock_level,
        'product_status', r.product_status,
        'created_at', r.created_at
      )),
      '[]'::jsonb
    ) as rows
    from page_rows r
  ),
  brand_options as (
    select coalesce(
      jsonb_agg(jsonb_build_object('id', pb.id, 'name', pb.name) order by lower(pb.name)),
      '[]'::jsonb
    ) as rows
    from public.product_brands pb
    where pb.status = 'active'
  ),
  category_options as (
    select coalesce(
      jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name) order by lower(pc.name)),
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
    'filters', jsonb_build_object('brands', b.rows, 'categories', c.rows)
  )
  from items i
  cross join totals t
  cross join params x
  cross join brand_options b
  cross join category_options c;
$$;

revoke all on function public.get_products_page(text, integer, integer, text, uuid, uuid, text, text) from public, anon;
grant execute on function public.get_products_page(text, integer, integer, text, uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
