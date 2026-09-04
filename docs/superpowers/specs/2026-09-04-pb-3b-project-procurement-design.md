# PB-3B — Project Procurement Design

Date: 2026-09-04
Status: Approved design, pending implementation plan
Branch: `feat/project-procurement-pb3b`
Baseline main: `79c6fa7629d13d39d5af2c241087df10e213dd48`

## 1. Goal

Make Project procurement first-class without turning Vendor Catalog, Inventory, or Finance into duplicate systems.

The Project Procurement surface must answer five business questions:

1. What product does this Project need to buy?
2. Which vendor is it being bought from?
3. What is the vendor cost?
4. Has it been delivered?
5. Has it been invoiced, and what invoice cost belongs to this Project/product?

The target Project view is intentionally compact:

`Vendor | Product | Qty | Vendor Cost | Delivery | Invoiced | Invoice No | Invoice Cost | PO No`

Payment state is explicitly out of scope. `Paid / Unpaid / Due / Payment Date / Payment Method` belongs to the Finance work queue, not Project Procurement.

## 2. Non-goals

PB-3B does **not**:

- create or update Modulex warehouse inventory;
- create `inventory_movements` when vendor goods are delivered;
- make Vendor Catalog the procurement ledger;
- implement vendor bill payment or cash-out tracking;
- change PB-2 Project profitability calculations automatically;
- expose Procurement detail to Store, Customer Portal, or Dealer Portal;
- build a full standalone Purchase Order document module.

A lightweight Vendor Order / PO number is sufficient for PB-3B. A richer purchasing-document module may be added later without changing the procurement truth defined here.

## 3. Core model: Demand is separate from vendor commitment

A confirmed Customer Order is the source of Project procurement demand. Procurement is not manually created from scratch.

The model separates the current Order requirement from what has already been committed to a vendor:

```text
Project
  └── Customer Order
       └── Order Item
            └── Procurement Requirement   (current demand, auto-synced)
                 └── Vendor Commitment(s) (what was actually ordered)
                      ├── Delivery Event(s)
                      └── Vendor Invoice Allocation(s)

Vendor Invoice
  └── may allocate to commitments from many Projects
```

This separation is required because confirmed Orders may later be revised. The current Order demand may change, but a vendor order that has already been placed must not be silently rewritten.

## 4. Automatic Order → Procurement synchronization

### 4.1 Confirmation

When a Project-linked Customer Order successfully reaches `confirmed`, the authoritative DB workflow runs:

`sync_customer_order_procurement(order_id)`

The sync creates or refreshes one Procurement Requirement per purchasable Order Item.

Draft Orders do not create Procurement Requirements.

Standalone Orders with `project_id = null` remain valid and do not create Project Procurement records.

### 4.2 Confirmed revisions

When an approved non-Draft Order revision is actually applied, the same authoritative sync runs after the canonical Order mutation completes.

Frontend behavior is never the only synchronization boundary. Approval-driven or other canonical DB/RPC paths must produce the same Procurement result.

### 4.3 Before a vendor order exists

If no vendor commitment has been created for a requirement, Order changes update the requirement directly:

- product;
- required quantity;
- vendor resolution;
- expected vendor cost snapshot when available.

### 4.4 After a vendor order exists

Existing vendor commitments are historical operational truth and are not silently changed by later Customer Order revisions.

If current Order demand increases:

- the Requirement quantity increases;
- the already-ordered commitment remains unchanged;
- the difference becomes an explicit open quantity available for an additional vendor commitment.

Example:

```text
Order demand        10
Already ordered     10
Order revised to    12
----------------------
Open to purchase     2
```

If current Order demand decreases:

- the Requirement quantity decreases;
- the already-ordered commitment remains unchanged;
- the difference is surfaced as `Excess Ordered` / reconciliation attention.

Example:

```text
Order demand revised to   8
Already ordered          10
---------------------------
Excess ordered            2
```

No destructive rewrite is performed.

## 5. Vendor resolution

Vendor resolution is automatic where the canonical product data supports it.

Resolution order:

1. approved/linked canonical Vendor Catalog relationship;
2. canonical product metadata vendor identity;
3. otherwise unresolved.

Stone and Sink vendor imports already carry vendor identity through the current canonical catalog/metadata paths and should resolve automatically.

