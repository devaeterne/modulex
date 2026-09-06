-- A6-F5A — Customer Receipts + AR reconciliation bridge.
-- Finance Core remains the canonical money-movement ledger.
-- Customer Invoices remain source documents; Project payment history is preserved.

create schema if not exists private;

create table if not exists public.customer_project_payment_finance_links (
  project_payment_transaction_id uuid primary key
    references public.customer_project_payment_transactions(id) on update cascade on delete restrict,
  finance_transaction_id uuid not null unique
    references public.finance_transactions(id) on update cascade on delete restrict,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.customer_project_payment_finance_links enable row level security;

drop policy if exists customer_project_payment_finance_links_read on public.customer_project_payment_finance_links;
create policy customer_project_payment_finance_links_read
on public.customer_project_payment_finance_links
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','finance']::text[]));

revoke insert, update, delete, truncate on table public.customer_project_payment_finance_links from authenticated;
grant select on table public.customer_project_payment_finance_links to authenticated;

create or replace function private.customer_receipt_assert_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_currency_code text,
  p_amount numeric
)
returns table(order_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_project_id uuid;
  v_remaining numeric(18,4);
begin
  select i, o.project_id
  into v_invoice, v_project_id
  from public.customer_invoices i
  left join public.customer_orders o on o.id = i.order_id
  where i.id = p_invoice_id
  for update of i;

  if v_invoice.id is null then
    raise exception 'Customer Invoice not found.' using errcode = 'P0002';
  end if;
  if v_invoice.customer_id is distinct from p_customer_id then
    raise exception 'Customer Receipt allocation must belong to the selected Customer.' using errcode = '23514';
  end if;
  if v_invoice.status in ('draft','void','paid') or v_invoice.issued_at is null then
    raise exception 'Customer Receipt allocations require an open issued Invoice.' using errcode = '23514';
  end if;
  if v_invoice.currency_code is distinct from upper(btrim(p_currency_code)) then
    raise exception 'Customer Receipt and Invoice currencies must match.' using errcode = '23514';
  end if;
  if not v_invoice.ledger_managed and v_invoice.paid_amount > 0 then
    raise exception 'Legacy Invoice payment history must be reconciled before Finance-managed receipts can be allocated.' using errcode = '23514';
  end if;

  v_remaining := greatest(v_invoice.total_amount - v_invoice.paid_amount, 0::numeric);
  if p_amount is null or p_amount <= 0 or p_amount > v_remaining then
    raise exception 'Customer Receipt allocation exceeds the Invoice remaining balance.' using errcode = '23514';
  end if;

  return query select v_invoice.order_id, v_project_id;
end;
$function$;

create or replace function private.sync_customer_invoice_payment_from_finance(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_project_paid numeric(18,4) := 0;
  v_finance_paid numeric(18,4) := 0;
  v_paid numeric(18,4) := 0;
  v_next_status text;
begin
  if p_invoice_id is null then return; end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  -- Preserve live Project-payment history. A Project payment explicitly reconciled
  -- to Finance is excluded here so the same cash event is never counted twice.
  select coalesce(sum(private.project_payment_sign(t.transaction_type) * a.amount), 0::numeric)
  into v_project_paid
  from public.customer_project_payment_requirements r
  join public.customer_project_payment_allocations a on a.requirement_id = r.id
  join public.customer_project_payment_transactions t on t.id = a.transaction_id
  where r.invoice_id = p_invoice_id
    and r.cancelled_at is null
    and t.status = 'posted'
    and not exists (
      select 1
      from public.customer_project_payment_finance_links b
      where b.project_payment_transaction_id = coalesce(t.reversal_of_transaction_id, t.id)
    );

  -- Finance receipt links are the canonical Invoice allocation for new receipts.
  -- Full Finance reversals copy the original links, so they subtract the same allocation.
  select coalesce(sum(
    case
      when tx.transaction_kind = 'customer_receipt' then l.allocated_amount
      when tx.transaction_kind = 'reversal' and original.transaction_kind = 'customer_receipt' then -l.allocated_amount
      else 0::numeric
    end
  ), 0::numeric)
  into v_finance_paid
  from public.finance_transaction_links l
  join public.finance_transactions tx on tx.id = l.transaction_id
  left join public.finance_transactions original on original.id = tx.reversal_of_transaction_id
  where l.source_document_type = 'customer_invoice'
    and l.source_document_id = p_invoice_id
    and tx.status = 'posted'
    and (
      tx.transaction_kind = 'customer_receipt'
      or (tx.transaction_kind = 'reversal' and original.transaction_kind = 'customer_receipt')
    );

  v_paid := greatest(0::numeric, least(v_invoice.total_amount, v_project_paid + v_finance_paid));

  if v_invoice.status = 'void' then
    v_next_status := 'void';
  elsif v_invoice.issued_at is null then
    v_next_status := 'draft';
  elsif v_paid >= v_invoice.total_amount and v_invoice.total_amount > 0 then
    v_next_status := 'paid';
  elsif v_paid > 0 then
    v_next_status := 'partially_paid';
  elsif v_invoice.due_date is not null and v_invoice.due_date < current_date then
    v_next_status := 'overdue';
  else
    v_next_status := 'issued';
  end if;

  update public.customer_invoices
  set ledger_managed = true,
      paid_amount = v_paid,
      status = v_next_status,
      paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else null end,
      updated_at = now(),
      updated_by = coalesce(auth.uid(), updated_by)
  where id = p_invoice_id;
end;
$function$;

-- Existing Project-payment triggers call this historical helper name. Keep it as
-- a compatibility entrypoint but make the combined Project + Finance projection authoritative.
create or replace function private.sync_customer_invoice_payment_from_ledger(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.sync_customer_invoice_payment_from_finance(p_invoice_id);
end;
$function$;

create or replace function private.guard_customer_receipt_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(current_setting('modulex.customer_receipt_flow', true), '') <> 'on' then
    if tg_op = 'INSERT' and new.transaction_kind = 'customer_receipt' then
      raise exception 'Customer Receipts must be created through the canonical Customer Receipts flow.' using errcode = '23514';
    elsif tg_op = 'UPDATE' and (old.transaction_kind = 'customer_receipt' or new.transaction_kind = 'customer_receipt') then
      raise exception 'Customer Receipts must be changed through the canonical Customer Receipts flow.' using errcode = '23514';
    elsif tg_op = 'DELETE' and old.transaction_kind = 'customer_receipt' then
      raise exception 'Customer Receipts must be deleted through the canonical Customer Receipts flow.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_customer_receipt_flow on public.finance_transactions;
create trigger trg_guard_customer_receipt_flow
before insert or update or delete on public.finance_transactions
for each row execute function private.guard_customer_receipt_flow();

create or replace function private.sync_customer_receipt_invoices_after_finance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_receipt_event boolean := false;
  v_invoice_id uuid;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.transaction_kind = 'customer_receipt' then
    v_is_receipt_event := true;
  elsif new.transaction_kind = 'reversal' and exists (
    select 1 from public.finance_transactions o
    where o.id = new.reversal_of_transaction_id and o.transaction_kind = 'customer_receipt'
  ) then
    v_is_receipt_event := true;
  end if;

  if not v_is_receipt_event then return new; end if;

  for v_invoice_id in
    select distinct l.source_document_id
    from public.finance_transaction_links l
    where l.transaction_id = new.id
      and l.source_document_type = 'customer_invoice'
      and l.source_document_id is not null
  loop
    perform private.sync_customer_invoice_payment_from_finance(v_invoice_id);
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_sync_customer_receipt_invoices on public.finance_transactions;
create trigger trg_sync_customer_receipt_invoices
after update of status on public.finance_transactions
for each row execute function private.sync_customer_receipt_invoices_after_finance_change();

create or replace function private.record_customer_receipt(
  p_customer_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_invoice_allocations jsonb,
  p_manual_fx_rate numeric,
  p_manual_fx_rate_source text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_invoice_id uuid;
  v_allocated numeric(18,4);
  v_total_allocated numeric(18,4) := 0;
  v_order_id uuid;
  v_project_id uuid;
  v_links jsonb := '[]'::jsonb;
  v_transaction_id uuid;
  v_existing uuid;
  v_fingerprint text;
  v_count integer;
  v_distinct_count integer;
begin
  perform private.finance_assert_manage();

  if p_customer_id is null then raise exception 'Customer is required.' using errcode = '22023'; end if;
  if p_destination_account_id is null then raise exception 'Destination Finance account is required.' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Customer Receipt amount must be greater than zero.' using errcode = '22023'; end if;
  if p_currency_code is null or length(btrim(p_currency_code)) <> 3 then raise exception 'Customer Receipt currency must contain three letters.' using errcode = '22023'; end if;
  if p_invoice_allocations is null or jsonb_typeof(p_invoice_allocations) <> 'array' or jsonb_array_length(p_invoice_allocations) = 0 then
    raise exception 'Customer Receipt requires at least one Invoice allocation.' using errcode = '22023';
  end if;

  perform 1 from public.customers where id = p_customer_id for share;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  select count(*), count(distinct nullif(value->>'invoice_id','')::uuid)
  into v_count, v_distinct_count
  from jsonb_array_elements(p_invoice_allocations);
  if v_count <> v_distinct_count then
    raise exception 'Each Invoice may appear only once in a Customer Receipt.' using errcode = '22023';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'customer_id', p_customer_id,
    'destination_account_id', p_destination_account_id,
    'amount', p_amount,
    'currency_code', upper(btrim(p_currency_code)),
    'transaction_at', p_transaction_at,
    'reference_no', nullif(btrim(coalesce(p_reference_no,'')),''),
    'notes', nullif(btrim(coalesce(p_notes,'')),''),
    'invoice_allocations', p_invoice_allocations,
    'manual_fx_rate', p_manual_fx_rate,
    'manual_fx_rate_source', nullif(btrim(coalesce(p_manual_fx_rate_source,'')),'')
  )::text);
  v_existing := private.finance_idempotency_existing('record_customer_receipt', p_idempotency_key, v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  for v_item in select value from jsonb_array_elements(p_invoice_allocations)
  loop
    v_invoice_id := nullif(v_item->>'invoice_id','')::uuid;
    v_allocated := nullif(v_item->>'amount','')::numeric;
    if v_invoice_id is null or v_allocated is null or v_allocated <= 0 then
      raise exception 'Every Customer Receipt allocation requires an Invoice and positive amount.' using errcode = '22023';
    end if;

    select a.order_id, a.project_id
    into v_order_id, v_project_id
    from private.customer_receipt_assert_invoice(v_invoice_id, p_customer_id, p_currency_code, v_allocated) a;

    v_total_allocated := v_total_allocated + v_allocated;
    v_links := v_links || jsonb_build_array(jsonb_build_object(
      'project_id', v_project_id,
      'order_id', v_order_id,
      'customer_id', p_customer_id,
      'source_document_type', 'customer_invoice',
      'source_document_id', v_invoice_id,
      'allocated_amount', v_allocated,
      'notes', 'Customer Receipt Invoice allocation'
    ));
  end loop;

  if v_total_allocated is distinct from p_amount then
    raise exception 'Customer Receipt amount must equal the total Invoice allocations.' using errcode = '23514';
  end if;

  perform set_config('modulex.customer_receipt_flow','on',true);
  v_transaction_id := private.create_finance_transaction_draft(
    'customer_receipt', null, p_destination_account_id, null, p_amount,
    upper(btrim(p_currency_code)), coalesce(p_transaction_at, now()),
    nullif(btrim(coalesce(p_reference_no,'')),''), nullif(btrim(coalesce(p_notes,'')),''),
    p_idempotency_key
  );
  perform private.set_finance_transaction_links(v_transaction_id, v_links);
  perform private.post_finance_transaction(
    v_transaction_id, p_manual_fx_rate,
    nullif(btrim(coalesce(p_manual_fx_rate_source,'')),''),
    p_idempotency_key
  );

  perform private.finance_store_idempotency('record_customer_receipt', p_idempotency_key, v_fingerprint, v_transaction_id);
  return v_transaction_id;
end;
$function$;

create or replace function private.void_customer_receipt(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_manage();
  if not exists (
    select 1 from public.finance_transactions
    where id = p_transaction_id and transaction_kind = 'customer_receipt' and status = 'posted'
  ) then
    raise exception 'Posted Customer Receipt not found.' using errcode = '23514';
  end if;
  perform set_config('modulex.customer_receipt_flow','on',true);
  return private.void_finance_transaction(p_transaction_id, p_reason, p_idempotency_key);
end;
$function$;

create or replace function private.reverse_customer_receipt(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_manage();
  if not exists (
    select 1 from public.finance_transactions
    where id = p_transaction_id and transaction_kind = 'customer_receipt' and status = 'posted'
  ) then
    raise exception 'Posted Customer Receipt not found.' using errcode = '23514';
  end if;
  perform set_config('modulex.customer_receipt_flow','on',true);
  return private.reverse_finance_transaction(p_transaction_id, p_reason, p_idempotency_key);
end;
$function$;

create or replace function private.link_customer_project_payment_to_finance(
  p_project_payment_transaction_id uuid,
  p_finance_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_payment public.customer_project_payment_transactions%rowtype;
  v_finance public.finance_transactions%rowtype;
  v_invoice_id uuid;
begin
  perform private.finance_assert_manage();

  select * into v_project_payment
  from public.customer_project_payment_transactions
  where id = p_project_payment_transaction_id
  for update;
  if v_project_payment.id is null or v_project_payment.transaction_type <> 'payment' or v_project_payment.status <> 'posted' then
    raise exception 'Only a posted Project customer payment can be reconciled to Finance.' using errcode = '23514';
  end if;

  select * into v_finance
  from public.finance_transactions
  where id = p_finance_transaction_id
  for update;
  if v_finance.id is null or v_finance.transaction_kind <> 'customer_receipt' or v_finance.status <> 'posted' then
    raise exception 'Only a posted Finance Customer Receipt can be linked.' using errcode = '23514';
  end if;
  if v_finance.amount is distinct from v_project_payment.amount
     or v_finance.currency_code is distinct from v_project_payment.currency_code then
    raise exception 'Project payment and Finance receipt amount/currency must match before reconciliation.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.finance_transaction_links l
    where l.transaction_id = v_finance.id and l.customer_id = v_project_payment.customer_id
  ) then
    raise exception 'Finance Customer Receipt is not attributed to the same Customer.' using errcode = '23514';
  end if;

  if exists (
    (
      select r.invoice_id, sum(a.amount)::numeric(18,4) amount
      from public.customer_project_payment_allocations a
      join public.customer_project_payment_requirements r on r.id = a.requirement_id
      where a.transaction_id = v_project_payment.id and r.invoice_id is not null
      group by r.invoice_id
      except
      select l.source_document_id, sum(l.allocated_amount)::numeric(18,4)
      from public.finance_transaction_links l
      where l.transaction_id = v_finance.id
        and l.source_document_type = 'customer_invoice'
        and l.source_document_id is not null
      group by l.source_document_id
    )
    union all
    (
      select l.source_document_id, sum(l.allocated_amount)::numeric(18,4)
      from public.finance_transaction_links l
      where l.transaction_id = v_finance.id
        and l.source_document_type = 'customer_invoice'
        and l.source_document_id is not null
      group by l.source_document_id
      except
      select r.invoice_id, sum(a.amount)::numeric(18,4)
      from public.customer_project_payment_allocations a
      join public.customer_project_payment_requirements r on r.id = a.requirement_id
      where a.transaction_id = v_project_payment.id and r.invoice_id is not null
      group by r.invoice_id
    )
  ) then
    raise exception 'Project payment and Finance receipt Invoice allocations must match before reconciliation.' using errcode = '23514';
  end if;

  insert into public.customer_project_payment_finance_links(
    project_payment_transaction_id, finance_transaction_id, created_by
  ) values (
    v_project_payment.id, v_finance.id, auth.uid()
  );

  for v_invoice_id in
    select distinct r.invoice_id
    from public.customer_project_payment_allocations a
    join public.customer_project_payment_requirements r on r.id = a.requirement_id
    where a.transaction_id = v_project_payment.id and r.invoice_id is not null
  loop
    perform private.sync_customer_invoice_payment_from_finance(v_invoice_id);
  end loop;

  return v_finance.id;
end;
$function$;

-- Once a Project payment is explicitly bridged, keep its source identity/allocation immutable.
create or replace function private.guard_bridged_customer_project_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid := coalesce(new.id, old.id);
  v_original_id uuid := case when tg_op = 'INSERT' then new.reversal_of_transaction_id else null end;
begin
  if tg_op = 'INSERT' and v_original_id is not null and exists (
    select 1 from public.customer_project_payment_finance_links b where b.project_payment_transaction_id = v_original_id
  ) then
    raise exception 'A Finance-reconciled Project payment must be corrected through Customer Receipts.' using errcode = '23514';
  end if;
  if tg_op in ('UPDATE','DELETE') and exists (
    select 1 from public.customer_project_payment_finance_links b where b.project_payment_transaction_id = v_id
  ) then
    raise exception 'A Finance-reconciled Project payment is immutable; correct the Finance Customer Receipt instead.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_bridged_customer_project_payment on public.customer_project_payment_transactions;
create trigger trg_guard_bridged_customer_project_payment
before insert or update or delete on public.customer_project_payment_transactions
for each row execute function private.guard_bridged_customer_project_payment();

create or replace function private.guard_bridged_customer_project_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction_id uuid := coalesce(new.transaction_id, old.transaction_id);
begin
  if exists (
    select 1 from public.customer_project_payment_finance_links b
    where b.project_payment_transaction_id = v_transaction_id
  ) then
    raise exception 'Finance-reconciled Project payment allocations are immutable.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_bridged_customer_project_payment_allocation on public.customer_project_payment_allocations;
create trigger trg_guard_bridged_customer_project_payment_allocation
before insert or update or delete on public.customer_project_payment_allocations
for each row execute function private.guard_bridged_customer_project_payment_allocation();

create or replace function private.get_customer_receipt_reference_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'customer_code', c.customer_code,
        'name', c.name,
        'status', c.status,
        'currency_code', c.currency_code
      ) order by c.name)
      from public.customers c
      where c.status <> 'inactive'
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'code', a.code,
        'name', a.name,
        'account_type', a.account_type,
        'currency_code', a.currency_code
      ) order by a.name)
      from public.finance_accounts a
      where a.is_active
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function private.get_customer_receipt_invoices(p_customer_id uuid)
returns table(
  invoice_id uuid,
  invoice_number text,
  order_id uuid,
  project_id uuid,
  status text,
  invoice_date date,
  due_date date,
  currency_code varchar(3),
  total_amount numeric,
  paid_amount numeric,
  balance_amount numeric,
  legacy_unreconciled boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  select
    i.id,
    i.invoice_number,
    i.order_id,
    o.project_id,
    i.status,
    i.invoice_date,
    i.due_date,
    i.currency_code,
    i.total_amount,
    i.paid_amount,
    greatest(i.total_amount - i.paid_amount, 0)::numeric,
    (not i.ledger_managed and i.paid_amount > 0)
  from public.customer_invoices i
  left join public.customer_orders o on o.id = i.order_id
  where i.customer_id = p_customer_id
    and i.status in ('issued','partially_paid','overdue')
    and greatest(i.total_amount - i.paid_amount, 0) > 0
  order by i.due_date nulls last, i.invoice_date, i.invoice_number;
end;
$function$;

create or replace function private.get_customer_receipts_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_search text default null
)
returns table(
  transaction_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  destination_account_id uuid,
  destination_account_name text,
  amount numeric,
  currency_code varchar(3),
  transaction_at timestamptz,
  reference_no text,
  notes text,
  status text,
  allocated_amount numeric,
  invoice_count bigint,
  reversal_transaction_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  with receipt_links as (
    select
      t.id,
      max(l.customer_id) as customer_id,
      coalesce(sum(l.allocated_amount) filter (where l.source_document_type='customer_invoice'),0)::numeric as allocated_amount,
      count(distinct l.source_document_id) filter (where l.source_document_type='customer_invoice') as invoice_count
    from public.finance_transactions t
    left join public.finance_transaction_links l on l.transaction_id=t.id
    where t.transaction_kind='customer_receipt'
    group by t.id
  )
  select
    t.id,
    rl.customer_id,
    c.customer_code,
    c.name,
    t.destination_account_id,
    a.name,
    t.amount,
    t.currency_code,
    t.transaction_at,
    t.reference_no,
    t.notes,
    t.status,
    rl.allocated_amount,
    rl.invoice_count,
    (
      select r.id from public.finance_transactions r
      where r.reversal_of_transaction_id=t.id and r.status='posted'
      order by r.posted_at desc nulls last limit 1
    ),
    count(*) over()
  from public.finance_transactions t
  join receipt_links rl on rl.id=t.id
  left join public.customers c on c.id=rl.customer_id
  left join public.finance_accounts a on a.id=t.destination_account_id
  where t.transaction_kind='customer_receipt'
    and (p_customer_id is null or rl.customer_id=p_customer_id)
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or coalesce(c.name,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(c.customer_code,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(t.reference_no,'') ilike '%' || btrim(p_search) || '%'
    )
  order by t.transaction_at desc, t.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function public.record_customer_receipt(
  p_customer_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_invoice_allocations jsonb,
  p_manual_fx_rate numeric,
  p_manual_fx_rate_source text,
  p_idempotency_key uuid
)
returns uuid
language sql
set search_path = 'pg_catalog','private'
as $function$
  select private.record_customer_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);
$function$;

create or replace function public.void_customer_receipt(p_transaction_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid language sql set search_path='pg_catalog','private'
as $function$ select private.void_customer_receipt($1,$2,$3); $function$;

create or replace function public.reverse_customer_receipt(p_transaction_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid language sql set search_path='pg_catalog','private'
as $function$ select private.reverse_customer_receipt($1,$2,$3); $function$;

create or replace function public.link_customer_project_payment_to_finance(p_project_payment_transaction_id uuid,p_finance_transaction_id uuid)
returns uuid language sql set search_path='pg_catalog','private'
as $function$ select private.link_customer_project_payment_to_finance($1,$2); $function$;

create or replace function public.get_customer_receipt_reference_data()
returns jsonb language sql stable set search_path='pg_catalog','private'
as $function$ select private.get_customer_receipt_reference_data(); $function$;

create or replace function public.get_customer_receipt_invoices(p_customer_id uuid)
returns table(
  invoice_id uuid, invoice_number text, order_id uuid, project_id uuid, status text,
  invoice_date date, due_date date, currency_code varchar(3), total_amount numeric,
  paid_amount numeric, balance_amount numeric, legacy_unreconciled boolean
)
language sql stable set search_path='pg_catalog','private'
as $function$ select * from private.get_customer_receipt_invoices($1); $function$;

create or replace function public.get_customer_receipts_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_search text default null
)
returns table(
  transaction_id uuid, customer_id uuid, customer_code text, customer_name text,
  destination_account_id uuid, destination_account_name text, amount numeric,
  currency_code varchar(3), transaction_at timestamptz, reference_no text, notes text,
  status text, allocated_amount numeric, invoice_count bigint,
  reversal_transaction_id uuid, total_count bigint
)
language sql stable set search_path='pg_catalog','private'
as $function$ select * from private.get_customer_receipts_page($1,$2,$3,$4); $function$;

revoke all on function private.customer_receipt_assert_invoice(uuid,uuid,text,numeric) from public, anon, authenticated;
revoke all on function private.sync_customer_invoice_payment_from_finance(uuid) from public, anon, authenticated;
revoke all on function private.guard_customer_receipt_flow() from public, anon, authenticated;
revoke all on function private.sync_customer_receipt_invoices_after_finance_change() from public, anon, authenticated;
revoke all on function private.record_customer_receipt(uuid,uuid,numeric,text,timestamptz,text,text,jsonb,numeric,text,uuid) from public, anon, authenticated;
revoke all on function private.void_customer_receipt(uuid,text,uuid) from public, anon, authenticated;
revoke all on function private.reverse_customer_receipt(uuid,text,uuid) from public, anon, authenticated;
revoke all on function private.link_customer_project_payment_to_finance(uuid,uuid) from public, anon, authenticated;
revoke all on function private.get_customer_receipt_reference_data() from public, anon, authenticated;
revoke all on function private.get_customer_receipt_invoices(uuid) from public, anon, authenticated;
revoke all on function private.get_customer_receipts_page(integer,integer,uuid,text) from public, anon, authenticated;

revoke all on function public.record_customer_receipt(uuid,uuid,numeric,text,timestamptz,text,text,jsonb,numeric,text,uuid) from public, anon;
revoke all on function public.void_customer_receipt(uuid,text,uuid) from public, anon;
revoke all on function public.reverse_customer_receipt(uuid,text,uuid) from public, anon;
revoke all on function public.link_customer_project_payment_to_finance(uuid,uuid) from public, anon;
revoke all on function public.get_customer_receipt_reference_data() from public, anon;
revoke all on function public.get_customer_receipt_invoices(uuid) from public, anon;
revoke all on function public.get_customer_receipts_page(integer,integer,uuid,text) from public, anon;

grant execute on function public.record_customer_receipt(uuid,uuid,numeric,text,timestamptz,text,text,jsonb,numeric,text,uuid) to authenticated;
grant execute on function public.void_customer_receipt(uuid,text,uuid) to authenticated;
grant execute on function public.reverse_customer_receipt(uuid,text,uuid) to authenticated;
grant execute on function public.link_customer_project_payment_to_finance(uuid,uuid) to authenticated;
grant execute on function public.get_customer_receipt_reference_data() to authenticated;
grant execute on function public.get_customer_receipt_invoices(uuid) to authenticated;
grant execute on function public.get_customer_receipts_page(integer,integer,uuid,text) to authenticated;
