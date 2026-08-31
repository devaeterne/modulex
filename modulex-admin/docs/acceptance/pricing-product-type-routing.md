# Pricing UI v2 — Product Type Routing Acceptance

Status: **IN REVIEW / production migration and deployed UI acceptance pending**

## Scope

This package makes `product_types.pricing_model` the Admin pricing-routing authority without moving price values into Product Type, Product, or UOM master data.

Supported routing:

| Pricing model | Admin pricing surface | Canonical source |
| --- | --- | --- |
| `price_group` | Pricing → Product Prices | `product_prices` + `price_groups` |
| `countertop_material_band` | Pricing → Material Bands | Stone profile → `countertop_material_price_bands` |
| `none` | No commercial price editor | none |

UOM remains quantity semantics only and does not select a pricing engine.

## Product Prices

- Uses additive `get_product_prices_page_v2` for server-side search/filter/sort/pagination.
- The v2 directory is DB-filtered to `product_types.pricing_model = 'price_group'`.
- Rows expose Product Type and UOM identity.
- Product Type and UOM filters stay server-side.
- Existing `set_product_prices_bulk` remains the bulk mutation path and therefore continues through canonical `set_product_price`.
- `set_product_price` is hardened in-place to reject a non-null Price Group amount for non-`price_group` Product Types.
- A null amount remains an explicit cleanup path for legacy wrong-engine Price Group rows.

## Material Bands

- Dedicated `/pricing/material-bands` Admin workspace.
- Reads canonical `countertop_material_price_bands`.
- Updates price only through `upsert_countertop_reference(p_kind => 'material_band', ...)`.
- Band code is read-only in the focused Pricing workspace.
- Band activation/deactivation is intentionally not exposed here; Pricing edits rates, not reference lifecycle.
- Existing broader Countertop reference management remains separate.

## Production data compatibility review

Read-only production review before merge found:

- Price Group pricing: 2,778 current rows across 462 products.
- Countertop material-band products: one existing current legacy Price Group row on the test Stone product `TEST-CT-QUARTZ-001`.
- The package does **not** delete or mutate that row before merge.
- The v2 Product Prices directory excludes the Stone product.
- The new mutation guard blocks future non-null Price Group writes for material-band products.
- Post-merge cleanup of the single legacy row can use the guarded null-price cleanup path after production deployment is verified.

## B1–R22 compatibility

Production was checked read-only after rollback acceptance. The canonical values remain unchanged:

- B1 34, B2 36, B3 38, C1 40
- R1 45 through R12 100
- R13 105 through R22 150, increasing by 5

All 26 bands are active at review time.

## TDD / deterministic verification

Permanent contract: `npm run smoke:pricing-product-types`.

The contract protects:

- v2 pricing directory existence and Product Type/UOM projection
- DB-side `price_group` eligibility filter
- preserved selected server sort order in JSON output
- non-Price-Group write rejection in `set_product_price`
- Product Type/UOM Product Prices filters
- shared Modulex Admin UI primitives
- Material Bands route and canonical mutation RPC
- Pricing sidebar navigation

The contract is included in the normal Admin smoke chain and the dedicated Admin Products Pricing UI workflow.

## Rollback-only production runtime proof

The proposed migration was installed inside one explicit production transaction and rolled back. The authenticated Admin-context proof passed:

1. `get_product_prices_page_v2` returns Price Group products.
2. Returned items contain only `pricing_model = 'price_group'`.
3. `SKU DESC` response ordering is preserved in the JSON array.
4. Querying `TEST-CT-QUARTZ-001` returns zero Product Prices rows.
5. A non-null Price Group write for the Stone product is rejected with the new pricing-engine error.
6. The null cleanup path closes the legacy Stone Price Group row inside the transaction.
7. The transaction is rolled back.

Post-rollback verification confirmed:

- `get_product_prices_page_v2` does not persist in production before merge.
- the legacy Stone Price Group row remains unchanged.
- canonical Material Band RPC same-value update passes in an authenticated Admin transaction and rolls back cleanly.

## Security

- v2 pricing directory is `SECURITY INVOKER` by default and pins `search_path` to `pg_catalog, public`.
- v2 RPC execution is revoked from `PUBLIC` and `anon`, granted to `authenticated`.
- `set_product_price` remains the existing authenticated, role-checked mutation boundary with the same signature and advisory-lock/history behavior.
- No service-role or elevated browser key is introduced.

## Pending production closeout

Do not mark this package complete until all of the following are verified after merge:

- additive migration applied to production
- Admin deployment is READY on the exact merge SHA
- authenticated Product Prices UI smoke
- authenticated Material Bands UI smoke
- Product Type/UOM filter and pagination reconciliation
- ordinary Price Group mutation rollback smoke
- Stone wrong-engine write rejection
- deliberate cleanup decision for the one legacy Stone Price Group row
- Dealer no-fallback regression
- Supabase Security Advisor review
- Supabase Performance Advisor review
- roadmap closeout
