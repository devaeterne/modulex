begin;

-- ============================================================
-- MODULEX CUSTOMER INVOICES
-- Financial document snapshots created from customer orders.
-- ============================================================

create sequence if not exists public.customer_invoice_number_seq
  start with 1
  increment by 1
  minvalue 1;

create table if not exists public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,

  customer_id uuid not null
    references public.customers(id)
    on update cascade
    on delete restrict,

  order_id uuid
    references public.customer_orders(id)
    on update cascade
    on delete restrict,

  status text not null default 'draft',
  invoice_date date not null default current_date,
  due_date date,

  currency_code varchar(3) not null default 'USD',
  customer_reference text,
  order_number_snapshot text,
  billing_address_snapshot jsonb,

  subtotal numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  tax_rate numeric(7,3) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  payment_commission_percent numeric(7,3) not null default 0,
  payment_commission_amount numeric(18,4) not null default 0,
  total_amount numeric(18,4) not null default 0,
  paid_amount numeric(18,4) not null default 0,

  notes text,
  internal_notes text,

  issued_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,

  created_by uuid default auth.uid()
    references public.profiles(id)
    on delete set null,
  updated_by uuid default auth.uid()
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_invoices_number_not_empty
    check (length(trim(invoice_number)) > 0),
  constraint customer_invoices_status_valid
    check (status in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void')),
  constraint customer_invoices_currency_valid
    check (currency_code = upper(currency_code) and length(currency_code) = 3),
  constraint customer_invoices_dates_valid
    check (due_date is null or due_date >= invoice_date),
  constraint customer_invoices_amounts_valid
    check (
      subtotal >= 0
      and discount_amount >= 0
      and tax_rate >= 0
      and tax_rate <= 100
      and tax_amount >= 0
      and payment_commission_percent >= 0
      and payment_commission_amount >= 0
      and total_amount >= 0
      and paid_amount >= 0
      and paid_amount <= total_amount
    )
);

create index if not exists customer_invoices_customer_idx
  on public.customer_invoices(customer_id, invoice_date desc);
create index if not exists customer_invoices_order_idx
  on public.customer_invoices(order_id);
create index if not exists customer_invoices_status_idx
  on public.customer_invoices(status);
create index if not exists customer_invoices_due_date_idx
  on public.customer_invoices(due_date)
  where status in ('issued', 'partially_paid', 'overdue');

create table if not exists public.customer_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null
    references public.customer_invoices(id)
    on update cascade
    on delete cascade,
  order_item_id uuid
    references public.customer_order_items(id)
    on update cascade
    on delete set null,
  product_id uuid
    references public.products(id)
    on update cascade
    on delete set null,
  line_no integer not null,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  quantity numeric(18,4) not null,
  unit_price numeric(18,4) not null,
  discount_percent numeric(7,3) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  line_subtotal numeric(18,4) not null,
  line_total numeric(18,4) not null,
  created_at timestamptz not null default now(),

  constraint customer_invoice_items_line_positive check (line_no > 0),
  constraint customer_invoice_items_quantity_positive check (quantity > 0),
  constraint customer_invoice_items_amounts_valid check (
    unit_price >= 0
    and discount_percent >= 0
    and discount_percent <= 100
    and discount_amount >= 0
    and line_subtotal >= 0
    and line_total >= 0
  ),
  constraint customer_invoice_items_line_unique unique(invoice_id, line_no)
);

create index if not exists customer_invoice_items_invoice_idx
  on public.customer_invoice_items(invoice_id, line_no);

create or replace function public.set_customer_invoice_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_customer_invoices_updated on public.customer_invoices;
create trigger trg_customer_invoices_updated
before update on public.customer_invoices
for each row execute function public.set_customer_invoice_metadata();

create or replace function public.set_customer_invoice_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_number is null or trim(new.invoice_number) = '' then
    new.invoice_number := 'INV-' || lpad(nextval('public.customer_invoice_number_seq')::text, 6, '0');
  end if;
  new.invoice_number := upper(trim(new.invoice_number));
  new.currency_code := upper(trim(coalesce(new.currency_code, 'USD')));
  return new;
end;
$$;

drop trigger if exists trg_set_customer_invoice_defaults on public.customer_invoices;
create trigger trg_set_customer_invoice_defaults
before insert on public.customer_invoices
for each row execute function public.set_customer_invoice_defaults();

