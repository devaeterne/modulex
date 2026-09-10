\set ON_ERROR_STOP on
\pset pager off
\echo '=== DLR dealer lifecycle + document privacy smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

select p.id::text as admin_user_id
from public.profiles p
where p.is_active = true
  and p.role in ('super_admin', 'admin')
  and not exists (
    select 1 from public.customer_portal_users cpu where cpu.auth_user_id = p.id
  )
order by case p.role when 'super_admin' then 0 else 1 end, p.created_at
limit 1
\gset smoke_

\if :{?smoke_admin_user_id}
\else
  \echo 'FAIL: no unused active super_admin/admin auth identity exists.'
  \quit 3
\endif

begin;
set local statement_timeout = '60s';

create temp table dlr_smoke_ctx (
  fixture text primary key,
  lead_id uuid,
  result jsonb,
  customer_id uuid,
  portal_user_id uuid,
  document_id uuid
) on commit drop;
grant select, insert, update, delete on dlr_smoke_ctx to authenticated;

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
    'dealer_application', 'qualified', 'DLR', 'Primary',
    'dlr-primary-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    '+12025550191',
    'DLR Primary ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'https://example.com', 'US', 'New York', true, 'smoke', :'smoke_admin_user_id'::uuid
  ) returning id
)
insert into dlr_smoke_ctx(fixture, lead_id) select 'primary', id from x;

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  ) values (
    'dealer_application', 'under_review', 'DLR', 'Reject',
    'dlr-reject-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'DLR Reject ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'US', true, 'smoke', :'smoke_admin_user_id'::uuid
  ) returning id
)
insert into dlr_smoke_ctx(fixture, lead_id) select 'reject', id from x;

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  ) values (
    'dealer_application', 'qualified', 'DLR', 'Other',
    'dlr-other-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'DLR Other ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'US', true, 'smoke', :'smoke_admin_user_id'::uuid
  ) returning id
)
insert into dlr_smoke_ctx(fixture, lead_id) select 'other', id from x;

set local role authenticated;

update dlr_smoke_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR smoke approval', null)
where fixture = 'primary';

update dlr_smoke_ctx
set customer_id = nullif(result->>'customer_id', '')::uuid,
    portal_user_id = nullif(result->>'portal_user_id', '')::uuid
where fixture = 'primary';

do $$
begin
  if not (
    select result->>'ok' = 'true'
       and result->>'reason' in ('onboarded', 'already_onboarded')
       and customer_id is not null
       and portal_user_id is not null
    from dlr_smoke_ctx where fixture = 'primary'
  ) then
    raise exception 'DLR-A1 approval/onboarding contract failed';
  end if;

  if not exists (
    select 1
    from dlr_smoke_ctx s
    join public.store_leads l on l.id = s.lead_id
    join public.customers c on c.id = s.customer_id
    join public.customer_types ct on ct.id = c.customer_type_id
    join public.customer_portal_users cpu on cpu.id = s.portal_user_id and cpu.customer_id = c.id
    where s.fixture = 'primary'
      and l.status = 'closed'
      and l.converted_customer_id = c.id
      and l.reviewed_by = :'smoke_admin_user_id'::uuid
      and l.reviewed_at is not null
      and ct.system_key = 'dealer'
      and c.status = 'active'
      and c.portal_enabled = true
      and cpu.status = 'never_invited'
      and lower(cpu.login_email) = lower(l.email)
  ) then
    raise exception 'DLR-A1 customer/account/portal preparation failed';
  end if;

  if not exists (
    select 1 from dlr_smoke_ctx s
    join public.store_lead_activity a on a.lead_id = s.lead_id
    where s.fixture = 'primary'
      and a.action = 'dealer_approved'
      and a.note = 'DLR smoke approval'
      and a.actor_user_id = :'smoke_admin_user_id'::uuid
      and a.created_at is not null
  ) then
    raise exception 'DLR-A1 approval audit trail failed';
  end if;
end
$$;

-- Retry must not create a second customer/account.
update dlr_smoke_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR smoke approval retry', null)
where fixture = 'primary';

do $$
begin
  if not (
    select result->>'ok' = 'true' and result->>'reason' = 'already_onboarded'
    from dlr_smoke_ctx where fixture = 'primary'
  ) then raise exception 'DLR-A1 approval retry is not idempotent'; end if;

  if (select count(*) from public.customer_portal_users cpu join dlr_smoke_ctx s on s.customer_id=cpu.customer_id where s.fixture='primary') <> 1 then
    raise exception 'DLR-A1 approval retry duplicated portal account';
  end if;
end
$$;

