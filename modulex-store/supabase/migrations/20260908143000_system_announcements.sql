-- System announcements are shared platform/product updates. They are intentionally
-- separate from per-user operational notifications so publishing does not fan out
-- one row per recipient.

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'improvement'
    check (kind in ('new_feature', 'improvement', 'bug_fix', 'maintenance')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  href text null check (href is null or href ~ '^/'),
  cta_label text null check (cta_label is null or char_length(btrim(cta_label)) between 1 and 80),
  target_roles public.user_role[] null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz null,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  published_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_announcements_publish_state_check check (
    (status = 'published' and published_at is not null)
    or (status <> 'published')
  )
);

create table if not exists public.system_announcement_reads (
  announcement_id uuid not null references public.system_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists system_announcements_feed_idx
  on public.system_announcements (published_at desc, id)
  where status = 'published';

create index if not exists system_announcement_reads_user_idx
  on public.system_announcement_reads (user_id, read_at desc);

alter table public.system_announcements enable row level security;
alter table public.system_announcement_reads enable row level security;

revoke all on public.system_announcements from anon;
revoke all on public.system_announcement_reads from anon;
grant select, insert, update, delete on public.system_announcements to authenticated;
grant select, insert, update, delete on public.system_announcement_reads to authenticated;

-- Every authenticated user may read only announcements that are currently published
-- and targeted to their role. Admins additionally need draft/archive visibility for
-- the management screen.
drop policy if exists system_announcements_select on public.system_announcements;
create policy system_announcements_select
on public.system_announcements
for select
to authenticated
using (
  (
    status = 'published'
    and published_at <= now()
    and (
      target_roles is null
      or cardinality(target_roles) = 0
      or exists (
        select 1
        from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = any (system_announcements.target_roles)
      )
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = any (system_announcements.target_roles)
      )
    )
  )
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
);

drop policy if exists system_announcements_admin_insert on public.system_announcements;
create policy system_announcements_admin_insert
on public.system_announcements
for insert
to authenticated
with check (
  auth.uid() = created_by
  and (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
    )
  )
);

drop policy if exists system_announcements_admin_update on public.system_announcements;
create policy system_announcements_admin_update
on public.system_announcements
for update
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
);

drop policy if exists system_announcements_admin_delete on public.system_announcements;
create policy system_announcements_admin_delete
on public.system_announcements
for delete
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin'::public.user_role, 'admin'::public.user_role)
  )
);

drop policy if exists system_announcement_reads_select_own on public.system_announcement_reads;
create policy system_announcement_reads_select_own
on public.system_announcement_reads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists system_announcement_reads_insert_own on public.system_announcement_reads;
create policy system_announcement_reads_insert_own
on public.system_announcement_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.system_announcements a
    where a.id = announcement_id
      and a.status = 'published'
      and a.published_at <= now()
  )
);

drop policy if exists system_announcement_reads_update_own on public.system_announcement_reads;
create policy system_announcement_reads_update_own
on public.system_announcement_reads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists system_announcement_reads_delete_own on public.system_announcement_reads;
create policy system_announcement_reads_delete_own
on public.system_announcement_reads
for delete
to authenticated
using (user_id = auth.uid());
