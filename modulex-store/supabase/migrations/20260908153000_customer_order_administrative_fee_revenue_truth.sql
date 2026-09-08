-- Administrative Fee production hardening.
--
-- Revenue/profitability truth is the pre-tax customer-visible sell amount:
--   Base Sell + Administrative Fee.
-- Tax and the legacy payment_commission_* adjustment are receivable-only and are not
-- profitability revenue. PB-6 employee commission basis remains a separate contract and
-- is intentionally untouched by this migration.
--
-- This migration also closes an approval-ordering gap from the initial Administrative Fee
-- package: explicit fee overrides must be present before Sales risk assessment and before
-- confirmed-revision approval identity is built.

-- -----------------------------------------------------------------------------
-- Order margin / exception assessment: allocate fee-inclusive pre-tax revenue to lines.
-- -----------------------------------------------------------------------------
create or replace function private.assess_customer_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
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
      'type','restricted_price_group','label','Price group is internal-only or unavailable for orders','price_group',v_group.name
    ));
  elsif coalesce(v_group.requires_approval,false) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','restricted_price_group','label','Selected price group requires approval','price_group',v_group.name
    ));
  end if;

  if coalesce(v_order.discount_amount,0) > 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','order_discount','label','Order-level discount entered','amount',v_order.discount_amount
    ));
  end if;

  select coalesce(pm.commission_percent,0)
  into v_payment_default
  from public.payment_methods pm
  where pm.id = v_order.payment_method_id;

  if abs(coalesce(v_order.payment_commission_percent,0) - coalesce(v_payment_default,0)) > 0.0005 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','payment_commission_override','label','Payment commission differs from the payment-method default',
      'default_percent',v_payment_default,'applied_percent',v_order.payment_commission_percent
    ));
  end if;

  select coalesce(gs.administrative_fee_default_percent,3.000)
  into v_admin_fee_default
  from public.general_settings gs
  where gs.id = 1;
  v_admin_fee_default := coalesce(v_admin_fee_default,3.000);

  if abs(coalesce(v_order.administrative_fee_percent,0) - v_admin_fee_default) > 0.0005 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','administrative_fee_override','label','Administrative Fee differs from the company default',
      'default_percent',v_admin_fee_default,'applied_percent',v_order.administrative_fee_percent
    ));
  end if;

  select r.tax_rate, r.is_active
  into v_rule_rate, v_rule_active
  from public.order_tax_rules r
  where r.fulfillment_type = v_order.fulfillment_type;

  if coalesce(v_rule_active,false) and v_rule_rate is not null then
    if abs(coalesce(v_order.tax_rate,0) - v_rule_rate) > 0.0005 then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','tax_override','label','Tax rate differs from the configured fulfillment tax rule',
        'fulfillment_type',v_order.fulfillment_type,'configured_rate',v_rule_rate,'applied_rate',v_order.tax_rate
      ));
    end if;
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'type','tax_rule_not_configured','label','No active tax rule is configured for this fulfillment type',
      'fulfillment_type',v_order.fulfillment_type
    ));
  end if;

  select coalesce(ps.default_min_margin_percent,20), coalesce(ps.warning_margin_buffer_percent,5)
  into v_global_min, v_warning_buffer
  from public.pricing_settings ps
  where ps.id = 1;

  -- customer_visible_sell_amount is Base Sell + Administrative Fee, before tax and before
  -- the historical payment-method adjustment. Allocate that revenue proportionally to lines.
  if coalesce(v_order.subtotal,0) > 0 then
    v_discount_factor := greatest(coalesce(v_order.customer_visible_sell_amount,0),0) / v_order.subtotal;
  end if;

  for v_line in
    select
      i.id, i.product_id, i.sku_snapshot, i.product_name_snapshot, i.quantity,
      i.unit_price, i.discount_percent, i.line_total, i.price_source,
      coalesce(pms.min_margin_percent, v_global_min) as min_margin_percent,
      pc.amount as cost_amount
    from public.customer_order_items i
    left join public.product_margin_settings pms on pms.product_id = i.product_id
    left join lateral (
      select c.amount
      from public.product_costs c
      where c.product_id = i.product_id
        and c.currency_code = v_order.currency_code
        and c.is_active = true
        and c.valid_to is null
      order by c.valid_from desc, c.created_at desc
      limit 1
    ) pc on true
    where i.order_id = p_order_id
    order by i.line_no
  loop
    if v_line.price_source = 'manual' then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','manual_price','label','Manual unit price used','sku',v_line.sku_snapshot,'unit_price',v_line.unit_price
      ));
    end if;

    if coalesce(v_line.discount_percent,0) > 0 then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','line_discount','label','Line discount entered','sku',v_line.sku_snapshot,'discount_percent',v_line.discount_percent
      ));
    end if;

    v_line_revenue := coalesce(v_line.line_total,0) * v_discount_factor;
    v_net_sales := v_net_sales + v_line_revenue;

    if v_line.cost_amount is null then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','cost_missing','label','Current product cost is missing; margin cannot be validated','sku',v_line.sku_snapshot
      ));
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'sku',v_line.sku_snapshot,'revenue',round(v_line_revenue,4),'cost',null,'margin_percent',null,'minimum_margin_percent',v_line.min_margin_percent
      ));
    else
      v_line_cost := coalesce(v_line.cost_amount,0) * coalesce(v_line.quantity,0);
      v_total_cost := v_total_cost + v_line_cost;
      v_line_margin := case when v_line_revenue > 0 then ((v_line_revenue - v_line_cost) / v_line_revenue) * 100 else -100 end;

      if v_line_margin < v_line.min_margin_percent then
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
          'type','margin_below_minimum','label','Margin is below the allowed minimum','sku',v_line.sku_snapshot,
          'margin_percent',round(v_line_margin,3),'minimum_margin_percent',v_line.min_margin_percent
        ));
      elsif v_line_margin < (v_line.min_margin_percent + v_warning_buffer) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'type','margin_warning','label','Margin is close to the minimum','sku',v_line.sku_snapshot,
          'margin_percent',round(v_line_margin,3),'minimum_margin_percent',v_line.min_margin_percent
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

  v_order_margin := case when v_net_sales > 0 then ((v_net_sales - v_total_cost) / v_net_sales) * 100 else null end;

  select coalesce(ccs.credit_hold,false), ccs.credit_limit
  into v_credit_hold, v_credit_limit
  from public.customer_commercial_settings ccs
  where ccs.customer_id = v_order.customer_id;

  if coalesce(v_credit_hold,false) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','customer_credit_hold','label','Customer is currently on credit hold'
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
        'type','credit_limit_exceeded','label','Order would exceed the customer credit limit',
        'credit_limit',v_credit_limit,'current_outstanding',v_outstanding,'order_total',coalesce(v_order.grand_total,v_order.total_amount,0)
      ));
    end if;
  end if;

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
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,'quantity',i.quantity,'unit_price',i.unit_price,
        'discount_percent',i.discount_percent,'line_total',i.line_total,'price_source',i.price_source
      ) order by i.line_no)
      from public.customer_order_items i where i.order_id = p_order_id
    ),'[]'::jsonb)
  )::text) into v_key;

  return jsonb_build_object(
    'requires_approval', jsonb_array_length(v_reasons) > 0,
    'approval_key', v_key,
    'reasons', v_reasons,
    'warnings', v_warnings,
    'order_margin_percent', case when v_order_margin is null then null else round(v_order_margin,3) end,
    'net_sales', round(v_net_sales,4),
    'total_cost', round(v_total_cost,4),
    'lines', v_lines
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Explicit-fee create boundary: apply the requested snapshot before Sales assessment.
-- -----------------------------------------------------------------------------
create or replace function private.create_customer_order(
  p_customer_id uuid,
  p_items jsonb,
  p_price_group_id uuid,
  p_billing_address_id uuid,
  p_shipping_address_id uuid,
  p_expected_delivery_date date,
  p_customer_reference text,
  p_customer_notes text,
  p_internal_notes text,
  p_tax_rate numeric,
  p_order_discount_amount numeric,
  p_payment_method_id uuid,
  p_payment_commission_percent numeric,
  p_initial_status text,
  p_fulfillment_type text,
  p_administrative_fee_percent numeric
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_role text;
  v_group record;
  v_effective_status text;
  v_fulfillment text;
  v_order_id uuid;
  v_risk jsonb;
  v_request_id uuid;
  v_fee numeric(7,3);
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if v_role not in ('super_admin','admin','sales') then
    raise exception 'You do not have permission to create customer orders.';
  end if;

  if p_administrative_fee_percent is not null
     and (p_administrative_fee_percent < 0 or p_administrative_fee_percent > 100) then
    raise exception 'Administrative Fee must be between 0 and 100.';
  end if;

  v_fee := round(coalesce(
    p_administrative_fee_percent,
    (select gs.administrative_fee_default_percent from public.general_settings gs where gs.id=1),
    3.000
  ),3);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be a JSON array.';
  end if;

  if jsonb_array_length(p_items) = 0 and p_initial_status <> 'draft' then
    raise exception 'Empty customer orders are only allowed as Draft countertop shells.';
  end if;

  select pg.id, pg.system_key, pg.name, pg.available_for_orders, pg.internal_only
  into v_group
  from public.price_groups pg
  where pg.id = p_price_group_id and pg.is_active = true;

  if v_group.id is null then
    raise exception 'Price group does not exist or is inactive.';
  end if;
  if coalesce(v_group.internal_only,false) or not coalesce(v_group.available_for_orders,true) then
    raise exception 'This price group cannot be used on customer orders.';
  end if;

  v_fulfillment := coalesce(
    nullif(p_fulfillment_type,''),
    case when v_group.system_key='pickup_level' then 'pickup' else 'delivery' end
  );
  if v_fulfillment not in ('pickup','delivery','delivery_installation') then
    raise exception 'Invalid fulfillment type.';
  end if;

  v_effective_status := case
    when v_role='sales' and p_initial_status='confirmed' then 'draft'
    else p_initial_status
  end;

  v_order_id := private.create_customer_order_core(
    p_customer_id,
    p_items,
    p_price_group_id,
    p_billing_address_id,
    p_shipping_address_id,
    p_expected_delivery_date,
    p_customer_reference,
    p_customer_notes,
    p_internal_notes,
    p_tax_rate,
    p_order_discount_amount,
    p_payment_method_id,
    p_payment_commission_percent,
    v_effective_status
  );

  -- One authoritative update ensures the explicit fee is part of totals before assessment.
  update public.customer_orders
  set fulfillment_type = v_fulfillment,
      administrative_fee_percent = v_fee
  where id = v_order_id;

  if v_role='sales' then
    v_risk := private.assess_customer_order(v_order_id);
    if coalesce((v_risk->>'requires_approval')::boolean,false) then
      v_request_id := private.create_approval_request(
        'order_exception',
        'order',
        v_order_id,
        (select order_number from public.customer_orders where id=v_order_id),
        'Order contains a financial or commercial exception that requires approval.',
        jsonb_build_object('status','draft'),
        jsonb_build_object('requested_initial_status',p_initial_status,'administrative_fee_percent',v_fee),
        v_risk,
        v_risk->>'approval_key'
      );
    elsif p_initial_status='confirmed' then
      perform private.apply_customer_order_status(
        v_order_id,
        'confirmed',
        'Order confirmed on creation'
      );
    end if;
  end if;

  return v_order_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Explicit-fee revision boundary: include fee in approval identity before request creation;
-- direct Draft revisions apply it before Sales assessment.
-- -----------------------------------------------------------------------------
create or replace function private.update_customer_order(
  p_order_id uuid,
  p_items jsonb,
  p_price_group_id uuid,
  p_billing_address_id uuid,
  p_shipping_address_id uuid,
  p_expected_delivery_date date,
  p_customer_reference text,
  p_customer_notes text,
  p_internal_notes text,
  p_tax_rate numeric,
  p_order_discount_amount numeric,
  p_payment_method_id uuid,
  p_payment_commission_percent numeric,
  p_revision_reason text,
  p_fulfillment_type text,
  p_administrative_fee_percent numeric
)
returns integer
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_role text;
  v_order public.customer_orders%rowtype;
  v_group record;
  v_fulfillment text;
  v_revision integer;
  v_revision_mode text;
  v_risk jsonb;
  v_request_id uuid;
  v_proposed jsonb;
  v_fee numeric(7,3);
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role is null or v_role not in ('super_admin','admin','sales') then
    raise exception 'You do not have permission to edit customer orders.';
  end if;

  if p_administrative_fee_percent is null
     or p_administrative_fee_percent < 0
     or p_administrative_fee_percent > 100 then
    raise exception 'Administrative Fee must be between 0 and 100.';
  end if;
  v_fee := round(p_administrative_fee_percent,3);

  select * into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  v_revision_mode := private.customer_order_revision_mode(v_order.status, v_role);

  if v_revision_mode = 'locked' then
    raise exception 'Order revisions are locked once fulfillment has started or the order is finalized.';
  end if;

  select
    pg.id,
    pg.system_key,
    pg.name,
    pg.available_for_orders,
    pg.internal_only
  into v_group
  from public.price_groups pg
  where pg.id = p_price_group_id
    and pg.is_active = true;

  if v_group.id is null then
    raise exception 'Price group does not exist or is inactive.';
  end if;

  if coalesce(v_group.internal_only, false)
     or not coalesce(v_group.available_for_orders, true) then
    raise exception 'This price group cannot be used on customer orders.';
  end if;

  v_fulfillment := coalesce(
    nullif(p_fulfillment_type, ''),
    case
      when v_group.system_key = 'pickup_level' then 'pickup'
      else coalesce(v_order.fulfillment_type, 'delivery')
    end
  );

  if v_fulfillment not in ('pickup','delivery','delivery_installation') then
    raise exception 'Invalid fulfillment type.';
  end if;

  if v_revision_mode = 'approval' then
    v_proposed := jsonb_build_object(
      'items', p_items,
      'price_group_id', p_price_group_id,
      'billing_address_id', p_billing_address_id,
      'shipping_address_id', p_shipping_address_id,
      'expected_delivery_date', p_expected_delivery_date,
      'customer_reference', p_customer_reference,
      'customer_notes', p_customer_notes,
      'internal_notes', p_internal_notes,
      'tax_rate', p_tax_rate,
      'order_discount_amount', p_order_discount_amount,
      'payment_method_id', p_payment_method_id,
      'payment_commission_percent', p_payment_commission_percent,
      'administrative_fee_percent', v_fee,
      'revision_reason', p_revision_reason,
      'fulfillment_type', v_fulfillment
    );

    v_risk := jsonb_build_object(
      'requires_approval', true,
      'reasons', jsonb_build_array(jsonb_build_object(
        'type', 'confirmed_order_revision',
        'label', 'Changes to a non-Draft order require approval'
      )),
      'warnings', '[]'::jsonb,
      'administrative_fee_percent', v_fee,
      'approval_key', md5((v_order.updated_at::text || v_proposed::text))
    );

    v_request_id := private.create_approval_request(
      'order_revision',
      'order',
      p_order_id,
      v_order.order_number,
      coalesce(
        nullif(btrim(p_revision_reason), ''),
        'Sales requested changes to a non-Draft order.'
      ),
      jsonb_build_object(
        'updated_at', v_order.updated_at,
        'status', v_order.status,
        'order', to_jsonb(v_order)
      ),
      v_proposed,
      v_risk,
      v_risk->>'approval_key'
    );

    return 0;
  end if;

  -- Call the inner revision mutation directly so fee and fulfillment can be applied before
  -- the outer Sales exception assessment runs.
  v_revision := private.update_customer_order(
    p_order_id,
    p_items,
    p_price_group_id,
    p_billing_address_id,
    p_shipping_address_id,
    p_expected_delivery_date,
    p_customer_reference,
    p_customer_notes,
    p_internal_notes,
    p_tax_rate,
    p_order_discount_amount,
    p_payment_method_id,
    p_payment_commission_percent,
    p_revision_reason
  );

  update public.customer_orders
  set fulfillment_type = v_fulfillment,
      administrative_fee_percent = v_fee
  where id = p_order_id;

  if v_role = 'sales' then
    v_risk := private.assess_customer_order(p_order_id);

    if coalesce((v_risk->>'requires_approval')::boolean, false) then
      v_request_id := private.create_approval_request(
        'order_exception',
        'order',
        p_order_id,
        v_order.order_number,
        'Order contains a financial or commercial exception that requires approval.',
        jsonb_build_object('updated_at', v_order.updated_at, 'status', 'draft'),
        jsonb_build_object('revision_number', v_revision, 'administrative_fee_percent', v_fee),
        v_risk,
        v_risk->>'approval_key'
      );
    else
      update public.approval_requests
      set
        status = 'cancelled',
        updated_at = now(),
        review_note = coalesce(
          review_note,
          'Exception removed by a newer Draft revision.'
        )
      where request_type = 'order_exception'
        and entity_type = 'order'
        and entity_id = p_order_id
        and status = 'pending';
    end if;
  end if;

  return v_revision;
end;
$$;

-- -----------------------------------------------------------------------------
-- Project Finance: total/category revenue is fee-inclusive pre-tax sell truth.
-- -----------------------------------------------------------------------------
create or replace function private.get_customer_project_financial_summary(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not public.current_user_has_any_role(array['super_admin', 'admin', 'finance']::text[]) then
    raise exception 'You do not have permission to view Project cost and margin data.' using errcode = '42501';
  end if;

  if p_project_id is null
     or not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    raise exception 'Project not found.';
  end if;

  with
  settings as (
    select upper(gs.default_currency::text) as default_currency
    from public.general_settings gs
    order by gs.id
    limit 1
  ),
  active_orders as (
    select
      o.id,
      o.currency_code::text as currency_code,
      greatest(coalesce(o.customer_visible_sell_amount, 0::numeric), 0::numeric) as net_sales,
      coalesce(o.subtotal, 0::numeric) as subtotal
    from public.customer_orders o
    where o.project_id = p_project_id
      and o.status <> 'cancelled'
  ),
  current_cost as (
    select distinct on (pc.product_id)
      pc.product_id,
      pc.amount,
      pc.currency_code::text as currency_code
    from public.product_costs pc
    where pc.is_active = true
      and pc.valid_from <= now()
      and (pc.valid_to is null or pc.valid_to > now())
    order by pc.product_id, pc.valid_from desc, pc.created_at desc
  ),
  item_lines as (
    select
      o.id as order_id,
      case
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STANDARD' then 'Cabinet'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STONE' then 'Countertop'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SINK' then 'Sink'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SERVICE' then 'Labor'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'MATERIAL' then 'Material'
        when lower(coalesce(pc.name, '')) = 'cabinet' then 'Cabinet'
        when lower(coalesce(pc.name, '')) in ('stone', 'countertop') then 'Countertop'
        when lower(coalesce(pc.name, '')) = 'sink' then 'Sink'
        when lower(coalesce(pc.name, '')) in ('service', 'labor') then 'Labor'
        when lower(coalesce(pc.name, '')) = 'material' then 'Material'
        else 'Other'
      end as financial_category,
      case
        when o.subtotal > 0::numeric
          then coalesce(oi.line_total, 0::numeric) * (o.net_sales / o.subtotal)
        else 0::numeric
      end as line_net_sales,
      case
        when cc.product_id is not null and upper(cc.currency_code) = upper(o.currency_code)
          then coalesce(oi.quantity, 0::numeric) * cc.amount
        else 0::numeric
      end as known_line_cost,
      (cc.product_id is null or upper(cc.currency_code) <> upper(o.currency_code)) as missing_cost,
      o.currency_code as order_currency,
      cc.currency_code as cost_currency
    from active_orders o
    join public.customer_order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_types pt on pt.id = p.product_type_id
    left join public.product_categories pc on pc.id = p.category_id
    left join current_cost cc on cc.product_id = oi.product_id
  ),
  invoice_rows as (
    select
      i.currency_code::text as currency_code,
      coalesce(i.total_amount, 0::numeric) as total_amount,
      coalesce(i.paid_amount, 0::numeric) as paid_amount
    from public.customer_invoices i
    join active_orders o on o.id = i.order_id
    where i.status in ('issued', 'partially_paid', 'paid', 'overdue')
  ),
  currency_sources as (
    select upper(o.currency_code) as currency_code from active_orders o
    union all
    select upper(il.cost_currency) from item_lines il where il.cost_currency is not null
    union all
    select upper(ir.currency_code) from invoice_rows ir
  ),
  currency_state as (
    select
      coalesce((select min(cs.currency_code) from currency_sources cs), (select s.default_currency from settings s), 'USD') as currency_code,
      (select count(distinct cs.currency_code) from currency_sources cs) > 1 as mixed_currency
  ),
  totals as (
    select
      coalesce((select sum(o.net_sales) from active_orders o), 0::numeric) as total_sales,
      coalesce((select sum(il.known_line_cost) from item_lines il), 0::numeric) as known_cost,
      coalesce((select count(*) from item_lines il where il.missing_cost), 0)::bigint as missing_cost_lines,
      coalesce((select sum(ir.total_amount) from invoice_rows ir), 0::numeric) as invoiced,
      coalesce((select sum(ir.paid_amount) from invoice_rows ir), 0::numeric) as paid
  ),
  category_names(financial_category, sort_order) as (
    values
      ('Cabinet'::text, 1),
      ('Countertop'::text, 2),
      ('Sink'::text, 3),
      ('Labor'::text, 4),
      ('Material'::text, 5),
      ('Other'::text, 6)
  ),
  category_rollup as (
    select
      cn.financial_category,
      cn.sort_order,
      coalesce(sum(il.line_net_sales), 0::numeric) as total_sales,
      coalesce(sum(il.known_line_cost), 0::numeric) as known_cost,
      coalesce(count(*) filter (where il.missing_cost), 0)::bigint as missing_cost_lines
    from category_names cn
    left join item_lines il on il.financial_category = cn.financial_category
    group by cn.financial_category, cn.sort_order
  ),
  category_json as (
    select jsonb_agg(
      jsonb_build_object(
        'category', cr.financial_category,
        'total_sales', case when cs.mixed_currency then null else round(cr.total_sales, 2) end,
        'total_cost', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.known_cost, 2) end,
        'gross_profit', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.total_sales - cr.known_cost, 2) end,
        'gross_margin_percent', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 or cr.total_sales <= 0 then null
          else round(((cr.total_sales - cr.known_cost) / cr.total_sales) * 100::numeric, 2)
        end,
        'markup_percent', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 or cr.known_cost <= 0 then null
          else round(((cr.total_sales - cr.known_cost) / cr.known_cost) * 100::numeric, 2)
        end,
        'missing_cost_lines', cr.missing_cost_lines
      )
      order by cr.sort_order
    ) as categories
    from category_rollup cr
    cross join currency_state cs
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'currency_code', cs.currency_code,
    'mixed_currency', cs.mixed_currency,
    'cost_complete', (not cs.mixed_currency and t.missing_cost_lines = 0),
    'missing_cost_lines', t.missing_cost_lines,
    'total_sales', case when cs.mixed_currency then null else round(t.total_sales, 2) end,
    'total_cost', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.known_cost, 2) end,
    'gross_profit', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.total_sales - t.known_cost, 2) end,
    'gross_margin_percent', case
      when cs.mixed_currency or t.missing_cost_lines > 0 or t.total_sales <= 0 then null
      else round(((t.total_sales - t.known_cost) / t.total_sales) * 100::numeric, 2)
    end,
    'markup_percent', case
      when cs.mixed_currency or t.missing_cost_lines > 0 or t.known_cost <= 0 then null
      else round(((t.total_sales - t.known_cost) / t.known_cost) * 100::numeric, 2)
    end,
    'invoiced', case when cs.mixed_currency then null else round(t.invoiced, 2) end,
    'paid', case when cs.mixed_currency then null else round(t.paid, 2) end,
    'balance', case when cs.mixed_currency then null else round(t.invoiced - t.paid, 2) end,
    'categories', coalesce(cj.categories, '[]'::jsonb)
  )
  into v_result
  from totals t
  cross join currency_state cs
  cross join category_json cj;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Change Order summary: canonical sales is fee-inclusive pre-tax sell truth.
