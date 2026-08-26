begin;

create sequence if not exists public.customer_installation_number_seq
  start with 1 increment by 1 minvalue 1;

create table if not exists public.customer_installations (
  id uuid primary key default gen_random_uuid(),
  installation_number text not null unique,
  customer_id uuid not null references public.customers(id) on update cascade on delete restrict,
  order_id uuid not null references public.customer_orders(id) on update cascade on delete restrict,
  shipment_id uuid references public.customer_shipments(id) on update cascade on delete set null,
  status text not null default 'scheduled',
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz,
  address_snapshot jsonb,
  assigned_to uuid references public.profiles(id) on delete set null,
  team_name text,
  contact_name text,
  contact_phone text,
  notes text,
  internal_notes text,
  completion_notes text,
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_installations_number_not_empty check (length(trim(installation_number)) > 0),
  constraint customer_installations_status_valid check (status in ('scheduled','confirmed','in_progress','completed','cancelled')),
  constraint customer_installations_schedule_valid check (scheduled_end_at is null or scheduled_end_at > scheduled_start_at)
);

create index if not exists customer_installations_customer_idx on public.customer_installations(customer_id, scheduled_start_at desc);
create index if not exists customer_installations_order_idx on public.customer_installations(order_id, scheduled_start_at desc);
create index if not exists customer_installations_status_idx on public.customer_installations(status, scheduled_start_at);
create index if not exists customer_installations_assigned_idx on public.customer_installations(assigned_to, scheduled_start_at) where assigned_to is not null;

create or replace function public.set_customer_installation_defaults()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.installation_number is null or trim(new.installation_number) = '' then
    new.installation_number := 'INS-' || lpad(nextval('public.customer_installation_number_seq')::text, 6, '0');
  end if;
  new.installation_number := upper(trim(new.installation_number));
  return new;
end;
$$;

drop trigger if exists trg_set_customer_installation_defaults on public.customer_installations;
create trigger trg_set_customer_installation_defaults
before insert on public.customer_installations
for each row execute function public.set_customer_installation_defaults();

create or replace function public.set_customer_installation_metadata()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_customer_installations_updated on public.customer_installations;
create trigger trg_customer_installations_updated
before update on public.customer_installations
for each row execute function public.set_customer_installation_metadata();

create or replace function public.create_customer_installation_from_order(
  p_order_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz default null,
  p_assigned_to uuid default null,
  p_team_name text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_shipment_id uuid default null
)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_installation_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to schedule installations.';
  end if;

  if p_scheduled_start_at is null then
    raise exception 'Scheduled start is required.';
  end if;
  if p_scheduled_end_at is not null and p_scheduled_end_at <= p_scheduled_start_at then
    raise exception 'Scheduled end must be after scheduled start.';
  end if;

  select * into v_order from public.customer_orders where id = p_order_id for share;
  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status in ('draft','cancelled','completed') then
    raise exception 'This order cannot be scheduled for installation.';
  end if;

  if p_shipment_id is not null and not exists (
    select 1 from public.customer_shipments s
    where s.id = p_shipment_id and s.order_id = p_order_id
  ) then
    raise exception 'Selected shipment does not belong to this order.';
  end if;

  if exists (
    select 1 from public.customer_installations i
    where i.order_id = p_order_id and i.status <> 'cancelled'
  ) then
    raise exception 'This order already has an active installation appointment.';
  end if;

  insert into public.customer_installations (
    installation_number, customer_id, order_id, shipment_id, status,
    scheduled_start_at, scheduled_end_at, address_snapshot,
    assigned_to, team_name, contact_name, contact_phone, notes, internal_notes
  ) values (
    '', v_order.customer_id, v_order.id, p_shipment_id, 'scheduled',
    p_scheduled_start_at, p_scheduled_end_at,
    coalesce(v_order.shipping_address_snapshot, v_order.billing_address_snapshot),
    p_assigned_to, nullif(trim(p_team_name), ''), nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_phone), ''), nullif(trim(p_notes), ''), nullif(trim(p_internal_notes), '')
  ) returning id into v_installation_id;

  if v_order.status not in ('installation_scheduled','installation_in_progress') then
    perform public.set_customer_order_status(v_order.id, 'installation_scheduled', 'Installation appointment scheduled.');
  end if;

  return v_installation_id;
