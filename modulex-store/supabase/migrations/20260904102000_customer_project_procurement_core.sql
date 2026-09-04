-- PB-3B Project Procurement core model.
-- Customer Orders remain demand truth. Procurement records vendor-facing operational truth.

create table public.customer_project_procurement_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  order_item_id uuid not null,
  source_kind text not null check (source_kind in ('order_item','countertop_stone','countertop_sink')),
  configuration_id uuid null references public.countertop_configurations(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  required_quantity numeric(18,4) null check (required_quantity is null or required_quantity > 0),
  vendor_code text null,
  vendor_name_snapshot text null,
  vendor_source text not null default 'unresolved' check (vendor_source in ('catalog','metadata','manual','unresolved')),
  expected_unit_cost numeric(18,4) null check (expected_unit_cost is null or expected_unit_cost >= 0),
  expected_cost_currency varchar(3) null check (expected_cost_currency is null or expected_cost_currency ~ '^[A-Z]{3}$'),
  is_current boolean not null default true,
  retired_reason text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_project_procurement_requirement_current_source_uidx
  on public.customer_project_procurement_requirements(order_item_id, source_kind)
  where is_current;

create table public.customer_project_procurement_commitments (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.customer_project_procurement_requirements(id) on delete restrict,
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  order_item_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  vendor_code text not null check (btrim(vendor_code) <> ''),
  vendor_name_snapshot text not null check (btrim(vendor_name_snapshot) <> ''),
  ordered_quantity numeric(18,4) not null check (ordered_quantity > 0),
  agreed_unit_cost numeric(18,4) not null check (agreed_unit_cost >= 0),
  currency_code varchar(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  vendor_order_no text not null check (btrim(vendor_order_no) <> ''),
  status text not null default 'ordered' check (status in ('ordered','confirmed','cancelled')),
  ordered_at timestamptz not null default now(),
  ordered_by uuid null references public.profiles(id) on delete set null,
  confirmed_at timestamptz null,
  confirmed_by uuid null references public.profiles(id) on delete set null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references public.profiles(id) on delete set null,
  cancellation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_project_procurement_delivery_events (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.customer_project_procurement_commitments(id) on delete restrict,
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0),
  event_type text not null check (event_type in ('delivery','correction')),
  delivered_date date not null,
  notes text null,
  correction_of_event_id uuid null references public.customer_project_procurement_delivery_events(id) on delete restrict,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (event_type = 'delivery' and quantity_delta > 0 and correction_of_event_id is null)
    or
    (event_type = 'correction' and quantity_delta < 0 and correction_of_event_id is not null and nullif(btrim(coalesce(reason,'')), '') is not null)
  )
);

create table public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null check (btrim(vendor_code) <> ''),
  vendor_name_snapshot text not null check (btrim(vendor_name_snapshot) <> ''),
  invoice_number text not null check (btrim(invoice_number) <> ''),
  invoice_number_key text not null check (btrim(invoice_number_key) <> ''),
  invoice_date date not null,
  total_amount numeric(18,4) not null check (total_amount > 0),
  currency_code varchar(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vendor_code, invoice_number_key)
);

create table public.customer_project_procurement_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on delete restrict,
  commitment_id uuid not null references public.customer_project_procurement_commitments(id) on delete restrict,
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0),
  amount_delta numeric(18,4) not null check (amount_delta <> 0),
  currency_code varchar(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  reversal_of_allocation_id uuid null references public.customer_project_procurement_invoice_allocations(id) on delete restrict,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((quantity_delta > 0 and amount_delta > 0) or (quantity_delta < 0 and amount_delta < 0)),
  check (
    (quantity_delta > 0 and reversal_of_allocation_id is null)
    or
    (quantity_delta < 0 and reversal_of_allocation_id is not null and nullif(btrim(coalesce(reason,'')), '') is not null)
  )
);

create table public.customer_project_procurement_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  requirement_id uuid null references public.customer_project_procurement_requirements(id) on delete restrict,
  commitment_id uuid null references public.customer_project_procurement_commitments(id) on delete restrict,
  invoice_id uuid null references public.vendor_invoices(id) on delete restrict,
  allocation_id uuid null references public.customer_project_procurement_invoice_allocations(id) on delete restrict,
  event_type text not null check (btrim(event_type) <> ''),
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index customer_project_procurement_requirements_project_idx
  on public.customer_project_procurement_requirements(project_id, is_current);
create index customer_project_procurement_requirements_order_idx
  on public.customer_project_procurement_requirements(order_id, is_current);
