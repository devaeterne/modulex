# Phase 2.1C — Store Public Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move public About and Gallery/Projects onto the approved published-only secondary CMS RPCs while preserving the factual About fallback and keeping Gallery route/navigation/sitemap exposure fail-closed until published content is ready.

**Architecture:** Add one server-only content query module that maps the four Phase 2.1A RPC projections into camelCase Store types. About combines optional CMS presentation copy with the existing canonical company-profile query. Gallery is a server route that requires a published Gallery page plus at least one published project, loads published project media through the query module, and passes sanitized serializable data into a focused client gallery/lightbox component. Root layout computes the same Gallery readiness for the code-owned pre-Package-D Navbar; sitemap uses the same helper so navigation, route availability, and indexing cannot diverge.

**Tech Stack:** Next.js 16.1.6 App Router, React 19 server/client components, TypeScript, Supabase REST RPC via `callPublicRpc`, Zustand only where existing lightbox behavior remains useful, Node contract tests.

**Spec:** `docs/superpowers/specs/2026-08-29-phase-2-1-c-store-public-pages-design.md`

## Global Constraints

- Public content reads use only `get_store_public_page`, `get_store_public_projects`, `get_store_public_project`, and `get_store_public_project_media`; no direct public table reads.
- Public content RPC calls use 900-second revalidation.
- About keeps the current factual fallback and canonical company identity/contact from `getStorePublicCompanyProfile()`.
- Gallery exists only when a published `gallery` page and at least one published project exist.
- No `/gallery/detail` and no public project-detail route are added.
- Gallery navigation and sitemap exposure use the same published readiness rule as the Gallery route.
- Client components receive sanitized published props and do not query Supabase.
- Unsupported video URLs are skipped rather than rendered.
- Store and Admin roadmaps are updated in the package; About/Gallery remain `[~]` until production content/deploy verification.
- No automatic merge or production deployment.

---

### Task 1: Published Store content query boundary

**Files:**
- Create: `modulex-store/src/lib/store/content/queries.ts`
- Create: `modulex-store/scripts/store-public-content-contract.mjs`
- Modify: `modulex-store/package.json`

**Interfaces:**
- Produces `StorePublicPage`, `StorePublicProject`, `StorePublicProjectMedia`.
- Produces `getStorePublicPage(slug)`, `getStorePublicProjects()`, `getStorePublicProject(slug)`, `getStorePublicProjectMedia(slug)`, `getStoreGalleryReadiness()`.
- All public functions return camelCase Store data; missing single-row RPC results return `null`; list RPCs return arrays.

- [ ] **Step 1: Write the failing contract**

Create `scripts/store-public-content-contract.mjs` with source assertions that require the query file, all four approved RPC names, `revalidate: 900`, no `.from(` direct table reads in the content module, and a `getStoreGalleryReadiness` helper.

```js
const querySource = await readFile(path.join(root, "src/lib/store/content/queries.ts"), "utf8");
for (const rpc of [
  "get_store_public_page",
  "get_store_public_projects",
  "get_store_public_project",
  "get_store_public_project_media",
]) {
  assert(querySource.includes(`\"${rpc}\"`), `missing ${rpc}`);
}
assert(/revalidate:\s*900/.test(querySource), "public content must revalidate at 900s");
assert(!querySource.includes(".from("), "public content module must not directly read tables");
assert(querySource.includes("getStoreGalleryReadiness"), "gallery readiness helper is required");
```

- [ ] **Step 2: Run the contract RED**

Run: `npm run smoke:store-public-content`
Expected: FAIL because `src/lib/store/content/queries.ts` does not exist.

- [ ] **Step 3: Implement typed query mapping**

Use snake_case RPC row types and explicit mapping, following `src/lib/store/products/queries.ts`.

```ts
import "server-only";
import { cache } from "react";
import { callPublicRpc } from "@/lib/supabase/public-rest";

