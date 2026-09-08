-- P6 — accepted Project Proposal -> canonical Draft Order conversion.
-- Accepted Proposal amounts are customer-visible pre-tax truth. Administrative Fee is
-- reverse-netted into internal SERVICE base lines and never added on top of acceptance.

create table if not exists public.customer_project_proposal_order_conversions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id),
  proposal_id uuid not null references public.customer_project_proposals(id),
  proposal_revision_id uuid not null references public.customer_project_proposal_revisions(id),
  acceptance_id uuid not null references public.customer_project_proposal_acceptances(id),
  order_id uuid not null references public.customer_orders(id),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  proposal_number_snapshot text not null,
  revision_no_snapshot integer not null,
  currency_code varchar(3) not null,
  accepted_scope_sell_amount numeric(18,2) not null check (accepted_scope_sell_amount >= 0),
  administrative_fee_percent_snapshot numeric(7,3) not null check (administrative_fee_percent_snapshot between 0 and 100),
  created_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint customer_project_proposal_order_conversions_order_key unique(order_id),
  constraint customer_project_proposal_order_conversions_idempotency_key unique(idempotency_key)
);

create table if not exists public.customer_project_proposal_order_conversion_lines (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid not null references public.customer_project_proposal_order_conversions(id),
  commercial_unit_kind text not null check (commercial_unit_kind in ('direct_area','pricing_group')),
  proposal_pricing_group_id uuid null references public.customer_project_proposal_pricing_groups(id),
  direct_proposal_area_id uuid null references public.customer_project_proposal_areas(id),
  initial_order_item_id uuid null references public.customer_order_items(id) on delete set null,
  label_snapshot text not null,
  description_snapshot text null,
  accepted_sell_amount numeric(18,2) not null check (accepted_sell_amount >= 0),
  base_sell_amount_snapshot numeric(18,2) not null check (base_sell_amount_snapshot >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint customer_project_proposal_order_conversion_lines_source_ck check (
    (commercial_unit_kind='direct_area' and direct_proposal_area_id is not null and proposal_pricing_group_id is null)
    or
    (commercial_unit_kind='pricing_group' and proposal_pricing_group_id is not null and direct_proposal_area_id is null)
  )
);

create table if not exists public.customer_project_proposal_order_conversion_areas (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid not null references public.customer_project_proposal_order_conversions(id),
  conversion_line_id uuid not null references public.customer_project_proposal_order_conversion_lines(id),
  proposal_area_id uuid not null references public.customer_project_proposal_areas(id),
  area_name_snapshot text not null,
  material_description_snapshot text null,
  scope_notes_snapshot text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint customer_project_proposal_order_conversion_areas_area_key unique(proposal_area_id)
);

create index if not exists customer_project_proposal_order_conversions_project_idx
  on public.customer_project_proposal_order_conversions(project_id, created_at desc);
create index if not exists customer_project_proposal_order_conversions_proposal_idx
  on public.customer_project_proposal_order_conversions(proposal_id, created_at desc);
create index if not exists customer_project_proposal_order_conversions_revision_idx
  on public.customer_project_proposal_order_conversions(proposal_revision_id, created_at desc);
create index if not exists customer_project_proposal_order_conversions_acceptance_idx
  on public.customer_project_proposal_order_conversions(acceptance_id);
create index if not exists customer_project_proposal_order_conversions_created_by_idx
  on public.customer_project_proposal_order_conversions(created_by);
create index if not exists customer_project_proposal_order_conversion_lines_conversion_idx
  on public.customer_project_proposal_order_conversion_lines(conversion_id, sort_order);
create index if not exists customer_project_proposal_order_conversion_lines_order_item_idx
  on public.customer_project_proposal_order_conversion_lines(initial_order_item_id);
create index if not exists customer_project_proposal_order_conversion_lines_group_idx
  on public.customer_project_proposal_order_conversion_lines(proposal_pricing_group_id);
create index if not exists customer_project_proposal_order_conversion_lines_direct_area_idx
  on public.customer_project_proposal_order_conversion_lines(direct_proposal_area_id);
create index if not exists customer_project_proposal_order_conversion_areas_conversion_idx
  on public.customer_project_proposal_order_conversion_areas(conversion_id, sort_order);
create index if not exists customer_project_proposal_order_conversion_areas_line_idx
  on public.customer_project_proposal_order_conversion_areas(conversion_line_id);

alter table public.customer_project_proposal_order_conversions enable row level security;
alter table public.customer_project_proposal_order_conversion_lines enable row level security;
alter table public.customer_project_proposal_order_conversion_areas enable row level security;

revoke all on public.customer_project_proposal_order_conversions from public, anon, authenticated;
revoke all on public.customer_project_proposal_order_conversion_lines from public, anon, authenticated;
revoke all on public.customer_project_proposal_order_conversion_areas from public, anon, authenticated;

create or replace function private.reject_project_proposal_order_conversion_immutable()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
begin
  raise exception 'PROPOSAL_ORDER_CONVERSION_IMMUTABLE';
end;
$$;

create or replace function private.guard_project_proposal_order_conversion_line_update()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
begin
  -- The only permitted rewrite is the FK ON DELETE SET NULL unlink of the initial Order item.
  if old.initial_order_item_id is not null
     and new.initial_order_item_id is null
     and new.conversion_id is not distinct from old.conversion_id
     and new.commercial_unit_kind is not distinct from old.commercial_unit_kind
     and new.proposal_pricing_group_id is not distinct from old.proposal_pricing_group_id
     and new.direct_proposal_area_id is not distinct from old.direct_proposal_area_id
     and new.label_snapshot is not distinct from old.label_snapshot
     and new.description_snapshot is not distinct from old.description_snapshot
     and new.accepted_sell_amount is not distinct from old.accepted_sell_amount
     and new.base_sell_amount_snapshot is not distinct from old.base_sell_amount_snapshot
     and new.sort_order is not distinct from old.sort_order
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  raise exception 'PROPOSAL_ORDER_CONVERSION_IMMUTABLE';
end;
$$;

create trigger customer_project_proposal_order_conversions_immutable
before update or delete on public.customer_project_proposal_order_conversions
for each row execute function private.reject_project_proposal_order_conversion_immutable();

create trigger customer_project_proposal_order_conversion_lines_update_guard
before update on public.customer_project_proposal_order_conversion_lines
for each row execute function private.guard_project_proposal_order_conversion_line_update();

create trigger customer_project_proposal_order_conversion_lines_delete_guard
before delete on public.customer_project_proposal_order_conversion_lines
for each row execute function private.reject_project_proposal_order_conversion_immutable();

create trigger customer_project_proposal_order_conversion_areas_immutable
before update or delete on public.customer_project_proposal_order_conversion_areas
for each row execute function private.reject_project_proposal_order_conversion_immutable();

-- Solve internal base cents for accepted customer-visible unit targets using the same
-- proportional Administrative Fee allocation semantics as customer_order_visible_line_pricing.
create or replace function private.project_proposal_order_base_cents(
  p_target_cents bigint[],
  p_administrative_fee_percent numeric
)
returns bigint[]
language plpgsql
immutable
set search_path = 'pg_catalog'
as $$
declare
  v_n integer := cardinality(p_target_cents);
  v_fee numeric := round(coalesce(p_administrative_fee_percent,0),3);
  v_total_target bigint := 0;
  v_guess bigint;
  v_total_base bigint := -1;
  v_candidate bigint;
  v_fee_total bigint;
  v_base bigint[];
  v_visible bigint[];
  v_fee_alloc bigint[];
  v_allocated bigint := 0;
  v_fee_floor_sum bigint;
  v_last_positive integer;
  v_positive integer;
  v_negative integer;
  v_i integer;
  v_iter integer;
begin
  if v_n is null or v_n = 0 then
    raise exception 'PROPOSAL_ORDER_AREA_SELECTION_REQUIRED';
  end if;
  if v_fee < 0 or v_fee > 100 then
    raise exception 'Administrative Fee must be between 0 and 100.';
  end if;

  for v_i in 1..v_n loop
    if p_target_cents[v_i] is null or p_target_cents[v_i] < 0 then
      raise exception 'PROPOSAL_ORDER_ACCEPTED_AMOUNT_INVALID';
    end if;
    v_total_target := v_total_target + p_target_cents[v_i];
  end loop;

  if v_total_target = 0 then
    return array_fill(0::bigint, array[v_n]);
  end if;

  v_guess := floor((v_total_target::numeric * 100) / (100 + v_fee))::bigint;
  for v_candidate in greatest(0::bigint, v_guess - 2000)..(v_guess + 2000) loop
    if v_candidate + round(v_candidate::numeric * (v_fee / 100))::bigint = v_total_target then
      v_total_base := v_candidate;
      exit;
    end if;
  end loop;
  if v_total_base < 0 then
    raise exception 'PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED';
  end if;

  v_base := array_fill(0::bigint, array[v_n]);
  v_last_positive := null;
  v_allocated := 0;
  for v_i in 1..v_n loop
    if p_target_cents[v_i] > 0 then
      v_last_positive := v_i;
      v_base[v_i] := floor(v_total_base::numeric * p_target_cents[v_i] / v_total_target)::bigint;
      v_allocated := v_allocated + v_base[v_i];
    end if;
  end loop;
  if v_last_positive is null then
    return v_base;
  end if;
  v_base[v_last_positive] := v_base[v_last_positive] + (v_total_base - v_allocated);

  v_fee_total := v_total_target - v_total_base;
  for v_iter in 1..10000 loop
    v_visible := array_fill(0::bigint, array[v_n]);
    v_fee_alloc := array_fill(0::bigint, array[v_n]);
    v_fee_floor_sum := 0;
    v_last_positive := null;

    for v_i in 1..v_n loop
      v_visible[v_i] := v_base[v_i];
      if v_base[v_i] > 0 then
        v_last_positive := v_i;
        if v_fee_total > 0 and v_total_base > 0 then
          v_fee_alloc[v_i] := floor(v_fee_total::numeric * v_base[v_i] / v_total_base)::bigint;
          v_fee_floor_sum := v_fee_floor_sum + v_fee_alloc[v_i];
        end if;
      end if;
    end loop;
    if v_last_positive is not null then
      v_fee_alloc[v_last_positive] := v_fee_alloc[v_last_positive] + (v_fee_total - v_fee_floor_sum);
    end if;
    for v_i in 1..v_n loop
      v_visible[v_i] := v_visible[v_i] + v_fee_alloc[v_i];
    end loop;

    v_positive := null;
    v_negative := null;
    for v_i in 1..v_n loop
      if p_target_cents[v_i] - v_visible[v_i] > 0 and v_positive is null then v_positive := v_i; end if;
      if p_target_cents[v_i] - v_visible[v_i] < 0 and v_negative is null then v_negative := v_i; end if;
    end loop;

    if v_positive is null and v_negative is null then
      return v_base;
    end if;
    if v_positive is null or v_negative is null or v_base[v_negative] <= 0 then
      exit;
    end if;

    v_base[v_positive] := v_base[v_positive] + 1;
    v_base[v_negative] := v_base[v_negative] - 1;
  end loop;

  raise exception 'PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED';
end;
$$;

create or replace function public.get_project_proposal_order_conversion_preview(p_revision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_revision public.customer_project_proposal_revisions%rowtype;
  v_proposal public.customer_project_proposals%rowtype;
  v_project public.customer_projects%rowtype;
  v_customer public.customers%rowtype;
  v_units jsonb;
begin
  if not private.can_view_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_VIEW_FORBIDDEN' using errcode='42501';
  end if;

  select * into v_revision from public.customer_project_proposal_revisions where id=p_revision_id;
  if not found then raise exception 'PROPOSAL_REVISION_NOT_FOUND'; end if;
  if v_revision.state <> 'accepted' then raise exception 'PROPOSAL_ORDER_REVISION_NOT_ACCEPTED'; end if;
  if not exists(select 1 from public.customer_project_proposal_acceptances a where a.revision_id=v_revision.id) then
    raise exception 'PROPOSAL_ORDER_ACCEPTANCE_MISSING';
  end if;

  select * into v_proposal from public.customer_project_proposals where id=v_revision.proposal_id;
  select * into v_project from public.customer_projects where id=v_proposal.project_id;
  select * into v_customer from public.customers where id=v_project.customer_id;

  with direct_units as (
    select
      a.sort_order,
      'direct_area'::text as kind,
      a.id::text as unit_id,
      a.area_name as label,
      coalesce(a.direct_sell_amount,0)::numeric(18,2) as accepted_sell_amount,
      jsonb_build_array(jsonb_build_object('id',a.id,'area_name',a.area_name)) as areas,
      cc.order_id as converted_order_id,
      co.order_number as converted_order_number
    from public.customer_project_proposal_areas a
    left join public.customer_project_proposal_order_conversion_areas ca on ca.proposal_area_id=a.id
    left join public.customer_project_proposal_order_conversions cc on cc.id=ca.conversion_id
    left join public.customer_orders co on co.id=cc.order_id
    where a.revision_id=v_revision.id and a.pricing_group_id is null
  ), group_units as (
    select
      min(a.sort_order) as sort_order,
      'pricing_group'::text as kind,
      g.id::text as unit_id,
      g.label,
      g.sell_amount::numeric(18,2) as accepted_sell_amount,
      jsonb_agg(jsonb_build_object('id',a.id,'area_name',a.area_name) order by a.sort_order,a.id) as areas,
      min(cc.order_id) filter(where cc.order_id is not null) as converted_order_id,
      min(co.order_number) filter(where co.order_number is not null) as converted_order_number
    from public.customer_project_proposal_pricing_groups g
    join public.customer_project_proposal_areas a on a.pricing_group_id=g.id and a.revision_id=g.revision_id
    left join public.customer_project_proposal_order_conversion_areas ca on ca.proposal_area_id=a.id
    left join public.customer_project_proposal_order_conversions cc on cc.id=ca.conversion_id
    left join public.customer_orders co on co.id=cc.order_id
    where g.revision_id=v_revision.id
    group by g.id,g.label,g.sell_amount
  ), units as (
    select * from direct_units union all select * from group_units
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',kind,
    'unit_id',unit_id,
    'label',label,
    'accepted_sell_amount',accepted_sell_amount,
    'areas',areas,
    'converted_order_id',converted_order_id,
    'converted_order_number',converted_order_number
  ) order by sort_order,kind,unit_id),'[]'::jsonb)
  into v_units from units;

  return jsonb_build_object(
    'project_id',v_project.id,
    'customer_id',v_customer.id,
    'proposal_id',v_proposal.id,
    'proposal_number',v_proposal.proposal_number,
    'revision_id',v_revision.id,
    'revision_no',v_revision.revision_no,
    'state',v_revision.state,
    'currency_code',v_revision.currency_code,
    'units',v_units
  );
