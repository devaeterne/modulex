-- A6-F6 — Finance Reporting & Project Financial Projection
-- Read-only reporting over canonical posted Finance Core truth.

create or replace function private.finance_reporting_transaction_projection(
  p_from date default null,
  p_to date default null
)
returns table(
  transaction_id uuid,
  original_transaction_id uuid,
  transaction_kind text,
  business_kind text,
  transaction_at timestamptz,
  source_account_id uuid,
  destination_account_id uuid,
  category_id uuid,
  amount numeric,
  currency_code varchar(3),
  base_currency_code varchar(3),
  base_amount numeric,
  company_cash_delta numeric,
  operating_income_base numeric,
  operating_expense_base numeric,
  other_cash_inflow_base numeric,
  other_cash_outflow_base numeric,
  unconverted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Finance reporting from date cannot be after to date.' using errcode = '22023';
  end if;

  return query
  with projected as (
    select
      t.id as transaction_id,
      t.reversal_of_transaction_id as original_transaction_id,
      t.transaction_kind,
      case
        when t.transaction_kind = 'reversal' then original.transaction_kind
        else t.transaction_kind
      end as business_kind,
      t.transaction_at,
      t.source_account_id,
      t.destination_account_id,
      t.category_id,
      t.amount,
      t.currency_code,
      t.base_currency_code,
      t.base_amount,
      case
        when t.base_amount is null then null::numeric
        when t.source_account_id is not null and t.destination_account_id is null then -t.base_amount
        when t.destination_account_id is not null and t.source_account_id is null then t.base_amount
        else 0::numeric
      end as company_cash_delta,
      case when t.transaction_kind = 'reversal' then -1::numeric else 1::numeric end as classification_sign,
      (t.base_amount is null) as unconverted
    from public.finance_transactions t
    left join public.finance_transactions original
      on original.id = t.reversal_of_transaction_id
    where t.status = 'posted'
      and (p_from is null or t.transaction_at::date >= p_from)
      and (p_to is null or t.transaction_at::date <= p_to)
  )
  select
    p.transaction_id,
    p.original_transaction_id,
    p.transaction_kind,
    p.business_kind,
    p.transaction_at,
    p.source_account_id,
    p.destination_account_id,
    p.category_id,
    p.amount,
    p.currency_code,
    p.base_currency_code,
    p.base_amount,
    p.company_cash_delta,
    case
      when p.unconverted then null::numeric
      when p.business_kind = 'customer_receipt' then p.classification_sign * p.base_amount
      else 0::numeric
    end as operating_income_base,
    case
      when p.unconverted then null::numeric
      when p.business_kind in ('expense','vendor_payment','employee_payment') then p.classification_sign * p.base_amount
      else 0::numeric
    end as operating_expense_base,
    case
      when p.unconverted then null::numeric
      when p.business_kind in ('deposit','withdrawal','refund') and p.company_cash_delta > 0 then p.company_cash_delta
      when p.business_kind = 'transfer' then 0::numeric
      else 0::numeric
    end as other_cash_inflow_base,
    case
      when p.unconverted then null::numeric
      when p.business_kind in ('deposit','withdrawal','refund') and p.company_cash_delta < 0 then abs(p.company_cash_delta)
      when p.business_kind = 'transfer' then 0::numeric
      else 0::numeric
    end as other_cash_outflow_base,
    p.unconverted
  from projected p;
end;
$function$;

create or replace function private.get_finance_reporting_summary(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base varchar(3);
  v_unconverted bigint;
  v_posted bigint;
  v_reversals bigint;
  v_income numeric;
  v_expense numeric;
  v_other_in numeric;
  v_other_out numeric;
  v_net_cash numeric;
begin
  perform private.finance_assert_view();
  v_base := private.finance_base_currency();

  select
    count(*) filter (where p.unconverted),
    count(*),
    count(*) filter (where p.transaction_kind = 'reversal'),
    coalesce(sum(p.operating_income_base),0),
    coalesce(sum(p.operating_expense_base),0),
    coalesce(sum(p.other_cash_inflow_base),0),
    coalesce(sum(p.other_cash_outflow_base),0),
    coalesce(sum(p.company_cash_delta),0)
  into v_unconverted,v_posted,v_reversals,v_income,v_expense,v_other_in,v_other_out,v_net_cash
  from private.finance_reporting_transaction_projection(p_from,p_to) p;

  return jsonb_build_object(
    'base_currency_code', v_base,
    'from_date', p_from,
    'to_date', p_to,
    'operating_income_base', case when v_unconverted > 0 then null else round(v_income,4) end,
    'operating_expense_base', case when v_unconverted > 0 then null else round(v_expense,4) end,
    'operating_result_base', case when v_unconverted > 0 then null else round(v_income - v_expense,4) end,
    'other_cash_inflow_base', case when v_unconverted > 0 then null else round(v_other_in,4) end,
    'other_cash_outflow_base', case when v_unconverted > 0 then null else round(v_other_out,4) end,
    'net_cash_change_base', case when v_unconverted > 0 then null else round(v_net_cash,4) end,
    'posted_event_count', v_posted,
    'reversal_count', v_reversals,
    'unconverted_count', v_unconverted
  );
end;
$function$;

create or replace function private.get_finance_cash_flow_series(
  p_from date default null,
  p_to date default null,
  p_grain text default 'month'
)
returns table(
  period_start date,
  base_currency_code varchar(3),
  operating_income_base numeric,
  operating_expense_base numeric,
  operating_result_base numeric,
  other_cash_inflow_base numeric,
  other_cash_outflow_base numeric,
  net_cash_change_base numeric,
  posted_event_count bigint,
  unconverted_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_grain text := lower(btrim(coalesce(p_grain,'month')));
  v_base varchar(3);
begin
  perform private.finance_assert_view();
  if v_grain not in ('day','month') then
    raise exception 'Finance cash flow grain must be day or month.' using errcode = '22023';
  end if;
  v_base := private.finance_base_currency();

  return query
  with grouped as (
    select
      date_trunc(v_grain,p.transaction_at)::date as bucket,
      count(*) as event_count,
      count(*) filter (where p.unconverted) as unconverted_count,
      coalesce(sum(p.operating_income_base),0) as income,
      coalesce(sum(p.operating_expense_base),0) as expense,
      coalesce(sum(p.other_cash_inflow_base),0) as other_in,
      coalesce(sum(p.other_cash_outflow_base),0) as other_out,
      coalesce(sum(p.company_cash_delta),0) as net_cash
    from private.finance_reporting_transaction_projection(p_from,p_to) p
    group by date_trunc(v_grain,p.transaction_at)::date
  )
  select
    g.bucket,
    v_base,
    case when g.unconverted_count > 0 then null else round(g.income,4) end,
    case when g.unconverted_count > 0 then null else round(g.expense,4) end,
    case when g.unconverted_count > 0 then null else round(g.income - g.expense,4) end,
    case when g.unconverted_count > 0 then null else round(g.other_in,4) end,
    case when g.unconverted_count > 0 then null else round(g.other_out,4) end,
    case when g.unconverted_count > 0 then null else round(g.net_cash,4) end,
    g.event_count,
    g.unconverted_count
  from grouped g
  order by g.bucket;
end;
$function$;

create or replace function private.get_finance_account_movements_page(
  p_from date default null,
  p_to date default null,
  p_account_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  transaction_id uuid,
  original_transaction_id uuid,
  transaction_kind text,
  business_kind text,
  transaction_at timestamptz,
  account_id uuid,
  account_name text,
  counter_account_id uuid,
  counter_account_name text,
  amount numeric,
  currency_code varchar(3),
  account_delta_amount numeric,
  base_currency_code varchar(3),
  base_amount numeric,
  account_delta_base numeric,
  reference_no text,
  notes text,
  unconverted boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  if p_account_id is null then
    raise exception 'Finance account is required.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.finance_accounts a where a.id = p_account_id) then
    raise exception 'Finance account was not found.' using errcode = 'P0002';
  end if;

  return query
  select
    t.id,
    t.reversal_of_transaction_id,
    t.transaction_kind,
    case when t.transaction_kind = 'reversal' then original.transaction_kind else t.transaction_kind end,
    t.transaction_at,
    a.id,
    a.name,
    case when t.source_account_id = p_account_id then t.destination_account_id else t.source_account_id end,
    counter.name,
    t.amount,
    t.currency_code,
    case when t.destination_account_id = p_account_id then t.amount else -t.amount end,
    t.base_currency_code,
    t.base_amount,
    case
      when t.base_amount is null then null::numeric
      when t.destination_account_id = p_account_id then t.base_amount
      else -t.base_amount
    end,
    t.reference_no,
    t.notes,
    (t.base_amount is null),
    count(*) over()
  from public.finance_transactions t
  join public.finance_accounts a on a.id = p_account_id
  left join public.finance_transactions original on original.id = t.reversal_of_transaction_id
  left join public.finance_accounts counter
    on counter.id = case when t.source_account_id = p_account_id then t.destination_account_id else t.source_account_id end
  where t.status = 'posted'
    and (t.source_account_id = p_account_id or t.destination_account_id = p_account_id)
    and (p_from is null or t.transaction_at::date >= p_from)
    and (p_to is null or t.transaction_at::date <= p_to)
  order by t.transaction_at desc,t.id desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.finance_reporting_link_projection(
  p_from date default null,
  p_to date default null
)
returns table(
  link_id uuid,
  transaction_id uuid,
  original_transaction_id uuid,
  transaction_kind text,
  business_kind text,
  transaction_at timestamptz,
  project_id uuid,
  order_id uuid,
  allocated_amount numeric,
  allocated_base_amount numeric,
  linked_operating_income_base numeric,
  linked_operating_expense_base numeric,
  linked_cash_delta_base numeric,
  linked_other_cash_base numeric,
  unconverted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();

  return query
  with base_links as (
    select
      l.id as link_id,
      t.id as transaction_id,
      t.reversal_of_transaction_id as original_transaction_id,
      t.transaction_kind,
      case when t.transaction_kind = 'reversal' then original.transaction_kind else t.transaction_kind end as business_kind,
      t.transaction_at,
      l.project_id,
      l.order_id,
      l.allocated_amount,
      case
        when t.base_amount is null or t.amount <= 0 then null::numeric
        else round(l.allocated_amount / t.amount * t.base_amount,4)
      end as allocated_base_amount,
      case when t.transaction_kind = 'reversal' then -1::numeric else 1::numeric end as classification_sign,
      t.source_account_id,
      t.destination_account_id,
      (t.base_amount is null or t.amount <= 0) as unconverted
    from public.finance_transaction_links l
    join public.finance_transactions t on t.id = l.transaction_id
    left join public.finance_transactions original on original.id = t.reversal_of_transaction_id
    where t.status = 'posted'
      and (l.project_id is not null or l.order_id is not null)
      and (p_from is null or t.transaction_at::date >= p_from)
      and (p_to is null or t.transaction_at::date <= p_to)
  ), calculated as (
    select
      b.*,
      case
        when b.unconverted then null::numeric
        when b.source_account_id is not null and b.destination_account_id is null then -b.allocated_base_amount
        when b.destination_account_id is not null and b.source_account_id is null then b.allocated_base_amount
        else 0::numeric
      end as cash_delta,
      case
        when b.unconverted then null::numeric
        when b.business_kind = 'customer_receipt' then b.classification_sign * b.allocated_base_amount
        else 0::numeric
      end as income_base,
      case
        when b.unconverted then null::numeric
        when b.business_kind in ('expense','vendor_payment','employee_payment') then b.classification_sign * b.allocated_base_amount
        else 0::numeric
      end as expense_base
    from base_links b
  )
  select
    c.link_id,
    c.transaction_id,
    c.original_transaction_id,
    c.transaction_kind,
    c.business_kind,
    c.transaction_at,
    c.project_id,
    c.order_id,
    c.allocated_amount,
    c.allocated_base_amount,
    c.income_base,
    c.expense_base,
    c.cash_delta,
    case
      when c.unconverted then null::numeric
      else c.cash_delta - c.income_base + c.expense_base
    end,
    c.unconverted
  from calculated c;
end;
$function$;

create or replace function private.get_finance_project_actuals_page(
  p_from date default null,
  p_to date default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null
)
returns table(
  project_id uuid,
  project_number text,
  project_name text,
  project_status text,
  customer_id uuid,
  customer_code text,
  customer_name text,
  base_currency_code varchar(3),
  linked_operating_income_base numeric,
  linked_operating_expense_base numeric,
  linked_other_cash_base numeric,
  linked_net_cash_base numeric,
  linked_transaction_count bigint,
  linked_order_count bigint,
  unconverted_allocation_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base varchar(3);
begin
  perform private.finance_assert_view();
  v_base := private.finance_base_currency();

  return query
  with allocation_rollup as (
    select
      lp.project_id,
      coalesce(sum(lp.linked_operating_income_base),0) as income,
      coalesce(sum(lp.linked_operating_expense_base),0) as expense,
      coalesce(sum(lp.linked_other_cash_base),0) as other_cash,
      coalesce(sum(lp.linked_cash_delta_base),0) as net_cash,
      count(distinct lp.transaction_id) as transaction_count,
      count(distinct lp.order_id) filter (where lp.order_id is not null) as order_count,
      count(*) filter (where lp.unconverted) as unconverted_count
    from private.finance_reporting_link_projection(p_from,p_to) lp
    where lp.project_id is not null
    group by lp.project_id
  )
  select
    p.id,
    p.project_number,
    p.name,
    p.status,
    p.customer_id,
    c.customer_code,
    c.name,
    v_base,
    case when coalesce(r.unconverted_count,0) > 0 then null else round(coalesce(r.income,0),4) end,
    case when coalesce(r.unconverted_count,0) > 0 then null else round(coalesce(r.expense,0),4) end,
    case when coalesce(r.unconverted_count,0) > 0 then null else round(coalesce(r.other_cash,0),4) end,
    case when coalesce(r.unconverted_count,0) > 0 then null else round(coalesce(r.net_cash,0),4) end,
    coalesce(r.transaction_count,0),
    coalesce(r.order_count,0),
    coalesce(r.unconverted_count,0),
    count(*) over()
  from public.customer_projects p
  left join public.customers c on c.id = p.customer_id
  left join allocation_rollup r on r.project_id = p.id
  where nullif(btrim(coalesce(p_search,'')),'') is null
     or coalesce(p.project_number,'') ilike '%' || btrim(p_search) || '%'
     or coalesce(p.name,'') ilike '%' || btrim(p_search) || '%'
     or coalesce(c.customer_code,'') ilike '%' || btrim(p_search) || '%'
     or coalesce(c.name,'') ilike '%' || btrim(p_search) || '%'
  order by p.updated_at desc,p.id desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.get_project_finance_actuals(
  p_project_id uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base varchar(3);
  v_project public.customer_projects%rowtype;
  v_customer_code text;
  v_customer_name text;
  v_income numeric;
  v_expense numeric;
  v_other numeric;
  v_net numeric;
  v_transactions bigint;
  v_orders bigint;
  v_unconverted bigint;
  v_order_actuals jsonb;
begin
  perform private.finance_assert_view();
  if p_project_id is null then
    raise exception 'Project is required.' using errcode = '22023';
  end if;

  select * into v_project from public.customer_projects p where p.id = p_project_id;
  if v_project.id is null then
    raise exception 'Project was not found.' using errcode = 'P0002';
  end if;

  select c.customer_code,c.name into v_customer_code,v_customer_name
  from public.customers c where c.id = v_project.customer_id;
  v_base := private.finance_base_currency();

  select
    coalesce(sum(lp.linked_operating_income_base),0),
    coalesce(sum(lp.linked_operating_expense_base),0),
    coalesce(sum(lp.linked_other_cash_base),0),
    coalesce(sum(lp.linked_cash_delta_base),0),
    count(distinct lp.transaction_id),
    count(distinct lp.order_id) filter (where lp.order_id is not null),
    count(*) filter (where lp.unconverted)
  into v_income,v_expense,v_other,v_net,v_transactions,v_orders,v_unconverted
  from private.finance_reporting_link_projection(p_from,p_to) lp
  where lp.project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', q.order_id,
    'order_number', o.order_number,
    'operating_income_base', case when q.unconverted_count > 0 then null else round(q.income,4) end,
    'operating_expense_base', case when q.unconverted_count > 0 then null else round(q.expense,4) end,
    'other_cash_base', case when q.unconverted_count > 0 then null else round(q.other_cash,4) end,
    'net_cash_base', case when q.unconverted_count > 0 then null else round(q.net_cash,4) end,
    'transaction_count', q.transaction_count,
    'unconverted_allocation_count', q.unconverted_count
  ) order by o.order_number,q.order_id),'[]'::jsonb)
  into v_order_actuals
  from (
    select
      lp.order_id,
      coalesce(sum(lp.linked_operating_income_base),0) as income,
      coalesce(sum(lp.linked_operating_expense_base),0) as expense,
      coalesce(sum(lp.linked_other_cash_base),0) as other_cash,
      coalesce(sum(lp.linked_cash_delta_base),0) as net_cash,
      count(distinct lp.transaction_id) as transaction_count,
      count(*) filter (where lp.unconverted) as unconverted_count
    from private.finance_reporting_link_projection(p_from,p_to) lp
    where lp.project_id = p_project_id and lp.order_id is not null
    group by lp.order_id
  ) q
  left join public.customer_orders o on o.id = q.order_id;

  return jsonb_build_object(
    'project_id', v_project.id,
    'project_number', v_project.project_number,
    'project_name', v_project.name,
    'project_status', v_project.status,
    'customer_id', v_project.customer_id,
    'customer_code', v_customer_code,
    'customer_name', v_customer_name,
    'base_currency_code', v_base,
    'from_date', p_from,
    'to_date', p_to,
    'linked_operating_income_base', case when v_unconverted > 0 then null else round(v_income,4) end,
    'linked_operating_expense_base', case when v_unconverted > 0 then null else round(v_expense,4) end,
    'linked_other_cash_base', case when v_unconverted > 0 then null else round(v_other,4) end,
    'linked_net_cash_base', case when v_unconverted > 0 then null else round(v_net,4) end,
    'linked_transaction_count', v_transactions,
    'linked_order_count', v_orders,
    'unconverted_allocation_count', v_unconverted,
    'orders', v_order_actuals
  );
end;
$function$;

create or replace function public.get_finance_reporting_summary(
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_finance_reporting_summary($1,$2);
$function$;

create or replace function public.get_finance_cash_flow_series(
  p_from date default null,
  p_to date default null,
  p_grain text default 'month'
)
returns table(
  period_start date,
  base_currency_code varchar(3),
  operating_income_base numeric,
  operating_expense_base numeric,
  operating_result_base numeric,
  other_cash_inflow_base numeric,
  other_cash_outflow_base numeric,
  net_cash_change_base numeric,
  posted_event_count bigint,
  unconverted_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_finance_cash_flow_series($1,$2,$3);
$function$;

create or replace function public.get_finance_account_movements_page(
  p_from date default null,
  p_to date default null,
  p_account_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  transaction_id uuid,
  original_transaction_id uuid,
  transaction_kind text,
  business_kind text,
  transaction_at timestamptz,
  account_id uuid,
  account_name text,
  counter_account_id uuid,
  counter_account_name text,
  amount numeric,
  currency_code varchar(3),
  account_delta_amount numeric,
  base_currency_code varchar(3),
  base_amount numeric,
  account_delta_base numeric,
  reference_no text,
  notes text,
  unconverted boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_finance_account_movements_page($1,$2,$3,$4,$5);
$function$;

create or replace function public.get_finance_project_actuals_page(
  p_from date default null,
  p_to date default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null
)
returns table(
  project_id uuid,
  project_number text,
  project_name text,
  project_status text,
  customer_id uuid,
  customer_code text,
  customer_name text,
  base_currency_code varchar(3),
  linked_operating_income_base numeric,
  linked_operating_expense_base numeric,
  linked_other_cash_base numeric,
  linked_net_cash_base numeric,
  linked_transaction_count bigint,
  linked_order_count bigint,
  unconverted_allocation_count bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_finance_project_actuals_page($1,$2,$3,$4,$5);
$function$;

create or replace function public.get_project_finance_actuals(
  p_project_id uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_project_finance_actuals($1,$2,$3);
$function$;

revoke all on function private.finance_reporting_transaction_projection(date,date) from public, anon, authenticated;
revoke all on function private.get_finance_reporting_summary(date,date) from public, anon, authenticated;
revoke all on function private.get_finance_cash_flow_series(date,date,text) from public, anon, authenticated;
revoke all on function private.get_finance_account_movements_page(date,date,uuid,integer,integer) from public, anon, authenticated;
revoke all on function private.finance_reporting_link_projection(date,date) from public, anon, authenticated;
revoke all on function private.get_finance_project_actuals_page(date,date,integer,integer,text) from public, anon, authenticated;
revoke all on function private.get_project_finance_actuals(uuid,date,date) from public, anon, authenticated;

revoke execute on function public.get_finance_reporting_summary(date,date) from public, anon;
revoke execute on function public.get_finance_cash_flow_series(date,date,text) from public, anon;
revoke execute on function public.get_finance_account_movements_page(date,date,uuid,integer,integer) from public, anon;
revoke execute on function public.get_finance_project_actuals_page(date,date,integer,integer,text) from public, anon;
revoke execute on function public.get_project_finance_actuals(uuid,date,date) from public, anon;

revoke execute on function public.get_finance_reporting_summary(date,date) from authenticated;
revoke execute on function public.get_finance_cash_flow_series(date,date,text) from authenticated;
revoke execute on function public.get_finance_account_movements_page(date,date,uuid,integer,integer) from authenticated;
revoke execute on function public.get_finance_project_actuals_page(date,date,integer,integer,text) from authenticated;
revoke execute on function public.get_project_finance_actuals(uuid,date,date) from authenticated;

grant execute on function public.get_finance_reporting_summary(date,date) to authenticated;
grant execute on function public.get_finance_cash_flow_series(date,date,text) to authenticated;
grant execute on function public.get_finance_account_movements_page(date,date,uuid,integer,integer) to authenticated;
grant execute on function public.get_finance_project_actuals_page(date,date,integer,integer,text) to authenticated;
grant execute on function public.get_project_finance_actuals(uuid,date,date) to authenticated;

notify pgrst, 'reload schema';
