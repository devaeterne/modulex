-- Runtime hardening after production acceptance. Additive; do not rewrite applied migrations.

create or replace function private.audit_countertop_reference_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_record_text text;
  v_record_id uuid;
begin
  v_record_text := coalesce(v_new->>'product_id', v_old->>'product_id');
  if v_record_text is null then
    v_record_text := coalesce(v_new->>'id', v_old->>'id');
  end if;
  v_record_id := nullif(v_record_text, '')::uuid;
  insert into public.audit_logs(table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, v_record_id, lower(tg_op)::public.audit_action, v_old, v_new, auth.uid());
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_countertop_reference_change() from public, anon, authenticated;

create or replace function private.attach_countertop_configuration(
  p_order_item_id uuid,
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
  v_order_id uuid;
  v_snapshot jsonb;
  v_subtotal numeric(18,4);
  v_order_subtotal numeric(18,4);
  v_order_discount numeric(18,4);
  v_tax_rate numeric(7,3);
  v_commission_rate numeric(7,3);
  v_taxable numeric(18,4);
  v_tax_amount numeric(18,4);
  v_total numeric(18,4);
  v_commission_amount numeric(18,4);
  v_grand_total numeric(18,4);
  v_actor uuid := auth.uid();
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to configure countertop order items.';
  end if;
  if p_slab_quantity <= 0 then raise exception 'Slab quantity must be greater than zero.'; end if;
  if p_manual_material_price is not null and nullif(btrim(coalesce(p_override_reason,'')), '') is null then
    raise exception 'Override reason is required.';
  end if;
  select oi.order_id into v_order_id
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id and o.status = 'draft';
  if v_order_id is null then raise exception 'Countertop configuration is only editable on draft orders.'; end if;

  v_snapshot := public.calculate_countertop_price(p_stone_product_id, p_price_group_id, p_sqft, p_edge_profile_id, p_edge_linear_ft, p_sink_product_id, p_services, p_manual_material_price);
  v_subtotal := (v_snapshot->>'subtotal')::numeric;
  update public.customer_order_items
  set product_id = p_stone_product_id,
      countertop_reservation_quantity = p_slab_quantity,
      sku_snapshot = v_snapshot->'stone'->>'sku',
      product_name_snapshot = v_snapshot->'stone'->>'name',
      quantity = 1,
      unit_price = v_subtotal,
      discount_amount = 0,
      line_subtotal = v_subtotal,
      line_total = v_subtotal,
      price_source = case when p_manual_material_price is null then 'price_group' else 'manual' end
  where id = p_order_item_id;
  insert into public.countertop_configurations(order_id, order_item_id, stone_product_id, sink_product_id, price_group_id, edge_profile_id, sqft, edge_linear_ft, slab_quantity, manual_price_per_sqft, override_reason, overridden_by, overridden_at, configuration, pricing_snapshot, subtotal)
  values (v_order_id, p_order_item_id, p_stone_product_id, p_sink_product_id, p_price_group_id, p_edge_profile_id, p_sqft, p_edge_linear_ft, p_slab_quantity, p_manual_material_price, nullif(btrim(p_override_reason), ''), case when p_manual_material_price is null then null else v_actor end, case when p_manual_material_price is null then null else now() end, coalesce(p_configuration, '{}'::jsonb), v_snapshot, v_subtotal)
  on conflict (order_item_id) do update set
    stone_product_id = excluded.stone_product_id, sink_product_id = excluded.sink_product_id, price_group_id = excluded.price_group_id, edge_profile_id = excluded.edge_profile_id, sqft = excluded.sqft, edge_linear_ft = excluded.edge_linear_ft, slab_quantity = excluded.slab_quantity, manual_price_per_sqft = excluded.manual_price_per_sqft, override_reason = excluded.override_reason, overridden_by = excluded.overridden_by, overridden_at = excluded.overridden_at, configuration = excluded.configuration, pricing_snapshot = excluded.pricing_snapshot, subtotal = excluded.subtotal, updated_at = now();

  select o.discount_amount, o.tax_rate, o.payment_commission_percent
  into v_order_discount, v_tax_rate, v_commission_rate
  from public.customer_orders o
  where o.id = v_order_id
  for update;
  select coalesce(sum(i.line_total), 0)
  into v_order_subtotal
  from public.customer_order_items i
  where i.order_id = v_order_id;
  if coalesce(v_order_discount, 0) > v_order_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  v_taxable := greatest(v_order_subtotal - coalesce(v_order_discount, 0), 0);
  v_tax_amount := round(v_taxable * (coalesce(v_tax_rate, 0) / 100), 4);
  v_total := round(v_taxable + v_tax_amount, 4);
  v_commission_amount := round(v_total * (coalesce(v_commission_rate, 0) / 100), 4);
  v_grand_total := round(v_total + v_commission_amount, 4);
  update public.customer_orders
  set item_count = (select count(*) from public.customer_order_items where order_id = v_order_id),
      subtotal = round(v_order_subtotal, 4),
      tax_amount = v_tax_amount,
      total_amount = v_total,
      payment_commission_amount = v_commission_amount,
      grand_total = v_grand_total
  where id = v_order_id;
  return p_order_item_id;
end;
$$;

revoke all on function private.attach_countertop_configuration(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, jsonb, numeric, numeric, text) from public, anon;
grant execute on function private.attach_countertop_configuration(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, jsonb, numeric, numeric, text) to authenticated;
