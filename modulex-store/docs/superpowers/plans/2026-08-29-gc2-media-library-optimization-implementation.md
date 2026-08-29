# GC-2 Media Library & Optimization Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable Oakwell media asset domain, private review staging, deterministic Granite image importer/optimizer, Admin Media Library, and controlled publish/unpublish lifecycle without breaking the existing Store project-media URL contract.

**Architecture:** Extend the existing Modulex Store CMS and Supabase Storage foundation. Source bytes enter private `store-media-staging`, are deduplicated by original SHA-256, normalized and optimized to WebP with pinned `sharp@0.35.4`, reviewed in Modulex Admin, and only then copied to immutable paths in public `store-media`. GC-2 does not migrate project relationships or expose a generic public media API; `store_project_media.media_url` remains unchanged until GC-5.

**Tech Stack:** PostgreSQL/Supabase RLS + Storage, Next.js 16.1.6 Admin app, React 19.2, `@supabase/supabase-js`, Node.js 22+, `sharp@0.35.4`, Node built-ins (`crypto`, `fs`, `path`, `url`, `assert`).

**Spec:** `modulex-store/docs/superpowers/specs/2026-08-29-gc2-media-library-optimization-design.md`

## Global Constraints

- Refresh latest `main`, `modulex-store/STORE_ROADMAP.md`, and `modulex-admin/ADMIN_ROADMAP.md` before every implementation package.
- Granite Center/WordPress URLs are provenance only and never production delivery URLs.
- Existing public bucket `store-media` remains public; draft/review bytes never go there.
- Create private bucket `store-media-staging` with 20 MB max size and MIME allowlist `image/jpeg,image/png,image/webp,image/avif`.
- Only active `super_admin` / `admin` may read/write/delete staging objects or mutate media-library records.
- `anon` gets no direct media-library table access and no generic media-library RPC.
- Exact dedupe authority is original source SHA-256. Near-duplicate detection is review-only and may be deferred.
- Pipeline order: validate URL → bounded download → decode → original SHA-256 → auto-orient → strip metadata → no-upscale resize → WebP quality 80 → optimized SHA-256 → private staging.
- Long-edge envelopes: showroom/hero 2560, project/gallery 1920, general CMS/card 1600; never upscale.
- Batch importer cannot publish. Public publish/unpublish is an explicit authenticated Admin server action.
- True unpublish removes the public object after reference checks; changing DB status alone is insufficient for a public bucket.
- Do not add `store_project_media.media_asset_id` in GC-2. GC-5 owns project/media relationship migration.
- Do not change `store_project_media.media_url`, its public RPC shape, or external video behavior.
- Every implementation package follows RED → GREEN TDD and fresh verification before completion claims.

---

## File Map

### GC-2A — schema/security

- Create `modulex-store/supabase/migrations/20260829150000_store_media_library.sql`.
- Create `modulex-store/scripts/gc2-media-schema-contract.mjs`.
- Modify `modulex-store/package.json`.
- Update Store/Admin roadmaps after production verification.

### GC-2B — importer/optimizer

- Create `modulex-store/scripts/gc2-media/lib/types.mjs`.
- Create `modulex-store/scripts/gc2-media/lib/select-candidates.mjs`.
- Create `modulex-store/scripts/gc2-media/lib/download-source.mjs`.
- Create `modulex-store/scripts/gc2-media/lib/image-pipeline.mjs`.
- Create `modulex-store/scripts/gc2-media/lib/supabase-writer.mjs`.
- Create `modulex-store/scripts/gc2-media/import.mjs`.
- Create `modulex-store/scripts/gc2-media/contract.mjs`.
- Modify `modulex-store/package.json` and `modulex-store/package-lock.json`.

### GC-2C — Admin Media Library