export type StorePublicPage = {
  slug: string;
  eyebrow: string | null;
  title: string;
  intro: string | null;
  body: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
};
```

`getStorePublicPage` and `getStorePublicProject` normalize slug with `^[a-z0-9]+(?:-[a-z0-9]+)*$` and return `null` for invalid slugs. `getStoreGalleryReadiness()` uses `Promise.all([getStorePublicPage("gallery"), getStorePublicProjects()])` and returns `{ page, projects, isReady: Boolean(page && projects.length > 0) }`.

- [ ] **Step 4: Wire contract into smoke and verify GREEN**

Add:

```json
"smoke:store-public-content": "node scripts/store-public-content-contract.mjs"
```

and invoke it from `smoke` immediately after `smoke:secondary-cms-contract`.

Run: `npm run smoke:store-public-content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modulex-store/src/lib/store/content/queries.ts modulex-store/scripts/store-public-content-contract.mjs modulex-store/package.json
git commit -m "feat(store): add published content query boundary"
```

---

### Task 2: CMS-backed About with factual fallback

**Files:**
- Modify: `modulex-store/src/app/about/page.tsx`
- Modify: `modulex-store/scripts/store-public-content-contract.mjs`

**Interfaces:**
- Consumes `getStorePublicPage("about")` and `getStorePublicCompanyProfile()`.
- Produces dynamic `generateMetadata()` and the existing safe fallback when CMS is absent/unavailable.

- [ ] **Step 1: Extend contract RED assertions**

Require About to call `getStorePublicPage("about")`, export `generateMetadata`, keep `getStorePublicCompanyProfile`, and retain fallback copy markers.

```js
assert(aboutSource.includes('getStorePublicPage("about")'), "About must read the published About RPC");
assert(aboutSource.includes("generateMetadata"), "About metadata must be dynamic");
assert(aboutSource.includes("getStorePublicCompanyProfile"), "company profile remains canonical");
assert(aboutSource.includes("Cabinet products and support from Oakwell Cabinetry"), "safe fallback must remain");
```

- [ ] **Step 2: Run RED**

Run: `npm run smoke:store-public-content`
Expected: FAIL on missing About CMS/dynamic metadata assertions.

- [ ] **Step 3: Implement metadata and page data loading**

Use `Promise.allSettled` so CMS failure does not break About. Metadata loads only the CMS page and falls back to the current safe metadata.

```ts
export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getStorePublicPage("about");
    if (!page) return FALLBACK_ABOUT_METADATA;
    return {
      title: page.seoTitle || page.title,
      description: page.seoDescription || page.intro || FALLBACK_ABOUT_DESCRIPTION,
      alternates: { canonical: "/about" },
      openGraph: page.ogImageUrl || page.heroImageUrl ? { images: [page.ogImageUrl || page.heroImageUrl!] } : undefined,
    };
  } catch {
    return FALLBACK_ABOUT_METADATA;
  }
}
```

Render CMS eyebrow/title/intro/body/hero/CTA only when `aboutPage` exists. Keep contact section entirely sourced from `company`. Render body with whitespace-preserving paragraphs (`whiteSpace: "pre-line"`) rather than unsafe HTML.

- [ ] **Step 4: Verify GREEN**

Run: `npm run smoke:store-public-content && npm run smoke:public-production`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modulex-store/src/app/about/page.tsx modulex-store/scripts/store-public-content-contract.mjs
git commit -m "feat(store): render About from published CMS content"
```

---

### Task 3: Published Gallery route and client project interaction

**Files:**
- Create: `modulex-store/src/app/gallery/page.tsx`
- Create: `modulex-store/src/components/gallery/StoreProjectsGallery.tsx`
- Modify: `modulex-store/scripts/public-production-contract.mjs`
- Modify: `modulex-store/scripts/store-public-content-contract.mjs`

**Interfaces:**
- Server route consumes `getStoreGalleryReadiness()` and `getStorePublicProjectMedia(slug)`.
- Client receives `Array<{ project: StorePublicProject; media: StorePublicProjectMedia[] }>` and performs no network/database reads.

- [ ] **Step 1: Update public-production contract for the intentional Gallery route**

Remove `src/app/gallery/page.tsx` from `blockedRouteFiles`, keep `src/app/gallery/detail/page.tsx` blocked, and add Gallery route/client files to `productionSurfaceFiles`.

Add focused assertions:

```js
assert(gallerySource.includes("notFound()"), "Gallery must fail closed");
assert(gallerySource.includes("getStoreGalleryReadiness"), "Gallery must use shared readiness");
assert(!galleryClientSource.includes("supabase"), "Gallery client must use server-provided props only");
```

- [ ] **Step 2: Run contract RED**

Run: `npm run smoke:store-public-content && npm run smoke:public-production`
Expected: FAIL because Gallery route/client do not yet exist.

- [ ] **Step 3: Implement server route**

`generateMetadata()` loads readiness. If not ready, return safe non-indexing Gallery metadata; route body calls `notFound()` when not ready. For ready content, load each project's media with `Promise.all`, catching per-project media failures and substituting `[]`.

```ts
const readiness = await getStoreGalleryReadiness();
if (!readiness.isReady || !readiness.page) notFound();
const projects = await Promise.all(
  readiness.projects.map(async (project) => ({
    project,
    media: await getStorePublicProjectMedia(project.slug).catch(() => []),
  }))
);
```

Use Gallery page hero/title/intro/body from CMS; pass only mapped published data to `StoreProjectsGallery`.

