-- A6-F5B — AR Aging, Customer Balance & Payment History
-- Projection-only package over canonical Customer Invoice + Finance receipt truth.
-- Customer Invoice/Order rows do not currently carry a historical base-currency FX
-- snapshot, so AR totals remain grouped by source currency. Never revalue with today's FX.

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
  project_number text,
  customer_reference text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  status text,
  currency_code varchar(3),
  total_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_as_of date := coalesce(p_as_of, current_date);
begin
  perform private.finance_assert_view();

  return query
  select
    i.id,
    i.customer_id,
    c.customer_code,
    c.name,
    i.invoice_number,
    i.order_id,
    coalesce(o.order_number, i.order_number_snapshot),
    o.project_id,
    p.project_number,
    i.customer_reference,
    i.invoice_date,
    i.due_date,
    greatest(v_as_of - coalesce(i.due_date, i.invoice_date), 0)::integer,
    case
      when coalesce(i.due_date, i.invoice_date) >= v_as_of then 'current'
      when v_as_of - coalesce(i.due_date, i.invoice_date) <= 30 then '1_30'
      when v_as_of - coalesce(i.due_date, i.invoice_date) <= 60 then '31_60'
      when v_as_of - coalesce(i.due_date, i.invoice_date) <= 90 then '61_90'
      else '90_plus'
    end,
    i.status,
    i.currency_code,
    coalesce(i.total_amount,0)::numeric,
    coalesce(i.paid_amount,0)::numeric,
    greatest(coalesce(i.total_amount,0) - coalesce(i.paid_amount,0), 0)::numeric
  from public.customer_invoices i
  join public.customers c on c.id = i.customer_id
  left join public.customer_orders o on o.id = i.order_id
  left join public.customer_projects p on p.id = o.project_id
  where i.status not in ('draft','void','paid')
    and i.issued_at is not null
    and greatest(coalesce(i.total_amount,0) - coalesce(i.paid_amount,0), 0) > 0;
end;
$function$;

