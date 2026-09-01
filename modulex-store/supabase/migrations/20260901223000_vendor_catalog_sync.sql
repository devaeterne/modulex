/* Vendor Catalog Sync
 * Staging/review layer for third-party vendor catalogs.
 * Vendor price is reference-only. No row in this schema publishes Store content.
 */

create table if not exists public.vendor_catalog_runs (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  status text not null default 'RUNNING',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  discovered_count integer not null default 0,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary jsonb,
  created_at timestamptz not null default now(),
  constraint vendor_catalog_runs_status_check check (status in ('RUNNING','SUCCEEDED','FAILED')),
  constraint vendor_catalog_runs_counts_check check (
    discovered_count >= 0 and new_count >= 0 and updated_count >= 0 and
    unchanged_count >= 0 and failed_count >= 0
  )
);

create table if not exists public.vendor_catalog_items (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  external_id text not null,
  sku text,
  title text not null,
  description text,
  product_url text not null,
  vendor_price_reference numeric,
  vendor_currency text,
  snapshot_hash text not null,
  change_state text not null,
  review_status text not null default 'PENDING',
  canonical_product_id uuid references public.products(id) on delete set null,
  last_seen_run_id uuid references public.vendor_catalog_runs(id) on delete set null,
  source_payload jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_catalog_items_identity_unique unique (vendor_code, external_id),
  constraint vendor_catalog_items_change_state_check check (change_state in ('NEW','UPDATED','UNCHANGED')),
  constraint vendor_catalog_items_review_status_check check (review_status in ('PENDING','APPROVED','IGNORED')),
  constraint vendor_catalog_items_vendor_price_reference_check check (
    vendor_price_reference is null or vendor_price_reference >= 0
  )
);

create table if not exists public.vendor_catalog_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.vendor_catalog_runs(id) on delete cascade,
  item_id uuid not null references public.vendor_catalog_items(id) on delete cascade,
  snapshot_hash text not null,
  change_state text not null,
  normalized_payload jsonb not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vendor_catalog_snapshots_run_item_unique unique (run_id, item_id),
  constraint vendor_catalog_snapshots_change_state_check check (change_state in ('NEW','UPDATED','UNCHANGED'))
);

create table if not exists public.vendor_catalog_assets (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.vendor_catalog_items(id) on delete cascade,
  kind text not null,
  url text not null,
  label text,
  file_type text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint vendor_catalog_assets_kind_check check (kind in ('image','specification','cad','document')),
  constraint vendor_catalog_assets_item_url_unique unique (item_id, url)
);

create index if not exists idx_vendor_catalog_items_review
  on public.vendor_catalog_items (review_status, change_state, last_seen_at desc);
create index if not exists idx_vendor_catalog_items_vendor_sku
  on public.vendor_catalog_items (vendor_code, sku)
  where sku is not null;
create index if not exists idx_vendor_catalog_items_canonical_product
  on public.vendor_catalog_items (canonical_product_id)
  where canonical_product_id is not null;
create index if not exists idx_vendor_catalog_runs_vendor_started
  on public.vendor_catalog_runs (vendor_code, started_at desc);
create index if not exists idx_vendor_catalog_snapshots_item_created
  on public.vendor_catalog_snapshots (item_id, created_at desc);
create index if not exists idx_vendor_catalog_assets_item_sort
  on public.vendor_catalog_assets (item_id, sort_order, created_at);

create or replace function private.touch_vendor_catalog_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  if new.review_status is distinct from old.review_status then
    if new.review_status = 'PENDING' then
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendor_catalog_items_touch on public.vendor_catalog_items;
create trigger trg_vendor_catalog_items_touch
before update on public.vendor_catalog_items
for each row execute function private.touch_vendor_catalog_item();

alter table public.vendor_catalog_runs enable row level security;
alter table public.vendor_catalog_items enable row level security;
alter table public.vendor_catalog_snapshots enable row level security;
alter table public.vendor_catalog_assets enable row level security;

revoke all on public.vendor_catalog_runs from anon, authenticated;
revoke all on public.vendor_catalog_items from anon, authenticated;
revoke all on public.vendor_catalog_snapshots from anon, authenticated;
revoke all on public.vendor_catalog_assets from anon, authenticated;

grant select on public.vendor_catalog_runs to authenticated;
grant select on public.vendor_catalog_items to authenticated;
grant update (review_status, canonical_product_id) on public.vendor_catalog_items to authenticated;
grant select on public.vendor_catalog_snapshots to authenticated;
grant select on public.vendor_catalog_assets to authenticated;

drop policy if exists vendor_catalog_runs_admin_select on public.vendor_catalog_runs;
create policy vendor_catalog_runs_admin_select
on public.vendor_catalog_runs for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists vendor_catalog_items_admin_select on public.vendor_catalog_items;
create policy vendor_catalog_items_admin_select
on public.vendor_catalog_items for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists vendor_catalog_items_admin_update on public.vendor_catalog_items;
create policy vendor_catalog_items_admin_update
on public.vendor_catalog_items for update to authenticated
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

drop policy if exists vendor_catalog_snapshots_admin_select on public.vendor_catalog_snapshots;
create policy vendor_catalog_snapshots_admin_select
on public.vendor_catalog_snapshots for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists vendor_catalog_assets_admin_select on public.vendor_catalog_assets;
create policy vendor_catalog_assets_admin_select
on public.vendor_catalog_assets for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

/* Store publication remains a separate canonical workflow.
 * A vendor reference price must never satisfy this guard. A current Modulex
 * product price (> 0) must exist for at least one active variant.
 */
create or replace function private.validate_store_product_publish()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.is_published then
    if nullif(btrim(coalesce(new.short_description, '')), '') is null
       and nullif(btrim(coalesce(new.description, '')), '') is null then
      raise exception 'Store product requires marketing copy before publishing';
    end if;

    if not exists (
      select 1 from public.products p
      where p.base_product_code = new.base_product_code
        and p.status = 'active'
    ) then
      raise exception 'Store product requires at least one active product variant before publishing';
    end if;

    if not exists (
      select 1
      from public.products p
      join public.product_prices pp on pp.product_id = p.id
      where p.base_product_code = new.base_product_code
        and p.status = 'active'
        and pp.amount > 0
        and pp.valid_from <= now()
        and (pp.valid_to is null or pp.valid_to > now())
    ) then
      raise exception 'Store product requires a Modulex selling price greater than zero before publishing';
    end if;

    if not exists (
      select 1 from public.store_product_media m
      where m.product_content_id = new.id
        and m.media_type = 'image'
        and m.is_primary = true
        and nullif(btrim(coalesce(m.alt_text, '')), '') is not null
    ) then
      raise exception 'Store product requires a primary image with alt text before publishing';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.touch_vendor_catalog_item() from public, anon, authenticated;
revoke all on function private.validate_store_product_publish() from public, anon, authenticated;
