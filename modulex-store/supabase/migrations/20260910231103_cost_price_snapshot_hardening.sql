-- Cost price authority + confirmed-order COGS snapshots.
-- The internal Cost price group is the canonical product-cost entry surface.

-- Stable identity for the existing internal Cost price group.
do $$
declare
  v_cost_group_id uuid;
  v_cost_group_count integer;
  v_conflict_count integer;
begin
  select count(*)
  into v_cost_group_count
  from public.price_groups pg
  where lower(btrim(pg.name)) = 'cost'
    and coalesce(pg.internal_only, false) = true;

  if v_cost_group_count <> 1 then
    raise exception 'COST_PRICE_GROUP_AMBIGUOUS: expected exactly one internal Cost price group, found %', v_cost_group_count;
  end if;

  select pg.id
  into v_cost_group_id
  from public.price_groups pg
  where lower(btrim(pg.name)) = 'cost'
    and coalesce(pg.internal_only, false) = true
  limit 1;

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

-- Preserve provenance when the operational product_costs history is synchronized.
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

  -- Cost Price is authoritative for the current operational cost. Close any stale
  -- current product_costs row, including legacy rows without provenance.
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
    select 1
    from public.price_groups pg
    where pg.id = old.price_group_id
      and pg.system_key = 'cost'
  ) then
    perform private.sync_product_cost_from_cost_price(old.product_id, old.currency_code::text);
  end if;

  if tg_op <> 'DELETE' and exists (
    select 1
    from public.price_groups pg
    where pg.id = new.price_group_id
      and pg.system_key = 'cost'
  ) then
    perform private.sync_product_cost_from_cost_price(new.product_id, new.currency_code::text);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists product_prices_sync_cost_history on public.product_prices;
create trigger product_prices_sync_cost_history
after insert or update or delete on public.product_prices
for each row execute function private.sync_product_cost_from_cost_price_trigger();

-- Repair the current Cost & Margin operational history from the canonical Cost prices.
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

-- Frozen order-line cost snapshots retain the same 4-decimal precision as Cost prices.
alter table public.customer_order_items
  add column if not exists unit_cost_snapshot numeric(18,4),
  add column if not exists cost_currency_code varchar(3),
  add column if not exists cost_snapshot_at timestamptz,
  add column if not exists cost_source text,
  add column if not exists cost_source_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_unit_cost_snapshot_non_negative'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_unit_cost_snapshot_non_negative
      check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customer_order_items'::regclass
      and conname = 'customer_order_items_cost_currency_format'
  ) then
    alter table public.customer_order_items
      add constraint customer_order_items_cost_currency_format
      check (
        cost_currency_code is null
        or (cost_currency_code = upper(cost_currency_code) and length(cost_currency_code) = 3)
      );
  end if;
end;
$$;

comment on column public.customer_order_items.unit_cost_snapshot is
  'Frozen canonical unit product cost captured when the order is confirmed.';
comment on column public.customer_order_items.cost_currency_code is
  'Currency of the frozen unit product cost.';
comment on column public.customer_order_items.cost_snapshot_at is
  'Order confirmation timestamp used to freeze product cost.';
comment on column public.customer_order_items.cost_source is
  'Canonical source used for frozen product cost. Currently cost_price_group.';
comment on column public.customer_order_items.cost_source_id is
  'Source Cost product_prices row id used for the frozen cost.';

-- Historical lookup is deliberately fail-closed: exactly one Cost price must cover
-- the requested timestamp. Inactive historical rows remain valid only when their
-- valid_to records the end of their effective period.
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
  select
    m.unit_cost,
    m.currency_code,
    m.source_price_id,
    'cost_price_group'::text
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

  -- Draft lines cannot inject a frozen cost. A snapshot that was already frozen is
  -- preserved if lifecycle data is ever moved backwards accidentally.
  if v_confirmed_at is null then
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

    new.unit_cost_snapshot := null;
    new.cost_currency_code := null;
    new.cost_snapshot_at := null;
    new.cost_source := null;
    new.cost_source_id := null;
    return new;
  end if;

  -- Ordinary edits after confirmation never rewrite the already-frozen unit cost.
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

  select r.*
  into v_cost
  from private.resolve_cost_price(new.product_id, v_currency, v_confirmed_at) r
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
  if new.confirmed_at is not null then
    if tg_op = 'INSERT' or old.confirmed_at is null then
      -- A no-op assignment intentionally routes every missing line through the
      -- BEFORE item trigger, which resolves Cost at the order's confirmed_at time.
      update public.customer_order_items oi
      set unit_cost_snapshot = oi.unit_cost_snapshot
      where oi.order_id = new.id
        and oi.unit_cost_snapshot is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_orders_freeze_cost_snapshots on public.customer_orders;
create trigger customer_orders_freeze_cost_snapshots
after insert or update of confirmed_at on public.customer_orders
for each row execute function private.freeze_customer_order_cost_snapshots();

-- Existing confirmed orders receive a historical snapshot only when a unique Cost
-- price covered confirmed_at. Missing/ambiguous cost remains NULL by design.
update public.customer_order_items oi
set unit_cost_snapshot = oi.unit_cost_snapshot
from public.customer_orders co
where co.id = oi.order_id
  and co.confirmed_at is not null
  and oi.unit_cost_snapshot is null;
