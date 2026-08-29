# GC-5 — Gallery / Projects + Media Library Design

Last reviewed: 2026-08-29
Status: **APPROVED FOR IMPLEMENTATION**
Base reviewed: `main` at `cc6be581ca68c0e59f6a076e23d0cd8341c5fe05`
Roadmap package: GC-5 — Gallery / Projects migration

## 1. Goal

Finish the existing Oakwell Gallery/Projects domain without replacing the Phase 2.1 CMS. GC-5 must connect project imagery to the GC-2 Media Library, preserve Granite & Cabinet Center provenance, close the legacy project publication/security gaps, curate at least one real parent-attributed residential project set, and move the public `/gallery` surface from the current fail-closed state to production-accepted content.

GC-5 is the final Gallery/Projects migration package. GC-6 remains out of scope for this conversation/package.

## 2. Current state reviewed from `main`

The repository already contains:

- `public.store_projects` and `public.store_project_media` from `20260829083000_store_secondary_content_cms.sql`;
- Admin `/store/projects` with draft/create/edit/publish/unpublish/delete flows;
- `StoreProjectEditor` for project metadata, cover image, SEO and status;
- `StoreProjectMediaManager` for image upload and external video references;
- Store public project RPCs and the `/gallery` route;
- Gallery readiness that remains fail-closed unless a published `gallery` page and at least one published project exist;
- GC-2 Media Library (`store_media_assets`, `store_media_asset_sources`) with private staging, reviewed publishing, immutable public object paths, attribution classification and cabinet-relevance review.

Production at design review contains:

- `store_projects = 0`;
- `store_project_media = 0`;
- `store_media_assets = 1`;
- `store_media_asset_sources = 1`;
- no `store_pages.slug = 'gallery'` row;
- the one published Media Library asset is `media-showroom-01`, parent-attributed and `cabinet_relevance = mixed`, so it is not suitable as the first GC-5 project image.

The current project CMS therefore has usable structure but no production project content and no structural relationship to the Media Library.

## 3. Main-branch changes that GC-5 must preserve

PR #143 introduced multi-role RBAC. `profiles.role` remains the legacy/primary role, but effective permissions are the union of `profile.roles`, and database authorization uses `private.current_user_has_any_role(...)`.

GC-5 must not reintroduce single-role checks.

Application authorization for `/store/projects` and any new project/media controls must use the existing `store.manage` permission model. Database RLS must preserve the current effective-role policies:

- Admin mutation: effective role contains `super_admin` or `admin`;
- internal project read, where retained: effective role contains `super_admin`, `admin`, or `sales`;
- anonymous direct table access remains denied.

PR #142 Request Center and PR #144 notification dropdown changes are unrelated and must remain untouched.

## 4. Chosen architecture

### 4.1 Keep the existing project domain

Do not create a second Granite-specific project schema.

Continue to use:

- `store_projects` for project metadata and publication state;
- `store_project_media` for ordered project media;
- existing `/store/projects` Admin route;
- existing Store public project query layer and `/gallery` page.

GC-5 is an integration and hardening package, not a CMS rewrite.

### 4.2 Media Library becomes the source of truth for project images

Add nullable structural references:

- `store_projects.cover_media_asset_id uuid references store_media_assets(id)`;
- `store_project_media.media_asset_id uuid references store_media_assets(id)`.

The legacy URL columns stay for compatibility and for the existing external-video record shape, but project **images** must no longer be publishable from arbitrary URLs.

For a linked image, the public URL is derived from the referenced Media Library asset's `public_bucket/public_path`. Browser-entered or directly uploaded project image URLs are not an authoritative publication source.

### 4.3 Project image eligibility

An image is eligible for a published GC-5 project only when the linked `store_media_assets` row satisfies all of the following:

- `status = 'published'`;
- `media_type = 'image'`;
- `public_bucket = 'store-media'`;
- `public_path` is non-empty;
- `default_alt_text` is non-empty unless an explicit project-level alt override is provided;
- `cabinet_relevance = 'relevant'`;
- `attribution_classification in ('oakwell_owned', 'parent_attributed')`.

`mixed`, `irrelevant`, `unreviewed`, and `unverified_hold` assets are not project-publishable.

This is deliberately stricter than GC-2 Media Library publication, where `mixed` may remain a valid published asset for other controlled uses.

### 4.4 Project attribution

GC-1 supports two residential portfolio concepts for GC-5:

- `Kitchen projects`;
- `Bathroom Vanity projects`.

They are parent-attributed Granite & Cabinet Center portfolio candidates. GC-1 does **not** support inventing individual client names, job addresses, project dates, specific cabinet brands, installation claims, completion claims, or Oakwell authorship.

Extend `store_projects` with:

- `attribution_classification text not null default 'oakwell_owned'` constrained to `oakwell_owned | parent_attributed`;
- `attribution_text text`;
- `source_page_url text`.

Rules:

- `oakwell_owned`: attribution text/source page may be null;
- `parent_attributed`: non-empty attribution text and an `https://` source page URL are required before publication;
- the first Granite project intake uses attribution wording that clearly identifies Granite & Cabinet Center as the portfolio source;
- attribution is visible on the public Gallery card/modal and is not hidden in metadata only.

