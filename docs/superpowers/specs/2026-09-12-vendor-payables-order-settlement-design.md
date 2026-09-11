# Vendor Payables / Order Settlement Design

Status: Awaiting written-spec review  
Date: 2026-09-12  
Scope: Modulex Admin Finance + Vendor Cabinet order commitments

## 1. Goal

Give Finance a trustworthy view of vendor obligations created by productless Vendor Cabinet order lines without turning those order lines into fake Vendor Bills.

Finance must be able to answer, per vendor/project/order:

- what was ordered from the vendor,
- the committed vendor cost,
- how much has been invoiced,
- how much has actually been paid,
- how much remains exposed,
- which real Vendor Bills cover the order,
- which posted Vendor Payments settled the order.

The existing Vendor Bill, Payment Schedule, Vendor Payment, Finance Transaction, Project, Order and Vendor domains remain canonical. This design adds attribution and projections; it does not create a second cash ledger.

## 2. Locked accounting rules

1. `customer_order_items` rows with `pricing_model_snapshot = 'manual_vendor_cabinet'`, `product_id is null`, a canonical `vendor_id`, and `manual_cost_amount` are the source of Vendor Cabinet commitments.
2. A Draft Order exposes the Vendor Cabinet line as `planned`; it is not an active payable commitment yet.
3. When the Order leaves Draft through confirmation, the Vendor Cabinet line becomes `committed` unless the Order is cancelled.
4. A Vendor Cabinet line never auto-creates a Vendor Bill. Vendor Bills remain real vendor invoices entered by Finance.
5. Payment Schedule remains Vendor-Bill-based. A commitment without an open Vendor Bill cannot create a Payment Schedule row.
6. `Paid`, `Partially Paid`, and `Unpaid` are derived only from real posted Vendor Payment allocation history. There is no manual paid checkbox or status override.
7. A Vendor Bill can cover multiple Vendor Cabinet commitments from multiple Orders/Projects.
8. A single Vendor Cabinet commitment can be covered by multiple Vendor Bills.
9. A Vendor Payment allocated to one bill can subsequently be attributed across the bill's linked Vendor Cabinet commitments.
10. Order-level settlement attribution never creates another Finance transaction and can never exceed the net amount actually allocated to the Vendor Bill.
11. Vendor, Project, Order and customer-facing pricing remain independent of settlement status. Payment attribution cannot mutate sales price, markup, order total, or customer documents.

## 3. Domain terminology

- **Commitment**: the vendor cost entered on a Vendor Cabinet order line.
- **Vendor Bill**: the real AP source document received from the vendor.
- **Bill Allocation**: attribution of a Vendor Bill line amount to one or more Vendor Cabinet commitments.
- **Payment Schedule**: the date/amount Finance plans to pay against an open Vendor Bill.
- **Vendor Payment**: the real posted Finance transaction representing cash movement.
- **Order Settlement**: attribution of an already-real Vendor Payment allocation to the Vendor Cabinet commitments covered by that bill.

These concepts remain separate in both database and UI.

## 4. Existing canonical sources

### Vendor Cabinet commitment source

Use the existing order line fields; do not copy the committed cost into a second master table:

- `customer_order_items.id`
- `customer_order_items.order_id`
- `customer_order_items.vendor_id`
- `customer_order_items.vendor_name_snapshot`
- `customer_order_items.display_name_override`
- `customer_order_items.manual_cost_amount`
- `customer_order_items.cost_currency_code`
- `customer_order_items.source_document_id`
- `customer_order_items.pricing_model_snapshot = 'manual_vendor_cabinet'`
- `customer_orders.project_id`
- `customer_orders.status`

The projection may snapshot labels for display but must always treat the order line as the committed-cost source of truth.

### AP and payment sources

Keep using:

- `vendor_invoices`
- `vendor_invoice_lines`
- `vendor_invoice_payment_allocations`
- `vendor_payment_schedules`
- `finance_transactions`
- `finance_transaction_links`

No replacement ledger is introduced.

## 5. New persistence

### 5.1 Vendor Bill → Vendor Cabinet allocation

Add `vendor_invoice_order_allocations`.

Purpose: describe which real Vendor Bill line covers which Vendor Cabinet commitment.

Required fields:

- `id uuid primary key`
- `invoice_id uuid not null -> vendor_invoices`
- `invoice_line_id uuid not null -> vendor_invoice_lines`
- `order_item_id uuid not null -> customer_order_items`
- `amount numeric not null check amount > 0`
- `currency_code varchar(3) not null`
- `created_by uuid nullable -> profiles`
- `created_at timestamptz not null`
- `updated_by uuid nullable -> profiles`
- `updated_at timestamptz not null`

Integrity rules:

- target order item must be a productless `manual_vendor_cabinet` line;
- bill/vendor and order-line/vendor must match;
- `invoice_line_id` must belong to `invoice_id`;
- allocation currency must match the Vendor Bill currency in V1;
- total active allocations for one invoice line cannot exceed that invoice line amount;
- Draft bills may change allocations;
- once a bill is Open, bill-to-order allocations become immutable except through a controlled void/reversal workflow;
- one invoice line may allocate to multiple commitments and one commitment may receive allocations from multiple invoice lines/bills.

V1 fails closed on cross-currency bill-to-commitment allocation. Existing Vendor Bill FX handling is preserved; cross-currency commitment attribution is a later extension rather than silently using a live rate.

### 5.2 Vendor Payment → Vendor Cabinet settlement allocation

Add `vendor_payment_order_allocations` as an append-only settlement ledger.

Required fields:

- `id uuid primary key`
- `invoice_payment_allocation_id uuid not null -> vendor_invoice_payment_allocations`
- `order_item_id uuid not null -> customer_order_items`
- `amount_delta numeric not null`
- `currency_code varchar(3) not null`
- `reversal_of_allocation_id uuid nullable -> vendor_payment_order_allocations`
- `reason text nullable`
- `actor_id uuid nullable -> profiles`
- `created_at timestamptz not null`

Rules:

- the referenced invoice payment allocation must represent a valid posted Vendor Payment allocation after existing reversal semantics;
- order item must already be covered by a bill allocation on the same invoice;
- vendor and currency must match;
- net order settlement across all commitments on an invoice can never exceed the invoice's net valid Vendor Payment allocation;
- net settlement on one commitment can never exceed the amount invoiced to that commitment;
- reversals are new negative ledger rows referencing the original allocation; historical rows are never rewritten or deleted;
- no direct table mutation is granted to normal clients; guarded RPCs own allocation and reversal.

## 6. Derived Vendor Commitment projection

Expose a Finance-authorized paginated RPC/view, conceptually `get_vendor_order_commitments_page`, derived from Vendor Cabinet order lines plus the two allocation ledgers.

Each row returns at minimum:

- order item id
- vendor id/code/name
- project id/number/name
- order id/number/status
- line description
- committed amount and currency
- invoiced amount
- paid amount
- uninvoiced amount
- invoiced outstanding amount
- total remaining exposure
- invoice variance
- invoice count
- payment count
- source Vendor PDF document id
- commitment status
- invoice status
- payment status
- created/order dates
- pagination total count

### Amount formulas

For an active commitment:

- `committed = manual_cost_amount`
- `invoiced = sum(valid vendor_invoice_order_allocations.amount)`
- `paid = sum(net vendor_payment_order_allocations.amount_delta)`
- `uninvoiced = greatest(committed - invoiced, 0)`
- `invoiced_outstanding = greatest(invoiced - paid, 0)`
- `remaining_exposure = uninvoiced + invoiced_outstanding`
- `invoice_variance = invoiced - committed`

A real invoice is allowed to be higher or lower than the original commitment. The system surfaces variance instead of silently rewriting the original committed cost.

### Display states

Commitment state:

- `planned`: Order is Draft
- `committed`: confirmed/non-draft active Order
- `cancelled`: cancelled Order or explicitly cancelled Vendor Cabinet obligation

Invoice state:

- `not_invoiced`: invoiced = 0
- `partially_invoiced`: 0 < invoiced < committed
- `invoiced`: invoiced >= committed

Payment state:

- `unpaid`: paid = 0
- `partially_paid`: 0 < paid < invoiced
- `paid`: invoiced > 0 and paid >= invoiced

`Paid` is therefore impossible without valid invoice/payment allocations and is never manually set.

## 7. Vendor Bill workflow

The existing Vendor Bill lifecycle remains:

Draft → Open → paid/partially paid derived from allocations, or Void.

### Bill entry

`+ Add Vendor Bill` creates the real Vendor Bill draft using the existing bill RPCs.

