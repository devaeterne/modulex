-- LD-A1..LD-A4 — Leads final workstream.
-- Browser clients no longer receive direct CRUD access to captured lead payloads.
-- Public Store submission and public consultation option reads remain unchanged.

begin;

alter table public.store_leads
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists converted_project_id uuid references public.customer_projects(id) on delete set null;

create index if not exists idx_store_leads_archive_created
  on public.store_leads (archived_at, created_at desc);
create index if not exists idx_store_leads_converted_project
  on public.store_leads (converted_project_id)
  where converted_project_id is not null;

create table if not exists public.store_lead_conversions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.store_leads(id) on delete cascade,
  conversion_target text not null check (conversion_target in ('customer', 'project', 'dealer')),
  idempotency_key uuid not null,
  customer_id uuid references public.customers(id) on delete restrict,
  project_id uuid references public.customer_projects(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint store_lead_conversions_target_shape check (
    (conversion_target in ('customer', 'dealer') and customer_id is not null and project_id is null)
    or (conversion_target = 'project' and customer_id is not null and project_id is not null)
  ),
  constraint store_lead_conversions_lead_target_key unique (lead_id, conversion_target),
  constraint store_lead_conversions_idempotency_key unique (idempotency_key)
);

create index if not exists idx_store_lead_conversions_customer
  on public.store_lead_conversions(customer_id, created_at desc);
create index if not exists idx_store_lead_conversions_project
  on public.store_lead_conversions(project_id, created_at desc)
  where project_id is not null;

alter table public.store_lead_conversions enable row level security;
revoke all on public.store_lead_conversions from public, anon, authenticated;
grant all on public.store_lead_conversions to service_role;

create or replace function private.store_lead_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
    and p.role::text in ('super_admin', 'admin', 'sales')
  limit 1;
$$;

revoke all on function private.store_lead_staff_role() from public, anon, authenticated;
grant execute on function private.store_lead_staff_role() to service_role;

create or replace function public.get_store_leads_page(
  p_search text default null,
  p_lead_type text default null,
  p_status text default null,
  p_assigned_to uuid default null,
  p_unassigned boolean default false,
  p_include_archived boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  id uuid,
  reference_code text,
  lead_type text,
  request_kind text,
  status text,
  first_name text,
  last_name text,
  email text,
  company_name text,
  assigned_to uuid,
  source text,
  utm_source text,
  created_at timestamptz,
  archived_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_search text := nullif(left(btrim(coalesce(p_search, '')), 200), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role is null then
    raise exception 'Not authorized to read Store leads' using errcode = '42501';
  end if;
  if p_lead_type is not null and p_lead_type not in ('contact', 'dealer_application') then
    raise exception 'Invalid lead type' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('new','under_review','contacted','qualified','approved','rejected','closed') then
    raise exception 'Invalid lead status' using errcode = '22023';
  end if;
  if v_role = 'sales' and p_assigned_to is not null and p_assigned_to <> auth.uid() then
    raise exception 'Sales may only filter their own assigned leads' using errcode = '42501';
  end if;

  return query
  select
    l.id, l.reference_code, l.lead_type, l.request_kind, l.status,
    l.first_name, l.last_name, l.email, l.company_name, l.assigned_to,
    l.source, l.utm_source, l.created_at, l.archived_at,
    count(*) over() as total_count
  from public.store_leads l
  where (p_include_archived or l.archived_at is null)
    and (p_lead_type is null or l.lead_type = p_lead_type)
    and (p_status is null or l.status = p_status)
    and (p_assigned_to is null or l.assigned_to = p_assigned_to)
    and (not coalesce(p_unassigned, false) or l.assigned_to is null)
    and (v_role <> 'sales' or l.assigned_to is null or l.assigned_to = auth.uid())
    and (
      v_search is null
      or l.reference_code ilike '%' || v_search || '%'
      or l.email ilike '%' || v_search || '%'
      or coalesce(l.company_name, '') ilike '%' || v_search || '%'
      or (l.first_name || ' ' || l.last_name) ilike '%' || v_search || '%'
    )
  order by l.created_at desc, l.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.get_store_lead_summary(p_include_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_result jsonb;
begin
  if v_role is null then
    raise exception 'Not authorized to read Store leads' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'new', count(*) filter (where l.status = 'new'),
    'dealer_applications', count(*) filter (where l.lead_type = 'dealer_application'),
    'qualified_or_approved', count(*) filter (where l.status in ('qualified','approved')),
    'archived', count(*) filter (where l.archived_at is not null)
  )
  into v_result
  from public.store_leads l
  where (p_include_archived or l.archived_at is null)
    and (v_role <> 'sales' or l.assigned_to is null or l.assigned_to = auth.uid());

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.get_store_lead_detail(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_lead public.store_leads%rowtype;
  v_payload jsonb;
  v_activity jsonb;
  v_assignees jsonb;
  v_conversions jsonb;
begin
  if v_role is null then
    raise exception 'Not authorized to read Store leads' using errcode = '42501';
  end if;

  select * into v_lead
  from public.store_leads l
  where l.id = p_lead_id
    and (v_role <> 'sales' or l.assigned_to is null or l.assigned_to = auth.uid());

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_found');
  end if;

  v_payload := to_jsonb(v_lead);
  if v_role = 'sales' then
    -- Attribution/consent evidence is not required for Sales operations.
    v_payload := v_payload - array['utm_content','utm_term','landing_page','referrer','marketing_consent','privacy_accepted'];
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_activity
  from public.store_lead_activity a
  where a.lead_id = v_lead.id;

  if v_role in ('super_admin','admin') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role
    ) order by p.full_name nulls last, p.email), '[]'::jsonb)
    into v_assignees
    from public.profiles p
    where p.is_active = true and p.role::text in ('super_admin','admin','sales');
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role
    )), '[]'::jsonb)
    into v_assignees
    from public.profiles p
    where p.id = auth.uid() and p.is_active = true;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'conversion_target', c.conversion_target,
    'customer_id', c.customer_id,
    'project_id', c.project_id,
    'created_at', c.created_at
  ) order by c.created_at), '[]'::jsonb)
  into v_conversions
  from public.store_lead_conversions c
  where c.lead_id = v_lead.id;

  return jsonb_build_object(
    'ok', true,
    'role', v_role,
    'can_archive', v_role in ('super_admin','admin'),
    'lead', v_payload,
    'activity', v_activity,
    'assignees', v_assignees,
    'conversions', v_conversions
  );
