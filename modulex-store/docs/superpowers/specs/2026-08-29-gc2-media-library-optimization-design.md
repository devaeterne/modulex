# GC-2 — Media Library & Optimization Pipeline Design

Date: 2026-08-29
Status: **DRAFT FOR WRITTEN-SPEC REVIEW**
Scope: `modulex-admin` + Supabase Database/Storage + migration tooling; `modulex-store` compatibility only
Parent architecture: `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`
Parent roadmap: `modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md`
Input manifest: `modulex-store/docs/granite-center/gc1-source-manifest.json`
Current implementation baseline: `f6d7f9673dc874b5c254e47c750ff1bd4793c7c3`

## 1. Purpose

GC-2 creates the reusable Oakwell media asset domain and the deterministic import/optimization path required to move approved Granite & Cabinet Center media into Oakwell-controlled infrastructure.

The target ownership flow is:

`GC-1 source manifest → GC-2 importer/optimizer → private review staging → Admin Media Library → approved public Storage asset → CMS/project association → Store published projection`

Granite Center and WordPress remain migration provenance only. They never become runtime image backends for Oakwell.

GC-2 is infrastructure and controlled-content tooling. It does not publish a Gallery project, create a Showroom page, or make a source asset public merely because the source file was downloaded successfully.

## 2. Current production baseline

The production Supabase project already has:

- a public `store-media` bucket;
- a 20 MB bucket file limit;
- allowed MIME types including JPEG, PNG, WebP and AVIF;
- Storage INSERT/UPDATE/DELETE policies limited to active `super_admin` / `admin` users;
- `store_projects` and `store_project_media` tables;
- `store_project_media.media_url` as the current production delivery reference;
- Admin Project Media upload behavior that writes directly to `store-media` and stores the resulting public URL;
- no current objects in `store-media` at the beginning of GC-2.

GC-2 extends this foundation. It must not introduce a parallel CMS or break the existing project/public RPC contract before GC-5 is ready to migrate project relationships.

## 3. Design goals

1. Create one reusable Oakwell media asset domain for pages, projects and future CMS surfaces.
2. Keep unapproved source files private during intake and review.
3. Publish only approved optimized derivatives to the existing public `store-media` bucket.
4. Preserve source provenance even when multiple source URLs deduplicate to one asset.
5. Compute verified byte-level metadata rather than carrying GC-1 `null` placeholders forward.
6. Strip unnecessary EXIF/GPS metadata and normalize orientation.
7. Resize conservatively with no upscaling and preserve cabinet/wood-grain fidelity.
8. Use exact SHA-256 for deterministic deduplication.
9. Treat perceptual similarity as a review hint, never an automatic destructive dedupe decision.
10. Make ordinary media lifecycle operations possible from Modulex Admin.
11. Keep Store anonymous reads behind existing/future narrow published projections rather than exposing the entire media library.
12. Make the importer repeatable and idempotent.

## 4. Non-goals

GC-2 does not:

- publish Granite content automatically;
- import every one of the 62 GC-1 media candidates without classification review;
- publish `hold`, `exclude`, or `business_confirmation_required` candidates;
- decide whether an unverified residential/commercial project is Oakwell work;
- create Gallery projects or close the Phase 2.1 Gallery acceptance blocker;
- migrate external video URLs into binary Storage;
- implement Showroom, FAQ, reviews, navigation or footer content;
- replace Next.js image rendering strategy;
- remove the current `store_project_media.media_url` compatibility field in this package;
- create a generic digital-asset-management platform beyond Store/CMS needs.

## 5. Chosen storage model

### 5.1 Private staging bucket

Create a private bucket named:

`store-media-staging`

It contains source originals and review-stage optimized derivatives that are not yet public.

Only authenticated active `super_admin` / `admin` users may read/write/delete these objects through normal application access. No anonymous SELECT policy or public URL path is permitted.

Suggested layout:

```text
imports/granite/<import-run-id>/<source-candidate-id>/original.<ext>
imports/granite/<import-run-id>/<source-candidate-id>/optimized.webp
```

The staging object path is operational metadata and must never be exposed through a public Store RPC.

### 5.2 Existing public bucket

Keep the existing public bucket:

`store-media`

Only approved/published derivatives are copied/uploaded here.

Published object paths are immutable and content-addressed enough to avoid browser/CDN stale-file replacement problems:

```text
media/<asset-id>/<optimized-sha256>.webp
```

