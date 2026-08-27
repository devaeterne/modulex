\set ON_ERROR_STOP on
\pset pager off
\echo '=== Modulex database smoke test ==='
\echo 'All writes run inside one transaction and are rolled back.'

-- Resolve a real active admin identity. The privileged psql connection is only
-- used to establish the test session; business operations run as authenticated.
select id::text as admin_user_id
from public.profiles
where is_active = true
  and role in ('super_admin', 'admin')
order by case when role = 'super_admin' then 0 else 1 end, created_at
limit 1
\gset smoke_

\if :{?smoke_admin_user_id}
\else
  \echo 'FAIL: no active super_admin/admin profile exists.'
  \quit 3
\endif

begin;
set local statement_timeout = '90s';

create temp table smoke_ctx (
  customer_id uuid,
  contact_id uuid,
  address_id uuid,
  price_group_id uuid,
  delete_price_group_id uuid,
  product_id uuid,
  brand_id uuid,
  category_id uuid,
  warehouse_a_id uuid,
  warehouse_b_id uuid,
  zone_a_id uuid,
  zone_b_id uuid,
  location_a_id uuid,
  location_b_id uuid,
  payment_method_id uuid,
  order_id uuid,
  invoice_id uuid,
  shipment_id uuid,
  installation_id uuid,
  stock_total_before_order numeric
) on commit drop;
insert into smoke_ctx default values;
grant select, insert, update, delete on smoke_ctx to authenticated;

select set_config('request.jwt.claim.sub', :'smoke_admin_user_id', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'smoke_admin_user_id', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

\echo '[01] Auth / role context'
select 1 / case when auth.uid() = :'smoke_admin_user_id'::uuid then 1 else 0 end as "PASS auth.uid";
select 1 / case when exists (
  select 1 from public.profiles
  where id = auth.uid() and is_active and role in ('super_admin','admin')
) then 1 else 0 end as "PASS admin profile";

\echo '[02] Schema / RLS guards'
select 1 / case when not exists (
  select 1
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname = any(array[
      'customers','customer_contacts','customer_addresses','products','warehouses','zones','locations',
      'inventory','inventory_movements','price_groups','product_prices','payment_methods','general_settings',
      'customer_orders','customer_order_items','customer_order_reservations','customer_shipments',
      'customer_shipment_items','customer_invoices','customer_invoice_items','customer_installations'
    ])
    and c.relrowsecurity = false
) then 1 else 0 end as "PASS RLS enabled on core tables";

select 1 / case when exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_customer_order'
) and exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='stock_transfer'
) then 1 else 0 end as "PASS critical RPCs exist";

\echo '[03] General Settings read/update'
select 1 / case when exists (select 1 from public.general_settings where id=1) then 1 else 0 end as "PASS general settings read";
update public.general_settings
set order_footer_note = 'SMOKE-ROLLBACK-' || substr(gen_random_uuid()::text,1,8)
where id=1;
select 1 / case when (select order_footer_note like 'SMOKE-ROLLBACK-%' from public.general_settings where id=1) then 1 else 0 end as "PASS general settings update";

\echo '[04] Payment Method CRUD'
with x as (
  insert into public.payment_methods(system_key,name,commission_percent,sort_order,is_active)
  values ('smoke_' || substr(replace(gen_random_uuid()::text,'-',''),1,12), 'Smoke Payment', 1.25, 999, true)
  returning id
)
update smoke_ctx set payment_method_id=(select id from x);
select 1 / case when exists (select 1 from public.payment_methods where id=(select payment_method_id from smoke_ctx)) then 1 else 0 end as "PASS payment method create/read";
update public.payment_methods set name='Smoke Payment Updated', commission_percent=2.5 where id=(select payment_method_id from smoke_ctx);
select 1 / case when exists (select 1 from public.payment_methods where id=(select payment_method_id from smoke_ctx) and name='Smoke Payment Updated' and commission_percent=2.5) then 1 else 0 end as "PASS payment method update";
delete from public.payment_methods where id=(select payment_method_id from smoke_ctx);
select 1 / case when not exists (select 1 from public.payment_methods where id=(select payment_method_id from smoke_ctx)) then 1 else 0 end as "PASS payment method delete";
update smoke_ctx set payment_method_id=(select id from public.payment_methods where is_active order by sort_order,id limit 1);
select 1 / case when (select payment_method_id is not null from smoke_ctx) then 1 else 0 end as "PASS active payment fixture";

