-- USR-A1..A4 — Users & Roles final closeout
-- Canonical effective roles live in public.user_roles. public.profiles.role is kept as
-- a compatibility/primary-role mirror and is updated by the managed role RPCs.

create table if not exists public.user_role_change_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  actor_user_id uuid not null,
  changed_at timestamptz not null default transaction_timestamp(),
  from_roles public.user_role[] not null,
  to_roles public.user_role[] not null
);

comment on table public.user_role_change_audit is
  'Append-only USR-A4 evidence for managed role assignments/removals. UUIDs intentionally remain after account deletion.';

alter table public.user_role_change_audit enable row level security;

revoke all on table public.user_role_change_audit from public, anon, authenticated;
grant select on table public.user_role_change_audit to authenticated;

create or replace function private.users_view(actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor_user_id is not null
    and exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id
      where p.id = actor_user_id
        and p.is_active = true
        and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
    );
$$;

create or replace function private.users_manage(actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.users_view(actor_user_id);
$$;

revoke all on function private.users_view(uuid) from public, anon, authenticated;
revoke all on function private.users_manage(uuid) from public, anon, authenticated;

create or replace function private.prevent_user_role_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'user_role_change_audit_is_immutable';
end;
$$;

revoke all on function private.prevent_user_role_audit_mutation() from public, anon, authenticated;

drop trigger if exists user_role_change_audit_immutable on public.user_role_change_audit;
create trigger user_role_change_audit_immutable
before update or delete on public.user_role_change_audit
for each row execute function private.prevent_user_role_audit_mutation();

drop policy if exists user_role_change_audit_select_managers on public.user_role_change_audit;
create policy user_role_change_audit_select_managers
on public.user_role_change_audit
for select
to authenticated
using (public.is_admin());

-- RLS direct reads use the same current users.view model (Admin/Super Admin).
-- user_roles remains mutation-RPC-only for authenticated callers.
drop policy if exists user_roles_select_own on public.user_roles;
drop policy if exists user_roles_select_own_or_users_view on public.user_roles;
create policy user_roles_select_own_or_users_view
on public.user_roles
for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_select_own_or_users_view on public.profiles;
create policy profiles_select_own_or_users_view
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

-- Preserve direct profile administration for the same users.manage roles, but an
-- Admin may not mutate a Super Admin row. The DB invariant below independently
-- protects the final effective Super Admin even from service-role/cascade paths.
drop policy if exists profiles_update_admin_only on public.profiles;
create policy profiles_update_users_manage
on public.profiles
for update
to authenticated
using (
  (select public.is_admin())
  and (role <> 'super_admin'::public.user_role or (select public.is_super_admin()))
)
with check (
  (select public.is_admin())
  and (role <> 'super_admin'::public.user_role or (select public.is_super_admin()))
);

create or replace function private.guard_last_effective_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user_id uuid;
  v_is_effective boolean := false;
  v_effective_count integer;
begin
  if tg_table_schema = 'public' and tg_table_name = 'user_roles' then
    if tg_op = 'DELETE' and old.role = 'super_admin'::public.user_role then
      v_target_user_id := old.user_id;
    elsif tg_op = 'UPDATE'
      and old.role = 'super_admin'::public.user_role
      and new.role <> 'super_admin'::public.user_role then
      v_target_user_id := old.user_id;
    else
      return coalesce(new, old);
    end if;

    select exists (
      select 1 from public.profiles p
      where p.id = v_target_user_id and p.is_active = true
    ) into v_is_effective;
  elsif tg_table_schema = 'public' and tg_table_name = 'profiles' then
    if tg_op = 'DELETE' and old.is_active = true then
      v_target_user_id := old.id;
    elsif tg_op = 'UPDATE' and old.is_active = true and new.is_active = false then
      v_target_user_id := old.id;
    else
      return coalesce(new, old);
    end if;

    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_target_user_id
        and ur.role = 'super_admin'::public.user_role
    ) into v_is_effective;
  else
    return coalesce(new, old);
  end if;

  if not v_is_effective then
    return coalesce(new, old);
  end if;

  -- Serialize every path that can reduce the effective Super Admin population.
  -- The lock is transaction-scoped, so concurrent demote/deactivate/delete attempts
  -- cannot both validate against the same pre-mutation population.
  perform pg_advisory_xact_lock(5836489520416403811);

  select count(*)::integer
  into v_effective_count
  from public.profiles p
  join public.user_roles ur
    on ur.user_id = p.id
   and ur.role = 'super_admin'::public.user_role
  where p.is_active = true;

  if v_effective_count <= 1 then
    raise exception using
      errcode = 'P0001',
      message = 'last_effective_super_admin';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.guard_last_effective_super_admin() from public, anon, authenticated;

drop trigger if exists user_roles_guard_last_effective_super_admin on public.user_roles;
create trigger user_roles_guard_last_effective_super_admin
before delete or update of role on public.user_roles
for each row execute function private.guard_last_effective_super_admin();

drop trigger if exists profiles_guard_last_effective_super_admin on public.profiles;
create trigger profiles_guard_last_effective_super_admin
before delete or update of is_active on public.profiles
for each row execute function private.guard_last_effective_super_admin();

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
  v_old_roles public.user_role[] := '{}'::public.user_role[];
  v_actor_is_super_admin boolean := false;
  v_target_is_super_admin boolean := false;
  v_unattributed boolean := false;
