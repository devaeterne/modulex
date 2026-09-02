-- Modulex Admin notification routing v2
-- Permission-aware recipient routing for panel events plus Request Center manager resolution.
-- Apply through the normal Supabase migration flow after PR review/merge.
--
-- Routing principles:
--   * generic low-stock visibility is inventory.manage in the Admin client policy;
--   * stock_review_required is inventory.manage;
--   * approval_requested is approvals.review;
--   * approval_approved / approval_rejected return only to the approval originator;
--   * request_created -> requests.manage recipients;
--   * request_updated / request_completed remain direct notifications to the requester.

create schema if not exists private;

create or replace function private.user_has_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with effective_roles as (
    select p.role::text as role
    from public.profiles p
    where p.id = p_user_id
      and p.is_active = true

    union

    select ur.role::text as role
    from public.user_roles ur
    join public.profiles p
      on p.id = ur.user_id
     and p.is_active = true
    where ur.user_id = p_user_id
  )
  select coalesce(bool_or(
    role in ('super_admin', 'admin')
    or case p_permission
      when 'requests.view' then role in ('sales', 'finance', 'hr', 'warehouse', 'shipping')
      when 'requests.manage' then false
      when 'orders.view' then role in ('sales', 'finance')
      when 'leads.view' then role = 'sales'
      when 'shipments.manage' then role in ('sales', 'warehouse', 'shipping')
      when 'inventory.manage' then role = 'warehouse'
      when 'pricing.view' then role in ('sales', 'finance')
      when 'invoices.view' then role in ('sales', 'finance')
      when 'approvals.review' then false
      else false
    end
  ), false)
  from effective_roles;
$$;

revoke all on function private.user_has_permission(uuid, text) from public, anon, authenticated;
grant execute on function private.user_has_permission(uuid, text) to service_role;

alter table public.notification_delivery_rules
  add column if not exists required_permissions text[] not null default '{}'::text[],
  add column if not exists recipient_scope text not null default 'permission';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_delivery_rules_recipient_scope_check'
      and conrelid = 'public.notification_delivery_rules'::regclass
  ) then
    alter table public.notification_delivery_rules
      add constraint notification_delivery_rules_recipient_scope_check
      check (recipient_scope in ('permission', 'originator'));
  end if;
end;
$$;

update public.notification_delivery_rules
set required_permissions = case event_type
      when 'new_order' then array['orders.view']::text[]
      when 'new_store_lead' then array['leads.view']::text[]
      when 'order_status_changed' then array['orders.view', 'shipments.manage']::text[]
      when 'stock_review_required' then array['inventory.manage']::text[]
      when 'price_review_required' then array['pricing.view']::text[]
      when 'invoice_issued' then array['invoices.view']::text[]
      when 'approval_requested' then array['approvals.review']::text[]
      when 'approval_approved' then '{}'::text[]
      when 'approval_rejected' then '{}'::text[]
      else required_permissions
    end,
    recipient_scope = case
      when event_type in ('approval_approved', 'approval_rejected') then 'originator'
      else 'permission'
    end,
    updated_at = now()
where event_type in (
  'new_order',
  'new_store_lead',
  'order_status_changed',
  'stock_review_required',
  'price_review_required',
  'invoice_issued',
  'approval_requested',
  'approval_approved',
  'approval_rejected'
);

create or replace function private.get_panel_notification_feed(p_limit integer default 30)
returns table(
  id uuid,
  event_type text,
  label text,
  severity text,
  sound_enabled boolean,
  entity_type text,
  entity_id uuid,
  customer_id uuid,
  reference text,
  customer_name text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  ) then
    raise exception 'Active staff access is required.';
  end if;

  return query
  select
    en.id,
    en.event_type,
    r.label,
    r.severity,
    r.sound_enabled,
    en.entity_type,
    en.entity_id,
    coalesce(o.customer_id, i.customer_id, dc.id) as customer_id,
    coalesce(o.order_number, i.invoice_number, dc.customer_code, sl.reference_code) as reference,
    coalesce(
      c.name,
      nullif(sl.company_name, ''),
      nullif(trim(concat_ws(' ', sl.first_name, sl.last_name)), '')
    ) as customer_name,
    en.payload,
    en.created_at
  from public.email_notifications en
  join public.notification_delivery_rules r
    on r.event_type = en.event_type
   and r.panel_enabled = true
  left join public.customer_orders o
    on en.entity_type = 'order' and o.id = en.entity_id
  left join public.customer_invoices i
    on en.entity_type = 'invoice' and i.id = en.entity_id
  left join public.customers dc
    on en.entity_type = 'customer' and dc.id = en.entity_id
  left join public.store_leads sl
    on en.entity_type = 'store_lead' and sl.id = en.entity_id
  left join public.customers c
    on c.id = coalesce(o.customer_id, i.customer_id, dc.id)
  where en.audience = 'internal'
    and (
      (
        r.recipient_scope = 'permission'
        and exists (
          select 1
          from unnest(r.required_permissions) as required_permission(permission_name)
          where private.user_has_permission(auth.uid(), required_permission.permission_name)
        )
      )
      or (
        r.recipient_scope = 'originator'
        and en.payload->>'requested_by' = auth.uid()::text
      )
    )
  order by en.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- Request Center: creation is broadcast only to users who can manage requests.