- Create `modulex-admin/src/lib/store/mediaLibrary.ts`.
- Create `modulex-admin/src/lib/store/mediaApi.ts`.
- Create `modulex-admin/src/app/(admin)/store/media/page.tsx`.
- Create `modulex-admin/src/components/store/StoreMediaLibraryManager.tsx`.
- Create `modulex-admin/src/components/store/StoreMediaAssetEditor.tsx`.
- Create `modulex-admin/src/app/api/admin/store-media/route.ts`.
- Create `modulex-admin/scripts/media-library-admin-contract.mjs`.
- Modify `modulex-admin/src/layout/AppSidebar.tsx`.
- Modify `modulex-admin/src/lib/auth/permissions.ts`.
- Modify `modulex-admin/package.json`.

### GC-2D — production intake/closeout

- Create `modulex-store/docs/granite-center/gc2-media-import-report.json`.
- Create `modulex-store/docs/granite-center/GC2_MEDIA_ACCEPTANCE.md`.
- Update Granite/Store/Admin roadmaps.

---

### Task 1: GC-2A RED schema contract

**Files:**
- Create: `modulex-store/scripts/gc2-media-schema-contract.mjs`
- Modify: `modulex-store/package.json`

**Produces:** `npm run smoke:gc2-media-schema`.

- [ ] **Step 1: Write the failing contract**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = path.join(here, "../supabase/migrations/20260829150000_store_media_library.sql");
const sql = readFileSync(migration, "utf8").toLowerCase();

for (const token of [
  "create table if not exists public.store_media_assets",
  "create table if not exists public.store_media_asset_sources",
  "store-media-staging",
  "original_sha256",
  "optimized_sha256",
  "staging_original_path",
  "staging_optimized_path",
  "public_bucket",
  "public_path",
  "default_alt_text",
  "source_candidate_id",
  "source_url",
  "alter table public.store_media_assets enable row level security",
  "alter table public.store_media_asset_sources enable row level security",
  "store_media_staging_admin_select",
  "store_media_staging_admin_insert",
  "store_media_staging_admin_update",
  "store_media_staging_admin_delete",
]) assert.ok(sql.includes(token), `missing ${token}`);

assert.ok(!sql.includes("grant select on public.store_media_assets to anon"));
assert.ok(!sql.includes("grant select on public.store_media_asset_sources to anon"));
assert.ok(!sql.includes("media_asset_id uuid references public.store_media_assets"));
assert.ok(!sql.includes("get_store_public_media"));
console.log("GC-2 media schema contract: PASS");
```

- [ ] **Step 2: Add script**

```json
"smoke:gc2-media-schema": "node scripts/gc2-media-schema-contract.mjs"
```

- [ ] **Step 3: Run RED**

```bash
cd modulex-store
npm run smoke:gc2-media-schema
```

Expected: FAIL because migration file is absent.

- [ ] **Step 4: Commit**

```bash
git add modulex-store/scripts/gc2-media-schema-contract.mjs modulex-store/package.json
git commit -m "test(store): define GC-2 media schema contract"
```

---

### Task 2: GC-2A schema, staging bucket, grants and RLS

**Files:**
- Create: `modulex-store/supabase/migrations/20260829150000_store_media_library.sql`

**Produces:** reusable media domain and private staging foundation.

- [ ] **Step 1: Create `store_media_assets`**

Use these exact lifecycle/value domains:

```sql
create table if not exists public.store_media_assets (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  title text not null,
  default_alt_text text,
  caption text,
  media_type text not null default 'image',
  original_filename text,
  original_mime_type text not null,
  original_width integer not null,
  original_height integer not null,
  original_bytes bigint not null,
  original_sha256 text not null,
  optimized_mime_type text,
  optimized_width integer,
  optimized_height integer,
  optimized_bytes bigint,
  optimized_sha256 text,
  staging_bucket text not null default 'store-media-staging',
  staging_original_path text,
  staging_optimized_path text,
  public_bucket text,
  public_path text,
  attribution_classification text not null default 'unverified_hold',
  cabinet_relevance text not null default 'unreviewed',
  review_notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint store_media_assets_status_check check (status in ('draft','review','approved','published','rejected')),
  constraint store_media_assets_media_type_check check (media_type = 'image'),
  constraint store_media_assets_original_mime_check check (original_mime_type in ('image/jpeg','image/png','image/webp','image/avif')),
  constraint store_media_assets_optimized_mime_check check (optimized_mime_type is null or optimized_mime_type = 'image/webp'),
  constraint store_media_assets_original_dimensions_check check (original_width > 0 and original_height > 0),
  constraint store_media_assets_original_bytes_check check (original_bytes > 0 and original_bytes <= 20971520),
  constraint store_media_assets_original_sha_check check (original_sha256 ~ '^[0-9a-f]{64}$'),
  constraint store_media_assets_attribution_check check (attribution_classification in ('oakwell_owned','parent_attributed','unverified_hold')),
  constraint store_media_assets_relevance_check check (cabinet_relevance in ('unreviewed','relevant','mixed','irrelevant')),
  constraint store_media_assets_public_state_check check (
    (status = 'published' and public_bucket = 'store-media' and nullif(btrim(public_path), '') is not null and published_at is not null)
    or
    (status <> 'published' and public_bucket is null and public_path is null and published_at is null)
  )
);