### 4.5 Cover and ordered media semantics

A published project must have:

- one valid linked `cover_media_asset_id`;
- at least one valid linked image row in `store_project_media`.

The cover may also appear in ordered project media. Store rendering de-duplicates the same public asset URL in the modal.

`store_project_media` keeps `media_type` for compatibility:

- image rows require `media_asset_id` and resolve through Media Library;
- external video rows may retain `media_url` and `media_asset_id is null`;
- GC-5 Granite intake does not create or publish video records.

The Admin UI may continue to display existing legacy video records, but new project-image upload/direct URL flows are removed in favor of Media Library selection.

### 4.6 Database publication guard

Client-side validation is not sufficient.

GC-5 adds database enforcement so a project cannot become or remain `published` when publication invariants fail.

A publication guard must reject publication when:

- title/slug are invalid;
- cover asset is absent or not eligible;
- no eligible linked image exists;
- any linked image used by the published project is not eligible;
- a `parent_attributed` project lacks attribution text or source page URL.

Published-state integrity must also be protected from downstream mutation. Operations that would invalidate a published project must fail closed, including:

- removing its cover association;
- deleting its last eligible image association;
- changing a linked image association to an ineligible asset;
- changing required parent attribution to blank values.

The exact trigger/function arrangement may use private helper functions, but publication validity must be enforced in PostgreSQL, not only in React code.

### 4.7 Media Library lifecycle reference protection

The current Media Library server route detects CMS references by public URL patterns. GC-5 adds ID-based reference checks for:

- `store_projects.cover_media_asset_id`;
- `store_project_media.media_asset_id`.

If an asset is referenced by CMS/project content:

- Media Library unpublish fails with `409`;
- Media Library hard delete fails with `409`.

The existing URL-reference fallback remains for legacy CMS fields.

### 4.8 Admin `/store/projects`

Preserve the route and general layout, but align it with the GC-2 Media Library and PR #143 RBAC.

Required changes:

- determine editability from `hasPermission(profile?.roles, 'store.manage')`, never `profile.role` equality;
- replace direct cover-image upload and manual cover-image URL editing with a Media Library selector;
- replace direct project-image upload with Media Library association;
- show only project-eligible assets in the selector;
- show asset preview, title, current alt, attribution classification, cabinet relevance and provenance source label/brand;
- allow project-level alt override for media rows while falling back to the asset default alt text where appropriate;
- expose project attribution classification/text/source page;
- show publish-readiness failures before attempting publish;
- keep draft creation, metadata editing, sorting, publish/unpublish and draft deletion;
- do not expose elevated/server credentials in the browser.

A reusable project Media Library picker should be extracted rather than duplicating the full `/store/media` manager.

### 4.9 Store public projection security

Production currently exposes these project functions as `SECURITY DEFINER` in `public`:

- `get_store_public_projects()`;
- `get_store_public_project(text)`;
- `get_store_public_project_media(text)`.

GC-5 replaces that boundary with the same pattern used by later hardened domains:

1. private implementation functions in a non-exposed schema may use `SECURITY DEFINER` only where required to read protected tables;
2. public wrappers remain narrow and are `SECURITY INVOKER`;
3. `EXECUTE` is explicitly revoked from `PUBLIC` and granted only to `anon`/`authenticated` as intended;
4. direct anonymous table privileges remain revoked;
5. public result sets contain only published projects and eligible published media.

The public projection resolves image URLs from the Media Library relationship. It must never expose staging bucket/path data, hashes, review notes, provenance internals or unpublished assets.

Current Supabase guidance is followed: grants and RLS are treated as separate controls, exposed-table grants remain explicit, and `SECURITY DEFINER` code stays out of the public exposed schema where possible.

### 4.10 Gallery readiness and rendering

Keep the existing fail-closed readiness contract:

- Gallery page absent/unpublished → `/gallery` not publicly ready;
- no published valid project → `/gallery` not publicly ready;
- both present → public Gallery renders.

The project Gallery continues to show:

- cover image;
- title;
- summary;
- category if approved;
- location only when intentionally entered/approved;
- visible attribution for parent-attributed portfolio items;
- ordered media modal.

No customer identity or unsupported project facts are inferred from source filenames or old WordPress copy.

## 5. Controlled GC-5 production intake

### 5.1 Candidate scope

The first project intake is selected from GC-1 residential parent-attributed media only.

Preferred first collection: `Kitchen projects` using `media-kitchen-*` candidates from `https://granitecenterva.com/residential/`.

Possible second collection after visual review: `Bathroom Vanity projects` using `media-vanity-*` candidates.

Excluded/held:

- countertop-only media remains excluded;
- mixed cabinet/countertop assets are used only if visual review classifies the actual image as cabinet-relevant;
- Commercial Projects remain hold;
- home-office/accessory/brand pages remain outside GC-5 unless separately approved.

### 5.2 Intake mechanics

GC-2's controlled importer is extended from the single showroom candidate to an allow-listed set of GC-5 residential candidate IDs from the checked-in GC-1 manifest.

The intake path must preserve GC-2 invariants:

