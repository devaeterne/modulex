-- P6 production hotfix: PostgreSQL has no min(uuid) aggregate.
-- Preserve the accepted Proposal -> canonical Draft Order contract and replace only
-- the canonical SERVICE product lookup with a deterministic UUID-safe aggregate.

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

  select count(*), (array_agg(p.id order by p.id))[1] into v_service_count, v_service_product_id
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

revoke all on function public.create_order_from_accepted_project_proposal(uuid,uuid[],uuid,uuid,uuid,uuid,date,text,text,text,numeric,uuid,text,numeric) from public, anon;
grant execute on function public.create_order_from_accepted_project_proposal(uuid,uuid[],uuid,uuid,uuid,uuid,date,text,text,text,numeric,uuid,text,numeric) to authenticated;

comment on function public.create_order_from_accepted_project_proposal(uuid,uuid[],uuid,uuid,uuid,uuid,date,text,text,text,numeric,uuid,text,numeric)
is 'Creates a canonical Draft Order from selected accepted Proposal scope using UUID-safe deterministic SERVICE product resolution.';
