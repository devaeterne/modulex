# Phase 2.1B — Admin Secondary CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production Admin management surfaces for controlled secondary Store pages and gallery projects, with explicit draft/publish actions, validated media, SEO fields, and project media management.

**Architecture:** Keep the existing `StoreContentSettings` homepage editor unchanged. Add a focused secondary-CMS domain module for types/validation/upload rules, then separate Pages and Projects client managers using authenticated direct-table CRUD against Package A RLS. Route/nav authorization remains `store.manage`; public RPCs remain read-only and are not used by Admin editing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase JS 2.105, existing TailAdmin utility classes, Node contract smoke scripts.

**Spec:** `docs/superpowers/specs/2026-08-29-phase-2-1-b-admin-secondary-cms-design.md`

## Global Constraints

- Controlled page slugs are exactly `about` and `gallery`.
- Only `super_admin` and `admin` may mutate; database RLS remains the real write boundary.
- Routes `/store/pages` and `/store/projects` require `store.manage`.
- Save Draft, Publish, and Unpublish are explicit separate intents; image upload never publishes.
- Image MIME allowlist: JPEG, PNG, WebP, AVIF.
- Maximum image size: 20 MB.
- Upload bucket: `store-media`, non-overwriting object paths.
- Project slugs match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and must be unique.
- Public/internal hrefs begin with `/`; external hrefs use `http:` or `https:`.
- Project videos are external public `http(s)` URLs only; no large video upload is added.
- No service-role key may be introduced client-side.
- Store public rendering remains Package C scope and must not be marked complete here.

---

### Task 1: Reconcile roadmaps and establish the failing Admin contract

**Files:**
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Create: `modulex-admin/scripts/secondary-cms-admin-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Consumes: approved Phase 2.1 A/B specs and verified Store/Admin lint/build/smoke evidence through PR #97.
- Produces: `npm run smoke:secondary-cms-admin`, included in the full Admin smoke chain.

- [ ] **Step 1: Update roadmap state at workstream start**

Set Store baseline to current `main`, close Phase 2.0 lint/smoke gates, mark 2.1A model/migrations/RPCs complete with production verification, and mark the Admin CMS screen item `[~]`. In Admin A4.1, record Package B as the current cross-roadmap workstream while keeping A0 as the broader Admin cleanup phase.

- [ ] **Step 2: Write the failing contract**

Create `modulex-admin/scripts/secondary-cms-admin-contract.mjs` that reads the intended route, sidebar, permission, shared helper, page manager/editor, project manager/editor/media files and asserts:

```js
assert.match(sidebar, /Pages[\s\S]*\/store\/pages[\s\S]*store\.manage/);
assert.match(sidebar, /Projects[\s\S]*\/store\/projects[\s\S]*store\.manage/);
assert.match(permissions, /\/store\/pages[\s\S]*store\.manage/);
assert.match(permissions, /\/store\/projects[\s\S]*store\.manage/);
assert.match(domain, /CONTROLLED_PAGE_SLUGS[\s\S]*about[\s\S]*gallery/);
assert.match(domain, /PROJECT_SLUG_PATTERN/);
assert.match(domain, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp[\s\S]*image\/avif/);
assert.match(domain, /20\s*\*\s*1024\s*\*\s*1024/);
assert.match(pageEditor, /Save draft/);
assert.match(pageEditor, /Publish/);
assert.match(pageEditor, /Unpublish/);
assert.match(projectEditor, /Save draft/);
assert.match(projectEditor, /Publish/);
assert.match(projectEditor, /Unpublish/);
assert.match(projectMedia, /media_type[\s\S]*video/);
assert.doesNotMatch(allClientCode, /service[_-]?role|SUPABASE_SERVICE_ROLE/i);
```

Also assert routes render their manager components, publishing calls explicit validation helpers, upload code targets `store-media`, and project delete is restricted to non-published records in UI logic.

- [ ] **Step 3: Wire the contract into package scripts**

Add:

```json
"smoke:secondary-cms-admin": "node scripts/secondary-cms-admin-contract.mjs"
```

and include it in `npm run smoke` before the live/API/DB suites.

- [ ] **Step 4: Run the targeted contract and verify RED**

Run:

```bash
cd modulex-admin
npm run smoke:secondary-cms-admin
```

Expected: FAIL because the Pages/Projects routes/components/helpers do not exist yet.

- [ ] **Step 5: Commit the red test and roadmap start state**

```bash
git add docs/superpowers/plans/2026-08-29-phase-2-1-b-admin-secondary-cms.md modulex-admin/scripts/secondary-cms-admin-contract.mjs modulex-admin/package.json modulex-admin/ADMIN_ROADMAP.md modulex-store/STORE_ROADMAP.md
git commit -m "test(admin): define Phase 2.1B CMS contract"
```

---

### Task 2: Add the secondary CMS domain contract and validation helpers

**Files:**
- Create: `modulex-admin/src/lib/store/secondaryCms.ts`

**Interfaces:**
- Produces:
  - `CONTROLLED_PAGE_SLUGS`
  - `StorePage`, `StoreProject`, `StoreProjectMedia` types
  - `isPublicHref(value: string): boolean`
  - `isHttpUrl(value: string): boolean`
  - `isProjectSlug(value: string): boolean`
  - `validateImageFile(file: Pick<File, "type" | "size">): string | null`
  - `validatePageForPublish(page: StorePageDraft): string | null`
  - `validateProjectForPublish(project: StoreProjectDraft, duplicateSlug?: boolean): string | null`
  - `cleanNullable(value: string | null | undefined): string | null`
  - `buildStoreMediaPath(scope: string, field: string, originalName: string): string`

- [ ] **Step 1: Keep the contract failing for missing helper symbols**

Run:

```bash
npm run smoke:secondary-cms-admin
```

Expected: FAIL on `secondaryCms.ts` assertions.

- [ ] **Step 2: Implement minimal shared helpers**

Use:

```ts
export const CONTROLLED_PAGE_SLUGS = ["about", "gallery"] as const;
export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const STORE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const STORE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
```

Publish validation rules must exactly match the approved spec. `buildStoreMediaPath` must sanitize extensions and include `Date.now()` plus `crypto.randomUUID()` so uploads never overwrite existing objects.

- [ ] **Step 3: Re-run the targeted contract**

Expected: helper assertions pass; route/component assertions still fail.

- [ ] **Step 4: Commit**

```bash
git add modulex-admin/src/lib/store/secondaryCms.ts
git commit -m "feat(admin): add secondary CMS validation contract"
```

---

### Task 3: Add Pages management

**Files:**
- Create: `modulex-admin/src/components/store/StorePagesManager.tsx`
- Create: `modulex-admin/src/components/store/StorePageEditor.tsx`
- Create: `modulex-admin/src/app/(admin)/store/pages/page.tsx`

**Interfaces:**
- Consumes shared types/validation from `@/lib/store/secondaryCms` and `getCurrentProfile()`.
- Reads/writes `public.store_pages` directly with authenticated Supabase client.
- Produces a controlled editor for `about` and `gallery` only.

- [ ] **Step 1: Verify RED for Pages assertions**

Run `npm run smoke:secondary-cms-admin`; expected failure on missing Pages route/editor.

- [ ] **Step 2: Implement `StorePagesManager` loading and authorization**

Load current profile and exactly these rows:

```ts
supabase
  .from("store_pages")
  .select("id,slug,status,eyebrow,title,intro,body,hero_image_url,hero_image_alt,cta_label,cta_href,seo_title,seo_description,og_image_url,published_at,updated_at")
  .in("slug", CONTROLLED_PAGE_SLUGS);
