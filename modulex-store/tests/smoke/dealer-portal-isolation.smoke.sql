\set ON_ERROR_STOP on
\pset pager off
\echo '=== Dealer portal isolation DB smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

create temp table portal_smoke_ctx (
  fixture text primary key,
  auth_user_id uuid,
  customer_id uuid,
  portal_user_id uuid,
  result jsonb
) on commit drop;
grant select, insert, update, delete on portal_smoke_ctx to authenticated;

create or replace function pg_temp.make_portal_fixture(
  p_fixture text,
  p_customer_enabled boolean,
  p_portal_status text
) returns void
language plpgsql
as $$
declare
  v_customer_id uuid;
  v_auth_user_id uuid := gen_random_uuid();
  v_email text := 'portal-' || p_fixture || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
  v_portal_user_id uuid;
begin
  insert into public.customers(customer_code, name, status, portal_enabled)
  values (
    'PORTAL-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    'Portal ' || p_fixture || ' Smoke',
    'active',
    p_customer_enabled
  ) returning id into v_customer_id;

  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    v_auth_user_id,
    'authenticated',
    'authenticated',
    v_email,
    '',
    '{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,
    '{}'::jsonb,
    now(), now(), false
  );

  insert into public.customer_portal_users(
    customer_id, auth_user_id, login_email, portal_role, status, is_primary
  ) values (
    v_customer_id, v_auth_user_id, v_email, 'buyer', p_portal_status, p_fixture = 'active_enabled'
  ) returning id into v_portal_user_id;

  insert into portal_smoke_ctx(fixture, auth_user_id, customer_id, portal_user_id)
  values (p_fixture, v_auth_user_id, v_customer_id, v_portal_user_id);
end;
$$;

select pg_temp.make_portal_fixture('active_enabled', true, 'active');
select pg_temp.make_portal_fixture('suspended', true, 'suspended');
select pg_temp.make_portal_fixture('disabled_customer', false, 'active');

with a as (
  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    gen_random_uuid(), 'authenticated', 'authenticated',
    'portal-unmapped-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com',
    '',
    '{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,
    '{}'::jsonb,
    now(), now(), false
  ) returning id
)
insert into portal_smoke_ctx(fixture, auth_user_id)
select 'unmapped', id from a;

set local role authenticated;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from portal_smoke_ctx where fixture='active_enabled'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from portal_smoke_ctx where fixture='active_enabled'), 'role', 'authenticated')::text, true);
update portal_smoke_ctx set result = public.get_store_dealer_portal_context() where fixture='active_enabled';

do $$
declare
  payload jsonb;
  expected_customer uuid;
  expected_portal_user uuid;
begin
  select result, customer_id, portal_user_id into payload, expected_customer, expected_portal_user
  from portal_smoke_ctx where fixture='active_enabled';

  if payload->>'ok' <> 'true' or payload->>'reason' <> 'authorized' then
    raise exception 'active portal user was not authorized: %', payload;
  end if;
  if payload->>'customer_id' <> expected_customer::text then
    raise exception 'resolved wrong customer: %', payload;
  end if;
  if payload->>'portal_user_id' <> expected_portal_user::text then
    raise exception 'resolved wrong portal user: %', payload;
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(payload) key)
     <> array['customer_id','customer_name','customer_status','ok','portal_role','portal_user_id','reason']::text[] then
    raise exception 'portal context exposed unexpected fields: %', payload;
  end if;
  if public.current_user_has_any_role(array['super_admin','admin','sales','finance','hr']) then
    raise exception 'portal caller inherited internal role';
  end if;
  if exists (select 1 from public.customers) then
    raise exception 'portal caller can directly read customers';
  end if;
  if exists (select 1 from public.customer_portal_users) then
    raise exception 'portal caller can directly read customer_portal_users';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from portal_smoke_ctx where fixture='suspended'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from portal_smoke_ctx where fixture='suspended'), 'role', 'authenticated')::text, true);
update portal_smoke_ctx set result = public.get_store_dealer_portal_context() where fixture='suspended';

select set_config('request.jwt.claim.sub', (select auth_user_id::text from portal_smoke_ctx where fixture='disabled_customer'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from portal_smoke_ctx where fixture='disabled_customer'), 'role', 'authenticated')::text, true);
update portal_smoke_ctx set result = public.get_store_dealer_portal_context() where fixture='disabled_customer';

select set_config('request.jwt.claim.sub', (select auth_user_id::text from portal_smoke_ctx where fixture='unmapped'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from portal_smoke_ctx where fixture='unmapped'), 'role', 'authenticated')::text, true);
update portal_smoke_ctx set result = public.get_store_dealer_portal_context() where fixture='unmapped';

do $$
begin
  if exists (
    select 1 from portal_smoke_ctx
    where fixture in ('suspended','disabled_customer','unmapped')
      and result <> '{"ok":false,"reason":"portal_access_denied"}'::jsonb
  ) then
    raise exception 'denied portal states leaked details: %',
      (select jsonb_object_agg(fixture, result) from portal_smoke_ctx where fixture in ('suspended','disabled_customer','unmapped'));
  end if;
end
$$;

reset role;

do $$
declare
  duplicate_blocked boolean := false;
begin
  begin
    insert into public.customer_portal_users(customer_id, auth_user_id, login_email, portal_role, status)
    select
      (select customer_id from portal_smoke_ctx where fixture='suspended'),
      (select auth_user_id from portal_smoke_ctx where fixture='active_enabled'),
      'portal-duplicate-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com',
      'buyer', 'active';
  exception when unique_violation then
    duplicate_blocked := true;
  end;

  if not duplicate_blocked then
    raise exception 'duplicate auth_user_id portal mapping was allowed';
  end if;
end
$$;

rollback;
\echo '=== Dealer portal isolation DB smoke PASS ==='
