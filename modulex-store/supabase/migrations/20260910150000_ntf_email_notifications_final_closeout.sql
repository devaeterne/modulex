-- NTF-A1/A2/A3/A4 final closeout.
-- Canonical ownership:
--   * notification_delivery_rules owns internal channel/routing policy.
--   * code-owned renderers own email templates (no duplicate template table exists).
--   * provider credentials remain server environment only.

alter table public.email_notifications
  add column if not exists max_attempts integer not null default 5,
  add column if not exists processing_started_at timestamptz,
  add column if not exists failure_code text;

alter table public.user_notifications
  add column if not exists dedupe_key text;

create unique index if not exists user_notifications_user_dedupe_key_idx
  on public.user_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists email_notifications_processing_started_idx
  on public.email_notifications (processing_started_at)
  where status = 'processing';

create index if not exists email_notifications_monitor_idx
  on public.email_notifications (status, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.email_notifications'::regclass
      and conname = 'email_notifications_attempt_bounds'
  ) then
    alter table public.email_notifications
      add constraint email_notifications_attempt_bounds
      check (attempts >= 0 and max_attempts between 1 and 10);
  end if;
end
$$;

-- Raw queue rows contain recipients, payloads and provider message ids. They are
-- server-only; browser/operator observability uses the sanitized monitor RPC.
drop policy if exists email_notifications_read on public.email_notifications;
revoke select on table public.email_notifications from anon, authenticated;

