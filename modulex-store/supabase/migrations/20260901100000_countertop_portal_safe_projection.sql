-- Additive safe historical countertop projection for Customer and Dealer portals.
create or replace function private.get_store_portal_countertop_projection(p_order_item_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when c.id is null then null::jsonb else jsonb_build_object(
    'stone', jsonb_build_object(
      'name', c.pricing_snapshot->'stone'->>'name', 'sku', c.pricing_snapshot->'stone'->>'sku',
      'stone_type', c.pricing_snapshot->'stone'->>'stone_type',
      'material_price_band', c.pricing_snapshot->'stone'->>'material_price_band',
      'price_per_sqft', c.pricing_snapshot->'stone'->>'price_per_sqft',
      'sqft', c.pricing_snapshot->'stone'->>'sqft', 'subtotal', c.pricing_snapshot->>'material_subtotal'
    ),
    'edge', case when jsonb_typeof(c.pricing_snapshot->'edge') = 'object' then jsonb_build_object(
      'name', c.pricing_snapshot->'edge'->>'name', 'pricing_method', c.pricing_snapshot->'edge'->>'pricing_method',
      'unit_price', c.pricing_snapshot->'edge'->>'unit_price', 'linear_ft', c.pricing_snapshot->'edge'->>'linear_ft',
      'applicable_measure', c.pricing_snapshot->'edge'->>'applicable_measure', 'subtotal', c.pricing_snapshot->'edge'->>'subtotal'
    ) else null::jsonb end,
    'sink', case when jsonb_typeof(c.pricing_snapshot->'sink') = 'object' then jsonb_build_object(
      'name', c.pricing_snapshot->'sink'->>'name', 'sku', c.pricing_snapshot->'sink'->>'sku',
      'unit_price', c.pricing_snapshot->'sink'->>'unit_price', 'subtotal', c.pricing_snapshot->'sink'->>'subtotal'
    ) else null::jsonb end,
    'services', coalesce((select jsonb_agg(jsonb_build_object(
      'name', s->>'name', 'pricing_method', s->>'pricing_method', 'unit_price', s->>'unit_price',
      'quantity', s->>'quantity', 'applicable_measure', s->>'applicable_measure', 'subtotal', s->>'subtotal'
    ) order by s->>'name') from jsonb_array_elements(coalesce(c.pricing_snapshot->'services','[]'::jsonb)) s), '[]'::jsonb),
    'totals', jsonb_build_object(
      'material_subtotal', c.pricing_snapshot->'totals'->>'material_subtotal',
      'edge_subtotal', c.pricing_snapshot->'totals'->>'edge_subtotal',
      'sink_subtotal', c.pricing_snapshot->'totals'->>'sink_subtotal',
      'services_subtotal', c.pricing_snapshot->'totals'->>'services_subtotal',
      'subtotal', c.pricing_snapshot->'totals'->>'subtotal'
    )
  ) end from public.countertop_configurations c where c.order_item_id = p_order_item_id;
$$;
revoke all on function private.get_store_portal_countertop_projection(uuid) from public;
revoke execute on function private.get_store_portal_countertop_projection(uuid) from anon, authenticated;

-- Replace only the item projection in the existing scoped Customer RPC.
create or replace function private.get_store_portal_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_context jsonb := private.get_store_portal_context(); v_customer_id uuid; v_order jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then return jsonb_build_object('ok', false, 'reason', 'portal_access_denied'); end if;
  v_customer_id := (v_context ->> 'customer_id')::uuid;
  select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'order_date',o.order_date,'expected_delivery_date',o.expected_delivery_date,'customer_reference',o.customer_reference,'item_count',o.item_count,'fulfillment_type',o.fulfillment_type,'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'line_no',oi.line_no,'sku_snapshot',oi.sku_snapshot,'product_name_snapshot',oi.product_name_snapshot,'quantity',oi.quantity,'countertop',private.get_store_portal_countertop_projection(oi.id)) order by oi.line_no) from public.customer_order_items oi where oi.order_id=o.id),'[]'::jsonb)) into v_order
  from public.customer_orders o where o.id=p_order_id and o.customer_id=v_customer_id;
  if v_order is null then return jsonb_build_object('ok', false, 'reason', 'order_unavailable'); end if;
  return jsonb_build_object('ok', true, 'reason', 'authorized', 'order', v_order);
end; $$;
revoke all on function private.get_store_portal_order(uuid) from public;
revoke execute on function private.get_store_portal_order(uuid) from anon;
grant execute on function private.get_store_portal_order(uuid) to authenticated;

-- Dealer order responses use the same context and the same sanitized item projection.
create or replace function private.get_store_dealer_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_context jsonb := private.get_store_portal_context(); v_pricing jsonb := private.get_store_dealer_pricing_context(); v_customer_id uuid; v_pricing_enabled boolean; v_order jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true or v_context ->> 'portal_kind' <> 'dealer' then return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied'); end if;
  v_customer_id := (v_context ->> 'customer_id')::uuid; v_pricing_enabled := coalesce((v_pricing ->> 'pricing_enabled')::boolean, false);
  if v_pricing_enabled then
    select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'order_date',o.order_date,'expected_delivery_date',o.expected_delivery_date,'customer_reference',o.customer_reference,'item_count',o.item_count,'fulfillment_type',o.fulfillment_type,'currency_code',o.currency_code,'subtotal',o.subtotal,'discount_amount',o.discount_amount,'tax_rate',o.tax_rate,'tax_amount',o.tax_amount,'total_amount',o.total_amount,'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'line_no',oi.line_no,'sku_snapshot',oi.sku_snapshot,'product_name_snapshot',oi.product_name_snapshot,'quantity',oi.quantity,'unit_price',oi.unit_price,'discount_percent',oi.discount_percent,'discount_amount',oi.discount_amount,'line_subtotal',oi.line_subtotal,'line_total',oi.line_total,'countertop',private.get_store_portal_countertop_projection(oi.id)) order by oi.line_no) from public.customer_order_items oi where oi.order_id=o.id),'[]'::jsonb)) into v_order from public.customer_orders o where o.id=p_order_id and o.customer_id=v_customer_id;
  else
    select jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'order_date',o.order_date,'expected_delivery_date',o.expected_delivery_date,'customer_reference',o.customer_reference,'item_count',o.item_count,'fulfillment_type',o.fulfillment_type,'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'line_no',oi.line_no,'sku_snapshot',oi.sku_snapshot,'product_name_snapshot',oi.product_name_snapshot,'quantity',oi.quantity,'countertop',private.get_store_portal_countertop_projection(oi.id)) order by oi.line_no) from public.customer_order_items oi where oi.order_id=o.id),'[]'::jsonb)) into v_order from public.customer_orders o where o.id=p_order_id and o.customer_id=v_customer_id;
  end if;
  if v_order is null then return jsonb_build_object('ok', false, 'reason', 'order_unavailable'); end if;
  return jsonb_build_object('ok', true, 'reason', 'authorized', 'pricing_enabled', v_pricing_enabled, 'order', v_order);
end; $$;
revoke all on function private.get_store_dealer_order(uuid) from public;
revoke execute on function private.get_store_dealer_order(uuid) from anon;
grant execute on function private.get_store_dealer_order(uuid) to authenticated;