If a future re-encode creates different bytes, it receives a different path. Do not overwrite a previously published public object in place as the normal update path.

### 5.3 Public bucket semantics

Because `store-media` is public, anyone who possesses a public object URL can retrieve that object. Therefore draft/review files cannot live there. Upload/update/delete remain policy-controlled, but read secrecy is not available for public objects.

Changing only a database status does not revoke a known public object URL. A true unpublish/withdraw operation therefore requires removing the public object after published-reference checks pass, then clearing its public locator state in the asset record. CDN invalidation is asynchronous, so acceptance should allow the documented Supabase propagation window after deletion.

## 6. Database model

### 6.1 `public.store_media_assets`

Create one reusable asset record per deduplicated source-byte asset.

Required fields:

- `id uuid primary key default gen_random_uuid()`
- `status text not null`
- `title text not null`
- `default_alt_text text`
- `caption text`
- `media_type text not null default 'image'`
- `original_filename text`
- `original_mime_type text`
- `original_width integer`
- `original_height integer`
- `original_bytes bigint`
- `original_sha256 text not null`
- `optimized_mime_type text`
- `optimized_width integer`
- `optimized_height integer`
- `optimized_bytes bigint`
- `optimized_sha256 text`
- `staging_bucket text`
- `staging_original_path text`
- `staging_optimized_path text`
- `public_bucket text`
- `public_path text`
- `publication_attribution text not null`
- `cabinet_relevance text not null`
- `review_notes text`
- `published_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid`
- `updated_by uuid`

Recommended status values:

- `draft`
- `review`
- `approved`
- `published`
- `rejected`

`default_alt_text` is a reusable editorial default, not a universal rendering requirement. Alt text is contextual: a page/project association may override it, and decorative use may intentionally render empty alt. Existing `store_project_media.alt_text` remains authoritative for current Project media until GC-5 defines the final relationship behavior.

`publication_attribution` is the reviewed publication/rights classification for the canonical asset. Raw source-brand identity belongs on source provenance rows because identical bytes may be discovered through multiple parent/source contexts.

Recommended publication attribution values should align with the approved migration vocabulary and distinguish at minimum:

- Oakwell-owned/current;
- Granite & Cabinet Center parent-attributed;
- unverified/hold.

The exact constraint names belong in the implementation migration, but invalid status/media-type/checksum shapes must be rejected by database constraints.

### 6.2 `public.store_media_asset_sources`

A separate many-to-one provenance table is required because multiple source URLs or GC-1 candidates may resolve to the same SHA-256 asset.

Required fields:

- `id uuid primary key default gen_random_uuid()`
- `media_asset_id uuid not null references store_media_assets(id) on delete cascade`
- `source_site text not null`
- `source_brand text`
- `source_candidate_id text`
- `source_url text not null`
- `source_page_url text`
- `source_page_id text`
- `source_label text`
- `migration_disposition text not null`
- `attribution_required boolean not null default false`
- `notes text`
- `discovered_at timestamptz`
- `created_at timestamptz not null default now()`

The unique contract should prevent the same source candidate/source URL from being registered repeatedly for the same asset while still allowing multiple distinct provenance records to point to one asset.

### 6.3 Exact checksum index

`store_media_assets.original_sha256` must have a unique index.

Importer behavior:

- checksum not found → create a new asset;
- checksum already exists → do not upload a second canonical original; attach/update the source provenance record against the existing asset;
- repeated importer run → converges without duplicate asset rows.

`optimized_sha256` should also be indexed for lookup/reporting, but exact source dedupe authority is the original SHA-256.

### 6.4 Public locator authority

The canonical delivery locator is `public_bucket` + `public_path`, not a persisted absolute public URL. Admin and future public query code generate the URL from the current Supabase project endpoint and controlled bucket/path.

This avoids storing redundant environment-specific URL text while still allowing GC-5 to populate/derive the legacy `media_url` field during compatibility migration.

### 6.5 Project compatibility

Add a nullable `media_asset_id uuid` foreign key to `store_project_media` only when the implementation package reaches the compatibility step and the implementation plan proves it is needed in GC-2 rather than GC-5.

During GC-2:

- existing `media_url` remains valid and required by the existing Store/public projection;
- existing external video behavior remains unchanged;
- new asset associations may coexist with `media_url`;
- public project RPC response shape must not break.

GC-5 owns the final project/media migration and may change how the public projection derives a URL from a published asset.

