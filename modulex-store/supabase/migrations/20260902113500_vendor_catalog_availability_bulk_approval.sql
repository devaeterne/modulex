alter table public.vendor_catalog_items
  add column if not exists availability_status text not null default 'UNKNOWN',
  add column if not exists vendor_available boolean,
  add column if not exists vendor_purchasable boolean,
  add column if not exists vendor_stock_quantity numeric,
  add column if not exists availability_hash text,
  add column if not exists availability_changed_at timestamptz,
  add column if not exists missing_success_count integer not null default 0,
  add column if not exists canonical_inactivated_by_vendor_at timestamptz,
  add column if not exists canonical_status_version_at timestamptz,
  add column if not exists reactivation_requires_review boolean not null default false;

alter table public.vendor_catalog_items
  drop constraint if exists vendor_catalog_items_availability_status_check;
alter table public.vendor_catalog_items
  add constraint vendor_catalog_items_availability_status_check
  check (availability_status in ('AVAILABLE','OUT_OF_STOCK','UNAVAILABLE','UNKNOWN','MISSING'));

alter table public.vendor_catalog_items
  drop constraint if exists vendor_catalog_items_missing_success_count_check;
alter table public.vendor_catalog_items
  add constraint vendor_catalog_items_missing_success_count_check
  check (missing_success_count >= 0);

alter table public.vendor_catalog_items
  drop constraint if exists vendor_catalog_items_vendor_stock_quantity_check;
alter table public.vendor_catalog_items
  add constraint vendor_catalog_items_vendor_stock_quantity_check
  check (vendor_stock_quantity is null or vendor_stock_quantity >= 0);

create index if not exists idx_vendor_catalog_items_availability_review
  on public.vendor_catalog_items (availability_status, review_status);
create index if not exists idx_vendor_catalog_items_vendor_availability
  on public.vendor_catalog_items (vendor_code, availability_status);
create index if not exists idx_vendor_catalog_items_vendor_missing
  on public.vendor_catalog_items (vendor_code, missing_success_count)
  where missing_success_count > 0;

alter table public.vendor_catalog_runs
  add column if not exists availability_changed_count integer not null default 0,
  add column if not exists available_count integer not null default 0,
  add column if not exists out_of_stock_count integer not null default 0,
  add column if not exists unavailable_count integer not null default 0,
  add column if not exists unknown_count integer not null default 0,
  add column if not exists missing_count integer not null default 0,
  add column if not exists canonical_deactivated_count integer not null default 0,
  add column if not exists canonical_reactivated_count integer not null default 0;

alter table public.vendor_catalog_checks
  add column if not exists availability_changed_count integer not null default 0,
  add column if not exists available_count integer not null default 0,
  add column if not exists out_of_stock_count integer not null default 0,
  add column if not exists unavailable_count integer not null default 0,
  add column if not exists unknown_count integer not null default 0,
  add column if not exists missing_count integer not null default 0;

comment on column public.vendor_catalog_items.availability_status is
  'Normalized vendor sale eligibility. This is not Modulex warehouse on-hand inventory.';
comment on column public.vendor_catalog_items.vendor_stock_quantity is
  'Vendor reference quantity when explicitly exposed by the source; never copied into Modulex inventory on-hand.';
comment on column public.vendor_catalog_items.canonical_status_version_at is
  'Canonical products.updated_at captured immediately after a vendor-driven status change; used to protect manual overrides.';