```

Create local safe drafts for missing rows without writing them on load. `canEdit` is true only for `super_admin`/`admin`.

- [ ] **Step 3: Implement `StorePageEditor` draft/save/publish behavior**

`Save draft` always persists `status: "draft"`; `Publish` calls `validatePageForPublish` then persists `status: "published"`; `Unpublish` persists `status: "draft"`. All mutations set `updated_by` from `supabase.auth.getUser()`.

For absent rows, use `upsert(..., { onConflict: "slug" })`; controlled slug is immutable in UI.

- [ ] **Step 4: Implement page image uploads**

Support hero and OG image uploads to `store-media` using shared MIME/size validation and generated non-overwriting object keys. Upload updates only the local form URL and success text; it does not persist or publish until the user chooses an explicit save action.

- [ ] **Step 5: Add the route**

Create metadata, breadcrumb, and `<StorePagesManager />` at `/store/pages`.

- [ ] **Step 6: Re-run targeted contract**

Expected: Pages assertions pass, Projects/RBAC assertions remain red.

- [ ] **Step 7: Commit**

```bash
git add modulex-admin/src/components/store/StorePagesManager.tsx modulex-admin/src/components/store/StorePageEditor.tsx 'modulex-admin/src/app/(admin)/store/pages/page.tsx'
git commit -m "feat(admin): manage secondary Store pages"
```

---

### Task 4: Add Projects management and media

**Files:**
- Create: `modulex-admin/src/components/store/StoreProjectsManager.tsx`
- Create: `modulex-admin/src/components/store/StoreProjectEditor.tsx`
- Create: `modulex-admin/src/components/store/StoreProjectMediaManager.tsx`
- Create: `modulex-admin/src/app/(admin)/store/projects/page.tsx`

**Interfaces:**
- Reads/writes `store_projects` and `store_project_media` directly under Package A RLS.
- Project editor and media manager use shared validation/upload helpers.
- Manager owns current loaded list/search/selection/create/delete orchestration.

- [ ] **Step 1: Verify RED for Projects assertions**

Run `npm run smoke:secondary-cms-admin`; expected failure on missing Projects files.

- [ ] **Step 2: Implement project list and draft creation**

Load projects ordered by `sort_order`, then title. Provide client-side title/slug search. New-project form requires title and valid unique slug before insert and inserts `status: "draft"` only.

- [ ] **Step 3: Implement `StoreProjectEditor`**

Fields: slug, title, summary, category, location, cover URL/alt, sort order, SEO title/description, OG image URL. Save Draft/Publish/Unpublish mirror the page behavior. Before publish, check duplicate slug in the loaded set and call `validateProjectForPublish`.

Cover/OG uploads use `store-media`, shared image validation, and do not auto-save or auto-publish.

- [ ] **Step 4: Implement draft/unpublished delete**

Show delete only when `project.status !== "published"`; require `window.confirm`. Delete from `store_projects`, relying on FK cascade for media.

- [ ] **Step 5: Implement `StoreProjectMediaManager`**

Load media for selected project ordered by `sort_order`, then id. Image entry flow uploads to `store-media`, then inserts `media_type: "image"`, uploaded public URL, required alt text, sort order, and `updated_by`. Video entry flow requires valid external `http(s)` URL, required alt text, sort order, and inserts `media_type: "video"` without upload. Delete requires confirmation.

- [ ] **Step 6: Add Projects route**

Create metadata, breadcrumb, and `<StoreProjectsManager />` at `/store/projects`.

- [ ] **Step 7: Re-run targeted contract**

Expected: component/domain assertions pass; sidebar/RBAC wiring remains red.

- [ ] **Step 8: Commit**

```bash
git add modulex-admin/src/components/store/StoreProjectsManager.tsx modulex-admin/src/components/store/StoreProjectEditor.tsx modulex-admin/src/components/store/StoreProjectMediaManager.tsx 'modulex-admin/src/app/(admin)/store/projects/page.tsx'
git commit -m "feat(admin): manage Store projects and media"
```

---

### Task 5: Wire navigation and route authorization

**Files:**
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/src/lib/auth/permissions.ts`

