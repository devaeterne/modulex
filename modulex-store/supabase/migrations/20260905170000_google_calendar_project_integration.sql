begin;

-- ============================================================
-- GOOGLE CALENDAR PROJECT INTEGRATION
-- Single-company v1: one Google OAuth connection and one
-- Modulex-created Google Calendar per customer Project.
-- All provider credentials and projection metadata are server-only.
-- ============================================================

create table if not exists public.calendar_integration_credentials (
  id smallint primary key default 1,
  provider text not null default 'google',
  status text not null default 'disconnected',
  provider_account_id text,
  provider_account_email text,
  encrypted_refresh_token text,
  granted_scopes text[] not null default '{}'::text[],
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_integration_credentials_singleton check (id = 1),
  constraint calendar_integration_credentials_provider_google check (provider = 'google'),
  constraint calendar_integration_credentials_status_valid check (status in ('connected','disconnected','error')),
  constraint calendar_integration_credentials_connected_token check (
    status <> 'connected' or encrypted_refresh_token is not null
  )
);

create index if not exists calendar_integration_credentials_connected_by_idx
  on public.calendar_integration_credentials(connected_by)
  where connected_by is not null;

create table if not exists public.calendar_integration_settings (
  id smallint primary key default 1,
  enabled boolean not null default false,
  auto_create_project_calendar boolean not null default true,
  calendar_name_template text not null default '{project_no} - {customer_name}',
  timezone_override text,
  sync_installations boolean not null default true,
  sync_deliveries boolean not null default false,
  sync_measurements boolean not null default false,
  sync_customer_appointments boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_integration_settings_singleton check (id = 1),
  constraint calendar_integration_settings_template_not_empty check (length(btrim(calendar_name_template)) > 0),
  constraint calendar_integration_settings_timezone_not_empty check (
    timezone_override is null or length(btrim(timezone_override)) > 0
  )
);

create index if not exists calendar_integration_settings_created_by_idx
  on public.calendar_integration_settings(created_by)
  where created_by is not null;
create index if not exists calendar_integration_settings_updated_by_idx
  on public.calendar_integration_settings(updated_by)
  where updated_by is not null;

insert into public.calendar_integration_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calendar_oauth_states_hash_not_empty check (length(btrim(state_hash)) > 0),
  constraint calendar_oauth_states_expiry_valid check (expires_at > created_at),
  constraint calendar_oauth_states_consumed_valid check (consumed_at is null or consumed_at >= created_at)
);

create index if not exists calendar_oauth_states_user_idx
  on public.calendar_oauth_states(user_id, created_at desc);
create index if not exists calendar_oauth_states_active_expiry_idx
  on public.calendar_oauth_states(expires_at)
  where consumed_at is null;

create table if not exists public.project_calendar_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  provider text not null default 'google',
  provider_calendar_id text not null,
  provider_calendar_name text not null,
  timezone text not null,
  sync_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  constraint project_calendar_bindings_provider_google check (provider = 'google'),
  constraint project_calendar_bindings_calendar_id_not_empty check (length(btrim(provider_calendar_id)) > 0),
  constraint project_calendar_bindings_calendar_name_not_empty check (length(btrim(provider_calendar_name)) > 0),
  constraint project_calendar_bindings_timezone_not_empty check (length(btrim(timezone)) > 0),
  constraint project_calendar_bindings_project_unique unique (project_id),
  constraint project_calendar_bindings_provider_calendar_unique unique (provider_calendar_id),
  constraint project_calendar_bindings_id_project_unique unique (id, project_id)
);

create index if not exists project_calendar_bindings_created_by_idx
  on public.project_calendar_bindings(created_by)
  where created_by is not null;

create table if not exists public.project_calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  project_calendar_binding_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  provider_event_id text not null,
  source_fingerprint text,
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_calendar_event_links_binding_project_fk
    foreign key (project_calendar_binding_id, project_id)
    references public.project_calendar_bindings(id, project_id)
    on update cascade on delete cascade,
  constraint project_calendar_event_links_source_type_valid check (source_type in ('installation')),
  constraint project_calendar_event_links_provider_event_not_empty check (length(btrim(provider_event_id)) > 0),
  constraint project_calendar_event_links_sync_status_valid check (sync_status in ('pending','synced','error','skipped')),
  constraint project_calendar_event_links_source_unique unique (project_calendar_binding_id, source_type, source_id),
  constraint project_calendar_event_links_provider_event_unique unique (project_calendar_binding_id, provider_event_id)
);

create index if not exists project_calendar_event_links_project_idx
  on public.project_calendar_event_links(project_id, updated_at desc);

create or replace function public.set_google_calendar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_calendar_event_link_source_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.source_type = 'installation' then
    if not exists (
      select 1
      from public.customer_installations i
      join public.customer_orders o on o.id = i.order_id
      where i.id = new.source_id
        and o.project_id = new.project_id
    ) then
      raise exception 'Calendar installation source does not belong to the Project.';
    end if;
  else
    raise exception 'Unsupported calendar event source type: %', new.source_type;
  end if;

  return new;
end;
$$;

-- The explicit trigger name is part of the persistence contract.
drop trigger if exists calendar_event_link_source_integrity on public.project_calendar_event_links;
create trigger calendar_event_link_source_integrity
before insert or update of project_id, project_calendar_binding_id, source_type, source_id
on public.project_calendar_event_links
for each row execute function public.enforce_calendar_event_link_source_integrity();

drop trigger if exists trg_calendar_integration_credentials_updated on public.calendar_integration_credentials;
create trigger trg_calendar_integration_credentials_updated
before update on public.calendar_integration_credentials
for each row execute function public.set_google_calendar_updated_at();

drop trigger if exists trg_calendar_integration_settings_updated on public.calendar_integration_settings;
create trigger trg_calendar_integration_settings_updated
before update on public.calendar_integration_settings
for each row execute function public.set_google_calendar_updated_at();

drop trigger if exists trg_project_calendar_bindings_updated on public.project_calendar_bindings;
create trigger trg_project_calendar_bindings_updated
before update on public.project_calendar_bindings
for each row execute function public.set_google_calendar_updated_at();

drop trigger if exists trg_project_calendar_event_links_updated on public.project_calendar_event_links;
create trigger trg_project_calendar_event_links_updated
before update on public.project_calendar_event_links
for each row execute function public.set_google_calendar_updated_at();

alter table public.calendar_integration_credentials enable row level security;
alter table public.calendar_integration_settings enable row level security;
alter table public.calendar_oauth_states enable row level security;
alter table public.project_calendar_bindings enable row level security;
alter table public.project_calendar_event_links enable row level security;

-- Calendar integration persistence is intentionally server-only in v1.
-- Admin and Project browser surfaces use permission-checked Next.js APIs.
revoke all on public.calendar_integration_credentials from anon, authenticated;
revoke all on public.calendar_integration_settings from anon, authenticated;
revoke all on public.calendar_oauth_states from anon, authenticated;
revoke all on public.project_calendar_bindings from anon, authenticated;
revoke all on public.project_calendar_event_links from anon, authenticated;

grant all on public.calendar_integration_credentials to service_role;
grant all on public.calendar_integration_settings to service_role;
grant all on public.calendar_oauth_states to service_role;
grant all on public.project_calendar_bindings to service_role;
grant all on public.project_calendar_event_links to service_role;

revoke all on function public.set_google_calendar_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_calendar_event_link_source_integrity() from public, anon, authenticated;
grant execute on function public.set_google_calendar_updated_at() to service_role;
grant execute on function public.enforce_calendar_event_link_source_integrity() to service_role;

commit;
