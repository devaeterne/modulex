# Vendor Catalog Sync

## Purpose

Vendor Catalog Sync discovers third-party product catalogs into a controlled review layer. Discovery keeps vendor-owned descriptive data, identifiers, reference pricing, **external image URLs**, and vendor sale-eligibility signals without downloading image binaries during cron/sync.

The sync **never auto-publishes** Store products, never treats a vendor price as a Modulex selling price, and never treats vendor availability as Modulex warehouse on-hand inventory.

## Safety invariants

- Vendor catalog rows live in `vendor_catalog_*` staging tables.
- `vendor_price_reference` is informational only. It is not a Modulex selling price.
- Vendor availability is external sale eligibility only. It does not change Modulex inventory balances or stock movements.
- Cron discovery does not download vendor images into Supabase Storage.
- Review thumbnails use the external image URL while the item is pending.
- A content `NEW` or `UPDATED` discovery resets the item to `PENDING` review.
- `UNCHANGED` content preserves the existing review state, even when vendor availability changes.
- Availability is hashed and reconciled independently from descriptive/content change detection.
- Only `AVAILABLE` vendor rows may be approved. `OUT_OF_STOCK`, `UNAVAILABLE`, `UNKNOWN`, and `MISSING` fail closed.
- Approval is the boundary where vendor images are copied into Modulex-controlled Storage.
- Approval requires a persistent vendor-category mapping to an active Modulex Category, Product Type and UOM. Missing mappings fail closed.
- Store publication still requires a current Modulex selling price greater than zero for at least one active variant.
- Cron/service sync writes use the server-side Supabase admin client; browser clients cannot insert or delete vendor source records.
- RLS limits review visibility to active `admin` / `super_admin` profiles.
- Authenticated reviewers may move rows between `PENDING` and `IGNORED`, but the database trigger rejects direct browser transitions to `APPROVED`; only the service-role server approval pipeline may complete approval and write `canonical_product_id`.
- Vendor SKU identity is preserved. Family grouping controls `base_product_code`; it does not rewrite sellable SKUs.
- Vendor availability never changes family-level editorial publish intent in `store_product_content.is_published`.

## Current adapters

### Karran

`KarranAdapter` uses Shopify JSON discovery. Unscoped discovery uses `/products.json?limit=250&page=N`. Category-scoped discovery first exposes `/collections.json?limit=250&page=N` and then reads only the selected collection through `/collections/{handle}/products.json?limit=250&page=N`.

Variant-level `available` is normalized as vendor sale eligibility:

- `true` → `AVAILABLE`
- `false` → `UNAVAILABLE`
- missing/unusable field → `UNKNOWN`

Karran public catalog discovery is not treated as a reliable source of exact stock quantity, so it does not populate Modulex inventory on-hand.

Karran color families are inferred conservatively from a known suffix and matching color text. For example `SQS200BL`, `SQS200GR` and `SQS200WH` can share family key `SQS200` while remaining separate canonical SKUs. If the suffix cannot be verified safely, the SKU stays its own family instead of being merged incorrectly.

Product detail pages are **not fetched for every item during sync**. Detail enrichment is deferred until approval, when linked specification/CAD documents such as PDF, DXF and DWG can be collected for the single reviewed product.

### Ruvati

`RuvatiAdapter` uses the WooCommerce Store API at `/wp-json/wc/store/v1/products`. Categories come from `/wp-json/wc/store/v1/products/categories`, and a selected category is passed through the Store API category filter.

WooCommerce availability is normalized in this order:

- `is_purchasable=false` → `UNAVAILABLE`
- otherwise `is_in_stock=false` → `OUT_OF_STOCK`
- `is_purchasable=true` and `is_in_stock=true` → `AVAILABLE`
- required availability fields missing → `UNKNOWN`

`low_stock_remaining`, when present and valid, is stored only as a vendor quantity reference. It is not written into Modulex inventory.

If the Store API is unavailable, unscoped discovery can fall back to `/product-sitemap.xml`. Sitemap-only rows are `UNKNOWN`; category-scoped discovery fails closed rather than silently substituting the full sitemap. Sitemap fallback is also not considered an authoritative full-vendor run for missing-product deactivation.

As with Karran, product detail enrichment is deferred until approval instead of opening hundreds of detail pages in one cron request.

## Change detection, availability and Check Updates

`stableDiscoveryHash()` hashes normalized vendor product fields, family/variant identity and discovery assets. Vendor category scope is stored separately and intentionally excluded from the product hash so an unscoped cron does not manufacture an `UPDATED` state merely because the same product was previously discovered through a category-scoped run. Vendor availability is also excluded from this content hash.

