-- Phase A2.1 — Warehouse / Location Model Integrity
--
-- Goals:
-- 1. Keep warehouse structure master-data writes aligned with warehouse.manage.
-- 2. Preserve the warehouse role's existing narrow QR-operation capability.
-- 3. Make warehouse -> zone -> location -> inventory relationships fail closed.
-- 4. Prevent deactivation/deletion from orphaning active stock or operational provenance.
-- 5. Preserve existing audit triggers; this patch only adds integrity guards and policy/FK hardening.

begin;

-- -----------------------------------------------------------------------------
-- Role parity.
--
-- Location creation is warehouse master-data work and therefore Admin-only.
-- UPDATE keeps the existing warehouse-role RLS capability because the current
-- SECURITY INVOKER QR RPCs update locations.qr_code. A BEFORE UPDATE trigger
-- below makes that exception field-scoped: warehouse users may touch QR
-- operational fields but may not change location master data.
-- -----------------------------------------------------------------------------

drop policy if exists locations_insert_admin_or_warehouse on public.locations;
drop policy if exists locations_update_admin_or_warehouse on public.locations;
drop policy if exists locations_insert_admin_only on public.locations;
drop policy if exists locations_update_admin_only on public.locations;

create policy locations_insert_admin_only
on public.locations
for insert
to authenticated
with check ((select public.is_admin()));

create policy locations_update_admin_or_warehouse
on public.locations
for update
to authenticated
using (
  public.has_role(
    array['super_admin', 'admin', 'warehouse']::public.user_role[]
  )
)
with check (
  public.has_role(
    array['super_admin', 'admin', 'warehouse']::public.user_role[]
  )
);

create or replace function private.guard_location_master_role()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if public.has_role(array['warehouse']::public.user_role[]) then
    if new.warehouse_id is distinct from old.warehouse_id
       or new.zone_id is distinct from old.zone_id
       or new.name is distinct from old.name
       or new.code is distinct from old.code
       or new.location_type is distinct from old.location_type
       or new.aisle is distinct from old.aisle
       or new.rack is distinct from old.rack
       or new.shelf is distinct from old.shelf
       or new.bin is distinct from old.bin
       or new.max_capacity is distinct from old.max_capacity
       or new.current_capacity is distinct from old.current_capacity
       or new.is_active is distinct from old.is_active then
      raise exception using
        errcode = '42501',
        message = 'Warehouse role may only update location QR operational fields. Location master data requires Admin access.';
    end if;

    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Location updates require Admin access or an approved warehouse QR operation.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Hierarchy guards.
-- -----------------------------------------------------------------------------

