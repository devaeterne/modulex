# Phase 2.1B — Admin Secondary CMS Design

## Context

Package A adds the secondary-page and project CMS data model. Package B gives authorized Modulex Admin users a production control surface for that data. It follows the existing Store CMS pattern at `/store/content` but deliberately does not extend the already-large `StoreContentSettings` component.

## Goals

1. Add dedicated Admin surfaces for secondary pages and projects.
2. Let `admin` and `super_admin` create/edit drafts and explicitly publish/unpublish content.
3. Manage page/project SEO fields, images, alt text, project media, and sort order.
4. Reuse the existing `store-media` bucket and current Store CMS validation conventions.
5. Prevent accidental publication of incomplete or unsafe records.

## Routes and Navigation

Add under the existing Store group in `modulex-admin/src/layout/AppSidebar.tsx`:

- `Pages` → `/store/pages` → permission `store.manage`
- `Projects` → `/store/projects` → permission `store.manage`

The existing Site Content, Marketing & Analytics, Product Content, Color Options, and Leads entries remain unchanged.

Routes:

- `modulex-admin/src/app/(admin)/store/pages/page.tsx`
- `modulex-admin/src/app/(admin)/store/projects/page.tsx`

Logical components:

- `StorePagesManager`
- `StorePageEditor`
- `StoreProjectsManager`
- `StoreProjectEditor`
- `StoreProjectMediaManager`

Components may be split further during implementation for maintainability, but their responsibilities must remain separated: page editing, project list/editing, and project media management.

## Pages Management

The Pages screen manages only the controlled Phase 2.1 slugs:

- `about`
- `gallery`

If either row is absent, the Admin surface may create/upsert a safe draft record when the user first opens/saves that page. It must not publish automatically.

Editable fields:

- status
- eyebrow
- title
- intro
- body
- hero image URL/upload
- hero image alt
- CTA label/href
- SEO title
- SEO description
- OG image URL/upload

The UI exposes explicit `Save draft`, `Publish`, and `Unpublish` intent. A general save must never silently flip status to published.

## Projects Management

Projects list supports:

- title/slug search in the current loaded set;
- status visibility;
- sort order;
- create draft;
- edit;
- publish/unpublish;
- delete draft/unpublished project with confirmation.

Project editor fields:

- slug
- status
- title
- summary
- optional verified category
- optional verified location
- cover image URL/upload
- cover alt text
- sort order
- SEO title
- SEO description
- OG image URL/upload

Project media manager supports:

- image upload to existing `store-media` bucket;
- external public `http(s)` video URL entries for `media_type = 'video'`;
- alt text for every media item;
- sort order;
- delete with confirmation.

Phase 2.1 does not add large video-file upload handling; that is unnecessary infrastructure when the current schema can safely reference approved hosted video URLs.

## Validation

### Shared URL validation

Reuse the existing Admin Store content behavior:

- internal public links begin with `/`;
- external links must use `http:` or `https:`;
- media URLs must be valid public/internal asset URLs appropriate for the existing Store media model.

### Slugs

Project slugs must:

- be lowercase;
- contain only letters, numbers, and hyphens;
- not begin/end with a hyphen;
- be unique.

The Pages UI does not allow operators to invent arbitrary slugs; it manages only `about` and `gallery`.

### Publish validation

A page cannot be published unless:

- title is non-empty;
- hero image URL, when present, has non-empty alt text;
- CTA label/href are both present or both absent;
- CTA href is valid when present.

A project cannot be published unless:

- title and valid unique slug are present;
- cover image URL is present;
- cover alt text is present.

Drafts may remain incomplete.

## Upload Rules

Use the existing `store-media` bucket and the same image constraints already used by Store Content:

- MIME: JPEG, PNG, WebP, AVIF;
- max image size: 20 MB;
- non-overwriting timestamped/object-key strategy;
- save the resulting public URL only after upload succeeds.

Uploading an image does not publish content. The operator still saves/publishes explicitly.

## Authorization

The route/navigation permission is `store.manage`, consistent with existing Store CMS controls.

Within the client management components:

- `super_admin` and `admin` may write;
- unauthorized roles must not receive enabled mutation controls;
- database RLS remains the actual write boundary; hiding buttons is not treated as authorization.

No service-role key is introduced into Admin client code.

## Data Access

Admin management uses authenticated direct table CRUD consistent with existing `StoreContentSettings` behavior and Package A RLS.

Public projection RPCs are not used for editing because they intentionally hide draft/status/internal fields.

## Error and State Handling

Every manager/editor must provide:

- initial loading state;
- load failure message;
- save/upload/publish busy state;
- mutation failure message without optimistic false-success;
- success confirmation;
- destructive-action confirmation;
- disabled mutation controls when authorization or current operation prevents writes.

Failed upload/save must not alter publish state.

## Testing

Add targeted Admin contract coverage that proves:

1. `/store/pages` and `/store/projects` are protected by the Store management permission convention;
2. only the controlled page slugs are managed by the Pages UI;
3. publish validation prevents incomplete page/project publication;
4. image MIME/size validation is retained;
5. project slug validation is deterministic;
6. publishing is an explicit action, not a side effect of save/upload;
7. no service-role credential is introduced client-side.

Package A SQL tests remain responsible for the database/RLS boundary.

## Roadmap Coordination

This package touches both applications operationally and must update:

- `modulex-admin/ADMIN_ROADMAP.md` A4.1;
- `modulex-store/STORE_ROADMAP.md` Phase 2.1.

Do not mark Store public rendering tasks complete here; this package only supplies Admin management.

## Acceptance Criteria

Package B is ready to merge when:

- Pages and Projects are intentional Store navigation entries for `store.manage`;
- authorized users can manage drafts without SQL;
- publish/unpublish is explicit and validated;
- media/SEO/alt/sort-order fields are manageable;
- unauthorized writes remain blocked by RLS/permissions;
- Admin lint/build/smoke relevant to the package pass.