# Order Manual Service Line — Design

Date: 2026-09-01
Status: Approved
Scope: Modulex Admin customer order + invoice flow

## Goal

Add a first-class manual Service line to customer orders without pretending that the service has a Price Group price or stock. The operator must enter a detailed service description and a manual amount. The same historical description must remain visible on the order and on any invoice created from that order.

The Products card actions become compact semantic actions with a shared SVG plus icon:

- `+ Countertop`
- `+ Cabinet`
- `+ Service`

The plus sign must come from the shared icon system/SVG component, not from a literal text `+` glyph.

## Chosen approach

Use one canonical catalog product named `Service`, backed by a dedicated Product Type with pricing model `manual_service`.

This is preferred over:

1. **A product-less order line** — rejected because the current Order/Invoice model, audit trail, product snapshots, and item lifecycle are product-oriented.
2. **A normal `price_group` Service product** — rejected because the server would require a Price Group price and could not make the operator-entered amount authoritative.
3. **Free text outside order items** — rejected because it would not participate correctly in subtotal/tax/commission/invoice line generation.

The canonical Service product keeps the line inside the existing item model while the dedicated pricing route makes manual pricing explicit and auditable.

## Canonical reference data

Add a Product Type:

- Code: `SERVICE`
- Name: `Service`
- Pricing model: `manual_service`
- Default UOM: resolve existing active UOM by code `PIECE` during migration; do not hardcode a generated UUID.

Add one canonical active product:

- SKU: `SERVICE`
- Name: `Service`
- Product Type: `SERVICE`
- UOM: `PIECE`

The migration must be idempotent by stable code/SKU and must not create a Price Group price for this product.

## Order item data contract

Add nullable `line_note text` to `public.customer_order_items`.

For ordinary Cabinet/product and Countertop lines, `line_note` remains optional.

For `manual_service` lines the server must enforce:

- `product_id` resolves to an active/non-archived product whose Product Type pricing model is `manual_service`.
- `line_note` is required after trim and is stored as the historical service-detail snapshot.
- `quantity` is exactly `1`.
- `unit_price` must be explicitly supplied; an empty price is rejected.
- `unit_price >= 0`.
- `price_source = 'manual'`.
- `line_subtotal`, `discount_amount`, and `line_total` are calculated server-side from the supplied manual unit price and the existing discount semantics.
- No Price Group lookup is performed.
- No inventory reservation or release is performed for `manual_service` items.

The server, not the browser, remains authoritative for line totals and routing.

## Existing order mutation compatibility

The canonical create/update order RPC path must understand `manual_service` items in the same `p_items` JSON array used for ordinary products.

For a service item the JSON contract includes at minimum:

```json
{
  "product_id": "<canonical Service product id>",
  "quantity": 1,
  "unit_price": 10,
  "discount_percent": 0,
  "line_note": "Extra installation / field adjustment"
}
```

The create/update RPCs must fail closed when:

- the Service detail is blank,
- the manual amount is absent or negative,
- quantity is not `1`,
- a manual price is supplied for a route where manual pricing is not allowed,
- a `manual_service` product is sent through Price Group pricing.

Existing Countertop and Price Group product behavior must remain unchanged.

## Inventory behavior

`manual_service` is non-stock.

The order-item reservation/release triggers must explicitly skip `manual_service` lines. This is a domain rule, not a UI convention. A Service line must never create inventory reservations, movements, or availability pressure.

## Admin UI

### Products card actions

Replace the current two-action presentation with compact buttons whose visible labels omit the word `Add` and use a shared SVG plus icon:

- `+ Countertop`
- `+ Cabinet`
- `+ Service`

`Countertop` keeps the current Countertop configurator workflow.

`Cabinet` is the current ordinary product workflow, presented as the Cabinet action. It must exclude Product Types `STONE`, `SINK`, and `SERVICE`. Sink selection remains part of the Countertop workflow and is not exposed through Cabinet.