`stableAvailabilityHash()` independently hashes normalized vendor availability. This allows stock/sale-eligibility changes to be persisted and reconciled without turning an approved content record back into `PENDING` review.

Each content discovery classifies an item as:

- `NEW` — no previous discovery hash exists.
- `UPDATED` — the content discovery hash changed.
- `UNCHANGED` — the content discovery hash is identical.

Availability is tracked separately as:

- `AVAILABLE`
- `OUT_OF_STOCK`
- `UNAVAILABLE`
- `UNKNOWN`
- `MISSING`

The Admin **Check Updates** action is read-only with respect to `vendor_catalog_items`. It records a short-lived durable snapshot in `vendor_catalog_checks` and `vendor_catalog_check_items`, returning content counts plus availability counts such as available, out-of-stock, unavailable, unknown, missing, and availability-changed.

`willSync` keeps its original meaning: content `NEW + UPDATED`. Availability-only changes are shown separately and are still persisted when the checked snapshot is synced.

**Sync Changes** consumes that exact, unexpired check snapshot so the displayed counts and the sync input stay aligned. **Full Rescan** performs fresh discovery without requiring a prior check.

The sync loads current staging rows once, classifies products in memory, and persists items/assets/snapshots in chunks. Changed-only sync does not rewrite unchanged staging assets. Every sync remains recorded in `vendor_catalog_runs`, including vendor/category scope, selection metadata, availability counts, and canonical deactivate/reactivate counts.

## Availability reconciliation

For an already-approved item linked to a canonical product:

- `AVAILABLE → OUT_OF_STOCK`, `UNAVAILABLE`, or `MISSING` changes the linked canonical SKU from `active` to `inactive`.
- Product, pricing, Store content/media, order history and operational history are retained.
- `store_product_content.is_published` is not changed because it is family-level editorial state while availability is SKU/variant-level.
- Public Store product projections already require active canonical variants, so one unavailable color disappears while active siblings in the same family remain visible.

Vendor-driven inactivity records `canonical_inactivated_by_vendor_at` and the resulting canonical `updated_at` version. If the vendor later reports `AVAILABLE`, Modulex auto-reactivates only when the canonical product is still inactive and its version still matches the vendor-applied inactivity version. If an administrator changed the canonical product after vendor deactivation, Modulex leaves it inactive and sets `reactivation_requires_review=true`. Archived products are never auto-reactivated.

A persistent blocking vendor status is reconciled on each successful observation, not only when the availability hash changes. Therefore manually forcing an externally unavailable SKU active does not permanently bypass the next successful vendor reconciliation.

### Missing-product safety

Category-scoped absence is not evidence that a vendor discontinued a product because products may move between categories.

`missing_success_count` advances only after successful authoritative **full-vendor** discovery. Two consecutive successful full-vendor runs in which a previously known product is absent are required before it becomes `MISSING` and receives the same canonical inactivity treatment as explicit vendor unavailability.

Failed/partial discovery and Ruvati sitemap fallback do not advance the missing counter. Any later authoritative observation resets the counter.

## Review workflow

Open `/products/vendor-imports` in Modulex Admin.

The review workspace includes:

- independent Vendor/Category controls for manual Check Updates and sync,
- server-side table pagination with 25/50/100 rows,
- SKU/title/external-ID search,
- Vendor, Category, Stock/Availability, Review Status, Change State and Linked/Unlinked filters,
- availability badges and optional vendor quantity reference,
- sort controls,
- external image thumbnails during review,
- family key and variant identity,
- `PENDING`, `APPROVED`, and `IGNORED` states,
- `Complete Import` for legacy `APPROVED` rows that still lack `canonical_product_id`,
- `Edit Product`, `Edit Store Product` and vendor-source links on completed approvals.

Unavailable rows remain visible for operational tracking but are not approval-eligible.

### Selection and bulk approval

Pending rows use the shared Checkbox primitive. Row selection is enabled only when the server confirms the row is currently `AVAILABLE`, mapped, and otherwise approval-eligible.

The page header checkbox selects eligible rows on the current page. `Select all N eligible filtered products` resolves the complete current filtered result set server-side so bulk selection can span pagination without selecting unavailable or unmapped rows.

`Approve Selected (N)` processes explicit IDs in client batches of at most 5. The bulk server endpoint runs item approvals with concurrency at most 2 and revalidates current availability, review status, and category mapping immediately before approval. A product that becomes unavailable after selection is skipped rather than imported.