create unique index if not exists ux_store_media_assets_original_sha256 on public.store_media_assets(original_sha256);
create index if not exists idx_store_media_assets_status_updated on public.store_media_assets(status, updated_at desc, id);
create index if not exists idx_store_media_assets_optimized_sha256 on public.store_media_assets(optimized_sha256) where optimized_sha256 is not null;
```

- [ ] **Step 2: Create provenance table**

```sql
create table if not exists public.store_media_asset_sources (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references public.store_media_assets(id) on delete cascade,
  source_site text not null,
  source_candidate_id text,
  source_url text not null,
  source_page_url text,
  source_page_id text,
  source_label text,
  source_brand text,
  migration_disposition text not null,
  attribution_required boolean not null default false,
  notes text,
  discovered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint store_media_sources_url_check check (source_url ~* '^https://'),
  constraint store_media_sources_disposition_check check (migration_disposition in ('adapt','parent_attributed','hold','exclude','business_confirmation_required'))
);

create unique index if not exists ux_store_media_sources_candidate
  on public.store_media_asset_sources(media_asset_id, source_candidate_id)
  where source_candidate_id is not null;
create unique index if not exists ux_store_media_sources_url
  on public.store_media_asset_sources(media_asset_id, source_url);
```

- [ ] **Step 3: Add timestamps, grants and RLS**

Use existing `private.touch_store_updated_at()` for `store_media_assets`. Enable RLS on both tables. Revoke from `anon`. Explicitly grant table CRUD to `authenticated`, then constrain it with RLS so only active `super_admin/admin` pass. Do not grant `sales` access.

Policy predicate:

```sql
exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and p.role in ('super_admin','admin')
)
```

- [ ] **Step 4: Create private staging bucket idempotently**

```sql
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'store-media-staging',
  'store-media-staging',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 5: Add four staging Storage policies**

Create `store_media_staging_admin_select`, `store_media_staging_admin_insert`, `store_media_staging_admin_update`, and `store_media_staging_admin_delete`. Every policy requires `bucket_id = 'store-media-staging'` plus the same active Admin predicate.

- [ ] **Step 6: Run GREEN**

```bash
cd modulex-store
npm run smoke:gc2-media-schema
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add modulex-store/supabase/migrations/20260829150000_store_media_library.sql
git commit -m "feat(store): add GC-2 media library schema"
```

---

### Task 3: GC-2A production apply and verification

**Files:**
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

- [ ] **Step 1: Apply migration**

Use Supabase migration tooling on project `bzjoeernnmvuhzyvbowc` with migration name `store_media_library`. Do not use raw DDL execution when migration tooling is available.

- [ ] **Step 2: Verify RLS and policies**

```sql
select relname, relrowsecurity
from pg_class
where relname in ('store_media_assets','store_media_asset_sources');

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where tablename in ('store_media_assets','store_media_asset_sources')
order by tablename, policyname;
```

