-- Orders Administrative Fee
-- Internal sell/revenue adjustment. It is intentionally distinct from the historical
-- payment_commission_* payment-method surcharge fields, which remain untouched.
-- Existing Orders migrate at 0%; new Orders snapshot the General Settings default.

alter table public.general_settings
  add column if not exists administrative_fee_default_percent numeric(7,3) not null default 3.000
  check (administrative_fee_default_percent >= 0 and administrative_fee_default_percent <= 100);

alter table public.customer_orders
  add column if not exists base_sell_amount numeric(18,4) not null default 0,
  add column if not exists administrative_fee_percent numeric(7,3) not null default 0.000,
  add column if not exists administrative_fee_amount numeric(18,4) not null default 0,
  add column if not exists customer_visible_sell_amount numeric(18,4) not null default 0;

alter table public.customer_orders
  drop constraint if exists customer_orders_administrative_fee_percent_check;
alter table public.customer_orders
  add constraint customer_orders_administrative_fee_percent_check
  check (administrative_fee_percent >= 0 and administrative_fee_percent <= 100);

alter table public.customer_invoices
  add column if not exists base_sell_amount numeric(18,4) not null default 0,
  add column if not exists administrative_fee_percent numeric(7,3) not null default 0.000,
  add column if not exists administrative_fee_amount numeric(18,4) not null default 0,
  add column if not exists customer_visible_sell_amount numeric(18,4) not null default 0;

comment on column public.customer_orders.administrative_fee_percent is
  'Internal Administrative Fee snapshot. Separate from legacy payment_commission_percent.';
comment on column public.customer_orders.administrative_fee_amount is
  'Internal revenue adjustment after order discount and before tax.';
comment on column public.customer_orders.base_sell_amount is
  'Internal net sell after line/order discounts and before Administrative Fee.';
comment on column public.customer_orders.customer_visible_sell_amount is
  'Base sell plus Administrative Fee; customer documents absorb the fee into visible lines.';

-- Existing rows must keep their historical customer total. We therefore seed the new
-- internal truth from the already-authoritative pre-migration Order values with a 0% fee.
update public.customer_orders
set base_sell_amount = greatest(round(coalesce(subtotal,0) - coalesce(discount_amount,0),4),0),
    administrative_fee_percent = 0.000,
    administrative_fee_amount = 0,
    customer_visible_sell_amount = greatest(round(coalesce(subtotal,0) - coalesce(discount_amount,0),4),0)
where base_sell_amount = 0
  and administrative_fee_percent = 0
  and administrative_fee_amount = 0
  and customer_visible_sell_amount = 0;

-- Authoritative order math: base_sell_amount -> administrative_fee_amount -> tax_amount.
-- The Administrative Fee itself is rounded to cents. Tax and legacy payment surcharge keep
-- the existing four-decimal accounting precision.
create or replace function private.recalculate_customer_order_totals_v2()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_subtotal numeric;
  v_base_sell numeric;
  v_visible_sell numeric;
begin
  select coalesce(sum(i.line_total),0), count(*)
  into v_subtotal, new.item_count
  from public.customer_order_items i
  where i.order_id = new.id;

  if coalesce(new.discount_amount,0) > v_subtotal then
    raise exception 'Order discount cannot exceed subtotal.';
  end if;
  if coalesce(new.administrative_fee_percent,0) < 0
     or coalesce(new.administrative_fee_percent,0) > 100 then
    raise exception 'Administrative Fee must be between 0 and 100.';
  end if;

  new.subtotal := round(v_subtotal,4);
  v_base_sell := greatest(new.subtotal - coalesce(new.discount_amount,0),0);
  new.base_sell_amount := round(v_base_sell,4);
  new.administrative_fee_percent := round(coalesce(new.administrative_fee_percent,0),3);
  new.administrative_fee_amount := round(new.base_sell_amount * (new.administrative_fee_percent / 100),2);
  v_visible_sell := new.base_sell_amount + new.administrative_fee_amount;
  new.customer_visible_sell_amount := round(v_visible_sell,4);
  new.tax_amount := round(new.customer_visible_sell_amount * (coalesce(new.tax_rate,0)/100),4);
  new.total_amount := round(new.customer_visible_sell_amount + new.tax_amount,4);

  -- Legacy payment surcharge remains a distinct historical post-tax adjustment.
  new.payment_commission_amount := round(new.total_amount * (coalesce(new.payment_commission_percent,0)/100),4);
  new.grand_total := round(new.total_amount + new.payment_commission_amount,4);
  return new;
end;
$$;

