\set ON_ERROR_STOP on
\pset pager off
\echo '=== Store Dealer document Storage RLS smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

do $$
declare
  v_type uuid;
  v_customer uuid;
  v_user uuid := gen_random_uuid();
  v_email text := 'p15-storage-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com';
begin
  select id into v_type
  from public.customer_types
  where system_key = 'dealer' and is_active = true
  limit 1;

  insert into public.customers(customer_code, name, customer_type_id, status, portal_enabled)
  values (
    'P15-STORAGE-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    'P1.5 Storage Dealer',
    v_type,
    'active',
    true
  ) returning id into v_customer;

  insert into public.customer_portal_users(customer_id, login_email, status, is_primary)
  values (v_customer, v_email, 'never_invited', true);

  insert into auth.users(
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    v_user,
    'authenticated',
    'authenticated',
    v_email,
    '',
    '{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,
    '{}'::jsonb,
    now(), now(), false
  );

  update public.customer_portal_users
  set auth_user_id = v_user, status = 'active', activated_at = now()
  where customer_id = v_customer;

  insert into public.customer_documents(
    customer_id, document_type, file_name, storage_bucket, storage_path,
    is_active, portal_visible
  ) values
    (v_customer, 'spec', 'visible.pdf', 'customer-documents', v_customer::text || '/visible.pdf', true, true),
    (v_customer, 'spec', 'hidden.pdf', 'customer-documents', v_customer::text || '/hidden.pdf', true, false);

  insert into storage.objects(bucket_id, name, owner_id, metadata)
  values
    ('customer-documents', v_customer::text || '/visible.pdf', v_user::text, '{}'::jsonb),
    ('customer-documents', v_customer::text || '/hidden.pdf', v_user::text, '{}'::jsonb);

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end
$$;

set local role authenticated;

do $$
declare
  v_visible integer;
  v_hidden integer;
begin
  select count(*) into v_visible
  from storage.objects
  where bucket_id = 'customer-documents'
    and name like '%/visible.pdf';

  select count(*) into v_hidden
  from storage.objects
  where bucket_id = 'customer-documents'
    and name like '%/hidden.pdf';

  if v_visible <> 1 then
    raise exception 'Dealer Storage RLS could not read explicitly visible object; count=%', v_visible;
  end if;

  if v_hidden <> 0 then
    raise exception 'Dealer Storage RLS exposed hidden object; count=%', v_hidden;
  end if;
end
$$;

reset role;
rollback;
\echo '=== Store Dealer document Storage RLS smoke PASS ==='