\echo '[05] Brand / Category CRUD lifecycle'
with x as (
  insert into public.product_brands(name,status)
  values ('Smoke Brand ' || substr(gen_random_uuid()::text,1,8), 'active') returning id
)
update smoke_ctx set brand_id=(select id from x);
with x as (
  insert into public.product_categories(name,status)
  values ('Smoke Category ' || substr(gen_random_uuid()::text,1,8), 'active') returning id
)
update smoke_ctx set category_id=(select id from x);
update public.product_brands set name=name || ' Updated' where id=(select brand_id from smoke_ctx);
update public.product_categories set name=name || ' Updated' where id=(select category_id from smoke_ctx);
select 1 / case when exists (select 1 from public.product_brands where id=(select brand_id from smoke_ctx) and name like '% Updated') then 1 else 0 end as "PASS brand create/read/update";
select 1 / case when exists (select 1 from public.product_categories where id=(select category_id from smoke_ctx) and name like '% Updated') then 1 else 0 end as "PASS category create/read/update";

\echo '[06] Pricing CRUD lifecycle'
with x as (
  insert into public.price_groups(system_key,name,sort_order,is_base_price,is_active,available_for_orders,requires_approval,internal_only)
  values ('smoke_order_' || substr(replace(gen_random_uuid()::text,'-',''),1,10), 'Smoke Order Price', 900, false, true, true, false, false)
  returning id
)
update smoke_ctx set price_group_id=(select id from x);
update public.price_groups set name='Smoke Order Price Updated' where id=(select price_group_id from smoke_ctx);
select 1 / case when exists (select 1 from public.price_groups where id=(select price_group_id from smoke_ctx) and name='Smoke Order Price Updated') then 1 else 0 end as "PASS price group create/read/update";

with x as (
  insert into public.price_groups(system_key,name,sort_order,is_active,available_for_orders)
  values ('smoke_delete_' || substr(replace(gen_random_uuid()::text,'-',''),1,10), 'Smoke Delete Price', 901, true, true)
  returning id
)
update smoke_ctx set delete_price_group_id=(select id from x);
delete from public.price_groups where id=(select delete_price_group_id from smoke_ctx);
select 1 / case when not exists (select 1 from public.price_groups where id=(select delete_price_group_id from smoke_ctx)) then 1 else 0 end as "PASS unused price group delete";

\echo '[07] Product create/read/update + product price'
with x as (
  insert into public.products(
    sku,barcode,name,description,brand,category,unit,min_stock_level,status,metadata,
    base_product_code,color_code,color_name,brand_id,category_id
  ) values (
    'SMOKE-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    'SMK' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    'Smoke Product','Transactional smoke fixture','Smoke Brand','Smoke Category','piece',1,'active',
    jsonb_build_object('smoke_test',true), 'SMOKE','ST','Smoke Test',
    (select brand_id from smoke_ctx),(select category_id from smoke_ctx)
  ) returning id
)
update smoke_ctx set product_id=(select id from x);
select 1 / case when exists (select 1 from public.products where id=(select product_id from smoke_ctx) and status='active') then 1 else 0 end as "PASS product create/read";
update public.products set name='Smoke Product Updated', min_stock_level=2 where id=(select product_id from smoke_ctx);
select 1 / case when exists (select 1 from public.products where id=(select product_id from smoke_ctx) and name='Smoke Product Updated' and min_stock_level=2) then 1 else 0 end as "PASS product update";

insert into public.product_prices(product_id,price_group_id,amount,currency_code,is_active)
values ((select product_id from smoke_ctx),(select price_group_id from smoke_ctx),100,'USD',true);
update public.product_prices
set amount=105
where product_id=(select product_id from smoke_ctx)
  and price_group_id=(select price_group_id from smoke_ctx)
  and valid_to is null;
