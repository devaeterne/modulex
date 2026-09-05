-- PB-6 follow-up: gross-profit percentage commission.
-- Gross profit is scoped Order-line revenue minus canonical current product costs.
-- Missing costs, currency drift, and non-positive gross profit fail closed.

alter table public.project_commission_obligations
  add column if not exists basis_revenue_amount numeric,
  add column if not exists basis_cost_amount numeric;

alter table public.project_commission_obligations
  drop constraint if exists project_commission_obligations_basis_type_check;

alter table public.project_commission_obligations
  add constraint project_commission_obligations_basis_type_check
  check (basis_type = any (array['fixed'::text, 'percentage'::text, 'gross_profit_percentage'::text]));

alter table public.project_commission_obligations
  drop constraint if exists project_commission_basis_shape;

alter table public.project_commission_obligations
  add constraint project_commission_basis_shape
  check (
    (
      basis_type = 'fixed'
      and flat_amount > 0
      and basis_amount is null
      and rate is null
      and basis_revenue_amount is null
      and basis_cost_amount is null
    )
    or
    (
      basis_type = 'percentage'
      and basis_amount >= 0
      and rate > 0
      and rate <= 100
      and flat_amount is null
      and basis_revenue_amount is null
      and basis_cost_amount is null
    )
    or
    (
      basis_type = 'gross_profit_percentage'
      and basis_amount > 0
      and rate > 0
      and rate <= 100
      and flat_amount is null
      and basis_revenue_amount > 0
      and basis_cost_amount >= 0
      and round(basis_revenue_amount - basis_cost_amount, 2) = round(basis_amount, 2)
    )
  );

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
  v_known_cost numeric := 0;
  v_missing_cost_line_count integer := 0;