-- Ensure changing the Administrative Fee snapshot alone enters the same authoritative recalc.
drop trigger if exists trg_customer_orders_authoritative_totals_v2 on public.customer_orders;
create trigger trg_customer_orders_authoritative_totals_v2
before update of
  item_count,
  subtotal,
  discount_amount,
  tax_rate,
  tax_amount,
  total_amount,
  payment_commission_percent,
  payment_commission_amount,
  grand_total,
  administrative_fee_percent,
  administrative_fee_amount,
  base_sell_amount,
  customer_visible_sell_amount
on public.customer_orders
for each row execute function private.recalculate_customer_order_totals_v2();

-- Canonical customer-visible line projection. Administrative Fee is never a separate line.
-- Both base cents and fee cents are allocated proportionally by base line_total. Any rounding
-- remainder is assigned to the final eligible line in stable line_no/id order.
create or replace function private.customer_order_visible_line_pricing(p_order_id uuid)
returns table (
  order_item_id uuid,
  line_no integer,
  customer_visible_unit_price numeric,
  customer_visible_discount_amount numeric,
  customer_visible_line_subtotal numeric,
  customer_visible_line_total numeric,
  administrative_fee_allocated_amount numeric
)
language sql
stable
security definer
set search_path to ''
as $$
  with order_state as (
    select
      o.id,
      round(coalesce(o.subtotal,0) * 100)::bigint as base_target_cents,
      round(coalesce(o.administrative_fee_amount,0) * 100)::bigint as fee_target_cents
    from public.customer_orders o
    where o.id = p_order_id
  ), lines as (
    select
      i.id,
      i.line_no,
      i.quantity,
      i.unit_price,
      i.discount_percent,
      greatest(i.line_total,0) as weight,
      sum(greatest(i.line_total,0)) over () as total_weight,
      row_number() over (partition by (i.line_total > 0) order by i.line_no, i.id) as eligible_rank,
      count(*) filter (where i.line_total > 0) over () as eligible_count,
      s.base_target_cents,
      s.fee_target_cents
    from public.customer_order_items i
    cross join order_state s
    where i.order_id = p_order_id
  ), floors as (
    select
      l.*,
      case when l.weight > 0 and l.total_weight > 0
        then floor(l.base_target_cents * l.weight / l.total_weight)::bigint else 0 end as base_floor_cents,
      case when l.weight > 0 and l.total_weight > 0
        then floor(l.fee_target_cents * l.weight / l.total_weight)::bigint else 0 end as fee_floor_cents
    from lines l
  ), allocated as (
    select
      f.*,
      case
        when f.weight <= 0 then 0::bigint
        when f.eligible_rank = f.eligible_count then
          f.base_floor_cents + (f.base_target_cents - sum(f.base_floor_cents) over ())
        else f.base_floor_cents
      end as base_allocated_cents,
      case
        when f.weight <= 0 then 0::bigint
        when f.eligible_rank = f.eligible_count then
          f.fee_floor_cents + (f.fee_target_cents - sum(f.fee_floor_cents) over ())
        else f.fee_floor_cents
      end as fee_allocated_cents
    from floors f
  ), visible as (
    select
      a.*,
      (a.base_allocated_cents + a.fee_allocated_cents)::numeric / 100 as visible_line_total,
      a.fee_allocated_cents::numeric / 100 as visible_fee
    from allocated a
  )
  select
    v.id,
    v.line_no,
    case
      when v.quantity > 0 and v.discount_percent < 100 then
        round((v.visible_line_total / nullif(1 - (v.discount_percent / 100),0)) / v.quantity,4)
      else round(v.unit_price,4)
    end as customer_visible_unit_price,
    case
      when v.discount_percent > 0 and v.discount_percent < 100 then
        round((v.visible_line_total / nullif(1 - (v.discount_percent / 100),0)) - v.visible_line_total,4)
      else 0::numeric
    end as customer_visible_discount_amount,
    case
      when v.discount_percent < 100 then
        round(v.visible_line_total / nullif(1 - (v.discount_percent / 100),0),4)
      else v.visible_line_total
    end as customer_visible_line_subtotal,
    round(v.visible_line_total,2) as customer_visible_line_total,
    round(v.visible_fee,2) as administrative_fee_allocated_amount
  from visible v
  order by v.line_no, v.id;
$$;

revoke all on function private.customer_order_visible_line_pricing(uuid) from public, anon, authenticated, service_role;

-- New create boundary. The extra final parameter keeps the legacy signature intact for
-- historical integrations while new Admin callers send payment commission = 0 and a separate fee.
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
  v_order_id uuid;
  v_fee numeric(7,3);