After the header is saved, Finance allocates Bill lines to Vendor commitments for that vendor. The allocation UI shows open/planned commitments with Project, Order, description, committed amount, already-invoiced amount and available amount.

Finance can allocate one bill across multiple Orders. The sum of commitment allocations is checked against each bill line amount.

Opening a bill freezes the commitment allocation map. If a correction is needed after opening, the existing void/reversal workflow must be used rather than silently editing historical attribution.

## 8. Vendor Payment and Order Settlement workflow

Existing Vendor Payment remains the real cash movement and existing invoice payment allocation remains the AP settlement boundary.

After a posted Vendor Payment is allocated to a Vendor Bill, Finance may allocate that valid payment amount to commitments already linked to the bill.

Example:

- Invoice INV-1234 = $40,000
- ORD-079 allocation = $20,000
- ORD-085 allocation = $12,000
- ORD-091 allocation = $8,000
- Posted payment allocated to invoice = $25,000

Finance may settle:

- ORD-079 = $20,000 → Paid
- ORD-085 = $5,000 → Partially Paid
- ORD-091 = $0 → Unpaid

The remaining $7,000 on ORD-085 and $8,000 on ORD-091 remain visible even though the invoice itself has received a partial payment.

Reversing a Vendor Payment allocation requires corresponding order-settlement reversal capacity; order-level paid amounts must always reconcile to the surviving valid invoice payment allocations.

## 9. Finance UI redesign

Preserve route compatibility at `/finance/bills`, but redesign the workspace as **Vendor Payables** with three top-level tabs:

1. `Commitments`
2. `Vendor Bills`
3. `Payment Schedule`

### Commitments tab — default

List-first layout with compact filters:

- Search
- Vendor
- Commitment status
- Invoice status
- Payment status
- Project
- Order

Columns:

- Vendor
- Project / Order
- Description
- Committed
- Invoiced
- Paid
- Remaining
- Status
- Action

Row actions/context:

- View Order
- View Project
- View Vendor
- View Vendor PDF
- Vendor Bills

`Vendor Bills` switches to the Vendor Bills tab with vendor/order filters pre-applied.

Selecting a commitment opens a detail drawer/modal containing:

- Vendor identity
- Project and Order
- Vendor Cabinet line description
- source Vendor PDF
- committed cost
- invoiced amount
- paid amount
- remaining exposure
- invoice variance
- linked Vendor Bills
- order-settlement/payment history

### Vendor Bills tab

Remove the current permanently visible `New Vendor Bill Draft` and `AP Lifecycle Inputs` forms.

Use:

- list-first Vendor Bill table;
- compact filters;
- `+ Add Vendor Bill` action;
- create/edit modal or drawer;
- selected bill detail with tabs: `Overview | Order Allocations | Payments | Audit`.

Advanced actions such as Open, Manual FX, Void and payment allocation appear only inside the selected Bill context.

### Payment Schedule tab

Reuse the existing Vendor-Bill-based Payment Schedule behavior. It may be embedded in this workspace or deep-linked to the existing `/finance/payment-schedule` route, but no commitment-only schedule creation is allowed.

## 10. Vendor Management integration

Add a `Commitments` or `Orders / Commitments` detail tab to the canonical Vendor Management screen.

For a selected vendor show:

- Project / Order
- Vendor Cabinet description
- committed amount
- invoiced amount
- paid amount
- remaining exposure
- status

Provide `View Vendor Bills` to navigate to Vendor Payables with the current vendor pre-filtered.

Do not duplicate Vendor master data or create a separate vendor list.

## 11. Permissions and security

- `finance.view` may read Vendor Payables commitments, bill allocations, settlement status and history.
- `finance.manage` may create/edit Draft Vendor Bills, map bills to commitments, open/void bills, allocate valid payments, and reverse order settlement allocations.
- Sales/Admin Order workflows do not receive Finance mutation rights merely because they created the Vendor Cabinet line.
- Vendor Cabinet source PDF remains private and uses the existing signed-document access boundary.
- New write RPCs are SECURITY DEFINER with empty/safe `search_path`, explicit role checks and narrow grants.
- New tables use RLS/fail-closed direct mutation; clients mutate only through guarded RPCs.
- Allocation and settlement histories are auditable. Open-bill attribution and payment settlement rows are not silently rewritten.

## 12. Lifecycle edge cases

### Vendor Cabinet edited while Order is Draft

