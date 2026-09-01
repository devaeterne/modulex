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
- Store publication still requires a current Modulex selling price greater than zero for at least one active variant.
- Cron/service sync writes use the server-side Supabase admin client; browser clients cannot insert or delete vendor source records.
- RLS limits review visibility and review-state updates to active `admin` / `super_admin` profiles.

## Current adapters

### Karran

`KarranAdapter` uses Shopify catalog discovery through `/products.json`, paginates results, expands variants, and normalizes SKU/title/description/reference price plus external image URLs.

Product detail pages are **not fetched for every item during sync**. Detail enrichment is deferred until approval, when linked specification/CAD documents such as PDF, DXF and DWG can be collected for the single reviewed product.

### Ruvati

`RuvatiAdapter` first uses the WooCommerce Store API at `/wp-json/wc/store/v1/products`. If that route is unavailable, it falls back to `/product-sitemap.xml` for lightweight URL discovery.

As with Karran, product detail enrichment is deferred until approval instead of opening hundreds of detail pages in one cron request.

## Change detection and performance

`stableDiscoveryHash()` hashes the normalized catalog fields and discovery assets. `stableProductHash()` is used after approval/detail enrichment.

Each sync classifies an item as:

- `NEW` — no previous discovery hash exists.
- `UPDATED` — the discovery hash changed.
- `UNCHANGED` — the discovery hash is identical.

The sync loads the vendor's current staging rows once, classifies products in memory, and persists items/assets/snapshots in chunks. This avoids the former product-by-product detail fetch + DB write pattern that could exceed the server execution timeout.

Every run is recorded in `vendor_catalog_runs`. Per-run snapshots live in `vendor_catalog_snapshots`; source images/documents live in `vendor_catalog_assets`.

## Review workflow

Open `/products/vendor-imports` in Modulex Admin.

The page supports:

- Vendor dropdown filtering (`All vendors`, Karran, Ruvati, future registered adapters).
- Running sync for all vendors or only the selected vendor.
- `NEW`, `UPDATED`, and `Synced / Unchanged` filters.
- External image thumbnails during review.
- `PENDING`, `APPROVED`, and `IGNORED` states.

### Approval

Approval is server-side and fail-closed.

For the selected item it:

1. Fetches that product's detail page for specification/CAD enrichment.
2. Downloads **all vendor image assets** only at this point.
3. Rejects non-HTTPS/unapproved image hosts and oversized source images.
4. Resizes each image to a maximum 1400×1400 bounding box without enlargement.
5. Converts it to WebP and stores it in the Modulex `store-media` Supabase Storage bucket.
6. Records `storage_bucket`, `storage_path`, SHA-256, byte size and archive timestamp on the vendor asset.
7. Creates the vendor brand master when it does not already exist.
8. Creates or links the canonical `SINK` product using the active Sink category and Piece UOM.
9. Creates a **draft** `store_product_content` row when needed.
10. Adds only Modulex Storage URLs to `store_product_media`, with the first image as primary when no primary image exists.
11. Marks the vendor item `APPROVED` and stores `canonical_product_id`.

The Store product stays draft. Approval does not set a Modulex price and does not publish the product. The database publish guard still rejects publication until a valid current Modulex selling price greater than zero exists.

If the vendor later changes the item, the staging row returns to `PENDING`; the sync does not silently overwrite the already-approved canonical product or Store media.

## Sync endpoint

Route:

`GET|POST /api/vendor-catalog/sync`

Trusted cron can authenticate with `CRON_SECRET` or `VENDOR_CATALOG_SYNC_SECRET`. Admin-triggered POST requests can use the active admin user's Supabase access token.

By default the endpoint executes all registered adapters. Limit a run with either:

- query: `?vendors=karran`
- POST JSON: `{ "vendors": ["karran"] }`

The endpoint returns `autoPublished: false` by contract.

`GET /api/vendor-catalog/vendors` returns the registered vendor codes/labels for the admin dropdown.

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

Review V2 adds discovery hashes, detail refresh timestamps and Storage provenance fields. It does not seed vendor products and does not publish Store content.

## How to add a vendor

1. Add a class implementing `VendorCatalogAdapter` in `src/lib/vendor-catalog/adapters.ts`.
2. Keep `discover()` lightweight: catalog/API data plus external image URLs only.
3. Put expensive product-page document/spec/CAD parsing in optional `enrich()`.
4. Register the adapter factory in `vendorCatalogRegistry` with a stable lowercase code.
5. Add a human label in `vendorCatalogLabels`.
6. Add the vendor's approved image hosts to `vendorCatalogImageHosts`; do not weaken the generic SSRF boundary.
7. Return images/documents as normalized `assets`; CAD files use the `cad` kind.
8. Extend contract coverage for discovery, enrichment and approval behavior.

Future vendors should use this adapter boundary instead of special-casing sync, review, pricing or Store publication logic.