create table if not exists public.store_product_content (
  id uuid primary key default gen_random_uuid(),
  base_product_code text not null unique,
  slug text not null unique,
  display_name text not null,
  short_description text,
  description text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  og_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint store_product_content_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.store_product_media (
  id uuid primary key default gen_random_uuid(),
  product_content_id uuid not null references public.store_product_content(id) on delete cascade,
  color_code text,
  media_type text not null default 'image',
  url text not null,
  alt_text text,
  title text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint store_product_media_type_check check (media_type in ('image','document','video'))
);

create table if not exists public.store_color_options (
  code text primary key,
  display_name text not null,
  swatch_hex text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_store_product_content_published_sort
  on public.store_product_content (is_published, sort_order, display_name);
create index if not exists idx_store_product_media_product_sort
  on public.store_product_media (product_content_id, sort_order);
create index if not exists idx_store_product_media_color
  on public.store_product_media (product_content_id, color_code)
  where color_code is not null;

insert into public.store_color_options (code, display_name, sort_order)
select p.color_code, coalesce(max(nullif(p.color_name, '')), p.color_code),
       row_number() over (order by p.color_code)::integer
from public.products p
where p.color_code is not null
group by p.color_code
on conflict (code) do nothing;

insert into public.store_product_content (base_product_code, slug, display_name)
select distinct
  p.base_product_code,
  lower(trim(both '-' from regexp_replace(p.base_product_code, '[^A-Za-z0-9]+', '-', 'g'))) as slug,
  p.base_product_code as display_name
from public.products p
where p.status = 'active'
  and p.base_product_code is not null
on conflict (base_product_code) do nothing;

create or replace function private.touch_store_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_product_content_updated_at on public.store_product_content;
create trigger trg_store_product_content_updated_at
before update on public.store_product_content
for each row execute function private.touch_store_updated_at();

drop trigger if exists trg_store_product_media_updated_at on public.store_product_media;
create trigger trg_store_product_media_updated_at
before update on public.store_product_media
for each row execute function private.touch_store_updated_at();

drop trigger if exists trg_store_color_options_updated_at on public.store_color_options;
create trigger trg_store_color_options_updated_at
before update on public.store_color_options
for each row execute function private.touch_store_updated_at();

alter table public.store_product_content enable row level security;
alter table public.store_product_media enable row level security;
alter table public.store_color_options enable row level security;

create policy store_product_content_internal_read
on public.store_product_content for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_product_content_admin_insert
on public.store_product_content for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_product_content_admin_update
on public.store_product_content for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_product_content_admin_delete
on public.store_product_content for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create policy store_product_media_internal_read
on public.store_product_media for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_product_media_admin_all
on public.store_product_media for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create policy store_color_options_internal_read
on public.store_color_options for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_color_options_admin_all
on public.store_color_options for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create or replace function public.get_store_catalog_products(
  p_query text default null,
  p_color_code text default null,
  p_limit integer default 48,
  p_offset integer default 0
)
returns table (
  id uuid,
  base_product_code text,
  slug text,
  display_name text,
  short_description text,
  category text,
  brand text,
  is_featured boolean,
  sort_order integer,
  primary_image_url text,
  variants jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id,
    c.base_product_code,
    c.slug,
    c.display_name,
    c.short_description,
    min(p.category) as category,
    min(p.brand) as brand,
    c.is_featured,
    c.sort_order,
    (
      select m.url
      from public.store_product_media m
      where m.product_content_id = c.id
        and m.media_type = 'image'
      order by m.is_primary desc, m.sort_order asc, m.created_at asc
      limit 1
    ) as primary_image_url,
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'sku', p.sku,
        'colorCode', p.color_code,
        'colorName', coalesce(co.display_name, p.color_name, p.color_code)
      )
      order by co.sort_order nulls last, p.color_code, p.sku
    ) as variants,
    greatest(c.updated_at, max(p.updated_at)) as updated_at
  from public.store_product_content c
  join public.products p
    on p.base_product_code = c.base_product_code
   and p.status = 'active'
  left join public.store_color_options co
    on co.code = p.color_code
   and co.is_active
  where c.is_published
    and (p_color_code is null or exists (
      select 1 from public.products px
      where px.base_product_code = c.base_product_code
        and px.status = 'active'
        and px.color_code = p_color_code
    ))
    and (p_query is null or btrim(p_query) = '' or
      c.display_name ilike '%' || btrim(p_query) || '%' or
      c.base_product_code ilike '%' || btrim(p_query) || '%' or
      exists (
        select 1 from public.products pq
        where pq.base_product_code = c.base_product_code
          and pq.status = 'active'
          and pq.sku ilike '%' || btrim(p_query) || '%'
      )
    )
  group by c.id
  order by c.is_featured desc, c.sort_order asc, c.display_name asc
  limit greatest(1, least(coalesce(p_limit, 48), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_store_product_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', c.id,
    'baseProductCode', c.base_product_code,
    'slug', c.slug,
    'displayName', c.display_name,
    'shortDescription', c.short_description,
    'description', c.description,
    'category', min(p.category),
    'brand', min(p.brand),
    'seoTitle', c.seo_title,
    'seoDescription', c.seo_description,
    'ogImageUrl', c.og_image_url,
    'media', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'type', m.media_type,
          'url', m.url,
          'altText', m.alt_text,
          'title', m.title,
          'colorCode', m.color_code,
          'isPrimary', m.is_primary
        ) order by m.sort_order, m.created_at
      )
      from public.store_product_media m
      where m.product_content_id = c.id
    ), '[]'::jsonb),
    'variants', jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'sku', p.sku,
        'colorCode', p.color_code,
        'colorName', coalesce(co.display_name, p.color_name, p.color_code)
      ) order by co.sort_order nulls last, p.color_code, p.sku
    ),
    'updatedAt', greatest(c.updated_at, max(p.updated_at))
  )
  from public.store_product_content c
  join public.products p
    on p.base_product_code = c.base_product_code
   and p.status = 'active'
  left join public.store_color_options co
    on co.code = p.color_code
   and co.is_active
  where c.is_published
    and c.slug = p_slug
  group by c.id;
$$;

create or replace function public.get_store_public_profile()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'companyName', g.company_name,
    'legalName', g.legal_name,
    'logoUrl', g.logo_url,
    'email', g.email,
    'phone', g.phone,
    'website', g.website,
    'addressLine1', g.address_line_1,
    'addressLine2', g.address_line_2,
    'city', g.city,
    'stateRegion', g.state_region,
    'postalCode', g.postal_code,
    'countryCode', g.country_code,
    'locale', g.locale
  )
  from public.general_settings g
  where g.id = 1;
$$;

revoke all on function public.get_store_catalog_products(text, text, integer, integer) from public;
revoke all on function public.get_store_product_by_slug(text) from public;
revoke all on function public.get_store_public_profile() from public;
grant execute on function public.get_store_catalog_products(text, text, integer, integer) to anon, authenticated;
grant execute on function public.get_store_product_by_slug(text) to anon, authenticated;
grant execute on function public.get_store_public_profile() to anon, authenticated;
