create table if not exists public.store_chrome_items (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('primary_nav', 'footer_products', 'footer_company')),
  destination_key text not null check (destination_key in (
    'home',
    'about',
    'products',
    'showroom',
    'cabinet_process',
    'gallery',
    'contact',
    'dealer_apply'
  )),
  label text not null check (length(btrim(label)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  unique (placement, destination_key)
);

create index if not exists store_chrome_items_public_order_idx
  on public.store_chrome_items (status, placement, sort_order, label);

alter table public.store_chrome_items enable row level security;

revoke all on table public.store_chrome_items from anon, authenticated;
grant select, insert, update, delete on table public.store_chrome_items to authenticated;

drop policy if exists store_chrome_items_admin_select on public.store_chrome_items;
create policy store_chrome_items_admin_select
  on public.store_chrome_items for select to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_chrome_items_admin_insert on public.store_chrome_items;
create policy store_chrome_items_admin_insert
  on public.store_chrome_items for insert to authenticated
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_chrome_items_admin_update on public.store_chrome_items;
create policy store_chrome_items_admin_update
  on public.store_chrome_items for update to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']))
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_chrome_items_admin_delete on public.store_chrome_items;
create policy store_chrome_items_admin_delete
  on public.store_chrome_items for delete to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

create or replace function public.get_store_public_chrome_items()
returns table (
  id uuid,
  placement text,
  destination_key text,
  label text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item.id,
    item.placement,
    item.destination_key,
    item.label,
    item.sort_order
  from public.store_chrome_items as item
  where item.status = 'published'
  order by item.placement asc, item.sort_order asc, item.label asc, item.id asc;
$$;

revoke all on function public.get_store_public_chrome_items() from public;
revoke all on function public.get_store_public_chrome_items() from anon, authenticated;
grant execute on function public.get_store_public_chrome_items() to anon, authenticated;
