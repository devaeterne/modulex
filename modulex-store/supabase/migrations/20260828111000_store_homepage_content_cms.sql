create table if not exists public.store_site_settings (
  id smallint primary key default 1 check (id = 1),
  homepage_eyebrow text,
  homepage_title text not null,
  homepage_highlight text,
  homepage_subtitle text,
  hero_primary_label text,
  hero_primary_href text,
  hero_secondary_label text,
  hero_secondary_href text,
  hero_poster_url text,
  hero_panorama_url text,
  hero_panorama_enabled boolean not null default true,
  show_features boolean not null default true,
  show_featured_products boolean not null default true,
  show_virtual_tour boolean not null default false,
  show_dealer_cta boolean not null default true,
  featured_products_eyebrow text,
  featured_products_title text,
  featured_products_description text,
  dealer_cta_title text,
  dealer_cta_description text,
  dealer_cta_label text,
  dealer_cta_href text,
  footer_description text,
  facebook_url text,
  instagram_url text,
  linkedin_url text,
  pinterest_url text,
  tiktok_url text,
  youtube_url text,
  homepage_seo_title text,
  homepage_seo_description text,
  homepage_og_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.store_home_features (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  link_label text,
  link_href text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.store_site_settings (
  id, homepage_eyebrow, homepage_title, homepage_highlight, homepage_subtitle,
  hero_primary_label, hero_primary_href, hero_secondary_label, hero_secondary_href,
  hero_poster_url, hero_panorama_url, hero_panorama_enabled,
  show_features, show_featured_products, show_virtual_tour, show_dealer_cta,
  featured_products_eyebrow, featured_products_title, featured_products_description,
  dealer_cta_title, dealer_cta_description, dealer_cta_label, dealer_cta_href,
  footer_description, homepage_seo_title, homepage_seo_description
) values (
  1,
  'Oakwell Cabinetry',
  'Cabinetry Built for Everyday Living',
  'Designed to Perform',
  'Explore cabinet product families, finish options, and resources from Oakwell Cabinetry.',
  'View Products', '/products', 'Contact Us', '/contact',
  '/assets/images/img(3).jpg', '/assets/images/panorama/image2.jpg', true,
  true, true, false, true,
  'Oakwell Cabinetry', 'Featured Products',
  'Explore selected cabinet product families and available finish variants.',
  'Interested in becoming an Oakwell dealer?',
  'Connect with Oakwell Cabinetry to learn more about dealer opportunities and product support.',
  'Contact Us', '/contact',
  'Cabinet products, finish options, resources, and dealer support from Oakwell Cabinetry.',
  'Oakwell Cabinetry | Cabinet Products & Dealer Support',
  'Explore Oakwell Cabinetry products, finish options, resources, and dealer information.'
) on conflict (id) do nothing;

insert into public.store_home_features (title, description, link_label, link_href, sort_order)
select * from (values
  ('Cabinet Product Families', 'Browse cabinet product families and available finish variants.', 'Explore Products', '/products', 10),
  ('Finish Options', 'Review available finish and color options across published Oakwell products.', 'View Products', '/products', 20),
  ('Dealer Support', 'Connect with Oakwell Cabinetry for dealer information and product support.', 'Contact Us', '/contact', 30),
  ('Product Resources', 'Find product information, specifications, and documents as they become available.', 'Explore Products', '/products', 40)
) as seed(title, description, link_label, link_href, sort_order)
where not exists (select 1 from public.store_home_features);

create or replace function private.touch_store_site_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_site_settings_updated_at on public.store_site_settings;
create trigger trg_store_site_settings_updated_at
before update on public.store_site_settings
for each row execute function private.touch_store_site_updated_at();

drop trigger if exists trg_store_home_features_updated_at on public.store_home_features;
create trigger trg_store_home_features_updated_at
before update on public.store_home_features
for each row execute function private.touch_store_site_updated_at();

create index if not exists idx_store_home_features_active_sort
  on public.store_home_features (is_active, sort_order);
create index if not exists idx_store_site_settings_updated_by
  on public.store_site_settings (updated_by);
create index if not exists idx_store_home_features_updated_by
  on public.store_home_features (updated_by);

alter table public.store_site_settings enable row level security;
alter table public.store_home_features enable row level security;

revoke all on public.store_site_settings from anon;
revoke all on public.store_home_features from anon;

create policy store_site_settings_internal_read
on public.store_site_settings for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_site_settings_admin_update
on public.store_site_settings for update to authenticated
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

create policy store_home_features_internal_read
on public.store_home_features for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_home_features_admin_insert
on public.store_home_features for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_home_features_admin_update
on public.store_home_features for update to authenticated
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
create policy store_home_features_admin_delete
on public.store_home_features for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create or replace function public.get_store_site_settings()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select to_jsonb(s) - 'created_at' - 'updated_by'
  from public.store_site_settings s
  where s.id = 1;
$$;

create or replace function public.get_store_home_features()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'title', f.title,
      'description', f.description,
      'linkLabel', f.link_label,
      'linkHref', f.link_href,
      'sortOrder', f.sort_order
    ) order by f.sort_order, f.created_at
  ), '[]'::jsonb)
  from public.store_home_features f
  where f.is_active;
$$;

revoke all on function public.get_store_site_settings() from public;
revoke all on function public.get_store_home_features() from public;
grant execute on function public.get_store_site_settings() to anon, authenticated;
grant execute on function public.get_store_home_features() to anon, authenticated;
