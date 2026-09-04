# PB-3B — Project Procurement Design

Date: 2026-09-04
Status: In-chat design approved; written spec pending project-owner review
Branch: `feat/project-procurement-pb3b`
Baseline main: `79c6fa7629d13d39d5af2c241087df10e213dd48`

## 1. Goal

Make Project procurement first-class without duplicating Vendor Catalog, Inventory, or Finance truth.

Project Procurement must answer:

1. What product does this Project need to buy?
2. Which vendor is it being bought from?
3. What is the vendor cost?
4. Has it been delivered?
5. Has it been invoiced, and what invoice cost belongs to this Project/product?

The Project view stays compact:

`Vendor | Product | Qty | Vendor Cost | Delivery | Invoiced | Invoice No | Invoice Cost | PO No`

Payment state is out of scope. `Paid / Unpaid / Due / Payment Date / Payment Method` belongs to Finance.

## 2. Non-goals

PB-3B does **not**:

- create or update Modulex warehouse inventory;
- create `inventory_movements` when vendor goods are delivered;
- make Vendor Catalog the procurement ledger;
- implement vendor bill payment or cash-out tracking;
- silently change PB-2 Project profitability calculations;
- expose Procurement detail to Store, Customer Portal, or Dealer Portal;
- build a full standalone Purchase Order document module.

A lightweight Vendor Order / PO number is sufficient in PB-3B.

## 3. Core model: demand is separate from vendor commitment

A confirmed Customer Order is the source of Project procurement demand. Procurement is not manually created from scratch.

```text
Project
  └── Customer Order
       └── Order Item / configured purchasable component
            └── Procurement Requirement   (current demand, auto-synced)
                 └── Vendor Commitment(s) (what was actually ordered)
                      ├── Delivery Event(s)
                      └── Vendor Invoice Allocation(s)

Vendor Invoice
  └── may allocate to commitments from many Projects
```

Current Order demand may change later. A vendor order that has already been placed must not be silently rewritten.

## 4. What becomes a Procurement Requirement

The sync derives **purchasable components**, not blindly every commercial Order line.

### 4.1 Ordinary Order items

For a non-configured physical product line:

- product = `customer_order_items.product_id`;
- quantity = `customer_order_items.quantity`;
- service-only `SERVICE` lines do not create Procurement Requirements.

This allows normal Sink, Faucet, Standard/cabinet-type physical products, and other approved physical product types to enter Procurement automatically.

### 4.2 Configured Countertop lines

Current production truth stores configured Countertop purchasing data separately from the commercial measurement:

- `countertop_configurations.stone_product_id`
- `countertop_configurations.slab_quantity`
- optional `countertop_configurations.sink_product_id`
- the commercial Order quantity may represent sqft and must **not** be treated as stone purchase quantity.

Therefore a configured Countertop line expands into component requirements:

1. **Stone requirement**
   - product = `stone_product_id`;
   - required quantity = `slab_quantity`;
   - source kind = `countertop_stone`.
2. **Sink requirement**, when present
   - product = `sink_product_id`;
   - required quantity = `1` for the current one-sink configuration contract;
   - source kind = `countertop_sink`.

The generic sqft Order quantity is not duplicated as another Stone procurement row.

This is important for the approved business model: e.g. a 55 sqft countertop using 2 slabs creates a Stone procurement requirement of **2 slabs**, not 55 units, and its configured Sink appears as its own procurement product.

If a required procurement quantity cannot be derived from canonical configuration truth, the row becomes an explicit attention state (`Quantity Required`) and cannot be ordered. Procurement metadata gaps do not fabricate a quantity.

## 5. Automatic Order → Procurement synchronization

### 5.1 Confirmation

When a Project-linked Customer Order successfully reaches `confirmed`, the authoritative DB workflow runs an idempotent:

`sync_customer_order_procurement(order_id)`

Draft Orders create no Procurement Requirements.

Standalone Orders with `project_id = null` remain valid and do not create Project Procurement records.

### 5.2 Confirmed revisions

When an approved non-Draft Order revision is actually applied, the same sync runs after the canonical Order mutation completes.

Frontend behavior is never the only synchronization boundary. Approval-driven or other canonical DB/RPC paths must yield the same Procurement result.

