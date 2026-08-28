\set ON_ERROR_STOP on
\pset pager off
\echo '=== Unified Store portal order access DB smoke ==='
\echo 'All fixture writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

create temp table p14_ctx (
  fixture text primary key,
  auth_user_id uuid,
  customer_id uuid,
  portal_user_id uuid,
  order_id uuid
) on commit drop;
grant select, insert, update, delete on p14_ctx to authenticated;

create or replace function pg_temp.make_p14_fixture(p_fixture text, p_type_key text, p_account_type text)
returns void language plpgsql as $$
declare
  v_type_id uuid;
  v_customer_id uuid;
  v_auth_user_id uuid := gen_random_uuid();
  v_portal_user_id uuid;
  v_order_id uuid;
  v_email text := 'p14-' || p_fixture || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
begin
  select id into v_type_id from public.customer_types where system_key = p_type_key and is_active = true limit 1;
  if v_type_id is null then raise exception 'missing active customer type %', p_type_key; end if;

  insert into public.customers(customer_code, name, customer_type_id, status, portal_enabled)
  values ('P14-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 'P1.4 ' || p_fixture, v_type_id, 'active', true)
  returning id into v_customer_id;

  insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
  values (v_auth_user_id, 'authenticated', 'authenticated', v_email, '', jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'account_type',p_account_type), '{}'::jsonb, now(), now(), false);

  if exists(select 1 from public.profiles where id = v_auth_user_id) then
    raise exception 'external portal fixture inherited an internal profile: %', p_fixture;
  end if;

  insert into public.customer_portal_users(customer_id, auth_user_id, login_email, portal_role, status, is_primary)
  values (v_customer_id, v_auth_user_id, v_email, 'buyer', 'active', true)
  returning id into v_portal_user_id;

  insert into public.customer_orders(order_number, customer_id, status, customer_reference, item_count, fulfillment_type, subtotal, total_amount, grand_total)
  values ('P14-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), v_customer_id, 'draft', 'REF-' || p_fixture, 1, 'delivery', 999, 999, 999)
  returning id into v_order_id;

  insert into public.customer_order_items(order_id, line_no, sku_snapshot, product_name_snapshot, quantity, unit_price, line_subtotal, line_total)
  values (v_order_id, 1, 'P14-SKU', 'P1.4 Smoke Item', 2, 499.50, 999, 999);

  insert into p14_ctx(fixture, auth_user_id, customer_id, portal_user_id, order_id)
  values (p_fixture, v_auth_user_id, v_customer_id, v_portal_user_id, v_order_id);
end;
$$;

select pg_temp.make_p14_fixture('customer_a', 'retail_customer', 'customer_portal');
select pg_temp.make_p14_fixture('dealer_b', 'dealer', 'dealer_portal');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from p14_ctx where fixture='customer_a'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',(select auth_user_id::text from p14_ctx where fixture='customer_a'),'role','authenticated')::text, true);

do $$
declare
  v_context jsonb;
  v_list jsonb;
  v_own jsonb;
  v_foreign jsonb;
  v_own_id uuid := (select order_id from p14_ctx where fixture='customer_a');
  v_foreign_id uuid := (select order_id from p14_ctx where fixture='dealer_b');
  v_text text;
begin
  v_context := public.get_store_portal_context();
  if v_context->>'ok' <> 'true' or v_context->>'portal_kind' <> 'customer' then
    raise exception 'customer portal context failed: %', v_context;
  end if;

  v_list := public.get_store_portal_orders(25, 0);
  if v_list->>'ok' <> 'true' then raise exception 'order list denied: %', v_list; end if;
  if not (v_list->'orders' @> jsonb_build_array(jsonb_build_object('id', v_own_id))) then
    raise exception 'own order missing from portal list: %', v_list;
  end if;
  if v_list->'orders' @> jsonb_build_array(jsonb_build_object('id', v_foreign_id)) then
    raise exception 'foreign customer order leaked into list: %', v_list;
  end if;

  v_own := public.get_store_portal_order(v_own_id);
  if v_own->>'ok' <> 'true' then raise exception 'own order detail denied: %', v_own; end if;
  v_text := v_own::text;
  if v_text ~ 'unit_price|discount_amount|line_total|subtotal|tax_amount|total_amount|grand_total|payment_commission|internal_notes' then
    raise exception 'monetary/internal order data leaked: %', v_own;
  end if;

  v_foreign := public.get_store_portal_order(v_foreign_id);
  if v_foreign <> '{"ok":false,"reason":"order_unavailable"}'::jsonb then
    raise exception 'foreign order ownership was disclosed: %', v_foreign;
  end if;
end
$$;

reset role;
update public.customer_portal_users set status='suspended' where id=(select portal_user_id from p14_ctx where fixture='customer_a');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from p14_ctx where fixture='customer_a'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',(select auth_user_id::text from p14_ctx where fixture='customer_a'),'role','authenticated')::text, true);

do $$
declare v_payload jsonb;
begin
  v_payload := public.get_store_portal_orders(25,0);
  if v_payload <> '{"ok":false,"reason":"portal_access_denied"}'::jsonb then
    raise exception 'suspended portal user retained order access: %', v_payload;
  end if;
end
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'public.get_store_portal_context()', 'EXECUTE') then raise exception 'anon can execute portal context'; end if;
  if has_function_privilege('anon', 'public.get_store_portal_orders(integer,integer)', 'EXECUTE') then raise exception 'anon can execute portal order list'; end if;
  if has_function_privilege('anon', 'public.get_store_portal_order(uuid)', 'EXECUTE') then raise exception 'anon can execute portal order detail'; end if;
end
$$;

rollback;
\echo '=== Unified Store portal order access DB smoke PASS ==='
