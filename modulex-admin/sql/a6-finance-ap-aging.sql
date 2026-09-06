-- A6-F3F — AP Aging & Vendor Financial Projection
-- Projection-only package: derive AP/reporting state from canonical Vendor Bills,
-- payment allocations, payment schedules and Finance payment instruments.

create or replace function private.ap_aging_bill_projection(p_as_of date default current_date)
returns table(
  invoice_id uuid,
  vendor_id uuid,
  vendor_code text,
  vendor_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  scheduled_amount numeric,
  base_scheduled_amount numeric,
  scheduled_remaining_amount numeric,
  purchase_order_reference text,
  payment_status text,
  unconverted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of, current_date);
  v_base varchar(3) := private.finance_base_currency();
begin
  perform private.finance_assert_view();

  return query
  select
    i.id,
    i.vendor_id,
    i.vendor_code,
    i.vendor_name_snapshot,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    greatest(v_as_of - coalesce(i.due_date, v_as_of), 0)::integer,
    case
      when i.due_date is null or i.due_date >= v_as_of then 'current'
      when v_as_of - i.due_date <= 30 then '1_30'
      when v_as_of - i.due_date <= 60 then '31_60'
      when v_as_of - i.due_date <= 90 then '61_90'
      else '90_plus'
    end,
    i.total_amount,
    paid.paid_amount,
    greatest(i.total_amount - paid.paid_amount, 0)::numeric,
    i.currency_code,
    v_base,
    case
      when i.currency_code = v_base then greatest(i.total_amount - paid.paid_amount, 0)::numeric
      when i.base_amount is not null and i.total_amount > 0 then
        (greatest(i.total_amount - paid.paid_amount, 0) * i.base_amount / i.total_amount)::numeric
      else null
    end,
    planned.scheduled_amount,
    case
      when i.currency_code = v_base then planned.scheduled_amount::numeric
      when i.base_amount is not null and i.total_amount > 0 then
        (planned.scheduled_amount * i.base_amount / i.total_amount)::numeric
      else null
    end,
    greatest(i.total_amount - paid.paid_amount - planned.scheduled_amount, 0)::numeric,
    i.purchase_order_reference,
    private.vendor_invoice_payment_state(i.id),
    (i.currency_code <> v_base and i.base_amount is null)
  from public.vendor_invoices i
  cross join lateral (
    select private.vendor_invoice_paid_amount(i.id)::numeric as paid_amount
  ) paid
  cross join lateral (
    select private.vendor_invoice_planned_amount(i.id)::numeric as scheduled_amount
  ) planned
  where i.status = 'open'
    and greatest(i.total_amount - paid.paid_amount, 0) > 0;
end;
$$;

create or replace function private.get_ap_aging_page(
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_vendor_id uuid default null,
  p_bucket text default null,
  p_search text default null
)
returns table(
  invoice_id uuid,
  vendor_id uuid,
  vendor_code text,
  vendor_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  scheduled_amount numeric,
  base_scheduled_amount numeric,
  scheduled_remaining_amount numeric,
  purchase_order_reference text,
  payment_status text,
  unconverted boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.finance_assert_view();

  if p_bucket is not null and p_bucket not in ('current','1_30','31_60','61_90','90_plus') then
    raise exception 'Unsupported AP aging bucket.' using errcode = '22023';
  end if;

  return query
  select
    a.invoice_id,
    a.vendor_id,
    a.vendor_code,
    a.vendor_name,
    a.invoice_number,
    a.invoice_date,
    a.due_date,
    a.days_past_due,
    a.aging_bucket,
    a.total_amount,
    a.paid_amount,
    a.outstanding_amount,
    a.currency_code,
    a.base_currency_code,
    a.base_outstanding_amount,
    a.scheduled_amount,
    a.base_scheduled_amount,
    a.scheduled_remaining_amount,
    a.purchase_order_reference,
    a.payment_status,
    a.unconverted,
    count(*) over()
  from private.ap_aging_bill_projection(coalesce(p_as_of, current_date)) a
  where (p_vendor_id is null or a.vendor_id = p_vendor_id)
    and (p_bucket is null or a.aging_bucket = p_bucket)
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or a.invoice_number ilike '%' || btrim(p_search) || '%'
      or a.vendor_name ilike '%' || btrim(p_search) || '%'
      or a.vendor_code ilike '%' || btrim(p_search) || '%'
      or coalesce(a.purchase_order_reference,'') ilike '%' || btrim(p_search) || '%'
    )
  order by
    case a.aging_bucket
      when '90_plus' then 0
      when '61_90' then 1
      when '31_60' then 2
      when '1_30' then 3
      else 4
    end,
    a.due_date nulls last,
    a.invoice_date,
    a.invoice_id
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function private.get_ap_aging_summary(
  p_as_of date default current_date,
  p_vendor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of, current_date);
  v_base varchar(3) := private.finance_base_currency();
  v_unconverted bigint;
  v_open_base numeric;
  v_overdue_base numeric;
  v_due_soon_base numeric;
  v_scheduled_base numeric;
  v_current_base numeric;
  v_1_30_base numeric;
  v_31_60_base numeric;
  v_61_90_base numeric;
  v_90_plus_base numeric;
  v_open_count bigint;
  v_overdue_count bigint;
  v_issued_check_count bigint;
  v_issued_check_base numeric;
  v_cleared_check_count bigint;
  v_cleared_check_base numeric;
  v_returned_check_count bigint;
  v_returned_check_base numeric;
  v_check_unconverted bigint;