end;
$$;

create or replace function public.update_store_lead_workflow(
  p_lead_id uuid,
  p_status text,
  p_assigned_to uuid default null,
  p_internal_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_actor uuid := auth.uid();
  v_lead public.store_leads%rowtype;
  v_notes text := nullif(btrim(coalesce(p_internal_notes, '')), '');
begin
  if v_role is null then
    raise exception 'Not authorized to update Store leads' using errcode = '42501';
  end if;
  if p_status not in ('new','under_review','contacted','qualified','approved','rejected','closed') then
    raise exception 'Invalid lead status' using errcode = '22023';
  end if;
  if char_length(coalesce(v_notes, '')) > 5000 then
    raise exception 'Internal notes are too long' using errcode = '22023';
  end if;

  select * into v_lead from public.store_leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_found');
  end if;
  if v_lead.archived_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'lead_archived');
  end if;
  if v_role = 'sales' and v_lead.assigned_to is not null and v_lead.assigned_to <> v_actor then
    raise exception 'Lead is assigned to another operator' using errcode = '42501';
  end if;
  if v_role = 'sales' and p_assigned_to is not null and p_assigned_to <> v_actor then
    raise exception 'Sales may only assign a lead to themselves' using errcode = '42501';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_assigned_to and p.is_active = true and p.role::text in ('super_admin','admin','sales')
  ) then
    raise exception 'Invalid lead assignee' using errcode = '22023';
  end if;

  update public.store_leads
  set status = p_status,
      assigned_to = p_assigned_to,
      internal_notes = v_notes,
      updated_by = v_actor
  where id = v_lead.id;

  if v_lead.assigned_to is distinct from p_assigned_to then
    insert into public.store_lead_activity(lead_id, action, note, actor_user_id)
    values (v_lead.id, 'assignment_changed', coalesce(p_assigned_to::text, 'unassigned'), v_actor);
  end if;
  if v_lead.internal_notes is distinct from v_notes then
    insert into public.store_lead_activity(lead_id, action, note, actor_user_id)
    values (v_lead.id, 'internal_notes_updated', 'Internal note summary updated', v_actor);
  end if;

  return public.get_store_lead_detail(v_lead.id);
end;
$$;