create index customer_project_procurement_requirements_product_idx
  on public.customer_project_procurement_requirements(product_id);
create index customer_project_procurement_requirements_configuration_idx
  on public.customer_project_procurement_requirements(configuration_id) where configuration_id is not null;
create index customer_project_procurement_requirements_created_by_idx
  on public.customer_project_procurement_requirements(created_by) where created_by is not null;
create index customer_project_procurement_requirements_updated_by_idx
  on public.customer_project_procurement_requirements(updated_by) where updated_by is not null;

create index customer_project_procurement_commitments_requirement_idx
  on public.customer_project_procurement_commitments(requirement_id, status);
create index customer_project_procurement_commitments_project_idx
  on public.customer_project_procurement_commitments(project_id, created_at desc);
create index customer_project_procurement_commitments_order_idx
  on public.customer_project_procurement_commitments(order_id);
create index customer_project_procurement_commitments_product_idx
  on public.customer_project_procurement_commitments(product_id);
create index customer_project_procurement_commitments_ordered_by_idx
  on public.customer_project_procurement_commitments(ordered_by) where ordered_by is not null;
create index customer_project_procurement_commitments_confirmed_by_idx
  on public.customer_project_procurement_commitments(confirmed_by) where confirmed_by is not null;
create index customer_project_procurement_commitments_cancelled_by_idx
  on public.customer_project_procurement_commitments(cancelled_by) where cancelled_by is not null;

create index customer_project_procurement_delivery_commitment_idx
  on public.customer_project_procurement_delivery_events(commitment_id, created_at);
create index customer_project_procurement_delivery_correction_idx
  on public.customer_project_procurement_delivery_events(correction_of_event_id) where correction_of_event_id is not null;
create index customer_project_procurement_delivery_actor_idx
  on public.customer_project_procurement_delivery_events(actor_id) where actor_id is not null;

create index vendor_invoices_created_by_idx
  on public.vendor_invoices(created_by) where created_by is not null;

create index customer_project_procurement_invoice_alloc_commitment_idx
  on public.customer_project_procurement_invoice_allocations(commitment_id, created_at);
create index customer_project_procurement_invoice_alloc_invoice_idx
  on public.customer_project_procurement_invoice_allocations(invoice_id, created_at);
create index customer_project_procurement_invoice_alloc_project_idx
  on public.customer_project_procurement_invoice_allocations(project_id, created_at);
create index customer_project_procurement_invoice_alloc_reversal_idx
  on public.customer_project_procurement_invoice_allocations(reversal_of_allocation_id) where reversal_of_allocation_id is not null;
create index customer_project_procurement_invoice_alloc_actor_idx
  on public.customer_project_procurement_invoice_allocations(actor_id) where actor_id is not null;

create index customer_project_procurement_events_project_idx
  on public.customer_project_procurement_events(project_id, created_at desc);
create index customer_project_procurement_events_requirement_idx
  on public.customer_project_procurement_events(requirement_id) where requirement_id is not null;
create index customer_project_procurement_events_commitment_idx
  on public.customer_project_procurement_events(commitment_id) where commitment_id is not null;
create index customer_project_procurement_events_invoice_idx
  on public.customer_project_procurement_events(invoice_id) where invoice_id is not null;
create index customer_project_procurement_events_allocation_idx
  on public.customer_project_procurement_events(allocation_id) where allocation_id is not null;
create index customer_project_procurement_events_actor_idx
  on public.customer_project_procurement_events(actor_id) where actor_id is not null;

alter table public.customer_project_procurement_requirements enable row level security;
alter table public.customer_project_procurement_commitments enable row level security;
alter table public.customer_project_procurement_delivery_events enable row level security;
alter table public.vendor_invoices enable row level security;
alter table public.customer_project_procurement_invoice_allocations enable row level security;
alter table public.customer_project_procurement_events enable row level security;

create or replace function private.get_customer_order_procurement_components(p_order_id uuid)
returns table (
  order_item_id uuid,
  source_kind text,
  configuration_id uuid,
  product_id uuid,
  required_quantity numeric(18,4)
)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select
    oi.id,
    'order_item'::text,
    null::uuid,
    oi.product_id,
    oi.quantity::numeric(18,4)
  from public.customer_order_items oi
  join public.products p on p.id = oi.product_id
  join public.product_types pt on pt.id = p.product_type_id
  left join public.countertop_configurations cc on cc.order_item_id = oi.id
  where oi.order_id = $1
    and pt.code <> 'SERVICE'
    and cc.id is null

  union all

  select
    cc.order_item_id,
    'countertop_stone'::text,
    cc.id,
    cc.stone_product_id,
    case when cc.slab_quantity > 0 then cc.slab_quantity::numeric(18,4) else null end
  from public.countertop_configurations cc
  where cc.order_id = $1

  union all

  select
    cc.order_item_id,
    'countertop_sink'::text,
    cc.id,
    cc.sink_product_id,
    1::numeric(18,4)
  from public.countertop_configurations cc
  where cc.order_id = $1
    and cc.sink_product_id is not null;
