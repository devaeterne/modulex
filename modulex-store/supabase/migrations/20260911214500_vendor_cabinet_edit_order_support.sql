-- Complete the saved-Draft Vendor Cabinet workflow.
--
-- 1. Order operators need a narrow active-vendor lookup without Finance detail access.
-- 2. Productless manual_vendor_cabinet lines are owned by the dedicated Vendor Cabinet workflow;
--    generic Order revisions must preserve them instead of deleting/repricing them.
-- 3. When generic revisions renumber Product-backed lines, move a colliding Vendor Cabinet
--    line out of the way while keeping the line itself immutable.

create or replace function public.get_active_order_vendors()
returns table (
  id uuid,
  code text,
  legal_name text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to select Order vendors.' using errcode = '42501';
  end if;

  return query
  select v.id, v.code, v.legal_name, v.display_name
  from public.vendors v
  where v.status = 'active'
  order by coalesce(nullif(btrim(v.display_name), ''), v.legal_name), v.code, v.id;
end;
$$;

revoke all on function public.get_active_order_vendors() from public, anon;
grant execute on function public.get_active_order_vendors() to authenticated;

comment on function public.get_active_order_vendors() is
  'Narrow Order-authorized lookup for active canonical Vendors; exposes no Finance/compliance/remittance detail.';

create or replace function private.preserve_manual_vendor_cabinet_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.pricing_model_snapshot, '') = 'manual_vendor_cabinet'
     and coalesce(current_setting('modulex.allow_vendor_cabinet_delete', true), '') <> 'on' then
    -- Generic Order revision deletion is intentionally ignored. Productless Vendor Cabinet
    -- lines must be changed/removed only through the dedicated Vendor Cabinet workflow.
    return null;
  end if;
  return old;
end;
$$;

revoke all on function private.preserve_manual_vendor_cabinet_on_delete() from public, anon, authenticated;

drop trigger if exists customer_order_items_preserve_manual_vendor_cabinet on public.customer_order_items;
create trigger customer_order_items_preserve_manual_vendor_cabinet
before delete on public.customer_order_items
for each row execute function private.preserve_manual_vendor_cabinet_on_delete();

create or replace function private.shift_manual_vendor_cabinet_line_collision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_line integer;
begin
  if coalesce(new.pricing_model_snapshot, '') = 'manual_vendor_cabinet'
     or new.order_id is null
     or new.line_no is null then
    return new;
  end if;

  if exists (
    select 1
    from public.customer_order_items v
    where v.order_id = new.order_id
      and v.line_no = new.line_no
      and v.id is distinct from new.id
      and coalesce(v.pricing_model_snapshot, '') = 'manual_vendor_cabinet'
  ) then
    select coalesce(max(i.line_no), 0) + 1000
    into v_next_line
    from public.customer_order_items i
    where i.order_id = new.order_id;

    update public.customer_order_items v
    set line_no = v_next_line
    where v.order_id = new.order_id
      and v.line_no = new.line_no
      and v.id is distinct from new.id
      and coalesce(v.pricing_model_snapshot, '') = 'manual_vendor_cabinet';
  end if;

  return new;
end;
$$;

revoke all on function private.shift_manual_vendor_cabinet_line_collision() from public, anon, authenticated;

drop trigger if exists customer_order_items_shift_manual_vendor_cabinet_collision on public.customer_order_items;
create trigger customer_order_items_shift_manual_vendor_cabinet_collision
before insert or update of order_id, line_no on public.customer_order_items
for each row execute function private.shift_manual_vendor_cabinet_line_collision();

comment on function private.preserve_manual_vendor_cabinet_on_delete() is
  'Preserves manual_vendor_cabinet rows from generic revisions; deletion requires the dedicated Vendor Cabinet workflow session gate.';
comment on function private.shift_manual_vendor_cabinet_line_collision() is
  'Moves a preserved Vendor Cabinet line away from a Product-backed line number during generic revision renumbering.';
