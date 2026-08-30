# A3.3 Pricing — implementation acceptance

Status: implementation complete; production migration and authenticated acceptance pending.

## Pricing semantics

- Product price writes continue through `set_product_price` / `set_product_prices_bulk`.
- Each product/group/currency has at most one active open-ended price; valid periods cannot overlap.
- Prices are non-negative and historical rows close at the transaction timestamp.
- Base price groups cannot be deactivated; existing active/order-visibility flags remain authoritative.
- Pricing and cost/margin mutations use effective `pricing.manage` / `pricing.cost.view` permissions and remain RLS protected.
- Every insert, update, and delete on pricing tables is recorded in `audit_logs` by a database trigger.

## Dealer boundary

Dealer Portal pricing remains scoped to the caller's assigned active, order-visible, non-internal group and effective date. A missing dealer-tier price is represented as unavailable; it does not fall back to public/list pricing.

## Verification

- `smoke:a3-3-pricing`: PASS
- A3.1/A3.2, Store dealer pricing, RBAC, typecheck, lint, build, advisor checks: pending final gate after migration review.
- No production data was changed and the migration has not been applied to production.
