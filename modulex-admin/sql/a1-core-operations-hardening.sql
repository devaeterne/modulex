begin;

-- Phase A1 closeout: customer order, shipment and installation operations.
-- Keep existing public RPC signatures stable while making validation and lifecycle
-- behavior database-authoritative. Portal projections remain read-only and unchanged.

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create or replace function private.customer_order_status_transition_allowed(
  p_from_status text,
  p_to_status text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_from_status is null or p_to_status is null then false
    when p_from_status = p_to_status then true
    when p_to_status = 'cancelled'
      and p_from_status in ('draft','confirmed','in_preparation','ready_for_shipment') then true
    when p_from_status = 'draft' and p_to_status = 'confirmed' then true
    when p_from_status = 'confirmed' and p_to_status in ('in_preparation','ready_for_shipment','shipped','installation_scheduled') then true
    when p_from_status = 'in_preparation' and p_to_status in ('ready_for_shipment','shipped','installation_scheduled') then true
    when p_from_status = 'ready_for_shipment' and p_to_status in ('shipped','completed','installation_scheduled') then true
    when p_from_status = 'shipped' and p_to_status in ('delivered','installation_scheduled') then true
    when p_from_status = 'delivered' and p_to_status in ('installation_scheduled','completed') then true
    when p_from_status = 'installation_scheduled' and p_to_status = 'installation_in_progress' then true
    when p_from_status = 'installation_in_progress' and p_to_status = 'completed' then true
    else false
  end;
$$;

revoke all on function private.customer_order_status_transition_allowed(text,text) from public;
revoke all on function private.customer_order_status_transition_allowed(text,text) from anon;
revoke all on function private.customer_order_status_transition_allowed(text,text) from authenticated;

-- Validate the final commercial/fulfillment state at transaction end. The trigger
-- deliberately fires only for fields owned by order create/edit, so legacy orders
-- are not blocked by unrelated fulfillment status updates.
create or replace function private.guard_customer_order_contract_trigger()
returns trigger
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

  if v_order.fulfillment_type in ('delivery','delivery_installation') then
    if v_order.shipping_address_id is null then
      raise exception 'A shipping address is required for delivery fulfillment.';
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

  return null;
end;
$$;

revoke all on function private.guard_customer_order_contract_trigger() from public;
revoke all on function private.guard_customer_order_contract_trigger() from anon;
revoke all on function private.guard_customer_order_contract_trigger() from authenticated;

drop trigger if exists a1_customer_order_contract_guard on public.customer_orders;
create constraint trigger a1_customer_order_contract_guard
after insert or update of price_group_id, payment_method_id, shipping_address_id, tax_rate, fulfillment_type
on public.customer_orders
deferrable initially deferred
for each row
execute function private.guard_customer_order_contract_trigger();

-- quantity/product/variant validity and price_source are enforced at the row
-- boundary. price_source is always re-derived by the database; caller supplied
-- values cannot turn a manual price into a price-group price.
create or replace function private.guard_customer_order_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_status text;
  v_price_group_id uuid;
  v_currency_code text;
  v_group_price numeric;
begin
  if new.product_id is null then
    raise exception 'Product is required for every order line.';
  end if;
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Order item quantity must be greater than zero.';
  end if;
  if new.unit_price is null or new.unit_price < 0 then
    raise exception 'Unit price cannot be negative.';
  end if;
  if new.discount_percent is null or new.discount_percent < 0 or new.discount_percent > 100 then
    raise exception 'Line discount must be between 0 and 100.';
  end if;

  select p.status
  into v_product_status
  from public.products p
  where p.id = new.product_id
    and p.status <> 'archived';

  if v_product_status is null then
    raise exception 'Product does not exist or is archived.';
  end if;

  select o.price_group_id, o.currency_code
  into v_price_group_id, v_currency_code
  from public.customer_orders o
  where o.id = new.order_id;

  if v_price_group_id is null then
    raise exception 'Order price group could not be resolved.';
  end if;

  select pp.amount
  into v_group_price
  from public.product_prices pp
  where pp.product_id = new.product_id
    and pp.price_group_id = v_price_group_id
    and pp.currency_code = v_currency_code
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc, pp.created_at desc
  limit 1;

  new.price_source := case
    when v_group_price is not null
      and round(new.unit_price, 4) = round(v_group_price, 4)
      then 'price_group'
    else 'manual'
  end;

  return new;
end;
$$;

revoke all on function private.guard_customer_order_item_trigger() from public;
revoke all on function private.guard_customer_order_item_trigger() from anon;
revoke all on function private.guard_customer_order_item_trigger() from authenticated;

drop trigger if exists a1_customer_order_item_guard on public.customer_order_items;
create trigger a1_customer_order_item_guard
before insert or update of product_id, quantity, unit_price, discount_percent, price_source
on public.customer_order_items
for each row
execute function private.guard_customer_order_item_trigger();

-- Preserve Sales approval handling for explicit regressions, but reject invalid
-- forward jumps and direct Admin regressions. Shipment/installation-owned states
-- must be reached through their operational workflows rather than this RPC.
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

-- ---------------------------------------------------------------------------
-- Shipments
-- ---------------------------------------------------------------------------

create or replace function private.customer_shipment_status_transition_allowed(
  p_from_status text,
  p_to_status text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_from_status is null or p_to_status is null then false
    when p_from_status = p_to_status then true
    when p_from_status = 'draft' and p_to_status in ('picking','cancelled') then true
    when p_from_status = 'picking' and p_to_status in ('packed','cancelled') then true
    when p_from_status = 'packed' and p_to_status in ('shipped','cancelled') then true
    when p_from_status = 'shipped' and p_to_status = 'delivered' then true
    else false
  end;
$$;

revoke all on function private.customer_shipment_status_transition_allowed(text,text) from public;
revoke all on function private.customer_shipment_status_transition_allowed(text,text) from anon;
revoke all on function private.customer_shipment_status_transition_allowed(text,text) from authenticated;

create or replace function private.guard_customer_shipment_association_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_customer_id uuid;
begin
  if tg_op = 'UPDATE'
     and (new.order_id is distinct from old.order_id or new.customer_id is distinct from old.customer_id) then
    raise exception 'Shipment order/customer association is immutable.';
  end if;

  select o.customer_id
  into v_order_customer_id
  from public.customer_orders o
  where o.id = new.order_id;

  if v_order_customer_id is null then
    raise exception 'Shipment source order does not exist.';
  end if;
  if new.customer_id is distinct from v_order_customer_id then
    raise exception 'Shipment customer must match the source order customer.';
  end if;

  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'New customer shipments must start as Draft.';
  end if;

  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and not private.customer_shipment_status_transition_allowed(old.status, new.status) then
    raise exception 'Invalid customer shipment status transition: % -> %.', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_customer_shipment_association_trigger() from public;
revoke all on function private.guard_customer_shipment_association_trigger() from anon;
revoke all on function private.guard_customer_shipment_association_trigger() from authenticated;

drop trigger if exists a1_customer_shipment_guard on public.customer_shipments;
create trigger a1_customer_shipment_guard
before insert or update of order_id, customer_id, status
on public.customer_shipments
for each row
execute function private.guard_customer_shipment_association_trigger();

-- ---------------------------------------------------------------------------
-- Installations
-- ---------------------------------------------------------------------------

create or replace function private.customer_installation_status_transition_allowed(
  p_from_status text,
  p_to_status text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_from_status is null or p_to_status is null then false
    when p_from_status = p_to_status then true
    when p_from_status = 'scheduled' and p_to_status in ('confirmed','cancelled') then true
    when p_from_status = 'confirmed' and p_to_status in ('in_progress','cancelled') then true
    when p_from_status = 'in_progress' and p_to_status in ('completed','cancelled') then true
    else false
  end;
$$;

revoke all on function private.customer_installation_status_transition_allowed(text,text) from public;
revoke all on function private.customer_installation_status_transition_allowed(text,text) from anon;
revoke all on function private.customer_installation_status_transition_allowed(text,text) from authenticated;

create or replace function private.create_customer_installation_from_order(
  p_order_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz default null,
  p_assigned_to uuid default null,
  p_team_name text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_shipment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.customer_orders%rowtype;
  v_installation_id uuid;
begin
  if not private.current_user_has_any_role(array['super_admin','admin','sales']::text[]) then
    raise exception 'You do not have permission to schedule installations.';
  end if;

  if p_scheduled_start_at is null then
    raise exception 'Scheduled start is required.';
  end if;
  if p_scheduled_end_at is not null and p_scheduled_end_at <= p_scheduled_start_at then
    raise exception 'Scheduled end must be after scheduled start.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id
  for share;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if v_order.status not in ('confirmed','in_preparation','ready_for_shipment','shipped','delivered','installation_scheduled') then
    raise exception 'This order cannot be scheduled for installation from its current status.';
  end if;
  if v_order.fulfillment_type is distinct from 'delivery_installation' then
    raise exception 'Set Fulfillment Type to Delivery + Installation on the order before scheduling installation.';
  end if;
  if v_order.shipping_address_snapshot is null then
    raise exception 'A shipping address is required before scheduling installation.';
  end if;

  if p_shipment_id is not null and not exists (
    select 1
    from public.customer_shipments s
    where s.id = p_shipment_id
      and s.order_id = p_order_id
      and s.customer_id = v_order.customer_id
      and s.status <> 'cancelled'
  ) then
    raise exception 'Selected shipment does not belong to this order/customer or is cancelled.';
  end if;

  if exists (
    select 1
    from public.customer_installations i
    where i.order_id = p_order_id
      and i.status <> 'cancelled'
  ) then
    raise exception 'This order already has an active installation appointment.';
  end if;

  insert into public.customer_installations (
    installation_number,
    customer_id,
    order_id,
    shipment_id,
    status,
    scheduled_start_at,
    scheduled_end_at,
    address_snapshot,
    assigned_to,
    team_name,
    contact_name,
    contact_phone,
    notes,
    internal_notes
  ) values (
    '',
    v_order.customer_id,
    v_order.id,
    p_shipment_id,
    'scheduled',
    p_scheduled_start_at,
    p_scheduled_end_at,
    v_order.shipping_address_snapshot,
    p_assigned_to,
    nullif(trim(p_team_name), ''),
    nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_notes), ''),
    nullif(trim(p_internal_notes), '')
  ) returning id into v_installation_id;

  if v_order.status <> 'installation_scheduled' then
    perform private.apply_customer_order_status(
      v_order.id,
      'installation_scheduled',
      'Installation appointment scheduled.'
    );
  end if;

  return v_installation_id;
end;
$$;

create or replace function private.update_customer_installation_schedule(
  p_installation_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz default null,
  p_assigned_to uuid default null,
  p_team_name text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_internal_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_status text;
begin
  if not private.current_user_has_any_role(array['super_admin','admin','sales']::text[]) then
    raise exception 'You do not have permission to edit installations.';
  end if;
  if p_scheduled_start_at is null then
    raise exception 'Scheduled start is required.';
  end if;
  if p_scheduled_end_at is not null and p_scheduled_end_at <= p_scheduled_start_at then
    raise exception 'Scheduled end must be after scheduled start.';
  end if;

  select status into v_status
  from public.customer_installations
  where id = p_installation_id
  for update;

  if v_status is null then
    raise exception 'Installation not found.';
  end if;
  if v_status not in ('scheduled','confirmed') then
    raise exception 'Only Scheduled or Confirmed installations can be rescheduled.';
  end if;

  update public.customer_installations
  set scheduled_start_at = p_scheduled_start_at,
      scheduled_end_at = p_scheduled_end_at,
      assigned_to = p_assigned_to,
      team_name = nullif(trim(p_team_name), ''),
      contact_name = nullif(trim(p_contact_name), ''),
      contact_phone = nullif(trim(p_contact_phone), ''),
      notes = nullif(trim(p_notes), ''),
      internal_notes = nullif(trim(p_internal_notes), '')
  where id = p_installation_id;
end;
$$;

create or replace function private.set_customer_installation_status(
  p_installation_id uuid,
  p_status text,
  p_completion_notes text default null
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_installation public.customer_installations%rowtype;
  v_order_status text;
begin
  if not private.current_user_has_any_role(array['super_admin','admin','sales']::text[]) then
    raise exception 'You do not have permission to update installations.';
  end if;
  if p_status not in ('scheduled','confirmed','in_progress','completed','cancelled') then
    raise exception 'Invalid installation status.';
  end if;

  select * into v_installation
  from public.customer_installations
  where id = p_installation_id
  for update;

  if v_installation.id is null then
    raise exception 'Installation not found.';
  end if;
  if v_installation.status = p_status then
    return v_installation.status;
  end if;
  if not private.customer_installation_status_transition_allowed(v_installation.status, p_status) then
    raise exception 'Invalid customer installation status transition: % -> %.', v_installation.status, p_status;
  end if;

  if p_status = 'confirmed' then
    update public.customer_installations
    set status = 'confirmed',
        confirmed_at = coalesce(confirmed_at, now())
    where id = p_installation_id;

  elsif p_status = 'in_progress' then
    update public.customer_installations
    set status = 'in_progress',
        confirmed_at = coalesce(confirmed_at, now()),
        started_at = coalesce(started_at, now())
    where id = p_installation_id;

    select status into v_order_status
    from public.customer_orders
    where id = v_installation.order_id;

    if v_order_status <> 'installation_in_progress' then
      perform private.apply_customer_order_status(
        v_installation.order_id,
        'installation_in_progress',
        'Installation started: ' || v_installation.installation_number
      );
    end if;

  elsif p_status = 'completed' then
    update public.customer_installations
    set status = 'completed',
        completed_at = now(),
        started_at = coalesce(started_at, now()),
        completion_notes = nullif(trim(p_completion_notes), '')
    where id = p_installation_id;

    perform private.apply_customer_order_status(
      v_installation.order_id,
      'completed',
      'Installation completed: ' || v_installation.installation_number
    );

  elsif p_status = 'cancelled' then
    update public.customer_installations
    set status = 'cancelled',
        cancelled_at = now()
    where id = p_installation_id;

    select status into v_order_status
    from public.customer_orders
    where id = v_installation.order_id;

    if v_installation.status = 'in_progress'
       and v_order_status = 'installation_in_progress' then
      perform private.apply_customer_order_status(
        v_installation.order_id,
        'installation_scheduled',
        'Installation cancelled; rescheduling required: ' || v_installation.installation_number
      );
    end if;
  end if;

  return p_status;
end;
$$;

revoke all on function private.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) from public;
revoke execute on function private.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) from anon;
grant execute on function private.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) to authenticated;

revoke all on function private.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) from public;
revoke execute on function private.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) from anon;
grant execute on function private.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) to authenticated;

