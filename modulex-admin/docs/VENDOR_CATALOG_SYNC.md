# Vendor Catalog Sync

## Purpose

Vendor Catalog Sync discovers third-party product catalogs into a controlled review layer. Discovery keeps vendor-owned descriptive data, identifiers, reference pricing and **external image URLs** without downloading image binaries during cron/sync.

The sync **never auto-publishes** Store products and never treats a vendor price as a Modulex selling price.

## Safety invariants

- Vendor catalog rows live in `vendor_catalog_*` staging tables.
- `vendor_price_reference` is informational only. It is not a Modulex selling price.
- Cron discovery does not download vendor images into Supabase Storage.
- Review thumbnails use the external image URL while the item is pending.
- A `NEW` or `UPDATED` discovery resets the item to `PENDING` review.
- `UNCHANGED` discovery preserves the existing review state.
- Approval is the boundary where vendor images are copied into Modulex-controlled Storage.
- Approval requires a persistent vendor-category mapping to an active Modulex Category, Product Type and UOM. Missing mappings fail closed.
- Store publication still requires a current Modulex selling price greater than zero for at least one active variant.
- Cron/service sync writes use the server-side Supabase admin client; browser clients cannot insert or delete vendor source records.
- RLS limits review visibility to active `admin` / `super_admin` profiles.
- Authenticated reviewers may move rows between `PENDING` and `IGNORED`, but the database trigger rejects direct browser transitions to `APPROVED`; only the service-role server approval pipeline may complete approval and write `canonical_product_id`.
- Vendor SKU identity is preserved. Family grouping controls `base_product_code`; it does not rewrite sellable SKUs.

## Current adapters

### Karran

`KarranAdapter` uses Shopify JSON discovery. Unscoped discovery uses `/products.json?limit=250&page=N`. Category-scoped discovery first exposes `/collections.json?limit=250&page=N` and then reads only the selected collection through `/collections/{handle}/products.json?limit=250&page=N`.

Karran color families are inferred conservatively from a known suffix and matching color text. For example `SQS200BL`, `SQS200GR` and `SQS200WH` can share family key `SQS200` while remaining separate canonical SKUs. If the suffix cannot be verified safely, the SKU stays its own family instead of being merged incorrectly.

Product detail pages are **not fetched for every item during sync**. Detail enrichment is deferred until approval, when linked specification/CAD documents such as PDF, DXF and DWG can be collected for the single reviewed product.

### Ruvati

`RuvatiAdapter` uses the WooCommerce Store API at `/wp-json/wc/store/v1/products`. Categories come from `/wp-json/wc/store/v1/products/categories`, and a selected category is passed through the Store API category filter.

If the Store API is unavailable, unscoped discovery can fall back to `/product-sitemap.xml`. Category-scoped discovery fails closed rather than silently substituting the full sitemap.

As with Karran, product detail enrichment is deferred until approval instead of opening hundreds of detail pages in one cron request.

## Change detection, Check Updates and performance

`stableDiscoveryHash()` hashes normalized vendor product fields, family/variant identity and discovery assets. Vendor category scope is stored separately and intentionally excluded from the product hash so an unscoped cron does not manufacture an `UPDATED` state merely because the same product was previously discovered through a category-scoped run. `stableProductHash()` is used after approval/detail enrichment.

Each discovery classifies an item as:

- `NEW` — no previous discovery hash exists.
- `UPDATED` — the discovery hash changed.
- `UNCHANGED` — the discovery hash is identical.

The Admin **Check Updates** action is read-only with respect to `vendor_catalog_items`. It records a short-lived durable snapshot in `vendor_catalog_checks` and `vendor_catalog_check_items`, returning:

- products found,
- new products,
- updated products,
- unchanged products,
- products that will sync.

**Sync New + Updated** consumes that exact, unexpired check snapshot so the displayed counts and the sync input stay aligned. **Full Rescan** performs fresh discovery without requiring a prior check.

The sync loads current staging rows once, classifies products in memory, and persists items/assets/snapshots in chunks. Changed-only sync does not rewrite unchanged staging assets. Every sync remains recorded in `vendor_catalog_runs`, including vendor/category scope and selection metadata.

## Review workflow

Open `/products/vendor-imports` in Modulex Admin.

The review workspace includes:

- independent Vendor/Category controls for manual Check Updates and sync,
- server-side table pagination with 25/50/100 rows,
- SKU/title/external-ID search,
- Vendor, Category, Review Status, Change State and Linked/Unlinked filters,
- sort controls,
- external image thumbnails during review,
- family key and variant identity,
- `PENDING`, `APPROVED`, and `IGNORED` states,
- `Complete Import` for legacy `APPROVED` rows that still lack `canonical_product_id`,
- `Edit Product`, `Edit Store Product` and vendor-source links on completed approvals.

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

Approving a family processes the pending SKUs in that family through the same item-level server approval boundary. Existing exact-SKU canonical rows can be reused only when they do not conflict with a different vendor catalog identity.

### Approval

Approval is server-side and fail-closed. `review_status=APPROVED` is written only after the full pipeline succeeds. The V3 database guard uses the active Postgres role (`current_user`) to reject direct authenticated approval while allowing the server-only `service_role` approval mutation.

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

If the vendor later changes the item, the staging row returns to `PENDING`; the sync does not silently overwrite the already-approved canonical product or Store media.

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

Returns a durable `checkId` plus discovered/new/updated/unchanged/will-sync counts.

### Sync

`GET|POST /api/vendor-catalog/sync`

Trusted cron can authenticate with `CRON_SECRET` or `VENDOR_CATALOG_SYNC_SECRET`. Cron GET continues to run all registered adapters unscoped. Admin POST can select a vendor/category, run a full rescan, or consume a prior check with `changedOnly: true`.

The endpoint returns `autoPublished: false` by contract.

### Category mapping

`GET|POST /api/vendor-catalog/category-mappings`

GET returns active Modulex category/type/UOM choices and allowed UOM relationships. POST creates or updates one persistent vendor-category mapping; creating a new Modulex category is explicit and uses the editable user-supplied name.

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

Review V3 adds category/family metadata, mapping tables, category-scoped run audit fields and durable Check Updates snapshots. It is additive and does not seed vendor products or publish Store content.

## How to add a vendor

1. Add a class implementing `VendorCatalogAdapter` in `src/lib/vendor-catalog/adapters.ts`.
2. Keep `discover()` lightweight: catalog/API data plus external image URLs only.
3. Implement `listCategories()` and scoped `discover(scope)` when the vendor exposes category discovery.
4. Put expensive product-page document/spec/CAD parsing in optional `enrich()`.
5. Register the adapter factory in `vendorCatalogRegistry` with a stable lowercase code.
6. Add a human label in `vendorCatalogLabels`.
7. Add the vendor's approved image hosts to `vendorCatalogImageHosts`; do not weaken the generic SSRF boundary.
8. Return images/documents as normalized `assets`; CAD files use the `cad` kind.
9. Supply a conservative family/variant identity only when vendor data supports it; ambiguous SKUs must remain ungrouped.
10. Extend contract coverage for discovery, category scope, enrichment, mapping and approval behavior.

Future vendors should use this adapter boundary instead of special-casing sync, review, pricing or Store publication logic.