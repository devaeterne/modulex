-- Draft-only manual display titles for configured Countertop order lines.
-- This is intentionally narrower than the general Order revision path: product master data
-- remains untouched and only the historical order-line name snapshot may be overridden.

create or replace function private.set_countertop_order_item_title_v1(
  p_order_item_id uuid,
  p_title text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_order_status text;
  v_customer_id uuid;
  v_order_number text;
  v_line_no integer;
  v_previous_title text;
  v_default_title text;
  v_resolved_title text;
begin
  if v_actor is null
     or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to edit Countertop order-line titles.'
      using errcode = '42501';
  end if;

  select
    oi.order_id,
    o.status::text,
    o.customer_id,
    o.order_number,
    oi.line_no,
    oi.product_name_snapshot,
    coalesce(
      nullif(btrim(cc.pricing_snapshot->'stone'->>'name'), ''),
      nullif(btrim(p.name), ''),
      'Countertop'
    )
  into
    v_order_id,
    v_order_status,
    v_customer_id,
    v_order_number,
    v_line_no,
    v_previous_title,
    v_default_title
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  join public.countertop_configurations cc on cc.order_item_id = oi.id
  left join public.products p on p.id = oi.product_id
  where oi.id = p_order_item_id
  for update of oi;

  if not found then
    raise exception 'Configured Countertop order item not found.'
      using errcode = 'P0002';
  end if;

  if v_order_status <> 'draft' then
    raise exception 'Countertop line title can only be changed while the order is Draft.'
      using errcode = '55000';
  end if;

  v_resolved_title := nullif(btrim(coalesce(p_title,'')),'');
  if v_resolved_title is null then
    v_resolved_title := v_default_title;
  end if;

  if char_length(v_resolved_title) > 160 then
    raise exception 'Countertop line title must be 160 characters or fewer.'
      using errcode = '22023';
  end if;

  if v_resolved_title is distinct from v_previous_title then
    update public.customer_order_items
    set product_name_snapshot = v_resolved_title
    where id = p_order_item_id;

    insert into public.customer_activity (
      customer_id,
      activity_type,
      title,
      description,
      metadata,
      actor_user_id
    ) values (
      v_customer_id,
      'order_updated',
      'Countertop line title updated',
      format(
        'Order %s line %s title changed from "%s" to "%s".',
        v_order_number,
        v_line_no,
        coalesce(v_previous_title, ''),
        v_resolved_title
      ),
      jsonb_build_object(
        'order_id', v_order_id,
        'order_item_id', p_order_item_id,
        'line_no', v_line_no,
        'previous_title', v_previous_title,
        'new_title', v_resolved_title
      ),
      v_actor
    );
  end if;

  return v_resolved_title;
end;
$$;

create or replace function public.set_countertop_order_item_title(
  p_order_item_id uuid,
  p_title text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.set_countertop_order_item_title_v1(p_order_item_id, p_title);
end;
$$;

revoke all on function private.set_countertop_order_item_title_v1(uuid, text) from public, anon;
revoke all on function public.set_countertop_order_item_title(uuid, text) from public, anon;

grant execute on function private.set_countertop_order_item_title_v1(uuid, text) to authenticated;
grant execute on function public.set_countertop_order_item_title(uuid, text) to authenticated;
