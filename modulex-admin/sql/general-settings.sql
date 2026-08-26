begin;

-- ============================================================
-- MODULEX GENERAL / COMPANY SETTINGS
-- Singleton configuration used by company-facing documents.
-- Application branding (Modulex Admin) remains separate.
-- ============================================================

create table if not exists public.general_settings (
  id smallint primary key default 1,
  company_name text not null default 'Modulex',
  legal_name text,
  logo_url text,
  tax_number text,
  registration_number text,
  email text,
  phone text,
  website text,
  address_line_1 text,
  address_line_2 text,
  postal_code text,
  city text,
  state_region text,
  country_code varchar(2),
  default_currency varchar(3) not null default 'USD',
  locale text not null default 'en-US',
  timezone text not null default 'UTC',
  order_document_title text not null default 'Sales Order / Order Confirmation',
  order_footer_note text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint general_settings_singleton check (id = 1),
  constraint general_settings_company_name_not_empty check (length(trim(company_name)) > 0),
  constraint general_settings_currency_format check (default_currency ~ '^[A-Z]{3}$'),
  constraint general_settings_country_format check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

insert into public.general_settings (id, company_name)
values (1, 'Modulex')
on conflict (id) do nothing;

create or replace function public.set_general_settings_updated_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_general_settings_updated on public.general_settings;
create trigger trg_general_settings_updated
before update on public.general_settings
for each row execute function public.set_general_settings_updated_metadata();

alter table public.general_settings enable row level security;

drop policy if exists general_settings_read on public.general_settings;
create policy general_settings_read
on public.general_settings
for select
to authenticated
using (
  public.current_user_has_any_role(array['super_admin','admin','sales'])
);

drop policy if exists general_settings_manage on public.general_settings;
create policy general_settings_manage
on public.general_settings
for update
to authenticated
using (
  public.current_user_has_any_role(array['super_admin','admin'])
)
with check (
  public.current_user_has_any_role(array['super_admin','admin'])
);

revoke all on public.general_settings from anon;
grant select, update on public.general_settings to authenticated;

-- ============================================================
-- COMPANY ASSETS STORAGE
-- Public bucket is used for customer-facing document logos.
-- Upload / replace / delete remains restricted to admins.
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists company_assets_read on storage.objects;
create policy company_assets_read
on storage.objects
for select
to authenticated
using (bucket_id = 'company-assets');

drop policy if exists company_assets_insert on storage.objects;
create policy company_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and public.current_user_has_any_role(array['super_admin','admin'])
);

drop policy if exists company_assets_update on storage.objects;
create policy company_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-assets'
  and public.current_user_has_any_role(array['super_admin','admin'])
)
with check (
  bucket_id = 'company-assets'
  and public.current_user_has_any_role(array['super_admin','admin'])
);

drop policy if exists company_assets_delete on storage.objects;
create policy company_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and public.current_user_has_any_role(array['super_admin','admin'])
);

commit;