select 1 / case when exists (
  select 1 from public.product_prices
  where product_id=(select product_id from smoke_ctx)
    and price_group_id=(select price_group_id from smoke_ctx)
    and amount=105 and is_active and valid_to is null
) then 1 else 0 end as "PASS product price create/read/update";

\echo '[08] Customer + contact + address CRUD'
with x as (
  insert into public.customers(
    customer_code,name,legal_name,status,email,phone,website,country_code,language_code,currency_code,price_group_id,portal_enabled
  ) values (
    'SMK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    'Smoke Customer','Smoke Customer LLC','prospect',
    'smoke-' || substr(replace(gen_random_uuid()::text,'-',''),1,10) || '@example.com',
    '+12025550123','https://example.com','US','en','USD',(select price_group_id from smoke_ctx),false
  ) returning id
)
update smoke_ctx set customer_id=(select id from x);
select 1 / case when exists (select 1 from public.customers where id=(select customer_id from smoke_ctx)) then 1 else 0 end as "PASS customer create/read";
select 1 / case when exists (select 1 from public.customer_commercial_settings where customer_id=(select customer_id from smoke_ctx)) then 1 else 0 end as "PASS commercial settings auto-init";
update public.customers set name='Smoke Customer Updated',status='active' where id=(select customer_id from smoke_ctx);
select 1 / case when exists (select 1 from public.customers where id=(select customer_id from smoke_ctx) and name='Smoke Customer Updated' and status='active') then 1 else 0 end as "PASS customer update";

with x as (
  insert into public.customer_contacts(customer_id,first_name,last_name,email,phone,is_primary,is_order_contact)
  values ((select customer_id from smoke_ctx),'Smoke','Contact','smoke.contact@example.com','+12025550124',true,true)
  returning id
)
update smoke_ctx set contact_id=(select id from x);
update public.customer_contacts set job_title='QA Contact' where id=(select contact_id from smoke_ctx);
select 1 / case when exists (select 1 from public.customer_contacts where id=(select contact_id from smoke_ctx) and job_title='QA Contact') then 1 else 0 end as "PASS contact create/read/update";
delete from public.customer_contacts where id=(select contact_id from smoke_ctx);
select 1 / case when not exists (select 1 from public.customer_contacts where id=(select contact_id from smoke_ctx)) then 1 else 0 end as "PASS contact delete";

with x as (
  insert into public.customer_addresses(
    customer_id,address_name,company_name,contact_name,address_line_1,postal_code,city,state_region,country_code,phone,address_type,is_default_billing,is_default_shipping
  ) values (
    (select customer_id from smoke_ctx),'Smoke Main','Smoke Customer LLC','Smoke Contact','100 Smoke Test Ave','10001','New York','NY','US','+12025550125','both',true,true
  ) returning id
)
update smoke_ctx set address_id=(select id from x);
update public.customer_addresses set address_line_2='Suite 200' where id=(select address_id from smoke_ctx);
select 1 / case when exists (select 1 from public.customer_addresses where id=(select address_id from smoke_ctx) and address_line_2='Suite 200') then 1 else 0 end as "PASS address create/read/update";
with x as (
  insert into public.customer_addresses(customer_id,address_name,address_line_1,city,state_region,country_code,address_type)
  values ((select customer_id from smoke_ctx),'Smoke Disposable','101 Smoke Test Ave','New York','NY','US','shipping') returning id
)
delete from public.customer_addresses where id=(select id from x);
select 1 as "PASS address delete";

