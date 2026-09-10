-- Profitability + gross-profit commission hardening.
-- Depends on 20260911120000_cost_price_snapshot_hardening.sql.

-- One canonical per-line accounting projection shared by Project Financial Summary,
-- order profitability and GP-based commission calculations.
create or replace view private.v_profitability_order_lines as
select
  co.id as order_id,
  oi.id as item_id,
  co.project_id,
  co.status as order_status,
  oi.product_id,
  p.category_id as product_category_id,
  upper(co.currency_code::text) as order_currency,
  co.confirmed_at,
  case
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) in ('STANDARD', 'CABINETS') then 'Cabinet'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STONE' then 'Countertop'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SINK' then 'Sink'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'SERVICE' then 'Labor'
    when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'MATERIAL' then 'Material'
    when lower(coalesce(pc.name, '')) = 'cabinet' then 'Cabinet'
    when lower(coalesce(pc.name, '')) in ('stone', 'countertop', 'quartz', 'granite', 'quartzite', 'marble', 'printed quartz') then 'Countertop'
    when lower(coalesce(pc.name, '')) = 'sink' then 'Sink'
    when lower(coalesce(pc.name, '')) in ('service', 'labor') then 'Labor'
    when lower(coalesce(pc.name, '')) = 'material' then 'Material'
    else 'Other'
  end as financial_category,
  case
    when co.subtotal > 0::numeric
      then coalesce(oi.line_total, 0::numeric) *
           (coalesce(co.customer_visible_sell_amount, 0::numeric) / co.subtotal)
    else 0::numeric
  end as line_revenue,
  coalesce(oi.quantity, 0)::numeric as quantity,
  case
    when co.confirmed_at is not null then
      case
        when oi.unit_cost_snapshot is not null
             and upper(coalesce(oi.cost_currency_code, '')) = upper(co.currency_code::text)
          then oi.unit_cost_snapshot
        else null
      end
    else live_cost.amount
  end as unit_cost,
  case
    when co.confirmed_at is not null then upper(oi.cost_currency_code::text)
    else live_cost.currency_code
  end as cost_currency,
  case
    when oi.product_id is null then true
    when co.confirmed_at is not null then
      oi.unit_cost_snapshot is null
      or upper(coalesce(oi.cost_currency_code, '')) <> upper(co.currency_code::text)
    else live_cost.amount is null
  end as missing_cost
from public.customer_orders co
join public.customer_order_items oi on oi.order_id = co.id
left join public.products p on p.id = oi.product_id
left join public.product_types pt on pt.id = p.product_type_id
left join public.product_categories pc on pc.id = p.category_id
left join lateral (
  select
    pp.amount,
    upper(pp.currency_code::text) as currency_code
  from public.product_prices pp
  join public.price_groups pg on pg.id = pp.price_group_id
  where co.confirmed_at is null
    and pp.product_id = oi.product_id
    and upper(pp.currency_code::text) = upper(co.currency_code::text)
    and pg.system_key = 'cost'
    and coalesce(pg.internal_only, false) = true
    and coalesce(pg.is_active, true) = true
    and pp.is_active = true
    and pp.valid_from <= now()
    and (pp.valid_to is null or pp.valid_to > now())
  order by pp.valid_from desc, pp.created_at desc, pp.id desc
  limit 1
) live_cost on true;

revoke all on private.v_profitability_order_lines from public, anon, authenticated;
grant select on private.v_profitability_order_lines to service_role;

-- Fixed Contractor obligations are direct Project cost. They are intentionally kept
-- in the immutable obligation/event ledger, but are not treated as sales commission
-- when profitability is calculated.
create or replace view private.v_project_direct_costs as
select
  ob.id as obligation_id,
  ob.project_id,
  ob.scope_type,
  ob.product_category_id,
  ob.product_id,
  upper(ob.currency_code::text) as currency_code,
  coalesce(ob.flat_amount, ob.base_amount, 0::numeric) as direct_cost,
  coalesce(private.current_project_commission_status(ob.id), 'pending') as current_status,
  case
    when ob.scope_type = 'category' then
      case
        when lower(coalesce(cat.name, '')) = 'cabinet' then 'Cabinet'
        when lower(coalesce(cat.name, '')) in ('stone', 'countertop', 'quartz', 'granite', 'quartzite', 'marble', 'printed quartz') then 'Countertop'
        when lower(coalesce(cat.name, '')) = 'sink' then 'Sink'
        when lower(coalesce(cat.name, '')) in ('service', 'labor') then 'Labor'
        when lower(coalesce(cat.name, '')) = 'material' then 'Material'
        else 'Other'
      end
    when ob.scope_type = 'product' then
      case
        when upper(coalesce(pt.code, '')) in ('STANDARD', 'CABINETS') then 'Cabinet'
        when upper(coalesce(pt.code, '')) = 'STONE' then 'Countertop'
        when upper(coalesce(pt.code, '')) = 'SINK' then 'Sink'
        when upper(coalesce(pt.code, '')) = 'SERVICE' then 'Labor'
        when upper(coalesce(pt.code, '')) = 'MATERIAL' then 'Material'
        when lower(coalesce(cat2.name, '')) = 'cabinet' then 'Cabinet'
        when lower(coalesce(cat2.name, '')) in ('stone', 'countertop', 'quartz', 'granite', 'quartzite', 'marble', 'printed quartz') then 'Countertop'
        when lower(coalesce(cat2.name, '')) = 'sink' then 'Sink'
        when lower(coalesce(cat2.name, '')) in ('service', 'labor') then 'Labor'
        when lower(coalesce(cat2.name, '')) = 'material' then 'Material'
        else 'Other'
      end
    else 'Other'
  end as financial_category
