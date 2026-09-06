begin;

-- ============================================================
-- CALENDAR V3 — SINGLE COMPANY CALENDAR + BIDIRECTIONAL SYNC
-- Additive persistence only. No network access occurs in SQL.
-- Legacy per-Project Google calendars and mappings remain intact.
-- ============================================================

-- ------------------------------------------------------------
-- Company logical calendar + company provider binding
-- ------------------------------------------------------------

alter table public.admin_calendars
  drop constraint if exists admin_calendars_kind_valid;
alter table public.admin_calendars
  add constraint admin_calendars_kind_valid
  check (kind in ('project','google_imported','company'));

alter table public.admin_calendars
  drop constraint if exists admin_calendars_project_shape;
alter table public.admin_calendars
  add constraint admin_calendars_project_shape
  check (
    (kind = 'project' and project_id is not null)
    or (kind in ('google_imported','company') and project_id is null)
  );

create unique index if not exists admin_calendars_single_active_company_idx
  on public.admin_calendars(kind)
  where kind = 'company' and is_active = true;

alter table public.project_calendar_bindings
  drop constraint if exists project_calendar_bindings_binding_mode_valid;
alter table public.project_calendar_bindings
  add constraint project_calendar_bindings_binding_mode_valid
  check (binding_mode in ('modulex_created','google_imported','company_shared'));

alter table public.project_calendar_bindings
  drop constraint if exists project_calendar_bindings_mode_project_shape;
alter table public.project_calendar_bindings
  add constraint project_calendar_bindings_mode_project_shape
  check (
    (binding_mode = 'modulex_created' and project_id is not null)
    or (binding_mode in ('google_imported','company_shared') and project_id is null)
  );

create unique index if not exists project_calendar_bindings_single_company_shared_idx
  on public.project_calendar_bindings(binding_mode)
  where binding_mode = 'company_shared';

alter table public.calendar_integration_settings
  add column if not exists company_admin_calendar_id uuid,
  add column if not exists company_provider_binding_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_integration_settings_company_admin_calendar_fk'
      and conrelid = 'public.calendar_integration_settings'::regclass
  ) then
    alter table public.calendar_integration_settings
      add constraint calendar_integration_settings_company_admin_calendar_fk
      foreign key (company_admin_calendar_id)
      references public.admin_calendars(id)
      on update cascade on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_integration_settings_company_provider_binding_fk'
      and conrelid = 'public.calendar_integration_settings'::regclass
  ) then
    alter table public.calendar_integration_settings
      add constraint calendar_integration_settings_company_provider_binding_fk
      foreign key (company_provider_binding_id)
      references public.project_calendar_bindings(id)
      on update cascade on delete set null;
  end if;
end;
$$;

create index if not exists calendar_integration_settings_company_admin_calendar_idx
  on public.calendar_integration_settings(company_admin_calendar_id)
  where company_admin_calendar_id is not null;
create index if not exists calendar_integration_settings_company_provider_binding_idx
  on public.calendar_integration_settings(company_provider_binding_id)
  where company_provider_binding_id is not null;

-- ------------------------------------------------------------
-- Ordinary calendar events — local durable replica
-- ------------------------------------------------------------

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  admin_calendar_id uuid not null references public.admin_calendars(id) on update cascade on delete restrict,
  project_id uuid references public.customer_projects(id) on update cascade on delete set null,
  owner_profile_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  title text not null,
  description text,
  location text,
  all_day boolean not null default false,
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end date,
  timezone text not null,
  provider_color_id text,
  recurrence jsonb not null default '[]'::jsonb,
  recurring_parent_event_id uuid references public.calendar_events(id) on update cascade on delete cascade,
  provider_recurring_event_id text,
  provider_original_start_key text,
  attendees jsonb not null default '[]'::jsonb,
  guests_can_invite_others boolean,
  guests_can_modify boolean,
  guests_can_see_other_guests boolean,
  reminders jsonb,
  conference_data jsonb,
  visibility text,
  transparency text,
  provider_event_type text not null default 'default',
  provider_html_link text,
  organizer jsonb,
  creator jsonb,
  status text not null default 'confirmed',
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_title_not_empty check (length(btrim(title)) > 0),
  constraint calendar_events_timezone_not_empty check (length(btrim(timezone)) > 0),
  constraint calendar_events_provider_type_not_empty check (length(btrim(provider_event_type)) > 0),
  constraint calendar_events_recurrence_array check (jsonb_typeof(recurrence) = 'array'),
  constraint calendar_events_attendees_array check (jsonb_typeof(attendees) = 'array'),
  constraint calendar_events_time_shape check (
    (
      all_day = true
      and all_day_start is not null
      and all_day_end is not null
      and all_day_end > all_day_start
      and start_at is null
      and end_at is null
    )
    or
    (
      all_day = false
      and start_at is not null
      and all_day_start is null
      and all_day_end is null
      and (end_at is null or end_at > start_at)
    )
  )
);