-- Canonical permission-aware internal email recipient resolver. The resolver uses
-- the same ANY-of required_permissions semantics as the in-app feed.
create or replace function public.resolve_notification_delivery_recipients(
  p_event_type text,
  p_originator_id uuid default null
)
returns table (
  email text,
  recipient_scope text,
  required_permissions text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select distinct
    lower(trim(p.email)) as email,
    r.recipient_scope,
    r.required_permissions
  from public.notification_delivery_rules r
  join public.profiles p
    on p.is_active = true
   and p.email is not null
   and position('@' in p.email) > 1
  where r.event_type = p_event_type
    and r.internal_email_enabled = true
    and (
      (
        r.recipient_scope = 'permission'
        and cardinality(r.required_permissions) > 0
        and exists (
          select 1
          from unnest(r.required_permissions) as rp(permission_name)
          where private.user_has_permission(p.id, rp.permission_name)
        )
      )
      or (
        r.recipient_scope = 'originator'
        and p_originator_id is not null
        and p.id = p_originator_id
      )
    );
$$;

revoke execute on function public.resolve_notification_delivery_recipients(text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_notification_delivery_recipients(text, uuid) to service_role;

-- Service-only, PII/provider-safe delivery monitor. It intentionally excludes
-- payload, to_emails and resend_message_ids.
create or replace function public.get_email_delivery_monitor(p_limit integer default 100)
returns table (
  id uuid,
  event_type text,
  audience text,
  entity_type text,
  status text,
  attempts integer,
  max_attempts integer,
  next_attempt_at timestamptz,
  processing_started_at timestamptz,
  failure_code text,
  failure_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  is_stuck boolean,
  is_exhausted boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    e.id,
    e.event_type,
    e.audience,
    e.entity_type,
    e.status,
    e.attempts,
    e.max_attempts,
    e.next_attempt_at,
    e.processing_started_at,
    e.failure_code,
    e.last_error as failure_reason,
    e.created_at,
    e.updated_at,
    (e.status = 'processing' and e.processing_started_at < now() - interval '10 minutes') as is_stuck,
    (e.attempts >= e.max_attempts and e.status = 'failed') as is_exhausted
  from public.email_notifications e
  order by
    case when e.status in ('failed', 'processing') then 0 else 1 end,
    e.updated_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 250);
$$;

revoke execute on function public.get_email_delivery_monitor(integer) from public, anon, authenticated;
grant execute on function public.get_email_delivery_monitor(integer) to service_role;

-- Manual retry is retry-safe and never resets the attempt counter.
-- bounded retry invariant: attempts < max_attempts
create or replace function public.retry_email_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  update public.email_notifications
  set status = 'pending',
      next_attempt_at = now(),
      processing_started_at = null,
      updated_at = now()
  where id = p_notification_id
    and attempts < max_attempts
    and (
      status = 'failed'
      or (
        status = 'processing'
        and processing_started_at is not null
        and processing_started_at < now() - interval '10 minutes'
      )
    );

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.retry_email_notification(uuid) from public, anon, authenticated;
grant execute on function public.retry_email_notification(uuid) to service_role;

create or replace function public.recover_stuck_email_notifications()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  update public.email_notifications
  set status = 'failed',
      processing_started_at = null,
      failure_code = 'stuck_processing',
      last_error = 'A previous processing lease expired before completion.',
      next_attempt_at = case when attempts < max_attempts then now() else next_attempt_at end,
      processed_at = now(),
      updated_at = now()
  where status = 'processing'
    and processing_started_at is not null
    and processing_started_at < now() - interval '10 minutes';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.recover_stuck_email_notifications() from public, anon, authenticated;
grant execute on function public.recover_stuck_email_notifications() to service_role;

-- Read lifecycle RPCs are recipient-scoped and idempotent. SECURITY DEFINER is
-- required because user_notifications exposes SELECT only; writes stay RPC-only.
-- Preserve the existing void return contract so this migration can safely replace
-- the production functions without dropping/recreating their identities.
create or replace function public.mark_user_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  -- authorization invariant: user_id = auth.uid()
  update public.user_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = v_user_id;
end;
$$;

create or replace function public.mark_all_user_notifications_read()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  -- authorization invariant: user_id = auth.uid()
  update public.user_notifications
  set read_at = now()
  where user_id = v_user_id
    and read_at is null;
end;
$$;

revoke execute on function public.mark_user_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_user_notifications_read() from public, anon;
grant execute on function public.mark_user_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_user_notifications_read() to authenticated;

-- Keep the warehouse/inventory event explicitly tied to the operational
-- permission. Sales has inventory.view but not inventory.manage.
update public.notification_delivery_rules
set required_permissions = array['inventory.manage']::text[],
    recipient_scope = 'permission',
    updated_at = now()
where event_type = 'stock_review_required';

-- Announcement/read policies: preserve semantics while evaluating auth.uid once
-- per statement instead of once per row.
drop policy if exists system_announcement_reads_select_own on public.system_announcement_reads;
create policy system_announcement_reads_select_own on public.system_announcement_reads
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists system_announcement_reads_insert_own on public.system_announcement_reads;
create policy system_announcement_reads_insert_own on public.system_announcement_reads
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.system_announcements a
    where a.id = system_announcement_reads.announcement_id
      and a.status = 'published'
      and a.published_at <= now()
  )
);

drop policy if exists system_announcement_reads_update_own on public.system_announcement_reads;
create policy system_announcement_reads_update_own on public.system_announcement_reads
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists system_announcement_reads_delete_own on public.system_announcement_reads;
create policy system_announcement_reads_delete_own on public.system_announcement_reads
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists system_announcements_select on public.system_announcements;
create policy system_announcements_select on public.system_announcements
for select to authenticated
using (
  (
    status = 'published'
    and published_at <= now()
    and (
      target_roles is null
      or cardinality(target_roles) = 0
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role = any(system_announcements.target_roles)
      )
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role = any(system_announcements.target_roles)
      )
    )
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
);

drop policy if exists system_announcements_admin_insert on public.system_announcements;
create policy system_announcements_admin_insert on public.system_announcements
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
    )
  )
);

drop policy if exists system_announcements_admin_update on public.system_announcements;
create policy system_announcements_admin_update on public.system_announcements
for update to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
);

drop policy if exists system_announcements_admin_delete on public.system_announcements;
create policy system_announcements_admin_delete on public.system_announcements
for delete to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = any(array['super_admin'::public.user_role, 'admin'::public.user_role])
  )
);
