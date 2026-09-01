/* Vendor Catalog Review v3
 * Additive scope/category/family metadata, mapping contracts and durable check-before-sync snapshots.
 * This migration does not publish Store content and does not turn vendor reference price into selling price.
 */

alter table public.vendor_catalog_items
  add column if not exists vendor_category_key text,
  add column if not exists vendor_category_label text,
  add column if not exists family_key text,
  add column if not exists variant_code text,
  add column if not exists variant_label text;

alter table public.vendor_catalog_runs
  add column if not exists vendor_category_key text,
  add column if not exists vendor_category_label text,
  add column if not exists sync_mode text not null default 'SYNC',
  add column if not exists selection_payload jsonb not null default '{}'::jsonb;

alter table public.vendor_catalog_runs
  drop constraint if exists vendor_catalog_runs_sync_mode_check;
alter table public.vendor_catalog_runs
  add constraint vendor_catalog_runs_sync_mode_check
  check (sync_mode in ('CHECK','SYNC'));

create table if not exists public.vendor_catalog_category_mappings (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  vendor_category_key text not null,
  vendor_category_label text not null,
  modulex_category_id uuid not null references public.product_categories(id) on delete restrict,
  product_type_id uuid not null references public.product_types(id) on delete restrict,
  uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_catalog_category_mappings_identity_unique
    unique (vendor_code, vendor_category_key),
  constraint vendor_catalog_category_mappings_vendor_code_check
    check (btrim(vendor_code) <> ''),
  constraint vendor_catalog_category_mappings_vendor_category_key_check
    check (btrim(vendor_category_key) <> ''),
  constraint vendor_catalog_category_mappings_vendor_category_label_check
    check (btrim(vendor_category_label) <> '')
);

create table if not exists public.vendor_catalog_checks (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  vendor_category_key text,
  vendor_category_label text,
  status text not null default 'RUNNING',
  discovered_count integer not null default 0,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  error_summary jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vendor_catalog_checks_status_check
    check (status in ('RUNNING','SUCCEEDED','FAILED')),
  constraint vendor_catalog_checks_counts_check
    check (
      discovered_count >= 0 and new_count >= 0 and updated_count >= 0 and
      unchanged_count >= 0 and failed_count >= 0
    )
);

create table if not exists public.vendor_catalog_check_items (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.vendor_catalog_checks(id) on delete cascade,
  external_id text not null,
  discovery_hash text not null,
  change_state text not null,
  normalized_payload jsonb not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vendor_catalog_check_items_identity_unique unique (check_id, external_id),
  constraint vendor_catalog_check_items_change_state_check
    check (change_state in ('NEW','UPDATED','UNCHANGED'))
);

create index if not exists idx_vendor_catalog_items_vendor_category
  on public.vendor_catalog_items (vendor_code, vendor_category_key, review_status, last_seen_at desc);
create index if not exists idx_vendor_catalog_items_family
  on public.vendor_catalog_items (vendor_code, family_key, review_status, last_seen_at desc)
  where family_key is not null;
create index if not exists idx_vendor_catalog_runs_scope_started
  on public.vendor_catalog_runs (vendor_code, vendor_category_key, started_at desc);
create index if not exists idx_vendor_catalog_category_mappings_category
  on public.vendor_catalog_category_mappings (modulex_category_id, product_type_id, uom_id);
create index if not exists idx_vendor_catalog_checks_vendor_created
  on public.vendor_catalog_checks (vendor_code, vendor_category_key, created_at desc);
create index if not exists idx_vendor_catalog_check_items_check_state
  on public.vendor_catalog_check_items (check_id, change_state, external_id);

alter table public.vendor_catalog_category_mappings enable row level security;
alter table public.vendor_catalog_checks enable row level security;
alter table public.vendor_catalog_check_items enable row level security;

revoke all on public.vendor_catalog_category_mappings from anon, authenticated;
revoke all on public.vendor_catalog_checks from anon, authenticated;
revoke all on public.vendor_catalog_check_items from anon, authenticated;

grant select on public.vendor_catalog_category_mappings to authenticated;
grant select on public.vendor_catalog_checks to authenticated;
grant select on public.vendor_catalog_check_items to authenticated;

drop policy if exists vendor_catalog_category_mappings_admin_select
  on public.vendor_catalog_category_mappings;
create policy vendor_catalog_category_mappings_admin_select
on public.vendor_catalog_category_mappings for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists vendor_catalog_checks_admin_select on public.vendor_catalog_checks;
create policy vendor_catalog_checks_admin_select
on public.vendor_catalog_checks for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists vendor_catalog_check_items_admin_select
  on public.vendor_catalog_check_items;
create policy vendor_catalog_check_items_admin_select
on public.vendor_catalog_check_items for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);