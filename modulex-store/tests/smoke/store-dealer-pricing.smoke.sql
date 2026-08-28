\set ON_ERROR_STOP on
\pset pager off
\echo '=== Store Dealer pricing isolation smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

do $$
declare
  v_dealer_type uuid;
  v_customer_type uuid;
  v_group_good uuid;
  v_dealer_a uuid;
  v_dealer_b uuid;
  v_dealer_no_group uuid;
  v_customer_a uuid;
  v_user_dealer_a uuid := gen_random_uuid();
  v_user_dealer_b uuid := gen_random_uuid();
  v_user_no_group uuid := gen_random_uuid();
  v_user_customer uuid := gen_random_uuid();
  v_order_a uuid;
  v_order_b uuid;
  v_product uuid;
  v_content uuid;
  v_result jsonb;
  v_variant jsonb;
  v_suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_email_da text;
  v_email_db text;
  v_email_ng text;
  v_email_ca text;
begin
  v_email_da := 'p15-price-da-' || v_suffix || '@example.com';
  v_email_db := 'p15-price-db-' || v_suffix || '@example.com';
  v_email_ng := 'p15-price-ng-' || v_suffix || '@example.com';
  v_email_ca := 'p15-price-ca-' || v_suffix || '@example.com';

  select id into v_dealer_type from public.customer_types where system_key='dealer' and is_active=true limit 1;
  select id into v_customer_type from public.customer_types where system_key='retail_customer' and is_active=true limit 1;
  if v_dealer_type is null or v_customer_type is null then raise exception 'required customer types missing'; end if;

  insert into public.price_groups(system_key,name,sort_order,is_active,available_for_orders,internal_only)
  values ('p15-good-'||v_suffix,'P1.5 Good',900,true,true,false) returning id into v_group_good;

  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled,currency_code,price_group_id)
  values ('P15-DA-'||v_suffix,'P1.5 Dealer A',v_dealer_type,'active',true,'USD',v_group_good) returning id into v_dealer_a;
  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled,currency_code,price_group_id)
  values ('P15-DB-'||v_suffix,'P1.5 Dealer B',v_dealer_type,'active',true,'USD',v_group_good) returning id into v_dealer_b;
  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled,currency_code)
  values ('P15-NG-'||v_suffix,'P1.5 Dealer No Group',v_dealer_type,'active',true,'USD') returning id into v_dealer_no_group;
  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled,currency_code)
  values ('P15-CA-'||v_suffix,'P1.5 Customer A',v_customer_type,'active',true,'USD') returning id into v_customer_a;

  insert into public.customer_portal_users(customer_id,login_email,status,is_primary)
  values
    (v_dealer_a,v_email_da,'never_invited',true),
    (v_dealer_b,v_email_db,'never_invited',true),
    (v_dealer_no_group,v_email_ng,'never_invited',true),
    (v_customer_a,v_email_ca,'never_invited',true);

  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous)
  values
    (v_user_dealer_a,'authenticated','authenticated',v_email_da,'','{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false),
    (v_user_dealer_b,'authenticated','authenticated',v_email_db,'','{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false),
    (v_user_no_group,'authenticated','authenticated',v_email_ng,'','{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false),
    (v_user_customer,'authenticated','authenticated',v_email_ca,'','{"provider":"email","providers":["email"],"account_type":"customer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false);

  update public.customer_portal_users set auth_user_id=v_user_dealer_a,status='active',activated_at=now() where customer_id=v_dealer_a;
  update public.customer_portal_users set auth_user_id=v_user_dealer_b,status='active',activated_at=now() where customer_id=v_dealer_b;
  update public.customer_portal_users set auth_user_id=v_user_no_group,status='active',activated_at=now() where customer_id=v_dealer_no_group;
  update public.customer_portal_users set auth_user_id=v_user_customer,status='active',activated_at=now() where customer_id=v_customer_a;

  insert into public.products(sku,name,status,base_product_code,color_code,color_name)
  values ('P15-SKU-'||v_suffix,'P1.5 Priced Product '||v_suffix,'active','P15-BASE-'||v_suffix,'WH','White') returning id into v_product;
  insert into public.store_product_content(base_product_code,slug,display_name,short_description,is_published)
  values ('P15-BASE-'||v_suffix,'p15-product-'||v_suffix,'P1.5 Priced Product '||v_suffix,'Published smoke product',false)
  returning id into v_content;
  insert into public.store_product_media(product_content_id,media_type,url,is_primary)
  values (v_content,'image','https://example.com/p15-smoke.jpg',true);
  update public.store_product_content set is_published=true where id=v_content;
  insert into public.product_prices(product_id,price_group_id,amount,currency_code,valid_from,is_active)
  values (v_product,v_group_good,123.45,'USD',now()-interval '1 day',true);

  insert into public.customer_orders(order_number,customer_id,status,item_count,subtotal,discount_amount,tax_rate,tax_amount,total_amount,payment_commission_percent,payment_commission_amount,grand_total,payment_commission_default_percent,fulfillment_type,currency_code)
  values ('P15-ORDER-DA-'||v_suffix,v_dealer_a,'confirmed',1,100,0,10,10,110,5,5.5,115.5,5,'delivery','USD') returning id into v_order_a;
  insert into public.customer_order_items(order_id,line_no,sku_snapshot,product_name_snapshot,quantity,unit_price,discount_percent,discount_amount,line_subtotal,line_total)
  values (v_order_a,1,'P15-SKU-'||v_suffix,'P1.5 Priced Product',1,100,0,0,100,100);
  insert into public.customer_orders(order_number,customer_id,status,item_count,subtotal,discount_amount,tax_rate,tax_amount,total_amount,payment_commission_percent,payment_commission_amount,grand_total,payment_commission_default_percent,fulfillment_type,currency_code)
  values ('P15-ORDER-DB-'||v_suffix,v_dealer_b,'confirmed',0,200,0,10,20,220,5,11,231,5,'delivery','USD') returning id into v_order_b;

  perform set_config('request.jwt.claim.sub',v_user_dealer_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  v_result := public.get_store_dealer_pricing_context();
  if coalesce((v_result->>'pricing_enabled')::boolean,false) is not true then raise exception 'eligible Dealer pricing gate closed: %',v_result; end if;

  v_result := public.get_store_dealer_catalog_products('P1.5 Priced Product '||v_suffix,null,48,0);
  select value into v_variant from jsonb_array_elements(v_result->'products'->0->'variants') value where value->>'sku'='P15-SKU-'||v_suffix limit 1;
  if v_variant is null or coalesce((v_variant->>'priceAvailable')::boolean,false) is not true or (v_variant->>'price')::numeric <> 123.45 then
    raise exception 'assigned-tier price missing or incorrect: %',v_result;
  end if;

  v_result := public.get_store_dealer_product_by_slug('p15-product-'||v_suffix);
  if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'Dealer product slug detail unavailable: %',v_result; end if;

  v_result := public.get_store_dealer_order(v_order_a);
  if coalesce((v_result->>'ok')::boolean,false) is not true or not ((v_result->'order') ? 'total_amount') then raise exception 'priced Dealer order missing approved amount: %',v_result; end if;
  if (v_result->'order') ? 'grand_total' or (v_result->'order') ? 'payment_commission_amount' then raise exception 'Dealer order exposed payment commission/grand total: %',v_result; end if;

  v_result := public.get_store_dealer_order(v_order_b);
  if coalesce((v_result->>'ok')::boolean,false) is true or v_result->>'reason' <> 'order_unavailable' then raise exception 'foreign Dealer order not neutral: %',v_result; end if;

  perform set_config('request.jwt.claim.sub',v_user_no_group::text,true);
  v_result := public.get_store_dealer_pricing_context();
  if coalesce((v_result->>'pricing_enabled')::boolean,false) then raise exception 'no-group Dealer pricing enabled: %',v_result; end if;

  perform set_config('request.jwt.claim.sub',v_user_dealer_a::text,true);
  update public.price_groups set is_active=false where id=v_group_good;
  if coalesce(((public.get_store_dealer_pricing_context())->>'pricing_enabled')::boolean,false) then raise exception 'inactive group enabled pricing'; end if;
  update public.price_groups set is_active=true,internal_only=true where id=v_group_good;
  if coalesce(((public.get_store_dealer_pricing_context())->>'pricing_enabled')::boolean,false) then raise exception 'internal group enabled pricing'; end if;
  update public.price_groups set internal_only=false,available_for_orders=false where id=v_group_good;
  if coalesce(((public.get_store_dealer_pricing_context())->>'pricing_enabled')::boolean,false) then raise exception 'non-order group enabled pricing'; end if;
  update public.price_groups set available_for_orders=true where id=v_group_good;

  update public.product_prices set is_active=false where product_id=v_product and price_group_id=v_group_good;
  v_result := public.get_store_dealer_catalog_products('P1.5 Priced Product '||v_suffix,null,48,0);
  select value into v_variant from jsonb_array_elements(v_result->'products'->0->'variants') value where value->>'sku'='P15-SKU-'||v_suffix limit 1;
  if v_variant is null or coalesce((v_variant->>'priceAvailable')::boolean,false) then raise exception 'missing assigned-tier price did not become unavailable: %',v_result; end if;
  if v_variant ? 'price' and v_variant->'price' <> 'null'::jsonb then raise exception 'missing tier price fell back to another amount: %',v_variant; end if;

  update public.price_groups set available_for_orders=false where id=v_group_good;
  v_result := public.get_store_dealer_order(v_order_a);
  if (v_result->'order') ? 'subtotal' or (v_result->'order'->'items'->0) ? 'unit_price' then raise exception 'closed gate leaked monetary keys: %',v_result; end if;
  update public.price_groups set available_for_orders=true where id=v_group_good;

  perform set_config('request.jwt.claim.sub',v_user_customer::text,true);
  v_result := public.get_store_dealer_pricing_context();
  if coalesce((v_result->>'ok')::boolean,false) is true then raise exception 'Customer portal accessed Dealer pricing: %',v_result; end if;
  v_result := public.get_store_dealer_catalog_products(null,null,48,0);
  if coalesce((v_result->>'ok')::boolean,false) is true then raise exception 'Customer portal accessed Dealer catalog: %',v_result; end if;

  if has_function_privilege('anon','public.get_store_dealer_pricing_context()','EXECUTE') then raise exception 'anon can execute Dealer pricing context'; end if;
  if has_function_privilege('anon','public.get_store_dealer_catalog_products(text,text,integer,integer)','EXECUTE') then raise exception 'anon can execute Dealer catalog'; end if;
  if has_function_privilege('anon','public.get_store_dealer_product_by_slug(text)','EXECUTE') then raise exception 'anon can execute Dealer product detail'; end if;
  if has_function_privilege('anon','public.get_store_dealer_order(uuid)','EXECUTE') then raise exception 'anon can execute Dealer order'; end if;
end
$$;

rollback;
\echo '=== Store Dealer pricing isolation smoke PASS ==='