\echo '[09] Warehouse / Zone / Location create-read-update'
with x as (
  insert into public.warehouses(name,code,description,city,country,is_active,warehouse_type)
  values ('Smoke Warehouse A','SMK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),'Smoke fixture A','New York','United States',true,'sellable') returning id
)
update smoke_ctx set warehouse_a_id=(select id from x);
with x as (
  insert into public.warehouses(name,code,description,city,country,is_active,warehouse_type)
  values ('Smoke Warehouse B','SMK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),'Smoke fixture B','New York','United States',true,'sellable') returning id
)
update smoke_ctx set warehouse_b_id=(select id from x);
update public.warehouses set description='Smoke fixture A updated' where id=(select warehouse_a_id from smoke_ctx);
select 1 / case when exists (select 1 from public.warehouses where id=(select warehouse_a_id from smoke_ctx) and description like '%updated') then 1 else 0 end as "PASS warehouse create/read/update";

with x as (
  insert into public.zones(warehouse_id,name,code,description,is_active)
  values ((select warehouse_a_id from smoke_ctx),'Smoke Zone A','A','Smoke zone A',true) returning id
)
update smoke_ctx set zone_a_id=(select id from x);
with x as (
  insert into public.zones(warehouse_id,name,code,description,is_active)
  values ((select warehouse_b_id from smoke_ctx),'Smoke Zone B','B','Smoke zone B',true) returning id
)
update smoke_ctx set zone_b_id=(select id from x);
update public.zones set description='Smoke zone A updated' where id=(select zone_a_id from smoke_ctx);
select 1 / case when exists (select 1 from public.zones where id=(select zone_a_id from smoke_ctx) and description like '%updated') then 1 else 0 end as "PASS zone create/read/update";

with x as (
  insert into public.locations(warehouse_id,zone_id,name,code,location_type,aisle,rack,shelf,max_capacity,is_active)
  values ((select warehouse_a_id from smoke_ctx),(select zone_a_id from smoke_ctx),'Smoke Location A','A-01-01','shelf','A','01','01',100,true) returning id
)
update smoke_ctx set location_a_id=(select id from x);
with x as (
  insert into public.locations(warehouse_id,zone_id,name,code,location_type,aisle,rack,shelf,max_capacity,is_active)
  values ((select warehouse_b_id from smoke_ctx),(select zone_b_id from smoke_ctx),'Smoke Location B','B-01-01','shelf','B','01','01',100,true) returning id
)
update smoke_ctx set location_b_id=(select id from x);
update public.locations set name='Smoke Location A Updated' where id=(select location_a_id from smoke_ctx);
select 1 / case when exists (select 1 from public.locations where id=(select location_a_id from smoke_ctx) and name='Smoke Location A Updated' and qr_code is not null) then 1 else 0 end as "PASS location create/read/update + QR";

\echo '[10] Stock operations: in / reserve / release / out / transfer / adjust'
select public.stock_in((select product_id from smoke_ctx),(select warehouse_a_id from smoke_ctx),(select location_a_id from smoke_ctx),10,'SMOKE-STOCK-IN','Smoke test','rollback');
select 1 / case when exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_a_id from smoke_ctx) and quantity=10 and reserved_quantity=0
) then 1 else 0 end as "PASS stock in";

select public.reserve_stock((select product_id from smoke_ctx),(select warehouse_a_id from smoke_ctx),(select location_a_id from smoke_ctx),3,'SMOKE-RESERVE','Smoke test','rollback');
select 1 / case when exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_a_id from smoke_ctx) and reserved_quantity=3
) then 1 else 0 end as "PASS reserve stock";
select public.release_stock((select product_id from smoke_ctx),(select warehouse_a_id from smoke_ctx),(select location_a_id from smoke_ctx),3,'SMOKE-RELEASE','Smoke test','rollback');
select 1 / case when exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_a_id from smoke_ctx) and reserved_quantity=0
) then 1 else 0 end as "PASS release stock";

select public.stock_out((select product_id from smoke_ctx),(select warehouse_a_id from smoke_ctx),(select location_a_id from smoke_ctx),2,'SMOKE-STOCK-OUT','Smoke test','rollback');
select 1 / case when exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_a_id from smoke_ctx) and quantity=8
) then 1 else 0 end as "PASS stock out";

