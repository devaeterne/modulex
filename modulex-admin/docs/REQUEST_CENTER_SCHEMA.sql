-- Modulex Admin Request Center
-- Apply through the normal Supabase deployment flow after review.
-- Requires docs/NOTIFICATION_ROUTING_V2.sql for private.user_has_permission(...).
-- New request: panel notifications for active request managers and email delivery for managers with an email address.
-- Request manager resolution is permission-based through requests.manage.
-- Manager action: panel notification only for the original requester.

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  requester_name text,
  requester_email text,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  category text not null check (category in ('bug', 'development', 'operations', 'other')),
  description text not null check (char_length(btrim(description)) between 3 and 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  resolution_note text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_requester_created_idx
  on public.support_requests (requester_id, created_at desc);
create index if not exists support_requests_status_created_idx
  on public.support_requests (status, created_at desc);

alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon;
revoke insert, update, delete on public.support_requests from authenticated;
grant select on public.support_requests to authenticated;

drop policy if exists support_requests_select_own_or_admin on public.support_requests;
create policy support_requests_select_own_or_admin
on public.support_requests
for select
to authenticated
using (
  requester_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and (
        p.role in ('super_admin', 'admin')
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = p.id
            and ur.role in ('super_admin', 'admin')
        )
      )
  )
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text not null,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  href text,
  sound_enabled boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);
create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon;
revoke insert, update, delete on public.user_notifications from authenticated;
grant select on public.user_notifications to authenticated;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
on public.user_notifications
for select
to authenticated
using (user_id = (select auth.uid()));

create table if not exists public.support_request_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  event_type text not null default 'request_created' check (event_type = 'request_created'),
  recipient_email text not null check (position('@' in recipient_email) > 1),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  resend_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, event_type, recipient_email)
);

create index if not exists support_request_email_delivery_pending_idx
  on public.support_request_email_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.support_request_email_deliveries enable row level security;
revoke all on public.support_request_email_deliveries from anon, authenticated;

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

create or replace function public.mark_user_notification_read(p_notification_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.user_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();
$$;

revoke all on function public.mark_user_notification_read(uuid) from public, anon;
grant execute on function public.mark_user_notification_read(uuid) to authenticated;

create or replace function public.mark_all_user_notifications_read()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.user_notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

revoke all on function public.mark_all_user_notifications_read() from public, anon;
grant execute on function public.mark_all_user_notifications_read() to authenticated;