begin
  perform private.finance_assert_view();

  with bills as (
    select *
    from private.ap_aging_bill_projection(v_as_of) a
    where p_vendor_id is null or a.vendor_id = p_vendor_id
  )
  select
    count(*),
    count(*) filter (where aging_bucket <> 'current'),
    count(*) filter (where unconverted),
    case when count(*) filter (where unconverted) > 0 then null else coalesce(sum(base_outstanding_amount),0) end,
    case when count(*) filter (where aging_bucket <> 'current' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket <> 'current'),0) end,
    case when count(*) filter (where due_date between v_as_of and v_as_of + 7 and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where due_date between v_as_of and v_as_of + 7),0) end,
    case when count(*) filter (where scheduled_amount > 0 and unconverted) > 0 then null else coalesce(sum(base_scheduled_amount),0) end,
    case when count(*) filter (where aging_bucket='current' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='current'),0) end,
    case when count(*) filter (where aging_bucket='1_30' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='1_30'),0) end,
    case when count(*) filter (where aging_bucket='31_60' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='31_60'),0) end,
    case when count(*) filter (where aging_bucket='61_90' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='61_90'),0) end,
    case when count(*) filter (where aging_bucket='90_plus' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='90_plus'),0) end
  into
    v_open_count,
    v_overdue_count,
    v_unconverted,
    v_open_base,
    v_overdue_base,
    v_due_soon_base,
    v_scheduled_base,
    v_current_base,
    v_1_30_base,
    v_31_60_base,
    v_61_90_base,
    v_90_plus_base
  from bills;

  with checks as (
    select
      pi.status,
      case
        when t.currency_code = v_base then t.amount::numeric
        when t.base_amount is not null then t.base_amount::numeric
        else null
      end as base_amount,
      (t.currency_code <> v_base and t.base_amount is null) as unconverted
    from public.finance_transactions t
    join public.finance_payment_instruments pi on pi.transaction_id = t.id
    where t.transaction_kind = 'vendor_payment'
      and t.status = 'posted'
      and pi.instrument_type = 'check'
      and pi.status in ('issued','cleared','returned')
      and (
        p_vendor_id is null
        or exists (
          select 1
          from public.finance_transaction_links l
          where l.transaction_id = t.id and l.vendor_id = p_vendor_id
        )
      )
  )
  select
    count(*) filter (where status='issued'),
    case when count(*) filter (where status='issued' and unconverted) > 0 then null else coalesce(sum(base_amount) filter (where status='issued'),0) end,
    count(*) filter (where status='cleared'),
    case when count(*) filter (where status='cleared' and unconverted) > 0 then null else coalesce(sum(base_amount) filter (where status='cleared'),0) end,
    count(*) filter (where status='returned'),
    case when count(*) filter (where status='returned' and unconverted) > 0 then null else coalesce(sum(base_amount) filter (where status='returned'),0) end,
    count(*) filter (where unconverted)
  into
    v_issued_check_count,
    v_issued_check_base,
    v_cleared_check_count,
    v_cleared_check_base,
    v_returned_check_count,
    v_returned_check_base,
    v_check_unconverted
  from checks;

  return jsonb_build_object(
    'as_of', v_as_of,
    'vendor_id', p_vendor_id,
    'base_currency_code', v_base,
    'open_bill_count', coalesce(v_open_count,0),
    'overdue_bill_count', coalesce(v_overdue_count,0),
    'open_ap_base_amount', v_open_base,
    'overdue_base_amount', v_overdue_base,
    'due_soon_base_amount', v_due_soon_base,
    'scheduled_base_amount', v_scheduled_base,
    'unconverted_bill_count', coalesce(v_unconverted,0),
    'aging_buckets', jsonb_build_object(
      'current', v_current_base,
      '1_30', v_1_30_base,
      '31_60', v_31_60_base,
      '61_90', v_61_90_base,
      '90_plus', v_90_plus_base
    ),
    'checks', jsonb_build_object(
      'issued_count', coalesce(v_issued_check_count,0),
      'issued_base_amount', v_issued_check_base,
      'cleared_count', coalesce(v_cleared_check_count,0),
      'cleared_base_amount', v_cleared_check_base,
      'returned_count', coalesce(v_returned_check_count,0),
      'returned_base_amount', v_returned_check_base,
      'unconverted_count', coalesce(v_check_unconverted,0)
    )
  );
end;
$$;

create or replace function public.get_ap_aging_page(
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_vendor_id uuid default null,
  p_bucket text default null,
  p_search text default null
)
returns table(
  invoice_id uuid,
  vendor_id uuid,
  vendor_code text,
  vendor_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  scheduled_amount numeric,
  base_scheduled_amount numeric,
  scheduled_remaining_amount numeric,
  purchase_order_reference text,
  payment_status text,
  unconverted boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_ap_aging_page($1,$2,$3,$4,$5,$6);
$$;

create or replace function public.get_ap_aging_summary(
  p_as_of date default current_date,
  p_vendor_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_ap_aging_summary($1,$2);
$$;

revoke all on function private.ap_aging_bill_projection(date) from public, anon, authenticated;
revoke all on function private.get_ap_aging_page(date,integer,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function private.get_ap_aging_summary(date,uuid) from public, anon, authenticated;

revoke all on function public.get_ap_aging_page(date,integer,integer,uuid,text,text) from public, anon;
revoke all on function public.get_ap_aging_summary(date,uuid) from public, anon;
grant execute on function public.get_ap_aging_page(date,integer,integer,uuid,text,text) to authenticated;
grant execute on function public.get_ap_aging_summary(date,uuid) to authenticated;

comment on function public.get_ap_aging_page(date,integer,integer,uuid,text,text)
is 'A6-F3F read-only AP aging projection over canonical Vendor Bill/payment/schedule truth.';
comment on function public.get_ap_aging_summary(date,uuid)
is 'A6-F3F read-only AP and vendor financial summary including aging, schedules and check lifecycle.';
