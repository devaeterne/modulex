-- P6 hotfix — PostgreSQL does not provide min(uuid).
-- Preserve the existing accepted Proposal conversion preview contract while selecting
-- a deterministic converted Order for atomic Pricing Group scope.

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
      (array_agg(cc.order_id order by cc.created_at, cc.id)
        filter(where cc.order_id is not null))[1] as converted_order_id,
      (array_agg(co.order_number order by cc.created_at, cc.id)
        filter(where co.order_number is not null))[1] as converted_order_number
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
