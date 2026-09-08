begin;

create table public.customer_project_proposal_order_conversions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  proposal_id uuid not null references public.customer_project_proposals(id) on delete restrict,
  proposal_revision_id uuid not null references public.customer_project_proposal_revisions(id) on delete restrict,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (order_id),
  unique (idempotency_key)
);

create table public.customer_project_proposal_order_conversion_areas (
  conversion_id uuid not null references public.customer_project_proposal_order_conversions(id) on delete restrict,
  proposal_area_id uuid not null references public.customer_project_proposal_areas(id) on delete restrict,
  pricing_group_id uuid null references public.customer_project_proposal_pricing_groups(id) on delete restrict,
  order_item_id uuid null,
  created_at timestamptz not null default now(),
  primary key (conversion_id, proposal_area_id),
  unique (proposal_area_id)
);

comment on column public.customer_project_proposal_order_conversion_areas.order_item_id is
  'Initial generated customer_order_items.id snapshot. Intentionally not an FK so canonical draft Order item replacement remains possible without mutating immutable Proposal conversion provenance.';

create index customer_project_proposal_order_conversions_project_created_idx
  on public.customer_project_proposal_order_conversions(project_id, created_at desc, id);

create index customer_project_proposal_order_conversions_revision_created_idx
  on public.customer_project_proposal_order_conversions(proposal_revision_id, created_at desc, id);

create index customer_project_proposal_order_conversion_areas_conversion_idx
  on public.customer_project_proposal_order_conversion_areas(conversion_id, proposal_area_id);

alter table public.customer_project_proposal_order_conversions enable row level security;
alter table public.customer_project_proposal_order_conversion_areas enable row level security;

revoke all on public.customer_project_proposal_order_conversions from public, anon, authenticated;
revoke all on public.customer_project_proposal_order_conversion_areas from public, anon, authenticated;

create or replace function private.guard_project_proposal_order_conversion_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'INSERT'
     and current_setting('modulex.project_proposal_order_conversion_lifecycle', true) = 'on' then
    return new;
  end if;

  raise exception 'Proposal Order conversion provenance is immutable and may only be created through the canonical lifecycle.'
    using errcode = '42501';
end;
$$;

revoke all on function private.guard_project_proposal_order_conversion_lifecycle() from public, anon, authenticated;

drop trigger if exists customer_project_proposal_order_conversions_lifecycle_guard
  on public.customer_project_proposal_order_conversions;
create trigger customer_project_proposal_order_conversions_lifecycle_guard
before insert or update or delete on public.customer_project_proposal_order_conversions
for each row execute function private.guard_project_proposal_order_conversion_lifecycle();

drop trigger if exists customer_project_proposal_order_conversion_areas_lifecycle_guard
  on public.customer_project_proposal_order_conversion_areas;
create trigger customer_project_proposal_order_conversion_areas_lifecycle_guard
before insert or update or delete on public.customer_project_proposal_order_conversion_areas
for each row execute function private.guard_project_proposal_order_conversion_lifecycle();