Because the commitment projection reads the order line directly, Vendor/description/cost edits are reflected immediately while the Order remains Draft. No Finance commitment ledger row needs synchronization.

### Order confirmation

The same projected row changes from `planned` to `committed`; no fake Vendor Bill is created.

### Order cancellation

No new bill/order allocations may be created for cancelled commitments. Existing historical invoice/payment allocations remain readable. If a cancellation happens after invoicing/payment, Finance must resolve the AP history explicitly rather than deleting it.

### Vendor Cabinet line removal

Removal is allowed only under the existing Order rules. Once the line has invoice or payment attribution, deletion must fail closed; historical Finance attribution cannot be orphaned.

### Vendor Cabinet cost changed after invoice attribution

Once a Vendor Cabinet line has any bill allocation, cost/vendor mutation must fail closed or require a dedicated Finance-aware adjustment workflow. V1 will fail closed rather than rewrite historical commitment truth underneath an invoice.

### Invoice variance

Vendor Bills may legitimately differ from the committed cost. Variance is displayed and audited; the commitment amount is not automatically overwritten.

## 13. Migration and backfill strategy

1. Add the two allocation tables, FKs, indexes, RLS and audit/reversal guards.
2. Add Finance RPCs for paginated commitment reads, Bill allocation, Payment-to-Order settlement allocation and reversals.
3. Extend Vendor Bill detail/reference RPCs to expose commitment candidates and existing allocations.
4. Do not backfill duplicate commitment rows. Existing `manual_vendor_cabinet` order lines appear automatically in the derived commitment projection.
5. Existing Vendor Bills remain valid. They only gain Order-level commitment attribution when Finance explicitly maps their lines.
6. Existing Vendor Payment allocations remain valid. Order-level paid status appears only after explicit settlement attribution, avoiding invented historical allocation.
7. Add canonical migrations under `modulex-store/supabase/migrations`; mirror Admin SQL only where the existing Finance contract requires it.

## 14. Testing and acceptance

### Database contracts

Verify:

- productless Vendor Cabinet line is projected as a commitment;
- Draft vs confirmed vs cancelled state derivation;
- Vendor mismatch rejection;
- invoice-line allocation sum enforcement;
- one bill → many Orders;
- many bills → one Order commitment;
- invoice variance behavior;
- payment settlement cannot exceed valid invoice payment allocation;
- payment settlement cannot exceed commitment's invoiced amount;
- reversal restores derived paid/remaining values;
- direct unauthorised table mutation fails;
- Sales cannot perform Finance settlement mutations;
- Finance read/manage permissions behave as designed.

### UI contracts

Verify:

- `/finance/bills` is list-first and defaults to Commitments;
- large permanent creation/lifecycle forms are absent;
- `+ Add Vendor Bill` opens contextual create UI;
- Bill detail exposes Overview / Order Allocations / Payments / Audit;
- commitment row links to Project, Order, Vendor, private PDF and filtered Vendor Bills;
- Vendor Management exposes the selected vendor's commitment summary;
- no manual Paid/Partially Paid control exists;
- Payment Schedule still requires an open Vendor Bill.

### Reconciliation acceptance

For a bill covering multiple Orders, prove:

- bill total remains one AP document;
- each Order shows its own invoiced amount;
- a partial real payment can settle one Order fully and another partially;
- sum of order-level payment settlements never exceeds valid bill payment allocation;
- invoice-level and order-level views reconcile after reversal.

## 15. Out of scope

- Auto-creating Vendor Bills from Vendor Cabinet lines.
- Creating Product/SKU records for Vendor Cabinet packages.
- Manual paid/unpaid checkboxes.
- Commitment-only Payment Schedule entries.
- Automatic proportional distribution of invoice payments across Orders.
- Replacing the existing Vendor Payment or Finance Transaction ledgers.
- Cross-currency commitment allocation in V1.
- OCR/parsing of vendor PDFs into bills.
- Automatic invoice creation when a Vendor PDF is uploaded to an Order.

## 16. Success criteria

The feature is complete when Finance can open Vendor Payables and answer, without manual spreadsheets:

> For this Project and Order, which vendor was ordered from, how much was committed, how much has been invoiced, how much has actually been paid, what remains, and which real bills/payments prove it?

The answer must reconcile to Vendor Bills and posted Vendor Payments, with no manually editable settlement status and no duplicated cash movement.