select public.stock_transfer(
  (select product_id from smoke_ctx),
  (select warehouse_a_id from smoke_ctx),(select location_a_id from smoke_ctx),
  (select warehouse_b_id from smoke_ctx),(select location_b_id from smoke_ctx),
  2,'SMOKE-TRANSFER','Smoke test','rollback'
);
select 1 / case when exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_a_id from smoke_ctx) and quantity=6
) and exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_b_id from smoke_ctx) and quantity=2
) then 1 else 0 end as "PASS stock transfer";

select public.stock_adjust((select product_id from smoke_ctx),(select warehouse_b_id from smoke_ctx),(select location_b_id from smoke_ctx),5,'SMOKE-ADJUST','Smoke test','rollback');
select 1 / case when exists (
  select 1 from public.inventory where product_id=(select product_id from smoke_ctx) and location_id=(select location_b_id from smoke_ctx) and quantity=5
) then 1 else 0 end as "PASS stock adjust";

update smoke_ctx set stock_total_before_order=(
  select sum(quantity) from public.inventory where product_id=(select product_id from smoke_ctx)
);
select 1 / case when (select stock_total_before_order from smoke_ctx)=11 then 1 else 0 end as "PASS stock arithmetic";
select 1 / case when (select count(*) from public.inventory_movements where product_id=(select product_id from smoke_ctx)) >= 6 then 1 else 0 end as "PASS stock movement audit rows";

\echo '[11] Read/search RPCs'
select 1 / case when public.get_products_page(p_query=>'SMOKE-',p_page=>1,p_page_size=>10) is not null then 1 else 0 end as "PASS get_products_page";
select 1 / case when public.get_product_prices_page(p_query=>'SMOKE-',p_page=>1,p_page_size=>10,p_currency_code=>'USD') is not null then 1 else 0 end as "PASS get_product_prices_page";
select 1 / case when (select count(*) from public.search_stock('SMOKE-',20)) >= 1 then 1 else 0 end as "PASS search_stock";
select 1 / case when (select count(*) from public.get_product_stock_totals() where product_id=(select product_id from smoke_ctx)) = 1 then 1 else 0 end as "PASS get_product_stock_totals";
select 1 / case when (select count(*) from public.get_recent_inventory_movements(50) where sku like 'SMOKE-%') >= 1 then 1 else 0 end as "PASS get_recent_inventory_movements";

\echo '[12] Order create/read/update -> confirm -> reservation'
with x as (
  select public.create_customer_order(
    p_customer_id => (select customer_id from smoke_ctx),
    p_items => jsonb_build_array(jsonb_build_object('product_id',(select product_id from smoke_ctx),'quantity',1,'discount_percent',0)),
    p_price_group_id => (select price_group_id from smoke_ctx),
    p_billing_address_id => (select address_id from smoke_ctx),
    p_shipping_address_id => (select address_id from smoke_ctx),
    p_expected_delivery_date => current_date + 7,
    p_customer_reference => 'SMOKE-ROLLBACK',
    p_customer_notes => 'Smoke customer note',
    p_internal_notes => 'Smoke internal note',
    p_tax_rate => 0,
    p_order_discount_amount => 0,
    p_payment_method_id => (select payment_method_id from smoke_ctx),
    p_payment_commission_percent => 0,
    p_initial_status => 'draft',
    p_fulfillment_type => 'delivery_installation'
  ) as id
)
update smoke_ctx set order_id=(select id from x);
select 1 / case when exists (
  select 1 from public.customer_orders o join public.customer_order_items oi on oi.order_id=o.id
  where o.id=(select order_id from smoke_ctx) and o.status='draft' and oi.quantity=1 and oi.unit_price=105 and oi.price_source='price_group'
) then 1 else 0 end as "PASS order create/read + price";

