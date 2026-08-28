\set ON_ERROR_STOP on
\pset pager off
\echo '=== Dealer portal activation DB smoke ==='
\echo 'All fixture writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

create temp table dealer_activation_ctx (
  fixture text primary key,
  auth_user_id uuid not null,
  customer_id uuid not null,
  portal_user_id uuid not null
) on commit drop;
grant select on dealer_activation_ctx to authenticated;

with fixture(fixture, portal_enabled, portal_status, account_type) as (
  values
    ('success', true, 'invited', 'dealer_portal'),
    ('disabled', false, 'invited', 'dealer_portal'),
    ('suspended', true, 'suspended', 'dealer_portal'),
    ('wrong_type', true, 'invited', 'internal')
), created_users as (
  insert into auth.users (
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  )
  select
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'dealer-activation-' || fixture || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) || '@example.com',
    '',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'account_type', account_type),
    '{}'::jsonb,
    now(),
    now(),
    false
  from fixture
  returning id, email
), keyed_users as (
  select
    case
      when email like 'dealer-activation-success-%' then 'success'
      when email like 'dealer-activation-disabled-%' then 'disabled'
      when email like 'dealer-activation-suspended-%' then 'suspended'
      else 'wrong_type'
    end as fixture,
    id as auth_user_id,
    email
  from created_users
), created_customers as (
  insert into public.customers (customer_code, name, portal_enabled)
  select
    'SMK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    'Dealer Activation Smoke ' || fixture,
    portal_enabled
  from fixture
  returning id, name
), keyed_customers as (
  select
    case
      when name like '% success' then 'success'
      when name like '% disabled' then 'disabled'
      when name like '% suspended' then 'suspended'
      else 'wrong_type'
    end as fixture,
    id as customer_id
  from created_customers
), created_portal_users as (
  insert into public.customer_portal_users (
    customer_id, auth_user_id, full_name, login_email,
    portal_role, status, invited_at
  )
  select
    c.customer_id,
    u.auth_user_id,
    'Smoke Dealer',
    u.email,
    'buyer',
    f.portal_status,
    now()
  from fixture f
  join keyed_users u using (fixture)
  join keyed_customers c using (fixture)
  returning id, customer_id, auth_user_id
)
insert into dealer_activation_ctx(fixture, auth_user_id, customer_id, portal_user_id)
select f.fixture, u.auth_user_id, c.customer_id, p.id
from fixture f
join keyed_users u using (fixture)
join keyed_customers c using (fixture)
join created_portal_users p on p.customer_id = c.customer_id and p.auth_user_id = u.auth_user_id;

do $$
begin
  if has_table_privilege('authenticated', 'public.customer_portal_users', 'INSERT')
     or has_table_privilege('authenticated', 'public.customer_portal_users', 'UPDATE')
     or has_table_privilege('authenticated', 'public.customer_portal_users', 'DELETE') then
    raise exception 'authenticated still has direct customer_portal_users DML';
  end if;

  if exists (
    select 1
    from public.profiles p
    join dealer_activation_ctx c on c.auth_user_id = p.id
    where c.fixture in ('success', 'disabled', 'suspended')
  ) then
    raise exception 'dealer fixture received an internal profile';
  end if;
end
$$;

set local role authenticated;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'success'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'success'), 'role', 'authenticated')::text, true);
do $$ declare result jsonb; begin
  result := public.activate_store_dealer_portal_user();
  if coalesce((result ->> 'ok')::boolean, false) is not true then
    raise exception 'valid dealer activation was denied: %', result;
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'disabled'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'disabled'), 'role', 'authenticated')::text, true);
do $$ declare result jsonb; begin
  result := public.activate_store_dealer_portal_user();
  if coalesce((result ->> 'ok')::boolean, false) is true then
    raise exception 'disabled customer activation unexpectedly succeeded';
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'suspended'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'suspended'), 'role', 'authenticated')::text, true);
do $$ declare result jsonb; begin
  result := public.activate_store_dealer_portal_user();
  if coalesce((result ->> 'ok')::boolean, false) is true then
    raise exception 'suspended dealer activation unexpectedly succeeded';
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'wrong_type'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from dealer_activation_ctx where fixture = 'wrong_type'), 'role', 'authenticated')::text, true);
do $$ declare result jsonb; begin
  result := public.activate_store_dealer_portal_user();
  if coalesce((result ->> 'ok')::boolean, false) is true then
    raise exception 'non-dealer app metadata activation unexpectedly succeeded';
  end if;
end $$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.customer_portal_users p
    join dealer_activation_ctx c on c.portal_user_id = p.id
    where c.fixture = 'success' and p.status = 'active' and p.activated_at is not null
  ) then
    raise exception 'valid activation did not persist active lifecycle state';
  end if;

  if exists (
    select 1 from public.customer_portal_users p
    join dealer_activation_ctx c on c.portal_user_id = p.id
    where c.fixture in ('disabled', 'wrong_type') and p.status <> 'invited'
  ) then
    raise exception 'denied activation changed invited lifecycle state';
  end if;

  if exists (
    select 1 from public.customer_portal_users p
    join dealer_activation_ctx c on c.portal_user_id = p.id
    where c.fixture = 'suspended' and p.status <> 'suspended'
  ) then
    raise exception 'denied suspended activation changed lifecycle state';
  end if;
end
$$;

rollback;
\echo '=== Dealer portal activation DB smoke PASS ==='
