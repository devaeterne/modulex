# A3.3 Pricing — production acceptance

Status: **PASS / CLOSED**.

## Pricing semantics

- Product price writes continue through `set_product_price` / `set_product_prices_bulk`.
- Each product/group/currency has at most one active open-ended price; valid periods cannot overlap.
- Prices are non-negative and historical rows close at the transaction timestamp.
- The base price group cannot be deleted, demoted, or deactivated; non-base lifecycle behavior remains available under the existing permission model.
- Pricing and cost/margin mutations use effective `pricing.manage` / `pricing.cost.view` permissions and remain RLS protected.
- Inserts, updates, and deletes on pricing tables are recorded in `audit_logs` by database triggers.
- `pricing_settings` audit records intentionally use `record_id = NULL` because its singleton row key is `smallint`; the row identity remains preserved in `old_data` / `new_data`.
- `product_margin_settings` audit identity uses `product_id`; UUID-keyed pricing tables use their row `id`.

## Dealer boundary

Dealer Portal pricing remains scoped to the caller's assigned active, order-visible, non-internal group and effective date. A missing dealer-tier price is represented as unavailable; it does not fall back to another group or public/list pricing.

## Production acceptance

- Supabase production migration `20260830213328_a3_3_pricing_hardening` is applied.
- Production reconciliation: 7 price groups, exactly 1 active base group, 2,778 current prices, 0 negative prices, 0 invalid periods, 0 inactive open-ended prices, and 0 overlapping effective-period pairs.
- Rollback-only lifecycle acceptance passed: base delete, base deactivation, and base demotion are rejected; non-base deletion succeeds.
- Rollback-only audit acceptance passed, including the `pricing_settings` non-UUID identity path without UUID-cast failure.
- Authenticated application-role `set_product_price` same-price probe passed inside an explicit transaction and rollback; no acceptance-test pricing mutation persisted.
- Dealer pricing functions were reconciled in production and preserve assigned-group, active/order-visible/non-internal, effective-date, and no-fallback behavior.
- Production Admin route smoke returned HTTP 200 for `/pricing/dashboard`, `/pricing/products`, `/pricing/groups`, and `/pricing/cost-margin`.
- Post-migration Supabase Security and Performance Advisor review found no A3.3-specific new finding; unrelated pre-existing advisor backlog remains outside this package.

## Repository verification

- `smoke:a3-3-pricing`: PASS on the implementation branch before merge.
- A3.1/A3.2, Dealer pricing, RBAC, Admin UI, typecheck, lint, and production build regression gates passed before merge.
- A3.3 implementation was merged before this closeout; this document records the completed production migration and acceptance evidence.

**A3.3 production acceptance: complete.**
