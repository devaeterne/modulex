alter table public.customer_order_items
  add column if not exists product_type_code_snapshot text,
  add column if not exists product_type_name_snapshot text,
  add column if not exists uom_code_snapshot text,
  add column if not exists uom_name_snapshot text,
  add column if not exists pricing_model_snapshot text;

-- Fill missing semantic identity only; never re-price historical money.
update public.customer_order_items oi
set product_type_code_snapshot = coalesce(oi.product_type_code_snapshot, pt.code),
    product_type_name_snapshot = coalesce(oi.product_type_name_snapshot, pt.name),
    uom_code_snapshot = coalesce(oi.uom_code_snapshot, uom.code),
    uom_name_snapshot = coalesce(oi.uom_name_snapshot, uom.name),
    pricing_model_snapshot = coalesce(oi.pricing_model_snapshot, pt.pricing_model)
from public.products p
join public.product_types pt on pt.id = p.product_type_id
join public.units_of_measure uom on uom.id = p.uom_id
where p.id = oi.product_id
  and (oi.product_type_code_snapshot is null or oi.product_type_name_snapshot is null
    or oi.uom_code_snapshot is null or oi.uom_name_snapshot is null
    or oi.pricing_model_snapshot is null);

-- An authenticated caller cannot forge this private transaction capability.
create table if not exists private.countertop_order_pricing_gate (
  backend_pid integer not null,
  transaction_id bigint not null,
  order_item_id uuid not null,
  primary key (backend_pid, transaction_id, order_item_id)
);
revoke all on table private.countertop_order_pricing_gate from public, anon, authenticated;