$$;

create or replace function private.resolve_customer_project_procurement_vendor(p_product_id uuid)
returns table (vendor_code text, vendor_name text, vendor_source text)
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_codes text[];
  v_code text;
  v_name text;
  v_metadata jsonb;
  v_profile_name text;
begin
  select array_agg(distinct lower(btrim(vci.vendor_code)) order by lower(btrim(vci.vendor_code)))
    filter (where nullif(btrim(vci.vendor_code), '') is not null)
  into v_codes
  from public.vendor_catalog_items vci
  where vci.canonical_product_id = p_product_id
    and upper(vci.review_status) = 'APPROVED';

  if coalesce(array_length(v_codes, 1), 0) > 1 then
    return query select null::text, null::text, 'unresolved'::text;
    return;
  end if;

  select p.metadata
  into v_metadata
  from public.products p
  where p.id = p_product_id;

  if coalesce(array_length(v_codes, 1), 0) = 1 then
    v_code := v_codes[1];
    vendor_source := 'catalog';
  else
    v_code := lower(nullif(btrim(coalesce(v_metadata->>'vendor_code', '')), ''));
    vendor_source := case when v_code is null then 'unresolved' else 'metadata' end;
  end if;

  if v_code is null then
    return query select null::text, null::text, 'unresolved'::text;
    return;
  end if;

  select nullif(btrim(sp.vendor_name), '')
  into v_profile_name
  from public.countertop_stone_product_profiles sp
  where sp.product_id = p_product_id
  order by sp.is_active desc, sp.updated_at desc
  limit 1;

  v_name := coalesce(
    nullif(btrim(coalesce(v_metadata->>'vendor_name', '')), ''),
    v_profile_name,
    initcap(replace(v_code, '_', ' '))
  );

  return query select v_code, v_name, vendor_source;
end;
$$;

create or replace function private.get_customer_project_procurement_cost(p_product_id uuid)
returns table (amount numeric(18,4), currency_code varchar(3))
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select
    pc.amount::numeric(18,4),
    upper(pc.currency_code::text)::varchar(3)
  from public.product_costs pc
  where pc.product_id = $1
    and pc.is_active = true
    and pc.valid_from <= now()
    and (pc.valid_to is null or pc.valid_to > now())
  order by pc.valid_from desc, pc.created_at desc
  limit 1;
$$;

