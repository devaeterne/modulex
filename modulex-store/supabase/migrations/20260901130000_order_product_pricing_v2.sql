alter table public.customer_order_items add column if not exists product_type_name_snapshot text, add column if not exists uom_code_snapshot text, add column if not exists uom_name_snapshot text, add column if not exists pricing_model_snapshot text;

create or replace function private.enforce_customer_order_item_pricing_v2() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.customer_orders%rowtype; v_product public.products%rowtype; v_type public.product_types%rowtype; v_uom public.units_of_measure%rowtype; v_price numeric; v_configured boolean:=false;
begin
  select * into v_order from public.customer_orders where id=new.order_id;
  select * into v_product from public.products where id=new.product_id and status<>'archived';
  if v_product.id is null then raise exception 'Product does not exist or is archived.'; end if;
  select * into v_type from public.product_types where id=v_product.product_type_id;
  select * into v_uom from public.units_of_measure where id=v_product.uom_id;
  if v_type.id is null or v_uom.id is null then raise exception 'Product Type and UOM are required for customer order lines.'; end if;
  if tg_op='UPDATE' then v_configured:=exists(select 1 from public.countertop_configurations where order_item_id=old.id); end if;
  if v_type.pricing_model='countertop_material_band' then
    if not v_configured then raise exception 'Countertop Material Band products must be configured in the Countertop workspace.'; end if;
    new.product_type_name_snapshot:=coalesce(old.product_type_name_snapshot,v_type.name); new.uom_code_snapshot:=coalesce(old.uom_code_snapshot,v_uom.code); new.uom_name_snapshot:=coalesce(old.uom_name_snapshot,v_uom.name); new.pricing_model_snapshot:=coalesce(old.pricing_model_snapshot,v_type.pricing_model); return new;
  elsif v_type.pricing_model='none' then raise exception 'No Commercial Pricing products cannot be added to customer orders.';
  elsif v_type.pricing_model<>'price_group' then raise exception 'Unsupported Product Type pricing route.'; end if;
  select pp.amount into v_price from public.product_prices pp where pp.product_id=new.product_id and pp.price_group_id=v_order.price_group_id and pp.currency_code=v_order.currency_code and pp.is_active=true and pp.valid_to is null order by pp.valid_from desc,pp.created_at desc limit 1;
  if v_price is null then raise exception 'No current Price Group price exists for this product.'; end if;
  new.sku_snapshot:=v_product.sku; new.product_name_snapshot:=v_product.name; new.product_type_name_snapshot:=v_type.name; new.uom_code_snapshot:=v_uom.code; new.uom_name_snapshot:=v_uom.name; new.pricing_model_snapshot:=v_type.pricing_model;
  new.unit_price:=round(v_price,4); new.price_source:='price_group'; new.line_subtotal:=round(new.quantity*new.unit_price,4); new.discount_amount:=round(new.line_subtotal*(new.discount_percent/100),4); new.line_total:=round(new.line_subtotal-new.discount_amount,4); return new;
end $$;
revoke all on function private.enforce_customer_order_item_pricing_v2() from public,anon,authenticated;
grant execute on function private.enforce_customer_order_item_pricing_v2() to postgres;
drop trigger if exists trg_customer_order_items_pricing_v2 on public.customer_order_items;
create trigger trg_customer_order_items_pricing_v2 before insert or update of product_id,quantity,unit_price,discount_percent on public.customer_order_items for each row execute function private.enforce_customer_order_item_pricing_v2();

create or replace function private.recalculate_customer_order_totals_v2() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_subtotal numeric; v_taxable numeric;
begin
  select coalesce(sum(line_total),0),count(*) into v_subtotal,new.item_count from public.customer_order_items where order_id=new.id;
  if coalesce(new.discount_amount,0)>v_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  new.subtotal:=round(v_subtotal,4); v_taxable:=greatest(new.subtotal-coalesce(new.discount_amount,0),0); new.tax_amount:=round(v_taxable*(coalesce(new.tax_rate,0)/100),4); new.total_amount:=round(v_taxable+new.tax_amount,4); new.payment_commission_amount:=round(new.total_amount*(coalesce(new.payment_commission_percent,0)/100),4); new.grand_total:=round(new.total_amount+new.payment_commission_amount,4); return new;
end $$;
revoke all on function private.recalculate_customer_order_totals_v2() from public,anon,authenticated;
grant execute on function private.recalculate_customer_order_totals_v2() to postgres;
drop trigger if exists trg_customer_orders_totals_v2 on public.customer_orders;
create trigger trg_customer_orders_totals_v2 before update of item_count,subtotal,discount_amount,tax_rate,tax_amount,total_amount,payment_commission_percent,payment_commission_amount,grand_total on public.customer_orders for each row execute function private.recalculate_customer_order_totals_v2();
comment on column public.customer_order_items.pricing_model_snapshot is 'Immutable order-time Product Type pricing route; UOM remains measurement semantics only.';
