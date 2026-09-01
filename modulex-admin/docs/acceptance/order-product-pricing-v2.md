# Orders — Product Type / UOM / Pricing Model Acceptance

Status: `[~]` implementation + CI verification in draft PR. Production acceptance is intentionally not marked complete.

## Architecture contract

- `customer_orders` / `customer_order_items` remain the canonical Order aggregate.
- Product Type owns routing semantics through `product_types.pricing_model`; it does not store price formulas or amounts.
- UOM is quantity/measure semantics only.
- `price_group` order lines reuse the existing `price_groups` + `product_prices` source. Client-provided `unit_price` is not authoritative.
- `countertop_material_band` is not ordinary Order pricing. Stone remains behind `calculate_countertop_price -> attach_countertop_configuration`.
- `none` fails closed for commercial order lines.
- Inventory continues to use the existing reservation/movement engine. Countertops keep `countertop_reservation_quantity` as the physical slab reservation quantity.
- Historical line money is never live-repriced. Additive Product Type/UOM/pricing-route snapshots preserve semantic history.

## RED -> GREEN evidence

- RED commit: `df6024eb5ab924f990e1f4e8142e6cb4ee0455af`
  - introduced the Order routing contract before the migration/UI existed;
  - expected failure: missing `20260901130000_order_product_pricing_routing.sql` and semantic routing UI.
- GREEN implementation is covered by `scripts/order-product-pricing-routing-contract.mjs` and the existing `smoke:a1-core-operations` CI contract.

## Acceptance matrix

- `[~]` Standard (`price_group`) resolves current order Price Group price server-side.
- `[~]` Sink (`price_group`) follows the same ordinary order pricing path.
- `[~]` Stone (`countertop_material_band`) ordinary Order DML fails closed.
- `[~]` Canonical Countertop attach remains the only Stone commercial-price writer and preserves audited override behavior.
- `[~]` `pricing_model=none` fails closed.
- `[~]` Product Type, UOM, and pricing route are visible with friendly labels in the shared Create/Edit product picker.
- `[~]` Product Type/UOM/pricing route are additive line snapshots; historical money remains unchanged by the backfill.
- `[~]` Client unit-price tampering is ignored for Price Group rows; line totals and deferred order totals are reconciled server-side.
- `[~]` Existing customer/dealer Price Group selection remains the order-level price group source.
- `[~]` Existing inventory reservation/movement engine remains unchanged.
- `[~]` Countertop slab reservation continues to use `countertop_reservation_quantity`.
- `[~]` RBAC is preserved; new private trigger helpers expose no direct caller execute surface.
- `[~]` Admin UI Foundation contract must pass on final HEAD.
- `[~]` Store/portal code is not changed; existing portal boundary CI remains regression evidence.

## Known fail-closed limitation

The current canonical Countertop attach API requires an existing `order_item_id`. The repository does not expose a separate canonical Countertop job/placeholder creation RPC that can create that item while ordinary Stone order-line creation is prohibited. This PR does **not** invent a second bootstrap workflow. Ordinary Stone creation therefore remains fail-closed; already-existing/configurable countertop lines continue through the canonical Countertop workspace. A future business-approved Countertop bootstrap contract should define how the first Stone order item is created.

## Runtime / production safety

- Production migration execution: **NONE**
- Permanent production business-data mutation: **NONE**
- Deployment: **NONE**
- Merge: **NONE**
- Runtime SQL fixtures: **NONE** (therefore no rollback cleanup was required)

## Manual browser acceptance still required before production `[x]`

1. Create/Edit: verify Standard and Sink show `Price Group`, correct Product Type/UOM labels, and can be selected.
2. Create/Edit: verify Stone shows `Countertop Material Band` with the Countertop routing explanation and cannot be added through ordinary pricing.
3. Create/Edit: verify a `No Commercial Pricing` Product Type cannot be added.
4. Detail/history: verify stored line money remains unchanged after changing live UOM/Product Type metadata in an isolated non-production acceptance environment.
5. Countertop: verify an existing draft Stone line still opens the current Countertop configurator and audited override behavior remains unchanged.
