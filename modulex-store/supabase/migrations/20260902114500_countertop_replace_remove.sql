-- Dedicated configured-Countertop removal boundary.
-- Replace continues to use attach_countertop_configuration against the existing order_item_id.
-- Generic update_customer_order configured-Countertop guards remain intentionally unchanged.

create or replace function private.remove_countertop_order_item(
  p_order_item_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_item public.customer_order_items%rowtype;
  v_order public.customer_orders%rowtype;
  v_config public.countertop_configurations%rowtype;
begin
  if v_actor is null
     or not public.current_user_has_any_role(array['super_admin','admin','sales'])
  then
    raise exception 'You do not have permission to remove countertop order items.' using errcode = '42501';
  end if;

  -- Resolve the parent without taking the child lock first. The authoritative
  -- lock order is parent order -> order item, matching the normal order update path.
  select oi.order_id
  into v_order_id
  from public.customer_order_items oi
  where oi.id = p_order_item_id;

  if v_order_id is null then
    raise exception 'Countertop order item not found.';
  end if;

  select o.*
  into v_order
  from public.customer_orders o
  where o.id = v_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'Countertop order items can only be removed from draft orders.';
  end if;

  select oi.*
  into v_item
  from public.customer_order_items oi
  where oi.id = p_order_item_id
    and oi.order_id = v_order.id
  for update;

  if v_item.id is null then
    raise exception 'Countertop order item not found.';
  end if;

  select c.*
  into v_config
  from public.countertop_configurations c
  where c.order_item_id = p_order_item_id
    and c.order_id = v_order.id
  for update;

  if v_config.id is null then
    raise exception 'Order item is not a configured countertop.';
  end if;

  -- BEFORE DELETE releases all active reservations for this stable order_item_id.
  -- The configuration row is removed by its existing ON DELETE CASCADE FK.
  delete from public.customer_order_items
  where id = p_order_item_id
    and order_id = v_order.id;

  if not found then
    raise exception 'Countertop order item not found.';
  end if;

  -- Remaining line numbers deliberately stay stable. The schema requires only
  -- positive, order-unique line numbers; gaps are valid. Updating retained rows
  -- just to close a gap would fire the global order-item pricing trigger and could
  -- reprice unrelated Cabinet lines during a Countertop-only removal.

  insert into public.customer_activity(
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  )
  values (
    v_order.customer_id,
    'order_updated',
    'Countertop removed',
    v_order.order_number || ' countertop line ' || v_item.line_no || ' removed',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_item_id', v_item.id,
      'line_no', v_item.line_no,
      'sku', v_item.sku_snapshot,
      'product_name', v_item.product_name_snapshot,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'countertop_configuration', v_config.configuration,
      'countertop_snapshot', v_config.pricing_snapshot
    ),
    v_actor
  );

  -- customer_order_items already owns the canonical DEFERRABLE totals trigger.
  -- It reconciles item_count/subtotal/tax/commission/grand_total at commit and
  -- rolls this transaction back if the remaining subtotal violates order discount.
  return v_order.id;
end;
$$;

create or replace function public.remove_countertop_order_item(
  p_order_item_id uuid,
  p_reason text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.remove_countertop_order_item($1, $2);
$$;

revoke all on function private.remove_countertop_order_item(uuid,text) from public, anon, authenticated;
grant execute on function private.remove_countertop_order_item(uuid,text) to authenticated;
revoke all on function public.remove_countertop_order_item(uuid,text) from public, anon;
grant execute on function public.remove_countertop_order_item(uuid,text) to authenticated;

notify pgrst, 'reload schema';