-- ============================================================
-- CREATE INVOICE FROM ORDER
-- One active full invoice per order for the current MVP.
-- A void invoice can be replaced by a new invoice.
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
    p_due_date,
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
    select 1 from public.customer_invoice_items ii where ii.invoice_id = v_invoice_id
  ) then
    raise exception 'The order has no invoiceable items.';
  end if;

  return v_invoice_id;
end;
$$;

-- ============================================================
-- STATUS / PAYMENT SUMMARY
-- Paid amount is intentionally managed through this RPC until
-- the dedicated payment allocation module is introduced.
-- ============================================================

create or replace function public.update_customer_invoice_state(
  p_invoice_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_status text;
  v_paid numeric(18,4);
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin', 'sales']) then
    raise exception 'You do not have permission to update customer invoices.';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status = 'void' and coalesce(p_status, 'void') <> 'void' then
    raise exception 'A void invoice cannot be reactivated.';
  end if;

  v_paid := coalesce(p_paid_amount, v_invoice.paid_amount);
  if v_paid < 0 or v_paid > v_invoice.total_amount then
    raise exception 'Paid amount must be between zero and invoice total.';
  end if;

  v_status := coalesce(p_status,
    case
      when v_paid = 0 then v_invoice.status
      when v_paid >= v_invoice.total_amount then 'paid'
      else 'partially_paid'
    end
  );

  if v_status not in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void') then
    raise exception 'Invalid invoice status.';
  end if;

  if v_status = 'draft' and v_invoice.issued_at is not null then
    raise exception 'An issued invoice cannot return to draft.';
  end if;

  if v_status in ('partially_paid', 'paid') and v_invoice.issued_at is null then
    raise exception 'Issue the invoice before recording payment.';
  end if;

  if v_status = 'paid' then
    v_paid := v_invoice.total_amount;
  end if;

  update public.customer_invoices
  set
    status = v_status,
    paid_amount = v_paid,
    issued_at = case
      when v_status in ('issued', 'partially_paid', 'paid', 'overdue') and issued_at is null then now()
      else issued_at
    end,
    paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end,
    voided_at = case when v_status = 'void' then coalesce(voided_at, now()) else null end
  where id = p_invoice_id;

  return v_status;
end;
$$;

-- ============================================================
-- RLS / GRANTS
-- ============================================================

alter table public.customer_invoices enable row level security;
alter table public.customer_invoice_items enable row level security;

drop policy if exists customer_invoices_read on public.customer_invoices;
create policy customer_invoices_read on public.customer_invoices
for select to authenticated
using (public.current_user_has_any_role(array['super_admin', 'admin', 'sales']));

drop policy if exists customer_invoices_insert on public.customer_invoices;
create policy customer_invoices_insert on public.customer_invoices
for insert to authenticated
with check (public.current_user_has_any_role(array['super_admin', 'admin', 'sales']));

drop policy if exists customer_invoices_update on public.customer_invoices;
create policy customer_invoices_update on public.customer_invoices
for update to authenticated
using (public.current_user_has_any_role(array['super_admin', 'admin', 'sales']))
with check (public.current_user_has_any_role(array['super_admin', 'admin', 'sales']));

-- No delete policy intentionally: invoices are voided, not deleted.

drop policy if exists customer_invoice_items_read on public.customer_invoice_items;
create policy customer_invoice_items_read on public.customer_invoice_items
for select to authenticated
using (public.current_user_has_any_role(array['super_admin', 'admin', 'sales']));

drop policy if exists customer_invoice_items_insert on public.customer_invoice_items;
create policy customer_invoice_items_insert on public.customer_invoice_items
for insert to authenticated
with check (public.current_user_has_any_role(array['super_admin', 'admin', 'sales']));

revoke all on public.customer_invoices from anon;
revoke all on public.customer_invoice_items from anon;
grant select, insert, update on public.customer_invoices to authenticated;
grant select, insert on public.customer_invoice_items to authenticated;

revoke all on function public.create_customer_invoice_from_order(uuid, date, text, text, boolean) from public;
revoke all on function public.create_customer_invoice_from_order(uuid, date, text, text, boolean) from anon;
grant execute on function public.create_customer_invoice_from_order(uuid, date, text, text, boolean) to authenticated;

revoke all on function public.update_customer_invoice_state(uuid, text, numeric) from public;
revoke all on function public.update_customer_invoice_state(uuid, text, numeric) from anon;
grant execute on function public.update_customer_invoice_state(uuid, text, numeric) to authenticated;

commit;
