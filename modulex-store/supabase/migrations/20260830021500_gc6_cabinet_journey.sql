create table if not exists public.store_process_steps (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null default 'cabinet-process' check (page_slug = 'cabinet-process'),
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  source_page_url text null check (source_page_url is null or source_page_url ~ '^https://'),
  attribution_classification text not null default 'original_oakwell'
    check (attribution_classification in ('adapted_parent_source', 'original_oakwell')),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.store_faq_entries (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null default 'cabinet-process' check (page_slug = 'cabinet-process'),
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  source_page_url text null check (source_page_url is null or source_page_url ~ '^https://'),
  attribution_classification text not null default 'original_oakwell'
    check (attribution_classification in ('adapted_parent_source', 'original_oakwell')),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null
);

create index if not exists store_process_steps_public_order_idx
  on public.store_process_steps (status, page_slug, sort_order, created_at);
create index if not exists store_faq_entries_public_order_idx
  on public.store_faq_entries (status, page_slug, sort_order, created_at);

alter table public.store_process_steps enable row level security;
alter table public.store_faq_entries enable row level security;

revoke all on table public.store_process_steps from anon, authenticated;
revoke all on table public.store_faq_entries from anon, authenticated;
grant select, insert, update, delete on table public.store_process_steps to authenticated;
grant select, insert, update, delete on table public.store_faq_entries to authenticated;

drop policy if exists store_process_steps_admin_select on public.store_process_steps;
create policy store_process_steps_admin_select
  on public.store_process_steps for select to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_process_steps_admin_insert on public.store_process_steps;
create policy store_process_steps_admin_insert
  on public.store_process_steps for insert to authenticated
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_process_steps_admin_update on public.store_process_steps;
create policy store_process_steps_admin_update
  on public.store_process_steps for update to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']))
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_process_steps_admin_delete on public.store_process_steps;
create policy store_process_steps_admin_delete
  on public.store_process_steps for delete to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_faq_entries_admin_select on public.store_faq_entries;
create policy store_faq_entries_admin_select
  on public.store_faq_entries for select to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_faq_entries_admin_insert on public.store_faq_entries;
create policy store_faq_entries_admin_insert
  on public.store_faq_entries for insert to authenticated
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_faq_entries_admin_update on public.store_faq_entries;
create policy store_faq_entries_admin_update
  on public.store_faq_entries for update to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']))
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_faq_entries_admin_delete on public.store_faq_entries;
create policy store_faq_entries_admin_delete
  on public.store_faq_entries for delete to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

create or replace function public.get_store_public_process_steps()
returns table (
  id uuid,
  title text,
  body text,
  sort_order integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.id, s.title, s.body, s.sort_order, s.updated_at
  from public.store_process_steps s
  where s.status = 'published' and s.page_slug = 'cabinet-process'
  order by s.sort_order asc, s.created_at asc;
$$;

create or replace function public.get_store_public_faq_entries()
returns table (
  id uuid,
  question text,
  answer text,
  sort_order integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select f.id, f.question, f.answer, f.sort_order, f.updated_at
  from public.store_faq_entries f
  where f.status = 'published' and f.page_slug = 'cabinet-process'
  order by f.sort_order asc, f.created_at asc;
$$;

revoke all on function public.get_store_public_process_steps() from public;
revoke all on function public.get_store_public_faq_entries() from public;
grant execute on function public.get_store_public_process_steps() to anon, authenticated;
grant execute on function public.get_store_public_faq_entries() to anon, authenticated;
