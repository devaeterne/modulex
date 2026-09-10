-- Cost & Profitability hardening
--
-- Accounting contract:
--   * The internal Cost price group is the canonical product-cost entry surface.
--   * Draft profitability uses the current effective Cost price.
--   * Confirmation freezes product cost on each order line at numeric(18,4) precision.
--   * Project gross profit includes fixed Contractor obligations as direct Project cost.
--   * Missing product cost fails closed; it is never treated as zero profitably.
--   * Historical commission obligations remain immutable. Existing pending obligations can be
--     replaced through the existing replacement RPC after this migration is deployed.
--   * Countertop selling configuration inputs are intentionally not COGS.

-- ---------------------------------------------------------------------------
-- 1. Give the internal Cost group a stable identity.
-- ---------------------------------------------------------------------------

do $$
declare
  v_cost_group_id uuid;
  v_cost_group_count integer;
  v_conflict_count integer;
begin
  select count(*), min(pg.id)
  into v_cost_group_count, v_cost_group_id
  from public.price_groups pg
  where lower(btrim(pg.name)) = 'cost'
    and coalesce(pg.internal_only, false) = true;

  if v_cost_group_count <> 1 then
    raise exception 'COST_PRICE_GROUP_AMBIGUOUS: expected exactly one internal Cost price group, found %', v_cost_group_count;
  end if;

  select count(*)
  into v_conflict_count
  from public.price_groups pg
  where pg.system_key = 'cost'
    and pg.id <> v_cost_group_id;

  if v_conflict_count > 0 then
    raise exception 'COST_PRICE_GROUP_SYSTEM_KEY_CONFLICT';
  end if;

  update public.price_groups
  set system_key = 'cost',
      updated_at = now()
  where id = v_cost_group_id
    and system_key is distinct from 'cost';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Keep product_costs as an operational history mirror of Cost prices.
-- ---------------------------------------------------------------------------

alter table public.product_costs
  add column if not exists source_type text,
  add column if not exists source_product_price_id uuid;

create index if not exists product_costs_source_product_price_idx
  on public.product_costs(source_product_price_id)
  where source_product_price_id is not null;

comment on column public.product_costs.source_type is
  'Origin of the operational cost row. cost_price_group rows are synchronized from the internal Cost price group.';
comment on column public.product_costs.source_product_price_id is
  'Product price row that supplied this operational cost when source_type=cost_price_group.';

