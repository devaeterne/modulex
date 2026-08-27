-- Align shipment permissions with the central RBAC matrix.
-- Applied to production as migration: align_shipment_role_permissions

-- Shipment RPCs allow operational shipment roles. The production migration
-- re-created the existing functions with these role guards and SECURITY DEFINER:
--   super_admin, admin, sales, warehouse, shipping
-- For ship/deliver workflow-driven order transitions, call
-- private.apply_customer_order_status instead of the public general order-status RPC.

alter function public.configure_customer_shipment_item(uuid,numeric,uuid,uuid) security definer;
alter function public.configure_customer_shipment_item(uuid,numeric,uuid,uuid) set search_path to public, private, pg_temp;
alter function public.create_customer_shipment_from_order(uuid,text,text) security definer;
alter function public.create_customer_shipment_from_order(uuid,text,text) set search_path to public, private, pg_temp;
alter function public.deliver_customer_shipment(uuid) security definer;
alter function public.deliver_customer_shipment(uuid) set search_path to public, private, pg_temp;
alter function public.set_customer_shipment_status(uuid,text) security definer;
alter function public.set_customer_shipment_status(uuid,text) set search_path to public, private, pg_temp;
alter function public.ship_customer_shipment(uuid,text,text,text) security definer;
alter function public.ship_customer_shipment(uuid,text,text,text) set search_path to public, private, pg_temp;

drop policy if exists customer_shipments_read on public.customer_shipments;
create policy customer_shipments_read on public.customer_shipments
for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])));

drop policy if exists customer_shipments_insert on public.customer_shipments;
create policy customer_shipments_insert on public.customer_shipments
for insert to authenticated
with check ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])));

drop policy if exists customer_shipments_update on public.customer_shipments;
create policy customer_shipments_update on public.customer_shipments
for update to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])))
with check ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])));

drop policy if exists customer_shipment_items_read on public.customer_shipment_items;
create policy customer_shipment_items_read on public.customer_shipment_items
for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])));

drop policy if exists customer_shipment_items_insert on public.customer_shipment_items;
create policy customer_shipment_items_insert on public.customer_shipment_items
for insert to authenticated
with check ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])));

drop policy if exists customer_shipment_items_update on public.customer_shipment_items;
create policy customer_shipment_items_update on public.customer_shipment_items
for update to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])))
with check ((select public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping'])));

create or replace function public.get_customer_shipment_references(p_shipment_ids uuid[] default null)
returns table(shipment_id uuid, customer_name text, order_number text)
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping']) then
    raise exception 'You do not have permission to view shipment references.';
  end if;

  return query
  select s.id, c.name, o.order_number
  from public.customer_shipments s
  left join public.customers c on c.id = s.customer_id
  left join public.customer_orders o on o.id = s.order_id
  where p_shipment_ids is null or s.id = any(p_shipment_ids);
end;
$function$;

revoke all on function public.get_customer_shipment_references(uuid[]) from public;
grant execute on function public.get_customer_shipment_references(uuid[]) to authenticated;