begin
  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if target_roles is null or cardinality(target_roles) = 0 then
    raise exception 'At least one role is required.';
  end if;

  if not private.users_manage(actor_user_id) then
    raise exception using errcode = '42501', message = 'users_manage permission required';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'Profile not found.';
  end if;

  select coalesce(array_agg(r.role order by r.priority), '{}'::public.user_role[])
  into v_roles
  from (
    select distinct role,
      case role
        when 'super_admin'::public.user_role then 1
        when 'admin'::public.user_role then 2
        when 'sales'::public.user_role then 3
        when 'finance'::public.user_role then 4
        when 'warehouse'::public.user_role then 5
        when 'shipping'::public.user_role then 6
        when 'hr'::public.user_role then 7
        else 99
      end as priority
    from unnest(target_roles) as role
  ) r;

  if cardinality(v_roles) = 0 then
    raise exception 'At least one role is required.';
  end if;

  if v_roles && array['super_admin','admin']::public.user_role[]
     and cardinality(v_roles) > 1 then
    raise exception 'Admin and Super Admin roles must be assigned exclusively.';
  end if;

  select exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = actor_user_id
      and p.is_active = true
      and ur.role = 'super_admin'::public.user_role
  ) into v_actor_is_super_admin;

  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = target_user_id
      and ur.role = 'super_admin'::public.user_role
  ) into v_target_is_super_admin;

  if (v_target_is_super_admin or 'super_admin'::public.user_role = any(v_roles))
     and not v_actor_is_super_admin then
    raise exception using errcode = '42501', message = 'super_admin actor required';
  end if;

  if actor_user_id = target_user_id
     and v_target_is_super_admin
     and not ('super_admin'::public.user_role = any(v_roles)) then
    raise exception using errcode = '42501', message = 'cannot_demote_own_super_admin';
  end if;

  -- Serialize managed changes before the destructive diff. The trigger repeats this
  -- protection so direct/cascade paths cannot bypass the invariant.
  perform pg_advisory_xact_lock(5836489520416403811);

  select coalesce(array_agg(ur.role order by
    case ur.role
      when 'super_admin'::public.user_role then 1
      when 'admin'::public.user_role then 2
      when 'sales'::public.user_role then 3
      when 'finance'::public.user_role then 4
      when 'warehouse'::public.user_role then 5
      when 'shipping'::public.user_role then 6
      when 'hr'::public.user_role then 7
      else 99
    end), '{}'::public.user_role[]),
    coalesce(bool_or(ur.assigned_by is null), false)
  into v_old_roles, v_unattributed
  from public.user_roles ur
  where ur.user_id = target_user_id;

  delete from public.user_roles ur
  where ur.user_id = target_user_id
    and not (ur.role = any(v_roles));

  insert into public.user_roles (user_id, role, assigned_by)
  select target_user_id, requested.role, actor_user_id
  from unnest(v_roles) as requested(role)
  where not exists (
    select 1 from public.user_roles existing
    where existing.user_id = target_user_id
      and existing.role = requested.role
  );

  -- Attribute system-bootstrap roles the first time an operator explicitly confirms
  -- them, without rewriting attribution on already managed assignments.
  update public.user_roles
  set assigned_by = actor_user_id
  where user_id = target_user_id
    and assigned_by is null;

  update public.profiles
  set role = v_roles[1], updated_at = now()
  where id = target_user_id;

  if v_old_roles is distinct from v_roles then
    insert into public.user_role_change_audit (
      target_user_id, actor_user_id, from_roles, to_roles
    ) values (
      target_user_id, actor_user_id, v_old_roles, v_roles
    );
  elsif v_unattributed and actor_user_id is not null then
    insert into public.user_role_change_audit (
      target_user_id, actor_user_id, from_roles, to_roles
    ) values (
      target_user_id, actor_user_id, '{}'::public.user_role[], v_roles
    );
  end if;

  return v_roles;
end;
$$;

revoke all on function public.set_user_roles(uuid, public.user_role[], uuid) from public, anon, authenticated;
grant execute on function public.set_user_roles(uuid, public.user_role[], uuid) to service_role;

create or replace function public.admin_set_user_access(
  target_user_id uuid,
  target_roles public.user_role[],
  target_is_active boolean,
  actor_user_id uuid
)
returns public.user_role[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.user_role[];
  v_target_is_super_admin boolean;
begin
  if not private.users_manage(actor_user_id) then
    raise exception using errcode = '42501', message = 'users_manage permission required';
  end if;

  if target_is_active is null then
    raise exception 'Target active state is required.';
  end if;

  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = target_user_id
      and ur.role = 'super_admin'::public.user_role
  ) into v_target_is_super_admin;

  if actor_user_id = target_user_id and target_is_active = false then
    raise exception using errcode = '42501', message = 'cannot_deactivate_own_account';
  end if;

  if v_target_is_super_admin
     and not exists (
       select 1 from public.user_roles ur
       join public.profiles p on p.id = ur.user_id
       where ur.user_id = actor_user_id
         and ur.role = 'super_admin'::public.user_role
         and p.is_active = true
     ) then
    raise exception using errcode = '42501', message = 'super_admin actor required';
  end if;

  perform pg_advisory_xact_lock(5836489520416403811);

  v_roles := public.set_user_roles(target_user_id, target_roles, actor_user_id);

  update public.profiles
  set is_active = target_is_active, updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;

  return v_roles;
end;
$$;

revoke all on function public.admin_set_user_access(uuid, public.user_role[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_user_access(uuid, public.user_role[], boolean, uuid) to service_role;