create or replace function private.sync_product_cost_from_cost_price(
  p_product_id uuid,
  p_currency_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_now timestamptz := clock_timestamp();
  v_price_id uuid;
  v_amount numeric(18,4);
  v_matching_cost_id uuid;
begin
  if p_product_id is null or v_currency !~ '^[A-Z]{3}$' then
    return;
  end if;

  select pp.id, pp.amount
  into v_price_id, v_amount
  from public.product_prices pp
  join public.price_groups pg on pg.id = pp.price_group_id
  where pp.product_id = p_product_id
    and upper(pp.currency_code::text) = v_currency
    and pg.system_key = 'cost'
    and coalesce(pg.internal_only, false) = true
    and coalesce(pg.is_active, true) = true
    and pp.is_active = true
    and pp.valid_from <= v_now
    and (pp.valid_to is null or pp.valid_to > v_now)
  order by pp.valid_from desc, pp.created_at desc, pp.id desc
  limit 1;

  if v_price_id is null then
    update public.product_costs pc
    set valid_to = case
          when pc.valid_to is null or pc.valid_to > v_now then v_now
          else pc.valid_to
        end,
        is_active = false,
        updated_at = v_now
    where pc.product_id = p_product_id
      and upper(pc.currency_code::text) = v_currency
      and pc.source_type = 'cost_price_group'
      and pc.is_active = true
      and pc.valid_from < v_now
      and (pc.valid_to is null or pc.valid_to > v_now);
    return;
  end if;

  select pc.id
  into v_matching_cost_id
  from public.product_costs pc
  where pc.product_id = p_product_id
    and upper(pc.currency_code::text) = v_currency
    and pc.source_type = 'cost_price_group'
    and pc.source_product_price_id = v_price_id
    and pc.amount = v_amount
    and pc.is_active = true
    and pc.valid_from <= v_now
    and (pc.valid_to is null or pc.valid_to > v_now)
  order by pc.valid_from desc, pc.created_at desc, pc.id desc
  limit 1;

  if v_matching_cost_id is not null then
    update public.product_costs pc
    set valid_to = case
          when pc.valid_to is null or pc.valid_to > v_now then v_now
          else pc.valid_to
        end,
        is_active = false,
        updated_at = v_now
    where pc.product_id = p_product_id
      and upper(pc.currency_code::text) = v_currency
      and pc.id <> v_matching_cost_id
      and pc.is_active = true
      and pc.valid_from < v_now
      and (pc.valid_to is null or pc.valid_to > v_now);
    return;
  end if;

  -- Cost price is authoritative for the current operational cost. Close any stale
  -- current row first, including legacy rows without provenance.
  update public.product_costs pc
  set valid_to = case
        when pc.valid_to is null or pc.valid_to > v_now then v_now
        else pc.valid_to
      end,
      is_active = false,
      updated_at = v_now
  where pc.product_id = p_product_id
    and upper(pc.currency_code::text) = v_currency
    and pc.is_active = true
    and pc.valid_from < v_now
    and (pc.valid_to is null or pc.valid_to > v_now);

  insert into public.product_costs(
    product_id,
    amount,
    currency_code,
    valid_from,
    valid_to,
    is_active,
    note,
    source_type,
    source_product_price_id,
    created_by,
    updated_by
  ) values (
    p_product_id,
    v_amount,
    v_currency,
    v_now,
    null,
    true,
    'Synced from Cost price group',
    'cost_price_group',
    v_price_id,
    auth.uid(),
    auth.uid()
  );
end;
$$;

revoke all on function private.sync_product_cost_from_cost_price(uuid, text) from public, anon, authenticated;
grant execute on function private.sync_product_cost_from_cost_price(uuid, text) to service_role;

create or replace function private.sync_product_cost_from_cost_price_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op <> 'INSERT' and exists (
    select 1 from public.price_groups pg
    where pg.id = old.price_group_id and pg.system_key = 'cost'
  ) then
    perform private.sync_product_cost_from_cost_price(old.product_id, old.currency_code::text);
  end if;

  if tg_op <> 'DELETE' and exists (
    select 1 from public.price_groups pg
    where pg.id = new.price_group_id and pg.system_key = 'cost'
  ) then
    perform private.sync_product_cost_from_cost_price(new.product_id, new.currency_code::text);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists product_prices_sync_cost_history on public.product_prices;
create trigger product_prices_sync_cost_history
after insert or update or delete on public.product_prices
for each row execute function private.sync_product_cost_from_cost_price_trigger();

-- Repair the current operational Cost & Margin table from the canonical Cost price group.
do $$
declare
  v_row record;
begin
  for v_row in
    select distinct pp.product_id, upper(pp.currency_code::text) as currency_code
    from public.product_prices pp
    join public.price_groups pg on pg.id = pp.price_group_id
    where pg.system_key = 'cost'
      and coalesce(pg.internal_only, false) = true
      and coalesce(pg.is_active, true) = true
      and pp.is_active = true
      and pp.valid_from <= now()
      and (pp.valid_to is null or pp.valid_to > now())
  loop
    perform private.sync_product_cost_from_cost_price(v_row.product_id, v_row.currency_code);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Freeze product cost on order lines at confirmation.
-- ---------------------------------------------------------------------------

alter table public.customer_order_items
  add column if not exists unit_cost_snapshot numeric(18,4),
  add column if not exists cost_currency_code varchar(3),
  add column if not exists cost_snapshot_at timestamptz,
  add column if not exists cost_source text,
  add column if not exists cost_source_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_unit_cost_snapshot_non_negative'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_unit_cost_snapshot_non_negative
      check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_cost_currency_format'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_cost_currency_format
      check (cost_currency_code is null or (cost_currency_code = upper(cost_currency_code) and length(cost_currency_code) = 3));
  end if;
end;
$$;

comment on column public.customer_order_items.unit_cost_snapshot is
  'Frozen canonical unit product cost captured when the order is confirmed.';
comment on column public.customer_order_items.cost_currency_code is
  'Currency of the frozen unit cost snapshot.';
comment on column public.customer_order_items.cost_snapshot_at is
  'Timestamp at which the order line cost was frozen.';
comment on column public.customer_order_items.cost_source is
  'Canonical source used for the frozen cost. Currently cost_price_group.';
comment on column public.customer_order_items.cost_source_id is
  'Source row id used for the frozen cost snapshot.';

create or replace function private.resolve_cost_price(
  p_product_id uuid,
  p_currency_code text,
  p_effective_at timestamptz
)
returns table(
  unit_cost numeric(18,4),
  currency_code text,
  source_price_id uuid,
  source_type text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with matches as (
    select
      pp.amount::numeric(18,4) as unit_cost,
      upper(pp.currency_code::text) as currency_code,
      pp.id as source_price_id,
      count(*) over () as match_count
    from public.product_prices pp
    join public.price_groups pg on pg.id = pp.price_group_id
    where pp.product_id = p_product_id
      and upper(pp.currency_code::text) = upper(btrim(coalesce(p_currency_code, '')))
      and pg.system_key = 'cost'
      and coalesce(pg.internal_only, false) = true
      and pp.valid_from <= p_effective_at
      and (pp.valid_to is null or pp.valid_to > p_effective_at)
      and (pp.is_active = true or pp.valid_to is not null)
  )
  select m.unit_cost, m.currency_code, m.source_price_id, 'cost_price_group'::text
  from matches m
  where m.match_count = 1;
$$;

revoke all on function private.resolve_cost_price(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function private.resolve_cost_price(uuid, text, timestamptz) to service_role;

create or replace function private.apply_customer_order_item_cost_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_currency text;
  v_confirmed_at timestamptz;
  v_cost record;
begin
  select upper(co.currency_code::text), co.confirmed_at
  into v_currency, v_confirmed_at
  from public.customer_orders co
  where co.id = new.order_id;

  if not found then
    return new;
  end if;

  -- Draft lines must not accept caller-supplied frozen costs. If a previously
  -- confirmed line somehow remains attached to an order whose lifecycle moved
  -- backwards, preserve the already-frozen snapshot rather than rewriting history.
  if v_confirmed_at is null then
    if tg_op = 'UPDATE' and old.unit_cost_snapshot is not null
       and new.product_id is not distinct from old.product_id
       and new.order_id is not distinct from old.order_id then
      new.unit_cost_snapshot := old.unit_cost_snapshot;
      new.cost_currency_code := old.cost_currency_code;
      new.cost_snapshot_at := old.cost_snapshot_at;
      new.cost_source := old.cost_source;
      new.cost_source_id := old.cost_source_id;
    else
      new.unit_cost_snapshot := null;
      new.cost_currency_code := null;
      new.cost_snapshot_at := null;
      new.cost_source := null;
      new.cost_source_id := null;
    end if;
    return new;
  end if;

  -- Once frozen, ordinary quantity/price/description edits cannot rewrite cost.
  if tg_op = 'UPDATE' then
    if old.unit_cost_snapshot is not null
       and new.product_id is not distinct from old.product_id
       and new.order_id is not distinct from old.order_id then
      new.unit_cost_snapshot := old.unit_cost_snapshot;
      new.cost_currency_code := old.cost_currency_code;
      new.cost_snapshot_at := old.cost_snapshot_at;
      new.cost_source := old.cost_source;
      new.cost_source_id := old.cost_source_id;
      return new;
    end if;
  end if;

  select * into v_cost
  from private.resolve_cost_price(new.product_id, v_currency, v_confirmed_at)
  limit 1;

  if v_cost.source_price_id is null then
    new.unit_cost_snapshot := null;
    new.cost_currency_code := null;
    new.cost_snapshot_at := null;
    new.cost_source := null;
    new.cost_source_id := null;
  else
    new.unit_cost_snapshot := v_cost.unit_cost;
    new.cost_currency_code := v_cost.currency_code;
    new.cost_snapshot_at := v_confirmed_at;
    new.cost_source := v_cost.source_type;
    new.cost_source_id := v_cost.source_price_id;
  end if;

  return new;
end;
$$;

drop trigger if exists customer_order_items_cost_snapshot_guard on public.customer_order_items;
create trigger customer_order_items_cost_snapshot_guard
before insert or update on public.customer_order_items
for each row execute function private.apply_customer_order_item_cost_snapshot();

create or replace function private.freeze_customer_order_cost_snapshots()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.confirmed_at is not null
     and (tg_op = 'INSERT' or old.confirmed_at is null) then
    -- A no-op assignment intentionally routes each missing line through the
    -- BEFORE trigger above, which resolves the authoritative Cost price at confirmed_at.
    update public.customer_order_items oi
    set unit_cost_snapshot = oi.unit_cost_snapshot
    where oi.order_id = new.id
      and oi.unit_cost_snapshot is null;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_orders_freeze_cost_snapshots on public.customer_orders;
create trigger customer_orders_freeze_cost_snapshots
after insert or update of confirmed_at on public.customer_orders
for each row execute function private.freeze_customer_order_cost_snapshots();

-- Safe historical backfill: only confirmed orders are considered and the resolver
-- succeeds only when exactly one Cost price row covered the confirmation timestamp.
update public.customer_order_items oi
set unit_cost_snapshot = oi.unit_cost_snapshot
from public.customer_orders co
where co.id = oi.order_id
  and co.confirmed_at is not null
  and oi.unit_cost_snapshot is null;

-- ---------------------------------------------------------------------------
-- 4. Fixed Contractor obligations are direct Project cost, not sales commission.
-- ---------------------------------------------------------------------------

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
  return query
  select
    coalesce(sum(
      case when upper(ob.currency_code::text) = v_currency
        then coalesce(ob.flat_amount, ob.base_amount, 0::numeric)
        else 0::numeric
      end
    ), 0::numeric) as cost_amount,
    count(*) filter (where upper(ob.currency_code::text) <> v_currency)::integer as currency_mismatch_count
  from public.project_commission_obligations ob
  join public.project_participants pp on pp.id = ob.participant_id
  join public.project_participant_roles pr on pr.id = pp.role_id
  where ob.project_id = p_project_id
    and pr.role_key = 'contractor'
    and ob.basis_type = 'fixed'
    and coalesce(private.current_project_commission_status(ob.id), 'pending') <> 'cancelled'
    and (
      (v_scope = 'project')
      or (v_scope = 'category' and ob.scope_type = 'category' and ob.product_category_id = p_product_category_id)
      or (v_scope = 'product' and ob.scope_type = 'product' and ob.product_id = p_product_id)
    );
end;
$$;

revoke all on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Harden gross-profit commission basis.
-- ---------------------------------------------------------------------------

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

  with scoped_lines as (
    select
      co.currency_code::text as order_currency,
      case
        when co.subtotal > 0::numeric
          then coalesce(oi.line_total, 0::numeric) *
               (coalesce(co.customer_visible_sell_amount, 0::numeric) / co.subtotal)
        else 0::numeric
      end as line_revenue,
      case
        when co.confirmed_at is not null then
          case when upper(coalesce(oi.cost_currency_code, '')) = upper(co.currency_code::text)
            then oi.unit_cost_snapshot else null end
        else live_cost.amount
      end as unit_cost
    from public.customer_orders co
    join public.customer_order_items oi on oi.order_id = co.id
    left join public.products p on p.id = oi.product_id
    left join lateral (
      select pp.amount
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
    ) live_cost on true
    where co.project_id = p_project_id
      and co.status <> 'cancelled'
      and (
        v_scope = 'project'
        or (v_scope = 'category' and p.category_id = p_product_category_id)
        or (v_scope = 'product' and oi.product_id = p_product_id)
      )
  )
  select
    count(*)::integer,
    count(distinct upper(sl.order_currency))::integer,
    min(upper(sl.order_currency)),
    coalesce(sum(sl.line_revenue), 0::numeric),
    coalesce(sum(case when sl.unit_cost is not null then sl.unit_cost else 0::numeric end), 0::numeric),
    count(*) filter (where sl.unit_cost is null)::integer
  into
    v_line_count,
    v_currency_count,
    v_detected_currency,
    v_revenue,
    v_known_product_cost,
    v_missing_cost_line_count
  from scoped_lines sl;

  -- unit_cost above is per-unit; multiply by quantity in a second scoped aggregate.
  with scoped_cost as (
    select
      oi.quantity::numeric as quantity,
      case
        when co.confirmed_at is not null then
          case when upper(coalesce(oi.cost_currency_code, '')) = upper(co.currency_code::text)
            then oi.unit_cost_snapshot else null end
        else live_cost.amount
      end as unit_cost
    from public.customer_orders co
    join public.customer_order_items oi on oi.order_id = co.id
    left join public.products p on p.id = oi.product_id
    left join lateral (
      select pp.amount
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
    ) live_cost on true
    where co.project_id = p_project_id
      and co.status <> 'cancelled'
      and (
        v_scope = 'project'
        or (v_scope = 'category' and p.category_id = p_product_category_id)
        or (v_scope = 'product' and oi.product_id = p_product_id)
      )
  )
  select coalesce(sum(case when sc.unit_cost is not null then sc.quantity * sc.unit_cost else 0::numeric end), 0::numeric)
  into v_known_product_cost
  from scoped_cost sc;

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
      when v_missing_cost_line_count = 0 then round(v_known_product_cost + coalesce(v_direct_cost, 0), 2)
      else null::numeric
    end,
    case
      when v_missing_cost_line_count = 0 then round(v_revenue - v_known_product_cost - coalesce(v_direct_cost, 0), 2)
      else null::numeric
    end,
    v_missing_cost_line_count,
    v_detected_currency;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Project Financial Summary: canonical revenue + frozen/live product cost +
--    direct Contractor cost.
-- ---------------------------------------------------------------------------

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
      coalesce(o.customer_visible_sell_amount, 0::numeric) as net_sales,
      coalesce(o.subtotal, 0::numeric) as subtotal,
      o.confirmed_at
    from public.customer_orders o
    where o.project_id = p_project_id
      and o.status <> 'cancelled'
  ),
  item_lines as (
    select
      o.id as order_id,
      case
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'STANDARD' then 'Cabinet'
        when upper(coalesce(nullif(oi.product_type_code_snapshot, ''), pt.code, '')) = 'CABINETS' then 'Cabinet'
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
        when o.subtotal > 0::numeric
          then coalesce(oi.line_total, 0::numeric) * (o.net_sales / o.subtotal)
        else 0::numeric
      end as line_net_sales,
      case
        when o.confirmed_at is not null then
          case when upper(coalesce(oi.cost_currency_code, '')) = o.currency_code and oi.unit_cost_snapshot is not null
            then coalesce(oi.quantity, 0)::numeric * oi.unit_cost_snapshot
            else 0::numeric end
        when live_cost.amount is not null then coalesce(oi.quantity, 0)::numeric * live_cost.amount
        else 0::numeric
      end as known_line_cost,
      case
        when oi.product_id is null then true
        when o.confirmed_at is not null then oi.unit_cost_snapshot is null or upper(coalesce(oi.cost_currency_code, '')) <> o.currency_code
        else live_cost.amount is null
      end as missing_cost,
      o.currency_code as order_currency,
      case
        when o.confirmed_at is not null then upper(oi.cost_currency_code::text)
        else live_cost.currency_code
      end as cost_currency
    from active_orders o
    join public.customer_order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_types pt on pt.id = p.product_type_id
    left join public.product_categories pc on pc.id = p.category_id
    left join lateral (
      select pp.amount, upper(pp.currency_code::text) as currency_code
      from public.product_prices pp
      join public.price_groups pg on pg.id = pp.price_group_id
      where o.confirmed_at is null
        and pp.product_id = oi.product_id
        and upper(pp.currency_code::text) = o.currency_code
        and pg.system_key = 'cost'
        and coalesce(pg.internal_only, false) = true
        and coalesce(pg.is_active, true) = true
        and pp.is_active = true
        and pp.valid_from <= now()
        and (pp.valid_to is null or pp.valid_to > now())
      order by pp.valid_from desc, pp.created_at desc, pp.id desc
      limit 1
    ) live_cost on true
  ),
  direct_cost_rows as (
    select
      coalesce(ob.flat_amount, ob.base_amount, 0::numeric) as direct_cost,
      upper(ob.currency_code::text) as currency_code,
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
            when upper(coalesce(pt2.code, '')) in ('STANDARD', 'CABINETS') then 'Cabinet'
            when upper(coalesce(pt2.code, '')) = 'STONE' then 'Countertop'
            when upper(coalesce(pt2.code, '')) = 'SINK' then 'Sink'
            when upper(coalesce(pt2.code, '')) = 'SERVICE' then 'Labor'
            when upper(coalesce(pt2.code, '')) = 'MATERIAL' then 'Material'
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
    left join public.products p2 on p2.id = ob.product_id
    left join public.product_types pt2 on pt2.id = p2.product_type_id
    left join public.product_categories cat2 on cat2.id = p2.category_id
    where ob.project_id = p_project_id
      and pr.role_key = 'contractor'
      and ob.basis_type = 'fixed'
      and coalesce(private.current_project_commission_status(ob.id), 'pending') <> 'cancelled'
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
    select upper(o.currency_code) as currency_code from active_orders o
    union all
    select upper(il.cost_currency) from item_lines il where il.cost_currency is not null
    union all
    select upper(dcr.currency_code) from direct_cost_rows dcr
    union all
    select upper(ir.currency_code) from invoice_rows ir
  ),
  currency_state as (
    select
      coalesce((select min(cs.currency_code) from currency_sources cs), (select s.default_currency from settings s), 'USD') as currency_code,
      (select count(distinct cs.currency_code) from currency_sources cs) > 1 as mixed_currency
  ),
  totals as (
    select
      coalesce((select sum(o.net_sales) from active_orders o), 0::numeric) as total_sales,
      coalesce((select sum(il.known_line_cost) from item_lines il), 0::numeric) as known_product_cost,
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
      coalesce(sum(il.line_net_sales), 0::numeric) as total_sales,
      coalesce(sum(il.known_line_cost), 0::numeric) as known_cost,
      count(*) filter (where il.missing_cost)::bigint as missing_cost_lines
    from item_lines il
    group by il.financial_category
  ),
  direct_category_rollup as (
    select dcr.financial_category, coalesce(sum(dcr.direct_cost), 0::numeric) as direct_cost
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
        'total_cost', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.known_cost + cr.direct_project_cost, 2) end,
        'gross_profit', case when cs.mixed_currency or cr.missing_cost_lines > 0 then null else round(cr.total_sales - cr.known_cost - cr.direct_project_cost, 2) end,
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
    'total_cost', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.known_product_cost + t.direct_project_cost, 2) end,
    'gross_profit', case when cs.mixed_currency or t.missing_cost_lines > 0 then null else round(t.total_sales - t.known_product_cost - t.direct_project_cost, 2) end,
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
as $$ select private.get_customer_project_financial_summary($1); $$;

revoke all on function public.get_customer_project_financial_summary(uuid) from public, anon;
grant execute on function public.get_customer_project_financial_summary(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Harden the compatibility order-profitability view in place.
--    Direct Project cost is intentionally not allocated to individual orders here;
--    project-level/category-level GP consumers above own that allocation boundary.
-- ---------------------------------------------------------------------------

create or replace view public.v_order_profitability_current_cost as
with item_cost as (
  select
    oi.order_id,
    count(*)::bigint as line_count,
    count(*) filter (
      where oi.product_id is null
         or case
              when co.confirmed_at is not null then oi.unit_cost_snapshot is null or upper(coalesce(oi.cost_currency_code, '')) <> upper(co.currency_code::text)
              else live_cost.amount is null
            end
    )::bigint as missing_cost_lines,
    coalesce(sum(
      case
        when co.confirmed_at is not null and oi.unit_cost_snapshot is not null
             and upper(coalesce(oi.cost_currency_code, '')) = upper(co.currency_code::text)
          then coalesce(oi.quantity, 0)::numeric * oi.unit_cost_snapshot
        when co.confirmed_at is null and live_cost.amount is not null
          then coalesce(oi.quantity, 0)::numeric * live_cost.amount
        else 0::numeric
      end
    ), 0::numeric) as known_cost
  from public.customer_order_items oi
  join public.customer_orders co on co.id = oi.order_id
  left join lateral (
    select pp.amount
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
  ) live_cost on true
  group by oi.order_id
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
  case when coalesce(ic.missing_cost_lines, 0) > 0 then null else coalesce(ic.known_cost, 0::numeric) end as estimated_cogs,
  case when coalesce(ic.missing_cost_lines, 0) > 0 then null
       else coalesce(co.customer_visible_sell_amount, 0::numeric) - coalesce(ic.known_cost, 0::numeric)
  end as estimated_gross_profit,
  case
    when coalesce(ic.missing_cost_lines, 0) > 0 or coalesce(co.customer_visible_sell_amount, 0::numeric) <= 0 then null
    else round(((coalesce(co.customer_visible_sell_amount, 0::numeric) - coalesce(ic.known_cost, 0::numeric)) / co.customer_visible_sell_amount) * 100::numeric, 2)
  end as estimated_gross_margin_percent,
  coalesce(ic.missing_cost_lines, 0)::bigint as missing_cost_lines,
  coalesce(ic.line_count, 0)::bigint as line_count,
  co.created_at
from public.customer_orders co
left join item_cost ic on ic.order_id = co.id
where co.status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 8. Order approval assessment uses the same cost truth and fails closed.
-- ---------------------------------------------------------------------------

create or replace function private.assess_customer_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.customer_orders%rowtype;
  v_group record;
  v_payment_default numeric := 0;
  v_admin_fee_default numeric := 3;
  v_rule_rate numeric;
  v_rule_active boolean := false;
  v_global_min numeric := 20;
  v_warning_buffer numeric := 5;
  v_reasons jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_line record;
  v_discount_factor numeric := 1;
  v_line_revenue numeric;
  v_line_cost numeric;
  v_line_margin numeric;
  v_total_cost numeric := 0;
  v_net_sales numeric := 0;
  v_order_margin numeric;
  v_missing_cost boolean := false;
  v_credit_limit numeric;
  v_credit_hold boolean := false;
  v_outstanding numeric := 0;
  v_key text;
begin
  select * into v_order
  from public.customer_orders
  where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  select pg.system_key, pg.name, pg.available_for_orders, pg.requires_approval, pg.internal_only
  into v_group
  from public.price_groups pg
  where pg.id = v_order.price_group_id;

  if coalesce(v_group.internal_only,false) or not coalesce(v_group.available_for_orders,true) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','restricted_price_group','label','Price group is internal-only or unavailable for orders','price_group',v_group.name
    ));
  elsif coalesce(v_group.requires_approval,false) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','restricted_price_group','label','Selected price group requires approval','price_group',v_group.name
    ));
  end if;

  if coalesce(v_order.discount_amount,0) > 0 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','order_discount','label','Order-level discount entered','amount',v_order.discount_amount
    ));
  end if;

  select coalesce(pm.commission_percent,0)
  into v_payment_default
  from public.payment_methods pm
  where pm.id = v_order.payment_method_id;

  if abs(coalesce(v_order.payment_commission_percent,0) - coalesce(v_payment_default,0)) > 0.0005 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','payment_commission_override','label','Payment commission differs from the payment-method default',
      'default_percent',v_payment_default,'applied_percent',v_order.payment_commission_percent
    ));
  end if;

  select coalesce(gs.administrative_fee_default_percent,3.000)
  into v_admin_fee_default
  from public.general_settings gs
  where gs.id = 1;
  v_admin_fee_default := coalesce(v_admin_fee_default,3.000);

  if abs(coalesce(v_order.administrative_fee_percent,0) - v_admin_fee_default) > 0.0005 then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','administrative_fee_override','label','Administrative Fee differs from the company default',
      'default_percent',v_admin_fee_default,'applied_percent',v_order.administrative_fee_percent
    ));
  end if;

  select r.tax_rate, r.is_active
  into v_rule_rate, v_rule_active
  from public.order_tax_rules r
  where r.fulfillment_type = v_order.fulfillment_type;

  if coalesce(v_rule_active,false) and v_rule_rate is not null then
    if abs(coalesce(v_order.tax_rate,0) - v_rule_rate) > 0.0005 then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','tax_override','label','Tax rate differs from the configured fulfillment tax rule',
        'fulfillment_type',v_order.fulfillment_type,'configured_rate',v_rule_rate,'applied_rate',v_order.tax_rate
      ));
    end if;
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'type','tax_rule_not_configured','label','No active tax rule is configured for this fulfillment type',
      'fulfillment_type',v_order.fulfillment_type
    ));
  end if;

  select coalesce(ps.default_min_margin_percent,20), coalesce(ps.warning_margin_buffer_percent,5)
  into v_global_min, v_warning_buffer
  from public.pricing_settings ps
  where ps.id = 1;

  if coalesce(v_order.subtotal,0) > 0 then
    v_discount_factor := greatest(coalesce(v_order.customer_visible_sell_amount,0),0) / v_order.subtotal;
  end if;

  for v_line in
    select
      i.id, i.product_id, i.sku_snapshot, i.product_name_snapshot, i.quantity,
      i.unit_price, i.discount_percent, i.line_total, i.price_source,
      coalesce(pms.min_margin_percent, v_global_min) as min_margin_percent,
      case
        when v_order.confirmed_at is not null then
          case when upper(coalesce(i.cost_currency_code, '')) = upper(v_order.currency_code::text)
            then i.unit_cost_snapshot else null end
        else live_cost.amount
      end as cost_amount
    from public.customer_order_items i
    left join public.product_margin_settings pms on pms.product_id = i.product_id
    left join lateral (
      select pp.amount
      from public.product_prices pp
      join public.price_groups pg on pg.id = pp.price_group_id
      where v_order.confirmed_at is null
        and pp.product_id = i.product_id
        and upper(pp.currency_code::text) = upper(v_order.currency_code::text)
        and pg.system_key = 'cost'
        and coalesce(pg.internal_only, false) = true
        and coalesce(pg.is_active, true) = true
        and pp.is_active = true
        and pp.valid_from <= now()
        and (pp.valid_to is null or pp.valid_to > now())
      order by pp.valid_from desc, pp.created_at desc, pp.id desc
      limit 1
    ) live_cost on true
    where i.order_id = p_order_id
    order by i.line_no
  loop
    if v_line.price_source = 'manual' then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','manual_price','label','Manual unit price used','sku',v_line.sku_snapshot,'unit_price',v_line.unit_price
      ));
    end if;

    if coalesce(v_line.discount_percent,0) > 0 then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','line_discount','label','Line discount entered','sku',v_line.sku_snapshot,'discount_percent',v_line.discount_percent
      ));
    end if;

    v_line_revenue := coalesce(v_line.line_total,0) * v_discount_factor;
    v_net_sales := v_net_sales + v_line_revenue;

    if v_line.cost_amount is null then
      v_missing_cost := true;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','cost_missing','label','Canonical product cost is missing; margin cannot be validated','sku',v_line.sku_snapshot
      ));
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'sku',v_line.sku_snapshot,'revenue',round(v_line_revenue,4),'cost',null,'margin_percent',null,'minimum_margin_percent',v_line.min_margin_percent
      ));
    else
      v_line_cost := coalesce(v_line.cost_amount,0) * coalesce(v_line.quantity,0);
      v_total_cost := v_total_cost + v_line_cost;
      v_line_margin := case when v_line_revenue > 0 then ((v_line_revenue - v_line_cost) / v_line_revenue) * 100 else -100 end;

      if v_line_margin < v_line.min_margin_percent then
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
          'type','margin_below_minimum','label','Margin is below the allowed minimum','sku',v_line.sku_snapshot,
          'margin_percent',round(v_line_margin,3),'minimum_margin_percent',v_line.min_margin_percent
        ));
      elsif v_line_margin < (v_line.min_margin_percent + v_warning_buffer) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'type','margin_warning','label','Margin is close to the minimum','sku',v_line.sku_snapshot,
          'margin_percent',round(v_line_margin,3),'minimum_margin_percent',v_line.min_margin_percent
        ));
      end if;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'sku',v_line.sku_snapshot,
        'revenue',round(v_line_revenue,4),
        'cost',round(v_line_cost,4),
        'margin_percent',round(v_line_margin,3),
        'minimum_margin_percent',v_line.min_margin_percent
      ));
    end if;
  end loop;

  v_order_margin := case
    when v_missing_cost or v_net_sales <= 0 then null
    else ((v_net_sales - v_total_cost) / v_net_sales) * 100
  end;

  select coalesce(ccs.credit_hold,false), ccs.credit_limit
  into v_credit_hold, v_credit_limit
  from public.customer_commercial_settings ccs
  where ccs.customer_id = v_order.customer_id;

  if coalesce(v_credit_hold,false) then
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type','customer_credit_hold','label','Customer is currently on credit hold'
    ));
  end if;

  if v_credit_limit is not null then
    select coalesce(sum(greatest(ci.total_amount - ci.paid_amount,0)),0)
    into v_outstanding
    from public.customer_invoices ci
    where ci.customer_id = v_order.customer_id
      and ci.status in ('issued','partially_paid','overdue');

    if (v_outstanding + coalesce(v_order.grand_total,v_order.total_amount,0)) > v_credit_limit then
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type','credit_limit_exceeded','label','Order would exceed the customer credit limit',
        'credit_limit',v_credit_limit,'current_outstanding',v_outstanding,'order_total',coalesce(v_order.grand_total,v_order.total_amount,0)
      ));
    end if;
  end if;

  select md5(jsonb_build_object(
    'price_group_id',v_order.price_group_id,
    'fulfillment_type',v_order.fulfillment_type,
    'payment_method_id',v_order.payment_method_id,
    'payment_commission_percent',v_order.payment_commission_percent,
    'administrative_fee_percent',v_order.administrative_fee_percent,
    'administrative_fee_amount',v_order.administrative_fee_amount,
    'customer_visible_sell_amount',v_order.customer_visible_sell_amount,
    'discount_amount',v_order.discount_amount,
    'tax_rate',v_order.tax_rate,
    'subtotal',v_order.subtotal,
    'grand_total',v_order.grand_total,
    'cost_evaluation',v_lines,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,'quantity',i.quantity,'unit_price',i.unit_price,
        'discount_percent',i.discount_percent,'line_total',i.line_total,'price_source',i.price_source
      ) order by i.line_no)
      from public.customer_order_items i where i.order_id = p_order_id
    ),'[]'::jsonb)
  )::text) into v_key;

  return jsonb_build_object(
    'requires_approval', jsonb_array_length(v_reasons) > 0,
    'approval_key', v_key,
    'reasons', v_reasons,
    'warnings', v_warnings,
    'order_margin_percent', case when v_order_margin is null then null else round(v_order_margin,3) end,
    'net_sales', round(v_net_sales,4),
    'total_cost', case when v_missing_cost then null else round(v_total_cost,4) end,
    'lines', v_lines
  );
end;
$$;

comment on function private.project_commission_gross_profit_basis(uuid, text, text, uuid, uuid) is
  'Canonical GP commission basis. Revenue includes Administrative Fee/order discounts, product COGS is frozen at confirmation, draft COGS uses Cost price, and fixed Contractor obligations are direct Project cost.';
comment on function private.project_direct_cost_basis(uuid, text, text, uuid, uuid) is
  'Returns fixed Contractor obligations as direct Project cost for the requested commission scope. Cancelled obligations are excluded; paid/accrued costs remain real costs.';
comment on function private.get_customer_project_financial_summary(uuid) is
  'Project financial rollup using customer_visible_sell_amount, frozen/live canonical product COGS, fail-closed missing cost, and fixed Contractor direct Project cost.';
