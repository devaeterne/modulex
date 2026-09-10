\set ON_ERROR_STOP on
\pset pager off
\echo '=== DLR lifecycle + document privacy smoke ==='
\echo 'All fixture writes are rolled back.'

begin;
set local statement_timeout = '60s';

create temp table dlr_actor (
  actor_id uuid not null,
  outsider_id uuid not null
) on commit drop;

insert into dlr_actor(actor_id, outsider_id)
select p.id, gen_random_uuid()
from public.profiles p
where p.is_active = true
  and p.role in ('super_admin', 'admin')
  and exists (select 1 from auth.users u where u.id = p.id)
  and not exists (
    select 1 from public.customer_portal_users cpu where cpu.auth_user_id = p.id
  )
order by case p.role when 'super_admin' then 0 else 1 end, p.created_at
limit 1;

do $$
begin
  if not exists (select 1 from dlr_actor) then
    raise exception 'DLR smoke requires an unused active Admin Auth identity';
  end if;
end
$$;

create temp table dlr_ctx (
  fixture text primary key,
  lead_id uuid,
  result jsonb,
  customer_id uuid,
  portal_user_id uuid,
  document_id uuid
) on commit drop;

grant select on dlr_actor to authenticated;
grant select, insert, update, delete on dlr_ctx to authenticated;

select set_config('request.jwt.claim.sub', (select actor_id::text from dlr_actor), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select actor_id::text from dlr_actor), 'role', 'authenticated')::text,
  true
);

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  )
  select
    'dealer_application', 'qualified', 'DLR', 'Primary',
    'dlr-primary-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'DLR Primary ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'US', true, 'smoke', actor_id
  from dlr_actor
  returning id
)
insert into dlr_ctx(fixture, lead_id) select 'primary', id from x;

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  )
  select
    'dealer_application', 'under_review', 'DLR', 'Reject',
    'dlr-reject-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'DLR Reject ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'US', true, 'smoke', actor_id
  from dlr_actor
  returning id
)
insert into dlr_ctx(fixture, lead_id) select 'reject', id from x;

with x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  )
  select
    'dealer_application', 'qualified', 'DLR', 'Other',
    'dlr-other-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || '@example.com',
    'DLR Other ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    'US', true, 'smoke', actor_id
  from dlr_actor
  returning id
)
insert into dlr_ctx(fixture, lead_id) select 'other', id from x;

-- Negative RBAC: SECURITY DEFINER remains internally role-guarded.
select set_config('request.jwt.claim.sub', (select outsider_id::text from dlr_actor), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select outsider_id::text from dlr_actor), 'role', 'authenticated')::text,
  true
);
set local role authenticated;
update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'reject', 'unauthorized', null)
where fixture = 'reject';

do $$
begin
  if not (
    select result->>'ok' = 'false' and result->>'reason' = 'not_authorized'
    from dlr_ctx where fixture = 'reject'
  ) then
    raise exception 'DLR review SECURITY DEFINER authorization guard failed';
  end if;
end
$$;

-- Restore Admin identity.
reset role;
select set_config('request.jwt.claim.sub', (select actor_id::text from dlr_actor), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select actor_id::text from dlr_actor), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- A1: approve -> Customer -> Dealer account -> Portal identity preparation.
update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR approval', null)
where fixture = 'primary';
update dlr_ctx
set customer_id = nullif(result->>'customer_id', '')::uuid,
    portal_user_id = nullif(result->>'portal_user_id', '')::uuid
where fixture = 'primary';

do $$
begin
  if not exists (
    select 1
    from dlr_ctx s
    join public.store_leads l on l.id = s.lead_id
    join public.customers c on c.id = s.customer_id
    join public.customer_types ct on ct.id = c.customer_type_id
    join public.customer_portal_users cpu on cpu.id = s.portal_user_id
    where s.fixture = 'primary'
      and s.result->>'ok' = 'true'
      and l.status = 'closed'
      and l.converted_customer_id = c.id
      and l.reviewed_by = (select actor_id from dlr_actor)
      and l.reviewed_at is not null
      and ct.system_key = 'dealer'
      and c.status = 'active'
      and c.portal_enabled = true
      and cpu.customer_id = c.id
      and cpu.status = 'never_invited'
  ) then
    raise exception 'DLR-A1 approval/account preparation failed';
  end if;
