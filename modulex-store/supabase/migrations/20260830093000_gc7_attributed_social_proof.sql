create table if not exists public.store_testimonials (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text not null check (length(trim(reviewer_name)) > 0),
  reviewer_location text null,
  excerpt text not null check (length(trim(excerpt)) > 0 and length(excerpt) <= 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  attribution_classification text not null default 'parent_attributed'
    check (attribution_classification in ('parent_attributed', 'oakwell_owned')),
  source_entity text null,
  source_page_url text null check (source_page_url is null or source_page_url ~ '^https://'),
  attribution_text text null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  check (
    attribution_classification <> 'parent_attributed'
    or (
      length(trim(coalesce(source_entity, ''))) > 0
      and source_page_url ~ '^https://'
      and length(trim(coalesce(attribution_text, ''))) > 0
    )
  )
);

create index if not exists store_testimonials_public_order_idx
  on public.store_testimonials (status, sort_order, created_at);

alter table public.store_testimonials enable row level security;

revoke all on table public.store_testimonials from anon, authenticated;
grant select, insert, update, delete on table public.store_testimonials to authenticated;

drop policy if exists store_testimonials_admin_select on public.store_testimonials;
create policy store_testimonials_admin_select
  on public.store_testimonials for select to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_testimonials_admin_insert on public.store_testimonials;
create policy store_testimonials_admin_insert
  on public.store_testimonials for insert to authenticated
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_testimonials_admin_update on public.store_testimonials;
create policy store_testimonials_admin_update
  on public.store_testimonials for update to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']))
  with check (private.store_current_user_has_any_role(array['super_admin', 'admin']));

drop policy if exists store_testimonials_admin_delete on public.store_testimonials;
create policy store_testimonials_admin_delete
  on public.store_testimonials for delete to authenticated
  using (private.store_current_user_has_any_role(array['super_admin', 'admin']));

create or replace function public.get_store_public_testimonials()
returns table (
  id uuid,
  reviewer_name text,
  reviewer_location text,
  excerpt text,
  sort_order integer,
  attribution_classification text,
  source_entity text,
  source_page_url text,
  attribution_text text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    t.id,
    t.reviewer_name,
    t.reviewer_location,
    t.excerpt,
    t.sort_order,
    t.attribution_classification,
    t.source_entity,
    t.source_page_url,
    t.attribution_text,
    t.updated_at
  from public.store_testimonials t
  where t.status = 'published'
    and (
      t.attribution_classification = 'oakwell_owned'
      or (
        t.attribution_classification = 'parent_attributed'
        and length(trim(coalesce(t.source_entity, ''))) > 0
        and t.source_page_url ~ '^https://'
        and length(trim(coalesce(t.attribution_text, ''))) > 0
      )
    )
  order by t.sort_order asc, t.created_at asc;
$$;

revoke all on function public.get_store_public_testimonials() from public;
grant execute on function public.get_store_public_testimonials() to anon, authenticated;