from public.project_commission_obligations ob
join public.project_participants pp on pp.id = ob.participant_id
join public.project_participant_roles pr on pr.id = pp.role_id
left join public.product_categories cat on cat.id = ob.product_category_id
left join public.products p on p.id = ob.product_id
left join public.product_types pt on pt.id = p.product_type_id
left join public.product_categories cat2 on cat2.id = p.category_id
where pr.role_key = 'contractor'
  and ob.basis_type = 'fixed';

revoke all on private.v_project_direct_costs from public, anon, authenticated;
grant select on private.v_project_direct_costs to service_role;

create or replace function private.project_direct_cost_basis(
  p_project_id uuid,
  p_scope_type text,
  p_currency_code text,
  p_product_category_id uuid default null,
  p_product_id uuid default null
)
returns table(cost_amount numeric, currency_mismatch_count integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_scope text := lower(btrim(coalesce(p_scope_type, 'project')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
begin
  if v_scope = 'project' then
    if p_product_category_id is not null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_PROJECT_SCOPE_INVALID';
    end if;
  elsif v_scope = 'category' then
    if p_product_category_id is null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_CATEGORY_SCOPE_INVALID';
    end if;
  elsif v_scope = 'product' then
    if p_product_id is null or p_product_category_id is not null then
      raise exception 'PROJECT_COMMISSION_PRODUCT_SCOPE_INVALID';
    end if;
  else
    raise exception 'PROJECT_COMMISSION_SCOPE_INVALID';
  end if;

  return query
  select
    coalesce(sum(
      case when d.currency_code = v_currency then d.direct_cost else 0::numeric end
    ), 0::numeric),
    count(*) filter (where d.currency_code <> v_currency)::integer
  from private.v_project_direct_costs d
  where d.project_id = p_project_id
    and d.current_status <> 'cancelled'
    and (
      v_scope = 'project'
      or (v_scope = 'category' and d.scope_type = 'category' and d.product_category_id = p_product_category_id)
      or (v_scope = 'product' and d.scope_type = 'product' and d.product_id = p_product_id)
    );
end;
$$;

revoke all on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) to service_role;

-- Preserve the existing five-column contract used by create/replace commission RPCs,
-- but make the underlying accounting canonical and fail-closed.
create or replace function private.project_commission_gross_profit_basis(
  p_project_id uuid,
  p_scope_type text,
  p_currency_code text,
  p_product_category_id uuid default null,
  p_product_id uuid default null
)
returns table(
  revenue_amount numeric,
  cost_amount numeric,
  gross_profit_amount numeric,
  missing_cost_line_count integer,
  detected_currency text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_scope text := lower(btrim(coalesce(p_scope_type, 'project')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_line_count integer := 0;
  v_currency_count integer := 0;
  v_detected_currency text;
  v_revenue numeric := 0;
  v_known_product_cost numeric := 0;
  v_direct_cost numeric := 0;
  v_direct_cost_currency_mismatch integer := 0;
  v_missing_cost_line_count integer := 0;
begin
  if not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'PROJECT_COMMISSION_CURRENCY_INVALID';
  end if;

  if v_scope = 'project' then
    if p_product_category_id is not null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_PROJECT_SCOPE_INVALID';
    end if;
  elsif v_scope = 'category' then
    if p_product_category_id is null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_CATEGORY_SCOPE_INVALID';
    end if;
  elsif v_scope = 'product' then
    if p_product_id is null or p_product_category_id is not null then
      raise exception 'PROJECT_COMMISSION_PRODUCT_SCOPE_INVALID';
    end if;
  else
    raise exception 'PROJECT_COMMISSION_SCOPE_INVALID';
  end if;

  select
    count(*)::integer,
    count(distinct l.order_currency)::integer,
    min(l.order_currency),
    coalesce(sum(l.line_revenue), 0::numeric),
    coalesce(sum(case when not l.missing_cost then l.quantity * l.unit_cost else 0::numeric end), 0::numeric),
    count(*) filter (where l.missing_cost)::integer
  into
    v_line_count,
    v_currency_count,
    v_detected_currency,
    v_revenue,
    v_known_product_cost,
    v_missing_cost_line_count
  from private.v_profitability_order_lines l
  where l.project_id = p_project_id
    and l.order_status <> 'cancelled'
    and (
      v_scope = 'project'
      or (v_scope = 'category' and l.product_category_id = p_product_category_id)
      or (v_scope = 'product' and l.product_id = p_product_id)
    );

  if v_line_count = 0 or coalesce(v_revenue, 0) <= 0 then
    raise exception 'PROJECT_COMMISSION_BASIS_EMPTY';
  end if;
  if v_currency_count > 1 then
    raise exception 'PROJECT_COMMISSION_GROSS_PROFIT_MIXED_CURRENCY';
  end if;
  if v_detected_currency is distinct from v_currency then
    raise exception 'PROJECT_COMMISSION_CURRENCY_MISMATCH: scope is %, requested %', v_detected_currency, v_currency;
  end if;

  select d.cost_amount, d.currency_mismatch_count
  into v_direct_cost, v_direct_cost_currency_mismatch
  from private.project_direct_cost_basis(
    p_project_id,
    v_scope,
    v_currency,
    case when v_scope = 'category' then p_product_category_id else null end,
    case when v_scope = 'product' then p_product_id else null end
  ) d;

  if coalesce(v_direct_cost_currency_mismatch, 0) > 0 then
    raise exception 'PROJECT_COMMISSION_GROSS_PROFIT_MIXED_CURRENCY';
  end if;

  return query
  select
    round(v_revenue, 2),
    case
      when v_missing_cost_line_count = 0
        then round(v_known_product_cost + coalesce(v_direct_cost, 0), 2)
      else null::numeric
    end,
    case
      when v_missing_cost_line_count = 0
        then round(v_revenue - v_known_product_cost - coalesce(v_direct_cost, 0), 2)
      else null::numeric
    end,
    v_missing_cost_line_count,
    v_detected_currency;
end;
$$;

comment on function private.project_commission_gross_profit_basis(uuid, text, text, uuid, uuid) is
  'Canonical GP commission basis: customer-visible pre-tax revenue, frozen/live Cost product COGS, fixed Contractor direct Project cost, fail-closed missing cost.';
comment on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) is
  'Fixed Contractor obligations classified as direct Project cost for the requested Project/category/product scope. Cancelled obligations are excluded; paid/accrued costs remain costs.';

-- Project Financial Summary uses the exact same product-cost projection and also
-- folds fixed Contractor obligations into total cost / GP.
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

-- Compatibility view keeps its public name/shape. It reports product COGS only at
-- order level because Project/category fixed direct cost cannot be allocated to an
-- individual order without an explicit allocation rule.
create or replace view public.v_order_profitability_current_cost as
with item_cost as (
  select
    l.order_id,
    count(*)::bigint as line_count,
    count(*) filter (where l.missing_cost)::bigint as missing_cost_lines,
    coalesce(sum(case when not l.missing_cost then l.quantity * l.unit_cost else 0::numeric end), 0::numeric) as known_cost
  from private.v_profitability_order_lines l
  group by l.order_id
)
select
  co.id as order_id,
  co.order_number,
  co.customer_id,
  co.project_id,
  co.currency_code,
  co.status,
  co.subtotal,
  co.discount_amount,
  coalesce(co.customer_visible_sell_amount, 0::numeric) as net_sales,
  case
    when coalesce(ic.missing_cost_lines, 0) > 0 then null
    else coalesce(ic.known_cost, 0::numeric)
  end as estimated_cogs,
  case
    when coalesce(ic.missing_cost_lines, 0) > 0 then null
    else coalesce(co.customer_visible_sell_amount, 0::numeric) - coalesce(ic.known_cost, 0::numeric)
  end as estimated_gross_profit,
  case
    when coalesce(ic.missing_cost_lines, 0) > 0
         or coalesce(co.customer_visible_sell_amount, 0::numeric) <= 0 then null
    else round(
      ((coalesce(co.customer_visible_sell_amount, 0::numeric) - coalesce(ic.known_cost, 0::numeric)) /
       co.customer_visible_sell_amount) * 100::numeric,
      2
    )
  end as estimated_gross_margin_percent,
  coalesce(ic.missing_cost_lines, 0)::bigint as missing_cost_lines,
  coalesce(ic.line_count, 0)::bigint as line_count,
  co.created_at
from public.customer_orders co
left join item_cost ic on ic.order_id = co.id
where co.status <> 'cancelled';
