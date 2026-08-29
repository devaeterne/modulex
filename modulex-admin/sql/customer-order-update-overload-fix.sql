begin;

-- Production compatibility fix for the fulfillment-aware private order-update wrapper.
--
-- The legacy 14-argument private.update_customer_order(...) function is the core
-- order revision implementation. A newer 15-argument wrapper added
-- p_fulfillment_type, but inherited defaults for arguments 4-15. That made a
-- 14-argument call match both overloads and PostgreSQL could not resolve the
-- delegation target.
--
-- Keep defaults at the public RPC boundary. The private 15-argument wrapper is
-- internal and must require all 15 arguments so its own 14-argument delegation
-- resolves uniquely to the legacy core function.

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
  v_risk jsonb;
  v_request_id uuid;
  v_proposed jsonb;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('super_admin','admin','sales') then
    raise exception 'You do not have permission to edit customer orders.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be edited.';
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

  if v_role = 'sales' and v_order.status <> 'draft' then
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

  -- This 14-argument call must resolve only to the legacy private core function.
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

-- Structural regression guard: exactly one private overload may accept a
-- 14-argument invocation. The 15-argument wrapper itself must have no defaults.
do $$
declare
  v_fourteen_arg_candidates integer;
  v_wrapper_defaults integer;
begin
  select count(*)
  into v_fourteen_arg_candidates
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'update_customer_order'
    and p.prokind = 'f'
    and 14 between (p.pronargs - p.pronargdefaults) and p.pronargs;

  if v_fourteen_arg_candidates <> 1 then
    raise exception
      'Expected exactly one private.update_customer_order overload callable with 14 arguments, found %.',
      v_fourteen_arg_candidates;
  end if;

  select p.pronargdefaults
  into v_wrapper_defaults
  from pg_proc p
  where p.oid = to_regprocedure(
    'private.update_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text)'
  );

  if v_wrapper_defaults is distinct from 0 then
    raise exception
      'The 15-argument private.update_customer_order wrapper must not define defaults; found %.',
      v_wrapper_defaults;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