### 5.3 Requirement identity

A Requirement is unique by its canonical procurement source, conceptually:

`order_item_id + source_kind + source_product_id`

This allows one configured Countertop Order item to produce both Stone and Sink requirements without duplication.

### 5.4 Before vendor commitment

If no vendor commitment exists, Order/configuration changes refresh the Requirement directly:

- product/component identity;
- required quantity;
- vendor resolution;
- expected vendor cost snapshot when available.

### 5.5 After vendor commitment

Existing vendor commitments are historical operational truth.

If demand increases:

```text
Current demand      12
Already ordered     10
Open to purchase     2
```

The prior commitment remains unchanged; the extra 2 becomes explicit open quantity for another commitment.

If demand decreases:

```text
Current demand       8
Already ordered     10
Excess ordered       2
```

The prior commitment remains unchanged; `Excess Ordered` is surfaced for reconciliation.

No destructive rewrite occurs.

## 6. Vendor resolution

Vendor resolution order:

1. approved/linked canonical Vendor Catalog relationship;
2. canonical product metadata vendor identity;
3. otherwise unresolved.

Stone and Sink imports currently carry vendor identity through these canonical paths and should resolve automatically.

If no vendor is resolved, the Requirement is `Vendor Required` and cannot become Ordered until resolved.

PB-3B does not introduce a broad Vendor Master redesign. Procurement stores normalized vendor code/key plus display-name snapshots so it is not coupled to mutable catalog rows.

## 7. Procurement Requirement

A Requirement represents current demand from a confirmed Order/component.

Conceptual fields:

- `id`
- `project_id`
- `order_id`
- `order_item_id`
- `source_kind` (`order_item`, `countertop_stone`, `countertop_sink`)
- source/configuration identifier where needed
- `product_id`
- `sku_snapshot`
- `product_name_snapshot`
- `required_quantity`
- `vendor_code`
- `vendor_name_snapshot`
- `expected_unit_cost`
- `expected_cost_currency`
- attention state (`ready`, `vendor_required`, `cost_required`, `quantity_required`)
- actor/timestamps

The Requirement is auto-synced current demand, not the historical vendor purchase record.

## 8. Vendor Commitment

A Vendor Commitment represents a real purchase placed with a vendor for some or all of a Requirement.

Conceptual fields:

- `id`
- `requirement_id`
- Project/Order/Order Item linkage
- vendor identity snapshot
- `ordered_quantity`
- `agreed_unit_cost`
- `currency_code`
- `vendor_order_no` / `po_no`
- `ordered_at`
- optional `confirmed_at`
- cancellation/correction metadata
- actor/timestamps

`Vendor Order / PO No` is required when creating an Ordered commitment.

Default ordered quantity:

`max(required_quantity - active_committed_quantity, 0)`

PB-3B rejects ordering more than current open quantity instead of inventing an over-order behavior.

Vendor commitments are not physically rewritten because a later Customer Order changed. Corrections/cancellations are explicit and audited.

## 9. Vendor cost truth

PB-3B keeps three costs distinct:

1. **Expected Vendor Cost** — snapshot from canonical product cost when the requirement is created/synced.
2. **Agreed Vendor Cost** — actual vendor unit cost recorded when a commitment is placed.
3. **Invoice Cost** — actual vendor-invoice amount allocated to this Project/product commitment.

Missing canonical cost becomes `Cost Required`; it never becomes fake zero.

If agreed vendor cost differs from expected cost, agreed cost becomes the operational purchase cost for that commitment.

PB-2 profitability is not silently switched to Procurement cost in PB-3B.

No FX conversion is invented. Native currencies remain visible; cross-currency comparison fails closed or displays a mismatch.

## 10. Delivery truth

Delivery is procurement receipt truth only. **No inventory or stock movement is created.**

Delivery is quantity-based and append-safe.

Conceptual Delivery Event:

- `id`
- `commitment_id`
- `delivered_quantity`
- `delivered_date`
- optional notes
- actor/timestamps

Derived states:

- `Not Delivered`
- `Partially Delivered` (`6 / 10`)
- `Delivered`

Effective delivered quantity cannot exceed active ordered quantity.

Corrections preserve history rather than overwriting receipt truth.