## 7. Data API and grants

Supabase changed new-table Data API exposure behavior in 2026. GC-2 migrations must not assume that creating a table in `public` automatically exposes it to PostgREST.

The implementation migration must explicitly define the required grants for Admin use and keep anonymous access absent.

Required access intent:

- `anon`: no direct `store_media_assets` or `store_media_asset_sources` table access;
- authenticated authorized Admin users: read according to RLS;
- mutation: active `super_admin` / `admin` only;
- `sales` does not gain media mutation rights merely because it can read existing Projects CMS data.

No generic public media-library RPC is created in GC-2. Future Store content RPCs should join/select only the approved media fields they need.

## 8. RLS and authorization

Enable RLS on both new public tables.

Policy intent:

- active `super_admin` / `admin`: SELECT/INSERT/UPDATE/DELETE;
- optional internal read for other Store CMS roles is deferred unless a real Admin workflow needs it;
- anonymous roles receive no table policies;
- Storage staging policies mirror `super_admin` / `admin` application read/mutation authority;
- public `store-media` upload/update/delete policies retain current Admin-only authority.

Admin UI route and mutation buttons must also require the existing Store management permission/role policy as defense in depth. UI visibility is not the authorization boundary.

## 9. Privileged migration tooling boundary

The batch importer is operational migration tooling, not browser code.

It may use a server-only Supabase secret credential in an explicit operator/CI environment because a batch import needs deterministic non-interactive writes. That credential must never be exposed to either Next.js client bundle.

Because privileged credentials can bypass normal RLS, the importer is intentionally constrained in code and tests:

- it may write source bytes only to `store-media-staging`;
- it creates/updates media assets only in non-published lifecycle states;
- it may never write to the public `store-media` bucket;
- it may never set status `published` or `published_at`;
- it does not mutate Store pages/projects for publication;
- public publish remains an explicit authenticated Admin action.

`created_by`/`updated_by` may be nullable for batch-system-created rows; provenance and import report identify the operational source/run.

## 10. Import candidate eligibility

The importer reads GC-1 `mediaCandidates` from:

`modulex-store/docs/granite-center/gc1-source-manifest.json`

Default processing rules:

- `adapt` → eligible for byte acquisition and review intake;
- `parent_attributed` → eligible for byte acquisition and review intake, attribution retained;
- `hold` → do not automatically download/import unless explicitly selected for investigation;
- `exclude` → never import by default;
- `business_confirmation_required` → do not import into publishable workflow until explicitly selected/approved.

Cabinet relevance remains a second filter. Countertop-only or irrelevant assets must not enter the normal Oakwell publish queue merely because they are technically downloadable.

Importer flags must permit a reviewer to target specific candidate IDs without changing the manifest.

## 11. Pipeline

The deterministic image pipeline is:

```text
manifest candidate
→ validate source URL and disposition
→ download source bytes
→ verify response/content type
→ compute original SHA-256
→ detect exact duplicate
→ inspect dimensions/orientation/metadata
→ auto-orient
→ strip EXIF/GPS/nonessential metadata
→ choose conservative maximum dimensions
→ resize only when source exceeds target; never upscale
→ encode optimized WebP
→ compute optimized SHA-256
→ write private staging objects
→ create/update asset + provenance records in draft/review state
→ reviewer edits title/default alt/caption/publication attribution/status in Admin
→ authenticated publish action reads approved staging derivative
→ publish action writes approved derivative to immutable public path
→ mark asset published
```

### 11.1 Tooling

Use Node.js 22+ and a pinned `sharp` version committed to the relevant package lockfile.

Do not rely on a global ImageMagick installation or undocumented runner binary.

`sharp` owns:

- orientation normalization;
- dimension inspection;
- resize;
- metadata removal behavior;
- WebP encoding.

Node built-ins own:

- SHA-256 hashing;
- URL validation;
- manifest parsing;
- filesystem/temp handling where needed.

### 11.2 Download rules

- HTTPS source URLs only for Granite imports unless a reviewed exception exists.
- Reject redirects to unrelated origins.
- Bound response size before/while buffering.
- Validate actual decoded image, not only filename extension.
- Record fetch failure without fabricating dimensions/hash metadata.
- Import errors are candidate-scoped; one bad source must not corrupt or partially publish the rest of the run.

### 11.3 Original retention

The private staging original is retained while an asset is in draft/review/approved state so operators can inspect provenance and reprocess if needed.