If no vendor can be resolved, the Requirement is shown as `Vendor Required`.

A requirement with `Vendor Required` cannot become `Ordered` until a vendor is selected/resolved.

PB-3B does not introduce a broad Vendor Master redesign. Procurement stores a normalized vendor key/code plus a display-name snapshot so existing catalog identity can be used without coupling the procurement ledger to mutable catalog rows.

## 6. Procurement Requirement

A Requirement represents current demand from one confirmed Order Item.

Conceptual fields:

- `id`
- `project_id`
- `order_id`
- `order_item_id`
- `product_id`
- `sku_snapshot`
- `product_name_snapshot`
- `required_quantity`
- `vendor_code`
- `vendor_name_snapshot`
- `expected_unit_cost`
- `expected_cost_currency`
- `cost_state` (`available` / `cost_required`)
- timestamps / actor metadata

The Requirement is auto-synced from the confirmed Order. It is not the historical vendor purchase record.

## 7. Vendor Commitment

A Vendor Commitment represents an actual purchase placed with a vendor for some or all of a Requirement.

Conceptual fields:

- `id`
- `requirement_id`
- `project_id`
- `order_id`
- `order_item_id`
- vendor identity snapshot
- `ordered_quantity`
- `agreed_unit_cost`
- `currency_code`
- `vendor_order_no` / `po_no`
- `ordered_at`
- `confirmed_at`
- `cancelled_at`
- correction/cancellation reason where applicable
- actor/timestamp metadata

`Vendor Order / PO No` is required when creating an `Ordered` commitment.

The default ordered quantity is the current open quantity:

`max(required_quantity - active_committed_quantity, 0)`

The DB must reject ordering more than the open quantity unless an explicit controlled override is later designed. PB-3B should fail closed rather than invent an over-order behavior.

Vendor commitments are not physically rewritten because a later Customer Order changed. Explicit correction/cancellation paths preserve history.

## 8. Vendor cost truth

PB-3B keeps three cost concepts distinct:

1. **Expected Vendor Cost** — snapshot from the current canonical product cost when the confirmed requirement is created/synced.
2. **Agreed Vendor Cost** — actual vendor unit cost recorded on the Vendor Commitment when the purchase is placed.
3. **Invoice Cost** — actual amount allocated from a vendor invoice to this commitment / Project product.

If canonical cost is missing at confirmation, Procurement shows `Cost Required`; it never substitutes `0`.

If the agreed vendor cost differs from the expected cost, the agreed cost becomes the operational purchase cost shown for that commitment.

PB-3B does not silently change PB-2 profitability to consume Procurement cost. That integration must be explicit in a later package after production reconciliation rules are approved.

No FX conversion is invented. Costs remain currency-aware and are displayed with their native currency. Cross-currency comparisons fail closed or show a mismatch rather than producing a synthetic converted number.

## 9. Delivery truth

Delivery is procurement receipt truth only. It does **not** create warehouse stock.

Delivery is append-safe and quantity based so partial receipt is supported.

Conceptual Delivery Event fields:

- `id`
- `commitment_id`
- `delivered_quantity`
- `delivered_date`
- optional notes
- actor/timestamp metadata

Derived display states:

- `Not Delivered`
- `Partially Delivered` — e.g. `6 / 10`
- `Delivered` — effective delivered quantity reaches ordered quantity

The DB rejects effective delivered quantity above the active ordered quantity.

Corrections must preserve history rather than directly deleting or overwriting prior delivery truth.

No `inventory_movements` row is created by this flow.

## 10. Vendor Invoice model

A Vendor Invoice is not owned by one Project.

One vendor may send a single month-end invoice covering purchases for many Projects. The same invoice therefore must be linkable to multiple Procurement commitments across multiple Projects.

Conversely, one commitment may be invoiced by multiple vendor invoices.

### 10.1 Canonical Vendor Invoice

Conceptual fields:

- `id`
- normalized `vendor_code`
- `vendor_name_snapshot`
- `invoice_number`
- normalized invoice-number key for vendor-scoped uniqueness
- `invoice_date`
- `total_amount`
- `currency_code`
- actor/timestamps

