-- Project Financial Summary hardening.
-- Uses the shared per-line profitability projection from 20260911120100.

create or replace function private.get_customer_project_financial_summary(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
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
      upper(o.currency_code::text) as currency_code,
      coalesce(o.customer_visible_sell_amount, 0::numeric) as net_sales
    from public.customer_orders o
    where o.project_id = p_project_id
      and o.status <> 'cancelled'
  ),
  item_lines as (
    select l.*
    from private.v_profitability_order_lines l
    where l.project_id = p_project_id
      and l.order_status <> 'cancelled'
  ),
  direct_cost_rows as (
    select d.*
    from private.v_project_direct_costs d
    where d.project_id = p_project_id
      and d.current_status <> 'cancelled'
  ),
  invoice_rows as (
    select
      upper(i.currency_code::text) as currency_code,
      coalesce(i.total_amount, 0::numeric) as total_amount,
      coalesce(i.paid_amount, 0::numeric) as paid_amount
    from public.customer_invoices i
    join active_orders o on o.id = i.order_id
    where i.status in ('issued', 'partially_paid', 'paid', 'overdue')
  ),
  currency_sources as (
    select o.currency_code from active_orders o
    union all
    select il.cost_currency from item_lines il where il.cost_currency is not null
    union all
    select dcr.currency_code from direct_cost_rows dcr
    union all
    select ir.currency_code from invoice_rows ir
  ),
  currency_state as (
    select
      coalesce(
        (select min(cs.currency_code) from currency_sources cs),
        (select s.default_currency from settings s),
        'USD'
      ) as currency_code,
      (select count(distinct cs.currency_code) from currency_sources cs) > 1 as mixed_currency
  ),
  totals as (
    select
      coalesce((select sum(o.net_sales) from active_orders o), 0::numeric) as total_sales,
      coalesce((select sum(case when not il.missing_cost then il.quantity * il.unit_cost else 0::numeric end) from item_lines il), 0::numeric) as known_product_cost,
      coalesce((select sum(dcr.direct_cost) from direct_cost_rows dcr), 0::numeric) as direct_project_cost,
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
  item_category_rollup as (
    select
      il.financial_category,
      coalesce(sum(il.line_revenue), 0::numeric) as total_sales,
      coalesce(sum(case when not il.missing_cost then il.quantity * il.unit_cost else 0::numeric end), 0::numeric) as known_cost,
      count(*) filter (where il.missing_cost)::bigint as missing_cost_lines
    from item_lines il
    group by il.financial_category
  ),
  direct_category_rollup as (
    select
      dcr.financial_category,
      coalesce(sum(dcr.direct_cost), 0::numeric) as direct_cost
    from direct_cost_rows dcr
    group by dcr.financial_category
  ),
  category_rollup as (
    select
      cn.financial_category,
      cn.sort_order,
      coalesce(icr.total_sales, 0::numeric) as total_sales,
      coalesce(icr.known_cost, 0::numeric) as known_cost,
      coalesce(dcr.direct_cost, 0::numeric) as direct_project_cost,
      coalesce(icr.missing_cost_lines, 0)::bigint as missing_cost_lines
    from category_names cn
    left join item_category_rollup icr on icr.financial_category = cn.financial_category
    left join direct_category_rollup dcr on dcr.financial_category = cn.financial_category
  ),
  category_json as (
    select jsonb_agg(
      jsonb_build_object(
        'category', cr.financial_category,
        'total_sales', case when cs.mixed_currency then null else round(cr.total_sales, 2) end,
        'product_cogs', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.known_cost, 2) end,
        'direct_project_cost', case when cs.mixed_currency then null else round(cr.direct_project_cost, 2) end,
        'total_cost', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 then null
          else round(cr.known_cost + cr.direct_project_cost, 2)
        end,
        'gross_profit', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 then null
          else round(cr.total_sales - cr.known_cost - cr.direct_project_cost, 2)
        end,
        'gross_margin_percent', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 or cr.total_sales <= 0 then null
          else round(((cr.total_sales - cr.known_cost - cr.direct_project_cost) / cr.total_sales) * 100::numeric, 2)
        end,
        'markup_percent', case
          when cs.mixed_currency or cr.missing_cost_lines > 0 or (cr.known_cost + cr.direct_project_cost) <= 0 then null
          else round(((cr.total_sales - cr.known_cost - cr.direct_project_cost) / (cr.known_cost + cr.direct_project_cost)) * 100::numeric, 2)
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
    'product_cogs', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.known_product_cost, 2) end,
    'direct_project_cost', case when cs.mixed_currency then null else round(t.direct_project_cost, 2) end,
    'total_cost', case
      when cs.mixed_currency or t.missing_cost_lines > 0 then null
      else round(t.known_product_cost + t.direct_project_cost, 2)
    end,
    'gross_profit', case
      when cs.mixed_currency or t.missing_cost_lines > 0 then null
      else round(t.total_sales - t.known_product_cost - t.direct_project_cost, 2)
    end,
    'gross_margin_percent', case
      when cs.mixed_currency or t.missing_cost_lines > 0 or t.total_sales <= 0 then null
      else round(((t.total_sales - t.known_product_cost - t.direct_project_cost) / t.total_sales) * 100::numeric, 2)
    end,
    'markup_percent', case
      when cs.mixed_currency or t.missing_cost_lines > 0 or (t.known_product_cost + t.direct_project_cost) <= 0 then null
      else round(((t.total_sales - t.known_product_cost - t.direct_project_cost) / (t.known_product_cost + t.direct_project_cost)) * 100::numeric, 2)
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

revoke all on function private.get_customer_project_financial_summary(uuid) from public, anon;
grant execute on function private.get_customer_project_financial_summary(uuid) to authenticated, service_role;

create or replace function public.get_customer_project_financial_summary(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, private
as $$
  select private.get_customer_project_financial_summary($1);
$$;

revoke all on function public.get_customer_project_financial_summary(uuid) from public, anon;
grant execute on function public.get_customer_project_financial_summary(uuid) to authenticated, service_role;

comment on function private.get_customer_project_financial_summary(uuid) is
  'Project financial rollup using customer-visible pre-tax revenue, frozen/live Cost product COGS, fail-closed missing cost, and fixed Contractor direct Project cost.';