A later cleanup policy may remove rejected/stale staging originals after an explicit retention decision. GC-2 must not silently delete source evidence immediately after optimization.

## 12. Optimization policy

### 12.1 No upscaling

If a source image is smaller than the target envelope, preserve its intrinsic dimensions.

### 12.2 Target envelopes

Default engineering envelopes:

- hero/showroom candidates: long edge max ~2560 px;
- project/gallery candidates: long edge max ~1920 px;
- general CMS/card candidates: long edge max ~1600 px.

The importer should choose the envelope from candidate subject/proposed placement rather than one fixed global size.

### 12.3 Encoding

First implementation output format: WebP.

Starting quality range: 78–82 for cabinet/detail imagery, with a deterministic default selected by the implementation plan.

AVIF generation is deferred unless measurements show a clear benefit without excessive processing cost or quality loss. GC-2 should deliver one dependable optimized master before adding multiple derivative families.

### 12.4 Fidelity

Cabinet edge detail, wood grain, finish texture and hardware detail take priority over hitting an arbitrary byte threshold.

Byte targets are reporting/optimization goals, not hard failure limits when visual quality would be damaged.

## 13. EXIF, GPS and privacy

Published derivatives must not retain EXIF/GPS metadata unless a future explicitly approved use requires specific metadata.

The optimized derivative must be generated from decoded pixels after auto-orientation so that removing orientation metadata does not rotate the published result incorrectly.

Importer verification must assert that GPS/EXIF metadata is not carried into the published derivative.

## 14. Perceptual duplicate review

Exact SHA-256 dedupe is automatic.

Optional perceptual hashing may be implemented for review assistance, but:

- it does not delete assets;
- it does not automatically merge source records;
- it produces a `possible_duplicate` review signal only;
- the threshold must be documented and tested before use.

If adding a perceptual-hash dependency materially enlarges the package or weakens determinism, defer it. GC-2 is complete with exact SHA-256 dedupe plus a documented manual near-duplicate review path.

## 15. Admin Media Library

Add the Store CMS route:

`/store/media`

The screen must follow current Modulex Admin patterns and existing `store.manage` route enforcement.

### 15.1 List/search

Show at minimum:

- preview;
- title;
- status;
- dimensions;
- optimized bytes;
- MIME;
- publication attribution;
- source/provenance summary;
- updated time.

Filters:

- status;
- publication attribution;
- cabinet relevance;
- free-text title/source candidate search.

### 15.2 Detail/editor

Operators can edit:

- title;
- default alt text;
- caption;
- publication attribution where policy allows;
- cabinet relevance;
- review notes;
- lifecycle status through validated actions.

Display read-only verified metadata:

- original/optimized dimensions;
- original/optimized byte size;
- checksums;
- all source URL/page provenance rows;
- staging/public path state.

The UI must make it clear that default alt text may be overridden by a content association later.

### 15.3 Publish action

Publishing is explicit and should execute server-side in Admin using the authenticated user's session/authorization rather than shipping an elevated key to the browser.

Preconditions:

- status is `approved`;
- optimized derivative exists in private staging;
- required title/default-alt policy is satisfied for non-decorative assets;
- publication attribution/review classification is valid;
- public object path is not already owned by a conflicting asset.

Publish flow:

1. authenticated server action/route verifies the active user's Store-management authorization;
2. read approved optimized bytes from `store-media-staging`;
3. write bytes to `store-media/media/<asset-id>/<optimized-sha>.webp` using the user's authorized Storage context or another server-side mechanism that preserves equivalent authorization checks;
4. verify public object exists and metadata matches expected optimized bytes;
5. write `public_bucket`, `public_path`, `published_at`, status `published`;
6. if DB finalization fails, remove the newly created public object when safe or record a recoverable partial-publish state for retry;
7. repeated publish with matching bytes/path returns success/no-op.

No normal publish path may depend on a client-visible secret key.

### 15.4 Unpublish / withdraw

Unpublishing an asset referenced by currently published CMS content must fail closed until those references are removed/replaced.

When reference checks pass:

1. remove the public `store-media` object;
2. verify deletion request succeeded;
3. clear `public_bucket`, `public_path`, `published_at`;
4. move lifecycle back to `approved` or another explicit non-public state;
5. preserve the private staging derivative/original for review/republication unless a separate retention decision deletes them.