end;
$$;

create or replace function public.create_order_from_accepted_project_proposal(
  p_revision_id uuid,
  p_selected_area_ids uuid[],
  p_idempotency_key uuid,
  p_price_group_id uuid,
  p_billing_address_id uuid default null,
  p_shipping_address_id uuid default null,
  p_expected_delivery_date date default null,
  p_customer_reference text default null,
  p_customer_notes text default null,
  p_internal_notes text default null,
  p_tax_rate numeric default 0,
  p_payment_method_id uuid default null,
  p_fulfillment_type text default null,
  p_administrative_fee_percent numeric default 3.000
)
returns uuid
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_revision public.customer_project_proposal_revisions%rowtype;
  v_proposal public.customer_project_proposals%rowtype;
  v_project public.customer_projects%rowtype;
  v_customer public.customers%rowtype;
  v_acceptance public.customer_project_proposal_acceptances%rowtype;
  v_existing public.customer_project_proposal_order_conversions%rowtype;
  v_selected uuid[];
  v_selected_count integer;
  v_fee numeric(7,3) := round(coalesce(p_administrative_fee_percent,3),3);
  v_fingerprint text;
  v_request_identity jsonb;
  v_service_product_id uuid;
  v_service_count integer;
  v_units jsonb;
  v_targets bigint[];
  v_bases bigint[];
  v_items jsonb := '[]'::jsonb;
  v_unit jsonb;
  v_n integer;
  v_i integer;
  v_order_id uuid;
  v_order public.customer_orders%rowtype;
  v_order_item_ids uuid[];
  v_visible_targets bigint[];
  v_conversion_id uuid;
  v_conversion_line_id uuid;
  v_conversion_line_ids uuid[];
  v_total_target bigint := 0;
  v_area_count integer;
  v_line_note text;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode='42501';
  end if;
  if p_idempotency_key is null then raise exception 'PROPOSAL_ORDER_IDEMPOTENCY_REQUIRED'; end if;
  if p_selected_area_ids is null or cardinality(p_selected_area_ids)=0 then raise exception 'PROPOSAL_ORDER_AREA_SELECTION_REQUIRED'; end if;
  if v_fee < 0 or v_fee > 100 then raise exception 'Administrative Fee must be between 0 and 100.'; end if;

  select array_agg(x order by x), count(*) into v_selected, v_selected_count
  from (select distinct unnest(p_selected_area_ids) as x) s;
  if v_selected_count <> cardinality(p_selected_area_ids) then raise exception 'PROPOSAL_ORDER_AREA_SELECTION_DUPLICATE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_revision_id::text,0));

  select * into v_revision from public.customer_project_proposal_revisions where id=p_revision_id for update;
  if not found then raise exception 'PROPOSAL_REVISION_NOT_FOUND'; end if;
  if v_revision.state <> 'accepted' then raise exception 'PROPOSAL_ORDER_REVISION_NOT_ACCEPTED'; end if;

  select * into v_acceptance
  from public.customer_project_proposal_acceptances a
  where a.revision_id=v_revision.id
  order by a.accepted_at,a.id limit 1;
  if not found then raise exception 'PROPOSAL_ORDER_ACCEPTANCE_MISSING'; end if;

  select * into v_proposal from public.customer_project_proposals where id=v_revision.proposal_id for update;
  select * into v_project from public.customer_projects where id=v_proposal.project_id for update;
  select * into v_customer from public.customers where id=v_project.customer_id;

  if upper(v_revision.currency_code) <> upper(coalesce(v_customer.currency_code,'USD')) then
    raise exception 'PROPOSAL_ORDER_CURRENCY_MISMATCH';
  end if;

  select count(*) into v_area_count
  from public.customer_project_proposal_areas a
  where a.revision_id=v_revision.id and a.id=any(v_selected);
  if v_area_count <> cardinality(v_selected) then raise exception 'PROPOSAL_ORDER_AREA_REVISION_MISMATCH'; end if;

  v_request_identity := jsonb_build_object(
    'revision_id',v_revision.id,
    'area_ids',to_jsonb(v_selected),
    'price_group_id',p_price_group_id,
    'billing_address_id',p_billing_address_id,
    'shipping_address_id',p_shipping_address_id,
    'expected_delivery_date',p_expected_delivery_date,
    'customer_reference',nullif(btrim(coalesce(p_customer_reference,'')),'') ,
    'customer_notes',nullif(btrim(coalesce(p_customer_notes,'')),'') ,
    'internal_notes',nullif(btrim(coalesce(p_internal_notes,'')),'') ,
    'tax_rate',round(coalesce(p_tax_rate,0),3),
    'payment_method_id',p_payment_method_id,
    'fulfillment_type',nullif(btrim(coalesce(p_fulfillment_type,'')),'') ,
    'administrative_fee_percent',v_fee,
    'order_discount_amount',0
  );
  v_fingerprint := md5(v_request_identity::text);

  select * into v_existing
  from public.customer_project_proposal_order_conversions c
  where c.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception 'PROPOSAL_ORDER_IDEMPOTENCY_MISMATCH'; end if;
    return v_existing.order_id;
  end if;

  if exists(
    select 1 from public.customer_project_proposal_order_conversion_areas ca
    where ca.proposal_area_id=any(v_selected)
  ) then raise exception 'PROPOSAL_ORDER_AREA_ALREADY_CONVERTED'; end if;

  if exists(
    select 1
    from public.customer_project_proposal_areas a
    where a.revision_id=v_revision.id and a.pricing_group_id in (
      select distinct s.pricing_group_id
      from public.customer_project_proposal_areas s
      where s.id=any(v_selected) and s.pricing_group_id is not null
    )
    group by a.pricing_group_id
    having count(*) <> count(*) filter(where a.id=any(v_selected))
  ) then raise exception 'PROPOSAL_ORDER_PRICING_GROUP_PARTIAL'; end if;

  select count(*), min(p.id) into v_service_count, v_service_product_id
  from public.products p
  join public.product_types pt on pt.id=p.product_type_id
  where p.status='active' and p.sku='SERVICE' and pt.code='SERVICE' and pt.pricing_model='manual_service';
  if v_service_count <> 1 then raise exception 'PROPOSAL_ORDER_SERVICE_PRODUCT_INVALID'; end if;

  -- Customer-safe snapshots intentionally exclude internal_notes, measurement_notes,
  -- readiness_status, status_note and supplier_snapshot.
  with direct_units as (
    select
      a.sort_order,
      'direct_area'::text as kind,
      a.id as direct_area_id,
      null::uuid as pricing_group_id,
      a.area_name as label,
      concat_ws(' · ',
        'Proposal '||v_proposal.proposal_number||' Rev '||v_revision.revision_no,
        'Area: '||a.area_name,
        nullif(a.material_description,''),
        case when nullif(a.finish,'') is not null then 'Finish: '||a.finish end,
        case when nullif(a.thickness,'') is not null then 'Thickness: '||a.thickness end,
        nullif(a.scope_notes,'')
      ) as line_note,
      coalesce(a.direct_sell_amount,0)::numeric(18,2) as accepted_sell_amount,
      jsonb_build_array(a.id) as area_ids
    from public.customer_project_proposal_areas a
    where a.revision_id=v_revision.id and a.id=any(v_selected) and a.pricing_group_id is null
  ), group_units as (
    select
      min(a.sort_order) as sort_order,
      'pricing_group'::text as kind,
      null::uuid as direct_area_id,
      g.id as pricing_group_id,
      g.label,
      concat_ws(' · ',
        'Proposal '||v_proposal.proposal_number||' Rev '||v_revision.revision_no,
        'Pricing Group: '||g.label,
        nullif(g.description,''),
        'Areas: '||string_agg(a.area_name,', ' order by a.sort_order,a.id)
      ) as line_note,
      g.sell_amount::numeric(18,2) as accepted_sell_amount,
      jsonb_agg(a.id order by a.sort_order,a.id) as area_ids
    from public.customer_project_proposal_pricing_groups g
    join public.customer_project_proposal_areas a on a.pricing_group_id=g.id and a.revision_id=g.revision_id
    where g.revision_id=v_revision.id and a.id=any(v_selected)
    group by g.id,g.label,g.description,g.sell_amount
  ), units as (
    select * from direct_units union all select * from group_units
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',kind,
    'direct_area_id',direct_area_id,
    'pricing_group_id',pricing_group_id,
    'label',label,
    'line_note',line_note,
    'accepted_sell_amount',accepted_sell_amount,
    'target_cents',round(accepted_sell_amount*100)::bigint,
    'area_ids',area_ids,
    'sort_order',sort_order
  ) order by sort_order,kind,coalesce(direct_area_id::text,pricing_group_id::text)),'[]'::jsonb)
  into v_units from units;

  v_n := jsonb_array_length(v_units);
  if v_n=0 then raise exception 'PROPOSAL_ORDER_AREA_SELECTION_REQUIRED'; end if;

  select array_agg((u.value->>'target_cents')::bigint order by u.ordinality)
  into v_targets
  from jsonb_array_elements(v_units) with ordinality u(value,ordinality);
  v_bases := private.project_proposal_order_base_cents(v_targets,v_fee);

  for v_i in 1..v_n loop
    v_unit := v_units->(v_i-1);
    v_total_target := v_total_target + v_targets[v_i];
    v_line_note := v_unit->>'line_note';
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id',v_service_product_id,
      'quantity',1,
      'unit_price',v_bases[v_i]::numeric/100,
      'discount_percent',0,
      'line_note',v_line_note
    ));
  end loop;

  v_order_id := private.create_project_customer_order(
    p_project_id => v_project.id,
    p_items => v_items,
    p_price_group_id => p_price_group_id,
    p_billing_address_id => p_billing_address_id,
    p_shipping_address_id => p_shipping_address_id,
    p_expected_delivery_date => p_expected_delivery_date,
    p_customer_reference => p_customer_reference,
    p_customer_notes => p_customer_notes,
    p_internal_notes => p_internal_notes,
    p_tax_rate => p_tax_rate,
    p_order_discount_amount => 0,
    p_payment_method_id => p_payment_method_id,
    p_payment_commission_percent => 0,
    p_initial_status => 'draft',
    p_fulfillment_type => p_fulfillment_type,
    p_administrative_fee_percent => v_fee
  );

  select * into v_order from public.customer_orders where id=v_order_id;
  if v_order.project_id <> v_project.id
     or v_order.customer_id <> v_customer.id
     or v_order.status <> 'draft'
     or upper(v_order.currency_code) <> upper(v_revision.currency_code)
     or round(v_order.customer_visible_sell_amount*100)::bigint <> v_total_target then
    raise exception 'PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED';
  end if;

  select array_agg(i.id order by i.line_no) into v_order_item_ids
  from public.customer_order_items i where i.order_id=v_order_id;
  select array_agg(round(v.customer_visible_line_total*100)::bigint order by v.line_no)
  into v_visible_targets
  from private.customer_order_visible_line_pricing(v_order_id) v;
  if cardinality(v_order_item_ids) <> v_n or v_visible_targets is distinct from v_targets then
    raise exception 'PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED';
  end if;

  insert into public.customer_project_proposal_order_conversions(
    project_id,proposal_id,proposal_revision_id,acceptance_id,order_id,idempotency_key,request_fingerprint,
    proposal_number_snapshot,revision_no_snapshot,currency_code,accepted_scope_sell_amount,
    administrative_fee_percent_snapshot,created_by
  ) values (
    v_project.id,v_proposal.id,v_revision.id,v_acceptance.id,v_order_id,p_idempotency_key,v_fingerprint,
    v_proposal.proposal_number,v_revision.revision_no,upper(v_revision.currency_code),v_total_target::numeric/100,
    v_fee,auth.uid()
  ) returning id into v_conversion_id;

  v_conversion_line_ids := array_fill(null::uuid,array[v_n]);
  for v_i in 1..v_n loop
    v_unit := v_units->(v_i-1);
    insert into public.customer_project_proposal_order_conversion_lines(
      conversion_id,commercial_unit_kind,proposal_pricing_group_id,direct_proposal_area_id,initial_order_item_id,
      label_snapshot,description_snapshot,accepted_sell_amount,base_sell_amount_snapshot,sort_order
    ) values (
      v_conversion_id,
      v_unit->>'kind',
      nullif(v_unit->>'pricing_group_id','')::uuid,
      nullif(v_unit->>'direct_area_id','')::uuid,
      v_order_item_ids[v_i],
      v_unit->>'label',
      v_unit->>'line_note',
      v_targets[v_i]::numeric/100,
      v_bases[v_i]::numeric/100,
      coalesce((v_unit->>'sort_order')::integer,v_i)
    ) returning id into v_conversion_line_id;
    v_conversion_line_ids[v_i] := v_conversion_line_id;

    insert into public.customer_project_proposal_order_conversion_areas(
      conversion_id,conversion_line_id,proposal_area_id,area_name_snapshot,material_description_snapshot,scope_notes_snapshot,sort_order
    )
    select
      v_conversion_id,v_conversion_line_id,a.id,a.area_name,a.material_description,a.scope_notes,a.sort_order
    from public.customer_project_proposal_areas a
    where a.id in (
      select (jsonb_array_elements_text(v_unit->'area_ids'))::uuid
    );
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.get_project_proposal_order_conversions(
  p_project_id uuid,
  p_proposal_id uuid default null,
  p_revision_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare v_result jsonb;
begin
  if not private.can_view_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_VIEW_FORBIDDEN' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'project_id',c.project_id,
    'proposal_id',c.proposal_id,
    'revision_id',c.proposal_revision_id,
    'proposal_number',c.proposal_number_snapshot,
    'revision_no',c.revision_no_snapshot,
    'order_id',c.order_id,
    'order_number',o.order_number,
    'order_status',o.status,
    'accepted_scope_sell_amount',c.accepted_scope_sell_amount,
    'currency_code',c.currency_code,
    'created_at',c.created_at,
    'areas',coalesce((select jsonb_agg(jsonb_build_object('id',a.proposal_area_id,'area_name',a.area_name_snapshot) order by a.sort_order,a.id)
      from public.customer_project_proposal_order_conversion_areas a where a.conversion_id=c.id),'[]'::jsonb)
  ) order by c.created_at desc,c.id),'[]'::jsonb)
  into v_result
  from public.customer_project_proposal_order_conversions c
  join public.customer_orders o on o.id=c.order_id
  where c.project_id=p_project_id
    and (p_proposal_id is null or c.proposal_id=p_proposal_id)
    and (p_revision_id is null or c.proposal_revision_id=p_revision_id);
  return v_result;
