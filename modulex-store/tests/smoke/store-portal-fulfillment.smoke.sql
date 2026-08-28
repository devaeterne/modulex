\set ON_ERROR_STOP on
\pset pager off
\echo '=== Store portal fulfillment isolation smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

do $$
declare
  v_type_id uuid;
  v_customer_a uuid; v_customer_b uuid;
  v_user_a uuid := gen_random_uuid(); v_user_b uuid := gen_random_uuid();
  v_portal_a uuid; v_portal_b uuid;
  v_order_a uuid; v_order_b uuid;
  v_item_a uuid; v_item_b uuid;
  v_ship_a uuid; v_ship_b uuid;
  v_install_a uuid; v_install_b uuid;
  v_email_a text := 'p15-fulfill-a-' || substr(replace(gen_random_uuid()::text,'-',''),1,10) || '@example.com';
  v_email_b text := 'p15-fulfill-b-' || substr(replace(gen_random_uuid()::text,'-',''),1,10) || '@example.com';
  v_result jsonb;
begin
  select id into v_type_id from public.customer_types where system_key='retail_customer' and is_active limit 1;
  if v_type_id is null then raise exception 'retail_customer customer type is missing'; end if;

  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled)
  values ('P15-FULFILL-A-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),'P1.5 Fulfillment A',v_type_id,'active',true)
  returning id into v_customer_a;
  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled)
  values ('P15-FULFILL-B-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),'P1.5 Fulfillment B',v_type_id,'active',true)
  returning id into v_customer_b;

  insert into public.customer_portal_users(customer_id,login_email,portal_role,status,is_primary)
  values (v_customer_a,v_email_a,'buyer','never_invited',true) returning id into v_portal_a;
  insert into public.customer_portal_users(customer_id,login_email,portal_role,status,is_primary)
  values (v_customer_b,v_email_b,'buyer','never_invited',true) returning id into v_portal_b;

  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous)
  values (v_user_a,'authenticated','authenticated',v_email_a,'','{"provider":"email","providers":["email"],"account_type":"customer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false);
  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous)
  values (v_user_b,'authenticated','authenticated',v_email_b,'','{"provider":"email","providers":["email"],"account_type":"customer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false);

  update public.customer_portal_users set auth_user_id=v_user_a,status='active',activated_at=now() where id=v_portal_a;
  update public.customer_portal_users set auth_user_id=v_user_b,status='active',activated_at=now() where id=v_portal_b;

  insert into public.customer_orders(order_number,customer_id,status,customer_reference,item_count,subtotal,total_amount,grand_total,fulfillment_type)
  values ('P15-ORDER-A',v_customer_a,'draft','REF-A',1,999,999,999,'delivery_installation') returning id into v_order_a;
  insert into public.customer_orders(order_number,customer_id,status,customer_reference,item_count,subtotal,total_amount,grand_total,fulfillment_type)
  values ('P15-ORDER-B',v_customer_b,'draft','REF-B',1,888,888,888,'delivery_installation') returning id into v_order_b;

  insert into public.customer_order_items(order_id,line_no,sku_snapshot,product_name_snapshot,quantity,unit_price,line_subtotal,line_total)
  values (v_order_a,1,'P15-SKU-A','P1.5 Product A',2,499.5,999,999) returning id into v_item_a;
  insert into public.customer_order_items(order_id,line_no,sku_snapshot,product_name_snapshot,quantity,unit_price,line_subtotal,line_total)
  values (v_order_b,1,'P15-SKU-B','P1.5 Product B',2,444,888,888) returning id into v_item_b;

  insert into public.customer_shipments(shipment_number,customer_id,order_id,status,shipping_address_snapshot,carrier,service_level,tracking_number,customer_reference,internal_notes,picking_started_at,packed_at)
  values ('P15-SHIP-A',v_customer_a,v_order_a,'packed','{"address_line_1":"100 Customer A Way","city":"Austin","state_region":"TX","postal_code":"78701","country_code":"US"}'::jsonb,'UPS','Ground','TRACK-A','SHIP-REF-A','SECRET-SHIP-A',now()-interval '2 hours',now()-interval '1 hour') returning id into v_ship_a;
  insert into public.customer_shipments(shipment_number,customer_id,order_id,status,shipping_address_snapshot,carrier,service_level,tracking_number,customer_reference,internal_notes)
  values ('P15-SHIP-B',v_customer_b,v_order_b,'draft','{"address_line_1":"200 Customer B Way","city":"Dallas","state_region":"TX","postal_code":"75201","country_code":"US"}'::jsonb,'FedEx','Ground','TRACK-B','SHIP-REF-B','SECRET-SHIP-B') returning id into v_ship_b;

  insert into public.customer_shipment_items(shipment_id,order_item_id,line_no,sku_snapshot,product_name_snapshot,ordered_quantity_snapshot,shipment_quantity)
  values (v_ship_a,v_item_a,1,'P15-SKU-A','P1.5 Product A',2,2);
  insert into public.customer_shipment_items(shipment_id,order_item_id,line_no,sku_snapshot,product_name_snapshot,ordered_quantity_snapshot,shipment_quantity)
  values (v_ship_b,v_item_b,1,'P15-SKU-B','P1.5 Product B',2,1);

  insert into public.customer_installations(installation_number,customer_id,order_id,shipment_id,status,scheduled_start_at,scheduled_end_at,address_snapshot,team_name,contact_name,contact_phone,notes,internal_notes)
  values ('P15-INSTALL-A',v_customer_a,v_order_a,v_ship_a,'confirmed',now()+interval '2 days',now()+interval '2 days 4 hours','{"address_line_1":"100 Customer A Way","city":"Austin","state_region":"TX","postal_code":"78701","country_code":"US"}'::jsonb,'Oakwell Team A','Customer A Contact','+1-555-0100','Visible A','SECRET-INSTALL-A') returning id into v_install_a;
  insert into public.customer_installations(installation_number,customer_id,order_id,shipment_id,status,scheduled_start_at,scheduled_end_at,address_snapshot,team_name,contact_name,contact_phone,notes,internal_notes)
  values ('P15-INSTALL-B',v_customer_b,v_order_b,v_ship_b,'scheduled',now()+interval '3 days',now()+interval '3 days 4 hours','{"address_line_1":"200 Customer B Way","city":"Dallas","state_region":"TX","postal_code":"75201","country_code":"US"}'::jsonb,'Oakwell Team B','Customer B Contact','+1-555-0200','Visible B','SECRET-INSTALL-B') returning id into v_install_b;

  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  v_result := public.get_store_portal_shipments(25,0);
  if not coalesce((v_result->>'ok')::boolean,false) or jsonb_array_length(v_result->'shipments')<>1 or (v_result->'shipments'->0->>'id')::uuid<>v_ship_a then
    raise exception 'shipment list isolation failed: %',v_result;
  end if;

  v_result := public.get_store_portal_shipment(v_ship_a);
  if not coalesce((v_result->>'ok')::boolean,false) then raise exception 'shipment detail denied: %',v_result; end if;
  if (v_result->'shipment') ? 'internal_notes' or (v_result->'shipment'->'items'->0) ? 'source_warehouse_id' or (v_result->'shipment'->'items'->0) ? 'source_location_id' or (v_result->'shipment'->'items'->0) ? 'stock_deducted_at' then
    raise exception 'shipment exposed internal fields: %',v_result;
  end if;
  if v_result->'shipment'->'items'->0->>'sku_snapshot'<>'P15-SKU-A' then raise exception 'shipment item payload incomplete: %',v_result; end if;

  v_result := public.get_store_portal_shipment(v_ship_b);
  if coalesce((v_result->>'ok')::boolean,false) or v_result->>'reason'<>'shipment_unavailable' then raise exception 'foreign shipment not neutral: %',v_result; end if;

  v_result := public.get_store_portal_installations(25,0);
  if not coalesce((v_result->>'ok')::boolean,false) or jsonb_array_length(v_result->'installations')<>1 or (v_result->'installations'->0->>'id')::uuid<>v_install_a then
    raise exception 'installation list isolation failed: %',v_result;
  end if;

  v_result := public.get_store_portal_installation(v_install_a);
  if not coalesce((v_result->>'ok')::boolean,false) then raise exception 'installation detail denied: %',v_result; end if;
  if (v_result->'installation') ? 'assigned_to' or (v_result->'installation') ? 'internal_notes' or (v_result->'installation') ? 'created_by' or (v_result->'installation') ? 'updated_by' then
    raise exception 'installation exposed internal fields: %',v_result;
  end if;

  v_result := public.get_store_portal_installation(v_install_b);
  if coalesce((v_result->>'ok')::boolean,false) or v_result->>'reason'<>'installation_unavailable' then raise exception 'foreign installation not neutral: %',v_result; end if;

  v_result := public.get_store_portal_dashboard_summary();
  if not coalesce((v_result->>'ok')::boolean,false) or jsonb_array_length(v_result->'shipments'->'recent')<>1 or jsonb_array_length(v_result->'installations'->'recent')<>1 then
    raise exception 'dashboard summary isolation failed: %',v_result;
  end if;

  update public.customer_portal_users set status='suspended' where id=v_portal_a;
  v_result := public.get_store_portal_shipments(25,0);
  if coalesce((v_result->>'ok')::boolean,false) or v_result->>'reason'<>'portal_access_denied' then raise exception 'suspended user retained access: %',v_result; end if;

  if has_function_privilege('anon','public.get_store_portal_shipments(integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.get_store_portal_shipment(uuid)','EXECUTE')
     or has_function_privilege('anon','public.get_store_portal_installations(integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.get_store_portal_installation(uuid)','EXECUTE')
     or has_function_privilege('anon','public.get_store_portal_dashboard_summary()','EXECUTE') then
    raise exception 'anon unexpectedly has portal fulfillment execute privilege';
  end if;
end
$$;

rollback;
\echo '=== Store portal fulfillment isolation smoke PASS ==='
