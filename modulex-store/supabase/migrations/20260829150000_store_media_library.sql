create table if not exists public.store_media_assets (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  title text not null,
  default_alt_text text,
  caption text,
  media_type text not null default 'image',
  original_filename text,
  original_mime_type text not null,
  original_width integer not null,
  original_height integer not null,
  original_bytes bigint not null,
  original_sha256 text not null,
  optimized_mime_type text,
  optimized_width integer,
  optimized_height integer,
  optimized_bytes bigint,
  optimized_sha256 text,
  staging_bucket text not null default 'store-media-staging',
  staging_original_path text,
  staging_optimized_path text,
  public_bucket text,
  public_path text,
  attribution_classification text not null default 'unverified_hold',
  cabinet_relevance text not null default 'unreviewed',
  review_notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_media_assets_status_check
    check (status in ('draft','review','approved','published','rejected')),
  constraint store_media_assets_title_present
    check (btrim(title) <> ''),
  constraint store_media_assets_media_type_check
    check (media_type = 'image'),
  constraint store_media_assets_original_mime_check
    check (original_mime_type in ('image/jpeg','image/png','image/webp','image/avif')),
  constraint store_media_assets_optimized_mime_check
    check (optimized_mime_type is null or optimized_mime_type = 'image/webp'),
  constraint store_media_assets_original_dimensions_check
    check (original_width > 0 and original_height > 0),
  constraint store_media_assets_original_bytes_check
    check (original_bytes > 0 and original_bytes <= 20971520),
  constraint store_media_assets_original_sha_check
    check (original_sha256 ~ '^[0-9a-f]{64}$'),
  constraint store_media_assets_staging_bucket_check
    check (staging_bucket = 'store-media-staging'),
  constraint store_media_assets_optimized_shape_check
    check (
      (
        optimized_sha256 is null
        and optimized_mime_type is null
        and optimized_width is null
        and optimized_height is null
        and optimized_bytes is null
        and staging_optimized_path is null
      )
      or
      (
        optimized_sha256 ~ '^[0-9a-f]{64}$'
        and optimized_mime_type = 'image/webp'
        and optimized_width > 0
        and optimized_height > 0
        and optimized_bytes > 0
        and nullif(btrim(staging_optimized_path), '') is not null
      )
    ),
  constraint store_media_assets_attribution_check
    check (attribution_classification in ('oakwell_owned','parent_attributed','unverified_hold')),
  constraint store_media_assets_relevance_check
    check (cabinet_relevance in ('unreviewed','relevant','mixed','irrelevant')),
  constraint store_media_assets_public_state_check
    check (
      (
        status = 'published'
        and public_bucket = 'store-media'
        and nullif(btrim(public_path), '') is not null
        and published_at is not null
      )
      or
      (
        status <> 'published'
        and public_bucket is null
        and public_path is null
        and published_at is null
      )
    )
);

create unique index if not exists ux_store_media_assets_original_sha256
  on public.store_media_assets (original_sha256);

create index if not exists idx_store_media_assets_status_updated
  on public.store_media_assets (status, updated_at desc, id);

create index if not exists idx_store_media_assets_optimized_sha256
  on public.store_media_assets (optimized_sha256)
  where optimized_sha256 is not null;

create index if not exists idx_store_media_assets_created_by
  on public.store_media_assets (created_by)
  where created_by is not null;

create index if not exists idx_store_media_assets_updated_by
  on public.store_media_assets (updated_by)
  where updated_by is not null;

create table if not exists public.store_media_asset_sources (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references public.store_media_assets(id) on delete cascade,
  source_site text not null,
  source_brand text,
  source_candidate_id text,
  source_url text not null,
  source_page_url text,
  source_page_id text,
  source_label text,
  migration_disposition text not null,
  attribution_required boolean not null default false,
  notes text,
  discovered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint store_media_sources_site_present
    check (btrim(source_site) <> ''),
  constraint store_media_sources_url_check
    check (source_url ~* '^https://'),
  constraint store_media_sources_page_url_check
    check (source_page_url is null or source_page_url ~* '^https://'),
  constraint store_media_sources_disposition_check
    check (migration_disposition in ('adapt','parent_attributed','hold','exclude','business_confirmation_required'))
);

create unique index if not exists ux_store_media_sources_candidate
  on public.store_media_asset_sources (media_asset_id, source_candidate_id)
  where source_candidate_id is not null;

create unique index if not exists ux_store_media_sources_url
  on public.store_media_asset_sources (media_asset_id, source_url);

create index if not exists idx_store_media_sources_asset
  on public.store_media_asset_sources (media_asset_id, created_at, id);

create index if not exists idx_store_media_sources_candidate_lookup
  on public.store_media_asset_sources (source_candidate_id)
  where source_candidate_id is not null;

drop trigger if exists trg_store_media_assets_updated_at on public.store_media_assets;
create trigger trg_store_media_assets_updated_at
before update on public.store_media_assets
for each row execute function private.touch_store_updated_at();

alter table public.store_media_assets enable row level security;
alter table public.store_media_asset_sources enable row level security;

revoke all on public.store_media_assets from public;
revoke all on public.store_media_asset_sources from public;
revoke all on public.store_media_assets from anon;
revoke all on public.store_media_asset_sources from anon;

grant select, insert, update, delete on public.store_media_assets to authenticated;
grant select, insert, update, delete on public.store_media_asset_sources to authenticated;

drop policy if exists store_media_assets_admin_all on public.store_media_assets;
create policy store_media_assets_admin_all
on public.store_media_assets
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_media_asset_sources_admin_all on public.store_media_asset_sources;
create policy store_media_asset_sources_admin_all
on public.store_media_asset_sources
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'store-media-staging',
  'store-media-staging',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/avif']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists store_media_staging_admin_select on storage.objects;
create policy store_media_staging_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'store-media-staging'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_media_staging_admin_insert on storage.objects;
create policy store_media_staging_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-media-staging'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_media_staging_admin_update on storage.objects;
create policy store_media_staging_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'store-media-staging'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  bucket_id = 'store-media-staging'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_media_staging_admin_delete on storage.objects;
create policy store_media_staging_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-media-staging'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
