# PB-6 Gross Profit Commission Acceptance

Status: ready for review; production schema applied, UI branch not merged/deployed

## Business rule

Gross-profit commission equals scoped non-cancelled Project Order line revenue minus canonical current product cost, multiplied by the commission percentage.

- Revenue: `customer_order_items.line_total`
- Cost: `customer_order_items.quantity × current active product_costs.amount`
- Tax and payment fees are excluded.
- Missing product cost, mixed currency, empty scope, and non-positive gross profit fail closed.
- Existing fixed and sales-percentage commission semantics remain unchanged.
- Actual payouts remain canonical Finance transactions; no second payment ledger was introduced.

## TDD evidence

RED:
- Admin Project Base run `33932940857`, job `101215122784`
- Existing PB-6 contracts passed; the new gross-profit contract failed before implementation because the new UI/DB behavior did not yet exist.

GREEN code head: `858f4b2c851b08f6df7452957b63a112c60cd227`
- Admin Project Base `33933748649`: success, including existing PB-6 contracts and the new gross-profit commission contract.
- Admin UI Foundation `33933748610`: success, including strict UI changed-file gate, RBAC regression, TypeScript, lint, and production build.
- Store Core CI `33933748739`: success.

## Production schema verification

Applied production migration: `customer_project_gross_profit_commission` from canonical repository migration `20260905180000_customer_project_gross_profit_commission.sql`.

Post-migration checks:
- gross-profit basis helper exists
- calculation preview RPC exists
- `basis_revenue_amount` and `basis_cost_amount` snapshot columns exist
- preview RPC execute: `authenticated = true`, `anon = false`

Sample Project `P-2026-000003` current real-data state:
- scoped sales: `$6,540.70`
- known canonical current product cost: `$524.00`
- missing-cost lines: `2`
- gross-profit basis: unavailable until those real product costs are entered, as intended by fail-closed behavior

## Rollback-only smoke

A single production transaction temporarily supplied demo costs only for the two missing-cost sample products, bringing total scoped product cost to exactly `$4,000.00`.

Canonical helper result inside that transaction:
- sales: `$6,540.70`
- product cost: `$4,000.00`
- gross profit: `$2,540.70`
- commission at `2%`: `$50.81`
- smoke result: `PASS`

The transaction was rolled back. Follow-up residue verification returned:
- `PB6_ROLLBACK_SMOKE` rows remaining: `0`
- current demo-product cost rows remaining: `0`

No fake demo cost persisted.

## Security boundary

The public preview RPC is `SECURITY DEFINER` intentionally, following the PB-6 RPC pattern, but performs an explicit `super_admin/admin/finance` role check. PUBLIC execution is revoked; only `authenticated` receives execute and `anon` does not.

Project Participants & Commission internal detail remains Finance/Admin/Super Admin only. Project Participant Roles is discoverable under General Settings; mutation remains separately guarded for Admin/Super Admin.
