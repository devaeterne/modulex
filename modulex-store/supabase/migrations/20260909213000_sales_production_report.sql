-- Sales & Production report read model.
-- Order/job grain preserves legacy and Project-linked orders without inventing Project rows.
-- Financial access is restricted to Super Admin, Admin and Finance via Finance view authorization.
-- Revenue uses canonical pre-tax customer-visible sell truth. Receivable balance uses issued Invoice truth;
-- ledger-managed Invoice paid_amount is already synchronized by the Project payment ledger.

create or replace function private.get_sales_production_report(
  p_from date default null,
  p_to date default null,
  p_sales_rep_id uuid default null,
  p_material text default null,
  p_location text default null,
  p_payment_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_payment_status text := nullif(lower(btrim(coalesce(p_payment_status, ''))), '');
  v_material text := nullif(btrim(coalesce(p_material, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
begin
  perform private.finance_assert_view();

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Sales & Production report from date cannot be after to date.' using errcode = '22023';
  end if;

  if v_payment_status is not null and v_payment_status not in ('not_invoiced', 'open', 'partially_paid', 'overdue', 'paid') then
    raise exception 'Unsupported Sales & Production payment status.' using errcode = '22023';
  end if;

  with
  countertop_rows as (
    select
      cc.order_id,
      cc.sqft,
      nullif(btrim(st.name), '') as stone_type,
      nullif(btrim(p.name), '') as stone_name
    from public.countertop_configurations cc
    left join public.countertop_stone_product_profiles sp on sp.product_id = cc.stone_product_id
    left join public.countertop_stone_types st on st.id = sp.stone_type_id
    left join public.products p on p.id = cc.stone_product_id
  ),
  countertop_rollup as (
    select
      cr.order_id,
      round(coalesce(sum(cr.sqft), 0), 2) as sqft,
      coalesce(array_agg(distinct cr.stone_type order by cr.stone_type) filter (where cr.stone_type is not null), array[]::text[]) as material_types,
      coalesce(array_agg(distinct cr.stone_name order by cr.stone_name) filter (where cr.stone_name is not null), array[]::text[]) as material_names
    from countertop_rows cr
    group by cr.order_id
  ),
  invoice_rollup as (
    select
      i.order_id,
      count(*) as invoice_count,
      count(distinct upper(i.currency_code::text)) as invoice_currency_count,
      min(upper(i.currency_code::text)) as invoice_currency_code,
      round(coalesce(sum(i.total_amount), 0), 2) as invoiced_amount,
      round(coalesce(sum(i.paid_amount), 0), 2) as paid_amount,
      round(coalesce(sum(greatest(i.total_amount - i.paid_amount, 0::numeric)), 0), 2) as open_balance,
      round(coalesce(sum(greatest(i.total_amount - i.paid_amount, 0::numeric)) filter (
        where i.status = 'overdue' or (i.due_date is not null and i.due_date < current_date and i.status in ('issued', 'partially_paid'))
      ), 0), 2) as overdue_balance
    from public.customer_invoices i
    where i.status in ('issued', 'partially_paid', 'paid', 'overdue')
    group by i.order_id
  ),
  order_source as (
    select
      o.id as order_id,
      o.order_number,
      o.order_date,
      o.status as order_status,
      upper(o.currency_code::text) as currency_code,
      coalesce(
        o.customer_visible_sell_amount,
        o.base_sell_amount,
        greatest(coalesce(o.subtotal, 0::numeric) - coalesce(o.discount_amount, 0::numeric), 0::numeric)
      ) as sales_amount,
      o.project_id,
      cp.project_number,
      cp.name as project_name,
      c.id as customer_id,
      c.customer_code,
      c.name as customer_name,
      coalesce(cp.sales_rep_id, c.sales_rep_id) as sales_rep_id,
      coalesce(
        nullif(btrim(cp.project_address_snapshot->>'city'), ''),
        nullif(btrim(o.shipping_address_snapshot->>'city'), ''),
        nullif(btrim(o.billing_address_snapshot->>'city'), ''),
        'Unspecified'
      ) as city,
      coalesce(
        nullif(btrim(cp.project_address_snapshot->>'state_region'), ''),
        nullif(btrim(o.shipping_address_snapshot->>'state_region'), ''),
        nullif(btrim(o.billing_address_snapshot->>'state_region'), ''),
        ''
      ) as state_region
    from public.customer_orders o
    join public.customers c on c.id = o.customer_id
    left join public.customer_projects cp on cp.id = o.project_id
    where o.status <> 'cancelled'
      and (p_from is null or o.order_date >= p_from)
      and (p_to is null or o.order_date <= p_to)
  ),
  period_orders as (
    select
      os.order_id,
      os.order_number,
      os.order_date,
      os.order_status,
      os.currency_code,
      round(coalesce(os.sales_amount, 0), 2) as sales_amount,
      os.project_id,
      os.project_number,
      os.project_name,
      os.customer_id,
      os.customer_code,
      os.customer_name,
      os.sales_rep_id,
      coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.email), ''), 'Unassigned') as salesperson_name,
      case
        when os.city = 'Unspecified' then 'Unspecified'
        when nullif(os.state_region, '') is null then os.city
        else os.city || ', ' || os.state_region
      end as location_label,
      coalesce(ct.sqft, 0::numeric) as sqft,
      coalesce(ct.material_types, array[]::text[]) as material_types,
      coalesce(ct.material_names, array[]::text[]) as material_names,
      coalesce(ir.invoice_count, 0)::bigint as invoice_count,
      coalesce(ir.invoiced_amount, 0::numeric) as invoiced_amount,
      coalesce(ir.paid_amount, 0::numeric) as paid_amount,
      coalesce(ir.open_balance, 0::numeric) as open_balance,
      coalesce(ir.overdue_balance, 0::numeric) as overdue_balance,
      case
        when coalesce(ir.invoice_count, 0) = 0 then 'not_invoiced'
        when coalesce(ir.overdue_balance, 0) > 0 then 'overdue'
        when coalesce(ir.open_balance, 0) > 0 and coalesce(ir.paid_amount, 0) > 0 then 'partially_paid'
        when coalesce(ir.open_balance, 0) > 0 then 'open'
        else 'paid'
      end as payment_status,
      (
        coalesce(ir.invoice_currency_count, 0) > 1
        or (ir.invoice_currency_code is not null and ir.invoice_currency_code is distinct from os.currency_code)
      ) as invoice_currency_mismatch
    from order_source os
    left join public.profiles pr on pr.id = os.sales_rep_id
    left join countertop_rollup ct on ct.order_id = os.order_id
    left join invoice_rollup ir on ir.order_id = os.order_id
  ),
  filtered_orders as (
    select po.*
    from period_orders po
    where (p_sales_rep_id is null or po.sales_rep_id = p_sales_rep_id)
      and (
        v_material is null
        or exists (
          select 1
          from unnest(po.material_types) mt
          where lower(mt) = lower(v_material)
        )
      )
      and (v_location is null or lower(po.location_label) = lower(v_location))
      and (v_payment_status is null or po.payment_status = v_payment_status)
  ),
  summary_totals as (
    select
      count(*)::bigint as jobs,
      round(coalesce(sum(fo.sqft), 0), 2) as sqft,
      round(coalesce(sum(fo.sales_amount), 0), 2) as sales,
      round(coalesce(sum(fo.open_balance), 0), 2) as open_balance,
      count(*) filter (where fo.open_balance > 0)::bigint as jobs_with_balance,
      count(*) filter (
        where fo.overdue_balance > 0
           or fo.open_balance > 0
           or fo.sales_rep_id is null
           or fo.location_label = 'Unspecified'
      )::bigint as needs_attention,
      count(distinct fo.currency_code)::integer as order_currency_count,
      coalesce(bool_or(fo.invoice_currency_mismatch), false) as invoice_currency_mismatch,
      min(fo.currency_code) as only_currency
    from filtered_orders fo
  ),
  company_currency as (
    select coalesce(
      (select upper(gs.default_currency::text) from public.general_settings gs order by gs.id limit 1),
      'USD'
    ) as default_currency
  ),
  currency_state as (
    select
      coalesce(st.only_currency, cc.default_currency) as currency_code,
      (st.order_currency_count > 1 or st.invoice_currency_mismatch) as mixed_currency
    from summary_totals st
    cross join company_currency cc
  ),
  trend as (
    select
      date_trunc('month', fo.order_date)::date as period_start,
      count(*)::bigint as jobs,
      round(coalesce(sum(fo.sqft), 0), 2) as sqft,
      count(distinct fo.currency_code)::integer as currency_count,
      min(fo.currency_code) as currency_code,
      round(coalesce(sum(fo.sales_amount), 0), 2) as sales
    from filtered_orders fo
    group by date_trunc('month', fo.order_date)::date
  ),
  salesperson_rollup as (
    select
      fo.sales_rep_id,
      fo.salesperson_name,
      count(*)::bigint as jobs,
      round(coalesce(sum(fo.sqft), 0), 2) as sqft,
      count(distinct fo.currency_code)::integer as currency_count,
      min(fo.currency_code) as currency_code,
      round(coalesce(sum(fo.sales_amount), 0), 2) as sales,
      round(coalesce(sum(fo.open_balance), 0), 2) as open_balance
    from filtered_orders fo
    group by fo.sales_rep_id, fo.salesperson_name
  ),
  location_rollup as (
    select
      fo.location_label,
      count(*)::bigint as jobs,
      round(coalesce(sum(fo.sqft), 0), 2) as sqft,
      count(distinct fo.currency_code)::integer as currency_count,
      min(fo.currency_code) as currency_code,
      round(coalesce(sum(fo.sales_amount), 0), 2) as sales,
      round(coalesce(sum(fo.open_balance), 0), 2) as open_balance
    from filtered_orders fo
    group by fo.location_label
  ),
  payment_rollup as (
    select
      fo.payment_status,
      count(*)::bigint as jobs,
      count(distinct fo.currency_code)::integer as currency_count,
      min(fo.currency_code) as currency_code,
      round(coalesce(sum(fo.open_balance), 0), 2) as open_balance
    from filtered_orders fo
    group by fo.payment_status
  ),
  material_rollup as (
    select
      coalesce(cr.stone_type, 'Unspecified') as material,
      count(distinct fo.order_id)::bigint as jobs,
      round(coalesce(sum(cr.sqft), 0), 2) as sqft
    from filtered_orders fo
    join countertop_rows cr on cr.order_id = fo.order_id
    group by coalesce(cr.stone_type, 'Unspecified')
  ),
  attention_rows as (
    select fo.*
    from filtered_orders fo
    where fo.overdue_balance > 0
       or fo.open_balance > 0
       or fo.sales_rep_id is null
       or fo.location_label = 'Unspecified'
    order by (fo.overdue_balance > 0) desc, fo.overdue_balance desc, fo.open_balance desc, fo.order_date desc, fo.order_number desc
    limit 25
  ),
  page_rows as (
    select fo.*
    from filtered_orders fo
    order by fo.order_date desc, fo.order_number desc, fo.order_id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'from_date', p_from,
    'to_date', p_to,
    'summary', jsonb_build_object(
      'currency_code', cs.currency_code,
      'mixed_currency', cs.mixed_currency,
      'sales', case when cs.mixed_currency then null else st.sales end,
      'jobs', st.jobs,
      'sqft', st.sqft,
      'avg_ticket', case when cs.mixed_currency or st.jobs = 0 then null else round(st.sales / st.jobs, 2) end,
      'open_balance', case when cs.mixed_currency then null else st.open_balance end,
      'jobs_with_balance', st.jobs_with_balance,
      'needs_attention', st.needs_attention
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_start', t.period_start,
        'jobs', t.jobs,
        'sqft', t.sqft,
        'currency_code', coalesce(t.currency_code, cs.currency_code),
        'sales', case when t.currency_count > 1 then null else t.sales end,
        'mixed_currency', t.currency_count > 1
      ) order by t.period_start)
      from trend t
    ), '[]'::jsonb),
    'salespeople', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sales_rep_id', sr.sales_rep_id,
        'salesperson_name', sr.salesperson_name,
        'jobs', sr.jobs,
        'sqft', sr.sqft,
        'currency_code', coalesce(sr.currency_code, cs.currency_code),
        'sales', case when sr.currency_count > 1 then null else sr.sales end,
        'open_balance', case when sr.currency_count > 1 then null else sr.open_balance end,
        'mixed_currency', sr.currency_count > 1
      ) order by sr.sales desc nulls last, sr.salesperson_name)
      from salesperson_rollup sr
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'material', mr.material,
        'jobs', mr.jobs,
        'sqft', mr.sqft
      ) order by mr.sqft desc, mr.material)
      from material_rollup mr
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'location', lr.location_label,
        'jobs', lr.jobs,
        'sqft', lr.sqft,
        'currency_code', coalesce(lr.currency_code, cs.currency_code),
        'sales', case when lr.currency_count > 1 then null else lr.sales end,
        'open_balance', case when lr.currency_count > 1 then null else lr.open_balance end,
        'mixed_currency', lr.currency_count > 1
      ) order by lr.sales desc nulls last, lr.location_label)
      from location_rollup lr
    ), '[]'::jsonb),
    'payment_statuses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', pr.payment_status,
        'jobs', pr.jobs,
        'currency_code', coalesce(pr.currency_code, cs.currency_code),
        'open_balance', case when pr.currency_count > 1 then null else pr.open_balance end,
        'mixed_currency', pr.currency_count > 1
      ) order by case pr.payment_status
        when 'overdue' then 1
        when 'partially_paid' then 2
        when 'open' then 3
        when 'not_invoiced' then 4
        when 'paid' then 5
        else 6
      end)
      from payment_rollup pr
    ), '[]'::jsonb),
    'attention', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_id', ar.order_id,
        'order_number', ar.order_number,
        'order_date', ar.order_date,
        'customer_name', ar.customer_name,
        'salesperson_name', ar.salesperson_name,
        'location', ar.location_label,
        'payment_status', ar.payment_status,
        'currency_code', ar.currency_code,
        'open_balance', ar.open_balance,
        'overdue_balance', ar.overdue_balance,
        'reasons', to_jsonb(array_remove(array[
          case when ar.overdue_balance > 0 then 'Overdue receivable' end,
          case when ar.open_balance > 0 and ar.overdue_balance <= 0 then 'Open receivable' end,
          case when ar.sales_rep_id is null then 'Salesperson unassigned' end,
          case when ar.location_label = 'Unspecified' then 'Location missing' end
        ]::text[], null))
      ) order by (ar.overdue_balance > 0) desc, ar.overdue_balance desc, ar.open_balance desc, ar.order_date desc)
      from attention_rows ar
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_id', r.order_id,
        'order_number', r.order_number,
        'order_date', r.order_date,
        'order_status', r.order_status,
        'project_id', r.project_id,
        'project_number', r.project_number,
        'project_name', r.project_name,
        'customer_id', r.customer_id,
        'customer_code', r.customer_code,
        'customer_name', r.customer_name,
        'sales_rep_id', r.sales_rep_id,
        'salesperson_name', r.salesperson_name,
        'location', r.location_label,
        'currency_code', r.currency_code,
        'sales_amount', r.sales_amount,
        'sqft', r.sqft,
        'material_types', to_jsonb(r.material_types),
        'material_names', to_jsonb(r.material_names),
        'invoice_count', r.invoice_count,
        'invoiced_amount', r.invoiced_amount,
        'paid_amount', r.paid_amount,
        'open_balance', r.open_balance,
        'overdue_balance', r.overdue_balance,
        'payment_status', r.payment_status,
        'needs_attention', (
          r.overdue_balance > 0 or r.open_balance > 0 or r.sales_rep_id is null or r.location_label = 'Unspecified'
        )
      ) order by r.order_date desc, r.order_number desc, r.order_id desc)
      from page_rows r
    ), '[]'::jsonb),
    'total_count', (select count(*) from filtered_orders),
    'filter_options', jsonb_build_object(
      'salespeople', coalesce((
        select jsonb_agg(jsonb_build_object('id', q.sales_rep_id, 'name', q.salesperson_name) order by q.salesperson_name)
        from (
          select distinct po.sales_rep_id, po.salesperson_name
          from period_orders po
          where po.sales_rep_id is not null
        ) q
      ), '[]'::jsonb),
      'materials', coalesce((
        select jsonb_agg(q.material order by q.material)
        from (
          select distinct mt as material
          from period_orders po
          cross join lateral unnest(po.material_types) mt
        ) q
      ), '[]'::jsonb),
      'locations', coalesce((
        select jsonb_agg(q.location_label order by q.location_label)
        from (select distinct po.location_label from period_orders po) q
      ), '[]'::jsonb),
      'payment_statuses', coalesce((
        select jsonb_agg(q.payment_status order by q.payment_status)
        from (select distinct po.payment_status from period_orders po) q
      ), '[]'::jsonb)
    )
  )
  into v_result
  from summary_totals st
  cross join currency_state cs;

  return v_result;
end;
$function$;

create or replace function public.get_sales_production_report(
  p_from date default null,
  p_to date default null,
  p_sales_rep_id uuid default null,
  p_material text default null,
  p_location text default null,
  p_payment_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_sales_production_report($1, $2, $3, $4, $5, $6, $7, $8);
$function$;

revoke all on function private.get_sales_production_report(date, date, uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_sales_production_report(date, date, uuid, text, text, text, integer, integer) from public, anon;
revoke execute on function public.get_sales_production_report(date, date, uuid, text, text, text, integer, integer) from authenticated;
grant execute on function public.get_sales_production_report(date, date, uuid, text, text, text, integer, integer) to authenticated;

comment on function public.get_sales_production_report(date, date, uuid, text, text, text, integer, integer) is
  'Finance-only Sales & Production report over canonical Orders, Countertop configurations and ledger-synchronized Invoice receivables.';

notify pgrst, 'reload schema';