-- -----------------------------------------------------------------------------
create or replace function public.get_customer_project_change_order_summary(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_can_view_cost boolean;
  v_canonical_currency_count integer;
  v_canonical_currency text;
  v_canonical_sales numeric(18,2);
  v_pending_sell_currency_count integer;
  v_pending_sell_currency text;
  v_pending_sell numeric(18,2);
  v_pending_cost_currency_count integer;
  v_pending_cost_currency text;
  v_pending_cost numeric(18,2);
  v_pending_cost_complete boolean;
  v_counts jsonb;
  v_privileged_financial jsonb;
begin
  if not private.can_view_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_VIEW_FORBIDDEN' using errcode='42501';
  end if;
  if not exists (select 1 from public.customer_projects where id=p_project_id) then raise exception 'PROJECT_NOT_FOUND'; end if;
  v_can_view_cost := private.can_view_customer_project_change_order_cost();

  select count(distinct upper(o.currency_code::text)), min(upper(o.currency_code::text)), round(coalesce(sum(greatest(coalesce(o.customer_visible_sell_amount,0),0)),0),2)
  into v_canonical_currency_count, v_canonical_currency, v_canonical_sales
  from public.customer_orders o
  where o.project_id=p_project_id and o.status <> 'cancelled';

  with approved_pending as (
    select co.id
    from public.customer_project_change_orders co
    cross join lateral (select private.customer_project_change_order_application_state(co.id) as state) s
    where co.project_id=p_project_id and co.status='approved' and s.state->>'application_status' <> 'applied'
  )
  select count(distinct l.sell_currency_code), min(l.sell_currency_code)::text, round(coalesce(sum(l.sell_amount_delta),0),2)
  into v_pending_sell_currency_count, v_pending_sell_currency, v_pending_sell
  from public.customer_project_change_order_lines l
  join approved_pending p on p.id=l.change_order_id;

  with approved_pending as (
    select co.id
    from public.customer_project_change_orders co
    cross join lateral (select private.customer_project_change_order_application_state(co.id) as state) s
    where co.project_id=p_project_id and co.status='approved' and s.state->>'application_status' <> 'applied'
  )
  select
    count(distinct l.cost_currency_code),
    min(l.cost_currency_code)::text,
    round(coalesce(sum(l.expected_cost_delta),0),2),
    count(*) = count(l.expected_cost_delta)
  into v_pending_cost_currency_count, v_pending_cost_currency, v_pending_cost, v_pending_cost_complete
  from public.customer_project_change_order_lines l
  join approved_pending p on p.id=l.change_order_id;

  select jsonb_build_object(
    'draft',count(*) filter (where co.status='draft'),
    'submitted',count(*) filter (where co.status='submitted'),
    'approved',count(*) filter (where co.status='approved'),
    'rejected',count(*) filter (where co.status='rejected'),
    'cancelled',count(*) filter (where co.status='cancelled'),
    'applied',count(*) filter (where co.status='approved' and state.data->>'application_status'='applied'),
    'approved_pending',count(*) filter (where co.status='approved' and state.data->>'application_status'<>'applied')
  ) into v_counts
  from public.customer_project_change_orders co
  cross join lateral (select private.customer_project_change_order_application_state(co.id) as data) state
  where co.project_id=p_project_id;

  if v_can_view_cost then
    v_privileged_financial := public.get_customer_project_financial_summary(p_project_id);
  else
    v_privileged_financial := null;
  end if;

  return jsonb_build_object(
    'project_id',p_project_id,
    'counts',coalesce(v_counts,'{}'::jsonb),
    'canonical_mixed_currency',v_canonical_currency_count > 1,
    'canonical_currency_code',case when v_canonical_currency_count <= 1 then v_canonical_currency else null end,
    'canonical_sales',case when v_canonical_currency_count <= 1 then v_canonical_sales else null end,
    'canonical_financial_summary',case when v_can_view_cost then v_privileged_financial else null end,
    'pending_sell_mixed_currency',v_pending_sell_currency_count > 1,
    'approved_pending_sell_impact',case when v_pending_sell_currency_count <= 1 then v_pending_sell else null end,
    'pending_sell_currency_code',case when v_pending_sell_currency_count = 1 then v_pending_sell_currency else null end,
    'pending_expected_cost_complete',case when v_can_view_cost then coalesce(v_pending_cost_complete,true) else null end,
    'pending_cost_mixed_currency',case when v_can_view_cost then v_pending_cost_currency_count > 1 else null end,
    'pending_expected_cost_impact',case when v_can_view_cost and coalesce(v_pending_cost_complete,true) and v_pending_cost_currency_count <= 1 then v_pending_cost else null end,
    'pending_cost_currency_code',case when v_can_view_cost and v_pending_cost_currency_count = 1 then v_pending_cost_currency else null end,
    'mixed_currency', (v_canonical_currency_count > 1 or v_pending_sell_currency_count > 1 or (v_can_view_cost and v_pending_cost_currency_count > 1))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Change Order application linkage: revision deltas use the exact sell snapshot when present,
-- with a safe historical fallback for revisions created before Administrative Fee existed.
-- -----------------------------------------------------------------------------
create or replace function public.link_customer_project_change_order_revision(p_change_order_id uuid, p_order_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_revision public.customer_order_revisions%rowtype;
  v_next_revision public.customer_order_revisions%rowtype;
  v_order public.customer_orders%rowtype;
  v_existing public.customer_project_change_order_applications%rowtype;
  v_before_sell numeric;
  v_after_sell numeric;
  v_before_currency text;
  v_after_currency text;
  v_delta numeric(18,2);
  v_id uuid;
begin
  if not private.can_review_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_change from public.customer_project_change_orders where id=p_change_order_id for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status <> 'approved' then raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_REQUIRES_APPROVAL'; end if;

  select * into v_revision
  from public.customer_order_revisions
  where id = p_order_revision_id
  for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_REVISION_NOT_FOUND'; end if;

  select * into v_order from public.customer_orders where id=v_revision.order_id;
  if not found or v_order.project_id is distinct from v_change.project_id then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_PROJECT_MISMATCH';
  end if;
  if v_change.reviewed_at is null or v_revision.created_at < v_change.reviewed_at then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_PREDATES_APPROVAL';
  end if;
  if exists (select 1 from public.customer_project_change_order_lines where change_order_id=p_change_order_id and target_order_id is not null)
     and not exists (select 1 from public.customer_project_change_order_lines where change_order_id=p_change_order_id and target_order_id=v_revision.order_id) then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_TARGET_MISMATCH';
  end if;

  select * into v_existing
  from public.customer_project_change_order_applications
  where order_revision_id=p_order_revision_id;
  if found then
    if v_existing.change_order_id = p_change_order_id then return v_existing.id; end if;
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_ALREADY_LINKED';
  end if;

  if v_revision.order_snapshot ? 'customer_visible_sell_amount' then
    v_before_sell := greatest(coalesce(nullif(v_revision.order_snapshot->>'customer_visible_sell_amount','')::numeric,0),0);
  else
    v_before_sell := greatest(
      coalesce(nullif(v_revision.order_snapshot->>'subtotal','')::numeric,0)
      - coalesce(nullif(v_revision.order_snapshot->>'discount_amount','')::numeric,0),
      0
    );
  end if;
  v_before_currency := upper(coalesce(v_revision.order_snapshot->>'currency_code',''));

  select * into v_next_revision
  from public.customer_order_revisions r
  where r.order_id=v_revision.order_id and r.revision_number > v_revision.revision_number
  order by r.revision_number
  limit 1;

  if found then
    if v_next_revision.order_snapshot ? 'customer_visible_sell_amount' then
      v_after_sell := greatest(coalesce(nullif(v_next_revision.order_snapshot->>'customer_visible_sell_amount','')::numeric,0),0);
    else
      v_after_sell := greatest(
        coalesce(nullif(v_next_revision.order_snapshot->>'subtotal','')::numeric,0)
        - coalesce(nullif(v_next_revision.order_snapshot->>'discount_amount','')::numeric,0),
        0
      );
    end if;
    v_after_currency := upper(coalesce(v_next_revision.order_snapshot->>'currency_code',''));
  else
    v_after_sell := greatest(coalesce(v_order.customer_visible_sell_amount,0),0);
    v_after_currency := upper(v_order.currency_code::text);
  end if;

  if v_before_currency !~ '^[A-Z]{3}$' or v_after_currency !~ '^[A-Z]{3}$' or v_before_currency <> v_after_currency then
    raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_MIXED_CURRENCY';
  end if;

  v_delta := round(v_after_sell - v_before_sell,2);

  insert into public.customer_project_change_order_applications(
    change_order_id, order_id, order_revision_id, canonical_sell_delta, currency_code, linked_by
  ) values (
    p_change_order_id, v_revision.order_id, p_order_revision_id, v_delta, v_after_currency, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_change_order_event(
    p_change_order_id,
    'application_linked',
    'approved',
    null,
    jsonb_build_object('application_id',v_id,'order_id',v_revision.order_id,'order_revision_id',p_order_revision_id,'canonical_sell_delta',v_delta,'currency_code',v_after_currency)
  );
  return v_id;
end;
$$;
