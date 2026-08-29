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

Add a focused Store content query module:

- `modulex-store/src/lib/store/content/queries.ts`

It defines typed results for:

- `getStorePublicPage(slug)` → `get_store_public_page`
- `getStorePublicProjects()` → `get_store_public_projects`
- `getStorePublicProject(slug)` → `get_store_public_project`
- `getStorePublicProjectMedia(slug)` → `get_store_public_project_media`

Use the same server-side Supabase public-client and revalidation conventions as current Store company/site/catalog queries. Use `900s` revalidation unless the existing shared Store helper imposes a different common value.

The query module returns `null`/empty results for absent published content according to existing Store query conventions. It never falls back to direct table reads.

## `/about`

The current production-safe factual About page remains the operational fallback.

When `getStorePublicPage('about')` returns a published record:

- CMS owns eyebrow, title, intro/body, hero media, CTA, and SEO presentation copy;
- `getStorePublicCompanyProfile()` remains the canonical source for company name, legal name, email, phone, website, and address;
- CMS body must not become the authoritative source for canonical company-profile fields.

When no published About CMS record exists or the public RPC is temporarily unavailable:

- keep the existing minimal factual About presentation;
- do not expose draft data;
- do not fail the entire public route merely because CMS content is absent.

This fallback protects production availability during A/B/C rollout. Phase 2.1 exit still requires a published Admin-managed About record to be verified in production.

## `/gallery`

`/gallery` is reintroduced as the public Projects surface only when both conditions are true:

1. `getStorePublicPage('gallery')` returns a published page record;
2. `getStorePublicProjects()` returns at least one published project.

If either condition fails, the route calls `notFound()` and remains absent from the sitemap.

The server page loads the published project list and published media needed for those projects through the approved query module. Sanitized published project/media data is passed into the client lightbox/gallery component as props. The client interaction must not introduce ad-hoc direct Supabase table reads or a second public-data boundary.

The page renders:

- Gallery page eyebrow/title/intro/body/SEO from the published `gallery` page record;
- published project cards in RPC order;
- cover image and alt text;
- optional verified category/location only when present;
- project media in an in-page lightbox/gallery interaction from `getStorePublicProjectMedia` results.

Phase 2.1 does **not** restore `/gallery/detail` and does not add a public project-detail route. Project cards open an in-page/lightbox presentation. A dedicated project-detail URL is deferred until there is a business/SEO requirement for it.

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

No per-project SEO fields are rendered as standalone pages in Phase 2.1; those fields remain available for future project-detail support without forcing that scope now.

## Sitemap

Keep existing production routes.

`/gallery` is included only when the public content query can establish that:

- the `gallery` page is published; and
- at least one project is published.

`/about` remains included because its current factual fallback is always production-safe.

`/blog`, `/services`, legacy index variants, account/dealer namespaces, and APIs remain excluded.

## Navigation Interaction

Package C must not add an unconditional Gallery link. Before Package D lands, the existing code-owned navigation may include Gallery only when the same published readiness condition used by the route/sitemap is satisfied. Package D then becomes the final configurable navigation source.

No navigation link may point to Gallery while the route would return not-found.

## Public Production Contract

Extend `scripts/public-production-contract.mjs` to protect the new behavior. Static source assertions should verify:

- public content reads go through the approved Store content query/RPC layer;
- legacy Gallery detail/demo route files remain absent;
- Gallery is not unconditionally listed in sitemap/static navigation;
- account/dealer indexing protections remain intact.

Add focused contract coverage where feasible for the published-only RPC names and route behavior. Source-pattern checks do not replace Package A SQL draft/published isolation tests.

## Error Handling

- About degrades to the existing factual fallback if CMS data is unavailable.
- Gallery fails closed with `notFound()` if required published page/project data is absent.
- A broken optional project media item is skipped without exposing draft/private data.
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

Update both roadmaps in the package. Store Phase 2.1 tasks for About and Gallery may become `[x]` only after production deployment is verified with real published content. Admin A4.1 remains coordinated with Package B status.

## Acceptance Criteria

Package C is complete when:

- normal About content updates no longer require code changes;
- public company identity/contact information still comes from the company-profile source;
- Gallery renders only approved published CMS content;
- draft content is absent from public responses;
- sitemap/navigation do not expose a non-ready Gallery;
- all relevant Store verification passes.