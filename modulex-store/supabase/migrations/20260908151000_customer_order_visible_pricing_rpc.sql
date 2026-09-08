-- Guarded Admin projection for customer-facing Order document rendering.
-- It exposes only customer-visible pricing, never the internal Administrative Fee allocation.

create or replace function public.get_customer_order_visible_line_pricing(p_order_id uuid)
returns table (
  order_item_id uuid,
  line_no integer,
  customer_visible_unit_price numeric,
  customer_visible_discount_amount numeric,
  customer_visible_line_subtotal numeric,
  customer_visible_line_total numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null
     or not public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[]) then
    raise exception 'You do not have permission to view customer Order pricing.' using errcode='42501';
  end if;

  return query
  select
    v.order_item_id,
    v.line_no,
    v.customer_visible_unit_price,
    v.customer_visible_discount_amount,
    v.customer_visible_line_subtotal,
    v.customer_visible_line_total
  from private.customer_order_visible_line_pricing(p_order_id) v
  order by v.line_no, v.order_item_id;
end;
$$;

revoke all on function public.get_customer_order_visible_line_pricing(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_customer_order_visible_line_pricing(uuid) to authenticated;
