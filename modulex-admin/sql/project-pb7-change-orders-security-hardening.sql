-- PB-7 post-merge security hardening.
-- Keep Sales draft management, but never allow Sales to write or erase hidden internal cost/vendor detail.
-- Serialize application attempts for the same canonical Order revision by locking that revision row.

create or replace function public.set_customer_project_change_order_lines(
  p_change_order_id uuid,
  p_lines jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_line jsonb;
  v_line_no integer := 0;
  v_effect_type text;
  v_target_order_id uuid;
  v_target_order_item_id uuid;
  v_product_id uuid;
  v_description text;
  v_quantity_delta numeric;
  v_sell_delta numeric;
  v_sell_currency text;
  v_expected_cost numeric;
  v_cost_currency text;
  v_vendor_code text;
begin
  if not private.can_manage_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'PROJECT_CHANGE_ORDER_LINES_ARRAY_REQUIRED';
  end if;

  select * into v_change
  from public.customer_project_change_orders
  where id = p_change_order_id
  for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status <> 'draft' then raise exception 'PROJECT_CHANGE_ORDER_NOT_DRAFT'; end if;

  if not private.can_view_customer_project_change_order_cost() then
    if exists (
      select 1
      from jsonb_array_elements(p_lines) as requested(line)
      where nullif(requested.line->>'expected_cost_delta','') is not null
         or nullif(upper(coalesce(requested.line->>'cost_currency_code','')), '') is not null
         or nullif(btrim(coalesce(requested.line->>'vendor_code','')), '') is not null
    ) or exists (
      select 1
      from public.customer_project_change_order_lines existing
      where existing.change_order_id = p_change_order_id
        and (
          existing.expected_cost_delta is not null
          or existing.cost_currency_code is not null
          or existing.vendor_code is not null
        )
    ) then
      raise exception 'PROJECT_CHANGE_ORDER_COST_WRITE_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  delete from public.customer_project_change_order_lines where change_order_id = p_change_order_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    v_effect_type := lower(coalesce(v_line->>'effect_type',''));
    v_target_order_id := nullif(v_line->>'target_order_id','')::uuid;
    v_target_order_item_id := nullif(v_line->>'target_order_item_id','')::uuid;
    v_product_id := nullif(v_line->>'product_id','')::uuid;
    v_description := nullif(btrim(coalesce(v_line->>'description','')), '');
    v_quantity_delta := nullif(v_line->>'quantity_delta','')::numeric;
    v_sell_delta := coalesce(nullif(v_line->>'sell_amount_delta','')::numeric,0);
    v_sell_currency := upper(coalesce(v_line->>'sell_currency_code',''));
    v_expected_cost := nullif(v_line->>'expected_cost_delta','')::numeric;
    v_cost_currency := nullif(upper(coalesce(v_line->>'cost_currency_code','')), '');
    v_vendor_code := nullif(btrim(coalesce(v_line->>'vendor_code','')), '');

    if v_effect_type not in ('add_scope','remove_scope','quantity_change','price_adjustment','customer_credit','vendor_credit','other') then
      raise exception 'PROJECT_CHANGE_ORDER_EFFECT_TYPE_INVALID';
    end if;
    if v_description is null then raise exception 'PROJECT_CHANGE_ORDER_LINE_DESCRIPTION_REQUIRED'; end if;
    if v_sell_currency !~ '^[A-Z]{3}$' then raise exception 'PROJECT_CHANGE_ORDER_SELL_CURRENCY_INVALID'; end if;
    if (v_expected_cost is null) <> (v_cost_currency is null) then raise exception 'PROJECT_CHANGE_ORDER_COST_CURRENCY_REQUIRED'; end if;
    if v_cost_currency is not null and v_cost_currency !~ '^[A-Z]{3}$' then raise exception 'PROJECT_CHANGE_ORDER_COST_CURRENCY_INVALID'; end if;

    if v_target_order_id is not null and not exists (
      select 1 from public.customer_orders o where o.id = v_target_order_id and o.project_id = v_change.project_id
    ) then raise exception 'PROJECT_CHANGE_ORDER_ORDER_PROJECT_MISMATCH'; end if;
    if v_target_order_item_id is not null and (
      v_target_order_id is null or not exists (
        select 1 from public.customer_order_items oi where oi.id = v_target_order_item_id and oi.order_id = v_target_order_id
      )
    ) then raise exception 'PROJECT_CHANGE_ORDER_ITEM_ORDER_MISMATCH'; end if;
    if v_product_id is not null and not exists (select 1 from public.products p where p.id = v_product_id) then
      raise exception 'PROJECT_CHANGE_ORDER_PRODUCT_NOT_FOUND';
    end if;

    insert into public.customer_project_change_order_lines(
      change_order_id, line_no, effect_type, target_order_id, target_order_item_id, product_id,
      description, quantity_delta, sell_amount_delta, sell_currency_code,
      expected_cost_delta, cost_currency_code, vendor_code, created_by, updated_by
    ) values (
      p_change_order_id, v_line_no, v_effect_type, v_target_order_id, v_target_order_item_id, v_product_id,
      v_description, v_quantity_delta, round(v_sell_delta,2), v_sell_currency,
      case when v_expected_cost is null then null else round(v_expected_cost,2) end,
      v_cost_currency, v_vendor_code, auth.uid(), auth.uid()
    );
  end loop;

  return v_line_no;
end;
$$;

create or replace function public.link_customer_project_change_order_revision(
  p_change_order_id uuid,
  p_order_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_change public.customer_project_change_orders%rowtype;
  v_revision public.customer_order_revisions%rowtype;
  v_next_revision public.customer_order_revisions%rowtype;
  v_order public.customer_orders%rowtype;
  v_existing public.customer_project_change_order_applications%rowtype;
  v_before_subtotal numeric;
  v_before_discount numeric;
  v_after_subtotal numeric;
  v_after_discount numeric;
  v_before_currency text;
  v_after_currency text;
  v_delta numeric(18,2);
  v_id uuid;
begin
  if not private.can_review_customer_project_change_orders() then
    raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_change from public.customer_project_change_orders where id=p_change_order_id for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_NOT_FOUND'; end if;
  if v_change.status <> 'approved' then raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_REQUIRES_APPROVAL'; end if;

  select * into v_revision
  from public.customer_order_revisions
  where id = p_order_revision_id
  for update;
  if not found then raise exception 'PROJECT_CHANGE_ORDER_REVISION_NOT_FOUND'; end if;

  select * into v_order from public.customer_orders where id=v_revision.order_id;
  if not found or v_order.project_id is distinct from v_change.project_id then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_PROJECT_MISMATCH';
  end if;
  if v_change.reviewed_at is null or v_revision.created_at < v_change.reviewed_at then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_PREDATES_APPROVAL';
  end if;
  if exists (select 1 from public.customer_project_change_order_lines where change_order_id=p_change_order_id and target_order_id is not null)
     and not exists (select 1 from public.customer_project_change_order_lines where change_order_id=p_change_order_id and target_order_id=v_revision.order_id) then
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_TARGET_MISMATCH';
  end if;

  select * into v_existing
  from public.customer_project_change_order_applications
  where order_revision_id=p_order_revision_id;
  if found then
    if v_existing.change_order_id = p_change_order_id then return v_existing.id; end if;
    raise exception 'PROJECT_CHANGE_ORDER_REVISION_ALREADY_LINKED';
  end if;

  v_before_subtotal := coalesce(nullif(v_revision.order_snapshot->>'subtotal','')::numeric,0);
  v_before_discount := coalesce(nullif(v_revision.order_snapshot->>'discount_amount','')::numeric,0);
  v_before_currency := upper(coalesce(v_revision.order_snapshot->>'currency_code',''));

  select * into v_next_revision
  from public.customer_order_revisions r
  where r.order_id=v_revision.order_id and r.revision_number > v_revision.revision_number
  order by r.revision_number
  limit 1;

  if found then
    v_after_subtotal := coalesce(nullif(v_next_revision.order_snapshot->>'subtotal','')::numeric,0);
    v_after_discount := coalesce(nullif(v_next_revision.order_snapshot->>'discount_amount','')::numeric,0);
    v_after_currency := upper(coalesce(v_next_revision.order_snapshot->>'currency_code',''));
  else
    v_after_subtotal := coalesce(v_order.subtotal,0);
    v_after_discount := coalesce(v_order.discount_amount,0);
    v_after_currency := upper(v_order.currency_code::text);
  end if;

  if v_before_currency !~ '^[A-Z]{3}$' or v_after_currency !~ '^[A-Z]{3}$' or v_before_currency <> v_after_currency then
    raise exception 'PROJECT_CHANGE_ORDER_APPLICATION_MIXED_CURRENCY';
  end if;

  v_delta := round((v_after_subtotal - v_after_discount) - (v_before_subtotal - v_before_discount),2);

  insert into public.customer_project_change_order_applications(
    change_order_id, order_id, order_revision_id, canonical_sell_delta, currency_code, linked_by
  ) values (
    p_change_order_id, v_revision.order_id, p_order_revision_id, v_delta, v_after_currency, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_change_order_event(
    p_change_order_id,
    'application_linked',
    'approved',
    null,
    jsonb_build_object('application_id',v_id,'order_id',v_revision.order_id,'order_revision_id',p_order_revision_id,'canonical_sell_delta',v_delta,'currency_code',v_after_currency)
  );
  return v_id;
end;
$$;

revoke all on function public.set_customer_project_change_order_lines(uuid,jsonb) from public, anon;
revoke all on function public.link_customer_project_change_order_revision(uuid,uuid) from public, anon;
grant execute on function public.set_customer_project_change_order_lines(uuid,jsonb) to authenticated;
grant execute on function public.link_customer_project_change_order_revision(uuid,uuid) to authenticated;
