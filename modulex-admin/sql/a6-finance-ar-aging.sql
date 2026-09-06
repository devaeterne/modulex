-- A6-F5B — AR Aging / Customer Balance / Customer Payment History
-- Projection-only package. Customer Invoices remain source documents; actual cash movement
-- remains Finance-owned. No parallel AR balance ledger is created.

create or replace function private.ar_aging_invoice_projection(p_as_of date default current_date)
returns table(
  invoice_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  invoice_number text,
  order_id uuid,
  order_number text,
  project_id uuid,
  invoice_status text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  finance_paid_amount numeric,
  project_paid_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  payment_state text,
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
  with finance_paid as (
    select
      l.source_document_id as invoice_id,
      coalesce(sum(
        case
          when tx.transaction_kind = 'customer_receipt' then l.allocated_amount
          when tx.transaction_kind = 'reversal' and original.transaction_kind = 'customer_receipt' then -l.allocated_amount
          else 0::numeric
        end
      ), 0::numeric)::numeric as paid_amount
    from public.finance_transaction_links l
    join public.finance_transactions tx on tx.id = l.transaction_id
    left join public.finance_transactions original on original.id = tx.reversal_of_transaction_id
    where l.source_document_type = 'customer_invoice'
      and l.source_document_id is not null
      and tx.status = 'posted'
      and (
        tx.transaction_kind = 'customer_receipt'
        or (tx.transaction_kind = 'reversal' and original.transaction_kind = 'customer_receipt')
      )
    group by l.source_document_id
  ),
  project_paid as (
    select
      r.invoice_id,
      coalesce(sum(private.project_payment_sign(t.transaction_type) * a.amount), 0::numeric)::numeric as paid_amount
    from public.customer_project_payment_requirements r
    join public.customer_project_payment_allocations a on a.requirement_id = r.id
    join public.customer_project_payment_transactions t on t.id = a.transaction_id
    where r.invoice_id is not null
      and r.cancelled_at is null
      and t.status = 'posted'
      and not exists (
        select 1
        from public.customer_project_payment_finance_links bridge
        where bridge.project_payment_transaction_id = coalesce(t.reversal_of_transaction_id, t.id)
      )
    group by r.invoice_id
  ),
  reconciled as (
    select
      i.id as invoice_id,
      i.customer_id,
      c.customer_code,
      c.name as customer_name,
      i.invoice_number,
      i.order_id,
      coalesce(o.order_number, i.order_number_snapshot) as order_number,
      o.project_id,
      i.status as invoice_status,
      i.invoice_date,
      i.due_date,
      i.total_amount,
      coalesce(fp.paid_amount, 0::numeric)::numeric as finance_paid_amount,
      coalesce(pp.paid_amount, 0::numeric)::numeric as project_paid_amount,
      greatest(
        0::numeric,
        least(i.total_amount, coalesce(fp.paid_amount, 0::numeric) + coalesce(pp.paid_amount, 0::numeric))
      )::numeric as paid_amount,
      i.currency_code
    from public.customer_invoices i
    join public.customers c on c.id = i.customer_id
    left join public.customer_orders o on o.id = i.order_id
    left join finance_paid fp on fp.invoice_id = i.id
    left join project_paid pp on pp.invoice_id = i.id
    where i.status <> 'void'
      and i.issued_at is not null
  )
  select
    r.invoice_id,
    r.customer_id,
    r.customer_code,
    r.customer_name,
    r.invoice_number,
    r.order_id,
    r.order_number,
    r.project_id,
    r.invoice_status,
    r.invoice_date,
    r.due_date,
    greatest(v_as_of - coalesce(r.due_date, v_as_of), 0)::integer,
    case
      when greatest(r.total_amount - r.paid_amount, 0) <= 0 then null
      when r.due_date is null or r.due_date >= v_as_of then 'current'
      when v_as_of - r.due_date <= 30 then '1_30'
      when v_as_of - r.due_date <= 60 then '31_60'
      when v_as_of - r.due_date <= 90 then '61_90'
      else '90_plus'
    end,
    r.total_amount,
    r.finance_paid_amount,
    r.project_paid_amount,
    r.paid_amount,
    greatest(r.total_amount - r.paid_amount, 0)::numeric,
    r.currency_code,
    v_base,
    case
      when r.currency_code = v_base then greatest(r.total_amount - r.paid_amount, 0)::numeric
      else null
    end,
    case
      when greatest(r.total_amount - r.paid_amount, 0) <= 0 then 'paid'
      when r.paid_amount > 0 then 'partial'
      else 'unpaid'
    end,
    (r.currency_code <> v_base and greatest(r.total_amount - r.paid_amount, 0) > 0)
  from reconciled r;
end;
$$;

create or replace function private.get_ar_aging_page(
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_bucket text default null,
  p_search text default null
)
returns table(
  invoice_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  invoice_number text,
  order_id uuid,
  order_number text,
  project_id uuid,
  invoice_status text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  finance_paid_amount numeric,
  project_paid_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  payment_state text,
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
    raise exception 'Unsupported AR aging bucket.' using errcode = '22023';
  end if;

  return query
  select
    a.invoice_id,
    a.customer_id,
    a.customer_code,
    a.customer_name,
    a.invoice_number,
    a.order_id,
    a.order_number,
    a.project_id,
    a.invoice_status,
    a.invoice_date,
    a.due_date,
    a.days_past_due,
    a.aging_bucket,
    a.total_amount,
    a.finance_paid_amount,
    a.project_paid_amount,
    a.paid_amount,
    a.outstanding_amount,
    a.currency_code,
    a.base_currency_code,
    a.base_outstanding_amount,
    a.payment_state,
    a.unconverted,
    count(*) over()
  from private.ar_aging_invoice_projection(coalesce(p_as_of, current_date)) a
  where a.outstanding_amount > 0
    and (p_customer_id is null or a.customer_id = p_customer_id)
    and (p_bucket is null or a.aging_bucket = p_bucket)
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or a.customer_name ilike '%' || btrim(p_search) || '%'
      or a.customer_code ilike '%' || btrim(p_search) || '%'
      or a.invoice_number ilike '%' || btrim(p_search) || '%'
      or coalesce(a.order_number,'') ilike '%' || btrim(p_search) || '%'
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

create or replace function private.get_ar_aging_summary(
  p_as_of date default current_date,
  p_customer_id uuid default null
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
  v_open_count bigint;
  v_overdue_count bigint;
  v_partial_count bigint;
  v_customer_count bigint;
  v_unconverted bigint;
  v_open_base numeric;
  v_overdue_base numeric;
  v_current_base numeric;
  v_1_30_base numeric;
  v_31_60_base numeric;
  v_61_90_base numeric;
  v_90_plus_base numeric;
  v_currency_balances jsonb;
begin
  perform private.finance_assert_view();

  with invoices as (
    select *
    from private.ar_aging_invoice_projection(v_as_of) a
    where a.outstanding_amount > 0
      and (p_customer_id is null or a.customer_id = p_customer_id)
  )
  select
    count(*),
    count(*) filter (where aging_bucket <> 'current'),
    count(*) filter (where payment_state = 'partial'),
    count(distinct customer_id),
    count(*) filter (where unconverted),
    case when count(*) filter (where unconverted) > 0 then null else coalesce(sum(base_outstanding_amount),0) end,
    case when count(*) filter (where aging_bucket <> 'current' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket <> 'current'),0) end,
    case when count(*) filter (where aging_bucket='current' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='current'),0) end,
    case when count(*) filter (where aging_bucket='1_30' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='1_30'),0) end,
    case when count(*) filter (where aging_bucket='31_60' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='31_60'),0) end,
    case when count(*) filter (where aging_bucket='61_90' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='61_90'),0) end,
    case when count(*) filter (where aging_bucket='90_plus' and unconverted) > 0 then null else coalesce(sum(base_outstanding_amount) filter (where aging_bucket='90_plus'),0) end
  into
    v_open_count,
    v_overdue_count,
    v_partial_count,
    v_customer_count,
    v_unconverted,
    v_open_base,
    v_overdue_base,
    v_current_base,
    v_1_30_base,
    v_31_60_base,
    v_61_90_base,
    v_90_plus_base
  from invoices;

  with currency_rows as (
    select
      a.currency_code,
      count(*) as invoice_count,
      count(distinct a.customer_id) as customer_count,
      coalesce(sum(a.outstanding_amount),0)::numeric as outstanding_amount
    from private.ar_aging_invoice_projection(v_as_of) a
    where a.outstanding_amount > 0
      and (p_customer_id is null or a.customer_id = p_customer_id)
    group by a.currency_code
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currency_code', currency_code,
        'invoice_count', invoice_count,
        'customer_count', customer_count,
        'outstanding_amount', outstanding_amount
      ) order by currency_code
    ),
    '[]'::jsonb
  )
  into v_currency_balances
  from currency_rows;

  return jsonb_build_object(
    'as_of', v_as_of,
    'customer_id', p_customer_id,
    'base_currency_code', v_base,
    'open_invoice_count', coalesce(v_open_count,0),
    'overdue_invoice_count', coalesce(v_overdue_count,0),
    'partial_invoice_count', coalesce(v_partial_count,0),
    'customer_count', coalesce(v_customer_count,0),
    'unconverted_invoice_count', coalesce(v_unconverted,0),
    'open_ar_base_amount', v_open_base,
    'overdue_base_amount', v_overdue_base,
    'aging_buckets', jsonb_build_object(
      'current', v_current_base,
      '1_30', v_1_30_base,
      '31_60', v_31_60_base,
      '61_90', v_61_90_base,
      '90_plus', v_90_plus_base
    ),
    'currency_balances', v_currency_balances
  );
