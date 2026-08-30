# A2.4 Low-stock & Reporting Acceptance

A2.4 release candidate acceptance: PASS

Accepted on: 2026-08-30
Baseline `main`: `c5c9af0601a18eda9840ff8c00e401ce0a27c82a`
Production Supabase project: `bzjoeernnmvuhzyvbowc`
Production migration: PENDING POST-MERGE

## Business semantics

Threshold source of truth: `products.min_stock_level`.

- `0 = unset`.
- Available = On Hand − Reserved.
- Out of Stock is threshold-independent: Available <= 0 always produces an operational stock alert.
- Low Stock requires a configured positive threshold and positive Available quantity at or below that threshold.
- A threshold-unset product can therefore be Out of Stock, but it is not classified as Low Stock.

The A2.4 migration makes those states explicit with `threshold_configured`, `is_out_of_stock`, `is_low_stock`, `is_stock_alert`, and the `OUT_OF_STOCK` / `LOW_STOCK` / `PARTIALLY_RESERVED` / `OK` status contract.

## Production read-only preflight

No production stock or movement row was written during A2.4 preflight.

- Active products: 462
- Active products with threshold configured (> 0): 0
- Active products with threshold unset (= 0): 462
- Out-of-stock products under A2.4 semantics: 3
- Low-stock products under A2.4 semantics: 0
- Total stock alerts under A2.4 semantics: 3
- Inventory rows: 463
- On Hand: 462.00
- Reserved: 3.00
- Available: 459.00
- Active location summary rows: 2
- Inventory movement rows: 4
- Movement quantity total: 4.00
- Movement-history view rows: 4
- Movement-history view quantity total: 4.00

Inventory reconciliation preflight: PASS

The direct inventory totals and the current product/location reporting surfaces reconcile to the same On Hand / Reserved / Available model. The new report RPCs were created inside a transaction, queried against production data, and rolled back; SQL contract/syntax validation passed without leaving DDL behind.

Movement reconciliation preflight: PASS

`inventory_movements` and `v_inventory_movement_history` both return 4 rows with total movement quantity 4.00. The A2.4 movement RPC was also created/query-tested inside the rollback transaction and returned the same 4-event / 4.00-unit aggregate.

Production inventory/movement mutation: NONE

## Query and index review

A2.4 removes the browser-side latest-1,000-record reporting boundary. Low Stock, Inventory Product, Inventory Location, and Movement report rows are paged server-side; filtered summary totals are calculated in PostgreSQL rather than from only the currently loaded browser rows.

CSV export walks the same filtered RPC in 500-row pages until `total_count` is exhausted, so export is not silently limited to the visible page or the old 1,000-row client load.

Existing production indexes already cover the core report join/filter keys used by A2.4: inventory product/location/warehouse, movement created-at/type/product/from/to warehouse/location, product status/category/brand, and warehouse/location identifiers. No speculative A2.4 index is added before a production plan demonstrates a need for one.

## Security boundary

All new report functions are `SECURITY INVOKER`. Function execution is revoked from `PUBLIC`/`anon` and explicitly granted to `authenticated`; underlying RLS remains authoritative. Existing report views remain `security_invoker = true`.

## Advisor preflight baseline

Security and Performance Advisors were run against the current production schema before A2.4 DDL is applied. The reported items are pre-existing Store/support/auth/HR/index backlog; no A2.4 function or view exists in production yet, so no finding can currently be attributed to A2.4.

The post-migration Advisor rerun remains mandatory. A2.4 is not production-accepted if its new SECURITY INVOKER RPCs introduce a new Security or Performance Advisor finding.

## Release boundary

The schema change is intentionally not applied before the Admin application is ready for release because `is_low_stock` semantics change from the legacy threshold-zero behavior.

Post-merge production order:

1. Apply `modulex-admin/sql/a2-low-stock-reporting.sql` to production Supabase.
2. Run production reconciliation against the new functions/views.
3. Run Supabase Security and Performance Advisors and record any intentional pre-existing findings.
4. Deploy/verify Admin production on the merge SHA.
5. Verify `/low-stock`, `/reports/inventory`, and `/reports/movements` against the production RPCs.
6. Update this acceptance to production PASS and close the Phase A2 exit gate.