begin
  if not exists (select 1 from public.customer_projects where id = p_project_id) then
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
    count(distinct upper(co.currency_code::text))::integer,
    min(upper(co.currency_code::text)),
    coalesce(sum(oi.line_total), 0),
    coalesce(sum(
      case
        when oi.product_id is not null and pc.id is not null then oi.quantity * pc.amount
        else 0
      end
    ), 0),
    count(*) filter (where oi.product_id is null or pc.id is null)::integer
  into
    v_line_count,
    v_currency_count,
    v_detected_currency,
    v_revenue,
    v_known_cost,
    v_missing_cost_line_count
  from public.customer_orders co
  join public.customer_order_items oi on oi.order_id = co.id
  left join public.products p on p.id = oi.product_id
  left join public.product_costs pc
    on pc.product_id = oi.product_id
   and pc.currency_code = v_currency
   and pc.is_active = true
   and pc.valid_to is null
  where co.project_id = p_project_id
    and co.status <> 'cancelled'
    and (
      v_scope = 'project'
      or (v_scope = 'category' and p.category_id = p_product_category_id)
      or (v_scope = 'product' and oi.product_id = p_product_id)
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

  return query
  select
    round(v_revenue, 2),
    round(v_known_cost, 2),
    case
      when v_missing_cost_line_count = 0 then round(v_revenue - v_known_cost, 2)
      else null::numeric
    end,
    v_missing_cost_line_count,
    v_detected_currency;
end;
$$;

create or replace function public.get_customer_project_commission_calculation_preview(
  p_project_id uuid,
  p_basis_type text default 'percentage',
  p_scope_type text default 'project',
  p_currency_code text default 'USD',
  p_product_category_id uuid default null,
  p_product_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_basis_type text := lower(btrim(coalesce(p_basis_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_revenue numeric;
  v_cost numeric;
  v_gross_profit numeric;
  v_missing integer := 0;
  v_detected_currency text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_VIEW_FORBIDDEN';
  end if;

  if v_basis_type = 'percentage' then
    v_revenue := private.project_commission_scope_basis(
      p_project_id,
      p_scope_type,
      v_currency,
      p_product_category_id,
      p_product_id
    );

    return jsonb_build_object(
      'available', true,
      'mode', 'revenue',
      'revenue_amount', v_revenue,
      'cost_amount', null,
      'basis_amount', v_revenue,
      'missing_cost_line_count', 0,
      'currency_code', v_currency,
      'error_code', null
    );
  elsif v_basis_type = 'gross_profit_percentage' then
    select
      gp.revenue_amount,
      gp.cost_amount,
      gp.gross_profit_amount,
      gp.missing_cost_line_count,
      gp.detected_currency
    into
      v_revenue,
      v_cost,
      v_gross_profit,
      v_missing,
      v_detected_currency
    from private.project_commission_gross_profit_basis(
      p_project_id,
      p_scope_type,
      v_currency,
      p_product_category_id,
      p_product_id
    ) gp;

    if v_missing > 0 then
      return jsonb_build_object(
        'available', false,
        'mode', 'gross_profit',
        'revenue_amount', v_revenue,
        'cost_amount', v_cost,
        'basis_amount', null,
        'missing_cost_line_count', v_missing,
        'currency_code', v_detected_currency,
        'error_code', 'PROJECT_COMMISSION_COST_INCOMPLETE'
      );
    end if;

    if v_gross_profit is null or v_gross_profit <= 0 then
      return jsonb_build_object(
        'available', false,
        'mode', 'gross_profit',
        'revenue_amount', v_revenue,
        'cost_amount', v_cost,
        'basis_amount', v_gross_profit,
        'missing_cost_line_count', 0,
        'currency_code', v_detected_currency,
        'error_code', 'PROJECT_COMMISSION_GROSS_PROFIT_NONPOSITIVE'
      );
    end if;

    return jsonb_build_object(
      'available', true,
      'mode', 'gross_profit',
      'revenue_amount', v_revenue,
      'cost_amount', v_cost,
      'basis_amount', v_gross_profit,
      'missing_cost_line_count', 0,
      'currency_code', v_detected_currency,
      'error_code', null
    );
  else
    raise exception 'PROJECT_COMMISSION_BASIS_TYPE_INVALID';
  end if;
end;
$$;

create or replace function public.create_customer_project_commission_obligation(
  p_project_id uuid,
  p_participant_id uuid,
  p_basis_type text,
  p_currency_code text,
  p_scope_type text default 'project',
  p_basis_amount numeric default null,
  p_rate numeric default null,
  p_flat_amount numeric default null,
  p_order_id uuid default null,
  p_product_category_id uuid default null,
  p_product_id uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
  v_scope text := lower(btrim(coalesce(p_scope_type, 'project')));
  v_basis_type text := lower(btrim(coalesce(p_basis_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_basis_amount numeric := null;
  v_basis_revenue_amount numeric := null;
  v_basis_cost_amount numeric := null;
  v_missing_cost_line_count integer := 0;
  v_detected_currency text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;
  if not exists (
    select 1
    from public.project_participants
    where id = p_participant_id
      and project_id = p_project_id
      and is_active
  ) then
    raise exception 'PROJECT_COMMISSION_PARTICIPANT_INVALID';
  end if;
  if p_order_id is not null and not exists (
    select 1
    from public.customer_orders
    where id = p_order_id
      and project_id = p_project_id
      and status <> 'cancelled'
  ) then
    raise exception 'PROJECT_COMMISSION_ORDER_PROJECT_MISMATCH';
  end if;

  if v_scope = 'category' then
    if p_product_category_id is null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_CATEGORY_SCOPE_INVALID';
    end if;
    if not exists (
      select 1
      from public.customer_orders co
      join public.customer_order_items oi on oi.order_id = co.id
      join public.products p on p.id = oi.product_id
      where co.project_id = p_project_id
        and co.status <> 'cancelled'
        and p.category_id = p_product_category_id
    ) then
      raise exception 'PROJECT_COMMISSION_CATEGORY_NOT_IN_PROJECT';
    end if;
  elsif v_scope = 'product' then
    if p_product_id is null or p_product_category_id is not null then
      raise exception 'PROJECT_COMMISSION_PRODUCT_SCOPE_INVALID';
    end if;
    if not exists (
      select 1
      from public.customer_orders co
      join public.customer_order_items oi on oi.order_id = co.id
      where co.project_id = p_project_id
        and co.status <> 'cancelled'
        and oi.product_id = p_product_id
    ) then
      raise exception 'PROJECT_COMMISSION_PRODUCT_NOT_IN_PROJECT';
    end if;
  elsif v_scope = 'project' then
    if p_product_category_id is not null or p_product_id is not null then
      raise exception 'PROJECT_COMMISSION_PROJECT_SCOPE_INVALID';
    end if;
  else
    raise exception 'PROJECT_COMMISSION_SCOPE_INVALID';
  end if;

  if v_basis_type = 'percentage' then
    if p_rate is null or p_rate <= 0 or p_rate > 100 then
      raise exception 'PROJECT_COMMISSION_RATE_INVALID';
    end if;
    v_basis_amount := private.project_commission_scope_basis(
      p_project_id,
      v_scope,
      v_currency,
      case when v_scope = 'category' then p_product_category_id else null end,
      case when v_scope = 'product' then p_product_id else null end
    );
  elsif v_basis_type = 'gross_profit_percentage' then
    if p_rate is null or p_rate <= 0 or p_rate > 100 then
      raise exception 'PROJECT_COMMISSION_RATE_INVALID';
    end if;

    select
      gp.revenue_amount,
      gp.cost_amount,
      gp.gross_profit_amount,
      gp.missing_cost_line_count,
      gp.detected_currency
    into
      v_basis_revenue_amount,
      v_basis_cost_amount,
      v_basis_amount,
      v_missing_cost_line_count,
      v_detected_currency
    from private.project_commission_gross_profit_basis(
      p_project_id,
      v_scope,
      v_currency,
      case when v_scope = 'category' then p_product_category_id else null end,
      case when v_scope = 'product' then p_product_id else null end
    ) gp;

    if v_missing_cost_line_count > 0 then
      raise exception 'PROJECT_COMMISSION_COST_INCOMPLETE: % scoped line(s) missing canonical cost', v_missing_cost_line_count;
    end if;
    if v_basis_amount is null or v_basis_amount <= 0 then
      raise exception 'PROJECT_COMMISSION_GROSS_PROFIT_NONPOSITIVE';
    end if;
  elsif v_basis_type = 'fixed' then
    if p_flat_amount is null or p_flat_amount <= 0 then
      raise exception 'PROJECT_COMMISSION_FIXED_AMOUNT_INVALID';
    end if;
  else
    raise exception 'PROJECT_COMMISSION_BASIS_TYPE_INVALID';
  end if;

  insert into public.project_commission_obligations(
    project_id,
    participant_id,
    order_id,
    scope_type,
    product_category_id,
    product_id,
    basis_type,
    basis_amount,
    basis_revenue_amount,
    basis_cost_amount,
    rate,
    flat_amount,
    currency_code,
    description,
    created_by
  ) values (
    p_project_id,
    p_participant_id,
    p_order_id,
    v_scope,
    case when v_scope = 'category' then p_product_category_id else null end,
    case when v_scope = 'product' then p_product_id else null end,
    v_basis_type,
    case when v_basis_type in ('percentage', 'gross_profit_percentage') then v_basis_amount else null end,
    case when v_basis_type = 'gross_profit_percentage' then v_basis_revenue_amount else null end,
    case when v_basis_type = 'gross_profit_percentage' then v_basis_cost_amount else null end,
    case when v_basis_type in ('percentage', 'gross_profit_percentage') then p_rate else null end,
    case when v_basis_type = 'fixed' then p_flat_amount else null end,
    v_currency,
    nullif(btrim(p_description), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.project_commission_gross_profit_basis(uuid,text,text,uuid,uuid) from public;
revoke all on function public.get_customer_project_commission_calculation_preview(uuid,text,text,text,uuid,uuid) from public;
revoke all on function public.create_customer_project_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) from public;

grant execute on function public.get_customer_project_commission_calculation_preview(uuid,text,text,text,uuid,uuid) to authenticated;
grant execute on function public.create_customer_project_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) to authenticated;