revoke all on function private.set_customer_installation_status(uuid,text,text) from public;
revoke execute on function private.set_customer_installation_status(uuid,text,text) from anon;
grant execute on function private.set_customer_installation_status(uuid,text,text) to authenticated;

create or replace function public.create_customer_installation_from_order(
  p_order_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz default null,
  p_assigned_to uuid default null,
  p_team_name text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_shipment_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, private
as $$
  select private.create_customer_installation_from_order(
    p_order_id,
    p_scheduled_start_at,
    p_scheduled_end_at,
    p_assigned_to,
    p_team_name,
    p_contact_name,
    p_contact_phone,
    p_notes,
    p_internal_notes,
    p_shipment_id
  );
$$;

create or replace function public.update_customer_installation_schedule(
  p_installation_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz default null,
  p_assigned_to uuid default null,
  p_team_name text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_internal_notes text default null
)
returns void
language sql
security invoker
set search_path = pg_catalog, private
as $$
  select private.update_customer_installation_schedule(
    p_installation_id,
    p_scheduled_start_at,
    p_scheduled_end_at,
    p_assigned_to,
    p_team_name,
    p_contact_name,
    p_contact_phone,
    p_notes,
    p_internal_notes
  );
$$;

create or replace function public.set_customer_installation_status(
  p_installation_id uuid,
  p_status text,
  p_completion_notes text default null
)
returns text
language sql
security invoker
set search_path = pg_catalog, private
as $$
  select private.set_customer_installation_status(
    p_installation_id,
    p_status,
    p_completion_notes
  );
$$;

revoke all on function public.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) from public;
revoke execute on function public.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) from anon;
grant execute on function public.create_customer_installation_from_order(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text,uuid) to authenticated;