Bulk approval reuses the existing item-level approval pipeline; it does not create a second canonical-write path. It never auto-creates category/type/UOM mappings, never creates a Modulex selling price, and never auto-publishes Store content.

### Vendor category mapping

A vendor category may be discovered and reviewed before a matching Modulex category exists. Approval, however, requires a mapping in `vendor_catalog_category_mappings`.

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

Approving a family processes only pending `AVAILABLE` SKUs in that family through the same item-level server approval boundary. Existing exact-SKU canonical rows can be reused only when they do not conflict with a different vendor catalog identity.

### Approval

Approval is server-side and fail-closed. `review_status=APPROVED` is written only after the full pipeline succeeds. The database guard uses the active Postgres role (`current_user`) to reject direct authenticated approval while allowing the server-only `service_role` approval mutation.

Before expensive enrichment/image work, the server rechecks that the staging row is `PENDING` and `AVAILABLE`. Stale or unavailable requests return a structured conflict instead of entering the canonical creation pipeline.

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
12. finally stores `canonical_product_id` and marks the vendor item `APPROVED`.

The Store product stays draft. Approval does not set a Modulex price and does not publish the product. The database publish guard still rejects publication until a valid current Modulex selling price greater than zero exists.

If vendor descriptive content later changes, the staging row returns to `PENDING`; availability-only changes do not reset content review state.

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
  "categoryKey": "bathroom-quartz-sinks",
  "categoryLabel": "Bathroom Quartz Sinks"
}
```

Returns a durable `checkId` plus content and availability counts.

### Sync

`GET|POST /api/vendor-catalog/sync`

Trusted cron can authenticate with `CRON_SECRET` or `VENDOR_CATALOG_SYNC_SECRET`. Cron GET continues to run all registered adapters unscoped. Admin POST can select a vendor/category, run a full rescan, or consume a prior check with `changedOnly: true`.

The endpoint returns `autoPublished: false` by contract.

### Category mapping

`GET|POST /api/vendor-catalog/category-mappings`

GET returns active Modulex category/type/UOM choices and allowed UOM relationships. POST creates or updates one persistent vendor-category mapping; creating a new Modulex category is explicit and uses the editable user-supplied name.

### Bulk eligible resolver

`GET /api/vendor-catalog/bulk/eligible`

Admin-authenticated. Mirrors the Vendor Imports vendor/category/review/change/linked/search/availability filters but returns only IDs that are `PENDING`, `AVAILABLE`, and backed by a valid existing category/type/UOM mapping.

### Bulk approval

`POST /api/vendor-catalog/bulk/approve`

Admin-authenticated JSON:

```json
{
  "itemIds": ["uuid-1", "uuid-2"]
}
```

Accepts 1–5 explicit IDs per request and processes with concurrency at most 2. Results are returned per item as `APPROVED`, `SKIPPED`, or `FAILED`. Availability/mapping/review eligibility is rechecked on the server.

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

The availability migration is additive. Existing staging rows initialize as `UNKNOWN`; it does **not** deactivate canonical products during migration. Fresh vendor observations backfill availability and perform reconciliation. Production application of this migration belongs after reviewed code is merged/deployed in the agreed rollout sequence.

## How to add a vendor

1. Add a class implementing `VendorCatalogAdapter` in `src/lib/vendor-catalog/adapters.ts`.
2. Keep `discover()` lightweight: catalog/API data plus external image URLs only.
3. Normalize a deterministic `availability` value for every discovered product; use `UNKNOWN` rather than guessing when the vendor does not expose sale eligibility.
4. Implement `listCategories()` and scoped `discover(scope)` when the vendor exposes category discovery.
5. Put expensive product-page document/spec/CAD parsing in optional `enrich()`.
6. Register the adapter factory in `vendorCatalogRegistry` with a stable lowercase code.
7. Add a human label in `vendorCatalogLabels`.
8. Add the vendor's approved image hosts to `vendorCatalogImageHosts`; do not weaken the generic SSRF boundary.
9. Return images/documents as normalized `assets`; CAD files use the `cad` kind.
10. Supply a conservative family/variant identity only when vendor data supports it; ambiguous SKUs must remain ungrouped.
11. Extend contract coverage for discovery, availability, category scope, enrichment, mapping and approval behavior.

Future vendors should use this adapter boundary instead of special-casing sync, review, pricing, inventory or Store publication logic.