create or replace function public.create_order_from_accepted_project_proposal(
  p_project_id uuid,
  p_proposal_id uuid,
  p_revision_id uuid,
  p_area_ids uuid[],
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
  p_fulfillment_type text default 'delivery',
  p_administrative_fee_percent numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text;
  v_customer_id uuid;
  v_proposal_number text;
  v_revision_no integer;
  v_revision_state text;
  v_proposal_status text;
  v_selected_count integer;
  v_distinct_count integer;
  v_source_count integer;
  v_service_product_id uuid;
  v_service_count integer;
  v_order_items jsonb := '[]'::jsonb;
  v_order_id uuid;
  v_conversion public.customer_project_proposal_order_conversions%rowtype;
  v_existing public.customer_project_proposal_order_conversions%rowtype;
  v_group record;
  v_area record;
  v_line record;
  v_source_area_id uuid;
  v_order_item_id uuid;
  v_pricing_group_id uuid;
  v_line_note text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales') then
    raise exception 'PROPOSAL_ORDER_CONVERT_FORBIDDEN' using errcode = '42501';
  end if;

  if p_project_id is null or p_proposal_id is null or p_revision_id is null then
    raise exception 'PROPOSAL_ORDER_SOURCE_REQUIRED' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'PROPOSAL_ORDER_IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_price_group_id is null then
    raise exception 'PROPOSAL_ORDER_PRICE_GROUP_REQUIRED' using errcode = '22023';
  end if;
  if p_area_ids is null or cardinality(p_area_ids) = 0 then
    raise exception 'PROPOSAL_ORDER_AREA_SELECTION_REQUIRED' using errcode = '22023';
  end if;

  select count(*), count(distinct area_id)
    into v_selected_count, v_distinct_count
    from unnest(p_area_ids) as selected(area_id);
  if v_selected_count <> v_distinct_count then
    raise exception 'PROPOSAL_ORDER_AREA_SELECTION_DUPLICATE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_revision_id::text, 0));

  select c.* into v_existing
  from public.customer_project_proposal_order_conversions c
  where c.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.project_id is distinct from p_project_id
       or v_existing.proposal_id is distinct from p_proposal_id
       or v_existing.proposal_revision_id is distinct from p_revision_id then
      raise exception 'PROPOSAL_ORDER_IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;

    select jsonb_build_object(
      'id', c.id,
      'project_id', c.project_id,
      'proposal_id', c.proposal_id,
      'proposal_revision_id', c.proposal_revision_id,
      'order_id', c.order_id,
      'order_number', o.order_number,
      'order_status', o.status,
      'idempotency_key', c.idempotency_key,
      'created_by', c.created_by,
      'created_at', c.created_at,
      'area_ids', coalesce((
        select jsonb_agg(ca.proposal_area_id order by pa.sort_order, ca.proposal_area_id)
        from public.customer_project_proposal_order_conversion_areas ca
        join public.customer_project_proposal_areas pa on pa.id = ca.proposal_area_id
        where ca.conversion_id = c.id
      ), '[]'::jsonb)
    ) into v_result
    from public.customer_project_proposal_order_conversions c
    join public.customer_orders o on o.id = c.order_id
    where c.id = v_existing.id;

    return v_result;
  end if;

  select cp.customer_id,
         pp.proposal_number,
         pr.revision_no,
         pr.state,
         pp.status
    into v_customer_id,
         v_proposal_number,
         v_revision_no,
         v_revision_state,
         v_proposal_status
  from public.customer_projects cp
  join public.customer_project_proposals pp on pp.project_id = cp.id
  join public.customer_project_proposal_revisions pr on pr.proposal_id = pp.id
  where cp.id = p_project_id
    and pp.id = p_proposal_id
    and pr.id = p_revision_id
    and exists (
      select 1
      from public.customer_project_proposal_acceptances acceptance
      where acceptance.revision_id = pr.id
    )
  for update of pp, pr;

  if not found then
    raise exception 'PROPOSAL_ORDER_ACCEPTED_BASELINE_NOT_FOUND' using errcode = '22023';
  end if;

  if v_revision_state <> 'accepted' or v_proposal_status <> 'accepted' then
    raise exception 'PROPOSAL_ORDER_REQUIRES_ACCEPTED_REVISION' using errcode = '22023';
  end if;

  perform 1
  from public.customer_project_proposal_areas a
  where a.revision_id = p_revision_id
    and a.id = any(p_area_ids)
  for update;

  select count(*) into v_source_count
  from public.customer_project_proposal_areas a
  where a.revision_id = p_revision_id
    and a.id = any(p_area_ids);

  if v_source_count <> v_selected_count then
    raise exception 'PROPOSAL_ORDER_AREA_REVISION_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.customer_project_proposal_order_conversion_areas existing
    where existing.proposal_area_id = any(p_area_ids)
  ) then
    raise exception 'PROPOSAL_ORDER_AREA_ALREADY_CONVERTED' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.customer_project_proposal_pricing_groups g
    where g.revision_id = p_revision_id
      and exists (
        select 1
        from public.customer_project_proposal_areas selected_area
        where selected_area.pricing_group_id = g.id
          and selected_area.id = any(p_area_ids)
      )
      and exists (
        select 1
        from public.customer_project_proposal_areas missing_area
        where missing_area.pricing_group_id = g.id
          and not (missing_area.id = any(p_area_ids))
      )
  ) then
    raise exception 'PROPOSAL_ORDER_PRICING_GROUP_PARTIAL' using errcode = '22023';
  end if;

  select count(*), (array_agg(p.id order by p.created_at, p.id))[1]
    into v_service_count, v_service_product_id
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  where p.sku = 'SERVICE'
    and p.status = 'active'
    and pt.code = 'SERVICE'
    and pt.pricing_model = 'manual_service';

  if v_service_count <> 1 or v_service_product_id is null then
    raise exception 'PROPOSAL_ORDER_SERVICE_PRODUCT_INVALID' using errcode = '22023';
  end if;

  -- Customer-safe conversion snapshots intentionally exclude internal_notes,
  -- measurement_notes, readiness_status/status_note, and supplier_snapshot.
  -- Those fields remain Proposal/operational truth and are not copied into line_note.

  for v_group in
    select g.id,
           g.label,
           g.description,
           g.sell_amount,
           min(a.sort_order) as first_sort_order,
           array_agg(a.id order by a.sort_order, a.id) as area_ids,
           string_agg(a.area_name, ', ' order by a.sort_order, a.id) as area_names,
           string_agg(
             concat_ws(' · ',
               a.area_name,
               nullif(btrim(a.material_description), ''),
               case when nullif(btrim(a.finish), '') is not null then 'Finish: ' || btrim(a.finish) end,
               case when nullif(btrim(a.thickness), '') is not null then 'Thickness: ' || btrim(a.thickness) end,
               case when a.sq_ft is not null then 'Sq Ft: ' || a.sq_ft::text end,
               case when a.linear_ft is not null then 'Linear Ft: ' || a.linear_ft::text end,
               case when nullif(btrim(a.edge_profile), '') is not null then 'Edge: ' || btrim(a.edge_profile) end,
               case when a.edge_linear_ft is not null then 'Edge LF: ' || a.edge_linear_ft::text end,
               case when a.sink_quantity is not null then 'Sinks: ' || a.sink_quantity::text end,
               case when nullif(btrim(a.sink_source), '') is not null then 'Sink: ' || btrim(a.sink_source) end,
               case when a.sink_cutout_quantity is not null then 'Cutouts: ' || a.sink_cutout_quantity::text end,
               case when nullif(btrim(a.backsplash), '') is not null then 'Backsplash: ' || btrim(a.backsplash) end,
               nullif(btrim(a.backsplash_notes), ''),
               nullif(btrim(a.scope_notes), '')
             ),
             ' | ' order by a.sort_order, a.id
           ) as scope_summary
    from public.customer_project_proposal_pricing_groups g
    join public.customer_project_proposal_areas a on a.pricing_group_id = g.id
    where g.revision_id = p_revision_id
      and a.id = any(p_area_ids)
    group by g.id, g.label, g.description, g.sell_amount
    order by min(a.sort_order), g.id
  loop
    v_line_note := concat_ws(' · ',
      'Proposal ' || v_proposal_number || ' Revision ' || v_revision_no::text,
      'Pricing Group: ' || v_group.label,
      case when nullif(btrim(v_group.description), '') is not null then btrim(v_group.description) end,
      'Areas: ' || v_group.area_names,
      nullif(btrim(v_group.scope_summary), '')
    );

    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_product_id,
      'quantity', 1,
      'discount_percent', 0,
      'pricing_model', 'manual_service',
      'unit_price', v_group.sell_amount,
      'line_note', v_line_note,
      'proposal_area_ids', to_jsonb(v_group.area_ids),
      'proposal_pricing_group_id', v_group.id
    ));
  end loop;

  for v_area in
    select a.*,
           t.name as area_type_name
    from public.customer_project_proposal_areas a
    left join public.proposal_area_types t on t.id = a.area_type_id
    where a.revision_id = p_revision_id
      and a.id = any(p_area_ids)
      and a.pricing_group_id is null
    order by a.sort_order, a.id
  loop
    v_line_note := concat_ws(' · ',
      'Proposal ' || v_proposal_number || ' Revision ' || v_revision_no::text,
      'Area: ' || v_area.area_name,
      case when nullif(btrim(v_area.area_type_name), '') is not null then 'Type: ' || btrim(v_area.area_type_name) end,
      nullif(btrim(v_area.material_description), ''),
      case when nullif(btrim(v_area.finish), '') is not null then 'Finish: ' || btrim(v_area.finish) end,
      case when nullif(btrim(v_area.thickness), '') is not null then 'Thickness: ' || btrim(v_area.thickness) end,
      case when v_area.sq_ft is not null then 'Sq Ft: ' || v_area.sq_ft::text end,
      case when v_area.linear_ft is not null then 'Linear Ft: ' || v_area.linear_ft::text end,
      case when nullif(btrim(v_area.edge_profile), '') is not null then 'Edge: ' || btrim(v_area.edge_profile) end,
      case when v_area.edge_linear_ft is not null then 'Edge LF: ' || v_area.edge_linear_ft::text end,
      case when v_area.sink_quantity is not null then 'Sinks: ' || v_area.sink_quantity::text end,
      case when nullif(btrim(v_area.sink_source), '') is not null then 'Sink: ' || btrim(v_area.sink_source) end,
      case when v_area.sink_cutout_quantity is not null then 'Cutouts: ' || v_area.sink_cutout_quantity::text end,
      case when nullif(btrim(v_area.backsplash), '') is not null then 'Backsplash: ' || btrim(v_area.backsplash) end,
      nullif(btrim(v_area.backsplash_notes), ''),
      nullif(btrim(v_area.scope_notes), '')
    );

    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_product_id,
      'quantity', 1,
      'discount_percent', 0,
      'pricing_model', 'manual_service',
      'unit_price', coalesce(v_area.direct_sell_amount, 0),
      'line_note', v_line_note,
      'proposal_area_ids', jsonb_build_array(v_area.id),
      'proposal_pricing_group_id', null
    ));
  end loop;

  if jsonb_array_length(v_order_items) = 0 then
    raise exception 'PROPOSAL_ORDER_AREA_SELECTION_REQUIRED' using errcode = '22023';
  end if;

  v_order_id := public.create_project_customer_order(
    p_project_id,
    v_order_items,
    p_price_group_id,
    p_billing_address_id,
    p_shipping_address_id,
    p_expected_delivery_date,
    p_customer_reference,
    p_customer_notes,
    p_internal_notes,
    p_tax_rate,
    0,
    p_payment_method_id,
    0,
    'draft',
    p_fulfillment_type,
    p_administrative_fee_percent
  );

  perform set_config('modulex.project_proposal_order_conversion_lifecycle', 'on', true);

  insert into public.customer_project_proposal_order_conversions(
    project_id,
    proposal_id,
    proposal_revision_id,
    order_id,
    idempotency_key,
    created_by
  ) values (
    p_project_id,
    p_proposal_id,
    p_revision_id,
    v_order_id,
    p_idempotency_key,
    auth.uid()
  ) returning * into v_conversion;

  for v_line in
    select value as line, ordinality::integer as line_no
    from jsonb_array_elements(v_order_items) with ordinality
  loop
    select oi.id into v_order_item_id
    from public.customer_order_items oi
    where oi.order_id = v_order_id
      and oi.line_no = v_line.line_no;

    if v_order_item_id is null then
      raise exception 'PROPOSAL_ORDER_ITEM_LINK_FAILED' using errcode = '22023';
    end if;

    v_pricing_group_id := nullif(v_line.line ->> 'proposal_pricing_group_id', '')::uuid;

    for v_source_area_id in
      select value::uuid
      from jsonb_array_elements_text(v_line.line -> 'proposal_area_ids')
    loop
      insert into public.customer_project_proposal_order_conversion_areas(
        conversion_id,
        proposal_area_id,
        pricing_group_id,
        order_item_id
      ) values (
        v_conversion.id,
        v_source_area_id,
        v_pricing_group_id,
        v_order_item_id
      );
    end loop;
  end loop;

  perform set_config('modulex.project_proposal_order_conversion_lifecycle', 'off', true);

  select jsonb_build_object(
    'id', c.id,
    'project_id', c.project_id,
    'proposal_id', c.proposal_id,
    'proposal_revision_id', c.proposal_revision_id,
    'order_id', c.order_id,
    'order_number', o.order_number,
    'order_status', o.status,
    'idempotency_key', c.idempotency_key,
    'created_by', c.created_by,
    'created_at', c.created_at,
    'area_ids', coalesce((
      select jsonb_agg(ca.proposal_area_id order by pa.sort_order, ca.proposal_area_id)
      from public.customer_project_proposal_order_conversion_areas ca
      join public.customer_project_proposal_areas pa on pa.id = ca.proposal_area_id
      where ca.conversion_id = c.id
    ), '[]'::jsonb)
  ) into v_result
  from public.customer_project_proposal_order_conversions c
  join public.customer_orders o on o.id = c.order_id
  where c.id = v_conversion.id;

  return v_result;
