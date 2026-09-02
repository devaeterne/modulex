# Vendor Catalog Sync

## Purpose

Vendor Catalog Sync discovers third-party product catalogs into a controlled review layer. Discovery keeps vendor-owned descriptive data, identifiers, reference pricing, external image URLs, category/family metadata and optional vendor status signals without downloading image binaries during cron/sync.

The sync **never auto-publishes** Store products, never changes Modulex selling prices during discovery/sync, never copies vendor status into Modulex warehouse inventory, and never changes canonical product active/inactive status because of vendor stock signals. A non-null vendor reference price is promoted to the canonical product's base `List Price` only at the approval boundary by a database trigger.

## Safety invariants

- Vendor catalog rows live in `vendor_catalog_*` staging tables.
- `vendor_price_reference` remains staging/reference data during discovery and sync. When an item becomes `APPROVED`, the database trigger copies a non-null reference amount to the canonical product's active base `List Price` in `vendor_currency`.
- Later vendor sync price changes do not automatically reprice an already-approved product; the trigger listens only to the approval/canonical-link transition.
- The approval trigger never calculates or writes non-base price groups.
- Vendor availability/status is informational operational metadata. Staff confirm actual stock with the vendor when required.
- Vendor stock quantity is not tracked in the current Vendor Catalog workflow; normalized `stockQuantity` remains `null`.
- Vendor status changes do not create Modulex inventory movements and do not change Modulex `inventory` balances.
- Vendor status changes do not activate, deactivate, archive, publish or unpublish canonical products.
- Cron discovery does not download vendor images into Supabase Storage.
- Review thumbnails use the external image URL while the item is pending.
- A content `NEW` or `UPDATED` discovery resets the item to `PENDING` review.
- `UNCHANGED` content preserves the existing review state even when vendor status changes.
- Availability/status is hashed independently from descriptive/content change detection.
- Approval is allowed for catalog-present rows regardless of `AVAILABLE`, `OUT_OF_STOCK`, `UNAVAILABLE`, or `UNKNOWN` status. Only `MISSING` is blocked because the product is no longer present in an authoritative vendor catalog observation.
- Approval is the boundary where vendor images are copied into Modulex-controlled Storage.
- Approval requires a persistent vendor-category mapping to an active Modulex Category, Product Type and UOM. Missing mappings fail closed.
- Store publication still requires a current Modulex selling price greater than zero for at least one active variant.
- Cron/service sync writes use the server-side Supabase admin client; browser clients cannot insert or delete vendor source records.
- RLS limits review visibility to active `admin` / `super_admin` profiles.
- Authenticated reviewers may move rows between `PENDING` and `IGNORED`, but the database trigger rejects direct browser transitions to `APPROVED`; only the service-role server approval pipeline may complete approval and write `canonical_product_id`.
- Vendor SKU identity is preserved. Family grouping controls `base_product_code`; it does not rewrite sellable SKUs.
- Store family editorial publish intent is independent from vendor status.

## Current adapters

### Karran

`KarranAdapter` uses Shopify JSON discovery. Unscoped discovery uses `/products.json?limit=250&page=N`. Category-scoped discovery first exposes `/collections.json?limit=250&page=N` and then reads only the selected collection through `/collections/{handle}/products.json?limit=250&page=N`.

Karran's public Shopify `variant.available` is retained unchanged in `source_payload` for audit, but it is **not** used as an authoritative dealer/distributor stock signal. Production evidence showed every current Kitchen Sink row returning `available=false` while the products remained active Karran catalog products.

Therefore:

- a product observed in the authoritative Karran catalog is normalized as `AVAILABLE` for catalog-presence purposes;
- `stockQuantity` remains `null`;
- raw Shopify `variant.available` remains available in `source_payload` for inspection;
- disappearance is handled only by the authoritative `MISSING` policy described below.

Karran color families are inferred conservatively from a known suffix and matching color text. For example `SQS200BL`, `SQS200GR` and `SQS200WH` can share family key `SQS200` while remaining separate canonical SKUs. If the suffix cannot be verified safely, the SKU stays its own family instead of being merged incorrectly.

Product detail pages are **not fetched for every item during sync**. Detail enrichment is deferred until approval, when linked specification/CAD documents such as PDF, DXF and DWG can be collected for the reviewed product.

### Ruvati

`RuvatiAdapter` uses the WooCommerce Store API at `/wp-json/wc/store/v1/products`. Categories come from `/wp-json/wc/store/v1/products/categories`, and a selected category is passed through the Store API category filter.

WooCommerce status is normalized for reference:

- `is_purchasable=false` → `UNAVAILABLE`
- `is_purchasable=true` and `is_in_stock=false` → `OUT_OF_STOCK`
- `is_purchasable=true` and `is_in_stock=true` → `AVAILABLE`
- required status fields missing → `UNKNOWN`

These values do **not** block approval while the catalog row is present and do not change canonical product status. Exact vendor quantity is not tracked; `stockQuantity` remains `null`.

If the Store API is unavailable, unscoped discovery can fall back to `/product-sitemap.xml`. Sitemap-only rows are `UNKNOWN`; category-scoped discovery fails closed rather than silently substituting the full sitemap. Sitemap fallback is also not considered an authoritative full-vendor run for missing-product detection.

As with Karran, product detail enrichment is deferred until approval instead of opening hundreds of detail pages in one cron request.

## Change detection and Check Updates

`stableDiscoveryHash()` hashes normalized vendor product fields, family/variant identity and discovery assets. Vendor category scope is stored separately and intentionally excluded from the product hash so an unscoped cron does not manufacture an `UPDATED` state merely because the same product was previously discovered through a category-scoped run. Vendor status is also excluded from this content hash.

`stableAvailabilityHash()` independently hashes normalized vendor status. Status changes can therefore be persisted without turning an approved content record back into `PENDING` review.

Each content discovery classifies an item as:

- `NEW` — no previous discovery hash exists.
- `UPDATED` — the content discovery hash changed.
- `UNCHANGED` — the content discovery hash is identical.

Vendor status remains one of:

- `AVAILABLE`
- `OUT_OF_STOCK`
- `UNAVAILABLE`
- `UNKNOWN`
- `MISSING`

The Admin **Check Updates** action is read-only with respect to `vendor_catalog_items`. It records a short-lived durable snapshot in `vendor_catalog_checks` and `vendor_catalog_check_items`, returning content counts plus vendor-status counts.

`willSync` keeps its original meaning: content `NEW + UPDATED`. Status-only changes are shown separately and are still persisted when the checked snapshot is synced.

**Sync Changes** consumes that exact, unexpired check snapshot so displayed counts and sync input stay aligned. **Full Rescan** performs fresh discovery without requiring a prior check.

The sync loads current staging rows once, classifies products in memory, and persists items/assets/snapshots in chunks. Changed-only sync does not rewrite unchanged staging assets. Every sync remains recorded in `vendor_catalog_runs`, including vendor/category scope, selection metadata and status counters. Legacy canonical deactivate/reactivate counter columns remain schema-compatible but this workflow no longer mutates canonical product status, so those counters remain zero.

## Missing-product safety

`MISSING` means the product disappeared from an authoritative vendor catalog discovery. It does **not** mean out of stock.

Category-scoped absence is not evidence that a vendor discontinued a product because products may move between categories.

`missing_success_count` advances only after successful authoritative **full-vendor** discovery. Two consecutive successful full-vendor runs in which a previously known product is absent are required before it becomes `MISSING`.

Failed/partial discovery and Ruvati sitemap fallback do not advance the missing counter. Any later authoritative observation resets the counter.

A `MISSING` row remains in staging and keeps its historical canonical link if one exists. The sync does not delete or deactivate the canonical product. `MISSING` only blocks a new/unfinished approval because Modulex can no longer verify that the source product remains in the vendor catalog.

## Review workflow

Open `/products/vendor-imports` in Modulex Admin.

The review workspace includes:

- independent Vendor/Category controls for manual Check Updates and sync,
- server-side table pagination with 25/50/100 rows,
- SKU/title/external-ID search,
- Vendor, Category, Vendor Status, Review Status, Change State and Linked/Unlinked filters,
- vendor-status badges for reference,
- sort controls,
- external image thumbnails during review,
- family key and variant identity,
- `PENDING`, `APPROVED`, and `IGNORED` states,
- `Complete Import` for legacy `APPROVED` rows that still lack `canonical_product_id`,
- `Edit Product`, `Edit Store Product` and vendor-source links on completed approvals.

`OUT_OF_STOCK`, `UNAVAILABLE`, and `UNKNOWN` rows remain approval-eligible. Staff confirms real vendor stock outside Modulex when needed. `MISSING` rows are visible but blocked from approval.

### Selection and bulk approval

Pending rows are selectable when they are catalog-present (`availability_status != MISSING`), category-mapped and otherwise review-eligible.

The page header checkbox selects eligible rows on the current page. `Select all N eligible filtered products` resolves the complete current filtered result set server-side so bulk selection can span pagination while preserving the current Vendor Status filter.