Expected: RLS enabled, no anon policy, Admin-only effective access.

- [ ] **Step 3: Verify buckets**

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('store-media','store-media-staging')
order by id;
```

Expected: `store-media` still public; `store-media-staging` private with 20 MB image-only limits.

- [ ] **Step 4: Verify migration created no objects**

```sql
select bucket_id, count(*)
from storage.objects
where bucket_id in ('store-media','store-media-staging')
group by bucket_id;
```

- [ ] **Step 5: Update both roadmaps**

Record GC-2 `[~]`, GC-2A `[x]`, production evidence, and next `GC-2B — importer/optimizer`. Preserve Gallery/Projects `[~]`.

- [ ] **Step 6: Commit roadmap evidence**

```bash
git add modulex-store/STORE_ROADMAP.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: record GC-2A production verification"
```

---

### Task 4: GC-2B RED importer contract and candidate selection

**Files:**
- Create: `modulex-store/scripts/gc2-media/lib/types.mjs`
- Create: `modulex-store/scripts/gc2-media/lib/select-candidates.mjs`
- Create: `modulex-store/scripts/gc2-media/contract.mjs`
- Modify: `modulex-store/package.json`

- [ ] **Step 1: Define constants**

```js
export const ELIGIBLE_ACTIONS = new Set(["adapt", "parent_attributed"]);
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const OPTIMIZED_WEBP_QUALITY = 80;
export const TARGET_LONG_EDGE = Object.freeze({ showroom: 2560, project: 1920, general: 1600 });
```

- [ ] **Step 2: Implement selection**

Export:

```js
export function selectCandidates(manifest, { candidateIds = [], includeHold = false } = {})
```

Rules: default only `adapt`/`parent_attributed`; `exclude` and `business_confirmation_required` never default; `hold` requires explicit candidate ID and `includeHold:true`; unknown or duplicate requested IDs throw; preserve manifest order.

Export:

```js
export function classifyTargetLongEdge(candidate) {
  if (candidate.subject === "showroom") return 2560;
  if (["kitchen", "bathroom_vanity", "commercial_project", "project"].includes(candidate.subject)) return 1920;
  return 1600;
}
```

- [ ] **Step 3: Write contract**

Use real `gc1-source-manifest.json`; assert default selection includes `media-showroom-01`. Then dynamically import the future `image-pipeline.mjs` so RED ends on module-not-found.

- [ ] **Step 4: Add scripts**

```json
"smoke:gc2-media-importer": "node scripts/gc2-media/contract.mjs",
"gc2:media:import": "node scripts/gc2-media/import.mjs"
```

- [ ] **Step 5: Run RED and commit**

```bash
cd modulex-store
npm run smoke:gc2-media-importer
git add modulex-store/scripts/gc2-media modulex-store/package.json
git commit -m "test(store): define GC-2 media importer contract"
```

Expected: selection assertions pass, then missing image pipeline fails.

---

### Task 5: GC-2B source download and image pipeline

**Files:**
- Create: `modulex-store/scripts/gc2-media/lib/download-source.mjs`
- Create: `modulex-store/scripts/gc2-media/lib/image-pipeline.mjs`
- Modify: `modulex-store/scripts/gc2-media/contract.mjs`
- Modify: `modulex-store/package.json`
- Modify: `modulex-store/package-lock.json`

- [ ] **Step 1: Pin image dependency**

```bash
cd modulex-store
npm install --save-exact sharp@0.35.4
npm ls sharp
```

Expected installed version: `sharp@0.35.4`.

- [ ] **Step 2: Implement bounded downloader**

`downloadSource(url)` accepts HTTPS only, initial/redirect hosts only `granitecenterva.com` or `www.granitecenterva.com`, follows at most 5 redirects manually, rejects declared or actual payloads over 20 MB, requires HTTP 2xx, and returns `{ bytes, finalUrl, contentType, filename }`.

- [ ] **Step 3: Implement image pipeline**

```js
import crypto from "node:crypto";
import sharp from "sharp";
import { MAX_SOURCE_BYTES, OPTIMIZED_WEBP_QUALITY } from "./types.mjs";

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function processImage({ bytes, targetLongEdge }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
    throw new Error("Source image bytes are invalid or exceed 20 MB.");
  }
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error("Unable to verify image metadata.");

  let pipeline = sharp(bytes, { failOn: "error" }).rotate();
  if (Math.max(metadata.width, metadata.height) > targetLongEdge) {
    pipeline = pipeline.resize({ width: targetLongEdge, height: targetLongEdge, fit: "inside", withoutEnlargement: true });
  }
  const optimizedBytes = await pipeline.webp({ quality: OPTIMIZED_WEBP_QUALITY, smartSubsample: true }).toBuffer();
  const output = await sharp(optimizedBytes).metadata();

  return {
    original: { sha256: sha256(bytes), bytes: bytes.length, width: metadata.width, height: metadata.height, format: metadata.format },
    optimized: { sha256: sha256(optimizedBytes), bytes: optimizedBytes.length, width: output.width, height: output.height, mimeType: "image/webp" },
    optimizedBytes,
  };
}
```

Do not call `keepMetadata()`.

- [ ] **Step 4: Expand generated-fixture tests**

Generate fixtures in memory with `sharp({ create: ... })`. Assert: 3000×2000 → long edge 1920; 800×600 stays 800×600; output WebP; SHA is 64 lowercase hex; exact duplicate hash matches; output EXIF absent; text buffer rejects; >20 MB buffer rejects before decode.

- [ ] **Step 5: Run GREEN and commit**

```bash
cd modulex-store
npm run smoke:gc2-media-importer
git add package.json package-lock.json scripts/gc2-media
git commit -m "feat(store): add GC-2 image optimization pipeline"
```

---

### Task 6: GC-2B private staging writer and CLI

**Files:**
- Create: `modulex-store/scripts/gc2-media/lib/supabase-writer.mjs`
- Create: `modulex-store/scripts/gc2-media/import.mjs`
- Modify: `modulex-store/scripts/gc2-media/contract.mjs`

- [ ] **Step 1: Define credential gate**

Require `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`; allow `SUPABASE_SERVICE_ROLE_KEY` only as legacy fallback. Missing credentials fail before network download.

- [ ] **Step 2: Implement idempotent registration**

Export:

```js
export async function registerStagedAsset(client, input)
```

Algorithm: select by `original_sha256`; existing hash → upsert provenance and return `deduped` without upload. New hash → create UUID, upload exactly two private objects under `imports/granite/{runId}/{candidateId}/original.{extension}` and `optimized.webp`, insert asset in `review`, insert provenance. On DB failure, remove only objects created by this attempt. Never write public locator fields or status `approved/published`.

- [ ] **Step 3: Implement CLI**

Supported flags:

```text
--candidate media-showroom-01
--include-hold
--report docs/granite-center/gc2-media-import-report.json
--dry-run
```

`--candidate` is repeatable. Any `--publish` argument must exit non-zero with `GC-2 importer cannot publish media.`

- [ ] **Step 4: Add fake-client idempotency tests**

Assert existing SHA performs zero uploads; new SHA performs two staging uploads + one asset insert + provenance insert; status is `review`; no public locator/status published; argv parser rejects `--publish`.

- [ ] **Step 5: Run and commit**

```bash
cd modulex-store
npm run smoke:gc2-media-schema
npm run smoke:gc2-media-importer
git diff --check
git add scripts/gc2-media
git commit -m "feat(store): add GC-2 staged media importer"
```

---

### Task 7: GC-2C RED Admin contract

**Files:**
- Create: `modulex-admin/scripts/media-library-admin-contract.mjs`
- Modify: `modulex-admin/package.json`

- [ ] **Step 1: Write static contract**

Require: Sidebar `Media Library` at `/store/media` with `store.manage`; permissions route guard for `/store/media`; page renders `StoreMediaLibraryManager`; API imports `requireAdmin` and `supabaseAdmin`; lifecycle actions `publish/unpublish/delete`; public path starts `media/`; no browser component imports `server-admin`; domain stores bucket/path rather than canonical absolute public URL.

- [ ] **Step 2: Add script**

```json
"smoke:media-library-admin": "node scripts/media-library-admin-contract.mjs"
```

- [ ] **Step 3: Run RED and commit**

```bash
cd modulex-admin
npm run smoke:media-library-admin
git add scripts/media-library-admin-contract.mjs package.json
git commit -m "test(admin): define GC-2 Media Library contract"
```

Expected: missing route/nav assertions fail.

---

### Task 8: GC-2C Admin list/editor and RBAC

**Files:**
- Create: `modulex-admin/src/lib/store/mediaLibrary.ts`
- Create: `modulex-admin/src/app/(admin)/store/media/page.tsx`
- Create: `modulex-admin/src/components/store/StoreMediaLibraryManager.tsx`
- Create: `modulex-admin/src/components/store/StoreMediaAssetEditor.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/src/lib/auth/permissions.ts`

- [ ] **Step 1: Define exact types**

```ts
export type StoreMediaStatus = "draft" | "review" | "approved" | "published" | "rejected";
export type StoreMediaAttribution = "oakwell_owned" | "parent_attributed" | "unverified_hold";
export type StoreMediaCabinetRelevance = "unreviewed" | "relevant" | "mixed" | "irrelevant";
```

`validateMediaReviewUpdate()` requires trimmed title; approved state requires default alt, non-hold attribution, and relevance `relevant|mixed`; published cannot be set from browser editor.

- [ ] **Step 2: Add route/nav/RBAC**

Page title `Store Media Library | Modulex Admin`. Add Sidebar item `Media Library`. Add `/store/media` and descendants to the existing `store.manage` rule before broad `/store` rule.

- [ ] **Step 3: Implement manager**

Load `store_media_assets` ordered `updated_at desc,id`; selected asset loads provenance rows; filters status/attribution/relevance/free-text. Only published assets may use derived public preview URL. Private staging is not exposed as a browser public URL.

- [ ] **Step 4: Implement editor**

Editable: title, default alt, caption, attribution, relevance, review notes, lifecycle limited to `draft|review|approved|rejected`. Read-only: verified sizes/dimensions/checksums, staging/public paths and provenance.

- [ ] **Step 5: Run targeted contract**

```bash
cd modulex-admin
npm run smoke:media-library-admin
```

Expected: UI/nav checks pass; API lifecycle checks remain RED.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(admin)'/store/media src/components/store/StoreMediaLibraryManager.tsx src/components/store/StoreMediaAssetEditor.tsx src/lib/store/mediaLibrary.ts src/layout/AppSidebar.tsx src/lib/auth/permissions.ts
git commit -m "feat(admin): add GC-2 Media Library review UI"
```