end
$$;

-- Approval retry is idempotent.
update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR retry', null)
where fixture = 'primary';

do $$
begin
  if not (
    select result->>'ok' = 'true' and result->>'reason' = 'already_onboarded'
    from dlr_ctx where fixture = 'primary'
  ) then
    raise exception 'DLR-A1 approval retry failed';
  end if;
  if (
    select count(*)
    from public.customer_portal_users cpu
    join dlr_ctx s on s.customer_id = cpu.customer_id
    where s.fixture = 'primary'
  ) <> 1 then
    raise exception 'DLR-A1 approval retry duplicated Portal identity';
  end if;
end
$$;

-- Duplicate match must fail atomically; explicit existing Dealer linking then succeeds.
reset role;
with src as (
  select l.email, l.company_name
  from dlr_ctx s
  join public.store_leads l on l.id = s.lead_id
  where s.fixture = 'primary'
), x as (
  insert into public.store_leads (
    lead_type, status, first_name, last_name, email, company_name,
    country_code, privacy_accepted, source, updated_by
  )
  select
    'dealer_application', 'qualified', 'DLR', 'Duplicate',
    src.email, src.company_name, 'US', true, 'smoke', a.actor_id
  from src cross join dlr_actor a
  returning id
)
insert into dlr_ctx(fixture, lead_id) select 'duplicate', id from x;
set local role authenticated;

update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR duplicate', null)
where fixture = 'duplicate';

do $$
begin
  if not exists (
    select 1
    from dlr_ctx s
    join public.store_leads l on l.id = s.lead_id
    where s.fixture = 'duplicate'
      and s.result->>'reason' = 'duplicate_customer'
      and l.status = 'qualified'
      and l.converted_customer_id is null
  ) then
    raise exception 'DLR-A1 duplicate failure was not atomic';
  end if;
end
$$;

update dlr_ctx d
set result = public.review_store_dealer_application(
  d.lead_id,
  'approve',
  'DLR explicit existing-customer link',
  (select customer_id from dlr_ctx where fixture = 'primary')
)
where d.fixture = 'duplicate';

do $$
begin
  if not exists (
    select 1
    from dlr_ctx d
    join public.store_leads l on l.id = d.lead_id
    cross join dlr_ctx p
    where d.fixture = 'duplicate'
      and p.fixture = 'primary'
      and d.result->>'reason' = 'linked_existing_customer'
      and l.status = 'closed'
      and l.converted_customer_id = p.customer_id
  ) then
    raise exception 'DLR-A1 explicit existing Dealer link failed';
  end if;
end
$$;

-- A2: rejection requires reason and records actor/timestamp/activity.
update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'reject', '   ', null)
where fixture = 'reject';

do $$
begin
  if not (
    select result->>'reason' = 'reason_required'
    from dlr_ctx where fixture = 'reject'
  ) then
    raise exception 'DLR-A2 rejection reason guard failed';
  end if;
end
$$;

update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'reject', 'DLR rejection', null)
where fixture = 'reject';

do $$
begin
  if not exists (
    select 1
    from dlr_ctx s
    join public.store_leads l on l.id = s.lead_id
    join public.store_lead_activity a on a.lead_id = l.id
    where s.fixture = 'reject'
      and l.status = 'rejected'
      and l.reviewed_by = (select actor_id from dlr_actor)
      and l.reviewed_at is not null
      and a.action = 'dealer_rejected'
      and a.note = 'DLR rejection'
      and a.actor_user_id = (select actor_id from dlr_actor)
  ) then
    raise exception 'DLR-A2 rejection audit failed';
  end if;
end
$$;

-- Second Dealer tenant for document isolation.
update dlr_ctx
set result = public.review_store_dealer_application(lead_id, 'approve', 'DLR other approval', null)
where fixture = 'other';
update dlr_ctx
set customer_id = nullif(result->>'customer_id', '')::uuid,
    portal_user_id = nullif(result->>'portal_user_id', '')::uuid
where fixture = 'other';

-- A3: Customer Documents default private; visibility is explicit Admin opt-in.
with d as (
  select public.register_customer_document(
    customer_id,
    'hidden.pdf',
    customer_id::text || '/hidden-' || gen_random_uuid()::text || '.pdf',
    'agreement', 'application/pdf', 123, 'hidden'
  ) doc
  from dlr_ctx where fixture = 'primary'
)
insert into dlr_ctx(fixture, document_id) select 'hidden_doc', (doc).id from d;

