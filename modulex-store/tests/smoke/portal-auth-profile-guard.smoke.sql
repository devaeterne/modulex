\set ON_ERROR_STOP on
\pset pager off
\echo '=== Portal Auth profile guard smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

do $$
declare
  v_customer_id uuid;
  v_external_user_id uuid := gen_random_uuid();
  v_internal_user_id uuid := gen_random_uuid();
  v_external_email text := 'portal-profile-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
  v_internal_email text := 'internal-profile-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
  v_type_id uuid;
begin
  select id into v_type_id
  from public.customer_types
  where system_key = 'retail_customer' and is_active = true
  limit 1;

  if v_type_id is null then
    raise exception 'retail_customer customer type is missing';
  end if;

  insert into public.customers(customer_code, name, customer_type_id, status, portal_enabled)
  values (
    'PROFILE-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    'Portal Profile Guard Smoke',
    v_type_id,
    'active',
    true
  ) returning id into v_customer_id;

  insert into public.customer_portal_users(customer_id, login_email, portal_role, status, is_primary)
  values (v_customer_id, v_external_email, 'buyer', 'never_invited', true);

  -- Reproduces Supabase Admin createUser timing where custom app metadata may not
  -- yet be visible to the auth.users AFTER INSERT trigger.
  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    v_external_user_id,
    'authenticated',
    'authenticated',
    v_external_email,
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), false
  );

  if exists (select 1 from public.profiles where id = v_external_user_id) then
    raise exception 'pending external portal Auth user received an internal profile';
  end if;

  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    v_internal_user_id,
    'authenticated',
    'authenticated',
    v_internal_email,
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Internal Profile Smoke"}'::jsonb,
    now(), now(), false
  );

  if not exists (select 1 from public.profiles where id = v_internal_user_id and role = 'sales') then
    raise exception 'ordinary internal Auth provisioning no longer creates an internal profile';
  end if;
end
$$;

rollback;
\echo '=== Portal Auth profile guard smoke PASS ==='