`Approve Selected (N)` processes explicit IDs in client batches of at most 5. The bulk server endpoint runs item approvals with concurrency at most 2 and revalidates catalog presence, review status and category mapping immediately before approval.

A product changing from `AVAILABLE` to `OUT_OF_STOCK`, `UNAVAILABLE`, or `UNKNOWN` after selection is still eligible. A product becoming `MISSING` is skipped.

Bulk approval reuses the item-level approval pipeline; it does not create a second canonical-write path. It never auto-creates category/type/UOM mappings and never auto-publishes Store content. The approval server code itself does not calculate price groups; the final database `APPROVED` transition invokes the same base `List Price` trigger used by single-item approval.

### Vendor category mapping

A vendor category may be discovered and reviewed before a matching Modulex category exists. Approval requires a mapping in `vendor_catalog_category_mappings`.

When a mapping is missing, the approval route returns `CATEGORY_MAPPING_REQUIRED` and creates no canonical product. The Admin mapping panel lets an authorized user:

1. choose an existing Modulex category, **or** enter an editable name and create a new active category;
2. select an active Product Type;
3. select an active UOM allowed by that Product Type;
4. save the vendor-category mapping;
5. continue the paused approval.

The saved mapping is reused for later products in the same vendor category. Product Type is never inferred from words such as “sink” or “faucet”; unsupported or not-yet-configured master data stays fail-closed.

### Family and variant semantics

Vendor SKU remains the canonical sellable SKU. `family_key` becomes Modulex `base_product_code`, while `variant_code` / `variant_label` populate variant/color identity.

Example:

- `SQS200BL` → `base_product_code=SQS200`, variant `BL / Black`
- `SQS200GR` → `base_product_code=SQS200`, variant `GR / Grey`
- `SQS200WH` → `base_product_code=SQS200`, variant `WH / White`

Approving a family processes pending catalog-present SKUs in that family through the same item-level server approval boundary. Existing exact-SKU canonical rows can be reused only when they do not conflict with a different vendor catalog identity.

### Approval

Approval is server-side and fail-closed for review integrity, not for stock. `review_status=APPROVED` is written only after the full pipeline succeeds. The database guard uses the active Postgres role (`current_user`) to reject direct authenticated approval while allowing the server-only `service_role` approval mutation.

Before expensive enrichment/image work, the server rechecks that the staging row is review-eligible and not `MISSING`. `OUT_OF_STOCK`, `UNAVAILABLE`, or `UNKNOWN` status does not prevent import.

For the selected SKU it:

1. resolves the required vendor category → Modulex Category/Product Type/UOM mapping;
2. fetches that product's detail page for specification/CAD enrichment;
3. downloads **all vendor image assets** only at this point;
4. rejects non-HTTPS/unapproved image hosts and oversized source images;
5. resizes each image to a maximum 1400×1400 bounding box without enlargement;
6. converts it to WebP and stores it in the Modulex `store-media` Supabase Storage bucket;
7. records Storage path, SHA-256, byte size and archive timestamp on the vendor asset;
8. creates the vendor brand master when it does not already exist;
9. creates or safely links the canonical product using the mapped masters and family/variant identity;
10. creates or reuses a **draft** `store_product_content` row for the family;
11. adds only Modulex Storage URLs to `store_product_media`, tagged with the variant color code when available;
12. finally stores `canonical_product_id` and marks the vendor item `APPROVED`; that database transition copies a non-null `vendor_price_reference` into the canonical product's active base `List Price` in `vendor_currency`.

The Store product stays draft. Approval writes only the base `List Price` when a vendor price is present; it does not calculate other price groups and does not publish the product. The database publish guard still rejects publication until a valid current Modulex selling price greater than zero exists. Later vendor sync price changes do not re-run the approval trigger, so they do not silently reprice an approved product.

If vendor descriptive content later changes, the staging row returns to `PENDING`; vendor-status-only changes do not reset content review state.

## Endpoints

### Vendors and categories

`GET /api/vendor-catalog/vendors`

Returns registered vendors. Add `?vendor=karran` (or another registered code) to also retrieve that adapter's categories.

### Check Updates

`POST /api/vendor-catalog/check`

Admin-authenticated JSON:

```json
{
  "vendor": "karran",
  "categoryKey": "kitchen-sinks",
  "categoryLabel": "Kitchen Sinks"
}
```

Returns a durable `checkId` plus content and vendor-status counts.

### Sync

`GET|POST /api/vendor-catalog/sync`

