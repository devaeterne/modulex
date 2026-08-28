\set ON_ERROR_STOP on
\pset pager off
\echo '=== Store portal fulfillment isolation smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

do $$
declare
  v_type_id uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_portal_user_a uuid;
  v_portal_user_b uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_order_item_a uuid;
  v_order_item_b uuid;
  v_shipment_a uuid;
  v_shipment_b uuid;
  v_installation_a uuid;
  v_installation_b uuid;
  v_email_a text := 'p15-fulfill-a-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
  v_email_b text := 'p15-fulfill-b-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
  v_result jsonb;
begin
  select id into v_type_id
  from public.customer_types
  where system_key = 'retail_customer' and is_active = true
  limit 1;

  if v_type_id is null then
    raise exception 'retail_customer customer type is missing';
  end if;

  insert into public.customers(customer_code, name, customer_type_id, status, portal_enabled)
  values ('P15-FULFILL-A-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'P1.5 Fulfillment A', v_type_id, 'active', true)
  returning id into v_customer_a;

  insert into public.customers(customer_code, name, customer_type_id, status, portal_enabled)
  values ('P15-FULFILL-B-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'P1.5 Fulfillment B', v_type_id, 'active', true)
  returning id into v_customer_b;

  -- Provision portal metadata first so the external-user profile guard can identify
  -- these Auth inserts even if custom app metadata timing changes.
  insert into public.customer_portal_users(customer_id, login_email, portal_role, status, is_primary)
  values (v_customer_a, v_email_a, 'buyer', 'never_invited', true)
  returning id into v_portal_user_a;

  insert into public.customer_portal_users(customer_id, login_email, portal_role, status, is_primary)
  values (v_customer_b, v_email_b, 'buyer', 'never_invited', true)
  returning id into v_portal_user_b;

  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    v_user_a, 'authenticated', 'authenticated', v_email_a, '',
    '{"provider":"email","providers":["email"],"account_type":"customer_portal"}'::jsonb,
    '{}'::jsonb, now(), now(), false
  );

  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    v_user_b, 'authenticated', 'authenticated', v_email_b, '',
    '{"provider":"email","providers":["email"],"account_type":"customer_portal"}'::jsonb,
    '{}'::jsonb, now(), now(), false
  );

  update public.customer_portal_users
  set auth_user_id = v_user_a, status = 'active', activated_at = now()
  where id = v_portal_user_a;

  update public.customer_portal_users
  set auth_user_id = v_user_b, status = 'active', activated_at = now()
  where id = v_portal_user_b;

  insert into public.customer_orders(
    order_number, customer_id, status, customer_reference, item_count,
    subtotal, discount_amount, tax_rate, tax_amount, total_amount,
    payment_commission_percent, payment_commission_amount, grand_total,
    payment_commission_default_percent, fulfillment_type
  ) values (
    'P15-ORDER-A-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_customer_a, 'draft', 'REF-A', 1,
    999, 0, 10, 99.9, 1098.9, 5, 54.945, 1153.845, 5, 'delivery_installation'
  ) returning id into v_order_a;

  insert into public.customer_orders(
    order_number, customer_id, status, customer_reference, item_count,
    subtotal, discount_amount, tax_rate, tax_amount, total_amount,
    payment_commission_percent, payment_commission_amount, grand_total,
    payment_commission_default_percent, fulfillment_type
  ) values (
    'P15-ORDER-B-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_customer_b, 'draft', 'REF-B', 1,
    888, 0, 10, 88.8, 976.8, 5, 48.84, 1025.64, 5, 'delivery_installation'
  ) returning id into v_order_b;

  insert into public.customer_order_items(
    order_id, line_no, sku_snapshot, product_name_snapshot, quantity,
    unit_price, discount_percent, discount_amount, line_subtotal, line_total
  ) values (v_order_a, 1, 'P15-SKU-A', 'P1.5 Product A', 2, 499.5, 0, 0, 999, 999)
  returning id into v_order_item_a;

  insert into public.customer_order_items(
    order_id, line_no, sku_snapshot, product_name_snapshot, quantity,
    unit_price, discount_percent, discount_amount, line_subtotal, line_total
  ) values (v_order_b, 1, 'P15-SKU-B', 'P1.5 Product B', 2, 444, 0, 0, 888, 888)
  returning id into v_order_item_b;

  insert into public.customer_shipments(
    shipment_number, customer_id, order_id, status,
    shipping_address_snapshot, carrier, service_level, tracking_number,
    customer_reference, notes, internal_notes, picking_started_at, packed_at
  ) values (
    'P15-SHIP-A-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_customer_a, v_order_a, 'packed',
    '{"address_line_1":"100 Customer A Way","city":"Austin","state_region":"TX","postal_code":"78701","country_code":"US"}'::jsonb,
    'UPS', 'Ground', 'TRACK-A', 'SHIP-REF-A', 'Customer-visible shipment note', 'SECRET-SHIP-A', now() - interval '2 hours', now() - interval '1 hour'
  ) returning id into v_shipment_a;

  insert into public.customer_shipments(
    shipment_number, customer_id, order_id, status,
    shipping_address_snapshot, carrier, service_level, tracking_number,
    customer_reference, notes, internal_notes
  ) values (
    'P15-SHIP-B-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_customer_b, v_order_b, 'draft',
    '{"address_line_1":"200 Customer B Way","city":"Dallas","state_region":"TX","postal_code":"75201","country_code":"US"}'::jsonb,
    'FedEx', 'Ground', 'TRACK-B', 'SHIP-REF-B', 'Customer-visible shipment note B', 'SECRET-SHIP-B'
  ) returning id into v_shipment_b;

  insert into public.customer_shipment_items(
    shipment_id, order_item_id, line_no, sku_snapshot, product_name_snapshot,
    ordered_quantity_snapshot, shipment_quantity,
    source_warehouse_id, source_location_id, stock_deducted_at
  ) values (
    v_shipment_a, v_order_item_a, 1, 'P15-SKU-A', 'P1.5 Product A', 2, 2,
    gen_random_uuid(), gen_random_uuid(), now()
  );

  insert into public.customer_shipment_items(
    shipment_id, order_item_id, line_no, sku_snapshot, product_name_snapshot,
    ordered_quantity_snapshot, shipment_quantity
  ) values (v_shipment_b, v_order_item_b, 1, 'P15-SKU-B', 'P1.5 Product B', 2, 1);

  insert into public.customer_installations(
    installation_number, customer_id, order_id, shipment_id, status,
    scheduled_start_at, scheduled_end_at, address_snapshot,
    assigned_to, team_name, contact_name, contact_phone,
    notes, internal_notes
  ) values (
    'P15-INSTALL-A-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_customer_a, v_order_a, v_shipment_a, 'confirmed',
    now() + interval '2 days', now() + interval '2 days 4 hours',
    '{"address_line_1":"100 Customer A Way","city":"Austin","state_region":"TX","postal_code":"78701","country_code":"US"}'::jsonb,
    gen_random_uuid(), 'Oakwell Install Team A', 'Customer A Contact', '+1-555-0100',
    'Customer-visible install note', 'SECRET-INSTALL-A'
  ) returning id into v_installation_a;

  insert into public.customer_installations(
    installation_number, customer_id, order_id, shipment_id, status,
    scheduled_start_at, scheduled_end_at, address_snapshot,
    team_name, contact_name, contact_phone, notes, internal_notes
  ) values (
    'P15-INSTALL-B-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_customer_b, v_order_b, v_shipment_b, 'scheduled',
    now() + interval '3 days', now() + interval '3 days 4 hours',
    '{"address_line_1":"200 Customer B Way","city":"Dallas","state_region":"TX","postal_code":"75201","country_code":"US"}'::jsonb,
    'Oakwell Install Team B', 'Customer B Contact', '+1-555-0200',
    'Customer-visible install note B', 'SECRET-INSTALL-B'
  ) returning id into v_installation_b;

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := public.get_store_portal_shipments(25, 0);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Customer A shipment list was denied: %', v_result;
  end if;
  if jsonb_array_length(v_result -> 'shipments') <> 1 then
    raise exception 'Customer A shipment list is not isolated: %', v_result;
  end if;
  if (v_result -> 'shipments' -> 0 ->> 'id')::uuid <> v_shipment_a then
    raise exception 'Customer A shipment list returned another customer shipment: %', v_result;
  end if;

  v_result := public.get_store_portal_shipment(v_shipment_a);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Customer A shipment detail was denied: %', v_result;
  end if;
  if (v_result -> 'shipment') ? 'internal_notes'
     or (v_result -> 'shipment' -> 'items' -> 0) ? 'source_warehouse_id'
     or (v_result -> 'shipment' -> 'items' -> 0) ? 'source_location_id'
     or (v_result -> 'shipment' -> 'items' -> 0) ? 'stock_deducted_at' then
    raise exception 'Shipment payload exposed internal fields: %', v_result;
  end if;
  if (v_result -> 'shipment' -> 'items' -> 0 ->> 'sku_snapshot') <> 'P15-SKU-A' then
    raise exception 'Shipment item allowlist payload is incomplete: %', v_result;
  end if;

  v_result := public.get_store_portal_shipment(v_shipment_b);
  if coalesce((v_result ->> 'ok')::boolean, false) is true
     or v_result ->> 'reason' <> 'shipment_unavailable' then
    raise exception 'Foreign shipment did not fail neutrally: %', v_result;
  end if;

  v_result := public.get_store_portal_installations(25, 0);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true
     or jsonb_array_length(v_result -> 'installations') <> 1
     or (v_result -> 'installations' -> 0 ->> 'id')::uuid <> v_installation_a then
    raise exception 'Customer A installation list is not isolated: %', v_result;
  end if;

  v_result := public.get_store_portal_installation(v_installation_a);
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Customer A installation detail was denied: %', v_result;
  end if;
  if (v_result -> 'installation') ? 'assigned_to'
     or (v_result -> 'installation') ? 'internal_notes'
     or (v_result -> 'installation') ? 'created_by'
     or (v_result -> 'installation') ? 'updated_by' then
    raise exception 'Installation payload exposed internal fields: %', v_result;
  end if;

  v_result := public.get_store_portal_installation(v_installation_b);
  if coalesce((v_result ->> 'ok')::boolean, false) is true
     or v_result ->> 'reason' <> 'installation_unavailable' then
    raise exception 'Foreign installation did not fail neutrally: %', v_result;
  end if;

  v_result := public.get_store_portal_dashboard_summary();
  if coalesce((v_result ->> 'ok')::boolean, false) is not true
     or jsonb_array_length(v_result -> 'shipments' -> 'recent') <> 1
     or jsonb_array_length(v_result -> 'installations' -> 'recent') <> 1 then
    raise exception 'Dashboard summary is not customer-scoped: %', v_result;
  end if;

  update public.customer_portal_users set status = 'suspended' where id = v_portal_user_a;
  v_result := public.get_store_portal_shipments(25, 0);
  if coalesce((v_result ->> 'ok')::boolean, false) is true
     or v_result ->> 'reason' <> 'portal_access_denied' then
    raise exception 'Suspended portal user retained fulfillment access: %', v_result;
  end if;

  if has_function_privilege('anon', 'public.get_store_portal_shipments(integer,integer)', 'EXECUTE') then
    raise exception 'anon can execute portal shipment list RPC';
  end if;
  if has_function_privilege('anon', 'public.get_store_portal_shipment(uuid)', 'EXECUTE') then
    raise exception 'anon can execute portal shipment detail RPC';
  end if;
  if has_function_privilege('anon', 'public.get_store_portal_installations(integer,integer)', 'EXECUTE') then
    raise exception 'anon can execute portal installation list RPC';
  end if;
  if has_function_privilege('anon', 'public.get_store_portal_installation(uuid)', 'EXECUTE') then
    raise exception 'anon can execute portal installation detail RPC';
  end if;
  if has_function_privilege('anon', 'public.get_store_portal_dashboard_summary()', 'EXECUTE') then
    raise exception 'anon can execute portal dashboard summary RPC';
  end if;
end
$$;

rollback;
\echo '=== Store portal fulfillment isolation smoke PASS ==='