---

### Task 9: GC-2C publish/unpublish/delete API

**Files:**
- Create: `modulex-admin/src/lib/store/mediaApi.ts`
- Create: `modulex-admin/src/app/api/admin/store-media/route.ts`
- Modify: `modulex-admin/src/components/store/StoreMediaAssetEditor.tsx`
- Modify: `modulex-admin/package.json`

- [ ] **Step 1: Browser helper**

Use browser Supabase session access token and send bearer auth to `/api/admin/store-media`. PATCH body is `{ asset_id, action }` with action `publish|unpublish`; DELETE query is `asset_id`.

- [ ] **Step 2: Server authorization and publish preconditions**

Use `requireAdmin(request)` + `supabaseAdmin`. Publish only status `approved`; require title/default alt, attribution not `unverified_hold`, relevance `relevant|mixed`, optimized staging path/hash/bytes/dimensions present.

Public path:

```ts
const publicPath = `media/${asset.id}/${asset.optimized_sha256}.webp`;
```

- [ ] **Step 3: Idempotent publish**

Download private optimized bytes, verify length and SHA, upload to `store-media` with `image/webp`, immutable cache control and `upsert:false`, then update DB status/public bucket/path/published timestamp. If DB finalization fails after a newly-created object, best-effort remove that object. Existing matching published state is success/no-op.