with d as (
  select public.register_customer_document(
    customer_id,
    'visible.pdf',
    customer_id::text || '/visible-' || gen_random_uuid()::text || '.pdf',
    'agreement', 'application/pdf', 123, 'visible'
  ) doc
  from dlr_ctx where fixture = 'primary'
)
insert into dlr_ctx(fixture, document_id) select 'visible_doc', (doc).id from d;

with d as (
  select public.register_customer_document(
    customer_id,
    'other.pdf',
    customer_id::text || '/other-' || gen_random_uuid()::text || '.pdf',
    'agreement', 'application/pdf', 123, 'other tenant'
  ) doc
  from dlr_ctx where fixture = 'other'
)
insert into dlr_ctx(fixture, document_id) select 'other_doc', (doc).id from d;

do $$
begin
  if exists (
    select 1
    from public.customer_documents d
    join dlr_ctx s on s.document_id = d.id
    where s.fixture in ('hidden_doc', 'visible_doc', 'other_doc')
      and d.portal_visible = true
  ) then
    raise exception 'DLR-A3 Customer Documents did not default private';
  end if;
end
$$;

select public.set_customer_document_portal_visibility(
  (select customer_id from dlr_ctx where fixture = 'primary'),
  (select document_id from dlr_ctx where fixture = 'visible_doc'),
  true
);
select public.set_customer_document_portal_visibility(
  (select customer_id from dlr_ctx where fixture = 'other'),
  (select document_id from dlr_ctx where fixture = 'other_doc'),
  true
);

-- Dealer application supporting documents remain private staff-review material.
reset role;
insert into public.store_lead_documents(
  lead_id, document_type, storage_path, original_filename, mime_type, size_bytes
)
select
  lead_id,
  'business_license',
  lead_id::text || '/support-' || gen_random_uuid()::text || '.pdf',
  'support.pdf',
  'application/pdf',
  123
from dlr_ctx where fixture = 'primary';

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'dealer-supporting-documents' and public = false
  ) then
    raise exception 'DLR-A3 supporting-document bucket is not private';
  end if;
  if has_table_privilege('anon', 'public.store_lead_documents', 'SELECT') then
    raise exception 'DLR-A3 anon has supporting-document metadata SELECT';
  end if;
end
$$;

-- Non-staff authenticated identity gets no direct document reads. Visibility mutation may
-- fail as 42501 or 22023 because RLS intentionally hides the target before the RPC guard.
select set_config('request.jwt.claim.sub', (select outsider_id::text from dlr_actor), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select outsider_id::text from dlr_actor), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.store_lead_documents) then
    raise exception 'DLR-A3 non-staff authenticated identity can read supporting documents';
  end if;
  if exists (
    select 1
    from public.customer_documents d
    join dlr_ctx s on s.document_id = d.id
    where s.fixture in ('hidden_doc', 'visible_doc', 'other_doc')
  ) then
    raise exception 'DLR-A3 non-staff authenticated identity can directly read Customer Documents';
  end if;

  begin
    perform public.set_customer_document_portal_visibility(
      (select customer_id from dlr_ctx where fixture = 'primary'),
      (select document_id from dlr_ctx where fixture = 'hidden_doc'),
      true
    );
    raise exception 'DLR-A3 non-Admin visibility promotion unexpectedly succeeded';
  exception
    when insufficient_privilege or invalid_parameter_value then null;
  end;
end
$$;

-- Bind transaction-only Dealer Portal identity and prove hidden/cross-customer access fails closed.
reset role;
select set_config('request.jwt.claim.sub', (select actor_id::text from dlr_actor), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', (select actor_id::text from dlr_actor), 'role', 'authenticated')::text,
  true
);
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"account_type":"dealer_portal"}'::jsonb
where id = (select actor_id from dlr_actor);
update public.customer_portal_users
set auth_user_id = (select actor_id from dlr_actor),
    status = 'active',
    invited_at = now(),
    activated_at = now(),
    updated_by = (select actor_id from dlr_actor)
where id = (select portal_user_id from dlr_ctx where fixture = 'primary');
set local role authenticated;

