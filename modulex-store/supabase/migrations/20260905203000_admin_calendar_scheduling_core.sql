begin;

-- ============================================================
-- ADMIN CALENDAR & SCHEDULING CORE
-- Single-company scheduling registry independent of Google.
-- Modulex business dates remain canonical; provider-only events
-- are mirrored as read-only external calendar data.
-- ============================================================

create table if not exists public.admin_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  owner_profile_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  project_id uuid references public.customer_projects(id) on update cascade on delete restrict,
  timezone text not null,
  default_background_color text,
  default_foreground_color text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_calendars_name_not_empty check (length(btrim(name)) > 0),
  constraint admin_calendars_kind_valid check (kind in ('project','google_imported')),
  constraint admin_calendars_timezone_not_empty check (length(btrim(timezone)) > 0),
  constraint admin_calendars_project_shape check (
    (kind = 'project' and project_id is not null)
    or (kind = 'google_imported' and project_id is null)
  )
);

create unique index if not exists admin_calendars_project_unique
  on public.admin_calendars(project_id)
  where kind = 'project';
create index if not exists admin_calendars_owner_active_idx
  on public.admin_calendars(owner_profile_id, is_active, name);
create index if not exists admin_calendars_project_idx
  on public.admin_calendars(project_id)
  where project_id is not null;
create index if not exists admin_calendars_created_by_idx
  on public.admin_calendars(created_by)
  where created_by is not null;
create index if not exists admin_calendars_updated_by_idx
  on public.admin_calendars(updated_by)
  where updated_by is not null;

create or replace function public.set_admin_calendar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_admin_calendar_owner_active()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.owner_profile_id
      and p.is_active = true
  ) then
    raise exception 'Calendar owner must be an active Modulex profile.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_calendars_updated on public.admin_calendars;
create trigger trg_admin_calendars_updated
before update on public.admin_calendars
for each row execute function public.set_admin_calendar_updated_at();

drop trigger if exists trg_admin_calendars_owner_active on public.admin_calendars;
create trigger trg_admin_calendars_owner_active
before insert or update of owner_profile_id on public.admin_calendars
for each row execute function public.enforce_admin_calendar_owner_active();

-- Project scheduling fields are canonical business dates. Target remains a
-- completion/target milestone; Planned Delivery is intentionally distinct.
alter table public.customer_projects
  add column if not exists planned_delivery_date date,
  add column if not exists primary_installation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_projects_primary_installation_fk'
      and conrelid = 'public.customer_projects'::regclass
  ) then
    alter table public.customer_projects
      add constraint customer_projects_primary_installation_fk
      foreign key (primary_installation_id)
      references public.customer_installations(id)
      on update cascade on delete set null;
  end if;
end;
$$;

create index if not exists customer_projects_start_date_calendar_idx
  on public.customer_projects(start_date)
  where start_date is not null;
create index if not exists customer_projects_target_date_calendar_idx
  on public.customer_projects(target_date)
  where target_date is not null;
create index if not exists customer_projects_planned_delivery_date_calendar_idx
  on public.customer_projects(planned_delivery_date)
  where planned_delivery_date is not null;
create index if not exists customer_projects_primary_installation_idx
  on public.customer_projects(primary_installation_id)
  where primary_installation_id is not null;
create index if not exists customer_installations_calendar_schedule_idx
  on public.customer_installations(scheduled_start_at, status)
  where scheduled_start_at is not null;

create or replace function public.enforce_project_primary_installation_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.primary_installation_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.customer_installations i
    join public.customer_orders o on o.id = i.order_id
    where i.id = new.primary_installation_id
      and o.project_id = new.id
  ) then
    raise exception 'Primary Installation must belong to an Order in the same Project.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customer_projects_primary_installation_integrity on public.customer_projects;
create trigger trg_customer_projects_primary_installation_integrity
before insert or update of primary_installation_id
on public.customer_projects
for each row execute function public.enforce_project_primary_installation_integrity();

