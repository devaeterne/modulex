-- Add a secure draft-order Countertop initiation boundary without weakening Order Product Pricing V2.
-- The browser never inserts a Stone order item directly. This function opens the same
-- transaction-scoped private pricing gate and immediately delegates pricing/configuration
-- to private.attach_countertop_configuration.

create table if not exists private.countertop_order_item_initiations (
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  request_id uuid not null,
  order_item_id uuid not null references public.customer_order_items(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (order_id, request_id),
  unique (order_item_id)
);

revoke all on table private.countertop_order_item_initiations from public, anon, authenticated;

create or replace function private.create_and_attach_countertop_order_item(
  p_order_id uuid,
  p_request_id uuid,
  p_stone_product_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_item_id uuid := gen_random_uuid();
  v_existing_item_id uuid;
  v_existing_actor uuid;
  v_line_no integer;
  v_stone record;
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to add countertop order items.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Countertop initiation request id is required.';
  end if;

  -- Serialize retries for the same order/request pair before checking idempotency.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text || ':' || p_request_id::text, 0));

  select i.order_item_id, i.created_by
  into v_existing_item_id, v_existing_actor
  from private.countertop_order_item_initiations i
  where i.order_id = p_order_id and i.request_id = p_request_id;

  if v_existing_item_id is not null then
    if v_existing_actor is distinct from v_actor then
      raise exception 'Countertop initiation request belongs to another actor.' using errcode = '42501';
    end if;
    return v_existing_item_id;
  end if;

  select o.* into v_order
  from public.customer_orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status <> 'draft' then
    raise exception 'Countertop order items can only be added to draft orders.';
  end if;

  select p.sku, p.name
  into v_stone
  from public.products p
  join public.countertop_stone_product_profiles sp on sp.product_id = p.id and sp.is_active = true
  join public.product_types pt on pt.id = p.product_type_id
  where p.id = p_stone_product_id
    and p.status = 'active'
    and pt.pricing_model = 'countertop_material_band';
  if not found then
    raise exception 'Stone product is unavailable or is not a canonical Countertop Material Band product.';
  end if;

  select coalesce(max(oi.line_no), 0) + 1
  into v_line_no
  from public.customer_order_items oi
  where oi.order_id = p_order_id;

  -- Pricing V2 allows the controlled Stone INSERT only while this exact item id has
  -- the private transaction capability. Browser roles have no access to the gate table.
  insert into private.countertop_order_pricing_gate(backend_pid, transaction_id, order_item_id)
  values (pg_backend_pid(), txid_current(), v_item_id)
  on conflict do nothing;

  insert into public.customer_order_items(
    id, order_id, product_id, line_no, sku_snapshot, product_name_snapshot,
    quantity, unit_price, discount_percent, discount_amount, line_subtotal,
    line_total, price_source, countertop_reservation_quantity, created_by
  ) values (
    v_item_id, p_order_id, p_stone_product_id, v_line_no, v_stone.sku, v_stone.name,
    1, 0, 0, 0, 0, 0, 'price_group', p_slab_quantity, v_actor
  );

  perform private.attach_countertop_configuration(
    v_item_id,
    p_stone_product_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_sink_product_id,
    p_services,
    p_configuration,
    p_manual_material_price,
    p_slab_quantity,
    p_override_reason
  );

  -- Canonical attach normally closes this gate. Keep cleanup explicit for forward safety.
  delete from private.countertop_order_pricing_gate
  where backend_pid = pg_backend_pid()
    and transaction_id = txid_current()
    and order_item_id = v_item_id;

  insert into private.countertop_order_item_initiations(order_id, request_id, order_item_id, created_by)
  values (p_order_id, p_request_id, v_item_id, v_actor);

  insert into public.customer_activity(customer_id, activity_type, title, description, metadata)
  values (
    v_order.customer_id,
    'order_updated',
    'Countertop added',
    v_order.order_number || ' countertop line ' || v_line_no,
    jsonb_build_object('order_id', p_order_id, 'order_item_id', v_item_id, 'request_id', p_request_id)
  );

  return v_item_id;
end;
$$;

revoke all on function private.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function private.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

create or replace function public.create_and_attach_countertop_order_item(
  p_order_id uuid,
  p_request_id uuid,
  p_stone_product_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_and_attach_countertop_order_item($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13);
$$;

revoke all on function public.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function public.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;