Trusted cron can authenticate with `CRON_SECRET` or `VENDOR_CATALOG_SYNC_SECRET`. Cron GET continues to run all registered adapters unscoped. Admin POST can select a vendor/category, run a full rescan, or consume a prior check with `changedOnly: true`.

The endpoint returns `autoPublished: false` by contract.

### Category mapping

`GET|POST /api/vendor-catalog/category-mappings`

GET returns active Modulex category/type/UOM choices and allowed UOM relationships. POST creates or updates one persistent vendor-category mapping; creating a new Modulex category is explicit and uses the editable user-supplied name.

### Bulk eligible resolver

`GET /api/vendor-catalog/bulk/eligible`

Admin-authenticated. Mirrors the Vendor Imports vendor/category/review/change/linked/search/vendor-status filters and returns only IDs that are `PENDING`, not `MISSING`, and backed by a valid existing category/type/UOM mapping.

### Bulk approval

`POST /api/vendor-catalog/bulk/approve`

Admin-authenticated JSON:

```json
{
  "itemIds": ["uuid-1", "uuid-2"]
}
```

Accepts 1–5 explicit IDs per request and processes with concurrency at most 2. Results are returned per item as `APPROVED`, `SKIPPED`, or `FAILED`. Catalog presence, mapping and review eligibility are rechecked on the server.

## Database deployment

Base canonical SQL:

`modulex-admin/sql/vendor-catalog-sync.sql`

Base migration:

`modulex-store/supabase/migrations/20260901223000_vendor_catalog_sync.sql`

Hardening SQL/migration add explicit service-role access and the positive Modulex-price publish guard.

Review V2 canonical SQL:

`modulex-admin/sql/vendor-catalog-sync-review-v2.sql`

Review V2 migration:

`modulex-store/supabase/migrations/20260902001500_vendor_catalog_sync_review_v2.sql`

Review V3 canonical SQL:

`modulex-admin/sql/vendor-catalog-sync-family-v3.sql`

Review V3 migration:

`modulex-store/supabase/migrations/20260902093000_vendor_catalog_sync_family_v3.sql`

Availability + Bulk Approval migration:

`modulex-store/supabase/migrations/20260902113500_vendor_catalog_availability_bulk_approval.sql`

The availability migration is additive. Existing staging rows initialize as `UNKNOWN`; it does **not** mutate canonical product status during migration. The current application treats vendor status as informational and leaves `vendor_stock_quantity` null.

Vendor approval List Price canonical SQL:

`modulex-admin/sql/vendor-catalog-sync-list-price-trigger.sql`

Vendor approval List Price migration:

`modulex-store/supabase/migrations/20260902142000_vendor_catalog_sync_list_price_trigger.sql`

The List Price migration installs an approval/canonical-link trigger. For future approvals it copies only `vendor_price_reference` to the active base `List Price` in `vendor_currency`, preserving normal `product_prices` effective-history semantics. Its one-time backfill fills only missing current List Price rows for already-approved linked vendor products; it never overwrites an existing current List Price.

Production schema currently contains the availability objects, while the migration ledger must be verified/repaired separately using the official Supabase migration-history workflow before treating rollout history as clean. Do not invent a replacement migration version merely to hide ledger drift.

## How to add a vendor

1. Add a class implementing `VendorCatalogAdapter` in `src/lib/vendor-catalog/adapters.ts`.
2. Keep `discover()` lightweight: catalog/API data plus external image URLs only.
3. Normalize a deterministic vendor status for each discovered product when reliable enough for display; use `UNKNOWN` rather than guessing.
4. Do not populate `stockQuantity` unless Modulex explicitly adopts authoritative vendor stock tracking in a future scoped package.
5. Never make vendor stock status an approval gate unless business requirements explicitly change.
6. Implement `listCategories()` and scoped `discover(scope)` when the vendor exposes category discovery.
7. Put expensive product-page document/spec/CAD parsing in optional `enrich()`.
8. Register the adapter factory in `vendorCatalogRegistry` with a stable lowercase code.
9. Add a human label in `vendorCatalogLabels`.
10. Add the vendor's approved image hosts to `vendorCatalogImageHosts`; do not weaken the generic SSRF boundary.
11. Return images/documents as normalized `assets`; CAD files use the `cad` kind.
12. Supply a conservative family/variant identity only when vendor data supports it; ambiguous SKUs must remain ungrouped.
13. Extend contract coverage for discovery, vendor status, category scope, enrichment, mapping and stock-independent approval behavior.

Future vendors should use this adapter boundary instead of special-casing sync, review, pricing, inventory or Store publication logic.