create or replace function public.enforce_order_primary_installation_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.customer_projects cp
    join public.customer_installations i on i.id = cp.primary_installation_id
    where i.order_id = new.id
      and cp.id is distinct from new.project_id
  ) then
    raise exception 'Order Project cannot change while one of its Installations is Primary for another Project.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_orders_primary_installation_integrity on public.customer_orders;
create trigger trg_customer_orders_primary_installation_integrity
before update of project_id on public.customer_orders
for each row execute function public.enforce_order_primary_installation_integrity();

create or replace function public.enforce_installation_primary_project_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.customer_projects cp
    join public.customer_orders o on o.id = new.order_id
    where cp.primary_installation_id = new.id
      and cp.id is distinct from o.project_id
  ) then
    raise exception 'Primary Installation cannot move to an Order in another Project.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_installations_primary_project_integrity on public.customer_installations;
create trigger trg_customer_installations_primary_project_integrity
before update of order_id on public.customer_installations
for each row execute function public.enforce_installation_primary_project_integrity();

-- Automatically designate the only non-cancelled Project Installation as
-- Primary when no explicit Primary exists. Multiple Installations remain visible.
create or replace function public.refresh_project_primary_installation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_project_id uuid;
  v_candidate uuid;
  v_count integer;
begin
  v_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select o.project_id into v_project_id
  from public.customer_orders o
  where o.id = v_order_id;

  if v_project_id is null then
    return coalesce(new, old);
  end if;

  select count(*), min(i.id)
    into v_count, v_candidate
  from public.customer_installations i
  join public.customer_orders o on o.id = i.order_id
  where o.project_id = v_project_id
    and i.status <> 'cancelled';

  if v_count = 1 then
    update public.customer_projects
    set primary_installation_id = v_candidate,
        updated_at = now()
    where id = v_project_id
      and primary_installation_id is null;
  elsif exists (
    select 1
    from public.customer_projects cp
    left join public.customer_installations pi on pi.id = cp.primary_installation_id
    where cp.id = v_project_id
      and cp.primary_installation_id is not null
      and (pi.id is null or pi.status = 'cancelled')
  ) then
    update public.customer_projects
    set primary_installation_id = null,
        updated_at = now()
    where id = v_project_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_customer_installations_refresh_project_primary on public.customer_installations;
create trigger trg_customer_installations_refresh_project_primary
after insert or delete or update of status, order_id on public.customer_installations
for each row execute function public.refresh_project_primary_installation();

-- Every Project receives one Modulex calendar independently of Google.
create or replace function public.ensure_project_admin_calendar()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
  v_timezone text;
begin
  select p.id into v_owner
  from public.profiles p
  where p.id = new.sales_rep_id
    and p.is_active = true;

  if v_owner is null then
    select p.id into v_owner
    from public.profiles p
    where p.id = new.created_by
      and p.is_active = true;
  end if;

  if v_owner is null then
    raise exception 'Project Calendar requires an active Modulex owner.' using errcode = '23514';
  end if;

  select nullif(btrim(gs.timezone), '') into v_timezone
  from public.general_settings gs
  where gs.id = 1;
  v_timezone := coalesce(v_timezone, 'UTC');

  insert into public.admin_calendars (
    name,
    kind,
    owner_profile_id,
    project_id,
    timezone,
    created_by,
    updated_by
  ) values (
    concat_ws(' - ', nullif(btrim(new.project_number), ''), nullif(btrim(new.name), '')),
    'project',
    v_owner,
    new.id,
    v_timezone,
    new.created_by,
    new.created_by
  )
  on conflict (project_id) where kind = 'project' do nothing;

  return new;
end;
$$;

drop trigger if exists trg_customer_projects_ensure_admin_calendar on public.customer_projects;
create trigger trg_customer_projects_ensure_admin_calendar
after insert on public.customer_projects
for each row execute function public.ensure_project_admin_calendar();

