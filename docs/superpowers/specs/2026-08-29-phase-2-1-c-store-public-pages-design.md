# Phase 2.1C — Store Public Pages Design

## Context

Packages A and B provide the secondary CMS schema, published-only public RPCs, and Admin editing workflow. Package C moves the public About and Projects/Gallery surfaces onto those approved projections without allowing draft content to leak.

## Goals

1. Convert `/about` to CMS-backed public copy while keeping company identity/contact data sourced from the existing public company profile.
2. Restore `/gallery` only when a published Gallery page and published project content exist.
3. Render project media only through the published-project RPC boundary.
4. Generate page metadata from approved CMS fields.
5. Keep disabled/demo Gallery routes and old template datasets out of production.
6. Make sitemap exposure depend on production-ready published content.

## Store Query Module

Add a focused Store content query module under the existing Store domain, for example:

- `modulex-store/src/lib/store/content/queries.ts`

It defines typed results for:

- `getStorePublicPage(slug)` → `get_store_public_page`
- `getStorePublicProjects()` → `get_store_public_projects`
- `getStorePublicProject(slug)` → `get_store_public_project`
- `getStorePublicProjectMedia(slug)` → `get_store_public_project_media`

Use the same server-side Supabase public-client and revalidation conventions as current Store company/site/catalog queries. A 15-minute (`900s`) revalidation window is appropriate unless the existing shared helper dictates another value.

The query module returns `null`/empty results for absent published content and throws or logs only according to existing Store query conventions. It never falls back to direct table reads.

## `/about`

The current production-safe factual About page remains the operational fallback.

When `get_store_public_page('about')` returns a published record:

- CMS owns eyebrow, title, intro/body, hero media, CTA, and SEO presentation copy;
- `getStorePublicCompanyProfile()` remains the canonical source for company name, legal name, email, phone, website, and address;
- CMS body must not duplicate or override canonical company-profile fields as the source of truth.

When no published About CMS record exists or the public RPC is temporarily unavailable:

- keep the existing minimal factual About presentation;
- do not expose draft data;
- do not fail the entire public route merely because CMS content is absent.

This fallback protects production availability during A/B/C rollout. Phase 2.1 exit still requires a published Admin-managed About record to be verified in production.

## `/gallery`

`/gallery` is reintroduced as the public Projects surface only when both conditions are true:

1. `get_store_public_page('gallery')` returns a published page record;
2. `get_store_public_projects()` returns at least one published project.

If either condition fails, the route calls `notFound()` and remains absent from the sitemap.

The page renders:

- Gallery page eyebrow/title/intro/body/SEO from the published `gallery` page record;
- published project cards in RPC order;
- cover image and alt text;
- optional verified category/location only when present;
- project media in a lightbox/gallery interaction only from `get_store_public_project_media` for the selected published project.

Phase 2.1 does **not** restore `/gallery/detail` and does not add a public project-detail route. Project cards can open an in-page/lightbox presentation. A dedicated project-detail URL is deferred until there is a business/SEO requirement for it.

## Rendering and Media Safety

- No hard-coded project names, locations, categories, testimonials, phone numbers, or awards.
- No legacy `.html` lightbox/tour URLs.
- Media alt text comes from CMS and is required by the publish workflow.
- Video media renders only for approved public URLs supported by the frontend; unsupported media is skipped rather than rendered unsafely.
- Empty optional fields are omitted, not replaced with invented copy.

## Metadata

### About

Use published CMS values when present:

- title: `seo_title` fallback to page `title` plus site branding convention;
- description: `seo_description` fallback to `intro` when appropriate;
- Open Graph image: `og_image_url` fallback to `hero_image_url` when present;
- canonical: `/about`.

Fallback About metadata remains factual and safe when no published CMS record exists.

### Gallery

Because Gallery only exists with a published page record, metadata is derived from that record:

- title: `seo_title` fallback to page title;
- description: `seo_description` fallback to intro;
- Open Graph image: `og_image_url`, then hero image, then first published project cover when available;
- canonical: `/gallery`.

No per-project SEO fields are rendered as standalone pages in Phase 2.1; those fields are retained in the schema for future project-detail support without forcing it now.

## Sitemap

Keep existing production routes.

`/gallery` is included only when the public content query can establish that:

- the `gallery` page is published; and
- at least one project is published.

`/about` remains included because its current factual fallback is always production-safe.

`/blog`, `/services`, legacy index variants, account/dealer namespaces, and APIs remain excluded.

## Navigation Interaction

Package C may restore a Gallery navigation item only if Package D has not yet landed and only when the Gallery route is production-ready. The preferred merge sequence is A → B → C → D, so C should make the smallest temporary navigation adjustment necessary; D becomes the final source of truth for configurable primary navigation.

No navigation link may point to Gallery while the route would return not-found.

## Public Production Contract

Extend `scripts/public-production-contract.mjs` to protect the new behavior. Static source assertions should verify:

- public content reads go through the approved Store content query/RPC layer;
- legacy Gallery detail/demo route files remain absent;
- Gallery is not unconditionally listed in sitemap/static navigation;
- account/dealer indexing protections remain intact.

Add a focused content contract where feasible for published-only RPC naming and route behavior. Do not rely on source-pattern testing as a substitute for the SQL draft/published isolation tests from Package A.

## Error Handling

- About degrades to the existing factual fallback if CMS data is unavailable.
- Gallery fails closed with `notFound()` if required published data is absent.
- A single broken optional project media item must not expose draft/private data; skip invalid media and keep the page usable.
- No raw Supabase error detail is rendered to public users.

## Verification

Before merge/deploy completion:

1. Store lint passes.
2. Store build passes.
3. Store smoke passes, including public-production contract.
4. A draft About page does not change public About.
5. A published About page renders approved CMS copy and company profile data correctly.
6. Gallery is 404 with unpublished page or zero published projects.
7. Gallery is 200 only after page + project publication.
8. Draft projects/media do not appear publicly.
9. Sitemap toggles Gallery exposure consistently with publication state.
10. Existing account/dealer/public navigation behavior has no regression.

## Roadmap Coordination

Update both roadmaps in the package. Store Phase 2.1 tasks for About and Gallery may become `[x]` only after the production deployment is verified with real published content. Admin A4.1 remains coordinated with Package B status.

## Acceptance Criteria

Package C is complete when:

- normal About content updates no longer require code changes;
- public company identity/contact information still comes from the company-profile source;
- Gallery renders only approved published CMS content;
- draft content is absent from public responses;
- sitemap/navigation do not expose a non-ready Gallery;
- all relevant Store verification passes.