## 11. Vendor Invoice model

A Vendor Invoice is **not owned by one Project**.

One month-end vendor invoice may cover products for many Projects. The same canonical invoice must therefore link to commitments across many Projects. One commitment may also be split across several vendor invoices.

### 11.1 Canonical Vendor Invoice header

Conceptual fields:

- `id`
- normalized `vendor_code`
- `vendor_name_snapshot`
- `invoice_number`
- normalized vendor-scoped invoice key
- `invoice_date`
- `total_amount`
- `currency_code`
- actor/timestamps

Vendor-scoped uniqueness means two different vendors may use the same invoice number; the same vendor may not create duplicate canonical invoice records for the same normalized number.

The header contains **no payment state** in PB-3B.

The header total/date/currency exist for canonical reconciliation and later Finance consumption. The Project Procurement UI does not need to present the whole multi-Project invoice total as Project cost.

### 11.2 Procurement invoice allocation

A join/allocation links a Vendor Invoice to a Vendor Commitment:

- `invoice_id`
- `commitment_id`
- `invoiced_quantity`
- `allocated_amount`
- `currency_code`
- actor/timestamps

This supports:

- one invoice across ten Project stone purchases;
- one commitment across multiple invoices;
- partial invoicing;
- Project-specific invoice cost while preserving one canonical invoice.

Example:

```text
Vendor Invoice VS-2026-0831 total: $12,000

Project A / Stone A -> Invoice Cost $1,200
Project B / Stone B -> Invoice Cost   $900
Project C / Stone C -> Invoice Cost $1,450
...
```

Project A sees its invoice number and its allocated $1,200, not the full $12,000.

Effective allocations may not exceed the invoice header total. The invoice may remain partially allocated while other Projects/Finance have not linked all lines.

Allocation currency must match invoice currency. Vendor identity must match the commitment.

## 12. Invoiced state

Invoice state is independent from delivery state; an invoice may arrive before or after physical delivery.

Derived states use invoiced quantity:

- `Not Invoiced`
- `Partially Invoiced`
- `Invoiced`

This intentionally avoids a false strict `Delivered → Invoiced` lifecycle.

## 13. Project Procurement UI

The existing Project `Procurement` tab replaces its staged placeholder with the real domain surface.

Primary table:

`Vendor | Product | Qty | Vendor Cost | Delivery | Invoiced | Invoice No | Invoice Cost | PO No`

Behavior:

- readable grouping by Order/product where useful;
- configured Countertop Stone and Sink appear as separate purchasable products;
- multiple commitments remain visible when Order demand changed after ordering;
- partial delivery shows `delivered / ordered`;
- multiple invoice numbers may appear for split invoicing;
- shared invoice numbers naturally repeat across Projects because they reference one canonical invoice;
- `Vendor Required`, `Cost Required`, `Quantity Required`, `Open to Purchase`, and `Excess Ordered` are explicit attention states;
- loading, empty, error/retry, and permission-denied states use canonical Admin UI patterns.

Admin UI must use shared Modulex primitives from `ADMIN_UI_GUIDE.md`.

## 14. Actions and roles

### Admin

Admin can:

- resolve/select missing vendor;
- create Ordered Vendor Commitments with PO, quantity, agreed vendor cost and currency;
- record vendor confirmation;
- record partial/full delivery;
- create/link Vendor Invoices;
- allocate invoice quantity/cost;
- perform explicit audited corrections/cancellations.

### Finance

Finance can:

- view vendor costs and invoice costs;
- create/link canonical Vendor Invoices;
- allocate invoice quantity/cost to Project commitments.

Finance does not own Order demand, vendor-order quantity, or delivery execution in PB-3B.

### Sales

Sales receives a sanitized operational projection only:

- product;
- required/ordered status;
- delivery status;
- invoiced status.

Sales does not receive vendor cost, agreed cost, invoice amount, Project invoice allocation amount, or outgoing-payment information.

## 15. Authorization

Introduce explicit permissions:

- `project_procurement.view`
- `project_procurement.manage`

Detailed cost/invoice RPCs additionally enforce approved Admin/Finance roles at the authoritative DB boundary.

Sales-safe reads use a narrow projection/RPC excluding cost and invoice amount fields.

