-- PB-3B Project Procurement Order lifecycle synchronization.
-- Keep procurement demand DB-authoritative; browser/UI code is not a synchronization boundary.

create or replace function private.sync_customer_order_procurement_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if new.project_id is not null
     and (
       (
         new.status in ('confirmed', 'cancelled')
         and old.status is distinct from new.status
       )
       or
       (
         new.project_id is distinct from old.project_id
         and new.status <> 'draft'
       )
     )
  then
    perform private.sync_customer_order_procurement(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.sync_customer_order_procurement_on_order_change() from public, anon, authenticated;

drop trigger if exists trg_customer_order_project_procurement_sync on public.customer_orders;
create trigger trg_customer_order_project_procurement_sync
after update of status, project_id on public.customer_orders
for each row
execute function private.sync_customer_order_procurement_on_order_change();

create or replace function private.sync_customer_order_procurement_on_revision_activity()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_order_id uuid;
begin
  if new.activity_type <> 'order_revised'
     or coalesce(new.metadata->>'order_id', '') = ''
  then
    return new;
  end if;

  begin
    v_order_id := (new.metadata->>'order_id')::uuid;
  exception
    when invalid_text_representation then
      -- Existing activity rows are not a trusted mutation input. Ignore malformed
      -- legacy metadata instead of letting the audit insert break unrelated work.
      return new;
  end;

  if exists (
    select 1
    from public.customer_orders o
    where o.id = v_order_id
      and o.project_id is not null
      and o.status <> 'draft'
  ) then
    perform private.sync_customer_order_procurement(v_order_id);
  end if;

  return new;
end;
$$;

revoke all on function private.sync_customer_order_procurement_on_revision_activity() from public, anon, authenticated;

drop trigger if exists trg_customer_activity_project_procurement_revision_sync on public.customer_activity;
create trigger trg_customer_activity_project_procurement_revision_sync
after insert on public.customer_activity
for each row
when (new.activity_type = 'order_revised')
execute function private.sync_customer_order_procurement_on_revision_activity();

-- Intentionally no customer_activity writes and no inventory_movements writes here.
-- The hooks only synchronize procurement demand from canonical Order truth.