**Interfaces:**
- Produces Store submenu entries Pages/Projects with `store.manage`.
- Produces explicit route rules requiring `store.manage` before the generic `/store/*` `store.view` fallback.

- [ ] **Step 1: Verify RED for navigation/RBAC assertions**

Run `npm run smoke:secondary-cms-admin`; expected failure on sidebar/route permission assertions.

- [ ] **Step 2: Add sidebar entries**

Under Store:

```ts
{ name: "Pages", path: "/store/pages", permission: "store.manage", exact: true },
{ name: "Projects", path: "/store/projects", permission: "store.manage", exact: true },
```

- [ ] **Step 3: Add explicit route rules**

Before generic Store rules:

```ts
{
  match: (path) =>
    path === "/store/pages" || path.startsWith("/store/pages/") ||
    path === "/store/projects" || path.startsWith("/store/projects/"),
  permission: "store.manage",
},
```

- [ ] **Step 4: Run the targeted contract and verify GREEN**

Run `npm run smoke:secondary-cms-admin`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add modulex-admin/src/layout/AppSidebar.tsx modulex-admin/src/lib/auth/permissions.ts
git commit -m "feat(admin): expose secondary CMS routes"
```

---

### Task 6: Full verification and roadmap closeout

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `modulex-store/STORE_ROADMAP.md`

**Interfaces:**
- Produces final Package B evidence and marks only Package B/Admin-management items complete; Package C public rendering remains open.

- [ ] **Step 1: Run targeted contract fresh**

```bash
cd modulex-admin
npm run smoke:secondary-cms-admin
```

Expected: PASS.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: exit 0; existing warning baseline may remain but no new errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Next.js build and TypeScript pass.

- [ ] **Step 4: Run full Admin smoke**

```bash
npm run smoke
```

Expected: all deterministic/API/DB/dealer/portal/auth/polling suites pass, including the new secondary CMS Admin contract. If CI lacks private smoke secrets, run the deterministic subset in CI and require the existing local full-smoke evidence plus a fresh local run before final acceptance.

- [ ] **Step 5: Review diff against plan/spec**

Confirm every acceptance criterion maps to code and no Store public rendering, Blog CMS, service-role credential, or video upload infrastructure slipped into scope.

- [ ] **Step 6: Update roadmaps with verified Package B state**

Store: mark `Add corresponding Admin CMS screens` `[x]` only after verification; keep About/Gallery public rendering `[ ]`; set Next Action to Package C.

Admin A4.1: mark secondary Pages/Projects CMS, draft/publish workflow, and SEO/OG/media management complete as applicable; retain navigation/footer Package D items open. Record lint/build/full-smoke evidence.

- [ ] **Step 7: Commit verification/roadmap closeout**

```bash
git add modulex-admin/ADMIN_ROADMAP.md modulex-store/STORE_ROADMAP.md
git commit -m "docs: close Phase 2.1B Admin CMS package"
```

- [ ] **Step 8: Create PR to `main`**

PR title:

```text
feat(admin): add Phase 2.1B secondary CMS management
```

PR body must include scope, explicit publish behavior, validation/upload constraints, RBAC/RLS boundary, targeted contract evidence, lint/build/smoke evidence, roadmap updates, and state that no merge/deploy/production DB change is performed automatically.