revoke all on function public.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) from public;
revoke execute on function public.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) from anon;
grant execute on function public.update_customer_installation_schedule(uuid,timestamptz,timestamptz,uuid,text,text,text,text,text) to authenticated;

revoke all on function public.set_customer_installation_status(uuid,text,text) from public;
revoke execute on function public.set_customer_installation_status(uuid,text,text) from anon;
grant execute on function public.set_customer_installation_status(uuid,text,text) to authenticated;

-- Invoice/payment boundary decision for A1:
-- payment methods and invoice state/payment-progress fields remain active internal
-- scope under invoices.manage and the existing super_admin/admin/sales/finance RPC
-- authorization. No standalone payment ledger and no Store portal invoice/payment
-- projection is introduced by this package.

-- Fail fast if pure transition policies drift during migration review.
do $$
begin
  if not private.customer_order_status_transition_allowed('draft','confirmed') then
    raise exception 'Draft orders must be able to confirm.';
  end if;
  if private.customer_order_status_transition_allowed('draft','delivered') then
    raise exception 'Draft orders must not jump directly to Delivered.';
  end if;
  if not private.customer_shipment_status_transition_allowed('draft','picking') then
    raise exception 'Draft shipments must move to Picking.';
  end if;
  if private.customer_shipment_status_transition_allowed('draft','packed') then
    raise exception 'Draft shipments must not skip Picking.';
  end if;
  if not private.customer_shipment_status_transition_allowed('packed','shipped') then
    raise exception 'Packed shipments must be shippable.';
  end if;
  if not private.customer_installation_status_transition_allowed('scheduled','confirmed') then
    raise exception 'Scheduled installations must be confirmable.';
  end if;
  if private.customer_installation_status_transition_allowed('scheduled','completed') then
    raise exception 'Scheduled installations must not jump directly to Completed.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
