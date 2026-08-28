\set ON_ERROR_STOP on
\pset pager off
\echo '=== Dealer portal auth boundary DB smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

create temp table dealer_auth_smoke_ctx (
  auth_user_id uuid primary key
) on commit drop;
grant select, insert on dealer_auth_smoke_ctx to authenticated;

with auth_fixture as (
  insert into auth.users (
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) values (
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'dealer-auth-boundary-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    '',
    '{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false
  )
  returning id
)
insert into dealer_auth_smoke_ctx(auth_user_id)
select id from auth_fixture;

do $$
begin
  if exists (
    select 1
    from public.profiles p
    join dealer_auth_smoke_ctx s on s.auth_user_id = p.id
  ) then
    raise exception 'dealer portal auth user was provisioned as an internal profile';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from dealer_auth_smoke_ctx), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', (select auth_user_id::text from dealer_auth_smoke_ctx), 'role', 'authenticated')::text, true);

do $$
begin
  if public.current_user_has_any_role(array['super_admin','admin','sales','finance','hr']) then
    raise exception 'dealer portal auth user inherited an internal role';
  end if;
  if exists (select 1 from public.customers) then
    raise exception 'dealer portal auth user can directly read customers';
  end if;
end
$$;

rollback;
\echo '=== Dealer portal auth boundary DB smoke PASS ==='