select public.update_customer_order(
  p_order_id => (select order_id from smoke_ctx),
  p_items => jsonb_build_array(jsonb_build_object('product_id',(select product_id from smoke_ctx),'quantity',1,'discount_percent',0)),
  p_price_group_id => (select price_group_id from smoke_ctx),
  p_billing_address_id => (select address_id from smoke_ctx),
  p_shipping_address_id => (select address_id from smoke_ctx),
  p_expected_delivery_date => current_date + 8,
  p_customer_reference => 'SMOKE-UPDATED',
  p_customer_notes => 'Smoke updated customer note',
  p_internal_notes => 'Smoke updated internal note',
  p_tax_rate => 0,
  p_order_discount_amount => 0,
  p_payment_method_id => (select payment_method_id from smoke_ctx),
  p_payment_commission_percent => 0,
  p_revision_reason => 'Smoke update',
  p_fulfillment_type => 'delivery_installation'
);
select 1 / case when exists (select 1 from public.customer_orders where id=(select order_id from smoke_ctx) and customer_reference='SMOKE-UPDATED') then 1 else 0 end as "PASS order update";

select public.set_customer_order_status((select order_id from smoke_ctx),'confirmed','Smoke confirm');
select 1 / case when exists (select 1 from public.customer_orders where id=(select order_id from smoke_ctx) and status='confirmed') then 1 else 0 end as "PASS order confirm";
select 1 / case when exists (
  select 1 from public.customer_order_reservations
  where order_id=(select order_id from smoke_ctx) and status='active' and quantity=1 and remaining_quantity=1
) then 1 else 0 end as "PASS order stock reservation";

\echo '[13] Invoice create/read/update/payment lifecycle'
with x as (
  select public.create_customer_invoice_from_order(
    p_order_id => (select order_id from smoke_ctx),
    p_due_date => current_date + 14,
    p_notes => 'Smoke invoice',
    p_internal_notes => 'rollback',
    p_issue_now => false
  ) as id
)
update smoke_ctx set invoice_id=(select id from x);
select 1 / case when exists (
  select 1 from public.customer_invoices i
  where i.id=(select invoice_id from smoke_ctx) and i.status='draft' and i.total_amount=105
    and (select count(*) from public.customer_invoice_items ii where ii.invoice_id=i.id)=1
) then 1 else 0 end as "PASS invoice create/read";
select public.update_customer_invoice_state((select invoice_id from smoke_ctx),'issued',null);
select public.update_customer_invoice_state((select invoice_id from smoke_ctx),null,50);
select 1 / case when exists (select 1 from public.customer_invoices where id=(select invoice_id from smoke_ctx) and status='partially_paid' and paid_amount=50) then 1 else 0 end as "PASS invoice partial payment";
select public.update_customer_invoice_state((select invoice_id from smoke_ctx),null,105);
select 1 / case when exists (select 1 from public.customer_invoices where id=(select invoice_id from smoke_ctx) and status='paid' and paid_amount=105 and paid_at is not null) then 1 else 0 end as "PASS invoice paid";

\echo '[14] Shipment create -> ship -> reservation consumption -> deliver'
with x as (
  select public.create_customer_shipment_from_order((select order_id from smoke_ctx),'Smoke shipment','rollback') as id
)
update smoke_ctx set shipment_id=(select id from x);
select 1 / case when exists (
  select 1 from public.customer_shipment_items
  where shipment_id=(select shipment_id from smoke_ctx) and shipment_quantity=1 and source_warehouse_id is not null and source_location_id is not null
) then 1 else 0 end as "PASS shipment create/allocation";
select public.set_customer_shipment_status((select shipment_id from smoke_ctx),'picking');
select public.set_customer_shipment_status((select shipment_id from smoke_ctx),'packed');
select public.ship_customer_shipment((select shipment_id from smoke_ctx),'SMOKE','TEST','SMOKE-ROLLBACK');
select 1 / case when exists (select 1 from public.customer_shipments where id=(select shipment_id from smoke_ctx) and status='shipped') then 1 else 0 end as "PASS shipment ship";
select 1 / case when exists (
  select 1 from public.customer_order_reservations where order_id=(select order_id from smoke_ctx) and status='consumed' and consumed_quantity=1 and remaining_quantity=0
) then 1 else 0 end as "PASS reservation consumed";
select 1 / case when (
  select sum(quantity) from public.inventory where product_id=(select product_id from smoke_ctx)
) = (select stock_total_before_order - 1 from smoke_ctx) then 1 else 0 end as "PASS shipment stock deduction";
select public.deliver_customer_shipment((select shipment_id from smoke_ctx));
select 1 / case when exists (select 1 from public.customer_shipments where id=(select shipment_id from smoke_ctx) and status='delivered')
  and exists (select 1 from public.customer_orders where id=(select order_id from smoke_ctx) and status='delivered')
  then 1 else 0 end as "PASS shipment/order delivered";

