-- DLR-A1..A4 — Dealer onboarding lifecycle + document privacy closeout.
-- Reuses the canonical Lead, Customer, Portal User and activity domains. No parallel
-- Dealer or document tables are introduced.

begin;

create or replace function private.ensure_store_dealer_portal_user(
  p_customer_id uuid,
  p_lead_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_email text;
  v_full_name text;
  v_portal_user_id uuid;
  v_portal_user_status text;
  v_make_primary boolean;
begin
  select lower(btrim(l.email)), nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), '')
    into v_email, v_full_name
  from public.store_leads l
  where l.id = p_lead_id;

  if v_email is null then
    raise exception 'Dealer application email is required.' using errcode = '22023';
  end if;

  -- One lock per Customer serialises primary-user selection and duplicate checks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dealer-portal:' || p_customer_id::text, 0)
  );

  select cpu.id, cpu.status
    into v_portal_user_id, v_portal_user_status
  from public.customer_portal_users cpu
  where cpu.customer_id = p_customer_id
    and lower(btrim(cpu.login_email)) = v_email
  order by cpu.created_at
  limit 1
  for update;

  if v_portal_user_id is null then
    select not exists (
      select 1
      from public.customer_portal_users cpu
      where cpu.customer_id = p_customer_id and cpu.is_primary = true
    ) into v_make_primary;

    insert into public.customer_portal_users (
      customer_id, full_name, login_email, portal_role, status, is_primary,
      created_by, updated_by
    ) values (
      p_customer_id, v_full_name, v_email, 'admin', 'never_invited', v_make_primary,
      p_actor, p_actor
    )
    returning id, status into v_portal_user_id, v_portal_user_status;

    insert into public.customer_activity (
      customer_id, activity_type, title, description, metadata, actor_user_id
    ) values (
      p_customer_id,
      'portal_user_prepared',
      'Dealer Portal user prepared',
      v_email,
      jsonb_build_object('portal_user_id', v_portal_user_id, 'source_lead_id', p_lead_id),
      p_actor
    );
  end if;

  return jsonb_build_object(
    'portal_user_id', v_portal_user_id,
    'portal_user_status', v_portal_user_status
  );
end;
$$;

revoke all on function private.ensure_store_dealer_portal_user(uuid,uuid,uuid)
from public, anon, authenticated;