end;
$$;

create or replace function public.update_customer_installation_schedule(
  p_installation_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz default null,
  p_assigned_to uuid default null,
  p_team_name text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_internal_notes text default null
)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_status text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to edit installations.';
  end if;
  if p_scheduled_start_at is null then raise exception 'Scheduled start is required.'; end if;
  if p_scheduled_end_at is not null and p_scheduled_end_at <= p_scheduled_start_at then
    raise exception 'Scheduled end must be after scheduled start.';
  end if;

  select status into v_status from public.customer_installations where id = p_installation_id for update;
  if v_status is null then raise exception 'Installation not found.'; end if;
  if v_status in ('completed','cancelled') then raise exception 'Completed or cancelled installations cannot be rescheduled.'; end if;

  update public.customer_installations
  set scheduled_start_at = p_scheduled_start_at,
      scheduled_end_at = p_scheduled_end_at,
      assigned_to = p_assigned_to,
      team_name = nullif(trim(p_team_name), ''),
      contact_name = nullif(trim(p_contact_name), ''),
      contact_phone = nullif(trim(p_contact_phone), ''),
      notes = nullif(trim(p_notes), ''),
      internal_notes = nullif(trim(p_internal_notes), '')
  where id = p_installation_id;
end;
$$;

create or replace function public.set_customer_installation_status(
  p_installation_id uuid,
  p_status text,
  p_completion_notes text default null
)
returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_installation public.customer_installations%rowtype;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to update installations.';
  end if;
  if p_status not in ('scheduled','confirmed','in_progress','completed','cancelled') then
    raise exception 'Invalid installation status.';
  end if;

  select * into v_installation from public.customer_installations where id = p_installation_id for update;
  if v_installation.id is null then raise exception 'Installation not found.'; end if;
  if v_installation.status in ('completed','cancelled') then
    raise exception 'This installation is already closed.';
  end if;

  if p_status = 'confirmed' then
    update public.customer_installations set status='confirmed', confirmed_at=coalesce(confirmed_at,now()) where id=p_installation_id;
  elsif p_status = 'in_progress' then
    update public.customer_installations set status='in_progress', confirmed_at=coalesce(confirmed_at,now()), started_at=coalesce(started_at,now()) where id=p_installation_id;
    perform public.set_customer_order_status(v_installation.order_id, 'installation_in_progress', 'Installation started: ' || v_installation.installation_number);
  elsif p_status = 'completed' then
    update public.customer_installations
    set status='completed', completed_at=now(), started_at=coalesce(started_at,now()), completion_notes=nullif(trim(p_completion_notes),'')
    where id=p_installation_id;
    perform public.set_customer_order_status(v_installation.order_id, 'completed', 'Installation completed: ' || v_installation.installation_number);
  elsif p_status = 'cancelled' then
    update public.customer_installations set status='cancelled', cancelled_at=now() where id=p_installation_id;
  else
    update public.customer_installations set status='scheduled' where id=p_installation_id;
  end if;

  return p_status;
end;
$$;

alter table public.customer_installations enable row level security;

drop policy if exists customer_installations_read on public.customer_installations;
drop policy if exists customer_installations_insert on public.customer_installations;
drop policy if exists customer_installations_update on public.customer_installations;

create policy customer_installations_read on public.customer_installations for select to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_installations_insert on public.customer_installations for insert to authenticated with check (public.current_user_has_any_role(array['super_admin','admin','sales']));
create policy customer_installations_update on public.customer_installations for update to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales'])) with check (public.current_user_has_any_role(array['super_admin','admin','sales']));

revoke all on public.customer_installations from anon;
grant select,insert,update on public.customer_installations to authenticated;

revoke all on function public.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) to authenticated;
revoke all on function public.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) from public, anon;
grant execute on function public.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) to authenticated;
revoke all on function public.set_customer_installation_status(uuid,text,text) from public, anon;
grant execute on function public.set_customer_installation_status(uuid,text,text) to authenticated;

commit;