create or replace function public.add_store_lead_note(p_lead_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_lead public.store_leads%rowtype;
begin
  if v_role is null then
    raise exception 'Not authorized to add Store lead notes' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 5000 then
    raise exception 'Lead note must be between 1 and 5000 characters' using errcode = '22023';
  end if;

  select * into v_lead from public.store_leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'lead_not_found'); end if;
  if v_lead.archived_at is not null then return jsonb_build_object('ok', false, 'reason', 'lead_archived'); end if;
  if v_role = 'sales' and v_lead.assigned_to is not null and v_lead.assigned_to <> v_actor then
    raise exception 'Lead is assigned to another operator' using errcode = '42501';
  end if;

  insert into public.store_lead_activity(lead_id, action, note, actor_user_id)
  values (v_lead.id, 'note_added', v_note, v_actor);
  return public.get_store_lead_detail(v_lead.id);
end;
$$;

create or replace function public.set_store_lead_archived(
  p_lead_id uuid,
  p_archived boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_actor uuid := auth.uid();
  v_lead public.store_leads%rowtype;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 5000), '');
begin
  if v_role not in ('super_admin','admin') then
    raise exception 'Only Admin can archive Store leads' using errcode = '42501';
  end if;

  select * into v_lead from public.store_leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'lead_not_found'); end if;

  if p_archived and v_lead.archived_at is null then
    update public.store_leads
    set archived_at = now(), archived_by = v_actor, updated_by = v_actor
    where id = v_lead.id;
    insert into public.store_lead_activity(lead_id, action, note, actor_user_id)
    values (v_lead.id, 'archived', v_note, v_actor);
  elsif not p_archived and v_lead.archived_at is not null then
    update public.store_leads
    set archived_at = null, archived_by = null, updated_by = v_actor
    where id = v_lead.id;
    insert into public.store_lead_activity(lead_id, action, note, actor_user_id)
    values (v_lead.id, 'restored', v_note, v_actor);
  end if;

  return public.get_store_lead_detail(v_lead.id);
end;
$$;

create or replace function public.get_admin_store_lead_form_options()
returns setof public.store_lead_form_options
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.store_lead_staff_role() not in ('super_admin','admin') then
    raise exception 'Not authorized to manage Store lead form options' using errcode = '42501';
  end if;
  return query
  select o.* from public.store_lead_form_options o
  order by o.option_group, o.sort_order, o.label, o.id;
end;
$$;

