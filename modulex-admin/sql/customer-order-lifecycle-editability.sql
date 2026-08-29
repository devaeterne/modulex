begin;

-- A1.2C: one lifecycle contract for customer-order commercial revisions.
-- Draft is directly editable. Confirmed through Ready for Shipment remains
-- editable, with Sales routed through the existing approval workflow. Once
-- fulfillment starts (Shipped) or the order is finalized/cancelled, commercial
-- revisions fail closed. Status changes remain owned by set_customer_order_status.

create or replace function private.customer_order_revision_mode(
  p_status text,
  p_role text
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_role is null or p_role not in ('super_admin','admin','sales') then 'locked'
    when p_status in (
      'shipped',
      'delivered',
      'installation_scheduled',
      'installation_in_progress',
      'completed',
      'cancelled'
    ) then 'locked'
    when p_status = 'draft' then 'direct'
    when p_status in ('confirmed','in_preparation','ready_for_shipment')
      and p_role = 'sales' then 'approval'
    when p_status in ('confirmed','in_preparation','ready_for_shipment') then 'direct'
    else 'locked'
  end;
$$;

revoke all on function private.customer_order_revision_mode(text,text) from public;
revoke all on function private.customer_order_revision_mode(text,text) from anon;
revoke all on function private.customer_order_revision_mode(text,text) from authenticated;

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
  p_fulfillment_type text
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
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
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role is null or v_role not in ('super_admin','admin','sales') then
    raise exception 'You do not have permission to edit customer orders.';
  end if;

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
  set fulfillment_type = v_fulfillment
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
        jsonb_build_object('revision_number', v_revision),
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

-- Fail fast if the SQL policy ever drifts from the Admin policy boundary.
do $$
begin
  if private.customer_order_revision_mode('draft','sales') <> 'direct' then
    raise exception 'Draft Sales revision mode must be direct.';
  end if;
  if private.customer_order_revision_mode('confirmed','sales') <> 'approval' then
    raise exception 'Confirmed Sales revision mode must require approval.';
  end if;
  if private.customer_order_revision_mode('ready_for_shipment','admin') <> 'direct' then
    raise exception 'Ready-for-shipment Admin revision mode must remain direct.';
  end if;
  if private.customer_order_revision_mode('shipped','admin') <> 'locked' then
    raise exception 'Shipped orders must be revision-locked.';
  end if;
  if private.customer_order_revision_mode('completed','super_admin') <> 'locked' then
    raise exception 'Completed orders must be revision-locked.';
  end if;
  if private.customer_order_revision_mode('cancelled','admin') <> 'locked' then
    raise exception 'Cancelled orders must be revision-locked.';
  end if;
  if private.customer_order_revision_mode('draft', null) <> 'locked' then
    raise exception 'Profiles-less/null-role callers must be revision-locked.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