-- Duplicate lead must fail closed first, then allow an explicit link to the matching Dealer customer.
reset role;
with p as (
  select l.email, l.company_name
  from dlr_smoke_ctx s join public.store_leads l on l.id=s.lead_id
  where s.fixture='primary'
), x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  )
  select 'dealer_application','qualified','DLR','Duplicate',email,company_name,'US',true,'smoke',:'smoke_admin_user_id'::uuid from p
  returning id
)
insert into dlr_smoke_ctx(fixture, lead_id) select 'duplicate', id from x;
set local role authenticated;

update dlr_smoke_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR duplicate review', null)
where fixture='duplicate';

do $$ begin
  if not (select result->>'ok'='false' and result->>'reason'='duplicate_customer' from dlr_smoke_ctx where fixture='duplicate') then
    raise exception 'DLR-A1 duplicate guard failed';
  end if;
end $$;

update dlr_smoke_ctx d
set result = public.review_store_dealer_application(
  d.lead_id,
  'approve',
  'DLR explicit existing-customer link',
  (select customer_id from dlr_smoke_ctx where fixture='primary')
)
where d.fixture='duplicate';

do $$ begin
  if not exists (
    select 1 from dlr_smoke_ctx d, dlr_smoke_ctx p
    join public.store_leads l on l.id=d.lead_id
    where d.fixture='duplicate' and p.fixture='primary'
      and d.result->>'ok'='true'
      and d.result->>'reason'='linked_existing_customer'
      and l.converted_customer_id=p.customer_id
  ) then raise exception 'DLR-A1 explicit duplicate link failed'; end if;
end $$;

-- Reject requires a reason and records actor/timestamp.
update dlr_smoke_ctx
set result = public.review_store_dealer_application(lead_id, 'reject', '   ', null)
where fixture='reject';

do $$ begin
  if not (select result->>'ok'='false' and result->>'reason'='reason_required' from dlr_smoke_ctx where fixture='reject') then
    raise exception 'DLR-A2 reject reason guard failed';
  end if;
end $$;

update dlr_smoke_ctx
set result = public.review_store_dealer_application(lead_id, 'reject', 'DLR smoke rejection', null)
where fixture='reject';

do $$ begin
  if not exists (
    select 1 from dlr_smoke_ctx s join public.store_leads l on l.id=s.lead_id
    join public.store_lead_activity a on a.lead_id=l.id
    where s.fixture='reject' and l.status='rejected'
      and l.reviewed_by=:'smoke_admin_user_id'::uuid and l.reviewed_at is not null
      and a.action='dealer_rejected' and a.note='DLR smoke rejection'
      and a.actor_user_id=:'smoke_admin_user_id'::uuid
  ) then raise exception 'DLR-A2 rejection audit failed'; end if;
end $$;

-- Create a second dealer for cross-customer document authorization checks.
update dlr_smoke_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR other approval', null)
where fixture='other';
update dlr_smoke_ctx
set customer_id = nullif(result->>'customer_id','')::uuid,
    portal_user_id = nullif(result->>'portal_user_id','')::uuid
where fixture='other';

-- Customer Documents are default-private; visibility promotion is explicit.
with d as (
  select public.register_customer_document(
    customer_id,
    'hidden.pdf',
    customer_id::text || '/hidden-' || gen_random_uuid()::text || '.pdf',
    'agreement','application/pdf',123,'DLR hidden smoke'
  ) as doc
  from dlr_smoke_ctx where fixture='primary'
)
insert into dlr_smoke_ctx(fixture, document_id)
select 'hidden_doc', ((doc).id)::uuid from d;

with d as (
  select public.register_customer_document(
    customer_id,
    'visible.pdf',
    customer_id::text || '/visible-' || gen_random_uuid()::text || '.pdf',
    'agreement','application/pdf',123,'DLR visible smoke'
  ) as doc
  from dlr_smoke_ctx where fixture='primary'
)
insert into dlr_smoke_ctx(fixture, document_id)
select 'visible_doc', ((doc).id)::uuid from d;

with d as (
  select public.register_customer_document(
    customer_id,
    'other.pdf',
    customer_id::text || '/other-' || gen_random_uuid()::text || '.pdf',
    'agreement','application/pdf',123,'DLR cross customer smoke'
  ) as doc
  from dlr_smoke_ctx where fixture='other'
)
insert into dlr_smoke_ctx(fixture, document_id)
select 'other_doc', ((doc).id)::uuid from d;

do $$ begin
  if exists (
    select 1 from public.customer_documents d join dlr_smoke_ctx s on s.document_id=d.id
    where s.fixture in ('hidden_doc','visible_doc','other_doc') and d.portal_visible=true
  ) then raise exception 'DLR-A3 customer documents did not default private'; end if;
end $$;

select public.set_customer_document_portal_visibility(
  (select customer_id from dlr_smoke_ctx where fixture='primary'),
  (select document_id from dlr_smoke_ctx where fixture='visible_doc'), true
);
select public.set_customer_document_portal_visibility(
  (select customer_id from dlr_smoke_ctx where fixture='other'),
  (select document_id from dlr_smoke_ctx where fixture='other_doc'), true
);