create or replace function private.sync_customer_order_procurement(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_order public.customer_orders%rowtype;
  v_component record;
  v_current public.customer_project_procurement_requirements%rowtype;
  v_product record;
  v_vendor_code text;
  v_vendor_name text;
  v_vendor_source text;
  v_cost_amount numeric(18,4);
  v_cost_currency varchar(3);
  v_has_commitments boolean;
  v_processed integer := 0;
  v_retired integer := 0;
begin
  if p_order_id is null then
    raise exception 'Order id is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer_project_procurement:' || p_order_id::text, 0));

  select o.*
  into v_order
  from public.customer_orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.project_id is null or v_order.status = 'draft' then
    return 0;
  end if;

  if v_order.status = 'cancelled' then
    update public.customer_project_procurement_requirements r
    set is_current = false,
        retired_reason = 'order_cancelled',
        updated_by = auth.uid(),
        updated_at = now()
    where r.order_id = p_order_id
      and r.is_current;
    get diagnostics v_retired = row_count;
    return v_retired;
  end if;

  for v_component in
    select *
    from private.get_customer_order_procurement_components(p_order_id)
  loop
    select p.sku, p.name
    into v_product
    from public.products p
    where p.id = v_component.product_id;

    if v_product.sku is null then
      raise exception 'Procurement component product not found.';
    end if;

    select v.vendor_code, v.vendor_name, v.vendor_source
    into v_vendor_code, v_vendor_name, v_vendor_source
    from private.resolve_customer_project_procurement_vendor(v_component.product_id) v;

    v_cost_amount := null;
    v_cost_currency := null;
    select c.amount, c.currency_code
    into v_cost_amount, v_cost_currency
    from private.get_customer_project_procurement_cost(v_component.product_id) c;

    select r.*
    into v_current
    from public.customer_project_procurement_requirements r
    where r.order_id = p_order_id
      and r.order_item_id = v_component.order_item_id
      and r.source_kind = v_component.source_kind
      and r.is_current
    for update;

    if found then
      select exists (
        select 1
        from public.customer_project_procurement_commitments c
        where c.requirement_id = v_current.id
      ) into v_has_commitments;

      if not v_has_commitments then
        update public.customer_project_procurement_requirements r
        set project_id = v_order.project_id,
            configuration_id = v_component.configuration_id,
            product_id = v_component.product_id,
            sku_snapshot = v_product.sku,
            product_name_snapshot = v_product.name,
            required_quantity = v_component.required_quantity,
            vendor_code = case
              when v_current.product_id = v_component.product_id and v_current.vendor_source = 'manual'
                then v_current.vendor_code
              else v_vendor_code
            end,
            vendor_name_snapshot = case
              when v_current.product_id = v_component.product_id and v_current.vendor_source = 'manual'
                then v_current.vendor_name_snapshot
              else v_vendor_name
            end,
            vendor_source = case
              when v_current.product_id = v_component.product_id and v_current.vendor_source = 'manual'
                then 'manual'
              else coalesce(v_vendor_source, 'unresolved')
            end,
            expected_unit_cost = v_cost_amount,
            expected_cost_currency = v_cost_currency,
            retired_reason = null,
            updated_by = auth.uid(),
            updated_at = now()
        where r.id = v_current.id;
      elsif v_current.product_id = v_component.product_id then
        update public.customer_project_procurement_requirements r
        set required_quantity = v_component.required_quantity,
            updated_by = auth.uid(),
            updated_at = now()
        where r.id = v_current.id;
      else
        update public.customer_project_procurement_requirements r
        set is_current = false,
            retired_reason = 'source_product_changed',
            updated_by = auth.uid(),
            updated_at = now()
        where r.id = v_current.id;

        insert into public.customer_project_procurement_requirements (
          project_id, order_id, order_item_id, source_kind, configuration_id,
          product_id, sku_snapshot, product_name_snapshot, required_quantity,
          vendor_code, vendor_name_snapshot, vendor_source,
          expected_unit_cost, expected_cost_currency, created_by, updated_by
        ) values (
          v_order.project_id, p_order_id, v_component.order_item_id, v_component.source_kind, v_component.configuration_id,
          v_component.product_id, v_product.sku, v_product.name, v_component.required_quantity,
          v_vendor_code, v_vendor_name, coalesce(v_vendor_source, 'unresolved'),
          v_cost_amount, v_cost_currency, auth.uid(), auth.uid()
        );
      end if;
    else
      insert into public.customer_project_procurement_requirements (
        project_id, order_id, order_item_id, source_kind, configuration_id,
        product_id, sku_snapshot, product_name_snapshot, required_quantity,
        vendor_code, vendor_name_snapshot, vendor_source,
        expected_unit_cost, expected_cost_currency, created_by, updated_by
      ) values (
        v_order.project_id, p_order_id, v_component.order_item_id, v_component.source_kind, v_component.configuration_id,
        v_component.product_id, v_product.sku, v_product.name, v_component.required_quantity,
        v_vendor_code, v_vendor_name, coalesce(v_vendor_source, 'unresolved'),
        v_cost_amount, v_cost_currency, auth.uid(), auth.uid()
      );
    end if;

    v_processed := v_processed + 1;
  end loop;

  update public.customer_project_procurement_requirements r
  set is_current = false,
      retired_reason = 'source_removed',
      updated_by = auth.uid(),
      updated_at = now()
  where r.order_id = p_order_id
    and r.is_current
    and not exists (
      select 1
      from private.get_customer_order_procurement_components(p_order_id) c
      where c.order_item_id = r.order_item_id
        and c.source_kind = r.source_kind
    );

  return v_processed;
end;
$$;

revoke all on function private.get_customer_order_procurement_components(uuid) from public, anon, authenticated;
revoke all on function private.resolve_customer_project_procurement_vendor(uuid) from public, anon, authenticated;
revoke all on function private.get_customer_project_procurement_cost(uuid) from public, anon, authenticated;
revoke all on function private.sync_customer_order_procurement(uuid) from public, anon, authenticated;
