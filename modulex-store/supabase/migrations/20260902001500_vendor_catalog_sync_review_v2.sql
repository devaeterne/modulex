/* Vendor Catalog Review V2
 * Keep discovery lightweight and preserve Modulex-owned media provenance after approval.
 */

alter table public.vendor_catalog_items
  add column if not exists discovery_hash text,
  add column if not exists details_refreshed_at timestamptz;

alter table public.vendor_catalog_assets
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists storage_sha256 text,
  add column if not exists storage_bytes bigint,
  add column if not exists archived_at timestamptz;

create index if not exists idx_vendor_catalog_items_vendor_discovery
  on public.vendor_catalog_items (vendor_code, discovery_hash);

create unique index if not exists idx_vendor_catalog_assets_storage_object
  on public.vendor_catalog_assets (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

alter table public.vendor_catalog_assets
  drop constraint if exists vendor_catalog_assets_storage_bytes_check;

alter table public.vendor_catalog_assets
  add constraint vendor_catalog_assets_storage_bytes_check
  check (storage_bytes is null or storage_bytes >= 0);