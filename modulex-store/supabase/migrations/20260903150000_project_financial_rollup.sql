-- PB-2 — Project Financial Rollup
-- Read-only financial projection over canonical Project Orders, current Product Costs,
-- and issued-or-later Customer Invoices. No Project financial totals are persisted here.

-- This raw view exposes internal cost/profitability columns and must not be directly
-- reachable from public/browser roles. PB-2 exposes only the guarded Project RPC below.
revoke all on public.v_order_profitability_current_cost from public, anon, authenticated;
grant select on public.v_order_profitability_current_cost to service_role;

create or replace function public.get_customer_project_financial_summary(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not public.current_user_has_any_role(array['super_admin', 'admin', 'finance']::text[]) then
    raise exception 'You do not have permission to view Project cost and margin data.' using errcode = '42501';
  end if;

  if p_project_id is null
     or not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    raise exception 'Project not found.';
  end if;

  with
  settings as (
    select upper(gs.default_currency::text) as default_currency
    from public.general_settings gs
    order by gs.id
    limit 1
  ),
  active_orders as (
    select
      o.id,
      o.currency_code::text as currency_code,
      greatest(coalesce(o.subtotal, 0::numeric) - coalesce(o.discount_amount, 0::numeric), 0::numeric) as net_sales,
      coalesce(o.subtotal, 0::numeric) as subtotal
    from public.customer_orders o
    where o.project_id = p_project_id
      and o.status <> 'cancelled'
  ),
  current_cost as (
    select distinct on (pc.product_id)
      pc.product_id,
      pc.amount,
      pc.currency_code::text as currency_code
    from public.product_costs pc
    where pc.is_active = true
      and pc.valid_from <= now()
      and (pc.valid_to is null or pc.valid_to > now())
    order by pc.product_id, pc.valid_from desc, pc.created_at desc
  ),
  item_lines as (
    select
      o.id as order_id,
      case
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STANDARD' then 'Cabinet'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STONE' then 'Countertop'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SINK' then 'Sink'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SERVICE' then 'Labor'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'MATERIAL' then 'Material'
        when lower(coalesce(pc.name, '')) = 'cabinet' then 'Cabinet'
        when lower(coalesce(pc.name, '')) in ('stone', 'countertop') then 'Countertop'
        when lower(coalesce(pc.name, '')) = 'sink' then 'Sink'
        when lower(coalesce(pc.name, '')) in ('service', 'labor') then 'Labor'
        when lower(coalesce(pc.name, '')) = 'material' then 'Material'
        else 'Other'
      end as financial_category,
      case
        when o.subtotal > 0::numeric
          then coalesce(oi.line_total, 0::numeric) * (o.net_sales / o.subtotal)
        else 0::numeric
      end as line_net_sales,
      case
        when cc.product_id is not null and upper(cc.currency_code) = upper(o.currency_code)
          then coalesce(oi.quantity, 0::numeric) * cc.amount
        else 0::numeric
      end as known_line_cost,
      (cc.product_id is null or upper(cc.currency_code) <> upper(o.currency_code)) as missing_cost,
      o.currency_code as order_currency,
      cc.currency_code as cost_currency
    from active_orders o
    join public.customer_order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_types pt on pt.id = p.product_type_id
    left join public.product_categories pc on pc.id = p.category_id
    left join current_cost cc on cc.product_id = oi.product_id
  ),
  invoice_rows as (
    select
      i.currency_code::text as currency_code,
      coalesce(i.total_amount, 0::numeric) as total_amount,
      coalesce(i.paid_amount, 0::numeric) as paid_amount
    from public.customer_invoices i
    join active_orders o on o.id = i.order_id
    where i.status in ('issued', 'partially_paid', 'paid', 'overdue')
  ),
  currency_sources as (
    select upper(o.currency_code) as currency_code from active_orders o
    union all
    select upper(il.cost_currency) from item_lines il where il.cost_currency is not null
    union all
    select upper(ir.currency_code) from invoice_rows ir
  ),
  currency_state as (
    select
      coalesce((select min(cs.currency_code) from currency_sources cs), (select s.default_currency from settings), 'USD') as currency_code,
      (select count(distinct cs.currency_code) from currency_sources cs) > 1 as mixed_currency
  ),
  totals as (
    select
      coalesce((select sum(o.net_sales) from active_orders o), 0::numeric) as total_sales,
      coalesce((select sum(il.known_line_cost) from item_lines il), 0::numeric) as known_cost,
      coalesce((select count(*) from item_lines il where il.missing_cost), 0)::bigint as missing_cost_lines,
      coalesce((select sum(ir.total_amount) from invoice_rows ir), 0::numeric) as invoiced,
      coalesce((select sum(ir.paid_amount) from invoice_rows ir), 0::numeric) as paid
  ),
  category_names(financial_category, sort_order) as (
    values
      ('Cabinet'::text, 1),
      ('Countertop'::text, 2),
      ('Sink'::text, 3),
      ('Labor'::text, 4),
      ('Material'::text, 5),
      ('Other'::text, 6)
  ),
  category_rollup as (
    select
      cn.financial_category,
      cn.sort_order,
      coalesce(sum(il.line_net_sales), 0::numeric) as total_sales,
      coalesce(sum(il.known_line_cost), 0::numeric) as known_cost,
      coalesce(count(*) filter (where il.missing_cost), 0)::bigint as missing_cost_lines
    from category_names cn
    left join item_lines il on il.financial_category = cn.financial_category
    group by cn.financial_category, cn.sort_order
  ),
  category_json as (
    select jsonb_agg(
      jsonb_build_object(
        'category', cr.financial_category,
        'total_sales', case when cs.mixed_currency then null else round(cr.total_sales, 2) end,
        'total_cost', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.known_cost, 2) end,
        'gross_profit', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.total_sales - cr.known_cost, 2) end,
        'gross_margin_percent', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 or cr.total_sales <= 0 then null
          else round(((cr.total_sales - cr.known_cost) / cr.total_sales) * 100::numeric, 2)
        end,
        'markup_percent', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 or cr.known_cost <= 0 then null
          else round(((cr.total_sales - cr.known_cost) / cr.known_cost) * 100::numeric, 2)
        end,
        'missing_cost_lines', cr.missing_cost_lines
      )
      order by cr.sort_order
    ) as categories
    from category_rollup cr
    cross join currency_state cs
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'currency_code', cs.currency_code,
    'mixed_currency', cs.mixed_currency,
    'cost_complete', (not cs.mixed_currency and t.missing_cost_lines = 0),
    'missing_cost_lines', t.missing_cost_lines,
    'total_sales', case when cs.mixed_currency then null else round(t.total_sales, 2) end,
    'total_cost', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.known_cost, 2) end,
    'gross_profit', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.total_sales - t.known_cost, 2) end,
    'gross_margin_percent', case
      when cs.mixed_currency or t.missing_cost_lines > 0 or t.total_sales <= 0 then null
      else round(((t.total_sales - t.known_cost) / t.total_sales) * 100::numeric, 2)
    end,
    'markup_percent', case
      when cs.mixed_currency or t.missing_cost_lines > 0 or t.known_cost <= 0 then null
      else round(((t.total_sales - t.known_cost) / t.known_cost) * 100::numeric, 2)
    end,
    'invoiced', case when cs.mixed_currency then null else round(t.invoiced, 2) end,
    'paid', case when cs.mixed_currency then null else round(t.paid, 2) end,
    'balance', case when cs.mixed_currency then null else round(t.invoiced - t.paid, 2) end,
    'categories', coalesce(cj.categories, '[]'::jsonb)
  )
  into v_result
  from totals t
  cross join currency_state cs
  cross join category_json cj;

  return v_result;
end;
$$;

revoke all on function public.get_customer_project_financial_summary(uuid) from public, anon;
grant execute on function public.get_customer_project_financial_summary(uuid) to authenticated, service_role;

comment on function public.get_customer_project_financial_summary(uuid) is
  'PB-2 read-only Project financial rollup. Cost/margin is restricted to Super Admin, Admin, and Finance; mixed currencies and incomplete costs fail closed.';
