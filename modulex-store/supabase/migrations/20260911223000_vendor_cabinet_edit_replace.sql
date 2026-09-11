-- Dedicated saved Vendor Cabinet edit workflow.
-- Keeps productless Vendor Cabinet packages out of generic Order revisions while
-- allowing Draft operators to change Vendor, line title, cost, markup and source PDF.

create or replace function private.update_custom_vendor_cabinet_order_line_v1(
  p_order_item_id uuid,
  p_vendor_id uuid,
  p_line_name text,
  p_total_cost numeric,
  p_markup_percent numeric,
  p_document_id uuid,
  p_order_discount_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.customer_order_items%rowtype;
  v_order public.customer_orders%rowtype;
  v_vendor record;
  v_document public.entity_documents%rowtype;
  v_line_name text := nullif(btrim(coalesce(p_line_name, '')), '');
  v_cost numeric(18,4);
  v_markup numeric(7,3);
  v_sell numeric(18,4);
  v_discount numeric(18,4);
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to edit Vendor Cabinet order lines.' using errcode = '42501';
  end if;
  if p_order_item_id is null or p_vendor_id is null or p_document_id is null then
    raise exception 'Order line, Vendor and Vendor PDF are required.' using errcode = '22023';
  end if;
  if v_line_name is null or char_length(v_line_name) > 160 then
    raise exception 'Vendor Cabinet Line Name must contain 1 to 160 characters.' using errcode = '22023';
  end if;
  if p_total_cost is null or p_total_cost < 0 then
    raise exception 'Vendor Cabinet Total Cost must be zero or greater.' using errcode = '22023';
  end if;
  if p_markup_percent is null or p_markup_percent < 0 or p_markup_percent > 1000 then
    raise exception 'Vendor Cabinet Markup must be between 0 and 1000.' using errcode = '22023';
  end if;
  if p_order_discount_amount is null or p_order_discount_amount < 0 then
    raise exception 'Order discount cannot be negative.' using errcode = '22023';
  end if;

  select * into v_item
  from public.customer_order_items i
  where i.id = p_order_item_id
  for update;
  if v_item.id is null then raise exception 'Vendor Cabinet order line not found.' using errcode = 'P0002'; end if;
  if v_item.product_id is not null or coalesce(v_item.pricing_model_snapshot, '') <> 'manual_vendor_cabinet' then
    raise exception 'Only productless Vendor Cabinet lines can use this workflow.' using errcode = '22023';
  end if;

  select * into v_order
  from public.customer_orders o
  where o.id = v_item.order_id
  for update;
  if v_order.id is null then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if v_order.status <> 'draft' then
    raise exception 'Vendor Cabinet lines can only be edited while the Order is Draft.' using errcode = '55000';
  end if;

  select v.id, v.code, v.legal_name, v.display_name
  into v_vendor
  from public.vendors v
  where v.id = p_vendor_id and v.status = 'active';
  if v_vendor.id is null then
    raise exception 'Vendor does not exist or is not active.' using errcode = '22023';
  end if;

  select * into v_document
  from public.entity_documents d
  where d.id = p_document_id
    and d.is_active = true
    and d.entity_type = 'order'
    and d.entity_id = v_item.order_id
    and d.storage_bucket = 'entity-documents'
    and lower(d.mime_type) = 'application/pdf';
  if v_document.id is null then
    raise exception 'Vendor PDF must be an active private document registered to this Order.' using errcode = '22023';
  end if;

  v_cost := round(p_total_cost, 4);
  v_markup := round(p_markup_percent, 3);
  v_sell := round(v_cost * (1 + v_markup / 100), 4);
  v_discount := round(p_order_discount_amount, 4);

  update public.customer_order_items
  set
    display_name_override = v_line_name,
    product_name_snapshot = v_line_name,
    unit_price = v_sell,
    vendor_id = v_vendor.id,
    vendor_name_snapshot = coalesce(nullif(btrim(v_vendor.display_name), ''), v_vendor.legal_name),
    manual_cost_amount = v_cost,
    manual_markup_percent = v_markup,
    source_document_id = v_document.id
  where id = v_item.id;

  update public.customer_orders
  set discount_amount = v_discount
  where id = v_order.id;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    v_order.customer_id,
    'order_updated',
    'Vendor Cabinet line updated',
    format('%s updated on %s from %s.', v_line_name, v_order.order_number, coalesce(v_vendor.display_name, v_vendor.legal_name)),
    jsonb_build_object(
      'order_id', v_order.id,
      'order_item_id', v_item.id,
      'vendor_id', v_vendor.id,
      'source_document_id', v_document.id,
      'previous_source_document_id', v_item.source_document_id,
      'line_name', v_line_name,
      'sell_price', v_sell
    ),
    v_actor
  );

  return v_item.id;
end;
$$;

revoke all on function private.update_custom_vendor_cabinet_order_line_v1(uuid,uuid,text,numeric,numeric,uuid,numeric) from public, anon, authenticated;

create or replace function public.update_custom_vendor_cabinet_order_line(
  p_order_item_id uuid,
  p_vendor_id uuid,
  p_line_name text,
  p_total_cost numeric,
  p_markup_percent numeric,
  p_document_id uuid,
  p_order_discount_amount numeric default 0
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.update_custom_vendor_cabinet_order_line_v1(
    p_order_item_id,
    p_vendor_id,
    p_line_name,
    p_total_cost,
    p_markup_percent,
    p_document_id,
    p_order_discount_amount
  );
$$;

revoke all on function public.update_custom_vendor_cabinet_order_line(uuid,uuid,text,numeric,numeric,uuid,numeric) from public, anon;
grant execute on function public.update_custom_vendor_cabinet_order_line(uuid,uuid,text,numeric,numeric,uuid,numeric) to authenticated;

comment on function public.update_custom_vendor_cabinet_order_line(uuid,uuid,text,numeric,numeric,uuid,numeric) is
  'Dedicated Draft-only Vendor Cabinet package edit boundary. Updates cost/markup/vendor/private PDF without creating Product rows.';