create or replace function public.review_store_dealer_application(
  p_lead_id uuid,
  p_decision text,
  p_reason text,
  p_existing_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_lead public.store_leads%rowtype;
  v_original_status text;
  v_conversion jsonb;
  v_portal jsonb;
  v_customer_id uuid;
  v_customer_code text;
  v_customer_name text;
  v_customer_email text;
  v_customer_status text;
  v_customer_type text;
  v_email text;
  v_company text;
  v_result_reason text := 'onboarded';
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor and p.is_active = true;

  if coalesce(v_actor_role, '') not in ('super_admin', 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_decision not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_decision');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select * into v_lead
  from public.store_leads l
  where l.id = p_lead_id
  for update;

  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_found');
  end if;
  if v_lead.lead_type <> 'dealer_application' then
    return jsonb_build_object('ok', false, 'reason', 'not_dealer_application');
  end if;

  v_original_status := v_lead.status;
  v_email := lower(btrim(v_lead.email));
  v_company := lower(btrim(coalesce(v_lead.company_name, '')));

  if v_decision = 'reject' then
    if v_lead.converted_customer_id is not null or v_lead.status = 'closed' then
      return jsonb_build_object('ok', false, 'reason', 'dealer_already_converted');
    end if;
    if v_lead.status = 'rejected' then
      return jsonb_build_object('ok', true, 'reason', 'already_rejected', 'lead_id', v_lead.id);
    end if;

    update public.store_leads
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = now(),
        updated_by = v_actor, updated_at = now()
    where id = v_lead.id;

    insert into public.store_lead_activity (
      lead_id, action, from_status, to_status, note, actor_user_id
    ) values (
      v_lead.id, 'dealer_rejected', v_original_status, 'rejected', v_reason, v_actor
    );

    return jsonb_build_object('ok', true, 'reason', 'rejected', 'lead_id', v_lead.id);
  end if;

  if v_lead.converted_customer_id is not null then
    v_customer_id := v_lead.converted_customer_id;
    v_result_reason := 'already_onboarded';
  elsif p_existing_customer_id is not null then
    select c.customer_code, c.name, lower(btrim(coalesce(c.email, ''))), c.status, ct.system_key
      into v_customer_code, v_customer_name, v_customer_email, v_customer_status, v_customer_type
    from public.customers c
    join public.customer_types ct on ct.id = c.customer_type_id and ct.is_active = true
    where c.id = p_existing_customer_id
    for update of c;

    if v_customer_code is null then
      return jsonb_build_object('ok', false, 'reason', 'existing_customer_not_found');
    end if;
    if v_customer_type <> 'dealer' then
      return jsonb_build_object('ok', false, 'reason', 'existing_customer_not_dealer');
    end if;
    if not (
      (v_email <> '' and v_customer_email = v_email)
      or (v_company <> '' and lower(btrim(coalesce(v_customer_name, ''))) = v_company)
    ) then
      return jsonb_build_object('ok', false, 'reason', 'existing_customer_mismatch');
    end if;
    if v_customer_status in ('inactive', 'blocked') then
      return jsonb_build_object('ok', false, 'reason', 'existing_customer_inactive', 'customer_id', p_existing_customer_id);
    end if;

    v_customer_id := p_existing_customer_id;
    v_result_reason := 'linked_existing_customer';

    update public.store_leads
    set status = 'closed', converted_customer_id = v_customer_id,
        reviewed_by = v_actor, reviewed_at = now(), updated_by = v_actor, updated_at = now()
    where id = v_lead.id;

    insert into public.store_lead_activity (
      lead_id, action, from_status, to_status, note, actor_user_id
    ) values (
      v_lead.id, 'linked_to_existing_customer', v_original_status, 'closed', v_reason, v_actor
    );
  else
    update public.store_leads
    set status = 'approved', reviewed_by = v_actor, reviewed_at = now(),
        updated_by = v_actor, updated_at = now()
    where id = v_lead.id;

    v_conversion := private.convert_store_dealer_lead_to_customer(v_lead.id);
    if coalesce((v_conversion->>'ok')::boolean, false) is not true then
      return v_conversion;
    end if;

    v_customer_id := nullif(v_conversion->>'customer_id', '')::uuid;
    if v_customer_id is null then
      return jsonb_build_object('ok', false, 'reason', 'conversion_missing_customer');
    end if;
  end if;

  select c.customer_code, c.name, c.status, ct.system_key
    into v_customer_code, v_customer_name, v_customer_status, v_customer_type
  from public.customers c
  join public.customer_types ct on ct.id = c.customer_type_id and ct.is_active = true
  where c.id = v_customer_id
  for update of c;

  if v_customer_code is null or v_customer_type <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_customer_invalid');
  end if;
  if v_customer_status = 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_account_blocked', 'customer_id', v_customer_id);
  end if;
  if v_customer_status = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_account_inactive', 'customer_id', v_customer_id);
  end if;

  update public.customers
  set status = 'active', portal_enabled = true, updated_by = v_actor, updated_at = now()
  where id = v_customer_id
    and (status <> 'active' or portal_enabled is not true);

  v_portal := private.ensure_store_dealer_portal_user(v_customer_id, v_lead.id, v_actor);

  if not exists (
    select 1 from public.store_lead_activity a
    where a.lead_id = v_lead.id and a.action = 'dealer_approved'
  ) then
    insert into public.store_lead_activity (
      lead_id, action, from_status, to_status, note, actor_user_id
    ) values (
      v_lead.id, 'dealer_approved', v_original_status, 'closed', v_reason, v_actor
    );
  end if;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  )
  select
    v_customer_id,
    'dealer_onboarding_ready',
    'Dealer account ready for Portal activation',
    v_reason,
    jsonb_build_object(
      'source_lead_id', v_lead.id,
      'portal_user_id', nullif(v_portal->>'portal_user_id', '')::uuid
    ),
    v_actor
  where not exists (
    select 1 from public.customer_activity a
    where a.customer_id = v_customer_id
      and a.activity_type = 'dealer_onboarding_ready'
      and a.metadata->>'source_lead_id' = v_lead.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'reason', v_result_reason,
    'lead_id', v_lead.id,
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'customer_name', v_customer_name,
    'portal_user_id', v_portal->>'portal_user_id',
    'portal_user_status', v_portal->>'portal_user_status'
  );
end;
$$;

revoke all on function public.review_store_dealer_application(uuid,text,text,uuid)
from public, anon, authenticated;
grant execute on function public.review_store_dealer_application(uuid,text,text,uuid)
to authenticated;

create or replace function public.transition_store_dealer_account(
  p_customer_id uuid,
  p_transition text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_transition text := lower(btrim(coalesce(p_transition, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status text;
  v_portal_enabled boolean;
  v_customer_code text;
  v_customer_name text;
  v_changed integer := 0;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor and p.is_active = true;

  if coalesce(v_actor_role, '') not in ('super_admin', 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_transition not in ('deactivate', 'reactivate') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select c.status, c.portal_enabled, c.customer_code, c.name
    into v_status, v_portal_enabled, v_customer_code, v_customer_name
  from public.customers c
  join public.customer_types ct on ct.id = c.customer_type_id and ct.is_active = true
  where c.id = p_customer_id and ct.system_key = 'dealer'
  for update of c;

  if v_customer_code is null then
    return jsonb_build_object('ok', false, 'reason', 'dealer_customer_not_found');
  end if;

  if v_transition = 'deactivate' then
    if v_status = 'blocked' then
      return jsonb_build_object('ok', false, 'reason', 'dealer_account_blocked', 'customer_id', p_customer_id);
    end if;
    if v_status = 'inactive' and v_portal_enabled is false and not exists (
      select 1 from public.customer_portal_users cpu
      where cpu.customer_id = p_customer_id and cpu.status <> 'suspended'
    ) then
      return jsonb_build_object('ok', true, 'reason', 'already_deactivated', 'customer_id', p_customer_id);
    end if;

    update public.customers
    set status = 'inactive', portal_enabled = false, updated_by = v_actor, updated_at = now()
    where id = p_customer_id;

    update public.customer_portal_users
    set status = 'suspended', updated_by = v_actor, updated_at = now()
    where customer_id = p_customer_id and status <> 'suspended';
    get diagnostics v_changed = row_count;

    insert into public.customer_activity (
      customer_id, activity_type, title, description, metadata, actor_user_id
    ) values (
      p_customer_id, 'dealer_deactivated', 'Dealer account deactivated', v_reason,
      jsonb_build_object(
        'transition', 'deactivate', 'from_status', v_status, 'to_status', 'inactive',
        'previous_portal_enabled', v_portal_enabled, 'portal_users_suspended', v_changed
      ),
      v_actor
    );

    insert into public.store_lead_activity (lead_id, action, note, actor_user_id)
    select l.id, 'dealer_deactivated', v_reason, v_actor
    from public.store_leads l
    where l.converted_customer_id = p_customer_id;

    return jsonb_build_object(
      'ok', true, 'reason', 'deactivated', 'customer_id', p_customer_id,
      'customer_code', v_customer_code, 'customer_name', v_customer_name,
      'portal_users_changed', v_changed
    );
  end if;

  if v_status = 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_account_blocked', 'customer_id', p_customer_id);
  end if;
  if v_status = 'active' and v_portal_enabled is true and not exists (
    select 1 from public.customer_portal_users cpu
    where cpu.customer_id = p_customer_id and cpu.status = 'suspended'
  ) then
    return jsonb_build_object('ok', true, 'reason', 'already_reactivated', 'customer_id', p_customer_id);
  end if;
  if v_status not in ('inactive', 'active') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_account_state', 'customer_status', v_status);
  end if;

  update public.customers
  set status = 'active', portal_enabled = true, updated_by = v_actor, updated_at = now()
  where id = p_customer_id;

  update public.customer_portal_users
  set status = case
        when auth_user_id is not null and activated_at is not null then 'active'
        when auth_user_id is not null and invited_at is not null then 'invited'
        else 'never_invited'
      end,
      updated_by = v_actor,
      updated_at = now()
  where customer_id = p_customer_id and status = 'suspended';
  get diagnostics v_changed = row_count;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id, 'dealer_reactivated', 'Dealer account reactivated', v_reason,
    jsonb_build_object(
      'transition', 'reactivate', 'from_status', v_status, 'to_status', 'active',
      'previous_portal_enabled', v_portal_enabled, 'portal_users_restored', v_changed
    ),
    v_actor
  );

  insert into public.store_lead_activity (lead_id, action, note, actor_user_id)
  select l.id, 'dealer_reactivated', v_reason, v_actor
  from public.store_leads l
  where l.converted_customer_id = p_customer_id;

  return jsonb_build_object(
    'ok', true, 'reason', 'reactivated', 'customer_id', p_customer_id,
    'customer_code', v_customer_code, 'customer_name', v_customer_name,
    'portal_users_changed', v_changed
  );
end;
$$;

revoke all on function public.transition_store_dealer_account(uuid,text,text)
from public, anon, authenticated;
grant execute on function public.transition_store_dealer_account(uuid,text,text)
to authenticated;

-- Dealer-specific context must inherit the canonical active Customer + account-type
-- boundary used by every Portal data RPC.
create or replace function private.get_store_dealer_portal_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
begin
  if coalesce((v_context->>'ok')::boolean, false) is not true
     or v_context->>'portal_kind' <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'portal_access_denied');
  end if;
  return v_context;
end;
$$;

-- Activation cannot promote an invited user while the Dealer account is inactive,
-- disabled, the wrong customer type, or the wrong Auth account boundary.
create or replace function private.activate_store_dealer_portal_user()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id
      and coalesce(u.raw_app_meta_data ->> 'account_type', '') = 'dealer_portal'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  update public.customer_portal_users cpu
  set status = 'active',
      activated_at = coalesce(cpu.activated_at, now()),
      updated_by = null,
      updated_at = now()
  from public.customers c
  join public.customer_types ct on ct.id = c.customer_type_id and ct.is_active = true
  where cpu.auth_user_id = v_user_id
    and cpu.customer_id = c.id
    and cpu.status = 'invited'
    and c.portal_enabled = true
    and c.status = 'active'
    and ct.system_key = 'dealer'
  returning cpu.customer_id into v_customer_id;

  if v_customer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'portal_activation_denied');
  end if;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    v_customer_id,
    'portal_user_activated',
    'Dealer portal account activated',
    'Dealer completed the invitation password setup flow.',
    jsonb_build_object('auth_user_id', v_user_id),
    null
  );

  return jsonb_build_object('ok', true, 'reason', 'activated');
end;
$$;

comment on function public.review_store_dealer_application(uuid,text,text,uuid) is
  'DLR canonical Dealer Application review/onboarding. Admin-only, reasoned, duplicate-safe and retry-safe.';
comment on function public.transition_store_dealer_account(uuid,text,text) is
  'DLR canonical Dealer deactivate/reactivate transition with mandatory reason and audit trail.';
comment on column public.customer_documents.portal_visible is
  'Private by default. Portal visibility changes only through the canonical Admin lifecycle RPC.';
comment on table public.store_lead_documents is
  'Dealer application supporting documents; private staff-review material and never a Dealer Portal projection.';

notify pgrst, 'reload schema';
commit;