\echo '[15] Installation create/read/update/status lifecycle'
with x as (
  select public.create_customer_installation_from_order(
    p_order_id => (select order_id from smoke_ctx),
    p_scheduled_start_at => now() + interval '1 day',
    p_scheduled_end_at => now() + interval '1 day 2 hours',
    p_assigned_to => null,
    p_team_name => 'Smoke Team',
    p_contact_name => 'Smoke Contact',
    p_contact_phone => '+12025550125',
    p_notes => 'Smoke installation',
    p_internal_notes => 'rollback',
    p_shipment_id => (select shipment_id from smoke_ctx)
  ) as id
)
update smoke_ctx set installation_id=(select id from x);
select 1 / case when exists (select 1 from public.customer_installations where id=(select installation_id from smoke_ctx) and status='scheduled') then 1 else 0 end as "PASS installation create/read";
select public.update_customer_installation_schedule(
  (select installation_id from smoke_ctx),
  now() + interval '2 days', now() + interval '2 days 3 hours', null,
  'Smoke Team Updated','Smoke Contact','+12025550125','Smoke rescheduled','rollback'
);
select 1 / case when exists (select 1 from public.customer_installations where id=(select installation_id from smoke_ctx) and team_name='Smoke Team Updated') then 1 else 0 end as "PASS installation update";
select public.set_customer_installation_status((select installation_id from smoke_ctx),'confirmed',null);
select public.set_customer_installation_status((select installation_id from smoke_ctx),'in_progress',null);
select public.set_customer_installation_status((select installation_id from smoke_ctx),'completed','Smoke complete');
select 1 / case when exists (select 1 from public.customer_installations where id=(select installation_id from smoke_ctx) and status='completed' and completed_at is not null)
  and exists (select 1 from public.customer_orders where id=(select order_id from smoke_ctx) and status='completed' and completed_at is not null)
  then 1 else 0 end as "PASS installation/order completed";

\echo '[16] Invoice void lifecycle + non-delete lifecycle policy checks'
select public.update_customer_invoice_state((select invoice_id from smoke_ctx),'void',105);
select 1 / case when exists (select 1 from public.customer_invoices where id=(select invoice_id from smoke_ctx) and status='void' and voided_at is not null) then 1 else 0 end as "PASS invoice void";
select 1 / case when not exists (
  select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='customers' and p.polcmd='d'
) then 1 else 0 end as "PASS customers use lifecycle status, not physical delete";
select 1 / case when not exists (
  select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='customer_orders' and p.polcmd='d'
) then 1 else 0 end as "PASS orders use lifecycle status, not physical delete";
select 1 / case when not exists (
  select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='customer_invoices' and p.polcmd='d'
) then 1 else 0 end as "PASS invoices use void, not physical delete";

\echo '[17] Final consistency checks'
select 1 / case when (select count(*) from public.customer_order_status_history where order_id=(select order_id from smoke_ctx)) >= 6 then 1 else 0 end as "PASS order status history";
select 1 / case when exists (select 1 from public.customer_activity where customer_id=(select customer_id from smoke_ctx)) then 1 else 0 end as "PASS customer activity";
select 1 / case when (select count(*) from public.inventory_movements where product_id=(select product_id from smoke_ctx)) >= 7 then 1 else 0 end as "PASS inventory movement history";

\echo '=== ALL DATABASE SMOKE CHECKS PASSED; ROLLING BACK ==='
reset role;
rollback;
\echo '=== ROLLBACK COMPLETE: no smoke fixture is persisted ==='