Canonical identity is vendor-scoped: the same invoice number from two different vendors is allowed; duplicate invoice numbers for the same normalized vendor are rejected.

The invoice header contains no payment state in PB-3B.

### 10.2 Procurement invoice allocation

A join/allocation record links a Vendor Invoice to a Vendor Commitment.

Conceptual fields:

- `invoice_id`
- `commitment_id`
- `invoiced_quantity`
- `allocated_amount`
- `currency_code`
- actor/timestamps

This enables all approved scenarios:

- one invoice across ten different Project stone purchases;
- one commitment invoiced in multiple invoices;
- partial invoicing;
- Project-specific invoice cost while preserving one canonical vendor invoice.

Example:

```text
Vendor Invoice VS-2026-0831 total: $12,000

Project A / Stone A -> allocated invoice cost $1,200
Project B / Stone B -> allocated invoice cost $900
Project C / Stone C -> allocated invoice cost $1,450
...
```

Project A sees only its relevant invoice number and allocated invoice cost. It does not treat the full $12,000 vendor invoice as Project A cost.

Invoice allocations may not exceed the invoice header total. The invoice may remain partially allocated while Finance or other Projects have not yet linked all lines.

Invoice allocation currency must match the canonical Vendor Invoice currency. No FX conversion occurs inside PB-3B.

## 11. Invoiced state

Invoice state is independent from delivery state; an invoice may arrive before or after physical delivery.

Derived Project display states are based on invoice allocation quantity:

- `Not Invoiced` — no effective invoice allocation;
- `Partially Invoiced` — allocated invoiced quantity is less than ordered quantity;
- `Invoiced` — effective invoiced quantity reaches ordered quantity.

This avoids forcing an incorrect strict lifecycle such as `Delivered → Invoiced` when vendor business practice differs.

## 12. Project Procurement UI

The existing `Procurement` tab in Project Detail becomes a real domain surface and replaces its staged placeholder.

Primary table:

`Vendor | Product | Qty | Vendor Cost | Delivery | Invoiced | Invoice No | Invoice Cost | PO No`

Behavior:

- grouped/readable by Order and product where useful;
- multiple commitments for one Order Item remain visible when demand changed after ordering;
- partial delivery is displayed as `delivered / ordered`;
- multiple invoice numbers can be shown for split invoicing;
- shared vendor invoice numbers naturally repeat across Projects because they point to the same canonical invoice;
- `Cost Required`, `Vendor Required`, `Open to Purchase`, and `Excess Ordered` are explicit attention states;
- loading, empty, error/retry, and permission-denied states use canonical Admin patterns.

Admin UI must use the shared Modulex primitives from `ADMIN_UI_GUIDE.md`; no route-local button/input/table/card/modal visual system is introduced.

## 13. Project actions

### Admin

Admin can:

- resolve/select missing vendor;
- create an Ordered Vendor Commitment with PO number, quantity, agreed vendor cost and currency;
- mark vendor confirmation where needed;
- record partial/full delivery;
- create/link Vendor Invoices;
- allocate invoice quantity/cost to commitments;
- perform explicit controlled corrections/cancellations with audit reason.

### Finance

Finance can:

- view procurement vendor costs and invoice costs;
- create/link canonical Vendor Invoices;
- allocate invoice quantity/cost to Project commitments.

Finance does not own Order demand, vendor-order quantity, or delivery execution in this package.

### Sales

Sales gets a sanitized operational projection only:

- product;
- required/ordered status;
- delivery status;
- invoiced status.

Sales does not receive vendor cost, agreed unit cost, invoice amount, Project invoice allocation amount, or outgoing-payment information.

## 14. Authorization boundary

Introduce explicit Procurement permissions rather than piggybacking on generic Project edit permission:

- `project_procurement.view`
- `project_procurement.manage`

Detailed cost/invoice mutation RPCs must additionally enforce approved Admin/Finance roles at the authoritative DB boundary.

Sales-safe status reads must use a narrow projection/RPC that excludes cost and invoice amount fields.

Direct browser access to canonical procurement/invoice tables must not bypass the RPC/role model. RLS, grants, RPC security mode, pinned search paths, and direct-table privileges are part of acceptance.

No Store/Portal public projection is added.

## 15. Audit and correction semantics