- [ ] **Step 4: True unpublish with reference guard**

Before removal, search current URL references in `store_pages.hero_image_url`, `store_pages.og_image_url`, `store_projects.cover_image_url`, `store_projects.og_image_url`, `store_project_media.media_url`, and current `store_site_settings` image URL fields. If any reference exists, return 409. Otherwise remove public object then clear public locator and set status `approved`.

- [ ] **Step 5: Conservative hard delete**

Only non-published, unreferenced assets can be deleted. Remove private staging objects first, then delete DB row; sources cascade. Published asset must be unpublished first.

- [ ] **Step 6: Wire buttons**

`approved` shows Publish; `published` shows Unpublish; non-published shows Delete with confirmation. Draft/review/rejected never show Publish.

- [ ] **Step 7: Run GREEN and full Admin verification**

```bash
cd modulex-admin
npm run smoke:media-library-admin
npm run smoke:runtime-config
npm run smoke:rbac
npm run smoke:production-surface
npm run smoke:secondary-cms-admin
npm run lint
npm run build
git diff --check
```

Then add `smoke:media-library-admin` to the main Admin `smoke` chain after `smoke:secondary-cms-admin`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/store-media src/lib/store/mediaApi.ts src/components/store/StoreMediaAssetEditor.tsx scripts/media-library-admin-contract.mjs package.json
git commit -m "feat(admin): add GC-2 media publish lifecycle"
```

---

### Task 10: Package verification and review gates

- [ ] **Step 1: Refresh parallel work before each PR**

Re-read current main and both roadmaps. Reconcile parallel changes rather than overwriting them.

- [ ] **Step 2: Verify Store package**

```bash
cd modulex-store
npm ci
npm run smoke:gc1-source-manifest
npm run smoke:gc2-media-schema
npm run smoke:gc2-media-importer
npm run lint
npm run build
git diff --check
```

- [ ] **Step 3: Verify Admin package**

```bash
cd modulex-admin
npm ci
npm run smoke:media-library-admin
npm run smoke:runtime-config
npm run smoke:rbac
npm run smoke:production-surface
npm run smoke:secondary-cms-admin
npm run lint
npm run build
git diff --check
```

- [ ] **Step 4: PR boundaries**

Use four review gates: GC-2A schema/security, GC-2B importer/optimizer, GC-2C Admin Media Library, GC-2D production intake/closeout. Each PR states exact base/head SHA, verification evidence, production mutation scope, and exclusions.

---

### Task 11: GC-2D representative dry-run

**Candidate:** `media-showroom-01` from `https://granitecenterva.com/wp-content/uploads/2016/11/Showroom1.jpg`.