- fixed allow-list, no arbitrary source URL input;
- authenticated Admin boundary;
- source download server-side;
- exact SHA-256 dedupe;
- private staging first;
- deterministic optimization;
- human title/alt/relevance/attribution review;
- explicit approve/publish;
- immutable `media/<asset-id>/<sha>.webp` public path;
- no automatic project publication.

### 5.3 First production project

After eligible assets are reviewed/published, create a project through Admin using conservative content derived only from GC-1-supported facts.

Recommended initial record:

- title: `Kitchen Projects`;
- slug: `kitchen-projects`;
- category: `Kitchen`;
- location: blank unless separately confirmed;
- attribution classification: `parent_attributed`;
- attribution text: `Portfolio source: Granite & Cabinet Center`;
- source page: `https://granitecenterva.com/residential/`;
- summary: neutral portfolio wording only, with no completion/SLA/service-area/product-brand claim.

The exact final summary and asset set are subject to visual/content review during production intake.

### 5.4 Gallery page seed/content

Production currently has no `gallery` page row. GC-5 must create/manage it through the existing Admin page CMS, not hardcode Store copy.

Approved neutral baseline content:

- title: `Projects`;
- eyebrow: `Project Gallery`;
- intro: `Explore selected cabinetry project imagery. Source attribution is shown with each portfolio.`

No unsupported service, turnaround, pricing, territory, installation or authorship claim is introduced.

## 6. Testing strategy

TDD RED → GREEN is mandatory.

### Database/security contracts

Cover:

- new media-asset foreign keys and indexes;
- attribution constraints;
- published project guard;
- last-image removal rejection;
- ineligible/mixed/unpublished asset rejection;
- parent attribution requirements;
- image rows requiring Media Library relationships;
- external video compatibility;
- anon direct-table denial;
- effective-role Admin RLS preserved;
- narrow public wrapper/private implementation architecture;
- explicit function grants/revokes;
- no staging/private metadata in public output.

### Admin contracts

Cover:

- `/store/projects` remains under `store.manage`;
- effective multi-role permission is used;
- old `profile.role` edit gate is removed;
- manual/direct project image upload flow is removed;
- Media Library picker filters to `published + relevant` project assets;
- cover/media associations persist by asset ID;
- provenance and attribution are visible;
- publish readiness is displayed;
- Media Library lifecycle route checks structural references.

### Store contracts

Cover:

- public project mapping consumes hardened RPC fields;
- parent attribution renders publicly;
- Gallery readiness remains fail-closed;
- invalid/unpublished media cannot appear;
- duplicate cover/media URLs are de-duplicated;
- Gallery modal accessibility regressions are avoided.

### Regression verification

At minimum run:

- Admin targeted GC-5 contracts;
- `smoke:secondary-cms-admin`;
- `smoke:media-library-admin`;
- `smoke:rbac`;
- Admin lint + production build;
- Store targeted GC-5 contract;
- `smoke:secondary-cms-contract`;
- `smoke:store-public-content`;
- Store lint + production build;
- `git diff --check`.

Credential-bound production DB assertions are recorded separately and are not replaced with fake local success claims.

## 7. Production acceptance gate

GC-5 is complete only when all are true:

1. GC-5 schema/security migration is applied to production.
2. Project RLS still follows effective multi-role authorization.
3. Public project wrappers are `SECURITY INVOKER`; privileged implementations are private and explicitly permissioned.
4. Anonymous direct project/media table access remains unavailable.
5. Admin project editing uses `store.manage` effective permissions.
6. Direct project image URL/upload bypass is removed for new image associations.
7. At least one GC-1 residential candidate set has passed GC-2 intake/review/optimization/publication.
8. At least one real parent-attributed project is published with multiple reviewed project images where source quality permits.
9. Visible attribution appears on `/gallery`.
10. Media Library refuses unpublish/delete of referenced project assets.
11. Gallery page content is managed through Admin/Supabase and published.
12. `/gallery` returns 200 and is indexable only after readiness is satisfied.
13. Admin and Store production deployments are READY from the accepted GC-5 code baseline.
14. Supabase Security/Performance Advisor is checked and no new GC-5-specific warning remains.
15. Store/Granite/Admin roadmaps and a GC-5 production acceptance document record the evidence.
16. GC-5 is marked `[x]`; GC-6 becomes the next Granite package without starting GC-6 work here.

## 8. Explicit non-goals

GC-5 does not:

- migrate Commercial Projects;
- create a customer project upload flow;
- reuse Dealer supporting-document storage;
- invent client/project addresses, dates, brands, installation scope, service area or completion claims;
- create a new appointment system;
- create GC-6 customer-journey/process content;
- replace the existing project CMS with a new parallel system;
- publish an asset merely because it exists in the GC-1 manifest.

## 9. Decision summary

The chosen design is the Media Library-linked project architecture because it closes the exact gap left intentionally by GC-2: verified media already has identity, provenance, review state and immutable publication, while the older project CMS currently stores only arbitrary URLs. Linking by asset ID makes provenance and lifecycle protections enforceable, prevents URL bypasses, and lets the existing Gallery CMS be completed rather than rewritten.
