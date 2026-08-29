# GC-2 — Media Library & Optimization Production Acceptance

Date: 2026-08-29
Status: **ACCEPTED**
Production Supabase project: `bzjoeernnmvuhzyvbowc`
Admin deployment baseline: `f40c44a7a317812eb6346a618fbb5f30969ae515` / Vercel `dpl_7GJAUEA2shE86KQVPVDeyJ8iwAaA` (`READY`, production)

## Scope

This acceptance closes Granite Center migration package **GC-2 — Media library & optimization pipeline**, including GC-2D controlled production intake. It proves the reusable media domain, private staging boundary, deterministic optimization, Admin review/publish lifecycle, exact-SHA dedupe, unpublish/republish behavior, and duplicate-intake private-staging self-heal on one representative production asset.

GC-2 does **not** associate the asset with Gallery/Projects. GC-5 owns project/media association and final Gallery production acceptance.

## Representative candidate

- Candidate: `media-showroom-01`
- Source site: `granitecenterva.com`
- Source brand: `Granite & Cabinet Center`
- Source page: `https://granitecenterva.com/about-us/showroom/`
- Source media: `https://granitecenterva.com/wp-content/uploads/2016/11/Showroom1.jpg`
- Source label: `SHOWROOM`
- Migration disposition: `parent_attributed`
- Attribution required: `true`
- Production media asset ID: `742705cd-dfbc-4fe2-a0d3-94a83c2dde6b`
- Production provenance ID: `32b62c29-1684-4711-863c-f19a5f751575`

## Verified media facts

### Original

- MIME: `image/jpeg`
- Dimensions: `583 × 425`
- Bytes: `281,219`
- SHA-256: `c9a6cfab62d6e6ee7c885df9f7f7d0c635442a9b35ba2909eb1b27190906d32b`
- Private staging path: `imports/granite/20260829182455-0a2c095c/media-showroom-01/original.jpg`

### Optimized master

- MIME: `image/webp`
- Dimensions: `583 × 425`
- Bytes: `55,088`
- SHA-256: `a7a09a6ee877cccbaa607aaadcf2583722e1fc380bea3e078ac43c26b612ed7a`
- Private staging path: `imports/granite/20260829182455-0a2c095c/media-showroom-01/optimized.webp`
- Public immutable path: `media/742705cd-dfbc-4fe2-a0d3-94a83c2dde6b/a7a09a6ee877cccbaa607aaadcf2583722e1fc380bea3e078ac43c26b612ed7a.webp`

Optimization reduced the representative payload by **226,131 bytes / 80.41%** while preserving the source dimensions because the 583×425 source was already below the no-upscale long-edge limit.

The approved pipeline uses pinned `sharp@0.35.4`, auto-orientation, metadata stripping, no upscale, and WebP quality 80 with smart subsampling. The optimized output was previously byte/hash/dimension verified before publication; the final public object remains `image/webp`, `55,088` bytes at the same immutable SHA path.

## Staging privacy

Production bucket state at final acceptance:

- `store-media-staging`: `public = false`, 20 MB limit, image MIME allowlist.
- `store-media`: `public = true`, 20 MB limit.

Final production object counts after the duplicate self-heal run:

- `store_media_assets = 1`
- `store_media_asset_sources = 1`
- `store-media-staging objects = 2`
- public `store-media` objects = 1

Both private staging locators exist. The repaired original object was recreated on 2026-08-29 at approximately `18:58:41Z` with `image/jpeg` and exactly `281,219` bytes; the optimized private object remains `image/webp` / `55,088` bytes.

## Human review result

The representative asset was visually reviewed through the authenticated Admin Media Library before approval/publication.

Final review metadata:

- Title: `Granite & Cabinet Center showroom source`
- Default alt text: `Granite & Cabinet Center showroom source`
- Cabinet relevance: `mixed`
- Attribution classification: `parent_attributed`
- Lifecycle status: `published`

The relevance value was assigned only after visual review; the intake default remained `unreviewed` before that human boundary.

## Lifecycle acceptance

The production lifecycle was exercised through the authenticated Admin surface rather than direct SQL mutation:

1. Controlled intake created one review asset + one provenance record and two private staging objects, with no public object.
2. Human review updated truthful metadata and moved the asset through approval.
3. Publish created the immutable public object under `store-media/media/<asset-id>/<optimized-sha>.webp` after SHA-256 and byte-size verification.
4. Re-import of the same candidate deduped to the same media asset ID and provenance identity; it did not create a second asset/original and preserved the published lifecycle state.
5. Unpublish removed the public object and cleared the public locator while preserving the approved asset.
6. Republish restored the **same immutable path**, SHA and `55,088`-byte WebP.
7. A later audit discovered the private original had been removed through the Supabase Management API outside the Admin lifecycle. PR #128 added fail-closed duplicate staging integrity checks and missing-object repair.
8. After PR #128 merge/deploy, re-importing the same candidate restored only the missing private `original.jpg` at the **existing path**. Final counts are still one asset, one provenance row, two staging objects and one public object; status and public locator remained `published` and unchanged.

## Dedupe / self-heal invariants

Duplicate intake now:

- downloads and processes the controlled source deterministically;
- resolves the existing asset by exact original SHA-256;
- verifies the existing original and optimized private staging objects against expected byte length and SHA-256;
- restores an expected object only when it is genuinely missing, using the exact existing path and `upsert:false`;
- fails closed with HTTP 409 on integrity mismatch rather than overwriting unexpected bytes;
- preserves asset ID, review metadata, provenance identity, public path and published state.

This closes the dangling-locator failure mode discovered during GC-2D acceptance without introducing a privileged Supabase credential into GitHub Actions or the browser.

## Gallery / Projects boundary

Final production state remains intentionally separate from Gallery/Projects:

- `store_projects = 0`
- `store_project_media = 0`
- references from `store_project_media` to this GC-2 asset/public URL = `0`
- `store_project_media` still has no `media_asset_id` relation; GC-5 owns any future project/media association migration.

Therefore GC-2 proves the reusable controlled media capability only. It does not satisfy the standing Store Gallery/Projects production-content blocker.

## Verification evidence

Key deterministic/production evidence accumulated through GC-2:

- GC-2B real dry-run: Actions `33260112614`
- GC-2C private-preview GREEN: Actions `33262785615`
- GC-2C full contract/build verification: Actions `33262565620`
- GC-2D intake architecture final verification: Actions `33266994556`
- GC-2D duplicate staging repair RED: Actions `33268933784`
- GC-2D duplicate staging repair focused GREEN: Actions `33269070054`
- GC-2D duplicate staging repair exact final SHA verification: Actions `33269345508`
- PR #128 merge SHA: `f40c44a7a317812eb6346a618fbb5f30969ae515`
- Admin production deployment for that SHA: `dpl_7GJAUEA2shE86KQVPVDeyJ8iwAaA` — `READY`

Final exact-SHA verification covered Admin GC-2/platform contracts, Admin lint + Webpack production build, Store GC-1/GC-2 contracts, Store lint + production build, and `git diff --check`.

## Acceptance decision

**GC-2D: complete.**

**GC-2: complete.**

The next Granite migration package is **GC-3 — Company identity, contact, About & Showroom**. Gallery/Projects remains in progress and intentionally waits for GC-5 curated project/media association and live acceptance.
