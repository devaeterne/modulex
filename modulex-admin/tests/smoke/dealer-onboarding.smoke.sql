\set ON_ERROR_STOP on
\pset pager off
\echo '=== Controlled dealer onboarding DB smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

select id::text as admin_user_id
from public.profiles
where is_active = true
  and role in ('super_admin', 'admin', 'sales')
order by case role when 'super_admin' then 0 when 'admin' then 1 else 2 end, created_at
limit 1
\gset smoke_

\if :{?smoke_admin_user_id}
\else
  \echo 'FAIL: no active super_admin/admin/sales profile exists.'
  \quit 3
\endif

begin;
set local statement_timeout = '60s';

create temp table dealer_smoke_ctx (
  fixture text primary key,
  lead_id uuid,
  result jsonb
) on commit drop;
grant select, insert, update, delete on dealer_smoke_ctx to authenticated;

select set_config('request.jwt.claim.sub', :'smoke_admin_user_id', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'smoke_admin_user_id', 'role', 'authenticated')::text,
  true
);

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, phone, company_name,
    company_website, country_code, city, privacy_accepted, source, updated_by
  ) values (
    'dealer_application', 'approved', 'Dealer', 'Smoke',
    'dealer-smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    '+12025550199',
    'Dealer Smoke ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'https://example.com', 'US', 'New York', true, 'smoke', :'smoke_admin_user_id'::uuid
  ) returning id
)
insert into dealer_smoke_ctx(fixture, lead_id) select 'approved_dealer', id from x;

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  ) values (
    'dealer_application', 'qualified', 'Pending', 'Dealer',
    'pending-smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'Pending Dealer Smoke ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'US', true, 'smoke', :'smoke_admin_user_id'::uuid
  ) returning id
)
insert into dealer_smoke_ctx(fixture, lead_id) select 'unapproved_dealer', id from x;

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email,
    country_code, privacy_accepted, source, updated_by
  ) values (
    'contact', 'approved', 'Contact', 'Smoke',
    'contact-smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'US', true, 'smoke', :'smoke_admin_user_id'::uuid
  ) returning id
)
insert into dealer_smoke_ctx(fixture, lead_id) select 'approved_contact', id from x;

set local role authenticated;

update dealer_smoke_ctx
set result = public.convert_store_dealer_lead_to_customer(lead_id)
where fixture = 'approved_dealer';

do $$
begin
  if not (
    select result->>'ok' = 'true'
       and result->>'created' = 'true'
       and result->>'reason' = 'converted'
       and coalesce(result->>'customer_id', '') <> ''
    from dealer_smoke_ctx where fixture = 'approved_dealer'
  ) then
    raise exception 'approved dealer conversion failed';
  end if;

  if not exists (
    select 1
    from dealer_smoke_ctx s
    join public.store_leads l on l.id = s.lead_id
    join public.customers c on c.id = l.converted_customer_id
    join public.customer_types ct on ct.id = c.customer_type_id
    where s.fixture = 'approved_dealer'
      and l.status = 'closed'
      and ct.system_key = 'dealer'
      and c.status = 'prospect'
      and c.portal_enabled = false
  ) then
    raise exception 'dealer customer contract failed';
  end if;

  if not exists (
    select 1
    from dealer_smoke_ctx s
    join public.store_leads l on l.id = s.lead_id
    join public.customer_contacts cc on cc.customer_id = l.converted_customer_id
    where s.fixture = 'approved_dealer'
      and cc.is_primary = true
      and cc.is_order_contact = true
  ) then
    raise exception 'primary dealer contact was not created';
  end if;

  if not exists (
    select 1
    from dealer_smoke_ctx s
    join public.store_lead_activity a on a.lead_id = s.lead_id
    where s.fixture = 'approved_dealer'
      and a.action = 'converted_to_customer'
      and a.to_status = 'closed'
  ) then
    raise exception 'lead conversion activity was not logged';
  end if;

  if not exists (
    select 1
    from dealer_smoke_ctx s
    join public.store_leads l on l.id = s.lead_id
    join public.customer_activity a on a.customer_id = l.converted_customer_id
    where s.fixture = 'approved_dealer'
      and a.activity_type = 'created_from_dealer_application'
  ) then
    raise exception 'customer origin activity was not logged';
  end if;
end
$$;

update dealer_smoke_ctx
set result = public.convert_store_dealer_lead_to_customer(lead_id)
where fixture = 'approved_dealer';

do $$
begin
  if not (
    select result->>'ok' = 'true'
       and result->>'created' = 'false'
       and result->>'reason' = 'already_converted'
    from dealer_smoke_ctx where fixture = 'approved_dealer'
  ) then
    raise exception 'dealer conversion is not idempotent';
  end if;
end
$$;

update dealer_smoke_ctx
set result = public.convert_store_dealer_lead_to_customer(lead_id)
where fixture = 'unapproved_dealer';

do $$
begin
  if not (
    select result->>'ok' = 'false'
       and result->>'reason' = 'lead_not_approved'
    from dealer_smoke_ctx where fixture = 'unapproved_dealer'
  ) then
    raise exception 'unapproved dealer guard failed';
  end if;
end
$$;

update dealer_smoke_ctx
set result = public.convert_store_dealer_lead_to_customer(lead_id)
where fixture = 'approved_contact';

do $$
begin
  if not (
    select result->>'ok' = 'false'
       and result->>'reason' = 'not_dealer_application'
    from dealer_smoke_ctx where fixture = 'approved_contact'
  ) then
    raise exception 'lead type guard failed';
  end if;
end
$$;

rollback;
\echo '=== Controlled dealer onboarding DB smoke PASS ==='