create or replace function public.create_support_request(
  p_title text,
  p_category text,
  p_description text
)
returns public.support_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.support_requests%rowtype;
  v_manager record;
  v_manager_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and is_active = true;

  if not found then
    raise exception 'Active profile required';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 3 and 160 then
    raise exception 'Request title must be between 3 and 160 characters';
  end if;

  if p_description is null or char_length(btrim(p_description)) not between 3 and 5000 then
    raise exception 'Request description must be between 3 and 5000 characters';
  end if;

  if p_category is null or p_category not in ('bug', 'development', 'operations', 'other') then
    raise exception 'Invalid request category';
  end if;

  insert into public.support_requests (
    requester_id, requester_name, requester_email, title, category, description
  ) values (
    auth.uid(),
    nullif(btrim(v_profile.full_name), ''),
    nullif(btrim(v_profile.email), ''),
    btrim(p_title),
    p_category,
    btrim(p_description)
  )
  returning * into v_request;

  for v_manager in
    select p.id, p.email
    from public.profiles p
    where p.is_active = true
      and private.user_has_permission(p.id, 'requests.manage')
  loop
    v_manager_count := v_manager_count + 1;

    insert into public.user_notifications (
      user_id, event_type, title, description, severity, href, sound_enabled, payload
    ) values (
      v_manager.id,
      'request_created',
      'New request',
      format('%s · %s', coalesce(v_request.requester_name, v_request.requester_email, 'User'), v_request.title),
      'info',
      '/requests?request=' || v_request.id::text,
      true,
      jsonb_build_object(
        'request_id', v_request.id,
        'requester_id', v_request.requester_id,
        'requester_name', v_request.requester_name,
        'requester_email', v_request.requester_email,
        'category', v_request.category
      )
    );

    if nullif(btrim(v_manager.email), '') is not null then
      insert into public.support_request_email_deliveries (
        request_id, event_type, recipient_email
      ) values (
        v_request.id, 'request_created', btrim(v_manager.email)
      )
      on conflict (request_id, event_type, recipient_email) do nothing;
    end if;
  end loop;

  if v_manager_count = 0 then
    raise exception 'Request notification manager is not configured';
  end if;

  return v_request;
end;
$$;

revoke all on function public.create_support_request(text, text, text) from public, anon;
grant execute on function public.create_support_request(text, text, text) to authenticated;

-- Request Center: status changes require requests.manage and notify only the requester.
create or replace function public.update_support_request_status(
  p_request_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns public.support_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_can_manage boolean;
  v_before public.support_requests%rowtype;
  v_request public.support_requests%rowtype;
  v_note text;
  v_event_type text;
  v_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_can_manage := private.user_has_permission(auth.uid(), 'requests.manage');

  if not coalesce(v_can_manage, false) then
    raise exception 'Request management permission required';
  end if;

  if p_status is null or p_status not in ('open', 'in_progress', 'completed') then
    raise exception 'Invalid request status';
  end if;

  select * into v_before
  from public.support_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  v_note := nullif(btrim(coalesce(p_resolution_note, '')), '');
  if p_status = 'completed' and v_note is null then
    raise exception 'Resolution note is required when completing a request';
  end if;

  v_changed := v_before.status is distinct from p_status
    or v_before.resolution_note is distinct from v_note;

  if not v_changed then
    return v_before;
  end if;

  update public.support_requests
  set
    status = p_status,
    resolution_note = v_note,
    completed_at = case
      when p_status = 'completed' then coalesce(v_before.completed_at, now())
      else null
    end,
    completed_by = case when p_status = 'completed' then auth.uid() else null end,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  v_event_type := case
    when p_status = 'completed' then 'request_completed'
    else 'request_updated'
  end;

  insert into public.user_notifications (
    user_id, event_type, title, description, severity, href, sound_enabled, payload
  ) values (
    v_request.requester_id,
    v_event_type,
    case
      when v_event_type = 'request_completed' then 'Request completed'
      else 'Request updated'
    end,
    format(
      '%s · Status: %s%s',
      v_request.title,
      replace(v_request.status, '_', ' '),
      case
        when v_request.resolution_note is not null then ' · ' || v_request.resolution_note
        else ''
      end
    ),
    case when v_event_type = 'request_completed' then 'success' else 'info' end,
    '/requests?request=' || v_request.id::text,
    true,
    jsonb_build_object(
      'request_id', v_request.id,
      'status', v_request.status,
      'resolution_note', v_request.resolution_note,
      'actor_id', auth.uid()
    )
  );

  return v_request;
end;
$$;

revoke all on function public.update_support_request_status(uuid, text, text) from public, anon;
grant execute on function public.update_support_request_status(uuid, text, text) to authenticated;
