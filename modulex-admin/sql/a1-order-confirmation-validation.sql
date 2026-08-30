begin;

-- A1 confirmation-readiness patch.
-- Draft orders may be incomplete working records. Fulfillment readiness becomes
-- mandatory when an order leaves Draft, especially for delivery shipping/tax data.

create or replace function private.validate_customer_order_confirmation(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders%rowtype;
  v_rule_rate numeric;
begin
  select * into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.fulfillment_type not in ('pickup','delivery','delivery_installation') then
    raise exception 'Invalid fulfillment type.';
  end if;

  if v_order.tax_rate is null or v_order.tax_rate < 0 or v_order.tax_rate > 100 then
    raise exception 'Tax rate must be between 0 and 100.';
  end if;

  if not exists (
    select 1
    from public.price_groups pg
    where pg.id = v_order.price_group_id
      and pg.is_active = true
      and coalesce(pg.available_for_orders, true) = true
      and coalesce(pg.internal_only, false) = false
  ) then
    raise exception 'This price group cannot be used on customer orders.';
  end if;

  if not exists (
    select 1
    from public.payment_methods pm
    where pm.id = v_order.payment_method_id
      and pm.is_active = true
  ) then
    raise exception 'Payment method does not exist or is inactive.';
  end if;

  if v_order.fulfillment_type in ('delivery','delivery_installation') then
    if v_order.shipping_address_id is null then
      raise exception 'A shipping address is required before confirming a delivery order.';
    end if;

    if not exists (
      select 1
      from public.customer_addresses ca
      where ca.id = v_order.shipping_address_id
        and ca.customer_id = v_order.customer_id
        and ca.is_active = true
    ) then
      raise exception 'Shipping address must be an active address owned by this customer.';
    end if;
  end if;

  select r.tax_rate
  into v_rule_rate
  from public.order_tax_rules r
  where r.fulfillment_type = v_order.fulfillment_type
    and r.is_active = true
    and r.tax_rate is not null
  limit 1;

  if v_rule_rate is not null
     and abs(coalesce(v_order.tax_rate, 0) - v_rule_rate) > 0.0005 then
    raise exception 'Tax rate must match the active fulfillment tax rule (%).', v_rule_rate;
  end if;

  if not exists (
    select 1
    from public.customer_order_items i
    where i.order_id = p_order_id
  ) then
    raise exception 'At least one order item is required before confirmation.';
  end if;

  if exists (
    select 1
    from public.customer_order_items i
    left join public.products p on p.id = i.product_id
    where i.order_id = p_order_id
      and (
        i.product_id is null
        or p.id is null
        or p.status = 'archived'
        or i.quantity is null
        or i.quantity <= 0
        or i.unit_price is null
        or i.unit_price < 0
        or i.discount_percent is null
        or i.discount_percent < 0
        or i.discount_percent > 100
        or i.price_source not in ('price_group','manual')
      )
  ) then
    raise exception 'Order items contain an invalid product, quantity, price, discount, or pricing source.';
  end if;
end;
$$;

revoke all on function private.validate_customer_order_confirmation(uuid) from public;
revoke all on function private.validate_customer_order_confirmation(uuid) from anon;
revoke all on function private.validate_customer_order_confirmation(uuid) from authenticated;

-- Draft records remain saveable without a shipping address. Once status is
-- non-Draft, the same deferred contract also protects direct table/RPC writes.
create or replace function private.guard_customer_order_contract_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders%rowtype;
begin
  select * into v_order
  from public.customer_orders
  where id = new.id;

  if v_order.id is null then
    return null;
  end if;

  if v_order.fulfillment_type not in ('pickup','delivery','delivery_installation') then
    raise exception 'Invalid fulfillment type.';
  end if;

  if v_order.tax_rate is null or v_order.tax_rate < 0 or v_order.tax_rate > 100 then
    raise exception 'Tax rate must be between 0 and 100.';
  end if;

  if not exists (
    select 1
    from public.price_groups pg
    where pg.id = v_order.price_group_id
      and pg.is_active = true
      and coalesce(pg.available_for_orders, true) = true
      and coalesce(pg.internal_only, false) = false
  ) then
    raise exception 'This price group cannot be used on customer orders.';
  end if;

  if not exists (
    select 1
    from public.payment_methods pm
    where pm.id = v_order.payment_method_id
      and pm.is_active = true
  ) then
    raise exception 'Payment method does not exist or is inactive.';
  end if;

  if v_order.status <> 'draft' then
    perform private.validate_customer_order_confirmation(v_order.id);
  end if;

  return null;
end;
$$;

revoke all on function private.guard_customer_order_contract_trigger() from public;
revoke all on function private.guard_customer_order_contract_trigger() from anon;
revoke all on function private.guard_customer_order_contract_trigger() from authenticated;

drop trigger if exists a1_customer_order_contract_guard on public.customer_orders;
create constraint trigger a1_customer_order_contract_guard
after insert or update of price_group_id, payment_method_id, shipping_address_id, tax_rate, fulfillment_type, status
on public.customer_orders
deferrable initially deferred
for each row
execute function private.guard_customer_order_contract_trigger();

create or replace function private.set_customer_order_status(
  p_order_id uuid,
  p_status text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role text;
  v_order public.customer_orders%rowtype;
  v_risk jsonb;
  v_key text;
  v_request_id uuid;
  v_needs_status_approval boolean := false;
  v_is_regression boolean := false;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('super_admin','admin','sales') then
    raise exception 'You do not have permission to update customer orders.';
  end if;

  if p_status not in (
    'draft','confirmed','in_preparation','ready_for_shipment','shipped','delivered',
    'installation_scheduled','installation_in_progress','completed','cancelled'
  ) then
    raise exception 'Invalid order status.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if v_order.status = p_status then
    return v_order.status;
  end if;

  v_is_regression := p_status <> 'cancelled'
    and private.order_status_rank(p_status) < private.order_status_rank(v_order.status);

  if p_status = 'cancelled'
     and not private.customer_order_status_transition_allowed(v_order.status, p_status) then
    raise exception 'Invalid customer order status transition: % -> %.', v_order.status, p_status;
  end if;

  if v_is_regression then
    if v_role in ('super_admin','admin') then
      raise exception 'Invalid customer order status transition: % -> %. Submit a controlled correction workflow instead.', v_order.status, p_status;
    end if;
    v_needs_status_approval := true;
  elsif not private.customer_order_status_transition_allowed(v_order.status, p_status) then
    raise exception 'Invalid customer order status transition: % -> %.', v_order.status, p_status;
  end if;

  if not v_is_regression
     and p_status in ('shipped','delivered','installation_scheduled','installation_in_progress') then
    raise exception 'Use the shipment or installation workflow for status %.', p_status;
  end if;

  if not v_is_regression and p_status = 'completed' then
    if v_order.fulfillment_type = 'delivery_installation' then
      raise exception 'Use the installation workflow to complete Delivery + Installation orders.';
    end if;
    if v_order.status = 'ready_for_shipment'
       and v_order.fulfillment_type <> 'pickup' then
      raise exception 'Only Pickup orders can complete directly from Ready for Shipment.';
    end if;
  end if;

  if p_status = 'confirmed' then
    perform private.validate_customer_order_confirmation(p_order_id);
  end if;

  if v_role in ('super_admin','admin') then
    return private.apply_customer_order_status(p_order_id, p_status, p_note);
  end if;

  if p_status = 'cancelled' and v_order.status <> 'draft' then
    v_needs_status_approval := true;
  end if;

  if v_needs_status_approval then
    v_key := md5(v_order.updated_at::text || ':' || v_order.status || ':' || p_status || ':' || coalesce(p_note,''));
    v_request_id := private.create_approval_request(
      'order_status_change',
      'order',
      p_order_id,
      v_order.order_number,
      case
        when p_status = 'cancelled' then 'Cancellation of a non-Draft order requires approval.'
        else 'This status regression requires approval.'
      end,
      jsonb_build_object('updated_at', v_order.updated_at, 'status', v_order.status),
      jsonb_build_object('status', p_status, 'note', p_note),
      jsonb_build_object(
        'requires_approval', true,
        'approval_key', v_key,
        'reasons', jsonb_build_array(jsonb_build_object(
          'type', case when p_status='cancelled' then 'order_cancellation' else 'status_regression' end,
          'label', case when p_status='cancelled' then 'Cancellation after Draft requires approval' else 'Backward status change requires approval' end
        ))
      ),
      v_key
    );
    return 'approval_requested';
  end if;

  if p_status = 'confirmed' then
    v_risk := private.assess_customer_order(p_order_id);
    if coalesce((v_risk->>'requires_approval')::boolean, false) then
      v_key := v_risk->>'approval_key';
      if not exists (
        select 1
        from public.approval_requests ar
        where ar.request_type = 'order_exception'
          and ar.entity_type = 'order'
          and ar.entity_id = p_order_id
          and ar.status = 'approved'
          and ar.approval_key = v_key
      ) then
        v_request_id := private.create_approval_request(
          'order_exception',
          'order',
          p_order_id,
          v_order.order_number,
          'Order must be approved before it can be confirmed.',
          jsonb_build_object('updated_at', v_order.updated_at, 'status', v_order.status),
          jsonb_build_object('requested_status', 'confirmed'),
          v_risk,
          v_key
        );
        return 'approval_requested';
      end if;
    end if;
  end if;

  return private.apply_customer_order_status(p_order_id, p_status, p_note);
end;
$$;

notify pgrst, 'reload schema';

commit;