- [ ] **Step 1: Dry-run**

```bash
cd modulex-store
npm run gc2:media:import -- --candidate media-showroom-01 --dry-run --report docs/granite-center/gc2-media-import-report.json
```

Report must contain verified original/optimized MIME, dimensions, bytes and SHA-256 or a truthful failure reason; dry-run performs no Supabase writes.

- [ ] **Step 2: Visual quality review**

Inspect source vs optimized output. Keep quality 80 unless measured visual review shows cabinet/wood-grain degradation; any encoder change requires spec/plan update before implementation change.

- [ ] **Step 3: Verify no Storage mutation**

Read-only production query confirms dry-run created no objects.

---

### Task 12: GC-2D controlled production intake and Admin lifecycle

- [ ] **Step 1: Import one candidate**

```bash
cd modulex-store
npm run gc2:media:import -- --candidate media-showroom-01 --report docs/granite-center/gc2-media-import-report.json
```

Expected: one review asset, provenance row, original + optimized objects only in private staging, no public object.

- [ ] **Step 2: Verify staging privacy**

Unauthenticated public retrieval fails; authorized Admin Storage access succeeds.

- [ ] **Step 3: Review in `/store/media`**

Set truthful title/default alt, confirm `parent_attributed`, set relevance only after visual review, move `review → approved`.