- [ ] **Step 4: Implement client interaction**

The client renders project cards in RPC order, cover image/alt, optional category/location, and an accessible modal/lightbox opened by a project card. It uses each project's cover plus image media. For video media, render only public `https://`/`http://` URLs; use a native `<video controls>` only for direct media file extensions (`.mp4`, `.webm`, `.ogg`) and otherwise expose a safe external link instead of embedding arbitrary HTML/iframes. Escape closes the modal and body scrolling is restored on cleanup.

- [ ] **Step 5: Verify GREEN**

Run: `npm run smoke:store-public-content && npm run smoke:public-production`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modulex-store/src/app/gallery/page.tsx modulex-store/src/components/gallery/StoreProjectsGallery.tsx modulex-store/scripts/public-production-contract.mjs modulex-store/scripts/store-public-content-contract.mjs
git commit -m "feat(store): add published Projects gallery"
```

---

### Task 4: Readiness-driven Navbar and sitemap

**Files:**
- Modify: `modulex-store/src/app/layout.tsx`
- Modify: `modulex-store/src/components/StoreChrome.tsx`
- Modify: `modulex-store/src/components/Navbar.tsx`
- Modify: `modulex-store/src/app/sitemap.ts`
- Modify: `modulex-store/scripts/store-public-content-contract.mjs`
- Modify: `modulex-store/scripts/public-production-contract.mjs`

**Interfaces:**
- Root layout resolves `galleryReady: boolean` with `getStoreGalleryReadiness()` and passes it to `StoreChrome` → `Navbar`.
- Sitemap independently uses the same `getStoreGalleryReadiness()` helper because metadata routes do not consume layout props.

- [ ] **Step 1: Add RED contract assertions**

Require Navbar Gallery link to be conditional on a `galleryReady` prop, require root layout to use `getStoreGalleryReadiness`, require sitemap to use the same helper, and change the old contract from “Gallery must never appear in sitemap source” to “Gallery must not be in `staticRoutes` and may only be appended inside the readiness branch.”

- [ ] **Step 2: Run RED**

Run: `npm run smoke:store-public-content && npm run smoke:public-production && npm run smoke:portal-public-navbar`
Expected: FAIL on readiness-driven nav/sitemap assertions.

- [ ] **Step 3: Implement layout/Navbar readiness**

Add Gallery readiness to the existing `Promise.allSettled` shell fetch. On any readiness failure set `galleryReady = false` so navigation fails closed. Add a `Gallery` `<Link href="/gallery">` only when `galleryReady` is true. Preserve Account and portal/public Navbar behavior unchanged.

- [ ] **Step 4: Implement sitemap readiness**

Keep `/gallery` out of `staticRoutes`. Resolve readiness separately from products; add a Gallery entry only when `isReady` is true. A Gallery query failure omits Gallery without suppressing static/product URLs.

- [ ] **Step 5: Verify GREEN**

Run: `npm run smoke:store-public-content && npm run smoke:public-production && npm run smoke:portal-public-navbar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modulex-store/src/app/layout.tsx modulex-store/src/components/StoreChrome.tsx modulex-store/src/components/Navbar.tsx modulex-store/src/app/sitemap.ts modulex-store/scripts/store-public-content-contract.mjs modulex-store/scripts/public-production-contract.mjs
git commit -m "feat(store): gate Gallery navigation and sitemap"
```

---

### Task 5: Roadmaps and full verification

**Files:**
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Records Package C code/verification as implemented but does not mark public About/Gallery production acceptance `[x]` until real published content is deployed and verified.

- [ ] **Step 1: Mark Package C implementation state accurately**

Update Store main baseline to `be710a72b1b69c0cdc41f39f08e6223ce646328b`, mark About and Gallery `[~]`, record code verification evidence, and set Next Action to merge/deploy + publish real About/Gallery/project content + live acceptance. Update Admin cross-roadmap line to say Package C implementation is ready/pending live acceptance; do not reopen Package B.

- [ ] **Step 2: Run fresh full verification**

Run from `modulex-store`:

```bash
npm ci
npm run lint
npm run smoke
npm run build
```

Expected: lint 0 errors (existing warnings acceptable), every smoke contract PASS, Next.js/TypeScript build PASS.

- [ ] **Step 3: Review branch diff**

Verify no direct table reads, no service-role key, no `/gallery/detail`, no unconditional Gallery static route/nav link, no fake content, and no production DB mutation.

- [ ] **Step 4: Commit roadmap evidence**

```bash
git add modulex-store/STORE_ROADMAP.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: record Phase 2.1C verification state"
```

- [ ] **Step 5: Open PR to `main`**

PR must explicitly report test evidence and state that merge/deploy/content publication remain user-controlled.