end;
$$;

create or replace function public.get_project_proposal_order_conversions(
  p_project_id uuid,
  p_proposal_id uuid default null,
  p_revision_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales', 'finance') then
    raise exception 'PROPOSAL_ORDER_VIEW_FORBIDDEN' using errcode = '42501';
  end if;

  if p_project_id is null then
    raise exception 'Project is required.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'project_id', c.project_id,
      'proposal_id', c.proposal_id,
      'proposal_number', pp.proposal_number,
      'proposal_revision_id', c.proposal_revision_id,
      'revision_no', pr.revision_no,
      'order_id', c.order_id,
      'order_number', o.order_number,
      'order_status', o.status,
      'idempotency_key', c.idempotency_key,
      'created_by', c.created_by,
      'created_at', c.created_at,
      'areas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'proposal_area_id', ca.proposal_area_id,
          'area_name', pa.area_name,
          'pricing_group_id', ca.pricing_group_id,
          'order_item_id', ca.order_item_id
        ) order by pa.sort_order, ca.proposal_area_id)
        from public.customer_project_proposal_order_conversion_areas ca
        join public.customer_project_proposal_areas pa on pa.id = ca.proposal_area_id
        where ca.conversion_id = c.id
      ), '[]'::jsonb)
    ) order by c.created_at desc, c.id
  ), '[]'::jsonb)
    into v_result
  from public.customer_project_proposal_order_conversions c
  join public.customer_project_proposals pp on pp.id = c.proposal_id
  join public.customer_project_proposal_revisions pr on pr.id = c.proposal_revision_id
  join public.customer_orders o on o.id = c.order_id
  where c.project_id = p_project_id
    and (p_proposal_id is null or c.proposal_id = p_proposal_id)
    and (p_revision_id is null or c.proposal_revision_id = p_revision_id);

  return v_result;
end;
$$;

revoke all on function public.create_order_from_accepted_project_proposal(uuid, uuid, uuid, uuid[], uuid, uuid, uuid, uuid, date, text, text, text, numeric, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.create_order_from_accepted_project_proposal(uuid, uuid, uuid, uuid[], uuid, uuid, uuid, uuid, date, text, text, text, numeric, uuid, text, numeric) to authenticated;

revoke all on function public.get_project_proposal_order_conversions(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_project_proposal_order_conversions(uuid, uuid, uuid) to authenticated;

commit;