create index if not exists calendar_events_calendar_start_idx
  on public.calendar_events(admin_calendar_id, start_at)
  where deleted_at is null and all_day = false;
create index if not exists calendar_events_calendar_all_day_idx
  on public.calendar_events(admin_calendar_id, all_day_start)
  where deleted_at is null and all_day = true;
create index if not exists calendar_events_project_start_idx
  on public.calendar_events(project_id, start_at)
  where project_id is not null and deleted_at is null and all_day = false;
create index if not exists calendar_events_project_all_day_idx
  on public.calendar_events(project_id, all_day_start)
  where project_id is not null and deleted_at is null and all_day = true;
create index if not exists calendar_events_owner_start_idx
  on public.calendar_events(owner_profile_id, start_at)
  where deleted_at is null and all_day = false;
create index if not exists calendar_events_recurring_parent_idx
  on public.calendar_events(recurring_parent_event_id)
  where recurring_parent_event_id is not null;

-- Flexible calendar presentation metadata for business-backed events.
create table if not exists public.calendar_business_event_extensions (
  id uuid primary key default gen_random_uuid(),
  admin_calendar_id uuid not null references public.admin_calendars(id) on update cascade on delete restrict,
  project_id uuid references public.customer_projects(id) on update cascade on delete set null,
  source_type text not null,
  source_id uuid not null,
  title_override text,
  description text,
  location text,
  provider_color_id text,
  attendees jsonb not null default '[]'::jsonb,
  guests_can_invite_others boolean,
  guests_can_modify boolean,
  guests_can_see_other_guests boolean,
  reminders jsonb,
  conference_data jsonb,
  visibility text,
  transparency text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_business_event_extensions_source_type_valid
    check (source_type in ('project_start','project_target','project_delivery','installation')),
  constraint calendar_business_event_extensions_attendees_array
    check (jsonb_typeof(attendees) = 'array'),
  constraint calendar_business_event_extensions_source_unique
    unique (source_type, source_id)
);

create index if not exists calendar_business_event_extensions_calendar_idx
  on public.calendar_business_event_extensions(admin_calendar_id, source_type);
create index if not exists calendar_business_event_extensions_project_idx
  on public.calendar_business_event_extensions(project_id, source_type)
  where project_id is not null;

-- ------------------------------------------------------------
-- Generic V3 provider mappings and durable synchronization state
-- ------------------------------------------------------------

