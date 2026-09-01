# Vendor Catalog Sync

## Purpose

Vendor Catalog Sync is a staging and review pipeline for third-party product catalogs. It imports vendor-owned descriptive data, assets, documents, identifiers and reference pricing without making those records canonical Modulex products.

The sync **never auto-publishes** Store products and never overwrites canonical product or pricing data.

## Safety invariants

- Vendor catalog rows live in `vendor_catalog_*` staging tables.
- `vendor_price_reference` is informational only. It is not a Modulex selling price.
- A vendor item can be reviewed or approved without any selling price.
- Store publication requires a current Modulex selling price greater than zero for at least one active variant of the Store product.
- A `NEW` or `UPDATED` vendor snapshot resets the item to `PENDING` review.
- `UNCHANGED` snapshots preserve the existing review state.
- Cron/service sync writes use the server-side Supabase admin client; browser clients cannot insert or delete vendor source records.
- RLS limits review visibility and review-state updates to active `admin` / `super_admin` profiles.

## Current adapters

### Karran

`KarranAdapter` uses Shopify catalog discovery through `/products.json`, paginates results, expands variants, normalizes SKU/title/description/reference price/images, and inspects product detail pages for linked documents such as PDF, DXF and DWG files.

### Ruvati

`RuvatiAdapter` first attempts the WooCommerce Store API at `/wp-json/wc/store/v1/products`. If that discovery route is unavailable, it falls back to `/product-sitemap.xml` and inspects the discovered product detail pages. Specification and CAD links are retained as vendor assets.

These strategies are intentionally isolated inside adapters. A vendor changing its website does not change the staging/review contract.

## Change detection

`stableProductHash()` creates a SHA-256 hash from normalized fields and sorted normalized assets. Source payload ordering and unrelated source metadata do not control the hash.

Each sync classifies an item as:

- `NEW` — no previous snapshot exists.
- `UPDATED` — the normalized hash changed.
- `UNCHANGED` — the normalized hash is identical.

Every run is recorded in `vendor_catalog_runs`. Per-run item snapshots are recorded in `vendor_catalog_snapshots`; current documents/images are stored in `vendor_catalog_assets`.

## Review workflow

Open `/products/vendor-imports` in Modulex Admin.

The inbox defaults to `PENDING` and supports `PENDING`, `APPROVED`, and `IGNORED` review states. Approval is deliberately narrow: it marks the staging record as reviewed. It does **not** create, modify, price, or publish a canonical Modulex product.

`canonical_product_id` is reserved for an explicit future/manual linking workflow. Vendor changes never use that link to overwrite a canonical product automatically.

## Sync endpoint

Route:

`GET|POST /api/vendor-catalog/sync`

Required environment variable:

`VENDOR_CATALOG_SYNC_SECRET`

Send the value as a bearer token:

`Authorization: Bearer <secret>`

By default the endpoint executes all registered adapters. Limit a run with either:

- query: `?vendors=karran,ruvati`
- POST JSON: `{ "vendors": ["karran", "ruvati"] }`

The endpoint returns `autoPublished: false` by contract.

The scheduler is intentionally external to the adapter implementation. Vercel Cron or another trusted scheduler may call the secured GET endpoint. Do not place the sync secret in browser-visible environment variables.

## Database deployment

Canonical SQL is maintained at:

`modulex-admin/sql/vendor-catalog-sync.sql`

The deployable Supabase migration is mirrored at:

`modulex-store/supabase/migrations/20260901223000_vendor_catalog_sync.sql`

The migration creates staging tables, indexes, RLS policies, review audit behavior, and extends the existing Store publish guard with the positive Modulex-price requirement. It does not seed vendor products or mutate existing Store content.

## How to add a vendor

1. Add a class implementing `VendorCatalogAdapter` in `src/lib/vendor-catalog/adapters.ts` (or split it into a vendor-specific adapter module once the registry grows).
2. Keep discovery/source-specific parsing inside that adapter and return `NormalizedVendorProduct` records.
3. Register the adapter factory in `vendorCatalogRegistry` using a stable lowercase vendor code.
4. Include source images and documents in normalized `assets`; CAD files should use the `cad` kind.
5. Add/update contract coverage for the vendor discovery route and normalization behavior.
6. Run the sync into staging and review the first import before any separate canonical-product linking work.

Future customer-provided vendor sites should be added through this adapter boundary rather than special-casing sync, review, pricing, or Store publication logic.
