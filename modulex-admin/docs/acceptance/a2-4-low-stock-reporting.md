# A2.4 Low-stock & Reporting Repository Acceptance

A2.4 repository acceptance: PASS

Accepted on: 2026-08-30
Baseline `main`: `c5c9af0601a18eda9840ff8c00e401ce0a27c82a`

## Accepted contract

- `products.min_stock_level` is the only reorder threshold source.
- `0` means the threshold is not configured and does not create an alert.
- Low stock is evaluated from Available (`On Hand - Reserved`) and requires `Available <= min_stock_level`.
- Product, location, low-stock, and movement reporting have narrow authenticated `SECURITY INVOKER` RPCs with stable ordering, exact filtered counts, and bounded interactive pages.
- Movement time/warehouse filters are supported at the database boundary and backed by created-at/from-warehouse/to-warehouse indexes.
- CSV exports page through bounded filtered RPC calls until the exact filtered count is reached, so they no longer inherit the former 1,000-row client query ceiling or depend on one unbounded PostgREST response.

## Verification

- `npm run smoke:a2-low-stock-reporting`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS

The production build used placeholder public Supabase configuration and performed no deployment.

## Production acceptance

A2.4 production acceptance: **NOT CLOSED**

- Migration `20260830155834_a2_low_stock_reporting` was applied successfully to production project `bzjoeernnmvuhzyvbowc` after a transaction-rollback preflight. The package replaced two views, created five read-only `SECURITY INVOKER` reporting RPCs, added two movement-report indexes, and changed no source-table data.
- Product reporting reconciled at 462 source/RPC rows: On Hand 462, Reserved 3, Available 459, with zero row or aggregate mismatches.
- Location reporting reconciled at 2 source/RPC rows; movement reporting reconciled at 4 source/RPC rows; filter options reconciled at 6 expected/actual rows. All mismatch counts were zero.
- All 462 active products currently have `min_stock_level = 0`; low-stock source view, new RPC, and legacy RPC each returned zero alerts. This confirms the production semantics `0 => no alert` and `Available = On Hand - Reserved`. Production also has zero negative, over-reserved, or otherwise invalid inventory rows.
- Authenticated production Data API/RLS smoke passed 20/20 under Node 22, including products, inventory, warehouses, movements, and legacy low-stock access.
- Supabase Security Advisor reported no A2.4 finding. Performance Advisor reported only INFO-level `unused_index` notices for the two newly created movement indexes; this is expected immediately after rollout with four movement rows and is not a correctness blocker. Unrelated pre-existing advisor findings were not modified.
- `/low-stock`, `/reports/inventory`, and `/reports/movements` each returned HTTP 200 with the expected Modulex Admin page title on the production domain.
- Deployment acceptance is blocked: current production deployment `dpl_C84xRNuhcoT4h2vcjaXTi9u1hFnJ` is READY at Git SHA `c5c9af0601a18eda9840ff8c00e401ce0a27c82a` (A2.3), so it does not contain the unmerged A2.4 Admin UI/RPC integration. A2.4 can close only after deployment from the accepted A2.4 merge SHA and authenticated browser verification of the three routes and filtered CSV exports.
