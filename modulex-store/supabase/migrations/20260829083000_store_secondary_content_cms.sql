create table if not exists public.store_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  status text not null default 'draft',
  eyebrow text,
  title text not null,
  intro text,
  body text,
  hero_image_url text,
  hero_image_alt text,
  cta_label text,
  cta_href text,
  seo_title text,
  seo_description text,
  og_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_pages_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint store_pages_status_check check (status in ('draft','published')),
  constraint store_pages_title_present check (btrim(title) <> ''),
  constraint store_pages_cta_pair check (
    (cta_label is null and cta_href is null)
    or (nullif(btrim(cta_label), '') is not null and nullif(btrim(cta_href), '') is not null)
  ),
  constraint store_pages_cta_href check (
    cta_href is null
    or cta_href ~ '^/'
    or cta_href ~* '^https?://'
  ),
  constraint store_pages_hero_alt check (
    hero_image_url is null
    or (nullif(btrim(hero_image_url), '') is not null and nullif(btrim(hero_image_alt), '') is not null)
  )
);

create table if not exists public.store_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  status text not null default 'draft',
  title text not null,
  summary text,
  category text,
  location text,
  cover_image_url text,
  cover_image_alt text,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  og_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_projects_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint store_projects_status_check check (status in ('draft','published')),
  constraint store_projects_title_present check (btrim(title) <> ''),
  constraint store_projects_publish_ready check (
    status <> 'published'
    or (
      nullif(btrim(cover_image_url), '') is not null
      and nullif(btrim(cover_image_alt), '') is not null
    )
  )
);

create table if not exists public.store_project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.store_projects(id) on delete cascade,
  media_type text not null default 'image',
  media_url text not null,
  alt_text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_project_media_type_check check (media_type in ('image','video')),
  constraint store_project_media_url_present check (btrim(media_url) <> ''),
  constraint store_project_media_alt_present check (btrim(alt_text) <> '')
);

create index if not exists idx_store_pages_status_slug
  on public.store_pages (status, slug);
create index if not exists idx_store_pages_updated_by
  on public.store_pages (updated_by);
create index if not exists idx_store_projects_status_sort
  on public.store_projects (status, sort_order, published_at desc, id);
create index if not exists idx_store_projects_updated_by
  on public.store_projects (updated_by);
create index if not exists idx_store_project_media_project_sort
  on public.store_project_media (project_id, sort_order, id);
create index if not exists idx_store_project_media_updated_by
  on public.store_project_media (updated_by);

create or replace function private.set_store_content_published_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      new.published_at := now();
    else
      new.published_at := null;
    end if;
  elsif old.published_at is null and new.status = 'published' then
    new.published_at := now();
  else
    new.published_at := old.published_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_store_pages_updated_at on public.store_pages;
create trigger trg_store_pages_updated_at
before update on public.store_pages
for each row execute function private.touch_store_updated_at();

drop trigger if exists trg_store_projects_updated_at on public.store_projects;
create trigger trg_store_projects_updated_at
before update on public.store_projects
for each row execute function private.touch_store_updated_at();

drop trigger if exists trg_store_project_media_updated_at on public.store_project_media;
create trigger trg_store_project_media_updated_at
before update on public.store_project_media
for each row execute function private.touch_store_updated_at();

drop trigger if exists trg_store_pages_published_at on public.store_pages;
create trigger trg_store_pages_published_at
before insert or update of status, published_at on public.store_pages
for each row execute function private.set_store_content_published_at();

drop trigger if exists trg_store_projects_published_at on public.store_projects;
create trigger trg_store_projects_published_at
before insert or update of status, published_at on public.store_projects
for each row execute function private.set_store_content_published_at();

alter table public.store_pages enable row level security;
alter table public.store_projects enable row level security;
alter table public.store_project_media enable row level security;

revoke all on public.store_pages from anon;
revoke all on public.store_projects from anon;
revoke all on public.store_project_media from anon;

create policy store_pages_internal_read
on public.store_pages for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_pages_admin_all
on public.store_pages for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create policy store_projects_internal_read
on public.store_projects for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_projects_admin_all
on public.store_projects for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create policy store_project_media_internal_read
on public.store_project_media for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin','sales')
  )
);
create policy store_project_media_admin_all
on public.store_project_media for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create or replace function public.get_store_public_page(p_slug text)
returns table (
  slug text,
  eyebrow text,
  title text,
  intro text,
  body text,
  hero_image_url text,
  hero_image_alt text,
  cta_label text,
  cta_href text,
  seo_title text,
  seo_description text,
  og_image_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.slug,
    p.eyebrow,
    p.title,
    p.intro,
    p.body,
    p.hero_image_url,
    p.hero_image_alt,
    p.cta_label,
    p.cta_href,
    p.seo_title,
    p.seo_description,
    p.og_image_url,
    p.published_at,
    p.updated_at
  from public.store_pages p
  where p.slug = p_slug
    and p.status = 'published'
  limit 1;
$$;

create or replace function public.get_store_public_projects()
returns table (
  slug text,
  title text,
  summary text,
  category text,
  location text,
  cover_image_url text,
  cover_image_alt text,
  sort_order integer,
  seo_title text,
  seo_description text,
  og_image_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.slug,
    p.title,
    p.summary,
    p.category,
    p.location,
    p.cover_image_url,
    p.cover_image_alt,
    p.sort_order,
    p.seo_title,
    p.seo_description,
    p.og_image_url,
    p.published_at,
    p.updated_at
  from public.store_projects p
  where p.status = 'published'
  order by p.sort_order asc, p.published_at desc nulls last, p.id asc;
$$;

create or replace function public.get_store_public_project(p_slug text)
returns table (
  slug text,
  title text,
  summary text,
  category text,
  location text,
  cover_image_url text,
  cover_image_alt text,
  sort_order integer,
  seo_title text,
  seo_description text,
  og_image_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.slug,
    p.title,
    p.summary,
    p.category,
    p.location,
    p.cover_image_url,
    p.cover_image_alt,
    p.sort_order,
    p.seo_title,
    p.seo_description,
    p.og_image_url,
    p.published_at,
    p.updated_at
  from public.store_projects p
  where p.slug = p_slug
    and p.status = 'published'
  limit 1;
$$;

create or replace function public.get_store_public_project_media(p_slug text)
returns table (
  media_type text,
  media_url text,
  alt_text text,
  sort_order integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    m.media_type,
    m.media_url,
    m.alt_text,
    m.sort_order
  from public.store_project_media m
  join public.store_projects p on p.id = m.project_id
  where p.slug = p_slug
    and p.status = 'published'
  order by m.sort_order asc, m.id asc;
$$;

revoke all on function public.get_store_public_page(text) from public;
revoke all on function public.get_store_public_projects() from public;
revoke all on function public.get_store_public_project(text) from public;
revoke all on function public.get_store_public_project_media(text) from public;

grant execute on function public.get_store_public_page(text) to anon, authenticated;
grant execute on function public.get_store_public_projects() to anon, authenticated;
grant execute on function public.get_store_public_project(text) to anon, authenticated;
grant execute on function public.get_store_public_project_media(text) to anon, authenticated;