- [ ] **Step 4: Publish in Admin**

Expected public object path `store-media/media/{asset UUID}/{optimized SHA-256}.webp`, DB status published, exact bytes/hash matching verified metadata.

- [ ] **Step 5: Verify public object**

Download and assert MIME `image/webp`, byte count/dimensions/hash equal DB, and no EXIF/GPS metadata.

- [ ] **Step 6: Prove dedupe idempotency**

Re-run same import. Expected result `deduped`, same asset ID, no second asset or canonical original, no change to public state.

- [ ] **Step 7: Prove unpublish/re-publish**

Before any Store content reference exists: unpublish → verify public object absent and DB approved/locator null → publish again → verify same hash path and bytes restored.

- [ ] **Step 8: Write acceptance evidence**

Create `GC2_MEDIA_ACCEPTANCE.md` with actual candidate/source, original and optimized MIME/dimensions/bytes/SHA, measured percentage byte change, staging privacy result, asset ID, final public bucket/path, lifecycle steps, dedupe result, unpublish/re-publish result, and explicit note that no Gallery/project association was created.

---

### Task 13: GC-2 closeout

**Files:**
- Modify: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`
- Modify: `modulex-store/STORE_ROADMAP.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Create/Update: `modulex-store/docs/granite-center/GC2_MEDIA_ACCEPTANCE.md`
- Create/Update: `modulex-store/docs/granite-center/gc2-media-import-report.json`

- [ ] **Step 1: Production read-only checks**

Confirm RLS, private staging, public published bucket, no anon table enumeration, no Granite production delivery URL, unchanged `store_project_media` public contract, and Gallery still blocked unless independently accepted project content exists.

- [ ] **Step 2: Fresh final verification**

Run all commands from Task 10 on exact final code SHAs.

- [ ] **Step 3: Synchronize roadmaps**

Mark GC-2 `[x]` only with live evidence. Keep Gallery/Projects `[~]` for GC-5. Set GC-3 as next Granite package. Preserve whatever primary Admin phase latest parallel work establishes.

- [ ] **Step 4: Commit closeout**

```bash
git add modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md modulex-store/STORE_ROADMAP.md modulex-admin/ADMIN_ROADMAP.md modulex-store/docs/granite-center/GC2_MEDIA_ACCEPTANCE.md modulex-store/docs/granite-center/gc2-media-import-report.json
git commit -m "docs: close GC-2 media migration pipeline"
```

---

## Self-Review

### Spec coverage

- Private staging/public publish: Tasks 2, 6, 9, 12.
- Reusable asset + many-to-one provenance: Tasks 2, 6.
- Exact SHA dedupe/idempotency: Tasks 5, 6, 12.
- Metadata stripping/orientation/no-upscale/WebP: Task 5.
- Admin list/filter/editor: Task 8.
- Explicit publish/unpublish/delete: Task 9.
- Anonymous boundary: Tasks 2, 3, 13.
- Existing project-media compatibility: Global Constraints + Task 13.
- Measured acceptance/reporting: Tasks 11–13.

### Deliberate deferrals

- Project `media_asset_id` / Media Library picker: GC-5.
- Generic public media RPC: not created.
- AVIF derivative family: deferred until measured benefit.
- Automatic perceptual hash dependency: deferred; exact SHA-256 plus manual near-duplicate review satisfies GC-2.
- Showroom page publication: GC-3/content package.

### Interface consistency

- Status values: `draft|review|approved|published|rejected`.
- Attribution values: `oakwell_owned|parent_attributed|unverified_hold`.
- Relevance values: `unreviewed|relevant|mixed|irrelevant`.
- Canonical public locator: `public_bucket + public_path`; absolute URL is derived.
- Importer never publishes.
- Admin API is the only GC-2 path from private staging to public `store-media`.