create table if not exists public.calendar_provider_event_links (
  id uuid primary key default gen_random_uuid(),
  provider_binding_id uuid not null references public.project_calendar_bindings(id) on update cascade on delete cascade,
  source_type text not null,
  source_id uuid not null,
  project_id uuid references public.customer_projects(id) on update cascade on delete set null,
  occurrence_key text not null default '',
  provider_event_id text not null,
  provider_recurring_event_id text,
  provider_original_start_key text,
  provider_etag text,
  provider_updated_at timestamptz,
  provider_fingerprint text,
  provider_observed_at timestamptz,
  modulex_fingerprint text,
  last_synced_at timestamptz,
  last_sync_origin text,
  sync_status text not null default 'pending',
  last_error_at timestamptz,
  last_error_code text,
  provider_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_provider_event_links_source_type_valid
    check (source_type in ('project_start','project_target','project_delivery','installation','calendar_event')),
  constraint calendar_provider_event_links_provider_event_not_empty
    check (length(btrim(provider_event_id)) > 0),
  constraint calendar_provider_event_links_business_occurrence_empty
    check (source_type = 'calendar_event' or occurrence_key = ''),
  constraint calendar_provider_event_links_sync_origin_valid
    check (last_sync_origin is null or last_sync_origin in ('modulex','google','reconcile','cutover')),
  constraint calendar_provider_event_links_sync_status_valid
    check (sync_status in ('pending','synced','retry','conflict','error','deleted')),
  constraint calendar_provider_event_links_source_unique
    unique (provider_binding_id, source_type, source_id, occurrence_key),
  constraint calendar_provider_event_links_provider_unique
    unique (provider_binding_id, provider_event_id)
);

create index if not exists calendar_provider_event_links_project_idx
  on public.calendar_provider_event_links(project_id, source_type, updated_at desc)
  where project_id is not null;
create index if not exists calendar_provider_event_links_status_idx
  on public.calendar_provider_event_links(provider_binding_id, sync_status, updated_at desc);

create table if not exists public.calendar_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  provider_binding_id uuid not null references public.project_calendar_bindings(id) on update cascade on delete cascade,
  source_type text not null,
  source_id uuid not null,
  project_id uuid references public.customer_projects(id) on update cascade on delete set null,
  occurrence_key text not null default '',
  operation text not null,
  source_fingerprint text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  queued_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sync_outbox_source_type_valid
    check (source_type in ('project_start','project_target','project_delivery','installation','calendar_event')),
  constraint calendar_sync_outbox_operation_valid
    check (operation in ('upsert','delete')),
  constraint calendar_sync_outbox_status_valid
    check (status in ('pending','processing','retry','completed','error')),
  constraint calendar_sync_outbox_attempt_count_valid check (attempt_count >= 0),
  constraint calendar_sync_outbox_source_unique
    unique (provider_binding_id, source_type, source_id, occurrence_key)
);

create index if not exists calendar_sync_outbox_ready_idx
  on public.calendar_sync_outbox(status, next_attempt_at, queued_at)
  where status in ('pending','retry');
create index if not exists calendar_sync_outbox_binding_idx
  on public.calendar_sync_outbox(provider_binding_id, updated_at desc);

create table if not exists public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_binding_id uuid not null references public.project_calendar_bindings(id) on update cascade on delete cascade,
  job_type text not null,
  dedupe_key text not null default 'default',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sync_jobs_job_type_valid
    check (job_type in ('incremental','full','reconcile','watch_renew','access_check')),
  constraint calendar_sync_jobs_status_valid
    check (status in ('pending','processing','retry','completed','error')),
  constraint calendar_sync_jobs_attempt_count_valid check (attempt_count >= 0),
  constraint calendar_sync_jobs_dedupe_unique unique (provider_binding_id, job_type, dedupe_key)
);

create index if not exists calendar_sync_jobs_ready_idx
  on public.calendar_sync_jobs(status, available_at, created_at)
  where status in ('pending','retry');

create table if not exists public.calendar_watch_channels (
  id uuid primary key default gen_random_uuid(),
  provider_binding_id uuid not null references public.project_calendar_bindings(id) on update cascade on delete cascade,
  channel_id text not null,
  resource_id text,
  resource_uri text,
  channel_token_hash text not null,
  expires_at timestamptz,
  status text not null default 'pending',
  last_message_number bigint,
  created_at timestamptz not null default now(),
  renewed_at timestamptz,
  stopped_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint calendar_watch_channels_channel_not_empty check (length(btrim(channel_id)) > 0),
  constraint calendar_watch_channels_token_hash_not_empty check (length(btrim(channel_token_hash)) > 0),
  constraint calendar_watch_channels_status_valid check (status in ('pending','active','replaced','stopped','error')),
  constraint calendar_watch_channels_message_number_valid check (last_message_number is null or last_message_number >= 0),
  constraint calendar_watch_channels_channel_unique unique (channel_id)
);