create or replace function public.upsert_store_lead_form_option(
  p_id uuid,
  p_option_group text,
  p_option_key text,
  p_label text,
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_id uuid;
  v_key text := lower(btrim(coalesce(p_option_key, '')));
  v_label text := btrim(coalesce(p_label, ''));
begin
  if v_role not in ('super_admin','admin') then
    raise exception 'Not authorized to manage Store lead form options' using errcode = '42501';
  end if;
  if p_option_group not in ('project_type','consultation_intent') then
    raise exception 'Invalid option group' using errcode = '22023';
  end if;
  if char_length(v_key) not between 1 and 64 or v_key !~ '^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$' then
    raise exception 'Invalid option key' using errcode = '22023';
  end if;
  if char_length(v_label) not between 1 and 160 then
    raise exception 'Invalid option label' using errcode = '22023';
  end if;
  if coalesce(p_sort_order, 100) not between -10000 and 10000 then
    raise exception 'Invalid option sort order' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.store_lead_form_options(option_group, option_key, label, is_active, sort_order, updated_by)
    values (p_option_group, v_key, v_label, coalesce(p_is_active, true), coalesce(p_sort_order, 100), auth.uid())
    returning id into v_id;
  else
    update public.store_lead_form_options
    set option_group = p_option_group,
        option_key = v_key,
        label = v_label,
        is_active = coalesce(p_is_active, true),
        sort_order = coalesce(p_sort_order, 100),
        updated_by = auth.uid()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'reason', 'option_not_found');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.convert_store_lead(
  p_lead_id uuid,
  p_target text,
  p_idempotency_key uuid,
  p_project_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.store_lead_staff_role();
  v_actor uuid := auth.uid();
  v_target text := lower(btrim(coalesce(p_target, '')));
  v_lead public.store_leads%rowtype;
  v_existing public.store_lead_conversions%rowtype;
  v_email text;
  v_customer_ids uuid[];
  v_customer_id uuid;
  v_customer_result jsonb;
  v_customer_type_key text;
  v_project_id uuid;
  v_project_name text := nullif(btrim(coalesce(p_project_name, '')), '');
  v_dealer_result jsonb;
  v_customer_name text;
begin
  if v_role is null then
    raise exception 'Not authorized to convert Store leads' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;
  if v_target not in ('customer','project','dealer') then
    raise exception 'Invalid conversion target' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('store-lead:' || p_lead_id::text, 0));

  select * into v_existing
  from public.store_lead_conversions c
  where c.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.lead_id <> p_lead_id or v_existing.conversion_target <> v_target then
      raise exception 'Idempotency key already belongs to another conversion' using errcode = '23505';
    end if;
    return jsonb_build_object('ok', true, 'created', false, 'reason', 'idempotent_replay',
      'target', v_target, 'customer_id', v_existing.customer_id, 'project_id', v_existing.project_id);
  end if;

  select * into v_existing
  from public.store_lead_conversions c
  where c.lead_id = p_lead_id and c.conversion_target = v_target;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'reason', 'already_converted',
      'target', v_target, 'customer_id', v_existing.customer_id, 'project_id', v_existing.project_id);
  end if;

  select * into v_lead from public.store_leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'lead_not_found'); end if;
  if v_lead.archived_at is not null then return jsonb_build_object('ok', false, 'reason', 'lead_archived'); end if;
  if v_role = 'sales' and v_lead.assigned_to is not null and v_lead.assigned_to <> v_actor then
    raise exception 'Lead is assigned to another operator' using errcode = '42501';
  end if;

  if v_target = 'dealer' then
    if v_lead.lead_type <> 'dealer_application' then
      return jsonb_build_object('ok', false, 'reason', 'not_dealer_application');
    end if;
    if v_lead.status <> 'approved' and v_lead.converted_customer_id is null then
      return jsonb_build_object('ok', false, 'reason', 'lead_not_approved');
    end if;
  elsif v_lead.status not in ('qualified','approved','closed') then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_ready');
  end if;

  v_email := lower(btrim(v_lead.email));
  if v_email <> '' then
    perform pg_advisory_xact_lock(hashtextextended('store-lead-email:' || v_email, 0));
  end if;

  if v_lead.converted_customer_id is not null then
    v_customer_id := v_lead.converted_customer_id;
  elsif v_email <> '' then
    select array_agg(distinct q.customer_id order by q.customer_id)
    into v_customer_ids
    from (
      select c.id as customer_id
      from public.customers c
      where c.email is not null and lower(btrim(c.email)) = v_email
      union
      select cc.customer_id
      from public.customer_contacts cc
      where cc.email is not null and lower(btrim(cc.email)) = v_email
    ) q;

    if coalesce(array_length(v_customer_ids, 1), 0) > 1 then
      return jsonb_build_object('ok', false, 'reason', 'ambiguous_customer_identity');
    elsif coalesce(array_length(v_customer_ids, 1), 0) = 1 then
      v_customer_id := v_customer_ids[1];
    end if;
  end if;

  if v_target = 'dealer' then
    if v_customer_id is not null then
      select ct.system_key into v_customer_type_key
      from public.customers c
      left join public.customer_types ct on ct.id = c.customer_type_id
      where c.id = v_customer_id;
      if coalesce(v_customer_type_key, '') <> 'dealer' then
        return jsonb_build_object('ok', false, 'reason', 'existing_customer_not_dealer', 'customer_id', v_customer_id);
      end if;
      update public.store_leads
      set converted_customer_id = v_customer_id, status = 'closed', updated_by = v_actor
      where id = v_lead.id;
      insert into public.store_lead_activity(lead_id, action, from_status, to_status, note, actor_user_id)
      values (v_lead.id, 'linked_to_existing_dealer', v_lead.status, 'closed', v_customer_id::text, v_actor);
    else
      select public.convert_store_dealer_lead_to_customer(v_lead.id) into v_dealer_result;
      if not coalesce((v_dealer_result->>'ok')::boolean, false) then
        return v_dealer_result;
      end if;
      v_customer_id := nullif(v_dealer_result->>'customer_id', '')::uuid;
    end if;

    insert into public.store_lead_conversions(lead_id, conversion_target, idempotency_key, customer_id, actor_user_id)
    values (v_lead.id, 'dealer', p_idempotency_key, v_customer_id, v_actor);
    return jsonb_build_object('ok', true, 'created', true, 'reason', 'converted', 'target', 'dealer', 'customer_id', v_customer_id);
  end if;

  if v_customer_id is null then
    v_customer_name := coalesce(nullif(btrim(v_lead.company_name), ''), btrim(v_lead.first_name || ' ' || v_lead.last_name));
    select public.create_customer(
      p_name => v_customer_name,
      p_status => 'prospect',
      p_email => v_email,
      p_phone => nullif(btrim(coalesce(v_lead.phone, '')), ''),
      p_country_code => v_lead.country_code,
      p_sales_rep_id => v_lead.assigned_to
    ) into v_customer_result;
    v_customer_id := nullif(v_customer_result->'customer'->>'id', '')::uuid;
    if v_customer_id is null then
      raise exception 'Customer creation did not return an identity';
    end if;
  end if;

  update public.store_leads
  set converted_customer_id = v_customer_id, updated_by = v_actor
  where id = v_lead.id;

  if v_target = 'customer' then
    update public.store_leads set status = 'closed', updated_by = v_actor where id = v_lead.id;
    insert into public.store_lead_conversions(lead_id, conversion_target, idempotency_key, customer_id, actor_user_id)
    values (v_lead.id, 'customer', p_idempotency_key, v_customer_id, v_actor);
    insert into public.store_lead_activity(lead_id, action, from_status, to_status, note, actor_user_id)
    values (v_lead.id, 'converted_to_customer', v_lead.status, 'closed', v_customer_id::text, v_actor);
    return jsonb_build_object('ok', true, 'created', true, 'reason', 'converted', 'target', 'customer', 'customer_id', v_customer_id);
  end if;

  if v_project_name is null or char_length(v_project_name) > 200 then
    raise exception 'Project name is required and must be 200 characters or fewer' using errcode = '22023';
  end if;

  select public.create_customer_project(
    p_customer_id => v_customer_id,
    p_name => v_project_name,
    p_sales_rep_id => v_lead.assigned_to,
    p_status => 'draft'
  ) into v_project_id;

  update public.store_leads
  set converted_project_id = v_project_id, status = 'closed', updated_by = v_actor
  where id = v_lead.id;

  insert into public.store_lead_conversions(lead_id, conversion_target, idempotency_key, customer_id, project_id, actor_user_id)
  values (v_lead.id, 'project', p_idempotency_key, v_customer_id, v_project_id, v_actor);
  insert into public.store_lead_activity(lead_id, action, from_status, to_status, note, actor_user_id)
  values (v_lead.id, 'converted_to_project', v_lead.status, 'closed', v_project_id::text, v_actor);

  return jsonb_build_object('ok', true, 'created', true, 'reason', 'converted', 'target', 'project',
    'customer_id', v_customer_id, 'project_id', v_project_id);