This is required because a public bucket URL remains retrievable even if only the DB status changes.

### 15.5 Hard delete

Hard delete is allowed only for unreferenced non-published assets.

Safe order:

- verify no content references;
- remove staging/public controlled objects that still exist;
- remove asset/provenance rows.

Published assets must first pass the explicit unpublish/withdraw flow.

## 16. Existing Project Media behavior

The current Project Media manager directly uploads user-selected images to `store-media` and stores `media_url`.

GC-2 transition policy:

- do not break existing project editing;
- add Media Library as the canonical migration/media-review surface;
- direct Project Media upload may remain temporarily for backward compatibility;
- do not expand the legacy direct-upload path for Granite imports;
- imported Granite images enter through Media Library only;
- GC-5 will migrate Project Media UX toward selecting/associating approved assets and will decide when the legacy direct-upload path can be removed.

This separation prevents GC-2 from combining media infrastructure work with Gallery content publication.

## 17. Public Store boundary

GC-2 does not expose the full media asset domain to Store.

Rules:

- no anonymous direct table access;
- no source URL, source page, checksum, review note or staging path reaches Store;
- no public listing endpoint for all media assets;
- existing Store Gallery/Project RPC behavior remains backward-compatible;
- later content RPCs may expose only the final public media URL or locator-derived URL, dimensions, contextual alt text and content-specific association needed by the published surface.

## 18. Import run reporting

Each importer execution must produce a deterministic report containing at minimum:

- candidate ID;
- source URL;
- result (`imported`, `deduped`, `skipped`, `failed`);
- original filename/MIME/dimensions/bytes/SHA-256 when verified;
- optimized dimensions/bytes/SHA-256 when generated;
- asset ID when registered;
- disposition/attribution summary;
- failure reason when applicable.

The report is operational evidence. It must not contain secrets or authorization tokens.

A machine-readable JSON report should be retained for GC-2 acceptance and GC-5 selection work.

## 19. Idempotency and recovery

The importer and publisher must be safe to rerun.

Required behaviors:

- same source bytes → same existing asset via original SHA-256;
- same candidate reprocessed → provenance upsert, not duplicate row;
- staging upload interrupted → retry does not create an unrelated asset;
- optimized asset already published → publish returns success/no-op when bytes/path match;
- partial public-object/DB state → repair path is explicit and tested;
- failures do not advance lifecycle status to published;
- unpublish retry handles an already-missing public object safely while still finalizing the DB state only after reference checks.

## 20. Migration packaging

GC-2 implementation should be delivered in ordered sub-packages if needed, but remain one architectural workstream:

### GC-2A — schema/security foundation

- media asset/source tables;
- staging bucket;
- grants/RLS/storage policies;
- compatibility FK only if justified by the implementation plan;
- database/security contract tests.

### GC-2B — importer/optimizer

- Node 22 + pinned `sharp` tooling;
- GC-1 manifest selection;
- byte verification;
- SHA-256 dedupe;
- metadata stripping/resize/WebP;
- staging upload;
- import report;
- idempotency tests.

### GC-2C — Admin Media Library

- `/store/media` route/nav/RBAC;
- list/filter/editor;
- provenance display;
- review lifecycle;
- explicit publish/unpublish/delete behavior;
- Admin smoke/contract tests.

### GC-2D — controlled production intake & closeout

- run importer only on approved eligible candidates;
- review representative files and optimization quality;
- publish only assets explicitly accepted for downstream use;
- verify no Granite/WordPress URL is used as production delivery;
- record before/after size report;
- synchronize Store/Admin/Granite roadmaps;
- leave Gallery `[~]` until GC-5 publishes real project content.

If implementation can safely fit in fewer PRs, these are logical checkpoints rather than mandatory PR boundaries.

## 21. Testing strategy

### 21.1 Database/security

Test at minimum:

- RLS enabled on both new tables;
- anon cannot select/insert/update/delete media library tables;
- unauthorized authenticated roles cannot mutate;
- `super_admin` / `admin` can perform intended operations;
- private staging object access is denied outside authorized Admin application users;
- public bucket mutation remains Admin-only;
- explicit grants match the current Supabase Data API exposure model;
- importer privilege cannot produce a published row/object through its normal command path.

### 21.2 Importer unit/contract tests

Fixtures should cover:

- valid JPEG/PNG/WebP source;
- oversized dimensions resized down;
- small source not upscaled;
- EXIF orientation normalized;
- metadata stripped;
- exact duplicate SHA-256 deduped;
- two distinct provenance rows attaching to the same checksum asset;
- invalid/non-image response rejected;
- over-size response rejected;
- excluded/hold candidate skipped by default;
- rerun idempotency;
- output WebP metadata and checksum deterministic enough for the pinned implementation environment.

### 21.3 Admin tests

Contract/smoke coverage for:

- route permission;
- list query and filtering;
- edit validation;
- publish preconditions;
- publish authorization remains server-side;
- unpublish/reference guard;
- unpublish removes public object/locator state;
- destructive delete restrictions;
- source provenance displayed without collapsing distinct source-brand contexts into one misleading asset-level value.

### 21.4 Builds/lint

Affected applications must pass:

- Admin lint;
- Admin production build;
- Store lint/build only if compatibility code or shared schema types touch Store runtime/build graph;
- all existing deterministic Admin/Store smoke chains relevant to modified surfaces;
- `git diff --check`.

### 21.5 Live production acceptance

Before GC-2 is marked `[x]`:

- production schema/RLS/policies verified;
- staging bucket verified private;
- public bucket verified to contain only intentionally published GC-2 assets;
- at least one representative approved image completes the full source → optimize → staging → Admin review → public publish lifecycle;
- public asset bytes/dimensions/MIME match DB metadata;
- no EXIF/GPS metadata remains in the published derivative;
- exact duplicate rerun is proven non-duplicating;
- multiple provenance rows on an exact duplicate do not create a second asset;
- Admin Media Library operates without manual SQL;
- a test unpublish/withdraw proves the public object is removed after reference checks;
- downstream Store behavior remains unaffected until content packages deliberately consume the assets.

## 22. Rollback strategy

Schema additions are additive.

If Admin UI/import tooling must be rolled back:

- existing `store_project_media.media_url` continues to support current Store rendering;
- new media asset tables can remain unused without changing Store public output;
- private staging files are not public exposure;
- published GC-2 assets can remain inert only when they remain approved for public access; an asset that must be withdrawn is removed through the unpublish flow;
- migration rollback must not delete a public asset that has subsequently become referenced by published content.

## 23. Security notes

- no service-role/secret key in browser code;
- migration credentials are server/CI/operator environment only;
- privileged importer cannot publish through its supported command path;
- source download URL is treated as untrusted input and validated;
- filenames never determine authorization or lifecycle state;
- checksums are integrity/dedupe metadata, not authorization tokens;
- public locators exist only after explicit publish;
- staging path/source provenance stays internal;
- DB and Storage authorization remain independent from Admin UI visibility.

## 24. Acceptance criteria

GC-2 is complete when:

1. reusable `store_media_assets` + source provenance domain exists in production;
2. draft/review originals and derivatives are private;
3. approved derivatives publish to immutable Oakwell-controlled `store-media` paths;
4. Admin can review/edit/publish/unpublish media without manual SQL;
5. verified dimensions, bytes, MIME and checksums replace GC-1 unknown byte metadata for imported candidates;
6. exact duplicates do not create duplicate assets and may retain multiple provenance rows;
7. published derivatives are auto-oriented, no-upscale, optimized WebP and stripped of unnecessary EXIF/GPS;
8. import/publish/unpublish operations are idempotent and recoverable;
9. no Granite Center URL becomes a production delivery URL;
10. anonymous Store users cannot enumerate internal media-library/source metadata;
11. contextual alt text remains possible at content-association level;
12. existing Project/Gallery compatibility is preserved;
13. roadmaps record GC-2 evidence and GC-3/GC-5 sequencing correctly.

## 25. Design decision summary

Use **private staging + approved public publishing** on top of the existing Supabase Storage foundation.

Create a reusable database-backed media library with one asset record per exact source checksum and separate many-to-one provenance records. Process eligible GC-1 candidates through a deterministic Node 22 + pinned `sharp` pipeline, keep draft/review bytes private, and publish only approved optimized derivatives to immutable paths in the existing public `store-media` bucket.

Keep source-brand provenance on source records, treat asset alt text as an editorial default rather than a universal rendering value, derive public URLs from controlled bucket/path, and remove public objects on true unpublish after reference checks.

Do not expose a generic public media API in GC-2, do not break `store_project_media.media_url`, and do not use GC-2 to prematurely publish Gallery/Project content. GC-5 owns the project/content association and final Gallery acceptance.