-- Modulex RBAC: multi-role assignments
-- Backward-compatible migration: profiles.role remains the canonical primary/legacy role,
-- while public.user_roles becomes the effective role source for permission checks.

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid null references public.profiles(id) on delete set null,
  primary key (user_id, role)
);

create index if not exists user_roles_role_idx on public.user_roles(role);

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;
grant all on table public.user_roles to service_role;

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.enforce_user_role_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('super_admin'::public.user_role, 'admin'::public.user_role) then
    if exists (
      select 1
      from public.user_roles ur
      where ur.user_id = new.user_id
        and (tg_op <> 'UPDATE' or (ur.user_id, ur.role) <> (old.user_id, old.role))
    ) then
      raise exception 'Admin and Super Admin roles must be assigned exclusively.';
    end if;
  elsif exists (
    select 1
    from public.user_roles ur
    where ur.user_id = new.user_id
      and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
      and (tg_op <> 'UPDATE' or (ur.user_id, ur.role) <> (old.user_id, old.role))
  ) then
    raise exception 'Operational roles cannot be combined with Admin or Super Admin.';
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_enforce_exclusivity on public.user_roles;
create trigger user_roles_enforce_exclusivity
before insert or update on public.user_roles
for each row execute function private.enforce_user_role_exclusivity();

insert into public.user_roles (user_id, role)
select p.id, p.role
from public.profiles p
on conflict (user_id, role) do nothing;

create or replace function private.initialize_user_roles_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, new.role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_initialize_user_roles on public.profiles;
create trigger profiles_initialize_user_roles
after insert on public.profiles
for each row execute function private.initialize_user_roles_from_profile();

create or replace function private.current_user_roles()
returns public.user_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(
        ur.role
        order by case ur.role
          when 'super_admin'::public.user_role then 1
          when 'admin'::public.user_role then 2
          when 'sales'::public.user_role then 3
          when 'finance'::public.user_role then 4
          when 'warehouse'::public.user_role then 5
          when 'shipping'::public.user_role then 6
          when 'hr'::public.user_role then 7
          else 99
        end
      )
      from public.user_roles ur
      where ur.user_id = p.id
    ),
    array[p.role]::public.user_role[]
  )
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
  limit 1;
$$;

create or replace function private.current_user_has_any_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from unnest(private.current_user_roles()) as r(role)
      where r.role::text = any(allowed_roles)
    ),
    false
  );
$$;

create or replace function private.has_role(required_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from unnest(private.current_user_roles()) as r(role)
      where r.role = any(required_roles)
    ),
    false
  );
$$;

-- Legacy callers still receive one deterministic primary role.
create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select (private.current_user_roles())[1];
$$;

create or replace function public.set_user_roles(
  target_user_id uuid,
  target_roles public.user_role[],
  actor_user_id uuid default null
)
returns public.user_role[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.user_role[];
begin
  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if target_roles is null or cardinality(target_roles) = 0 then
    raise exception 'At least one role is required.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'Profile not found.';
  end if;

  select array_agg(
    r.role
    order by case r.role
      when 'super_admin'::public.user_role then 1
      when 'admin'::public.user_role then 2
      when 'sales'::public.user_role then 3
      when 'finance'::public.user_role then 4
      when 'warehouse'::public.user_role then 5
      when 'shipping'::public.user_role then 6
      when 'hr'::public.user_role then 7
      else 99
    end
  )
  into v_roles
  from (
    select distinct unnest(target_roles) as role
  ) r;

  if cardinality(v_roles) = 0 then
    raise exception 'At least one role is required.';
  end if;

  if v_roles && array['super_admin','admin']::public.user_role[]
     and cardinality(v_roles) > 1 then
    raise exception 'Admin and Super Admin roles must be assigned exclusively.';
  end if;

  delete from public.user_roles
  where user_id = target_user_id;

  insert into public.user_roles (user_id, role, assigned_by)
  select target_user_id, role, actor_user_id
  from unnest(v_roles) as role;

  update public.profiles
  set role = v_roles[1], updated_at = now()
  where id = target_user_id;

  return v_roles;
end;
$$;

revoke all on function public.set_user_roles(uuid, public.user_role[], uuid) from public, anon, authenticated;
grant execute on function public.set_user_roles(uuid, public.user_role[], uuid) to service_role;

-- Normalize the remaining Store policies that still read profiles.role directly.
-- This keeps policy behavior unchanged while making role membership multi-role aware.
alter policy store_color_options_admin_delete on public.store_color_options
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_color_options_admin_insert on public.store_color_options
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_color_options_admin_update on public.store_color_options
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_color_options_internal_read on public.store_color_options
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_home_features_admin_delete on public.store_home_features
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_home_features_admin_insert on public.store_home_features
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_home_features_admin_update on public.store_home_features
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_home_features_internal_read on public.store_home_features
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_marketing_settings_admin_update on public.store_marketing_settings
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_marketing_settings_internal_read on public.store_marketing_settings
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_media_asset_sources_admin_all on public.store_media_asset_sources
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_media_assets_admin_all on public.store_media_assets
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));

alter policy store_pages_admin_all on public.store_pages
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_pages_internal_read on public.store_pages
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_product_content_admin_delete on public.store_product_content
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_product_content_admin_insert on public.store_product_content
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_product_content_admin_update on public.store_product_content
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_product_content_internal_read on public.store_product_content
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_product_media_admin_delete on public.store_product_media
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_product_media_admin_insert on public.store_product_media
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_product_media_admin_update on public.store_product_media
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_product_media_internal_read on public.store_product_media
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_project_media_admin_all on public.store_project_media
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_project_media_internal_read on public.store_project_media
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_projects_admin_all on public.store_projects
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_projects_internal_read on public.store_projects
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));

alter policy store_site_settings_admin_update on public.store_site_settings
  using ((select public.current_user_has_any_role(array['super_admin','admin']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy store_site_settings_internal_read on public.store_site_settings
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])));