Confirmed Order revisions already preserve Order revision history. Procurement adds its own operational history rather than relying on Order history to explain vendor actions.

Historical truths that must not be silently destroyed:

- Vendor Commitment placed with PO number;
- delivery events;
- invoice allocations;
- vendor invoice identity.

Corrections use explicit audited mutation paths. Physical deletion is not the default for historical procurement records.

Requirement synchronization may update current demand, but historical commitments remain independently readable.

## 16. DB-authoritative integration points

Implementation should hook into the existing canonical Order lifecycle, not browser-only effects.

Required integration points:

1. after successful transition to `confirmed` in the authoritative Order status path;
2. after a confirmed Order revision is actually applied by the authoritative Order update/approval path.

Both paths call the same idempotent procurement sync function.

The sync must be safe to run repeatedly without duplicating Requirements or Vendor Commitments.

No sync operation creates Inventory movements.

## 17. Failure behavior

PB-3B fails closed when business truth is ambiguous:

- missing vendor -> `Vendor Required`, cannot order;
- missing product cost -> `Cost Required`, never fake zero;
- attempted quantity beyond open purchase quantity -> reject;
- delivery above ordered quantity -> reject;
- invoice allocation above invoice total -> reject;
- invoice currency mismatch -> reject;
- Project / Order / Order Item mismatch -> reject;
- vendor mismatch between invoice and commitment -> reject;
- Sales detailed-cost access -> SQLSTATE `42501` or the established authorization equivalent;
- unsupported FX comparison -> do not convert.

## 18. Testing and acceptance

Implementation follows TDD and adds a focused PB-3B contract to the Project Base workflow.

Minimum locked scenarios:

1. Draft Project Order creates no Procurement Requirement.
2. Confirmed Project Order creates requirements exactly once.
3. Standalone confirmed Order creates no Project Procurement.
4. Stone vendor resolves from current canonical vendor data.
5. Sink vendor resolves from current canonical vendor data.
6. Unknown vendor produces `Vendor Required` and blocks Ordered transition.
7. Missing canonical cost produces `Cost Required`, not zero.
8. Pre-order confirmed revision updates requirement quantity.
9. Post-order quantity increase preserves commitment and exposes open additional quantity.
10. Post-order quantity decrease preserves commitment and exposes excess ordered quantity.
11. Ordered action requires PO/vendor order number.
12. Partial deliveries aggregate correctly; over-delivery is rejected.
13. Delivery creates zero `inventory_movements`.
14. One Vendor Invoice allocates across multiple Projects.
15. One commitment accepts multiple Vendor Invoices.
16. Partial invoice quantity derives `Partially Invoiced`.
17. Project shows allocated invoice cost, not the entire multi-Project invoice total.
18. Invoice over-allocation / vendor mismatch / currency mismatch fail closed.
19. Admin management path succeeds.
20. Finance invoice-allocation path succeeds but cannot mutate Order demand/delivery ownership beyond approved scope.
21. Sales sanitized Procurement status succeeds.
22. Sales detailed vendor/invoice cost read and mutation fail with authorization denial.
23. Store/Portal contracts remain unchanged.
24. Project UI strict gate, relevant Admin regressions, TypeScript, lint and production build pass.
25. Production-safe rollback smoke proves sync, commitment, partial delivery and shared-invoice allocation semantics with zero residue.
26. Supabase Security and Performance Advisors show no new PB-3B blocking finding.

## 19. Rollout boundary

PB-3B should ship additively:

1. schema + private/public RPC boundaries;
2. Order lifecycle synchronization;
3. Admin Project Procurement data adapter and UI;
4. role/security tests;
5. migration application and rollback-only production acceptance;
6. Advisor review;
7. user-owned merge/deploy acceptance.

PB-2 profitability remains unchanged during this rollout.

PB-4 Finance will consume the same canonical Vendor Invoice truth for payment/outgoing-cash workflow. PB-4 must not create a duplicate vendor invoice just because the invoice was first linked from Project Procurement.

## 20. Locked business boundary

The approved separation is:

**Project Procurement = what we bought + from whom + vendor cost + delivered? + invoiced? + Project invoice cost.**

**Finance = has the vendor invoice been paid + when + how much remains + outgoing cash.**

That boundary is the primary design constraint for PB-3B.