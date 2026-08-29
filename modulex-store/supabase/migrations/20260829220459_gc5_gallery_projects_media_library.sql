-- GC-5 — Gallery / Projects + Media Library
-- Preserve the existing project CMS while making reviewed Media Library assets
-- the authoritative publication source for project imagery.

alter table public.store_projects
  add column if not exists cover_media_asset_id uuid references public.store_media_assets(id) on delete restrict,
  add column if not exists attribution_classification text not null default 'oakwell_owned',
  add column if not exists attribution_text text,
  add column if not exists source_page_url text;

alter table public.store_project_media
  add column if not exists media_asset_id uuid references public.store_media_assets(id) on delete restrict;

alter table public.store_projects
  drop constraint if exists store_projects_attribution_classification_check;
alter table public.store_projects
  add constraint store_projects_attribution_classification_check
  check (attribution_classification in ('oakwell_owned', 'parent_attributed'));

alter table public.store_projects
  drop constraint if exists store_projects_source_page_url_check;
alter table public.store_projects
  add constraint store_projects_source_page_url_check
  check (source_page_url is null or source_page_url ~* '^https://');

-- The Phase 2.1 constraint trusted an arbitrary cover URL. GC-5 publication
-- instead requires a linked eligible Media Library asset through a DB guard.
alter table public.store_projects
  drop constraint if exists store_projects_publish_ready;
alter table public.store_projects
  add constraint store_projects_publish_ready check (
    status <> 'published'
    or (
      cover_media_asset_id is not null
      and nullif(btrim(cover_image_alt), '') is not null
    )
  );

-- External video compatibility remains URL based. Image rows may remain legacy
-- while a project is a draft, but a published project accepts image rows only
-- when they have eligible Media Library asset identities.
alter table public.store_project_media
  drop constraint if exists store_project_media_video_shape_check;
alter table public.store_project_media
  add constraint store_project_media_video_shape_check check (
    media_type <> 'video'
    or (
      media_asset_id is null
      and media_url ~* '^https?://'
    )
  );

create index if not exists idx_store_projects_cover_media_asset_id
  on public.store_projects (cover_media_asset_id)
  where cover_media_asset_id is not null;

create index if not exists idx_store_project_media_media_asset_id
  on public.store_project_media (media_asset_id)
  where media_asset_id is not null;

create schema if not exists store_api_private;
revoke all on schema store_api_private from public;
grant usage on schema store_api_private to anon, authenticated, service_role;

create or replace function private.store_project_media_asset_is_eligible(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.store_media_assets a
      where a.id = p_asset_id
        and a.status = 'published'
        and a.media_type = 'image'
        and a.public_bucket = 'store-media'
        and nullif(btrim(a.public_path), '') is not null
        and a.cabinet_relevance = 'relevant'
        and a.attribution_classification in ('oakwell_owned', 'parent_attributed')
    ),
    false
  );
$$;

revoke all on function private.store_project_media_asset_is_eligible(uuid) from public;
revoke all on function private.store_project_media_asset_is_eligible(uuid) from anon, authenticated;
grant execute on function private.store_project_media_asset_is_eligible(uuid) to service_role;

create or replace function private.store_project_is_publishable(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.store_projects p
      where p.id = p_project_id
        and nullif(btrim(p.title), '') is not null
        and p.slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and p.cover_media_asset_id is not null
        and nullif(btrim(p.cover_image_alt), '') is not null
        and private.store_project_media_asset_is_eligible(p.cover_media_asset_id)
        and (
          p.attribution_classification = 'oakwell_owned'
          or (
            p.attribution_classification = 'parent_attributed'
            and nullif(btrim(p.attribution_text), '') is not null
            and p.source_page_url ~* '^https://'
          )
        )
        and exists (
          select 1
          from public.store_project_media m
          where m.project_id = p.id
            and m.media_type = 'image'
            and m.media_asset_id is not null
            and nullif(btrim(m.alt_text), '') is not null
            and private.store_project_media_asset_is_eligible(m.media_asset_id)
        )
        and not exists (
          select 1
          from public.store_project_media m
          where m.project_id = p.id
            and (
              (
                m.media_type = 'image'
                and (
                  m.media_asset_id is null
                  or nullif(btrim(m.alt_text), '') is null
                  or not private.store_project_media_asset_is_eligible(m.media_asset_id)
                )
              )
              or (
                m.media_type = 'video'
                and (
                  m.media_asset_id is not null
                  or m.media_url !~* '^https?://'
                  or nullif(btrim(m.alt_text), '') is null
                )
              )
            )
        )
    ),
    false
  );
$$;

revoke all on function private.store_project_is_publishable(uuid) from public;
revoke all on function private.store_project_is_publishable(uuid) from anon, authenticated;
grant execute on function private.store_project_is_publishable(uuid) to service_role;