create or replace function private.get_ar_aging_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_bucket text default null,
  p_search text default null,
  p_as_of date default current_date
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
  project_number text,
  customer_reference text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  status text,
  currency_code varchar(3),
  total_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    a.project_number,
    a.customer_reference,
    a.invoice_date,
    a.due_date,
    a.days_past_due,
    a.aging_bucket,
    a.status,
    a.currency_code,
    a.total_amount,
    a.paid_amount,
    a.outstanding_amount,
    count(*) over()
  from private.ar_aging_invoice_projection(coalesce(p_as_of,current_date)) a
  where (p_customer_id is null or a.customer_id = p_customer_id)
    and (p_bucket is null or a.aging_bucket = p_bucket)
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or a.invoice_number ilike '%' || btrim(p_search) || '%'
      or a.customer_name ilike '%' || btrim(p_search) || '%'
      or a.customer_code ilike '%' || btrim(p_search) || '%'
      or coalesce(a.order_number,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(a.project_number,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(a.customer_reference,'') ilike '%' || btrim(p_search) || '%'
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
$function$;

create or replace function private.get_ar_aging_summary(
  p_customer_id uuid default null,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_as_of date := coalesce(p_as_of,current_date);
  v_open_count bigint := 0;
  v_overdue_count bigint := 0;
  v_currency_totals jsonb := '{}'::jsonb;
begin
  perform private.finance_assert_view();

  with ar as (
    select *
    from private.ar_aging_invoice_projection(v_as_of) a
    where p_customer_id is null or a.customer_id = p_customer_id
  )
  select
    count(*),
    count(*) filter (where aging_bucket <> 'current')
  into v_open_count, v_overdue_count
  from ar;

  with ar as (
    select *
    from private.ar_aging_invoice_projection(v_as_of) a
    where p_customer_id is null or a.customer_id = p_customer_id
  ), grouped as (
    select
      currency_code,
      jsonb_build_object(
        'open_ar_amount', coalesce(sum(outstanding_amount),0),
        'overdue_amount', coalesce(sum(outstanding_amount) filter (where aging_bucket <> 'current'),0),
        'due_soon_amount', coalesce(sum(outstanding_amount) filter (where due_date between v_as_of and v_as_of + 7),0),
        'aging_buckets', jsonb_build_object(
          'current', coalesce(sum(outstanding_amount) filter (where aging_bucket='current'),0),
          '1_30', coalesce(sum(outstanding_amount) filter (where aging_bucket='1_30'),0),
          '31_60', coalesce(sum(outstanding_amount) filter (where aging_bucket='31_60'),0),
          '61_90', coalesce(sum(outstanding_amount) filter (where aging_bucket='61_90'),0),
          '90_plus', coalesce(sum(outstanding_amount) filter (where aging_bucket='90_plus'),0)
        )
      ) as payload
    from ar
    group by currency_code
  )
  select coalesce(jsonb_object_agg(currency_code,payload),'{}'::jsonb)
  into v_currency_totals
  from grouped;

  return jsonb_build_object(
    'as_of', v_as_of,
    'customer_id', p_customer_id,
    'open_invoice_count', coalesce(v_open_count,0),
    'overdue_invoice_count', coalesce(v_overdue_count,0),
    'currency_totals', coalesce(v_currency_totals,'{}'::jsonb),
    'currency_mode', 'grouped_no_revaluation'
  );
end;
$function$;

create or replace function private.get_customer_ar_balance(
  p_customer_id uuid,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_customer public.customers%rowtype;
  v_summary jsonb;
begin
  perform private.finance_assert_view();
  if p_customer_id is null then
    raise exception 'Customer is required.' using errcode = '22023';
  end if;

  select * into v_customer from public.customers where id = p_customer_id;
  if v_customer.id is null then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  v_summary := private.get_ar_aging_summary(p_customer_id, coalesce(p_as_of,current_date));
  return v_summary || jsonb_build_object(
    'customer_code', v_customer.customer_code,
    'customer_name', v_customer.name,
    'customer_status', v_customer.status
  );
end;
$function$;

create or replace function private.get_customer_payment_history(
  p_customer_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  source_kind text,
  source_id uuid,
  event_kind text,
  status text,
  transaction_at timestamptz,
  amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_amount numeric,
  reference_no text,
  notes text,
  order_id uuid,
  project_id uuid,
  invoice_allocations jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  if p_customer_id is null then
    raise exception 'Customer is required.' using errcode = '22023';
  end if;

  return query
  with finance_events as (
    select
      'finance_receipt'::text as source_kind,
      t.id as source_id,
      case when t.transaction_kind = 'reversal' then 'reversal' else 'receipt' end::text as event_kind,
      t.status::text,
      t.transaction_at,
      (case when t.transaction_kind = 'reversal' then -1 else 1 end * t.amount)::numeric as amount,
      t.currency_code,
      t.base_currency_code,
      (case when t.transaction_kind = 'reversal' then -1 else 1 end * t.base_amount)::numeric as base_amount,
      t.reference_no,
      t.notes,
      (select l.order_id from public.finance_transaction_links l where l.transaction_id=t.id and l.order_id is not null limit 1) as order_id,
      (select l.project_id from public.finance_transaction_links l where l.transaction_id=t.id and l.project_id is not null limit 1) as project_id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'invoice_id', l.source_document_id,
          'invoice_number', i.invoice_number,
          'amount', l.allocated_amount
        ) order by i.invoice_number)
        from public.finance_transaction_links l
        left join public.customer_invoices i on i.id = l.source_document_id
        where l.transaction_id = t.id
          and l.source_document_type = 'customer_invoice'
          and l.source_document_id is not null
      ), '[]'::jsonb) as invoice_allocations
    from public.finance_transactions t
    left join public.finance_transactions original on original.id = t.reversal_of_transaction_id
    where t.status in ('posted','voided')
      and (
        t.transaction_kind = 'customer_receipt'
        or (t.transaction_kind = 'reversal' and original.transaction_kind = 'customer_receipt')
      )
      and exists (
        select 1
        from public.finance_transaction_links l
        where l.transaction_id = t.id and l.customer_id = p_customer_id
      )
  ), project_events as (
    select
      'project_payment'::text as source_kind,
      t.id as source_id,
      t.transaction_type::text as event_kind,
      t.status::text,
      t.transaction_date::timestamptz as transaction_at,
      (private.project_payment_sign(t.transaction_type) * t.amount)::numeric as amount,
      t.currency_code,
      null::varchar(3) as base_currency_code,
      null::numeric as base_amount,
      t.reference_no,
      t.notes,
      null::uuid as order_id,
      t.project_id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'invoice_id', r.invoice_id,
          'invoice_number', i.invoice_number,
          'amount', a.amount
        ) order by i.invoice_number)
        from public.customer_project_payment_allocations a
        join public.customer_project_payment_requirements r on r.id = a.requirement_id
        left join public.customer_invoices i on i.id = r.invoice_id
        where a.transaction_id = t.id and r.invoice_id is not null
      ), '[]'::jsonb) as invoice_allocations
    from public.customer_project_payment_transactions t
    where t.customer_id = p_customer_id
      and t.status = 'posted'
      and not exists (
        select 1
        from public.customer_project_payment_finance_links b
        where b.project_payment_transaction_id = coalesce(t.reversal_of_transaction_id, t.id)
      )
  ), events as (
    select * from finance_events
    union all
    select * from project_events
  )
  select
    e.source_kind,
    e.source_id,
    e.event_kind,
    e.status,
    e.transaction_at,
    e.amount,
    e.currency_code,
    e.base_currency_code,
    e.base_amount,
    e.reference_no,
    e.notes,
    e.order_id,
    e.project_id,
    e.invoice_allocations,
    count(*) over()
  from events e
  order by e.transaction_at desc, e.source_id desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function public.get_ar_aging_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_bucket text default null,
  p_search text default null,
  p_as_of date default current_date
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
  project_number text,
  customer_reference text,
  invoice_date date,
  due_date date,
  days_past_due integer,
  aging_bucket text,
  status text,
  currency_code varchar(3),
  total_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_ar_aging_page($1,$2,$3,$4,$5,$6);
