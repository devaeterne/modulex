-- Dealer Portal is customer-facing. When Dealer pricing is enabled, Administrative Fee must
-- be absorbed into the visible Order lines exactly like printed Order/Invoice documents.
-- No Administrative Fee or legacy commission metadata is exposed by this projection.

create or replace function private.get_store_dealer_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_pricing jsonb := private.get_store_dealer_pricing_context();
  v_customer_id uuid;
  v_pricing_enabled boolean;
  v_order jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true
     or v_context ->> 'portal_kind' <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;
  v_pricing_enabled := coalesce((v_pricing ->> 'pricing_enabled')::boolean, false);

  if v_pricing_enabled then
    select jsonb_build_object(
      'id',o.id,
      'order_number',o.order_number,
      'status',o.status,
      'order_date',o.order_date,
      'expected_delivery_date',o.expected_delivery_date,
      'customer_reference',o.customer_reference,
      'item_count',o.item_count,
      'fulfillment_type',o.fulfillment_type,
      'currency_code',o.currency_code,
      -- Visible lines sum to base subtotal + Administrative Fee. Order discount remains a
      -- separate customer-visible discount, so the displayed subtotal must match that line sum.
      'subtotal',round(coalesce(o.customer_visible_sell_amount,0) + coalesce(o.discount_amount,0),4),
      'discount_amount',o.discount_amount,
      'tax_rate',o.tax_rate,
      'tax_amount',o.tax_amount,
      'total_amount',o.total_amount,
      'items',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',oi.id,
            'line_no',oi.line_no,
            'sku_snapshot',oi.sku_snapshot,
            'product_name_snapshot',oi.product_name_snapshot,
            'quantity',oi.quantity,
            'unit_price',vp.customer_visible_unit_price,
            'discount_percent',oi.discount_percent,
            'discount_amount',vp.customer_visible_discount_amount,
            'line_subtotal',vp.customer_visible_line_subtotal,
            'line_total',vp.customer_visible_line_total,
            'countertop',private.get_store_portal_countertop_projection(oi.id)
          )
          order by oi.line_no
        )
        from public.customer_order_items oi
        join private.customer_order_visible_line_pricing(o.id) vp
          on vp.order_item_id = oi.id
        where oi.order_id=o.id
      ),'[]'::jsonb)
    )
    into v_order
    from public.customer_orders o
    where o.id=p_order_id
      and o.customer_id=v_customer_id;
  else
    select jsonb_build_object(
      'id',o.id,
      'order_number',o.order_number,
      'status',o.status,
      'order_date',o.order_date,
      'expected_delivery_date',o.expected_delivery_date,
      'customer_reference',o.customer_reference,
      'item_count',o.item_count,
      'fulfillment_type',o.fulfillment_type,
      'items',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',oi.id,
            'line_no',oi.line_no,
            'sku_snapshot',oi.sku_snapshot,
            'product_name_snapshot',oi.product_name_snapshot,
            'quantity',oi.quantity,
            'countertop',private.get_store_portal_countertop_projection(oi.id)
          )
          order by oi.line_no
        )
        from public.customer_order_items oi
        where oi.order_id=o.id
      ),'[]'::jsonb)
    )
    into v_order
    from public.customer_orders o
    where o.id=p_order_id
      and o.customer_id=v_customer_id;
  end if;

  if v_order is null then
    return jsonb_build_object('ok', false, 'reason', 'order_unavailable');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'pricing_enabled', v_pricing_enabled,
    'order', v_order
  );
end;
$$;
