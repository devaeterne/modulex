-- Order approval / margin assessment hardening.
-- Uses the same canonical per-line cost projection as Project profitability.

create or replace function private.assess_customer_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.customer_orders%rowtype;
  v_group record;
  v_payment_default numeric := 0;
  v_admin_fee_default numeric := 3;
  v_rule_rate numeric;
  v_rule_active boolean := false;
  v_global_min numeric := 20;
  v_warning_buffer numeric := 5;
  v_reasons jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_line record;
  v_discount_factor numeric := 1;
  v_line_revenue numeric;
  v_line_cost numeric;
  v_line_margin numeric;
  v_total_cost numeric := 0;
  v_net_sales numeric := 0;
  v_order_margin numeric;
  v_missing_cost boolean := false;
  v_credit_limit numeric;
  v_credit_hold boolean := false;
  v_outstanding numeric := 0;
  v_key text;
begin
  select * into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  select pg.system_key, pg.name, pg.available_for_orders, pg.requires_approval, pg.internal_only
  into v_group
  from public.price_groups pg
  where pg.id = v_order.price_group_id;

  if coalesce(v_group.internal_only,false) or not coalesce(v_group.available_for_orders,true) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','restricted_price_group',
      'label','Price group is internal-only or unavailable for orders',
      'price_group',v_group.name
    ));
  elsif coalesce(v_group.requires_approval,false) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','restricted_price_group',
      'label','Selected price group requires approval',
      'price_group',v_group.name
    ));
  end if;

  if coalesce(v_order.discount_amount,0) > 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','order_discount',
      'label','Order-level discount entered',
      'amount',v_order.discount_amount
    ));
  end if;

  select coalesce(pm.commission_percent,0)
  into v_payment_default
  from public.payment_methods pm
  where pm.id = v_order.payment_method_id;

  if abs(coalesce(v_order.payment_commission_percent,0) - coalesce(v_payment_default,0)) > 0.0005 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','payment_commission_override',
      'label','Payment commission differs from the payment-method default',
      'default_percent',v_payment_default,
      'applied_percent',v_order.payment_commission_percent
    ));
  end if;

  select coalesce(gs.administrative_fee_default_percent,3.000)
  into v_admin_fee_default
  from public.general_settings gs
  where gs.id = 1;
  v_admin_fee_default := coalesce(v_admin_fee_default,3.000);

  if abs(coalesce(v_order.administrative_fee_percent,0) - v_admin_fee_default) > 0.0005 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','administrative_fee_override',
      'label','Administrative Fee differs from the company default',
      'default_percent',v_admin_fee_default,
      'applied_percent',v_order.administrative_fee_percent
    ));
  end if;

  select r.tax_rate, r.is_active
  into v_rule_rate, v_rule_active
  from public.order_tax_rules r
  where r.fulfillment_type = v_order.fulfillment_type;

  if coalesce(v_rule_active,false) and v_rule_rate is not null then
    if abs(coalesce(v_order.tax_rate,0) - v_rule_rate) > 0.0005 then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','tax_override',
        'label','Tax rate differs from the configured fulfillment tax rule',
        'fulfillment_type',v_order.fulfillment_type,
        'configured_rate',v_rule_rate,
        'applied_rate',v_order.tax_rate
      ));
    end if;
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'type','tax_rule_not_configured',
      'label','No active tax rule is configured for this fulfillment type',
      'fulfillment_type',v_order.fulfillment_type
    ));
  end if;

  select coalesce(ps.default_min_margin_percent,20), coalesce(ps.warning_margin_buffer_percent,5)
  into v_global_min, v_warning_buffer
  from public.pricing_settings ps
  where ps.id = 1;

  -- Canonical order revenue is customer_visible_sell_amount: Base Sell after order
  -- discount plus Administrative Fee, before tax and payment surcharge.
  if coalesce(v_order.subtotal,0) > 0 then
    v_discount_factor := greatest(coalesce(v_order.customer_visible_sell_amount,0),0) / v_order.subtotal;
  end if;

  for v_line in
    select
      i.id,
      i.product_id,
      i.sku_snapshot,
      i.product_name_snapshot,
      i.quantity,
      i.unit_price,
      i.discount_percent,
      i.line_total,
      i.price_source,
      coalesce(pms.min_margin_percent, v_global_min) as min_margin_percent,
      pl.unit_cost as cost_amount,
      pl.missing_cost
    from public.customer_order_items i
    left join public.product_margin_settings pms on pms.product_id = i.product_id
    left join private.v_profitability_order_lines pl on pl.item_id = i.id
    where i.order_id = p_order_id
    order by i.line_no
  loop
    if v_line.price_source = 'manual' then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','manual_price',
        'label','Manual unit price used',
        'sku',v_line.sku_snapshot,
        'unit_price',v_line.unit_price
      ));
    end if;

    if coalesce(v_line.discount_percent,0) > 0 then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','line_discount',
        'label','Line discount entered',
        'sku',v_line.sku_snapshot,
        'discount_percent',v_line.discount_percent
      ));
    end if;

    v_line_revenue := coalesce(v_line.line_total,0) * v_discount_factor;
    v_net_sales := v_net_sales + v_line_revenue;

    if coalesce(v_line.missing_cost, true) or v_line.cost_amount is null then
      v_missing_cost := true;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','cost_missing',
        'label','Canonical product cost is missing; margin cannot be validated',
        'sku',v_line.sku_snapshot
      ));
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'sku',v_line.sku_snapshot,
        'revenue',round(v_line_revenue,4),
        'cost',null,
        'margin_percent',null,
        'minimum_margin_percent',v_line.min_margin_percent
      ));
    else
      v_line_cost := coalesce(v_line.cost_amount,0) * coalesce(v_line.quantity,0);
      v_total_cost := v_total_cost + v_line_cost;
      v_line_margin := case
        when v_line_revenue > 0 then ((v_line_revenue - v_line_cost) / v_line_revenue) * 100
        else -100
      end;

      if v_line_margin < v_line.min_margin_percent then
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
          'type','margin_below_minimum',
          'label','Margin is below the allowed minimum',
          'sku',v_line.sku_snapshot,
          'margin_percent',round(v_line_margin,3),
          'minimum_margin_percent',v_line.min_margin_percent
        ));
      elsif v_line_margin < (v_line.min_margin_percent + v_warning_buffer) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'type','margin_warning',
          'label','Margin is close to the minimum',
          'sku',v_line.sku_snapshot,
          'margin_percent',round(v_line_margin,3),
          'minimum_margin_percent',v_line.min_margin_percent
        ));
      end if;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'sku',v_line.sku_snapshot,
        'revenue',round(v_line_revenue,4),
        'cost',round(v_line_cost,4),
        'margin_percent',round(v_line_margin,3),
        'minimum_margin_percent',v_line.min_margin_percent
      ));
    end if;
  end loop;

  v_order_margin := case
    when v_missing_cost or v_net_sales <= 0 then null
    else ((v_net_sales - v_total_cost) / v_net_sales) * 100
  end;

  select coalesce(ccs.credit_hold,false), ccs.credit_limit
  into v_credit_hold, v_credit_limit
  from public.customer_commercial_settings ccs
  where ccs.customer_id = v_order.customer_id;

  if coalesce(v_credit_hold,false) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','customer_credit_hold',
      'label','Customer is currently on credit hold'
    ));
  end if;

  if v_credit_limit is not null then
    select coalesce(sum(greatest(ci.total_amount - ci.paid_amount,0)),0)
    into v_outstanding
    from public.customer_invoices ci
    where ci.customer_id = v_order.customer_id
      and ci.status in ('issued','partially_paid','overdue');

    if (v_outstanding + coalesce(v_order.grand_total,v_order.total_amount,0)) > v_credit_limit then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','credit_limit_exceeded',
        'label','Order would exceed the customer credit limit',
        'credit_limit',v_credit_limit,
        'current_outstanding',v_outstanding,
        'order_total',coalesce(v_order.grand_total,v_order.total_amount,0)
      ));
    end if;
  end if;

  -- Include evaluated costs in the approval key. A Cost Price change while an order
  -- is still draft therefore invalidates a stale approval instead of reusing it.
  select md5(jsonb_build_object(
    'price_group_id',v_order.price_group_id,
    'fulfillment_type',v_order.fulfillment_type,
    'payment_method_id',v_order.payment_method_id,
    'payment_commission_percent',v_order.payment_commission_percent,
    'administrative_fee_percent',v_order.administrative_fee_percent,
    'administrative_fee_amount',v_order.administrative_fee_amount,
    'customer_visible_sell_amount',v_order.customer_visible_sell_amount,
    'discount_amount',v_order.discount_amount,
    'tax_rate',v_order.tax_rate,
    'subtotal',v_order.subtotal,
    'grand_total',v_order.grand_total,
    'cost_evaluation',v_lines,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,
        'quantity',i.quantity,
        'unit_price',i.unit_price,
        'discount_percent',i.discount_percent,
        'line_total',i.line_total,
        'price_source',i.price_source
      ) order by i.line_no)
      from public.customer_order_items i
      where i.order_id = p_order_id
    ),'[]'::jsonb)
  )::text)
  into v_key;

  return jsonb_build_object(
    'requires_approval', jsonb_array_length(v_reasons) > 0,
    'approval_key', v_key,
    'reasons', v_reasons,
    'warnings', v_warnings,
    'order_margin_percent', case when v_order_margin is null then null else round(v_order_margin,3) end,
    'net_sales', round(v_net_sales,4),
    'total_cost', case when v_missing_cost then null else round(v_total_cost,4) end,
    'lines', v_lines
  );
end;
$$;