create index if not exists calendar_watch_channels_active_idx
  on public.calendar_watch_channels(provider_binding_id, status, expires_at)
  where status in ('pending','active');
create index if not exists calendar_watch_channels_resource_idx
  on public.calendar_watch_channels(resource_id)
  where resource_id is not null;

create table if not exists public.calendar_sync_audit (
  id uuid primary key default gen_random_uuid(),
  provider_binding_id uuid references public.project_calendar_bindings(id) on update cascade on delete set null,
  source_type text,
  source_id uuid,
  project_id uuid references public.customer_projects(id) on update cascade on delete set null,
  provider_event_id text,
  direction text not null,
  action text not null,
  resolution text,
  details jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint calendar_sync_audit_direction_valid
    check (direction in ('modulex_to_google','google_to_modulex','system')),
  constraint calendar_sync_audit_action_not_empty check (length(btrim(action)) > 0)
);

create index if not exists calendar_sync_audit_source_idx
  on public.calendar_sync_audit(source_type, source_id, created_at desc)
  where source_type is not null and source_id is not null;
create index if not exists calendar_sync_audit_binding_idx
  on public.calendar_sync_audit(provider_binding_id, created_at desc)
  where provider_binding_id is not null;
create index if not exists calendar_sync_audit_project_idx
  on public.calendar_sync_audit(project_id, created_at desc)
  where project_id is not null;

-- ------------------------------------------------------------
-- Generic integrity and updated-at triggers
-- ------------------------------------------------------------

drop trigger if exists trg_calendar_events_updated on public.calendar_events;
create trigger trg_calendar_events_updated
before update on public.calendar_events
for each row execute function public.set_admin_calendar_updated_at();

drop trigger if exists trg_calendar_events_owner_active on public.calendar_events;
create trigger trg_calendar_events_owner_active
before insert or update of owner_profile_id on public.calendar_events
for each row execute function public.enforce_admin_calendar_owner_active();

drop trigger if exists trg_calendar_business_event_extensions_updated on public.calendar_business_event_extensions;
create trigger trg_calendar_business_event_extensions_updated
before update on public.calendar_business_event_extensions
for each row execute function public.set_admin_calendar_updated_at();

drop trigger if exists trg_calendar_provider_event_links_updated on public.calendar_provider_event_links;
create trigger trg_calendar_provider_event_links_updated
before update on public.calendar_provider_event_links
for each row execute function public.set_admin_calendar_updated_at();

drop trigger if exists trg_calendar_sync_outbox_updated on public.calendar_sync_outbox;
create trigger trg_calendar_sync_outbox_updated
before update on public.calendar_sync_outbox
for each row execute function public.set_admin_calendar_updated_at();

drop trigger if exists trg_calendar_sync_jobs_updated on public.calendar_sync_jobs;
create trigger trg_calendar_sync_jobs_updated
before update on public.calendar_sync_jobs
for each row execute function public.set_admin_calendar_updated_at();

drop trigger if exists trg_calendar_watch_channels_updated on public.calendar_watch_channels;
create trigger trg_calendar_watch_channels_updated
before update on public.calendar_watch_channels
for each row execute function public.set_admin_calendar_updated_at();

create or replace function public.enforce_calendar_provider_event_link_source_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project_id uuid;
begin
  if new.source_type in ('project_start','project_target','project_delivery') then
    if new.source_id is distinct from new.project_id
       or not exists (select 1 from public.customer_projects cp where cp.id = new.source_id) then
      raise exception 'Calendar Project source must reference the same Project id.' using errcode = '23514';
    end if;
  elsif new.source_type = 'installation' then
    select o.project_id into v_project_id
    from public.customer_installations i
    join public.customer_orders o on o.id = i.order_id
    where i.id = new.source_id;

    if v_project_id is null or new.project_id is distinct from v_project_id then
      raise exception 'Calendar Installation source must belong to the linked Project.' using errcode = '23514';
    end if;
  elsif new.source_type = 'calendar_event' then
    select ce.project_id into v_project_id
    from public.calendar_events ce
    where ce.id = new.source_id;

    if not found then
      raise exception 'Calendar event source does not exist.' using errcode = '23514';
    end if;

    if new.project_id is distinct from v_project_id then
      raise exception 'Calendar event Project metadata must match its source event.' using errcode = '23514';
    end if;
  else
    raise exception 'Unsupported Calendar provider source type: %', new.source_type using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calendar_provider_event_links_source_integrity on public.calendar_provider_event_links;