-- Backfill all existing Projects deterministically: active Sales Rep first,
-- then active Project creator. Unresolvable ownership fails closed.
insert into public.admin_calendars (
  name,
  kind,
  owner_profile_id,
  project_id,
  timezone,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  concat_ws(' - ', nullif(btrim(cp.project_number), ''), nullif(btrim(cp.name), '')),
  'project',
  coalesce(sr.id, creator.id),
  cp.id,
  coalesce(nullif(btrim(gs.timezone), ''), 'UTC'),
  cp.created_by,
  cp.updated_by,
  cp.created_at,
  cp.updated_at
from public.customer_projects cp
left join public.profiles sr
  on sr.id = cp.sales_rep_id and sr.is_active = true
left join public.profiles creator
  on creator.id = cp.created_by and creator.is_active = true
left join public.general_settings gs on gs.id = 1
where coalesce(sr.id, creator.id) is not null
on conflict (project_id) where kind = 'project' do nothing;

do $$
begin
  if exists (
    select 1
    from public.customer_projects cp
    left join public.admin_calendars ac
      on ac.project_id = cp.id and ac.kind = 'project'
    where ac.id is null
  ) then
    raise exception 'Admin Calendar migration cannot resolve an active Modulex owner for every existing Project.';
  end if;
end;
$$;

-- Extend the existing provider-binding table additively. Its physical name is
-- retained so deployed Project Google mapping IDs and event links remain stable.
alter table public.project_calendar_bindings
  add column if not exists admin_calendar_id uuid,
  add column if not exists binding_mode text not null default 'modulex_created',
  add column if not exists provider_data_owner text,
  add column if not exists provider_access_role text,
  add column if not exists provider_background_color text,
  add column if not exists provider_foreground_color text,
  add column if not exists provider_color_id text,
  add column if not exists provider_sync_token text,
  add column if not exists last_mirror_sync_at timestamptz;

alter table public.project_calendar_bindings
  alter column project_id drop not null;

update public.project_calendar_bindings pcb
set admin_calendar_id = ac.id,
    binding_mode = 'modulex_created'
from public.admin_calendars ac
where pcb.admin_calendar_id is null
  and pcb.project_id = ac.project_id
  and ac.kind = 'project';

do $$
begin
  if exists (
    select 1
    from public.project_calendar_bindings
    where admin_calendar_id is null
  ) then
    raise exception 'Provider binding migration could not resolve its Modulex calendar.';
  end if;
end;
$$;

alter table public.project_calendar_bindings
  alter column admin_calendar_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_calendar_bindings_admin_calendar_fk'
      and conrelid = 'public.project_calendar_bindings'::regclass
  ) then
    alter table public.project_calendar_bindings
      add constraint project_calendar_bindings_admin_calendar_fk
      foreign key (admin_calendar_id)
      references public.admin_calendars(id)
      on update cascade on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_calendar_bindings_binding_mode_valid'
      and conrelid = 'public.project_calendar_bindings'::regclass
  ) then
    alter table public.project_calendar_bindings
      add constraint project_calendar_bindings_binding_mode_valid
      check (binding_mode in ('modulex_created','google_imported'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_calendar_bindings_mode_project_shape'
      and conrelid = 'public.project_calendar_bindings'::regclass
  ) then
    alter table public.project_calendar_bindings
      add constraint project_calendar_bindings_mode_project_shape
      check (
        (binding_mode = 'modulex_created' and project_id is not null)
        or (binding_mode = 'google_imported' and project_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_calendar_bindings_id_admin_calendar_unique'
      and conrelid = 'public.project_calendar_bindings'::regclass
  ) then
    alter table public.project_calendar_bindings
      add constraint project_calendar_bindings_id_admin_calendar_unique
      unique (id, admin_calendar_id);
  end if;
end;
$$;

create unique index if not exists project_calendar_bindings_admin_calendar_unique
  on public.project_calendar_bindings(admin_calendar_id);
create index if not exists project_calendar_bindings_access_role_idx
  on public.project_calendar_bindings(provider_access_role)
  where provider_access_role is not null;

-- Existing Project event-link IDs remain intact. Add Project milestone source
-- types so the same idempotency ledger can project all Modulex-owned events.
alter table public.project_calendar_event_links
  drop constraint if exists project_calendar_event_links_source_type_valid;
alter table public.project_calendar_event_links
  add constraint project_calendar_event_links_source_type_valid
  check (source_type in ('installation','project_start','project_target','project_delivery'));

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
  elsif new.source_type in ('project_start','project_target','project_delivery') then
    if new.source_id <> new.project_id then
      raise exception 'Calendar Project milestone source must use the Project id.';
    end if;
  else
    raise exception 'Unsupported calendar event source type: %', new.source_type;
  end if;

  return new;
end;
$$;

-- Safe provider-only event mirror. Google remains canonical for these rows.
create table if not exists public.google_calendar_event_mirror (
  id uuid primary key default gen_random_uuid(),
  admin_calendar_id uuid not null references public.admin_calendars(id) on update cascade on delete cascade,
  project_calendar_binding_id uuid not null,
  provider_event_id text not null,
  title text not null,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  all_day_start date,
  all_day_end date,
  status text,
  provider_event_url text,
  provider_color_id text,
  provider_updated_at timestamptz,
  provider_etag text,
  mirrored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_event_mirror_binding_calendar_fk
    foreign key (project_calendar_binding_id, admin_calendar_id)
    references public.project_calendar_bindings(id, admin_calendar_id)
    on update cascade on delete cascade,
  constraint google_calendar_event_mirror_provider_event_not_empty check (length(btrim(provider_event_id)) > 0),
  constraint google_calendar_event_mirror_title_not_empty check (length(btrim(title)) > 0),
  constraint google_calendar_event_mirror_time_shape check (
    (all_day = true and all_day_start is not null and start_at is null)
    or (all_day = false and start_at is not null and all_day_start is null)
  ),
  constraint google_calendar_event_mirror_source_unique unique (project_calendar_binding_id, provider_event_id)
);

create index if not exists google_calendar_event_mirror_calendar_idx
  on public.google_calendar_event_mirror(admin_calendar_id, mirrored_at desc);
create index if not exists google_calendar_event_mirror_timed_idx
  on public.google_calendar_event_mirror(start_at)
  where all_day = false;
create index if not exists google_calendar_event_mirror_all_day_idx
  on public.google_calendar_event_mirror(all_day_start)
  where all_day = true;

drop trigger if exists trg_google_calendar_event_mirror_updated on public.google_calendar_event_mirror;
create trigger trg_google_calendar_event_mirror_updated
before update on public.google_calendar_event_mirror
for each row execute function public.set_admin_calendar_updated_at();

-- Project scheduling mutation keeps Primary Installation validation in DB.
create or replace function private.set_customer_project_schedule(
  p_project_id uuid,
  p_start_date date default null,
  p_target_date date default null,
  p_planned_delivery_date date default null,
  p_primary_installation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project public.customer_projects%rowtype;
begin
  if auth.uid() is null
     or not public.current_user_has_any_role(array['super_admin','admin','sales']::text[]) then
    raise exception 'You do not have permission to update Project scheduling.' using errcode = '42501';
  end if;

  select * into v_project
  from public.customer_projects
  where id = p_project_id
  for update;

  if v_project.id is null then
    raise exception 'Project not found.';
  end if;

  update public.customer_projects
  set start_date = p_start_date,
      target_date = p_target_date,
      planned_delivery_date = p_planned_delivery_date,
      primary_installation_id = p_primary_installation_id,
      updated_by = auth.uid()
  where id = p_project_id;

  return p_project_id;
end;
$$;

create or replace function public.set_customer_project_schedule(
  p_project_id uuid,
  p_start_date date default null,
  p_target_date date default null,
  p_planned_delivery_date date default null,
  p_primary_installation_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select private.set_customer_project_schedule(
    p_project_id,
    p_start_date,
    p_target_date,
    p_planned_delivery_date,
    p_primary_installation_id
  );
$$;

-- Extend the existing Project detail projection without changing its signature.
create or replace function public.get_customer_project(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
select jsonb_build_object(
  'id',cp.id,
  'project_number',cp.project_number,
  'customer_id',cp.customer_id,
  'customer_name',c.name,
  'name',cp.name,
  'status',cp.status,
  'sales_rep_id',cp.sales_rep_id,
  'sales_rep_name',p.full_name,
  'project_address_id',cp.project_address_id,
  'project_address_snapshot',cp.project_address_snapshot,
  'start_date',cp.start_date,
  'target_date',cp.target_date,
  'planned_delivery_date',cp.planned_delivery_date,
  'primary_installation_id',cp.primary_installation_id,
  'completed_at',cp.completed_at,
  'customer_notes',cp.customer_notes,
  'internal_notes',cp.internal_notes,
  'created_at',cp.created_at,
  'updated_at',cp.updated_at,
  'orders',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',o.id,
        'order_number',o.order_number,
        'status',o.status,
        'order_date',o.order_date,
        'expected_delivery_date',o.expected_delivery_date,
        'item_count',o.item_count,
        'currency_code',o.currency_code,
        'grand_total',o.grand_total,
        'fulfillment_type',o.fulfillment_type
      )
      order by o.order_date desc,o.created_at desc
    )
    from public.customer_orders o
    where o.project_id=cp.id
  ),'[]'::jsonb)
)
from public.customer_projects cp
join public.customers c on c.id=cp.customer_id
left join public.profiles p on p.id=cp.sales_rep_id
where cp.id=p_project_id;
$$;

alter table public.admin_calendars enable row level security;
alter table public.google_calendar_event_mirror enable row level security;

-- Calendar registry/provider mirror are server-only. Browser-safe Admin APIs
-- expose narrow DTOs after permission checks.
revoke all on public.admin_calendars from anon, authenticated;
revoke all on public.google_calendar_event_mirror from anon, authenticated;
grant all on public.admin_calendars to service_role;
grant all on public.google_calendar_event_mirror to service_role;

revoke all on function public.set_admin_calendar_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_admin_calendar_owner_active() from public, anon, authenticated;
revoke all on function public.enforce_project_primary_installation_integrity() from public, anon, authenticated;
revoke all on function public.enforce_order_primary_installation_integrity() from public, anon, authenticated;
revoke all on function public.enforce_installation_primary_project_integrity() from public, anon, authenticated;
revoke all on function public.refresh_project_primary_installation() from public, anon, authenticated;
revoke all on function public.ensure_project_admin_calendar() from public, anon, authenticated;

grant execute on function public.set_admin_calendar_updated_at() to service_role;
grant execute on function public.enforce_admin_calendar_owner_active() to service_role;
grant execute on function public.enforce_project_primary_installation_integrity() to service_role;
grant execute on function public.enforce_order_primary_installation_integrity() to service_role;
grant execute on function public.enforce_installation_primary_project_integrity() to service_role;
grant execute on function public.refresh_project_primary_installation() to service_role;
grant execute on function public.ensure_project_admin_calendar() to service_role;

revoke all on function private.set_customer_project_schedule(uuid,date,date,date,uuid) from public, anon;
grant execute on function private.set_customer_project_schedule(uuid,date,date,date,uuid) to authenticated, service_role;
revoke all on function public.set_customer_project_schedule(uuid,date,date,date,uuid) from public, anon;
grant execute on function public.set_customer_project_schedule(uuid,date,date,date,uuid) to authenticated, service_role;

-- Preserve the existing authenticated Project detail read grant.
revoke all on function public.get_customer_project(uuid) from public, anon;
grant execute on function public.get_customer_project(uuid) to authenticated, service_role;

commit;