end;
$$;

-- Force all authenticated Lead workspace reads/writes through the guarded RPC contracts.
revoke select, insert, update, delete on public.store_leads from authenticated;
revoke select on public.store_lead_activity from authenticated;
revoke select, insert, update, delete on public.store_lead_form_options from authenticated;

revoke all on function public.get_store_leads_page(text,text,text,uuid,boolean,boolean,integer,integer) from public, anon;
revoke all on function public.get_store_lead_summary(boolean) from public, anon;
revoke all on function public.get_store_lead_detail(uuid) from public, anon;
revoke all on function public.update_store_lead_workflow(uuid,text,uuid,text) from public, anon;
revoke all on function public.add_store_lead_note(uuid,text) from public, anon;
revoke all on function public.set_store_lead_archived(uuid,boolean,text) from public, anon;
revoke all on function public.get_admin_store_lead_form_options() from public, anon;
revoke all on function public.upsert_store_lead_form_option(uuid,text,text,text,integer,boolean) from public, anon;
revoke all on function public.convert_store_lead(uuid,text,uuid,text) from public, anon;

grant execute on function public.get_store_leads_page(text,text,text,uuid,boolean,boolean,integer,integer) to authenticated;
grant execute on function public.get_store_lead_summary(boolean) to authenticated;
grant execute on function public.get_store_lead_detail(uuid) to authenticated;
grant execute on function public.update_store_lead_workflow(uuid,text,uuid,text) to authenticated;
grant execute on function public.add_store_lead_note(uuid,text) to authenticated;
grant execute on function public.set_store_lead_archived(uuid,boolean,text) to authenticated;
grant execute on function public.get_admin_store_lead_form_options() to authenticated;
grant execute on function public.upsert_store_lead_form_option(uuid,text,text,text,integer,boolean) to authenticated;
grant execute on function public.convert_store_lead(uuid,text,uuid,text) to authenticated;

comment on column public.store_leads.archived_at is
  'Non-destructive retention boundary. Archived leads are excluded from normal workspace reads; no automatic hard-delete policy is implied.';
comment on table public.store_lead_conversions is
  'Idempotent audit/provenance for Lead to Customer, Project, or dealer-customer conversion. Dealer portal onboarding remains separate.';

notify pgrst, 'reload schema';
commit;