end;
$$;

create or replace function private.get_customer_balances_page(
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_state text default null,
  p_search text default null
)
returns table(
  customer_id uuid,
  customer_code text,
  customer_name text,
  customer_status text,
  open_invoice_count bigint,
  overdue_invoice_count bigint,
  partial_invoice_count bigint,
  paid_invoice_count bigint,
  outstanding_base_amount numeric,
  base_currency_code varchar(3),
  unconverted_invoice_count bigint,
  currency_balances jsonb,
  total_count bigint
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

  if p_state is not null and p_state not in ('all','open','overdue','partial','paid') then
    raise exception 'Unsupported Customer balance state.' using errcode = '22023';
  end if;

  return query
  with invoices as (
    select * from private.ar_aging_invoice_projection(v_as_of)
  ),
  customer_totals as (
    select
      i.customer_id,
      max(i.customer_code) as customer_code,
      max(i.customer_name) as customer_name,
      max(c.status) as customer_status,
      count(*) filter (where i.outstanding_amount > 0) as open_invoice_count,
      count(*) filter (where i.outstanding_amount > 0 and i.aging_bucket <> 'current') as overdue_invoice_count,
      count(*) filter (where i.paid_amount > 0 and i.outstanding_amount > 0) as partial_invoice_count,
      count(*) filter (where i.outstanding_amount <= 0 and i.total_amount > 0) as paid_invoice_count,
      case
        when count(*) filter (where i.unconverted) > 0 then null
        else coalesce(sum(i.base_outstanding_amount) filter (where i.outstanding_amount > 0),0)
      end::numeric as outstanding_base_amount,
      count(*) filter (where i.unconverted) as unconverted_invoice_count
    from invoices i
    join public.customers c on c.id = i.customer_id
    group by i.customer_id
  ),
  currency_rows as (
    select
      i.customer_id,
      i.currency_code,
      count(*) filter (where i.outstanding_amount > 0) as open_invoice_count,
      coalesce(sum(i.outstanding_amount) filter (where i.outstanding_amount > 0),0)::numeric as outstanding_amount
    from invoices i
    group by i.customer_id, i.currency_code
  ),
  currency_rollup as (
    select
      cr.customer_id,
      jsonb_agg(
        jsonb_build_object(
          'currency_code', cr.currency_code,
          'open_invoice_count', cr.open_invoice_count,
          'outstanding_amount', cr.outstanding_amount
        ) order by cr.currency_code
      ) as currency_balances
    from currency_rows cr
    group by cr.customer_id
  )
  select
    ct.customer_id,
    ct.customer_code,
    ct.customer_name,
    ct.customer_status,
    ct.open_invoice_count,
    ct.overdue_invoice_count,
    ct.partial_invoice_count,
    ct.paid_invoice_count,
    ct.outstanding_base_amount,
    v_base,
    ct.unconverted_invoice_count,
    coalesce(cr.currency_balances, '[]'::jsonb),
    count(*) over()
  from customer_totals ct
  left join currency_rollup cr on cr.customer_id = ct.customer_id
  where (
      p_state is null or p_state = 'all'
      or (p_state = 'open' and ct.open_invoice_count > 0)
      or (p_state = 'overdue' and ct.overdue_invoice_count > 0)
      or (p_state = 'partial' and ct.partial_invoice_count > 0)
      or (p_state = 'paid' and ct.paid_invoice_count > 0 and ct.open_invoice_count = 0)
    )
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or ct.customer_name ilike '%' || btrim(p_search) || '%'
      or ct.customer_code ilike '%' || btrim(p_search) || '%'
    )
  order by ct.outstanding_base_amount desc nulls first, ct.customer_name, ct.customer_id
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function private.get_customer_invoice_balance_page(
  p_customer_id uuid,
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_balance_state text default 'all',
  p_search text default null
)
returns table(
  invoice_id uuid,
  customer_id uuid,
  invoice_number text,
  order_id uuid,
  order_number text,
  project_id uuid,
  invoice_status text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  finance_paid_amount numeric,
  project_paid_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  payment_state text,
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

  if p_customer_id is null then
    raise exception 'Customer is required.' using errcode = '22004';
  end if;
  if coalesce(p_balance_state,'all') not in ('all','open','paid') then
    raise exception 'Unsupported Invoice balance state.' using errcode = '22023';
  end if;

  return query
  select
    a.invoice_id,
    a.customer_id,
    a.invoice_number,
    a.order_id,
    a.order_number,
    a.project_id,
    a.invoice_status,
    a.invoice_date,
    a.due_date,
    a.days_past_due,
    a.aging_bucket,
    a.total_amount,
    a.finance_paid_amount,
    a.project_paid_amount,
    a.paid_amount,
    a.outstanding_amount,
    a.currency_code,
    a.base_currency_code,
    a.base_outstanding_amount,
    a.payment_state,
    a.unconverted,
    count(*) over()
  from private.ar_aging_invoice_projection(coalesce(p_as_of,current_date)) a
  where a.customer_id = p_customer_id
    and (
      coalesce(p_balance_state,'all') = 'all'
      or (p_balance_state = 'open' and a.outstanding_amount > 0)
      or (p_balance_state = 'paid' and a.outstanding_amount <= 0)
    )
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or a.invoice_number ilike '%' || btrim(p_search) || '%'
      or coalesce(a.order_number,'') ilike '%' || btrim(p_search) || '%'
    )
  order by a.invoice_date desc, a.invoice_number, a.invoice_id
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function private.get_customer_payment_history_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_search text default null
)
returns table(
  transaction_id uuid,
  original_transaction_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  event_type text,
  status text,
  amount numeric,
  effective_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_amount numeric,
  effective_base_amount numeric,
  transaction_at timestamptz,
  reference_no text,
  notes text,
  destination_account_id uuid,
  destination_account_name text,
  invoice_count bigint,
  invoice_numbers text,
  allocated_amount numeric,
  project_payment_transaction_id uuid,
  project_bridged boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base varchar(3) := private.finance_base_currency();
begin
  perform private.finance_assert_view();

  return query
  with link_rollup as (
    select
      l.transaction_id,
      (array_agg(
        distinct coalesce(l.customer_id, ci.customer_id)
        order by coalesce(l.customer_id, ci.customer_id)
      ) filter (where coalesce(l.customer_id, ci.customer_id) is not null))[1] as customer_id,
      count(distinct ci.id) as invoice_count,
      string_agg(distinct ci.invoice_number, ', ' order by ci.invoice_number) as invoice_numbers,
      coalesce(sum(l.allocated_amount) filter (where l.source_document_type = 'customer_invoice'),0)::numeric as invoice_allocated_amount
    from public.finance_transaction_links l
    left join public.customer_invoices ci
      on l.source_document_type = 'customer_invoice'
     and ci.id = l.source_document_id
    group by l.transaction_id
  ),
  events as (
    select
      t.id as transaction_id,
      t.reversal_of_transaction_id as original_transaction_id,
      lr.customer_id,
      c.customer_code,
      c.name as customer_name,
      case when t.transaction_kind = 'reversal' then 'reversal' else 'receipt' end as event_type,
      t.status,
      t.amount,
      case
        when t.status <> 'posted' then 0::numeric
        when t.transaction_kind = 'reversal' then -t.amount
        else t.amount
      end::numeric as effective_amount,
      t.currency_code,
      coalesce(t.base_currency_code, v_base)::varchar(3) as base_currency_code,
      t.base_amount,
      case
        when t.status <> 'posted' then 0::numeric
        when t.transaction_kind = 'reversal' then -coalesce(t.base_amount, case when t.currency_code = v_base then t.amount else null end)
        else coalesce(t.base_amount, case when t.currency_code = v_base then t.amount else null end)
      end::numeric as effective_base_amount,
      t.transaction_at,
      t.reference_no,
      t.notes,
      t.destination_account_id,
      account.name as destination_account_name,
      coalesce(lr.invoice_count,0) as invoice_count,
      lr.invoice_numbers,
      case
        when t.status <> 'posted' then 0::numeric
        when t.transaction_kind = 'reversal' then -coalesce(lr.invoice_allocated_amount,0)
        else coalesce(lr.invoice_allocated_amount,0)
      end::numeric as allocated_amount,
      bridge.project_payment_transaction_id,
      (bridge.project_payment_transaction_id is not null) as project_bridged
    from public.finance_transactions t
    left join public.finance_transactions original on original.id = t.reversal_of_transaction_id
    left join link_rollup lr on lr.transaction_id = t.id
    left join public.customers c on c.id = lr.customer_id
    left join public.finance_accounts account on account.id = t.destination_account_id
    left join public.customer_project_payment_finance_links bridge
      on bridge.finance_transaction_id = coalesce(t.reversal_of_transaction_id, t.id)
    where t.transaction_kind = 'customer_receipt'
       or (t.transaction_kind = 'reversal' and original.transaction_kind = 'customer_receipt')
  )
  select
    e.transaction_id,
    e.original_transaction_id,
    e.customer_id,
    e.customer_code,
    e.customer_name,
    e.event_type,
    e.status,
    e.amount,
    e.effective_amount,
    e.currency_code,
    e.base_currency_code,
    e.base_amount,
    e.effective_base_amount,
    e.transaction_at,
    e.reference_no,
    e.notes,
    e.destination_account_id,
    e.destination_account_name,
    e.invoice_count,
    e.invoice_numbers,
    e.allocated_amount,
    e.project_payment_transaction_id,
    e.project_bridged,
    count(*) over()
  from events e
  where e.customer_id is not null
    and (p_customer_id is null or e.customer_id = p_customer_id)
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or coalesce(e.customer_name,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(e.customer_code,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(e.reference_no,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(e.invoice_numbers,'') ilike '%' || btrim(p_search) || '%'
    )
  order by e.transaction_at desc, e.transaction_id desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.get_ar_aging_page(
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_bucket text default null,
  p_search text default null
)
returns table(
  invoice_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  invoice_number text,
  order_id uuid,
  order_number text,
  project_id uuid,
  invoice_status text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  finance_paid_amount numeric,
  project_paid_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  payment_state text,
  unconverted boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_ar_aging_page($1,$2,$3,$4,$5,$6);
$$;

create or replace function public.get_ar_aging_summary(
  p_as_of date default current_date,
  p_customer_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_ar_aging_summary($1,$2);
$$;

create or replace function public.get_customer_balances_page(
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_state text default null,
  p_search text default null
)
returns table(
  customer_id uuid,
  customer_code text,
  customer_name text,
  customer_status text,
  open_invoice_count bigint,
  overdue_invoice_count bigint,
  partial_invoice_count bigint,
  paid_invoice_count bigint,
  outstanding_base_amount numeric,
  base_currency_code varchar(3),
  unconverted_invoice_count bigint,
  currency_balances jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_customer_balances_page($1,$2,$3,$4,$5);
$$;

create or replace function public.get_customer_invoice_balance_page(
  p_customer_id uuid,
  p_as_of date default current_date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_balance_state text default 'all',
  p_search text default null
)
returns table(
  invoice_id uuid,
  customer_id uuid,
  invoice_number text,
  order_id uuid,
  order_number text,
  project_id uuid,
  invoice_status text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  total_amount numeric,
  finance_paid_amount numeric,
  project_paid_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_outstanding_amount numeric,
  payment_state text,
  unconverted boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_customer_invoice_balance_page($1,$2,$3,$4,$5,$6);
$$;

create or replace function public.get_customer_payment_history_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_search text default null
)
returns table(
  transaction_id uuid,
  original_transaction_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  event_type text,
  status text,
  amount numeric,
  effective_amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_amount numeric,
  effective_base_amount numeric,
  transaction_at timestamptz,
  reference_no text,
  notes text,
  destination_account_id uuid,
  destination_account_name text,
  invoice_count bigint,
  invoice_numbers text,
  allocated_amount numeric,
  project_payment_transaction_id uuid,
  project_bridged boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_customer_payment_history_page($1,$2,$3,$4);
$$;

revoke all on function private.ar_aging_invoice_projection(date) from public, anon, authenticated;
revoke all on function private.get_ar_aging_page(date,integer,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function private.get_ar_aging_summary(date,uuid) from public, anon, authenticated;
revoke all on function private.get_customer_balances_page(date,integer,integer,text,text) from public, anon, authenticated;
revoke all on function private.get_customer_invoice_balance_page(uuid,date,integer,integer,text,text) from public, anon, authenticated;
revoke all on function private.get_customer_payment_history_page(integer,integer,uuid,text) from public, anon, authenticated;

revoke all on function public.get_ar_aging_page(date,integer,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_ar_aging_summary(date,uuid) from public, anon, authenticated;
revoke all on function public.get_customer_balances_page(date,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.get_customer_invoice_balance_page(uuid,date,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.get_customer_payment_history_page(integer,integer,uuid,text) from public, anon, authenticated;

grant execute on function public.get_ar_aging_page(date,integer,integer,uuid,text,text) to authenticated;
grant execute on function public.get_ar_aging_summary(date,uuid) to authenticated;
grant execute on function public.get_customer_balances_page(date,integer,integer,text,text) to authenticated;
grant execute on function public.get_customer_invoice_balance_page(uuid,date,integer,integer,text,text) to authenticated;
grant execute on function public.get_customer_payment_history_page(integer,integer,uuid,text) to authenticated;