create trigger trg_calendar_provider_event_links_source_integrity
before insert or update of source_type, source_id, project_id, occurrence_key
on public.calendar_provider_event_links
for each row execute function public.enforce_calendar_provider_event_link_source_integrity();

-- ------------------------------------------------------------
-- Durable Modulex -> Google outbox helpers. Triggers only write DB.
-- ------------------------------------------------------------

create or replace function private.enqueue_calendar_sync_outbox(
  p_source_type text,
  p_source_id uuid,
  p_project_id uuid,
  p_operation text,
  p_source_fingerprint text,
  p_occurrence_key text default ''
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_binding_id uuid;
begin
  if coalesce(current_setting('modulex.calendar_sync_origin', true), '') = 'google' then
    return;
  end if;

  select cis.company_provider_binding_id
    into v_binding_id
  from public.calendar_integration_settings cis
  join public.project_calendar_bindings pcb
    on pcb.id = cis.company_provider_binding_id
   and pcb.binding_mode = 'company_shared'
   and pcb.sync_enabled = true
  where cis.id = 1;

  if v_binding_id is null then
    return;
  end if;

  insert into public.calendar_sync_outbox (
    provider_binding_id,
    source_type,
    source_id,
    project_id,
    occurrence_key,
    operation,
    source_fingerprint,
    status,
    attempt_count,
    next_attempt_at,
    locked_at,
    last_error_at,
    last_error_code,
    queued_at,
    completed_at
  ) values (
    v_binding_id,
    p_source_type,
    p_source_id,
    p_project_id,
    coalesce(p_occurrence_key, ''),
    p_operation,
    p_source_fingerprint,
    'pending',
    0,
    now(),
    null,
    null,
    null,
    now(),
    null
  )
  on conflict (provider_binding_id, source_type, source_id, occurrence_key)
  do update set
    project_id = excluded.project_id,
    operation = excluded.operation,
    source_fingerprint = excluded.source_fingerprint,
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = now(),
    locked_at = null,
    last_error_at = null,
    last_error_code = null,
    queued_at = now(),
    completed_at = null;
end;
$$;

create or replace function private.enqueue_calendar_sync_job(
  p_provider_binding_id uuid,
  p_job_type text,
  p_dedupe_key text default 'default',
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  insert into public.calendar_sync_jobs (
    provider_binding_id,
    job_type,
    dedupe_key,
    payload,
    status,
    attempt_count,
    available_at,
    locked_at,
    last_error_at,
    last_error_code,
    completed_at
  ) values (
    p_provider_binding_id,
    p_job_type,
    coalesce(nullif(btrim(p_dedupe_key), ''), 'default'),
    coalesce(p_payload, '{}'::jsonb),
    'pending',
    0,
    now(),
    null,
    null,
    null,
    null
  )
  on conflict (provider_binding_id, job_type, dedupe_key)
  do update set
    payload = excluded.payload,
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    last_error_at = null,
    last_error_code = null,
    completed_at = null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.calendar_project_schedule_outbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'cancelled' and new.start_date is not null then
      perform private.enqueue_calendar_sync_outbox('project_start', new.id, new.id, 'upsert', md5(jsonb_build_object('date', new.start_date)::text));
    end if;
    if new.status <> 'cancelled' and new.target_date is not null then
      perform private.enqueue_calendar_sync_outbox('project_target', new.id, new.id, 'upsert', md5(jsonb_build_object('date', new.target_date)::text));
    end if;
    if new.status <> 'cancelled' and new.planned_delivery_date is not null then
      perform private.enqueue_calendar_sync_outbox('project_delivery', new.id, new.id, 'upsert', md5(jsonb_build_object('date', new.planned_delivery_date)::text));
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      perform private.enqueue_calendar_sync_outbox('project_start', new.id, new.id, 'delete', null);
      perform private.enqueue_calendar_sync_outbox('project_target', new.id, new.id, 'delete', null);
      perform private.enqueue_calendar_sync_outbox('project_delivery', new.id, new.id, 'delete', null);
      return new;
    elsif old.status = 'cancelled' then
      if new.start_date is not null then
        perform private.enqueue_calendar_sync_outbox('project_start', new.id, new.id, 'upsert', md5(jsonb_build_object('date', new.start_date)::text));
      end if;
      if new.target_date is not null then
        perform private.enqueue_calendar_sync_outbox('project_target', new.id, new.id, 'upsert', md5(jsonb_build_object('date', new.target_date)::text));
      end if;
      if new.planned_delivery_date is not null then
        perform private.enqueue_calendar_sync_outbox('project_delivery', new.id, new.id, 'upsert', md5(jsonb_build_object('date', new.planned_delivery_date)::text));
      end if;
    end if;
  end if;

  if new.start_date is distinct from old.start_date then
    perform private.enqueue_calendar_sync_outbox(
      'project_start', new.id, new.id,
      case when new.start_date is null then 'delete' else 'upsert' end,
      case when new.start_date is null then null else md5(jsonb_build_object('date', new.start_date)::text) end
    );
  end if;
  if new.target_date is distinct from old.target_date then
    perform private.enqueue_calendar_sync_outbox(
      'project_target', new.id, new.id,
      case when new.target_date is null then 'delete' else 'upsert' end,
      case when new.target_date is null then null else md5(jsonb_build_object('date', new.target_date)::text) end
    );
  end if;
  if new.planned_delivery_date is distinct from old.planned_delivery_date then
    perform private.enqueue_calendar_sync_outbox(
      'project_delivery', new.id, new.id,
      case when new.planned_delivery_date is null then 'delete' else 'upsert' end,
      case when new.planned_delivery_date is null then null else md5(jsonb_build_object('date', new.planned_delivery_date)::text) end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calendar_v3_project_schedule_outbox on public.customer_projects;
create trigger trg_calendar_v3_project_schedule_outbox
after insert or update of start_date, target_date, planned_delivery_date, status
on public.customer_projects
for each row execute function private.calendar_project_schedule_outbox();

create or replace function private.calendar_installation_outbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order_id uuid;
  v_project_id uuid;
  v_operation text;
  v_fingerprint text;
begin
  v_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;

  select o.project_id into v_project_id
  from public.customer_orders o
  where o.id = v_order_id;

  if v_project_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    perform private.enqueue_calendar_sync_outbox('installation', old.id, v_project_id, 'delete', null);
    return old;
  end if;

  v_operation := case
    when new.status = 'cancelled' or new.scheduled_start_at is null then 'delete'
    else 'upsert'
  end;

  if v_operation = 'upsert' then
    v_fingerprint := md5(jsonb_build_object(
      'scheduled_start_at', new.scheduled_start_at,
      'scheduled_end_at', new.scheduled_end_at,
      'status', new.status,
      'order_id', new.order_id
    )::text);
  end if;

  perform private.enqueue_calendar_sync_outbox('installation', new.id, v_project_id, v_operation, v_fingerprint);
  return new;
end;
$$;

drop trigger if exists trg_calendar_v3_installation_outbox on public.customer_installations;
create trigger trg_calendar_v3_installation_outbox
after insert or delete or update of scheduled_start_at, scheduled_end_at, status, order_id
on public.customer_installations
for each row execute function private.calendar_installation_outbox();

create or replace function private.calendar_event_outbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_operation text;
  v_fingerprint text;
begin
  if tg_op = 'DELETE' then
    perform private.enqueue_calendar_sync_outbox('calendar_event', old.id, old.project_id, 'delete', null, coalesce(old.provider_original_start_key, ''));
    return old;
  end if;

  v_operation := case
    when new.deleted_at is not null or new.status = 'cancelled' then 'delete'
    else 'upsert'
  end;

  if v_operation = 'upsert' then
    v_fingerprint := md5(jsonb_build_object(
      'title', new.title,
      'description', new.description,
      'location', new.location,
      'all_day', new.all_day,
      'start_at', new.start_at,
      'end_at', new.end_at,
      'all_day_start', new.all_day_start,
      'all_day_end', new.all_day_end,
      'timezone', new.timezone,
      'provider_color_id', new.provider_color_id,
      'recurrence', new.recurrence,
      'attendees', new.attendees,
      'guests_can_invite_others', new.guests_can_invite_others,
      'guests_can_modify', new.guests_can_modify,
      'guests_can_see_other_guests', new.guests_can_see_other_guests,
      'reminders', new.reminders,
      'conference_data', new.conference_data,
      'visibility', new.visibility,
      'transparency', new.transparency,
      'project_id', new.project_id,
      'owner_profile_id', new.owner_profile_id
    )::text);
  end if;

  perform private.enqueue_calendar_sync_outbox(
    'calendar_event',
    new.id,
    new.project_id,
    v_operation,
    v_fingerprint,
    coalesce(new.provider_original_start_key, '')
  );
  return new;
end;
$$;

drop trigger if exists trg_calendar_v3_event_outbox on public.calendar_events;
create trigger trg_calendar_v3_event_outbox
after insert or delete or update
on public.calendar_events
for each row execute function private.calendar_event_outbox();

create or replace function private.calendar_business_extension_outbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row public.calendar_business_event_extensions%rowtype;
  v_fingerprint text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  if tg_op <> 'DELETE' then
    v_fingerprint := md5(jsonb_build_object(
      'title_override', new.title_override,
      'description', new.description,
      'location', new.location,
      'provider_color_id', new.provider_color_id,
      'attendees', new.attendees,
      'guests_can_invite_others', new.guests_can_invite_others,
      'guests_can_modify', new.guests_can_modify,
      'guests_can_see_other_guests', new.guests_can_see_other_guests,
      'reminders', new.reminders,
      'conference_data', new.conference_data,
      'visibility', new.visibility,
      'transparency', new.transparency
    )::text);
  end if;

  perform private.enqueue_calendar_sync_outbox(
    v_row.source_type,
    v_row.source_id,
    v_row.project_id,
    'upsert',
    v_fingerprint
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_calendar_v3_business_extension_outbox on public.calendar_business_event_extensions;
create trigger trg_calendar_v3_business_extension_outbox
after insert or delete or update
on public.calendar_business_event_extensions
for each row execute function private.calendar_business_extension_outbox();

-- ------------------------------------------------------------
-- Trusted Google -> Modulex business schedule mutation boundary
-- ------------------------------------------------------------

create or replace function private.apply_google_business_schedule_change(
  p_source_type text,
  p_source_id uuid,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_all_day_start date default null,
  p_deleted boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform set_config('modulex.calendar_sync_origin', 'google', true);

  if p_source_type = 'project_start' then
    if not p_deleted and p_all_day_start is null then
      raise exception 'Project Start requires an all-day start date.' using errcode = '22023';
    end if;
    update public.customer_projects
    set start_date = case when p_deleted then null else p_all_day_start end,
        updated_at = now()
    where id = p_source_id;
  elsif p_source_type = 'project_target' then
    if not p_deleted and p_all_day_start is null then
      raise exception 'Project Target requires an all-day start date.' using errcode = '22023';
    end if;
    update public.customer_projects
    set target_date = case when p_deleted then null else p_all_day_start end,
        updated_at = now()
    where id = p_source_id;
  elsif p_source_type = 'project_delivery' then
    if not p_deleted and p_all_day_start is null then
      raise exception 'Planned Delivery requires an all-day start date.' using errcode = '22023';
    end if;
    update public.customer_projects
    set planned_delivery_date = case when p_deleted then null else p_all_day_start end,
        updated_at = now()
    where id = p_source_id;
  elsif p_source_type = 'installation' then
    if p_deleted then
      update public.customer_installations
      set status = 'cancelled',
          updated_at = now()
      where id = p_source_id;
    else
      if p_start_at is null then
        raise exception 'Installation requires a scheduled start time.' using errcode = '22023';
      end if;
      update public.customer_installations
      set scheduled_start_at = p_start_at,
          scheduled_end_at = p_end_at,
          updated_at = now()
      where id = p_source_id;
    end if;
  else
    raise exception 'Unsupported Google business Calendar source type: %', p_source_type using errcode = '22023';
  end if;

  if not found then
    raise exception 'Calendar business source was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.apply_google_business_schedule_change(
  p_source_type text,
  p_source_id uuid,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_all_day_start date default null,
  p_deleted boolean default false
)
returns void
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.apply_google_business_schedule_change(
    p_source_type,
    p_source_id,
    p_start_at,
    p_end_at,
    p_all_day_start,
    p_deleted
  );
$$;

-- ------------------------------------------------------------
-- Server-only boundaries
-- ------------------------------------------------------------

alter table public.calendar_events enable row level security;
alter table public.calendar_business_event_extensions enable row level security;
alter table public.calendar_provider_event_links enable row level security;
alter table public.calendar_sync_outbox enable row level security;
alter table public.calendar_sync_jobs enable row level security;
alter table public.calendar_watch_channels enable row level security;
alter table public.calendar_sync_audit enable row level security;

revoke all on public.calendar_events from anon, authenticated;
revoke all on public.calendar_business_event_extensions from anon, authenticated;
revoke all on public.calendar_provider_event_links from anon, authenticated;
revoke all on public.calendar_sync_outbox from anon, authenticated;
revoke all on public.calendar_sync_jobs from anon, authenticated;
revoke all on public.calendar_watch_channels from anon, authenticated;
revoke all on public.calendar_sync_audit from anon, authenticated;

grant all on public.calendar_events to service_role;
grant all on public.calendar_business_event_extensions to service_role;
grant all on public.calendar_provider_event_links to service_role;
grant all on public.calendar_sync_outbox to service_role;
grant all on public.calendar_sync_jobs to service_role;
grant all on public.calendar_watch_channels to service_role;
grant all on public.calendar_sync_audit to service_role;

revoke all on function public.enforce_calendar_provider_event_link_source_integrity() from public, anon, authenticated;
revoke all on function private.enqueue_calendar_sync_outbox(text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.enqueue_calendar_sync_job(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.calendar_project_schedule_outbox() from public, anon, authenticated;
revoke all on function private.calendar_installation_outbox() from public, anon, authenticated;
revoke all on function private.calendar_event_outbox() from public, anon, authenticated;
revoke all on function private.calendar_business_extension_outbox() from public, anon, authenticated;
revoke all on function private.apply_google_business_schedule_change(text, uuid, timestamptz, timestamptz, date, boolean) from public, anon, authenticated;
revoke all on function public.apply_google_business_schedule_change(text, uuid, timestamptz, timestamptz, date, boolean) from public, anon, authenticated;

grant execute on function public.enforce_calendar_provider_event_link_source_integrity() to service_role;
grant execute on function private.enqueue_calendar_sync_outbox(text, uuid, uuid, text, text, text) to service_role;
grant execute on function private.enqueue_calendar_sync_job(uuid, text, text, jsonb) to service_role;
grant execute on function private.calendar_project_schedule_outbox() to service_role;
grant execute on function private.calendar_installation_outbox() to service_role;
grant execute on function private.calendar_event_outbox() to service_role;
grant execute on function private.calendar_business_extension_outbox() to service_role;
grant execute on function private.apply_google_business_schedule_change(text, uuid, timestamptz, timestamptz, date, boolean) to service_role;
grant execute on function public.apply_google_business_schedule_change(text, uuid, timestamptz, timestamptz, date, boolean) to service_role;

commit;