begin
  if p_administrative_fee_percent is not null
     and (p_administrative_fee_percent < 0 or p_administrative_fee_percent > 100) then
    raise exception 'Administrative Fee must be between 0 and 100.';
  end if;

  v_fee := round(coalesce(
    p_administrative_fee_percent,
    (select gs.administrative_fee_default_percent from public.general_settings gs where gs.id=1),
    3.000
  ),3);

  v_order_id := private.create_customer_order(
    p_customer_id,p_items,p_price_group_id,p_billing_address_id,p_shipping_address_id,
    p_expected_delivery_date,p_customer_reference,p_customer_notes,p_internal_notes,
    p_tax_rate,p_order_discount_amount,p_payment_method_id,p_payment_commission_percent,
    p_initial_status,p_fulfillment_type
  );

  update public.customer_orders
  set administrative_fee_percent = v_fee
  where id = v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.create_customer_order(
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
language sql
set search_path to 'pg_catalog','private'
as $$
  select private.create_customer_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16);
$$;

revoke all on function public.create_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text,numeric) from public, anon, authenticated, service_role;
grant execute on function public.create_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text,numeric) to authenticated;

-- New update boundary. The existing inner revision function remains canonical for line changes.
-- Direct revisions apply the fee immediately. Approval-mode revisions persist the proposed fee
-- into the existing approval request and apply it only after Admin approval.
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
  v_revision integer;
  v_fee numeric(7,3);
  v_request_id uuid;
begin
  if p_administrative_fee_percent is null
     or p_administrative_fee_percent < 0
     or p_administrative_fee_percent > 100 then
    raise exception 'Administrative Fee must be between 0 and 100.';
  end if;
  v_fee := round(p_administrative_fee_percent,3);

  v_revision := private.update_customer_order(
    p_order_id,p_items,p_price_group_id,p_billing_address_id,p_shipping_address_id,
    p_expected_delivery_date,p_customer_reference,p_customer_notes,p_internal_notes,
    p_tax_rate,p_order_discount_amount,p_payment_method_id,p_payment_commission_percent,
    p_revision_reason,p_fulfillment_type
  );

  if v_revision = 0 then
    -- The canonical outer function created an approval-mode request. Add the fee to the
    -- newest request created by this actor in this transaction without mutating the Order.
    select ar.id into v_request_id
    from public.approval_requests ar
    where ar.request_type='order_revision'
      and ar.entity_type='order'
      and ar.entity_id=p_order_id
      and ar.status='pending'
      and ar.requested_by=auth.uid()
    order by ar.created_at desc
    limit 1
    for update;

    if v_request_id is null then
      raise exception 'Order revision approval request was not created.';
    end if;

    update public.approval_requests
    set proposed_changes = proposed_changes || jsonb_build_object('administrative_fee_percent',v_fee),
        risk_summary = risk_summary || jsonb_build_object('administrative_fee_percent',v_fee),
        updated_at = now()
    where id=v_request_id;
  else
    update public.customer_orders
    set administrative_fee_percent=v_fee
    where id=p_order_id;
  end if;

  return v_revision;
end;
$$;

create or replace function public.update_customer_order(
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
language sql
set search_path to 'pg_catalog','private'
as $$
  select private.update_customer_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16);
$$;

revoke all on function public.update_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text,numeric) from public, anon, authenticated, service_role;
grant execute on function public.update_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text,numeric) to authenticated;

-- Apply the separately proposed fee only after the existing approval machinery has applied
-- the approved line/header revision. This never edits the fee while the request is pending.
create or replace function private.apply_approved_order_administrative_fee()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  if new.request_type='order_revision'
     and old.status='pending'
     and new.status='approved'
     and new.proposed_changes ? 'administrative_fee_percent' then
    update public.customer_orders
    set administrative_fee_percent = round((new.proposed_changes->>'administrative_fee_percent')::numeric,3)
    where id=new.entity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_approval_apply_order_administrative_fee on public.approval_requests;
create trigger trg_approval_apply_order_administrative_fee
after update of status on public.approval_requests
for each row execute function private.apply_approved_order_administrative_fee();