### Service interaction

`Service` opens a shared-primitive modal/form with exactly the required business inputs:

- **Service Detail*** — multiline text, required.
- **Service Price*** — manual amount in the order currency, required, numeric, >= 0. In the current Cabinet deployment this is displayed as USD.

Quantity is not asked; it is fixed to `1`.

On add, the line appears in the same Products table as other order lines.

### Service row presentation

A Service line shows:

- SKU/name snapshot: `SERVICE` / `Service`.
- The entered `line_note` directly below the product name as secondary line detail.
- Qty: `1`.
- Server/manual price.
- Existing discount and line total presentation.

Order Detail and Order Edit must both show the historical `line_note` from the order item, not a live product description.

All new/changed Admin UI must follow the strict shared-primitive/theme ownership rules; feature components must not introduce route-local color styling.

## Invoice snapshot contract

Add nullable `line_note text` to `public.customer_invoice_items`.

`private.create_customer_invoice_from_order` must copy `customer_order_items.line_note` into `customer_invoice_items.line_note` when the invoice is created.

The invoice item is an immutable commercial snapshot. Later edits to the Service catalog product or later order changes must not rewrite an already-created invoice line note.

Invoice admin/detail/print surfaces that render invoice items must display the line note under `Service` so the customer can see the detailed service provided.

## Tax, commission, discount and totals

A Service line participates in the same order financial totals as other sellable lines:

- included in order subtotal,
- subject to existing order tax behavior,
- subject to existing payment commission behavior,
- included in invoice subtotal/total,
- line discounts remain allowed using the existing order-line discount semantics.

No new tax or commission exception is introduced by this package.

## Permissions and audit

Use the existing `orders.manage` / canonical order mutation authorization model. Do not create a browser-only bypass or elevated client key.

The Service line uses the existing order/customer activity and invoice audit flow. No separate unrestricted direct table mutation is introduced.

## Migration strategy

One additive migration should:

1. extend `product_types.pricing_model` constraint to include `manual_service`, preserving existing values;
2. add `customer_order_items.line_note`;
3. add `customer_invoice_items.line_note`;
4. seed/upsert the stable `SERVICE` Product Type and `SERVICE` product using code/SKU and the existing `PIECE` UOM;
5. update order-item pricing/inventory guards for `manual_service`;
6. update canonical create/update order functions to accept and validate `line_note` + explicit manual price for Service;
7. update invoice-from-order snapshot copy;
8. preserve existing function permissions/security-definer/search-path hardening;
9. notify PostgREST to reload schema.

Existing orders/invoices require no backfill because their `line_note` is legitimately null.

## Tests / acceptance

TDD must cover at least:

- Service UI contract: Products actions are SVG-plus `Countertop` / `Cabinet` / `Service` and new UI uses shared primitives.
- Cabinet excludes `STONE`, `SINK`, and `SERVICE` Product Types.
- Service form rejects missing detail.
- Service form rejects missing/negative amount.
- Server rejects blank `line_note` for `manual_service` even if UI is bypassed.
- Server requires quantity `1` and manual price source.
- Server does not perform Price Group lookup for Service.
- Inventory reservation path skips Service.
- Order subtotal/total includes Service amount.
- Order Edit and Detail show the saved Service detail.
- Invoice creation copies `line_note` exactly.
- Invoice UI/print shows the saved Service detail.
- Existing Price Group Cabinet product behavior remains unchanged.
- Existing Countertop behavior remains unchanged.
- RBAC, strict Admin UI, typecheck, lint, production build and relevant Order/Invoice regression contracts remain green.

## Out of scope

- A reusable service catalog with many service SKUs.
- Service-specific tax categories.
- Time tracking, technician labor, cost accounting, scheduling, or fulfillment workflow for Service.
- Quantity-based Service entry; this package intentionally fixes quantity at `1`.
- Customer/vertical module architecture changes.