do $$
declare
  v_hidden jsonb;
  v_visible jsonb;
  v_cross jsonb;
  v_list jsonb;
begin
  v_hidden := public.get_store_dealer_document(
    (select document_id from dlr_ctx where fixture = 'hidden_doc')
  );
  v_visible := public.get_store_dealer_document(
    (select document_id from dlr_ctx where fixture = 'visible_doc')
  );
  v_cross := public.get_store_dealer_document(
    (select document_id from dlr_ctx where fixture = 'other_doc')
  );
  v_list := public.get_store_dealer_documents();

  if v_hidden->>'reason' <> 'document_unavailable' then
    raise exception 'DLR-A3 hidden document leaked';
  end if;
  if v_visible->>'ok' <> 'true' then
    raise exception 'DLR-A3 explicit visible document unavailable';
  end if;
  if v_cross->>'reason' <> 'document_unavailable' then
    raise exception 'DLR-A3 cross-customer document leaked';
  end if;
  if jsonb_array_length(coalesce(v_list->'documents', '[]'::jsonb)) <> 1 then
    raise exception 'DLR-A3 document list tenant scope failed';
  end if;
end
$$;

-- A2: deactivation blocks live Portal context; reactivation restores eligible state.
update dlr_ctx
set result = public.transition_store_dealer_account(customer_id, 'deactivate', 'DLR deactivate')
where fixture = 'primary';

do $$
declare v_context jsonb;
begin
  if not exists (
    select 1
    from dlr_ctx s
    join public.customers c on c.id = s.customer_id
    where s.fixture = 'primary' and c.status = 'inactive' and c.portal_enabled = false
  ) then
    raise exception 'DLR-A2 deactivation state failed';
  end if;
  if not exists (
    select 1
    from dlr_ctx s
    join public.customer_activity a on a.customer_id = s.customer_id
    where s.fixture = 'primary'
      and a.activity_type = 'dealer_deactivated'
      and a.description = 'DLR deactivate'
      and a.actor_user_id = (select actor_id from dlr_actor)
  ) then
    raise exception 'DLR-A2 deactivation audit failed';
  end if;
  v_context := public.get_store_dealer_portal_context();
  if v_context->>'ok' <> 'false' then
    raise exception 'DLR-A2 deactivated Dealer retained Portal session access';
  end if;
end
$$;

update dlr_ctx
set result = public.transition_store_dealer_account(customer_id, 'deactivate', 'DLR deactivate retry')
where fixture = 'primary';

do $$
begin
  if not (
    select result->>'reason' = 'already_deactivated'
    from dlr_ctx where fixture = 'primary'
  ) then
    raise exception 'DLR-A2 deactivate retry failed';
  end if;
end
$$;

update dlr_ctx
set result = public.transition_store_dealer_account(customer_id, 'reactivate', 'DLR reactivate')
where fixture = 'primary';

do $$
declare v_context jsonb;
begin
  if not exists (
    select 1
    from dlr_ctx s
    join public.customers c on c.id = s.customer_id
    where s.fixture = 'primary' and c.status = 'active' and c.portal_enabled = true
  ) then
    raise exception 'DLR-A2 reactivation state failed';
  end if;
  if not exists (
    select 1
    from dlr_ctx s
    join public.customer_activity a on a.customer_id = s.customer_id
    where s.fixture = 'primary'
      and a.activity_type = 'dealer_reactivated'
      and a.description = 'DLR reactivate'
      and a.actor_user_id = (select actor_id from dlr_actor)
  ) then
    raise exception 'DLR-A2 reactivation audit failed';
  end if;
  v_context := public.get_store_dealer_portal_context();
  if v_context->>'ok' <> 'true' then
    raise exception 'DLR-A2 reactivated Dealer Portal access failed';
  end if;
end
$$;

update dlr_ctx
set result = public.transition_store_dealer_account(customer_id, 'reactivate', 'DLR reactivate retry')
where fixture = 'primary';

do $$
begin
  if not (
    select result->>'reason' = 'already_reactivated'
    from dlr_ctx where fixture = 'primary'
  ) then
    raise exception 'DLR-A2 reactivate retry failed';
  end if;
end
$$;

rollback;
\echo '=== DLR lifecycle + document privacy smoke PASS ==='