-- Invoice snapshot: for fee-bearing Orders, copy fee-inclusive visible line pricing so the
-- displayed invoice subtotal reconciles without an Administrative Fee line. Legacy payment
-- surcharge remains an internal historical snapshot and stays inside the receivable total.
create or replace function private.create_customer_invoice_from_order(
  p_order_id uuid,
  p_due_date date default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_issue_now boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_order public.customer_orders%rowtype;
  v_invoice_id uuid;
  v_total numeric(18,4);
  v_payment_term_days integer := 0;
  v_due_date date;
  v_visible_subtotal numeric(18,4);
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales','finance']) then
    raise exception 'You do not have permission to create customer invoices.';
  end if;

  select * into v_order from public.customer_orders where id=p_order_id for share;
  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status='cancelled' then raise exception 'A cancelled order cannot be invoiced.'; end if;
  if v_order.status='draft' then raise exception 'Confirm the order before creating an invoice.'; end if;
  if exists(select 1 from public.customer_invoices i where i.order_id=p_order_id and i.status<>'void') then
    raise exception 'This order already has an active invoice.';
  end if;
  if p_due_date is not null and p_due_date<current_date then
    raise exception 'Due date cannot be before today when creating an invoice.';
  end if;

  if p_due_date is null then
    select coalesce(pt.days,0) into v_payment_term_days
    from public.customer_commercial_settings ccs
    join public.payment_terms pt on pt.id=ccs.payment_term_id and pt.is_active=true
    where ccs.customer_id=v_order.customer_id limit 1;
  end if;
  v_due_date := coalesce(p_due_date,current_date+coalesce(v_payment_term_days,0));

  v_total := case
    when coalesce(v_order.grand_total,0)>0 or coalesce(v_order.total_amount,0)=0 then coalesce(v_order.grand_total,0)
    else coalesce(v_order.total_amount,0)
  end;

  if coalesce(v_order.administrative_fee_amount,0)>0 then
    select coalesce(sum(v.customer_visible_line_total),0)
    into v_visible_subtotal
    from private.customer_order_visible_line_pricing(p_order_id) v;
  else
    v_visible_subtotal := v_order.subtotal;
  end if;

  insert into public.customer_invoices(
    invoice_number,customer_id,order_id,status,invoice_date,due_date,currency_code,
    customer_reference,order_number_snapshot,billing_address_snapshot,
    subtotal,discount_amount,tax_rate,tax_amount,
    payment_commission_percent,payment_commission_amount,total_amount,
    base_sell_amount,administrative_fee_percent,administrative_fee_amount,customer_visible_sell_amount,
    notes,internal_notes,issued_at
  ) values (
    '',v_order.customer_id,v_order.id,case when p_issue_now then 'issued' else 'draft' end,
    current_date,v_due_date,v_order.currency_code,v_order.customer_reference,v_order.order_number,
    v_order.billing_address_snapshot,v_visible_subtotal,v_order.discount_amount,v_order.tax_rate,v_order.tax_amount,
    coalesce(v_order.payment_commission_percent,0),coalesce(v_order.payment_commission_amount,0),v_total,
    v_order.base_sell_amount,v_order.administrative_fee_percent,v_order.administrative_fee_amount,v_order.customer_visible_sell_amount,
    nullif(trim(p_notes),''),nullif(trim(p_internal_notes),''),case when p_issue_now then now() else null end
  ) returning id into v_invoice_id;

  insert into public.customer_invoice_items(
    invoice_id,order_item_id,product_id,line_no,sku_snapshot,product_name_snapshot,
    quantity,unit_price,discount_percent,discount_amount,line_subtotal,line_total,line_note
  )
  select
    v_invoice_id,oi.id,oi.product_id,oi.line_no,oi.sku_snapshot,oi.product_name_snapshot,
    oi.quantity,
    case when coalesce(v_order.administrative_fee_amount,0)>0 then vp.customer_visible_unit_price else oi.unit_price end,
    oi.discount_percent,
    case when coalesce(v_order.administrative_fee_amount,0)>0 then vp.customer_visible_discount_amount else oi.discount_amount end,
    case when coalesce(v_order.administrative_fee_amount,0)>0 then vp.customer_visible_line_subtotal else oi.line_subtotal end,
    case when coalesce(v_order.administrative_fee_amount,0)>0 then vp.customer_visible_line_total else oi.line_total end,
    oi.line_note
  from public.customer_order_items oi
  left join private.customer_order_visible_line_pricing(p_order_id) vp on vp.order_item_id=oi.id
  where oi.order_id=p_order_id
  order by oi.line_no;

  if not exists(select 1 from public.customer_invoice_items ii where ii.invoice_id=v_invoice_id) then
    raise exception 'The order has no invoiceable items.';
  end if;
  return v_invoice_id;
end;
$$;

-- Keep the existing public invoice wrapper/ACL unchanged; it delegates to the replaced private function.
