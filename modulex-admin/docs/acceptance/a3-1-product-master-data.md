# A3.1 Product Master Data Acceptance

Status: IN PROGRESS

## Baseline

- Base branch: `main` at `13368ef229bb5eda21e86cda9422c4f735d55e07`.
- Production products: 462 total, 462 active.
- Canonical completeness preflight: 0 missing `brand_id`, `category_id`, `base_product_code`, `color_code`, or barcode values.
- Integrity preflight: 0 family taxonomy conflicts, 0 duplicate `(base_product_code,color_code)` variants, 0 case-insensitive duplicate SKU/barcode values.
- Existing Store A3.1 canonical taxonomy RPC migration is already present and remains in scope as a regression boundary.

## TDD evidence

- RED: pending Actions run for the permanent `smoke:a3-product-master` contract. Expected failure is the intentionally absent A3.1 SQL/product-form/lifecycle/export implementation.
- GREEN: pending.

## Production acceptance

Pending repository GREEN, migration review, production rollback probes, advisor review, merged deployment verification, and authenticated UI/export smoke.