create or replace function private.attach_countertop_configuration(
  p_order_item_id uuid, p_stone_product_id uuid, p_price_group_id uuid, p_sqft numeric,
  p_edge_profile_id uuid default null, p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null, p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb, p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1, p_override_reason text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_order_id uuid; v_snapshot jsonb; v_subtotal numeric(18,4);
  v_order_subtotal numeric(18,4); v_order_discount numeric(18,4);
  v_tax_rate numeric(7,3); v_commission_rate numeric(7,3); v_taxable numeric(18,4);
  v_tax_amount numeric(18,4); v_total numeric(18,4); v_commission_amount numeric(18,4);
  v_grand_total numeric(18,4); v_actor uuid := auth.uid();
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then raise exception 'You do not have permission to configure countertop order items.'; end if;
  if p_slab_quantity <= 0 then raise exception 'Slab quantity must be greater than zero.'; end if;
  if p_manual_material_price is not null and nullif(btrim(coalesce(p_override_reason,'')), '') is null then raise exception 'Override reason is required.'; end if;
  select oi.order_id into v_order_id from public.customer_order_items oi join public.customer_orders o on o.id=oi.order_id where oi.id=p_order_item_id and o.status='draft';
  if v_order_id is null then raise exception 'Countertop configuration is only editable on draft orders.'; end if;
  v_snapshot := public.calculate_countertop_price(p_stone_product_id,p_price_group_id,p_sqft,p_edge_profile_id,p_edge_linear_ft,p_sink_product_id,p_services,p_manual_material_price);
  v_subtotal := (v_snapshot->>'subtotal')::numeric;
  insert into private.countertop_order_pricing_gate(backend_pid,transaction_id,order_item_id)
  values(pg_backend_pid(),txid_current(),p_order_item_id) on conflict do nothing;
  update public.customer_order_items set product_id=p_stone_product_id,
    countertop_reservation_quantity=p_slab_quantity, sku_snapshot=v_snapshot->'stone'->>'sku',
    product_name_snapshot=v_snapshot->'stone'->>'name', quantity=1, unit_price=v_subtotal,
    discount_amount=0, line_subtotal=v_subtotal, line_total=v_subtotal,
    price_source=case when p_manual_material_price is null then 'price_group' else 'manual' end
  where id=p_order_item_id;
  insert into public.countertop_configurations(order_id,order_item_id,stone_product_id,sink_product_id,price_group_id,edge_profile_id,sqft,edge_linear_ft,slab_quantity,manual_price_per_sqft,override_reason,overridden_by,overridden_at,configuration,pricing_snapshot,subtotal)
  values(v_order_id,p_order_item_id,p_stone_product_id,p_sink_product_id,p_price_group_id,p_edge_profile_id,p_sqft,p_edge_linear_ft,p_slab_quantity,p_manual_material_price,nullif(btrim(p_override_reason),''),case when p_manual_material_price is null then null else v_actor end,case when p_manual_material_price is null then null else now() end,coalesce(p_configuration,'{}'::jsonb),v_snapshot,v_subtotal)
  on conflict(order_item_id) do update set stone_product_id=excluded.stone_product_id,sink_product_id=excluded.sink_product_id,price_group_id=excluded.price_group_id,edge_profile_id=excluded.edge_profile_id,sqft=excluded.sqft,edge_linear_ft=excluded.edge_linear_ft,slab_quantity=excluded.slab_quantity,manual_price_per_sqft=excluded.manual_price_per_sqft,override_reason=excluded.override_reason,overridden_by=excluded.overridden_by,overridden_at=excluded.overridden_at,configuration=excluded.configuration,pricing_snapshot=excluded.pricing_snapshot,subtotal=excluded.subtotal,updated_at=now();
  select o.discount_amount,o.tax_rate,o.payment_commission_percent into v_order_discount,v_tax_rate,v_commission_rate from public.customer_orders o where o.id=v_order_id for update;
  select coalesce(sum(i.line_total),0) into v_order_subtotal from public.customer_order_items i where i.order_id=v_order_id;
  if coalesce(v_order_discount,0)>v_order_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  v_taxable:=greatest(v_order_subtotal-coalesce(v_order_discount,0),0);
  v_tax_amount:=round(v_taxable*(coalesce(v_tax_rate,0)/100),4);
  v_total:=round(v_taxable+v_tax_amount,4);
  v_commission_amount:=round(v_total*(coalesce(v_commission_rate,0)/100),4);
  v_grand_total:=round(v_total+v_commission_amount,4);
  update public.customer_orders set item_count=(select count(*) from public.customer_order_items where order_id=v_order_id),subtotal=round(v_order_subtotal,4),tax_amount=v_tax_amount,total_amount=v_total,payment_commission_amount=v_commission_amount,grand_total=v_grand_total where id=v_order_id;
  delete from private.countertop_order_pricing_gate where backend_pid=pg_backend_pid() and transaction_id=txid_current() and order_item_id=p_order_item_id;
  return p_order_item_id;
end $$;
revoke all on function private.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public,anon;
grant execute on function private.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

create or replace function private.enforce_customer_order_item_pricing_v2() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.customer_orders%rowtype; v_product public.products%rowtype; v_type public.product_types%rowtype; v_uom public.units_of_measure%rowtype; v_price numeric;
begin
  select * into v_order from public.customer_orders where id=new.order_id;
  if v_order.id is null then raise exception 'Customer order does not exist.'; end if;
  select * into v_product from public.products where id=new.product_id and status<>'archived';
  if v_product.id is null then raise exception 'Product does not exist or is archived.'; end if;
  select * into v_type from public.product_types where id=v_product.product_type_id;
  select * into v_uom from public.units_of_measure where id=v_product.uom_id;
  if v_type.id is null or v_uom.id is null then raise exception 'Product Type and UOM are required for customer order lines.'; end if;
  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    new.sku_snapshot:=v_product.sku; new.product_name_snapshot:=v_product.name;
    new.product_type_code_snapshot:=v_type.code; new.product_type_name_snapshot:=v_type.name;
    new.uom_code_snapshot:=v_uom.code; new.uom_name_snapshot:=v_uom.name;
    new.pricing_model_snapshot:=v_type.pricing_model;
  else
    new.sku_snapshot:=old.sku_snapshot; new.product_name_snapshot:=old.product_name_snapshot;
    new.product_type_code_snapshot:=old.product_type_code_snapshot;
    new.product_type_name_snapshot:=old.product_type_name_snapshot;
    new.uom_code_snapshot:=old.uom_code_snapshot; new.uom_name_snapshot:=old.uom_name_snapshot;
    new.pricing_model_snapshot:=old.pricing_model_snapshot;
  end if;
  if v_type.pricing_model='countertop_material_band' then
    if (tg_op='INSERT' or new.order_id is distinct from old.order_id
      or new.product_id is distinct from old.product_id or new.quantity is distinct from old.quantity
      or new.unit_price is distinct from old.unit_price or new.discount_percent is distinct from old.discount_percent
      or new.discount_amount is distinct from old.discount_amount or new.line_subtotal is distinct from old.line_subtotal
      or new.line_total is distinct from old.line_total or new.price_source is distinct from old.price_source
      or new.countertop_reservation_quantity is distinct from old.countertop_reservation_quantity)
      and not exists (select 1 from private.countertop_order_pricing_gate where backend_pid=pg_backend_pid() and transaction_id=txid_current() and order_item_id=new.id)
    then raise exception 'Countertop Material Band products must be configured in the Countertop workspace.'; end if;
    return new;
  elsif v_type.pricing_model='none' then raise exception 'No Commercial Pricing products cannot be added to customer orders.';
  elsif v_type.pricing_model<>'price_group' then raise exception 'Unsupported Product Type pricing route.'; end if;
  select pp.amount into v_price from public.product_prices pp where pp.product_id=new.product_id and pp.price_group_id=v_order.price_group_id and pp.currency_code=v_order.currency_code and pp.is_active=true and pp.valid_to is null order by pp.valid_from desc,pp.created_at desc limit 1;
  if v_price is null then raise exception 'No current Price Group price exists for this product.'; end if;
  new.unit_price:=round(v_price,4); new.price_source:='price_group';
  new.line_subtotal:=round(new.quantity*new.unit_price,4);
  new.discount_amount:=round(new.line_subtotal*(new.discount_percent/100),4);
  new.line_total:=round(new.line_subtotal-new.discount_amount,4); return new;
end $$;
revoke all on function private.enforce_customer_order_item_pricing_v2() from public,anon,authenticated;
grant execute on function private.enforce_customer_order_item_pricing_v2() to postgres;
drop trigger if exists trg_customer_order_items_pricing_v2 on public.customer_order_items;
create trigger trg_customer_order_items_pricing_v2 before insert or update on public.customer_order_items for each row execute function private.enforce_customer_order_item_pricing_v2();

create or replace function private.recalculate_customer_order_totals_v2() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_subtotal numeric; v_taxable numeric;
begin
  select coalesce(sum(i.line_total),0),count(*) into v_subtotal,new.item_count from public.customer_order_items i where i.order_id=new.id;
  if coalesce(new.discount_amount,0)>v_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  new.subtotal:=round(v_subtotal,4); v_taxable:=greatest(new.subtotal-coalesce(new.discount_amount,0),0);
  new.tax_amount:=round(v_taxable*(coalesce(new.tax_rate,0)/100),4);
  new.total_amount:=round(v_taxable+new.tax_amount,4);
  new.payment_commission_amount:=round(new.total_amount*(coalesce(new.payment_commission_percent,0)/100),4);
  new.grand_total:=round(new.total_amount+new.payment_commission_amount,4); return new;
end $$;
revoke all on function private.recalculate_customer_order_totals_v2() from public,anon,authenticated;
grant execute on function private.recalculate_customer_order_totals_v2() to postgres;
drop trigger if exists trg_customer_orders_totals_v2 on public.customer_orders;
drop trigger if exists trg_customer_orders_authoritative_totals_v2 on public.customer_orders;
create trigger trg_customer_orders_authoritative_totals_v2 before update of item_count,subtotal,discount_amount,tax_rate,tax_amount,total_amount,payment_commission_percent,payment_commission_amount,grand_total on public.customer_orders for each row execute function private.recalculate_customer_order_totals_v2();

create or replace function private.reconcile_customer_order_totals_from_items_v2() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_old_order_id uuid:=case when tg_op in ('UPDATE','DELETE') then old.order_id else null end;
  v_new_order_id uuid:=case when tg_op in ('INSERT','UPDATE') then new.order_id else null end;
  v_order_id uuid;
begin
  for v_order_id in select v_old_order_id where v_old_order_id is not null union select v_new_order_id where v_new_order_id is not null and v_new_order_id is distinct from v_old_order_id loop
    update public.customer_orders o set item_count=t.item_count,subtotal=t.subtotal,tax_amount=t.tax_amount,total_amount=t.total_amount,payment_commission_amount=t.commission_amount,grand_total=round(t.total_amount+t.commission_amount,4)
    from (
      select count(i.*)::integer item_count,round(coalesce(sum(i.line_total),0),4) subtotal,
        round(greatest(coalesce(sum(i.line_total),0)-coalesce(p.discount_amount,0),0)*(coalesce(p.tax_rate,0)/100),4) tax_amount,
        round(greatest(coalesce(sum(i.line_total),0)-coalesce(p.discount_amount,0),0)*(1+coalesce(p.tax_rate,0)/100),4) total_amount,
        round(round(greatest(coalesce(sum(i.line_total),0)-coalesce(p.discount_amount,0),0)*(1+coalesce(p.tax_rate,0)/100),4)*(coalesce(p.payment_commission_percent,0)/100),4) commission_amount,
        coalesce(p.discount_amount,0) order_discount
      from public.customer_orders p left join public.customer_order_items i on i.order_id=p.id where p.id=v_order_id
      group by p.discount_amount,p.tax_rate,p.payment_commission_percent
    ) t where o.id=v_order_id and t.order_discount<=t.subtotal;
    if not found and exists(select 1 from public.customer_orders where id=v_order_id) then raise exception 'Order discount cannot exceed subtotal.'; end if;
  end loop;
  return null;
end $$;
revoke all on function private.reconcile_customer_order_totals_from_items_v2() from public,anon,authenticated;
grant execute on function private.reconcile_customer_order_totals_from_items_v2() to postgres;
drop trigger if exists trg_customer_order_items_reconcile_totals_v2 on public.customer_order_items;
create constraint trigger trg_customer_order_items_reconcile_totals_v2 after insert or update or delete on public.customer_order_items deferrable initially deferred for each row execute function private.reconcile_customer_order_totals_from_items_v2();

comment on column public.customer_order_items.product_type_code_snapshot is 'Immutable order-time Product Type identity code.';
comment on column public.customer_order_items.pricing_model_snapshot is 'Immutable order-time Product Type pricing route; UOM remains measurement semantics only.';
