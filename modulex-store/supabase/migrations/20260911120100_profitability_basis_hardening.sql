-- Shared profitability basis + GP commission hardening.
-- Depends on 20260911120000_cost_price_snapshot_hardening.sql.

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
  select pp.amount, upper(pp.currency_code::text) as currency_code
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
    coalesce(sum(case when d.currency_code = v_currency then d.direct_cost else 0::numeric end), 0::numeric),
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
    case when v_missing_cost_line_count = 0
      then round(v_known_product_cost + coalesce(v_direct_cost, 0), 2)
      else null::numeric end,
    case when v_missing_cost_line_count = 0
      then round(v_revenue - v_known_product_cost - coalesce(v_direct_cost, 0), 2)
      else null::numeric end,
    v_missing_cost_line_count,
    v_detected_currency;
end;
$$;

comment on function private.project_commission_gross_profit_basis(uuid, text, text, uuid, uuid) is
  'Canonical GP commission basis: customer-visible pre-tax revenue, frozen/live Cost product COGS, fixed Contractor direct Project cost, fail-closed missing cost.';
comment on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) is
  'Fixed Contractor obligations classified as direct Project cost for the requested Project/category/product scope. Cancelled obligations are excluded; paid/accrued costs remain costs.';