create or replace function private.guard_zone_parent_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_warehouse_active boolean;
begin
  if tg_op = 'UPDATE'
     and new.warehouse_id is distinct from old.warehouse_id
     and exists (
       select 1
       from public.locations l
       where l.zone_id = old.id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Zone warehouse cannot change while locations are assigned. Move locations explicitly first.';
  end if;

  if new.is_active then
    select w.is_active
      into v_warehouse_active
    from public.warehouses w
    where w.id = new.warehouse_id;

    if coalesce(v_warehouse_active, false) is not true then
      raise exception using
        errcode = '23514',
        message = 'An active zone requires an active warehouse.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_location_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_zone_warehouse_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.warehouse_id is distinct from old.warehouse_id
     and exists (
       select 1
       from public.inventory i
       where i.location_id = old.id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Location warehouse cannot change while inventory rows are assigned. Move stock explicitly first.';
  end if;

  if new.zone_id is not null then
    select z.warehouse_id
      into v_zone_warehouse_id
    from public.zones z
    where z.id = new.zone_id;

    if v_zone_warehouse_id is null then
      raise exception using
        errcode = '23503',
        message = 'Selected zone does not exist.';
    end if;

    if v_zone_warehouse_id is distinct from new.warehouse_id then
      raise exception using
        errcode = '23514',
        message = 'Location zone must belong to the same warehouse.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_location_parent_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_warehouse_active boolean;
  v_zone_active boolean;
begin
  if new.is_active then
    select w.is_active
      into v_warehouse_active
    from public.warehouses w
    where w.id = new.warehouse_id;

    if coalesce(v_warehouse_active, false) is not true then
      raise exception using
        errcode = '23514',
        message = 'An active location requires an active warehouse.';
    end if;

    if new.zone_id is not null then
      select z.is_active
        into v_zone_active
      from public.zones z
      where z.id = new.zone_id;

      if coalesce(v_zone_active, false) is not true then
        raise exception using
          errcode = '23514',
          message = 'An active location requires an active zone.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_inventory_location_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_location_warehouse_id uuid;
begin
  select l.warehouse_id
    into v_location_warehouse_id
  from public.locations l
  where l.id = new.location_id;

  if v_location_warehouse_id is null then
    raise exception using
      errcode = '23503',
      message = 'Inventory location does not exist.';
  end if;

  if v_location_warehouse_id is distinct from new.warehouse_id then
    raise exception using
      errcode = '23514',
      message = 'Inventory location must belong to the same warehouse as the inventory row.';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Deactivation guards. Deactivation is the normal lifecycle path, but it must
-- never make active stock or active child structure unreachable.
-- -----------------------------------------------------------------------------

create or replace function private.guard_location_deactivation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1
    from public.inventory i
    where i.location_id = old.id
      and (i.quantity > 0 or i.reserved_quantity > 0)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Location cannot be deactivated while it contains active stock or reservations. Move stock first.';
  end if;

  return new;
end;
$$;

create or replace function private.guard_zone_deactivation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_active and not new.is_active then
    if exists (
      select 1
      from public.locations l
      where l.zone_id = old.id
        and l.is_active
    ) then
      raise exception using
        errcode = '23514',
        message = 'Zone cannot be deactivated while it has active locations. Deactivate locations first.';
    end if;

    if exists (
      select 1
      from public.inventory i
      join public.locations l on l.id = i.location_id
      where l.zone_id = old.id
        and (i.quantity > 0 or i.reserved_quantity > 0)
    ) then
      raise exception using
        errcode = '23514',
        message = 'Zone cannot be deactivated while its locations contain active stock or reservations. Move stock first.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_warehouse_deactivation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_active and not new.is_active then
    if exists (
      select 1
      from public.zones z
      where z.warehouse_id = old.id
        and z.is_active
    ) then
      raise exception using
        errcode = '23514',
        message = 'Warehouse cannot be deactivated while it has active zones. Deactivate active zones first.';
    end if;

    if exists (
      select 1
      from public.locations l
      where l.warehouse_id = old.id
        and l.is_active
    ) then
      raise exception using
        errcode = '23514',
        message = 'Warehouse cannot be deactivated while it has active locations. Deactivate active locations first.';
    end if;

    if exists (
      select 1
      from public.inventory i
      where i.warehouse_id = old.id
        and (i.quantity > 0 or i.reserved_quantity > 0)
    ) then
      raise exception using
        errcode = '23514',
        message = 'Warehouse cannot be deactivated while it contains active stock or reservations. Move stock first.';
    end if;
  end if;

  return new;
end;
$$;

-- Trigger ordering is explicit through names so the A2 guards run before the
-- existing updated_at/QR triggers where both apply to the same UPDATE.

drop trigger if exists trg_a2_location_master_role on public.locations;
create trigger trg_a2_location_master_role
before update
on public.locations
for each row
execute function private.guard_location_master_role();

drop trigger if exists trg_a2_zone_parent_state on public.zones;
create trigger trg_a2_zone_parent_state
before insert or update of warehouse_id, is_active
on public.zones
for each row
execute function private.guard_zone_parent_state();

drop trigger if exists trg_a2_zone_deactivation on public.zones;
create trigger trg_a2_zone_deactivation
before update of is_active
on public.zones
for each row
execute function private.guard_zone_deactivation();

drop trigger if exists trg_a2_location_hierarchy on public.locations;
create trigger trg_a2_location_hierarchy
before insert or update of warehouse_id, zone_id
on public.locations
for each row
execute function private.guard_location_hierarchy();

drop trigger if exists trg_a2_location_parent_state on public.locations;
create trigger trg_a2_location_parent_state
before insert or update of warehouse_id, zone_id, is_active
on public.locations
for each row
execute function private.guard_location_parent_state();

drop trigger if exists trg_a2_location_deactivation on public.locations;
create trigger trg_a2_location_deactivation
before update of is_active
on public.locations
for each row
execute function private.guard_location_deactivation();

drop trigger if exists trg_a2_inventory_location_hierarchy on public.inventory;
create trigger trg_a2_inventory_location_hierarchy
before insert or update of warehouse_id, location_id
on public.inventory
for each row
execute function private.guard_inventory_location_hierarchy();

drop trigger if exists trg_a2_warehouse_deactivation on public.warehouses;
create trigger trg_a2_warehouse_deactivation
before update of is_active
on public.warehouses
for each row
execute function private.guard_warehouse_deactivation();

-- -----------------------------------------------------------------------------
-- History-safe foreign keys. Physical structure deletion must never cascade
-- stock away or erase/null movement provenance. Explicit stock migration is the
-- only supported path before deleting referenced warehouse structure.
-- -----------------------------------------------------------------------------

alter table public.inventory
  drop constraint if exists inventory_warehouse_id_fkey,
  add constraint inventory_warehouse_id_fkey
    foreign key (warehouse_id) references public.warehouses(id) on delete restrict;

alter table public.inventory
  drop constraint if exists inventory_location_id_fkey,
  add constraint inventory_location_id_fkey
    foreign key (location_id) references public.locations(id) on delete restrict;

alter table public.zones
  drop constraint if exists zones_warehouse_id_fkey,
  add constraint zones_warehouse_id_fkey
    foreign key (warehouse_id) references public.warehouses(id) on delete restrict;

alter table public.locations
  drop constraint if exists locations_warehouse_id_fkey,
  add constraint locations_warehouse_id_fkey
    foreign key (warehouse_id) references public.warehouses(id) on delete restrict;

alter table public.locations
  drop constraint if exists locations_zone_id_fkey,
  add constraint locations_zone_id_fkey
    foreign key (zone_id) references public.zones(id) on delete restrict;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_from_warehouse_id_fkey,
  add constraint inventory_movements_from_warehouse_id_fkey
    foreign key (from_warehouse_id) references public.warehouses(id) on delete restrict;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_to_warehouse_id_fkey,
  add constraint inventory_movements_to_warehouse_id_fkey
    foreign key (to_warehouse_id) references public.warehouses(id) on delete restrict;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_from_location_id_fkey,
  add constraint inventory_movements_from_location_id_fkey
    foreign key (from_location_id) references public.locations(id) on delete restrict;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_to_location_id_fkey,
  add constraint inventory_movements_to_location_id_fkey
    foreign key (to_location_id) references public.locations(id) on delete restrict;

commit;
