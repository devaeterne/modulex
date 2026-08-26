begin;

-- ============================================================
-- CUSTOMER INVOICE PAYMENT TERMS
-- Run after customer-invoices.sql.
-- Uses the customer's commercial payment term when no explicit
-- due date is supplied by the caller.
-- ============================================================

create or replace function public.create_customer_invoice_from_order(
  p_order_id uuid,
  p_due_date date default null,
  p_notes text default null,
  p_internal_notes text default null,
  p_issue_now boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_invoice_id uuid;
  v_total numeric(18,4);
  v_payment_term_days integer := 0;
  v_due_date date;
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin', 'sales']) then
    raise exception 'You do not have permission to create customer invoices.';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id
  for share;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'A cancelled order cannot be invoiced.';
  end if;

  if v_order.status = 'draft' then
    raise exception 'Confirm the order before creating an invoice.';
  end if;

  if exists (
    select 1
    from public.customer_invoices i
    where i.order_id = p_order_id
      and i.status <> 'void'
  ) then
    raise exception 'This order already has an active invoice.';
  end if;

  if p_due_date is not null and p_due_date < current_date then
    raise exception 'Due date cannot be before today when creating an invoice.';
  end if;

  if p_due_date is null then
    select coalesce(pt.days, 0)
    into v_payment_term_days
    from public.customer_commercial_settings ccs
    join public.payment_terms pt
      on pt.id = ccs.payment_term_id
     and pt.is_active = true
    where ccs.customer_id = v_order.customer_id
    limit 1;
  end if;

  v_due_date := coalesce(
    p_due_date,
    current_date + coalesce(v_payment_term_days, 0)
  );

  v_total := case
    when coalesce(v_order.grand_total, 0) > 0 or coalesce(v_order.total_amount, 0) = 0
      then coalesce(v_order.grand_total, 0)
    else coalesce(v_order.total_amount, 0)
  end;

  insert into public.customer_invoices (
    invoice_number,
    customer_id,
    order_id,
    status,
    invoice_date,
    due_date,
    currency_code,
    customer_reference,
    order_number_snapshot,
    billing_address_snapshot,
    subtotal,
    discount_amount,
    tax_rate,
    tax_amount,
    payment_commission_percent,
    payment_commission_amount,
    total_amount,
    notes,
    internal_notes,
    issued_at
  ) values (
    '',
    v_order.customer_id,
    v_order.id,
    case when p_issue_now then 'issued' else 'draft' end,
    current_date,
    v_due_date,
    v_order.currency_code,
    v_order.customer_reference,
    v_order.order_number,
    v_order.billing_address_snapshot,
    v_order.subtotal,
    v_order.discount_amount,
    v_order.tax_rate,
    v_order.tax_amount,
    coalesce(v_order.payment_commission_percent, 0),
    coalesce(v_order.payment_commission_amount, 0),
    v_total,
    nullif(trim(p_notes), ''),
    nullif(trim(p_internal_notes), ''),
    case when p_issue_now then now() else null end
  ) returning id into v_invoice_id;

  insert into public.customer_invoice_items (
    invoice_id,
    order_item_id,
    product_id,
    line_no,
    sku_snapshot,
    product_name_snapshot,
    quantity,
    unit_price,
    discount_percent,
    discount_amount,
    line_subtotal,
    line_total
  )
  select
    v_invoice_id,
    oi.id,
    oi.product_id,
    oi.line_no,
    oi.sku_snapshot,
    oi.product_name_snapshot,
    oi.quantity,
    oi.unit_price,
    oi.discount_percent,
    oi.discount_amount,
    oi.line_subtotal,
    oi.line_total
  from public.customer_order_items oi
  where oi.order_id = p_order_id
  order by oi.line_no;

  if not exists (
    select 1
    from public.customer_invoice_items ii
    where ii.invoice_id = v_invoice_id
  ) then
    raise exception 'The order has no invoiceable items.';
  end if;

  return v_invoice_id;
end;
$$;

revoke all on function public.create_customer_invoice_from_order(uuid, date, text, text, boolean) from public;
revoke all on function public.create_customer_invoice_from_order(uuid, date, text, text, boolean) from anon;
grant execute on function public.create_customer_invoice_from_order(uuid, date, text, text, boolean) to authenticated;

commit;