create or replace function private.assert_store_project_publishable(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.store_project_is_publishable(p_project_id) then
    raise exception 'Published project requires an eligible Media Library cover, at least one eligible linked image, valid media rows, and complete attribution.';
  end if;
end;
$$;

revoke all on function private.assert_store_project_publishable(uuid) from public;
revoke all on function private.assert_store_project_publishable(uuid) from anon, authenticated;
grant execute on function private.assert_store_project_publishable(uuid) to service_role;

create or replace function private.enforce_store_project_publishability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    perform private.assert_store_project_publishable(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_store_project_publishability() from public;
revoke all on function private.enforce_store_project_publishability() from anon, authenticated;
grant execute on function private.enforce_store_project_publishability() to service_role;

drop trigger if exists trg_store_projects_publishability on public.store_projects;
create constraint trigger trg_store_projects_publishability
after insert or update of status, title, slug, cover_media_asset_id, cover_image_alt,
  attribution_classification, attribution_text, source_page_url
on public.store_projects
deferrable initially immediate
for each row execute function private.enforce_store_project_publishability();

create or replace function private.enforce_store_project_media_publishability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select p.status into v_old_status
    from public.store_projects p
    where p.id = old.project_id;

    if v_old_status = 'published' then
      perform private.assert_store_project_publishable(old.project_id);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and (tg_op <> 'UPDATE' or new.project_id is distinct from old.project_id) then
    select p.status into v_new_status
    from public.store_projects p
    where p.id = new.project_id;

    if v_new_status = 'published' then
      perform private.assert_store_project_publishable(new.project_id);
    end if;
  elsif tg_op = 'INSERT' then
    select p.status into v_new_status
    from public.store_projects p
    where p.id = new.project_id;

    if v_new_status = 'published' then
      perform private.assert_store_project_publishable(new.project_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.enforce_store_project_media_publishability() from public;
revoke all on function private.enforce_store_project_media_publishability() from anon, authenticated;
grant execute on function private.enforce_store_project_media_publishability() to service_role;

drop trigger if exists trg_store_project_media_publishability on public.store_project_media;
create constraint trigger trg_store_project_media_publishability
after insert or update or delete on public.store_project_media
deferrable initially immediate
for each row execute function private.enforce_store_project_media_publishability();

-- A direct table mutation must not be able to invalidate a published project
-- by demoting or deleting an asset behind the Admin lifecycle route.
create or replace function private.protect_published_project_media_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referenced boolean;
  v_new_eligible boolean;
begin
  select exists (
    select 1
    from public.store_projects p
    where p.status = 'published'
      and p.cover_media_asset_id = old.id
    union all
    select 1
    from public.store_project_media m
    join public.store_projects p on p.id = m.project_id
    where p.status = 'published'
      and m.media_type = 'image'
      and m.media_asset_id = old.id
  ) into v_referenced;

  if not v_referenced then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Media asset is referenced by a published project.';
  end if;

  v_new_eligible :=
    new.status = 'published'
    and new.media_type = 'image'
    and new.public_bucket = 'store-media'
    and nullif(btrim(new.public_path), '') is not null
    and new.cabinet_relevance = 'relevant'
    and new.attribution_classification in ('oakwell_owned', 'parent_attributed');

  if not v_new_eligible then
    raise exception 'Media asset is referenced by a published project and must remain project-eligible.';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_published_project_media_asset() from public;
revoke all on function private.protect_published_project_media_asset() from anon, authenticated;
grant execute on function private.protect_published_project_media_asset() to service_role;

drop trigger if exists trg_store_media_assets_project_guard on public.store_media_assets;
create trigger trg_store_media_assets_project_guard
before update of status, media_type, public_bucket, public_path, cabinet_relevance, attribution_classification
or delete on public.store_media_assets
for each row execute function private.protect_published_project_media_asset();

-- Reconcile Phase 2.1 policies with PR #143 effective multi-role authorization.
drop policy if exists store_projects_internal_read on public.store_projects;
create policy store_projects_internal_read
on public.store_projects for select to authenticated
using ((select private.current_user_has_any_role(array['super_admin', 'admin', 'sales']::text[])));

drop policy if exists store_projects_admin_all on public.store_projects;
create policy store_projects_admin_all
on public.store_projects for all to authenticated
using ((select private.current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select private.current_user_has_any_role(array['super_admin', 'admin']::text[])));

drop policy if exists store_project_media_internal_read on public.store_project_media;
create policy store_project_media_internal_read
on public.store_project_media for select to authenticated
using ((select private.current_user_has_any_role(array['super_admin', 'admin', 'sales']::text[])));

drop policy if exists store_project_media_admin_all on public.store_project_media;
create policy store_project_media_admin_all
on public.store_project_media for all to authenticated
using ((select private.current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select private.current_user_has_any_role(array['super_admin', 'admin']::text[])));

revoke all on table public.store_projects from anon;
revoke all on table public.store_project_media from anon;

-- Harden the legacy public project projections. Public wrappers remain stable
-- API names but execute as the caller; the protected reads happen only inside
-- non-exposed SECURITY DEFINER implementations.
create or replace function store_api_private.get_store_public_projects_impl()
returns table(
  slug text,
  title text,
  summary text,
  category text,
  location text,
  cover_image_bucket text,
  cover_image_path text,
  cover_image_alt text,
  sort_order integer,
  seo_title text,
  seo_description text,
  og_image_url text,
  attribution_classification text,
  attribution_text text,
  source_page_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.slug,
    p.title,
    p.summary,
    p.category,
    p.location,
    a.public_bucket,
    a.public_path,
    p.cover_image_alt,
    p.sort_order,
    p.seo_title,
    p.seo_description,
    p.og_image_url,
    p.attribution_classification,
    p.attribution_text,
    p.source_page_url,
    p.published_at,
    p.updated_at
  from public.store_projects p
  join public.store_media_assets a on a.id = p.cover_media_asset_id
  where p.status = 'published'
    and private.store_project_is_publishable(p.id)
  order by p.sort_order, p.published_at desc nulls last, p.id;
$$;

create or replace function store_api_private.get_store_public_project_impl(p_slug text)
returns table(
  slug text,
  title text,
  summary text,
  category text,
  location text,
  cover_image_bucket text,
  cover_image_path text,
  cover_image_alt text,
  sort_order integer,
  seo_title text,
  seo_description text,
  og_image_url text,
  attribution_classification text,
  attribution_text text,
  source_page_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from store_api_private.get_store_public_projects_impl()
  where slug = p_slug
  limit 1;
$$;

create or replace function store_api_private.get_store_public_project_media_impl(p_slug text)
returns table(
  media_type text,
  media_bucket text,
  media_path text,
  media_url text,
  alt_text text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.media_type,
    case when m.media_type = 'image' then a.public_bucket else null end,
    case when m.media_type = 'image' then a.public_path else null end,
    case when m.media_type = 'video' then m.media_url else null end,
    m.alt_text,
    m.sort_order
  from public.store_project_media m
  join public.store_projects p on p.id = m.project_id
  left join public.store_media_assets a on a.id = m.media_asset_id
  where p.slug = p_slug
    and p.status = 'published'
    and private.store_project_is_publishable(p.id)
    and (
      (m.media_type = 'image' and private.store_project_media_asset_is_eligible(m.media_asset_id))
      or (m.media_type = 'video' and m.media_asset_id is null and m.media_url ~* '^https?://')
    )
  order by m.sort_order, m.id;
$$;

revoke all on function store_api_private.get_store_public_projects_impl() from public;
revoke all on function store_api_private.get_store_public_project_impl(text) from public;
revoke all on function store_api_private.get_store_public_project_media_impl(text) from public;
grant execute on function store_api_private.get_store_public_projects_impl() to anon, authenticated, service_role;
grant execute on function store_api_private.get_store_public_project_impl(text) to anon, authenticated, service_role;
grant execute on function store_api_private.get_store_public_project_media_impl(text) to anon, authenticated, service_role;

drop function if exists public.get_store_public_projects();
drop function if exists public.get_store_public_project(text);
drop function if exists public.get_store_public_project_media(text);

create or replace function public.get_store_public_projects()
returns table(
  slug text,
  title text,
  summary text,
  category text,
  location text,
  cover_image_bucket text,
  cover_image_path text,
  cover_image_alt text,
  sort_order integer,
  seo_title text,
  seo_description text,
  og_image_url text,
  attribution_classification text,
  attribution_text text,
  source_page_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, store_api_private
as $$
  select * from store_api_private.get_store_public_projects_impl();
$$;

create or replace function public.get_store_public_project(p_slug text)
returns table(
  slug text,
  title text,
  summary text,
  category text,
  location text,
  cover_image_bucket text,
  cover_image_path text,
  cover_image_alt text,
  sort_order integer,
  seo_title text,
  seo_description text,
  og_image_url text,
  attribution_classification text,
  attribution_text text,
  source_page_url text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, store_api_private
as $$
  select * from store_api_private.get_store_public_project_impl(p_slug);
$$;

create or replace function public.get_store_public_project_media(p_slug text)
returns table(
  media_type text,
  media_bucket text,
  media_path text,
  media_url text,
  alt_text text,
  sort_order integer
)
language sql
stable
security invoker
set search_path = pg_catalog, store_api_private
as $$
  select * from store_api_private.get_store_public_project_media_impl(p_slug);
$$;

revoke all on function public.get_store_public_projects() from public;
revoke all on function public.get_store_public_project(text) from public;
revoke all on function public.get_store_public_project_media(text) from public;
grant execute on function public.get_store_public_projects() to anon, authenticated, service_role;
grant execute on function public.get_store_public_project(text) to anon, authenticated, service_role;
grant execute on function public.get_store_public_project_media(text) to anon, authenticated, service_role;