$function$;

create or replace function public.get_ar_aging_summary(
  p_customer_id uuid default null,
  p_as_of date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_ar_aging_summary($1,$2);
$function$;

create or replace function public.get_customer_ar_balance(
  p_customer_id uuid,
  p_as_of date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_customer_ar_balance($1,$2);
$function$;

create or replace function public.get_customer_payment_history(
  p_customer_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  source_kind text,
  source_id uuid,
  event_kind text,
  status text,
  transaction_at timestamptz,
  amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_amount numeric,
  reference_no text,
  notes text,
  order_id uuid,
  project_id uuid,
  invoice_allocations jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_customer_payment_history($1,$2,$3);
$function$;

revoke execute on function private.ar_aging_invoice_projection(date) from public, anon, authenticated;
revoke all on function private.get_ar_aging_page(integer,integer,uuid,text,text,date) from public, anon, authenticated;
revoke all on function private.get_ar_aging_summary(uuid,date) from public, anon, authenticated;
revoke all on function private.get_customer_ar_balance(uuid,date) from public, anon, authenticated;
revoke all on function private.get_customer_payment_history(uuid,integer,integer) from public, anon, authenticated;

revoke all on function public.get_ar_aging_page(integer,integer,uuid,text,text,date) from public, anon;
revoke all on function public.get_ar_aging_summary(uuid,date) from public, anon;
revoke all on function public.get_customer_ar_balance(uuid,date) from public, anon;
revoke all on function public.get_customer_payment_history(uuid,integer,integer) from public, anon;
grant execute on function public.get_ar_aging_page(integer,integer,uuid,text,text,date) to authenticated;
grant execute on function public.get_ar_aging_summary(uuid,date) to authenticated;
grant execute on function public.get_customer_ar_balance(uuid,date) to authenticated;
grant execute on function public.get_customer_payment_history(uuid,integer,integer) to authenticated;

comment on function public.get_ar_aging_page(integer,integer,uuid,text,text,date)
is 'A6-F5B read-only AR aging projection over canonical Customer Invoice paid/outstanding truth.';
comment on function public.get_ar_aging_summary(uuid,date)
is 'A6-F5B currency-grouped AR aging summary. No current-FX historical revaluation.';
comment on function public.get_customer_ar_balance(uuid,date)
is 'A6-F5B Customer balance projection grouped by Invoice currency.';
comment on function public.get_customer_payment_history(uuid,integer,integer)
is 'A6-F5B normalized Customer payment history combining Finance receipts and unbridged legacy Project payments without double counting.';
