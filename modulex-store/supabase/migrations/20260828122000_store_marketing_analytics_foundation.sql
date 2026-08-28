create table if not exists public.store_marketing_settings (
  id smallint primary key default 1 check (id = 1),
  tracking_enabled boolean not null default false,
  consent_banner_enabled boolean not null default true,
  respect_do_not_track boolean not null default true,
  google_tag_manager_id text,
  google_analytics_measurement_id text,
  consent_title text not null default 'Privacy choices',
  consent_description text not null default 'We use optional analytics and marketing technologies to understand site usage and improve our communications. You can accept all, reject optional tracking, or manage your choices.',
  accept_all_label text not null default 'Accept all',
  reject_optional_label text not null default 'Reject optional',
  manage_choices_label text not null default 'Manage choices',
  save_choices_label text not null default 'Save choices',
  privacy_policy_href text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint store_marketing_gtm_format check (
    google_tag_manager_id is null or google_tag_manager_id ~ '^GTM-[A-Z0-9]+$'
  ),
  constraint store_marketing_ga4_format check (
    google_analytics_measurement_id is null or google_analytics_measurement_id ~ '^G-[A-Z0-9]+$'
  ),
  constraint store_marketing_privacy_href check (
    privacy_policy_href is null
    or privacy_policy_href ~ '^/'
    or privacy_policy_href ~ '^https?://'
  )
);

insert into public.store_marketing_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function private.touch_store_marketing_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_marketing_settings_updated_at on public.store_marketing_settings;
create trigger trg_store_marketing_settings_updated_at
before update on public.store_marketing_settings
for each row execute function private.touch_store_marketing_updated_at();

create index if not exists idx_store_marketing_settings_updated_by
  on public.store_marketing_settings (updated_by);

alter table public.store_marketing_settings enable row level security;

revoke all on public.store_marketing_settings from public;
revoke all on public.store_marketing_settings from anon;
grant select, update on public.store_marketing_settings to authenticated;

drop policy if exists store_marketing_settings_internal_read on public.store_marketing_settings;
create policy store_marketing_settings_internal_read
on public.store_marketing_settings for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);

drop policy if exists store_marketing_settings_admin_update on public.store_marketing_settings;
create policy store_marketing_settings_admin_update
on public.store_marketing_settings for update to authenticated
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

create or replace function public.get_store_marketing_settings()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'tracking_enabled', s.tracking_enabled,
    'consent_banner_enabled', s.consent_banner_enabled,
    'respect_do_not_track', s.respect_do_not_track,
    'google_tag_manager_id', s.google_tag_manager_id,
    'google_analytics_measurement_id', s.google_analytics_measurement_id,
    'consent_title', s.consent_title,
    'consent_description', s.consent_description,
    'accept_all_label', s.accept_all_label,
    'reject_optional_label', s.reject_optional_label,
    'manage_choices_label', s.manage_choices_label,
    'save_choices_label', s.save_choices_label,
    'privacy_policy_href', s.privacy_policy_href,
    'updated_at', s.updated_at
  )
  from public.store_marketing_settings s
  where s.id = 1;
$$;

revoke all on function public.get_store_marketing_settings() from public;
grant execute on function public.get_store_marketing_settings() to anon, authenticated;
