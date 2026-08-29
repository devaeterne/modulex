\set ON_ERROR_STOP on
\pset pager off
\echo '=== Modulex Phase 1 database smoke test ==='
\echo 'All writes run inside one transaction and are rolled back.'

select id::text as admin_user_id
from public.profiles
where is_active = true
  and role in ('super_admin', 'admin')
order by case when role = 'super_admin' then 0 else 1 end, created_at
limit 1
\gset phase1_

\if :{?phase1_admin_user_id}
\else
  \echo 'FAIL: no active super_admin/admin profile exists.'
  \quit 3
\endif

begin;
set local statement_timeout = '90s';

create temp table phase1_ctx (
  department_id uuid,
  position_id uuid,
  employee_id uuid,
  lead_id uuid,
  marketing_consent_banner_before boolean
) on commit drop;
insert into phase1_ctx default values;
grant select, insert, update, delete on phase1_ctx to authenticated, anon;

select set_config('request.jwt.claim.sub', :'phase1_admin_user_id', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'phase1_admin_user_id', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

\echo '[01] Phase 1 RLS coverage'
select 1 / case when not exists (
  select 1
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(array[
      'hr_departments','hr_positions','hr_employees','hr_employee_history',
      'store_product_content','store_product_media','store_color_options',
      'store_leads','store_lead_activity','store_marketing_settings'
    ])
    and c.relrowsecurity = false
) then 1 else 0 end as "PASS RLS enabled on Phase 1 tables";

\echo '[02] Public Store RPC contract'
select 1 / case when (
  select count(*) >= 7
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any(array[
      'get_store_catalog_products',
      'get_store_product_by_slug',
      'get_store_public_profile',
      'get_store_site_settings',
      'get_store_home_features',
      'get_store_marketing_settings',
      'submit_store_lead'
    ])
) then 1 else 0 end as "PASS Store public RPCs exist";

\echo '[03] HR department / position / employee lifecycle'
with inserted as (
  insert into public.hr_departments(code, name, description, is_active, sort_order)
  values (
    'SMK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    'Smoke Department ' || substr(gen_random_uuid()::text, 1, 8),
    'Phase 1 smoke fixture', true, 999
  ) returning id
)
update phase1_ctx set department_id = (select id from inserted);

with inserted as (
  insert into public.hr_positions(code, title, department_id, description, is_active, sort_order)
  values (
    'SMK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    'Smoke Position', (select department_id from phase1_ctx),
    'Phase 1 smoke fixture', true, 999
  ) returning id
)
update phase1_ctx set position_id = (select id from inserted);

with inserted as (
  insert into public.hr_employees(
    first_name, last_name, work_email, department_id, position_id,
    employment_status, employment_type, hire_date
  ) values (
    'Smoke', 'Employee',
    'smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    (select department_id from phase1_ctx),
    (select position_id from phase1_ctx),
    'active', 'full_time', current_date
  ) returning id
)
update phase1_ctx set employee_id = (select id from inserted);

select 1 / case when exists (
  select 1 from public.hr_employee_history
  where employee_id = (select employee_id from phase1_ctx)
    and event_type = 'created'
) then 1 else 0 end as "PASS HR employee create history";

update public.hr_employees
set employment_status = 'on_leave'
where id = (select employee_id from phase1_ctx);

select 1 / case when exists (
  select 1 from public.hr_employee_history
  where employee_id = (select employee_id from phase1_ctx)
    and event_type = 'employment_changed'
) then 1 else 0 end as "PASS HR employment change history";

update public.hr_departments
set description = 'Phase 1 smoke fixture updated'
where id = (select department_id from phase1_ctx);
select 1 / case when exists (
  select 1 from public.hr_departments
  where id = (select department_id from phase1_ctx)
    and description like '%updated'
) then 1 else 0 end as "PASS HR department update";

\echo '[04] Store CMS and marketing settings'
select 1 / case when exists (
  select 1 from public.store_marketing_settings where id = 1
) then 1 else 0 end as "PASS Store marketing settings singleton";

update phase1_ctx
set marketing_consent_banner_before = (
  select consent_banner_enabled from public.store_marketing_settings where id = 1
);

update public.store_marketing_settings
set consent_banner_enabled = not consent_banner_enabled
where id = 1;

select 1 / case when (
  select consent_banner_enabled from public.store_marketing_settings where id = 1
) is distinct from (
  select marketing_consent_banner_before from phase1_ctx
) then 1 else 0 end as "PASS Store marketing settings update";

select 1 / case when exists (
  select 1 from public.notification_delivery_rules
  where event_type = 'new_store_lead'
    and panel_enabled = true
    and internal_email_enabled = true
) then 1 else 0 end as "PASS new_store_lead delivery rule";

\echo '[05] Store lead RPC -> activity -> notification lifecycle'
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
set local role anon;
with submitted as (
  select id
  from public.submit_store_lead(jsonb_build_object(
    'lead_type', 'dealer_application',
    'first_name', 'Smoke',
    'last_name', 'Lead',
    'email', 'smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'company_name', 'Smoke Cabinetry LLC',
    'country_code', 'US',
    'city', 'New York',
    'privacy_accepted', true,
    'source', 'smoke_test',
    'utm_source', 'smoke',
    'utm_campaign', 'phase1'
  ))
)
update phase1_ctx set lead_id = (select id from submitted);

reset role;
select set_config('request.jwt.claim.sub', :'phase1_admin_user_id', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'phase1_admin_user_id', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select 1 / case when exists (
  select 1 from public.store_lead_activity
  where lead_id = (select lead_id from phase1_ctx)
    and action = 'created'
) then 1 else 0 end as "PASS Store lead activity trigger";

select 1 / case when exists (
  select 1 from public.email_notifications
  where event_type = 'new_store_lead'
    and entity_type = 'store_lead'
    and entity_id = (select lead_id from phase1_ctx)
) then 1 else 0 end as "PASS Store lead email notification queued";

update public.store_leads
set status = 'contacted'
where id = (select lead_id from phase1_ctx);

select 1 / case when exists (
  select 1 from public.store_lead_activity
  where lead_id = (select lead_id from phase1_ctx)
    and action = 'status_changed'
    and from_status = 'new'
    and to_status = 'contacted'
) then 1 else 0 end as "PASS Store lead status activity";

select 1 / case when exists (
  select 1
  from public.get_panel_notification_feed(100)
  where entity_type = 'store_lead'
    and entity_id = (select lead_id from phase1_ctx)
    and event_type = 'new_store_lead'
) then 1 else 0 end as "PASS Store lead appears in panel notification feed";

\echo '[06] Store hardening grants'
reset role;
select 1 / case when not has_table_privilege('anon', 'public.store_leads', 'SELECT')
  and not has_table_privilege('anon', 'public.store_leads', 'INSERT')
  and not has_table_privilege('anon', 'public.store_marketing_settings', 'SELECT')
then 1 else 0 end as "PASS anon direct Store table access revoked";

select 1 / case when has_column_privilege('authenticated', 'public.store_leads', 'status', 'UPDATE')
  and has_column_privilege('authenticated', 'public.store_leads', 'assigned_to', 'UPDATE')
  and has_column_privilege('authenticated', 'public.store_leads', 'internal_notes', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.store_leads', 'email', 'UPDATE')
then 1 else 0 end as "PASS Store lead column update hardening";

select 1 / case when has_function_privilege('anon', 'public.submit_store_lead(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_store_lead(jsonb)', 'EXECUTE')
  and has_function_privilege('anon', 'public.get_store_marketing_settings()', 'EXECUTE')
then 1 else 0 end as "PASS Store RPC execute grants";

rollback;
\echo '=== PHASE 1 DATABASE SMOKE PASS ==='
