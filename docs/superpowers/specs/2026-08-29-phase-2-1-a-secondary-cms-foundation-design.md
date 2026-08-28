# Phase 2.1A — Secondary CMS Foundation Design

## Context

Modulex Store Phase 2.1 moves secondary public content out of hard-coded page templates and into controlled Supabase-backed CMS data managed from `modulex-admin`. The existing homepage CMS already establishes the desired security pattern:

- authenticated Admin users manage CMS tables;
- anonymous Store users do not read CMS tables directly;
- public Store reads use narrow published-only projection RPCs;
- published/public data is intentionally narrower than Admin-editable data.

This package defines only the shared data model and public read boundary for secondary pages and projects. It does not add Admin UI or public Store rendering.

## Goals

1. Add a structured CMS model for secondary public pages.
2. Add a structured CMS model for public projects/gallery content and project media.
3. Add draft/published state and publication timestamps.
4. Add SEO title, SEO description, Open Graph image, and image alt-text fields where applicable.
5. Add narrow anonymous public RPCs that return published projections only.
6. Preserve current private/public boundaries: anonymous users must not receive direct table access.
7. Provide deterministic sort order for projects and project media.

## Explicit Non-Goals

- No generic page builder.
- No arbitrary HTML/MDX storage or public rendering.
- No Blog/article/comment/category model in Phase 2.1.
- No Admin UI in this package.
- No Store `/about` or `/gallery` rendering changes in this package.
- No navigation/footer configurability in this package.

## Blog Decision

Phase 2.1 deliberately chooses **no Blog CMS**. `/blog` remains disabled/not-found until an editorial workflow is a real business requirement. This avoids building article authors, categories, comments, pagination, and moderation infrastructure merely to restore a template-era route.

## Data Model

### `store_pages`

One record per supported secondary page.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `status text not null default 'draft' check (status in ('draft','published'))`
- `eyebrow text null`
- `title text not null`
- `intro text null`
- `body text null`
- `hero_image_url text null`
- `hero_image_alt text null`
- `cta_label text null`
- `cta_href text null`
- `seo_title text null`
- `seo_description text null`
- `og_image_url text null`
- `published_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `updated_by uuid null references auth.users(id) on delete set null`

Constraints and behavior:

- `slug` uses lowercase URL-safe identifiers;
- Phase 2.1 Admin supports the controlled page slugs `about` and `gallery`; the table remains structurally extensible without becoming an unrestricted page builder;
- publishing requires a non-empty title;
- `cta_label` and `cta_href` must either both be null or both be populated;
- `cta_href` must be an internal path beginning with `/` or an `http(s)` URL;
- if `hero_image_url` is populated, `hero_image_alt` must also be populated before publishing;
- `published_at` is set when a row first becomes published; unpublishing makes the row private immediately but does not erase historical publication time.

### `store_projects`

Columns:

- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `status text not null default 'draft' check (status in ('draft','published'))`
- `title text not null`
- `summary text null`
- `category text null`
- `location text null`
- `cover_image_url text null`
- `cover_image_alt text null`
- `sort_order integer not null default 0`
- `seo_title text null`
- `seo_description text null`
- `og_image_url text null`
- `published_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `updated_by uuid null references auth.users(id) on delete set null`

Business rules:

- draft projects may be saved before media is complete;
- `category` and `location` are optional because only verified public facts should be stored;
- publishing requires non-empty title and slug plus both `cover_image_url` and `cover_image_alt`;
- public ordering is `sort_order asc, published_at desc, id asc` for deterministic output.

### `store_project_media`

Columns:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references store_projects(id) on delete cascade`
- `media_type text not null default 'image' check (media_type in ('image','video'))`
- `media_url text not null`
- `alt_text text not null`
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `updated_by uuid null references auth.users(id) on delete set null`

The first iteration does not model documents here; project media is visual public content only.

## Authorization and RLS

All three tables have RLS enabled.

Authenticated Admin management follows the existing Store CMS role convention:

- `super_admin`: full CRUD;
- `admin`: full CRUD;
- other roles: no write access unless the existing project-wide Store CMS permission contract explicitly grants it.

Anonymous access:

- no direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grants;
- no table policy exposing rows to `anon`;
- anonymous reads occur only through the approved RPCs below.

Implementation reuses the existing Store CMS authorization/profile helper pattern instead of introducing a second authorization mechanism.

## Public RPC Contracts

### `get_store_public_page(p_slug text)`

Returns zero or one row where `slug = p_slug` and `status = 'published'`.

Projection:

- `slug`, `eyebrow`, `title`, `intro`, `body`
- `hero_image_url`, `hero_image_alt`
- `cta_label`, `cta_href`
- `seo_title`, `seo_description`, `og_image_url`
- `published_at`, `updated_at`

It must not expose `id`, `status`, `updated_by`, or unpublished rows.

### `get_store_public_projects()`

Returns only published projects in deterministic order.

Projection:

- `slug`, `title`, `summary`, `category`, `location`
- `cover_image_url`, `cover_image_alt`, `sort_order`
- `seo_title`, `seo_description`, `og_image_url`
- `published_at`, `updated_at`

### `get_store_public_project(p_slug text)`

Returns one published project by slug using the approved project projection. It does not embed media JSON.

### `get_store_public_project_media(p_slug text)`

Returns media only when the owning project is published.

Projection:

- `media_type`, `media_url`, `alt_text`, `sort_order`

Ordering is `sort_order asc, id asc`.

## Function Security

Every public RPC must:

- use `SECURITY DEFINER` only when required to cross the table RLS boundary;
- pin a safe `search_path` consistent with existing hardened Store RPCs;
- revoke default `PUBLIC` execution where appropriate;
- grant execute only to intended Store roles (`anon`, and `authenticated` where signed-in Store rendering uses the same function);
- return a fixed typed projection, never `select *` from underlying tables.

## Initial Content

Package A seeds no public-facing page or project content. Package B creates/upserts the controlled `about` and `gallery` records as drafts through the Admin management workflow. This avoids migration-owned marketing copy and guarantees that nothing becomes public until an Admin explicitly publishes it.

The existing factual `/about` remains the production fallback until Package C consumes a published CMS record. No fake projects are seeded.

## Migration Location

Use `modulex-store/supabase/migrations` and the repository's existing timestamped SQL migration convention.

## Testing and Verification

Add SQL/contract coverage proving:

1. anon direct select from each new table fails;
2. anon cannot mutate any new table;
3. Admin/Super Admin can manage rows through the intended authenticated table path;
4. draft `store_pages` rows do not resolve through `get_store_public_page`;
5. published pages resolve with only approved fields;
6. draft projects do not resolve through project RPCs;
7. published projects resolve in deterministic sort order;
8. project media for draft/unpublished projects cannot be returned publicly;
9. invalid status values fail constraints;
10. a project missing cover URL or cover alt cannot be published.

## Rollout and Compatibility

This migration is additive. Existing `store_site_settings`, `store_home_features`, product publishing, leads, account portal, and dealer portal contracts remain unchanged.

Package B depends on these tables for Admin editing. Package C depends on the public RPCs for Store rendering. Package D is independent of these tables and gets its own chrome data model.

## Acceptance Criteria

Package A is ready to merge when:

- migration and RPC definitions are additive and reviewable;
- direct anonymous table access remains closed;
- public RPCs return only published projections;
- no fake public content is seeded;
- SQL/contract coverage captures draft/published isolation and publish validation;
- both Store and Admin roadmaps record the Phase 2.1/A4.1 workstream as started, without marking downstream UI work complete.