end;
$$;

create or replace function public.get_customer_order_proposal_origin(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[]) then
    raise exception 'PROPOSAL_ORDER_ORIGIN_VIEW_FORBIDDEN' using errcode='42501';
  end if;
  select jsonb_build_object(
    'conversion_id',c.id,
    'project_id',c.project_id,
    'proposal_id',c.proposal_id,
    'revision_id',c.proposal_revision_id,
    'proposal_number',c.proposal_number_snapshot,
    'revision_no',c.revision_no_snapshot,
    'accepted_scope_sell_amount',c.accepted_scope_sell_amount,
    'currency_code',c.currency_code,
    'created_at',c.created_at,
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'kind',l.commercial_unit_kind,
      'label',l.label_snapshot,
      'accepted_sell_amount',l.accepted_sell_amount,
      'initial_order_item_id',l.initial_order_item_id,
      'areas',coalesce((select jsonb_agg(jsonb_build_object('id',a.proposal_area_id,'area_name',a.area_name_snapshot) order by a.sort_order,a.id)
        from public.customer_project_proposal_order_conversion_areas a where a.conversion_line_id=l.id),'[]'::jsonb)
    ) order by l.sort_order,l.id) from public.customer_project_proposal_order_conversion_lines l where l.conversion_id=c.id),'[]'::jsonb)
  ) into v_result
  from public.customer_project_proposal_order_conversions c
  where c.order_id=p_order_id;
  return v_result;
end;
$$;

revoke all on function private.project_proposal_order_base_cents(bigint[],numeric) from public, anon, authenticated;
revoke all on function public.get_project_proposal_order_conversion_preview(uuid) from public, anon;
revoke all on function public.create_order_from_accepted_project_proposal(uuid,uuid[],uuid,uuid,uuid,uuid,date,text,text,text,numeric,uuid,text,numeric) from public, anon;
revoke all on function public.get_project_proposal_order_conversions(uuid,uuid,uuid) from public, anon;
revoke all on function public.get_customer_order_proposal_origin(uuid) from public, anon;

grant execute on function public.get_project_proposal_order_conversion_preview(uuid) to authenticated;
grant execute on function public.create_order_from_accepted_project_proposal(uuid,uuid[],uuid,uuid,uuid,uuid,date,text,text,text,numeric,uuid,text,numeric) to authenticated;
grant execute on function public.get_project_proposal_order_conversions(uuid,uuid,uuid) to authenticated;
grant execute on function public.get_customer_order_proposal_origin(uuid) to authenticated;