-- Bind the transaction-only portal identity to the primary dealer and exercise portal RPCs.
reset role;
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"account_type":"dealer_portal"}'::jsonb
where id=:'smoke_admin_user_id'::uuid;
update public.customer_portal_users cpu
set auth_user_id=:'smoke_admin_user_id'::uuid,
    status='active',
    activated_at=now(),
    invited_at=coalesce(invited_at,now()),
    updated_by=:'smoke_admin_user_id'::uuid
where cpu.id=(select portal_user_id from dlr_smoke_ctx where fixture='primary');
set local role authenticated;

do $$
declare v_hidden jsonb; v_visible jsonb; v_cross jsonb; v_list jsonb;
begin
  v_hidden := public.get_store_dealer_document((select document_id from dlr_smoke_ctx where fixture='hidden_doc'));
  v_visible := public.get_store_dealer_document((select document_id from dlr_smoke_ctx where fixture='visible_doc'));
  v_cross := public.get_store_dealer_document((select document_id from dlr_smoke_ctx where fixture='other_doc'));
  v_list := public.get_store_dealer_documents();
  if v_hidden->>'reason' <> 'document_unavailable' then raise exception 'DLR-A3 hidden document leaked'; end if;
  if v_visible->>'ok' <> 'true' then raise exception 'DLR-A3 explicit visible document unavailable'; end if;
  if v_cross->>'reason' <> 'document_unavailable' then raise exception 'DLR-A3 cross-customer document leaked'; end if;
  if jsonb_array_length(coalesce(v_list->'documents','[]'::jsonb)) <> 1 then raise exception 'DLR-A3 dealer document list scope failed'; end if;
end
$$;

-- Account deactivate/reactivate is reasoned, audited, idempotent and controls live portal access.
update dlr_smoke_ctx
set result = public.transition_store_dealer_account(customer_id, 'deactivate', '   ')
where fixture='primary';

do $$ begin
  if not (select result->>'ok'='false' and result->>'reason'='reason_required' from dlr_smoke_ctx where fixture='primary') then
    raise exception 'DLR-A2 deactivate reason guard failed';
  end if;
end $$;

update dlr_smoke_ctx
set result = public.transition_store_dealer_account(customer_id, 'deactivate', 'DLR smoke deactivation')
where fixture='primary';

do $$ declare v_context jsonb;
begin
  if not exists (
    select 1 from dlr_smoke_ctx s join public.customers c on c.id=s.customer_id
    where s.fixture='primary' and c.status='inactive' and c.portal_enabled=false
  ) then raise exception 'DLR-A2 dealer deactivate state failed'; end if;
  if exists (
    select 1 from dlr_smoke_ctx s join public.customer_portal_users cpu on cpu.customer_id=s.customer_id
    where s.fixture='primary' and cpu.status <> 'suspended'
  ) then raise exception 'DLR-A2 dealer deactivate did not suspend portal users'; end if;
  if not exists (
    select 1 from dlr_smoke_ctx s join public.customer_activity a on a.customer_id=s.customer_id
    where s.fixture='primary' and a.activity_type='dealer_deactivated'
      and a.description='DLR smoke deactivation' and a.actor_user_id=:'smoke_admin_user_id'::uuid
  ) then raise exception 'DLR-A2 deactivate audit failed'; end if;
  v_context := public.get_store_dealer_portal_context();
  if v_context->>'ok' <> 'false' then raise exception 'DLR-A2 deactivated dealer retained portal access'; end if;
end $$;

update dlr_smoke_ctx
set result = public.transition_store_dealer_account(customer_id, 'reactivate', 'DLR smoke reactivation')
where fixture='primary';

do $$ declare v_context jsonb;
begin
  if not exists (
    select 1 from dlr_smoke_ctx s join public.customers c on c.id=s.customer_id
    where s.fixture='primary' and c.status='active' and c.portal_enabled=true
  ) then raise exception 'DLR-A2 dealer reactivate state failed'; end if;
  if not exists (
    select 1 from dlr_smoke_ctx s join public.customer_activity a on a.customer_id=s.customer_id
    where s.fixture='primary' and a.activity_type='dealer_reactivated'
      and a.description='DLR smoke reactivation' and a.actor_user_id=:'smoke_admin_user_id'::uuid
  ) then raise exception 'DLR-A2 reactivate audit failed'; end if;
  v_context := public.get_store_dealer_portal_context();
  if v_context->>'ok' <> 'true' then raise exception 'DLR-A2 reactivated dealer portal access not restored'; end if;
end $$;

rollback;
\echo '=== DLR dealer lifecycle + document privacy smoke PASS ==='
