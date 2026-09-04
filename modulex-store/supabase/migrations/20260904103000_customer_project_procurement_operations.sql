-- PB-3B Project Procurement operations, shared vendor invoices, and authorization.
-- Vendor payment state intentionally remains Finance/PB-4 scope.

create or replace function private.append_customer_project_procurement_event(
  p_project_id uuid,
  p_event_type text,
  p_requirement_id uuid default null,
  p_commitment_id uuid default null,
  p_invoice_id uuid default null,
  p_allocation_id uuid default null,
  p_before_snapshot jsonb default null,
  p_after_snapshot jsonb default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_id uuid;
begin
  insert into public.customer_project_procurement_events (
    project_id, requirement_id, commitment_id, invoice_id, allocation_id,
    event_type, before_snapshot, after_snapshot, reason, actor_id
  ) values (
    p_project_id, p_requirement_id, p_commitment_id, p_invoice_id, p_allocation_id,
    btrim(p_event_type), p_before_snapshot, p_after_snapshot,
    nullif(btrim(coalesce(p_reason, '')), ''), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.append_customer_project_procurement_event(uuid,text,uuid,uuid,uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;

create or replace function private.get_customer_project_procurement(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to view detailed Project procurement data.' using errcode = '42501';
  end if;

  if p_project_id is null
     or not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    raise exception 'Project not found.';
  end if;

  with requirement_rows as (
    select
      r.*,
      o.order_number,
      coalesce((
        select sum(c.ordered_quantity)
        from public.customer_project_procurement_commitments c
        where c.requirement_id = r.id
          and c.status <> 'cancelled'
      ), 0::numeric) as active_committed_quantity
    from public.customer_project_procurement_requirements r
    join public.customer_orders o on o.id = r.order_id
    where r.project_id = p_project_id
      and (
        r.is_current
        or exists (
          select 1
          from public.customer_project_procurement_commitments hc
          where hc.requirement_id = r.id
        )
      )
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'requirements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'order_id', r.order_id,
          'order_number', r.order_number,
          'order_item_id', r.order_item_id,
          'source_kind', r.source_kind,
          'product_id', r.product_id,
          'sku', r.sku_snapshot,
          'product_name', r.product_name_snapshot,
          'required_quantity', r.required_quantity,
          'vendor_code', r.vendor_code,
          'vendor_name', r.vendor_name_snapshot,
          'vendor_source', r.vendor_source,
          'expected_unit_cost', r.expected_unit_cost,
          'expected_cost_currency', r.expected_cost_currency,
          'is_current', r.is_current,
          'retired_reason', r.retired_reason,
          'active_committed_quantity', r.active_committed_quantity,
          'open_quantity', case
            when r.required_quantity is null then null
            else greatest(r.required_quantity - r.active_committed_quantity, 0::numeric)
          end,
          'excess_ordered_quantity', case
            when r.required_quantity is null then 0::numeric
            else greatest(r.active_committed_quantity - r.required_quantity, 0::numeric)
          end,
          'attention_state', case
            when not r.is_current then 'retired'
            when r.required_quantity is null then 'quantity_required'
            when r.vendor_code is null then 'vendor_required'
            when r.expected_unit_cost is null then 'cost_required'
            when greatest(r.active_committed_quantity - r.required_quantity, 0::numeric) > 0 then 'excess_ordered'
            when greatest(r.required_quantity - r.active_committed_quantity, 0::numeric) > 0 then 'open_to_purchase'
            else 'ready'
          end,
          'commitments', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', c.id,
                'status', c.status,
                'ordered_quantity', c.ordered_quantity,
                'agreed_unit_cost', c.agreed_unit_cost,
                'currency_code', c.currency_code,
                'vendor_order_no', c.vendor_order_no,
                'ordered_at', c.ordered_at,
                'confirmed_at', c.confirmed_at,
                'cancelled_at', c.cancelled_at,
                'cancellation_reason', c.cancellation_reason,
                'delivered_quantity', c.delivered_quantity,
                'delivery_state', case
                  when c.delivered_quantity <= 0 then 'not_delivered'
                  when c.delivered_quantity < c.ordered_quantity then 'partially_delivered'
                  else 'delivered'
                end,
                'invoiced_quantity', c.invoiced_quantity,
                'invoice_state', case
                  when c.invoiced_quantity <= 0 then 'not_invoiced'
                  when c.invoiced_quantity < c.ordered_quantity then 'partially_invoiced'
                  else 'invoiced'
                end,
                'invoice_cost', c.invoice_cost,
                'invoices', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'allocation_id', l.allocation_id,
                      'invoice_id', l.invoice_id,
                      'invoice_number', l.invoice_number,
                      'invoice_date', l.invoice_date,
                      'invoiced_quantity', l.effective_quantity,
                      'project_invoice_cost', l.effective_amount
                    ) order by l.invoice_date, l.invoice_number, l.allocation_id
                  )
                  from (
                    select
                      a.id as allocation_id,
                      i.id as invoice_id,
                      i.invoice_number,
                      i.invoice_date,
                      a.quantity_delta + coalesce((
                        select sum(rv.quantity_delta)
                        from public.customer_project_procurement_invoice_allocations rv
                        where rv.reversal_of_allocation_id = a.id
                      ), 0::numeric) as effective_quantity,
                      a.amount_delta + coalesce((
                        select sum(rv.amount_delta)
                        from public.customer_project_procurement_invoice_allocations rv
                        where rv.reversal_of_allocation_id = a.id
                      ), 0::numeric) as effective_amount
                    from public.customer_project_procurement_invoice_allocations a
                    join public.vendor_invoices i on i.id = a.invoice_id
                    where a.commitment_id = c.id
                      and a.quantity_delta > 0
                  ) l
                  where l.effective_quantity > 0
                    and l.effective_amount > 0
                ), '[]'::jsonb)
              ) order by c.ordered_at, c.id
            )
            from (
              select
                pc.*,
                coalesce((
                  select sum(de.quantity_delta)
                  from public.customer_project_procurement_delivery_events de
                  where de.commitment_id = pc.id
                ), 0::numeric) as delivered_quantity,
                coalesce((
                  select sum(ia.quantity_delta)
                  from public.customer_project_procurement_invoice_allocations ia
                  where ia.commitment_id = pc.id
                ), 0::numeric) as invoiced_quantity,
                coalesce((
                  select sum(ia.amount_delta)
                  from public.customer_project_procurement_invoice_allocations ia
                  where ia.commitment_id = pc.id
                ), 0::numeric) as invoice_cost
              from public.customer_project_procurement_commitments pc
              where pc.requirement_id = r.id
            ) c
          ), '[]'::jsonb)
        ) order by r.order_number, r.created_at, r.id
      )
      from requirement_rows r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function private.get_customer_project_procurement_status(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance','sales']::text[]) then
    raise exception 'You do not have permission to view Project procurement status.' using errcode = '42501';
  end if;

  if p_project_id is null
     or not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    raise exception 'Project not found.';
  end if;

  with rows as (
    select
      r.id,
      r.order_id,
      o.order_number,
      r.source_kind,
      r.product_id,
      r.sku_snapshot,
      r.product_name_snapshot,
      r.required_quantity,
      r.is_current,
      coalesce((
        select sum(c.ordered_quantity)
        from public.customer_project_procurement_commitments c
        where c.requirement_id = r.id and c.status <> 'cancelled'
      ), 0::numeric) as ordered_quantity,
      coalesce((
        select sum(de.quantity_delta)
        from public.customer_project_procurement_delivery_events de
        join public.customer_project_procurement_commitments c on c.id = de.commitment_id
        where c.requirement_id = r.id and c.status <> 'cancelled'
      ), 0::numeric) as delivered_quantity,
      coalesce((
        select sum(ia.quantity_delta)
        from public.customer_project_procurement_invoice_allocations ia
        join public.customer_project_procurement_commitments c on c.id = ia.commitment_id
        where c.requirement_id = r.id and c.status <> 'cancelled'
      ), 0::numeric) as invoiced_quantity
    from public.customer_project_procurement_requirements r
    join public.customer_orders o on o.id = r.order_id
    where r.project_id = p_project_id
      and r.is_current
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'order_id', x.order_id,
        'order_number', x.order_number,
        'source_kind', x.source_kind,
        'product_id', x.product_id,
        'sku', x.sku_snapshot,
        'product_name', x.product_name_snapshot,
        'required_quantity', x.required_quantity,
        'ordered_quantity', x.ordered_quantity,
        'open_quantity', case when x.required_quantity is null then null else greatest(x.required_quantity - x.ordered_quantity, 0::numeric) end,
        'order_state', case
          when x.required_quantity is null then 'attention_required'
          when x.ordered_quantity <= 0 then 'not_ordered'
          when x.ordered_quantity < x.required_quantity then 'partially_ordered'
          when x.ordered_quantity > x.required_quantity then 'excess_ordered'
          else 'ordered'
        end,
        'delivered_quantity', x.delivered_quantity,
        'delivery_state', case
          when x.delivered_quantity <= 0 then 'not_delivered'
          when x.delivered_quantity < x.ordered_quantity then 'partially_delivered'
          else 'delivered'
        end,
        'invoiced_quantity', x.invoiced_quantity,
        'invoice_state', case
          when x.invoiced_quantity <= 0 then 'not_invoiced'
          when x.invoiced_quantity < x.ordered_quantity then 'partially_invoiced'
          else 'invoiced'
        end
      ) order by x.order_number, x.id)
      from rows x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function private.set_customer_project_procurement_vendor(
  p_requirement_id uuid,
  p_vendor_code text,
  p_vendor_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requirement public.customer_project_procurement_requirements%rowtype;
  v_code text := lower(nullif(btrim(coalesce(p_vendor_code, '')), ''));
  v_name text := nullif(btrim(coalesce(p_vendor_name, '')), '');
  v_before jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to resolve Project procurement vendors.' using errcode = '42501';
  end if;

  if v_code is null or v_name is null then
    raise exception 'Vendor code and vendor name are required.';
  end if;

  select * into v_requirement
  from public.customer_project_procurement_requirements
  where id = p_requirement_id
  for update;

  if v_requirement.id is null or not v_requirement.is_current then
    raise exception 'Current procurement requirement not found.';
  end if;

  if exists (
    select 1 from public.customer_project_procurement_commitments c
    where c.requirement_id = p_requirement_id
  ) then
    raise exception 'Vendor cannot be changed after a vendor commitment exists.';
  end if;

  v_before := to_jsonb(v_requirement);

  update public.customer_project_procurement_requirements
  set vendor_code = v_code,
      vendor_name_snapshot = v_name,
      vendor_source = 'manual',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_requirement_id;

  perform private.append_customer_project_procurement_event(
    v_requirement.project_id,
    'vendor_resolved',
    v_requirement.id,
    null, null, null,
    v_before,
    (select to_jsonb(r) from public.customer_project_procurement_requirements r where r.id = p_requirement_id),
    null
  );

  return p_requirement_id;
end;
$$;

create or replace function private.create_customer_project_procurement_commitment(
  p_requirement_id uuid,
  p_ordered_quantity numeric,
  p_agreed_unit_cost numeric,
  p_currency_code text,
  p_vendor_order_no text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requirement public.customer_project_procurement_requirements%rowtype;
  v_active_committed numeric(18,4);
  v_open numeric(18,4);
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_po text := nullif(btrim(coalesce(p_vendor_order_no, '')), '');
  v_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to place Project vendor orders.' using errcode = '42501';
  end if;

  select * into v_requirement
  from public.customer_project_procurement_requirements
  where id = p_requirement_id
  for update;

  if v_requirement.id is null or not v_requirement.is_current then
    raise exception 'Current procurement requirement not found.';
  end if;
  if v_requirement.required_quantity is null then
    raise exception 'Procurement quantity is required before ordering.';
  end if;
  if v_requirement.vendor_code is null or v_requirement.vendor_name_snapshot is null then
    raise exception 'Vendor is required before ordering.';
  end if;
  if p_ordered_quantity is null or p_ordered_quantity <= 0 then
    raise exception 'Ordered quantity must be greater than zero.';
  end if;
  if p_agreed_unit_cost is null or p_agreed_unit_cost < 0 then
    raise exception 'Agreed vendor cost cannot be negative.';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter code.';
  end if;
  if v_po is null then
    raise exception 'Vendor Order / PO No is required.';
  end if;

  select coalesce(sum(c.ordered_quantity), 0::numeric)
  into v_active_committed
  from public.customer_project_procurement_commitments c
  where c.requirement_id = p_requirement_id
    and c.status <> 'cancelled';

  v_open := greatest(v_requirement.required_quantity - v_active_committed, 0::numeric);
  if p_ordered_quantity > v_open then
    raise exception 'Ordered quantity exceeds the current open purchase quantity.';
  end if;

  insert into public.customer_project_procurement_commitments (
    requirement_id, project_id, order_id, order_item_id, product_id,
    vendor_code, vendor_name_snapshot, ordered_quantity, agreed_unit_cost,
    currency_code, vendor_order_no, ordered_by
  ) values (
    v_requirement.id, v_requirement.project_id, v_requirement.order_id,
    v_requirement.order_item_id, v_requirement.product_id,
    v_requirement.vendor_code, v_requirement.vendor_name_snapshot,
    p_ordered_quantity, p_agreed_unit_cost, v_currency, v_po, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_procurement_event(
    v_requirement.project_id, 'commitment_created', v_requirement.id, v_id,
    null, null, null,
    (select to_jsonb(c) from public.customer_project_procurement_commitments c where c.id = v_id),
    null
  );

  return v_id;
end;
$$;

create or replace function private.confirm_customer_project_procurement_commitment(p_commitment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_before jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to confirm Project vendor orders.' using errcode = '42501';
  end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = p_commitment_id
  for update;

  if v_commitment.id is null then raise exception 'Vendor commitment not found.'; end if;
  if v_commitment.status = 'confirmed' then return p_commitment_id; end if;
  if v_commitment.status <> 'ordered' then raise exception 'Only an Ordered commitment can be confirmed.'; end if;

  v_before := to_jsonb(v_commitment);
  update public.customer_project_procurement_commitments
  set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
  where id = p_commitment_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'commitment_confirmed', v_commitment.requirement_id,
    p_commitment_id, null, null, v_before,
    (select to_jsonb(c) from public.customer_project_procurement_commitments c where c.id = p_commitment_id), null
  );

  return p_commitment_id;
end;
$$;

create or replace function private.cancel_customer_project_procurement_commitment(
  p_commitment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_delivered numeric(18,4);
  v_invoiced numeric(18,4);
  v_before jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to cancel Project vendor orders.' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'Cancellation reason is required.'; end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = p_commitment_id
  for update;

  if v_commitment.id is null then raise exception 'Vendor commitment not found.'; end if;
  if v_commitment.status = 'cancelled' then return p_commitment_id; end if;

  select coalesce(sum(quantity_delta), 0::numeric)
  into v_delivered
  from public.customer_project_procurement_delivery_events
  where commitment_id = p_commitment_id;

  select coalesce(sum(quantity_delta), 0::numeric)
  into v_invoiced
  from public.customer_project_procurement_invoice_allocations
  where commitment_id = p_commitment_id;

  if v_delivered <> 0 or v_invoiced <> 0 then
    raise exception 'Delivered or invoiced commitments cannot be cancelled. Correct receipt/invoice history first.';
  end if;

  v_before := to_jsonb(v_commitment);
  update public.customer_project_procurement_commitments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = v_reason, updated_at = now()
  where id = p_commitment_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'commitment_cancelled', v_commitment.requirement_id,
    p_commitment_id, null, null, v_before,
    (select to_jsonb(c) from public.customer_project_procurement_commitments c where c.id = p_commitment_id), v_reason
  );

  return p_commitment_id;
end;
$$;

create or replace function private.record_customer_project_procurement_delivery(
  p_commitment_id uuid,
  p_quantity numeric,
  p_delivered_date date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_delivered numeric(18,4);
  v_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to record Project procurement delivery.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Received quantity must be greater than zero.'; end if;
  if p_delivered_date is null then raise exception 'Delivery date is required.'; end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = p_commitment_id
  for update;

  if v_commitment.id is null then raise exception 'Vendor commitment not found.'; end if;
  if v_commitment.status = 'cancelled' then raise exception 'Cancelled vendor commitments cannot receive delivery.'; end if;

  select coalesce(sum(quantity_delta), 0::numeric)
  into v_delivered
  from public.customer_project_procurement_delivery_events
  where commitment_id = p_commitment_id;

  if v_delivered + p_quantity > v_commitment.ordered_quantity then
    raise exception 'Delivered quantity cannot exceed ordered quantity.';
  end if;

  insert into public.customer_project_procurement_delivery_events (
    commitment_id, quantity_delta, event_type, delivered_date, notes, actor_id
  ) values (
    p_commitment_id, p_quantity, 'delivery', p_delivered_date,
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'delivery_recorded', v_commitment.requirement_id,
    p_commitment_id, null, null, null,
    (select to_jsonb(d) from public.customer_project_procurement_delivery_events d where d.id = v_id), null
  );

  return v_id;
end;
$$;

create or replace function private.correct_customer_project_procurement_delivery(
  p_delivery_event_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.customer_project_procurement_delivery_events%rowtype;
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_already_corrected numeric(18,4);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to correct Project procurement delivery.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Correction quantity must be greater than zero.'; end if;
  if v_reason is null then raise exception 'Correction reason is required.'; end if;

  select * into v_original
  from public.customer_project_procurement_delivery_events
  where id = p_delivery_event_id
  for update;

  if v_original.id is null or v_original.event_type <> 'delivery' or v_original.quantity_delta <= 0 then
    raise exception 'Original delivery event not found.';
  end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = v_original.commitment_id
  for update;

  select coalesce(-sum(quantity_delta), 0::numeric)
  into v_already_corrected
  from public.customer_project_procurement_delivery_events
  where correction_of_event_id = p_delivery_event_id;

  if p_quantity > v_original.quantity_delta - v_already_corrected then
    raise exception 'Correction quantity exceeds the remaining original delivery quantity.';
  end if;

  insert into public.customer_project_procurement_delivery_events (
    commitment_id, quantity_delta, event_type, delivered_date,
    correction_of_event_id, reason, actor_id
  ) values (
    v_original.commitment_id, -p_quantity, 'correction', current_date,
    v_original.id, v_reason, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'delivery_corrected', v_commitment.requirement_id,
    v_commitment.id, null, null, to_jsonb(v_original),
    (select to_jsonb(d) from public.customer_project_procurement_delivery_events d where d.id = v_id), v_reason
  );

  return v_id;
end;
$$;

create or replace function private.record_customer_project_procurement_invoice(
  p_commitment_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_invoice_total numeric,
  p_currency_code text,
  p_invoiced_quantity numeric,
  p_project_invoice_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_invoice public.vendor_invoices%rowtype;
  v_number text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  v_key text;
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_commitment_invoiced numeric(18,4);
  v_invoice_allocated numeric(18,4);
  v_allocation_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to record Project vendor invoices.' using errcode = '42501';
  end if;
  if v_number is null then raise exception 'Vendor invoice number is required.'; end if;
  if p_invoice_date is null then raise exception 'Vendor invoice date is required.'; end if;
  if p_invoice_total is null or p_invoice_total <= 0 then raise exception 'Vendor invoice total must be greater than zero.'; end if;
  if p_invoiced_quantity is null or p_invoiced_quantity <= 0 then raise exception 'Invoiced quantity must be greater than zero.'; end if;
  if p_project_invoice_cost is null or p_project_invoice_cost <= 0 then raise exception 'Project invoice cost must be greater than zero.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code.'; end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = p_commitment_id
  for update;

  if v_commitment.id is null then raise exception 'Vendor commitment not found.'; end if;
  if v_commitment.status = 'cancelled' then raise exception 'Cancelled vendor commitments cannot be invoiced.'; end if;
  if v_currency <> v_commitment.currency_code then
    raise exception 'Vendor invoice currency must match the vendor commitment currency.';
  end if;

  v_key := lower(regexp_replace(v_number, '[[:space:]]+', ' ', 'g'));
  perform pg_advisory_xact_lock(hashtextextended('vendor_invoice:' || v_commitment.vendor_code || ':' || v_key, 0));

  select * into v_invoice
  from public.vendor_invoices
  where vendor_code = v_commitment.vendor_code
    and invoice_number_key = v_key
  for update;

  if v_invoice.id is null then
    insert into public.vendor_invoices (
      vendor_code, vendor_name_snapshot, invoice_number, invoice_number_key,
      invoice_date, total_amount, currency_code, created_by
    ) values (
      v_commitment.vendor_code, v_commitment.vendor_name_snapshot, v_number, v_key,
      p_invoice_date, p_invoice_total, v_currency, auth.uid()
    ) returning * into v_invoice;
  else
    if v_invoice.currency_code <> v_currency
       or v_invoice.invoice_date <> p_invoice_date
       or abs(v_invoice.total_amount - p_invoice_total) > 0.0001 then
      raise exception 'Existing vendor invoice header does not match date, total, or currency.';
    end if;
  end if;

  select coalesce(sum(a.quantity_delta), 0::numeric)
  into v_commitment_invoiced
  from public.customer_project_procurement_invoice_allocations a
  where a.commitment_id = p_commitment_id;

  if v_commitment_invoiced + p_invoiced_quantity > v_commitment.ordered_quantity then
    raise exception 'Invoiced quantity cannot exceed ordered quantity.';
  end if;

  select coalesce(sum(a.amount_delta), 0::numeric)
  into v_invoice_allocated
  from public.customer_project_procurement_invoice_allocations a
  where a.invoice_id = v_invoice.id;

  if v_invoice_allocated + p_project_invoice_cost > v_invoice.total_amount then
    raise exception 'Project invoice allocations cannot exceed the vendor invoice total.';
  end if;

  insert into public.customer_project_procurement_invoice_allocations (
    invoice_id, commitment_id, project_id, quantity_delta, amount_delta,
    currency_code, actor_id
  ) values (
    v_invoice.id, v_commitment.id, v_commitment.project_id,
    p_invoiced_quantity, p_project_invoice_cost, v_currency, auth.uid()
  ) returning id into v_allocation_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'invoice_allocated', v_commitment.requirement_id,
    v_commitment.id, v_invoice.id, v_allocation_id, null,
    jsonb_build_object(
      'invoice', to_jsonb(v_invoice),
      'allocation', (select to_jsonb(a) from public.customer_project_procurement_invoice_allocations a where a.id = v_allocation_id)
    ), null
  );

  return v_allocation_id;
end;
$$;

create or replace function private.reverse_customer_project_procurement_invoice_allocation(
  p_allocation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.customer_project_procurement_invoice_allocations%rowtype;
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to reverse Project vendor invoice allocations.' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'Allocation reversal reason is required.'; end if;

  select * into v_original
  from public.customer_project_procurement_invoice_allocations
  where id = p_allocation_id
  for update;

  if v_original.id is null or v_original.quantity_delta <= 0 or v_original.amount_delta <= 0 then
    raise exception 'Original positive invoice allocation not found.';
  end if;

  if exists (
    select 1
    from public.customer_project_procurement_invoice_allocations r
    where r.reversal_of_allocation_id = p_allocation_id
  ) then
    raise exception 'Invoice allocation has already been reversed.';
  end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = v_original.commitment_id
  for update;

  insert into public.customer_project_procurement_invoice_allocations (
    invoice_id, commitment_id, project_id, quantity_delta, amount_delta,
    currency_code, reversal_of_allocation_id, reason, actor_id
  ) values (
    v_original.invoice_id, v_original.commitment_id, v_original.project_id,
    -v_original.quantity_delta, -v_original.amount_delta, v_original.currency_code,
    v_original.id, v_reason, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'invoice_allocation_reversed', v_commitment.requirement_id,
    v_commitment.id, v_original.invoice_id, v_id, to_jsonb(v_original),
    (select to_jsonb(a) from public.customer_project_procurement_invoice_allocations a where a.id = v_id), v_reason
  );

  return v_id;
end;
$$;

create or replace function private.guard_customer_project_procurement_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Project procurement audit rows are immutable.' using errcode = '23514';
end;
$$;

drop trigger if exists trg_customer_project_procurement_events_immutable on public.customer_project_procurement_events;
create trigger trg_customer_project_procurement_events_immutable
before update or delete on public.customer_project_procurement_events
for each row execute function private.guard_customer_project_procurement_event_immutable();

-- Direct table access stays closed. RPCs below are the business boundary.
revoke all on table public.customer_project_procurement_requirements from public, anon, authenticated;
revoke all on table public.customer_project_procurement_commitments from public, anon, authenticated;
revoke all on table public.customer_project_procurement_delivery_events from public, anon, authenticated;
revoke all on table public.vendor_invoices from public, anon, authenticated;
revoke all on table public.customer_project_procurement_invoice_allocations from public, anon, authenticated;
revoke all on table public.customer_project_procurement_events from public, anon, authenticated;

create policy customer_project_procurement_requirements_anon_deny on public.customer_project_procurement_requirements
  as restrictive for all to anon using (false) with check (false);
create policy customer_project_procurement_requirements_authenticated_deny on public.customer_project_procurement_requirements
  as restrictive for all to authenticated using (false) with check (false);
create policy customer_project_procurement_commitments_anon_deny on public.customer_project_procurement_commitments
  as restrictive for all to anon using (false) with check (false);
create policy customer_project_procurement_commitments_authenticated_deny on public.customer_project_procurement_commitments
  as restrictive for all to authenticated using (false) with check (false);
create policy customer_project_procurement_delivery_anon_deny on public.customer_project_procurement_delivery_events
  as restrictive for all to anon using (false) with check (false);
create policy customer_project_procurement_delivery_authenticated_deny on public.customer_project_procurement_delivery_events
  as restrictive for all to authenticated using (false) with check (false);
create policy vendor_invoices_anon_deny on public.vendor_invoices
  as restrictive for all to anon using (false) with check (false);
create policy vendor_invoices_authenticated_deny on public.vendor_invoices
  as restrictive for all to authenticated using (false) with check (false);
create policy customer_project_procurement_invoice_alloc_anon_deny on public.customer_project_procurement_invoice_allocations
  as restrictive for all to anon using (false) with check (false);
create policy customer_project_procurement_invoice_alloc_authenticated_deny on public.customer_project_procurement_invoice_allocations
  as restrictive for all to authenticated using (false) with check (false);
create policy customer_project_procurement_events_anon_deny on public.customer_project_procurement_events
  as restrictive for all to anon using (false) with check (false);
create policy customer_project_procurement_events_authenticated_deny on public.customer_project_procurement_events
  as restrictive for all to authenticated using (false) with check (false);

create or replace function public.get_customer_project_procurement(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = 'pg_catalog', 'private'
as $$ select private.get_customer_project_procurement($1); $$;

create or replace function public.get_customer_project_procurement_status(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = 'pg_catalog', 'private'
as $$ select private.get_customer_project_procurement_status($1); $$;

create or replace function public.set_customer_project_procurement_vendor(p_requirement_id uuid, p_vendor_code text, p_vendor_name text)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.set_customer_project_procurement_vendor($1,$2,$3); $$;

create or replace function public.create_customer_project_procurement_commitment(p_requirement_id uuid, p_ordered_quantity numeric, p_agreed_unit_cost numeric, p_currency_code text, p_vendor_order_no text)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.create_customer_project_procurement_commitment($1,$2,$3,$4,$5); $$;

create or replace function public.confirm_customer_project_procurement_commitment(p_commitment_id uuid)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.confirm_customer_project_procurement_commitment($1); $$;

create or replace function public.cancel_customer_project_procurement_commitment(p_commitment_id uuid, p_reason text)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.cancel_customer_project_procurement_commitment($1,$2); $$;

create or replace function public.record_customer_project_procurement_delivery(p_commitment_id uuid, p_quantity numeric, p_delivered_date date, p_notes text default null)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.record_customer_project_procurement_delivery($1,$2,$3,$4); $$;

create or replace function public.correct_customer_project_procurement_delivery(p_delivery_event_id uuid, p_quantity numeric, p_reason text)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.correct_customer_project_procurement_delivery($1,$2,$3); $$;

create or replace function public.record_customer_project_procurement_invoice(
  p_commitment_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_invoice_total numeric,
  p_currency_code text,
  p_invoiced_quantity numeric,
  p_project_invoice_cost numeric
)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.record_customer_project_procurement_invoice($1,$2,$3,$4,$5,$6,$7); $$;

create or replace function public.reverse_customer_project_procurement_invoice_allocation(p_allocation_id uuid, p_reason text)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $$ select private.reverse_customer_project_procurement_invoice_allocation($1,$2); $$;

revoke all on function public.get_customer_project_procurement(uuid) from public, anon;
revoke all on function public.get_customer_project_procurement_status(uuid) from public, anon;
revoke all on function public.set_customer_project_procurement_vendor(uuid,text,text) from public, anon;
revoke all on function public.create_customer_project_procurement_commitment(uuid,numeric,numeric,text,text) from public, anon;
revoke all on function public.confirm_customer_project_procurement_commitment(uuid) from public, anon;
revoke all on function public.cancel_customer_project_procurement_commitment(uuid,text) from public, anon;
revoke all on function public.record_customer_project_procurement_delivery(uuid,numeric,date,text) from public, anon;
revoke all on function public.correct_customer_project_procurement_delivery(uuid,numeric,text) from public, anon;
revoke all on function public.record_customer_project_procurement_invoice(uuid,text,date,numeric,text,numeric,numeric) from public, anon;
revoke all on function public.reverse_customer_project_procurement_invoice_allocation(uuid,text) from public, anon;

grant execute on function public.get_customer_project_procurement(uuid) to authenticated;
grant execute on function public.get_customer_project_procurement_status(uuid) to authenticated;
grant execute on function public.set_customer_project_procurement_vendor(uuid,text,text) to authenticated;
grant execute on function public.create_customer_project_procurement_commitment(uuid,numeric,numeric,text,text) to authenticated;
grant execute on function public.confirm_customer_project_procurement_commitment(uuid) to authenticated;
grant execute on function public.cancel_customer_project_procurement_commitment(uuid,text) to authenticated;
grant execute on function public.record_customer_project_procurement_delivery(uuid,numeric,date,text) to authenticated;
grant execute on function public.correct_customer_project_procurement_delivery(uuid,numeric,text) to authenticated;
grant execute on function public.record_customer_project_procurement_invoice(uuid,text,date,numeric,text,numeric,numeric) to authenticated;
grant execute on function public.reverse_customer_project_procurement_invoice_allocation(uuid,text) to authenticated;

revoke all on function private.get_customer_project_procurement(uuid) from public, anon, authenticated;
revoke all on function private.get_customer_project_procurement_status(uuid) from public, anon, authenticated;
revoke all on function private.set_customer_project_procurement_vendor(uuid,text,text) from public, anon, authenticated;
revoke all on function private.create_customer_project_procurement_commitment(uuid,numeric,numeric,text,text) from public, anon, authenticated;
revoke all on function private.confirm_customer_project_procurement_commitment(uuid) from public, anon, authenticated;
revoke all on function private.cancel_customer_project_procurement_commitment(uuid,text) from public, anon, authenticated;
revoke all on function private.record_customer_project_procurement_delivery(uuid,numeric,date,text) from public, anon, authenticated;
revoke all on function private.correct_customer_project_procurement_delivery(uuid,numeric,text) from public, anon, authenticated;
revoke all on function private.record_customer_project_procurement_invoice(uuid,text,date,numeric,text,numeric,numeric) from public, anon, authenticated;
revoke all on function private.reverse_customer_project_procurement_invoice_allocation(uuid,text) from public, anon, authenticated;

-- Intentionally no paid/unpaid/payment-date/payment-method fields or inventory_movements writes.