RLS, grants, RPC security mode, pinned search paths, and direct-table privileges are acceptance requirements. No Store/Portal projection is added.

## 16. Audit and correction semantics

Procurement preserves its own operational history.

Historical truths that cannot be silently destroyed:

- vendor commitment + PO number;
- delivery events;
- invoice allocations;
- vendor invoice identity.

Requirement synchronization may change current demand. Historical commitments remain independently readable.

Physical delete is not the default for historical procurement records.

## 17. DB-authoritative integration points

Required integration points:

1. after successful Project-linked Order transition to `confirmed`;
2. after an approved confirmed Order revision is actually applied.

Both call the same idempotent sync function.

Repeated sync must not duplicate Requirements or Vendor Commitments.

No sync or delivery operation creates Inventory movements.

## 18. Failure behavior

PB-3B fails closed when truth is ambiguous:

- missing vendor -> `Vendor Required`, cannot order;
- missing cost -> `Cost Required`, never zero;
- missing derivable purchase quantity -> `Quantity Required`, cannot order;
- order quantity beyond current open purchase quantity -> reject;
- delivery above ordered quantity -> reject;
- invoice allocation above invoice total -> reject;
- invoice currency mismatch -> reject;
- vendor mismatch -> reject;
- Project/Order/Order Item/source mismatch -> reject;
- Sales detailed-cost access -> SQLSTATE `42501` or established equivalent;
- unsupported FX -> no conversion.

## 19. TDD and acceptance

Minimum locked scenarios:

1. Draft Project Order creates no Procurement Requirement.
2. Confirmed Project Order sync is idempotent.
3. Standalone confirmed Order creates no Project Procurement.
4. Ordinary physical Order line uses Order quantity.
5. SERVICE line creates no Procurement Requirement.
6. Configured Countertop Stone uses `slab_quantity`, not sqft Order quantity.
7. Configured Countertop Sink creates its own requirement when present.
8. Stone vendor resolves from canonical vendor data.
9. Sink vendor resolves from canonical vendor data.
10. Unknown vendor -> `Vendor Required`, blocks ordering.
11. Missing cost -> `Cost Required`, never zero.
12. Pre-order confirmed revision updates requirement demand.
13. Post-order quantity increase preserves commitment and exposes open quantity.
14. Post-order quantity decrease preserves commitment and exposes excess ordered.
15. Ordered action requires PO/vendor order number.
16. Partial delivery aggregates correctly; over-delivery fails.
17. Delivery creates zero `inventory_movements`.
18. One Vendor Invoice allocates across multiple Projects.
19. One commitment accepts multiple invoices.
20. Partial invoice derives `Partially Invoiced`.
21. Project shows allocated Invoice Cost, not the entire shared invoice total.
22. Invoice over-allocation/vendor/currency mismatch fails closed.
23. Admin management succeeds.
24. Finance invoice allocation succeeds but cannot mutate Order demand/delivery ownership outside approved scope.
25. Sales sanitized status succeeds.
26. Sales vendor/invoice cost read and mutations are denied.
27. Store/Portal contracts remain unchanged.
28. Project UI strict gate, relevant Admin regressions, TypeScript, lint and production build pass.
29. Rollback-only production smoke proves sync, commitment, partial delivery and shared invoice allocation with zero residue.
30. Supabase Security/Performance Advisors show no new PB-3B blocking finding.

## 20. Rollout boundary

PB-3B ships additively:

1. schema + private/public RPC boundaries;
2. Order lifecycle synchronization;
3. Admin Project Procurement adapter/UI;
4. role/security tests;
5. migration application and rollback-only production acceptance;
6. Advisor review;
7. user-owned merge/deploy acceptance.

PB-2 profitability remains unchanged during this rollout.

PB-4 Finance consumes the same canonical Vendor Invoice truth for payment/outgoing-cash workflow. PB-4 must not duplicate a vendor invoice merely because it was first created/linked from Project Procurement.

## 21. Locked business boundary

**Project Procurement = what we bought + from whom + vendor cost + delivered? + invoiced? + Project invoice cost.**

**Finance = has the vendor invoice been paid + when + how much remains + outgoing cash.**

This separation is the primary PB-3B design constraint.