# Modulex Project Operations Hub — Design

Date: 2026-09-03
Status: Design locked in chat; awaiting written-spec review before implementation
Target branch: `feat/project-operations-hub-pb3`
Base reviewed: `main` @ `2f5fc9f2638c41af86124cf5f907f9f25a355399`

## 1. Goal

Turn Project Detail into the operational parent screen for a cabinet/project sale without replacing existing canonical domains.

A Project must allow users to understand, from one place:

- what was sold to the customer,
- what the customer is expected to pay,
- what the customer actually paid,
- what was purchased from vendors for the Project,
- what money left the company for the Project,
- what is waiting on procurement,
- what has shipped or been installed,
- what documents belong to the Project,
- and what happened over time.

The Project UI is a role-aware aggregation layer. Orders, invoices, payments, expenses, procurement, shipments, and installations keep their own canonical source-of-truth contracts.

## 2. Locked Project Detail Navigation

Project Detail becomes a tabbed workspace:

1. Overview
2. Orders
3. Finance
4. Procurement
5. Fulfillment
6. Documents
7. Activity

Change Orders can initially remain under Orders and become a separate tab later if the domain grows. Participants/Team can remain in Overview initially.

## 3. Overview

Overview is the compact operational summary.

It should show:

- Project identity, customer, sales rep, status, target date.
- Project/order reference value.
- Customer payment state.
- Active Order summary.
- Procurement summary.
- Fulfillment summary.
- Key blockers/warnings.

Role-aware finance presentation:

- Admin/Finance may see authorized monetary summary.
- Sales sees payment state only and never sees cost, vendor purchase price, outgoing payments, margin, profit, or other internal finance details.

Example Sales-visible payment states:

- Not Received
- Partially Received
- Received
- Overdue

## 4. Orders

Existing `customer_orders` stays canonical.

Project Orders provide a reference commercial value, but Project payment planning is not locked 1:1 to Order totals.

A Project may have multiple Orders, including cabinet, stone, sink, service, or other supported product types.

Rules:

- Do not replace the current Order domain.
- Preserve `customer_orders.project_id` semantics.
- Cancelled Orders remain excluded from normal active Project totals/operational summaries.
- Payment Plan may differ from the current sum/timing of Orders.

## 5. Customer Payment Ledger

### 5.1 Core principle

Project payment truth is independent from Invoice issuance.

A Project can run for days or months and receive deposit/interim/final payments before an Invoice exists.

Therefore:

- Payment Requirement is not owned by Invoice.
- Actual Payment Transaction is not owned by Invoice.
- Invoice is an optional related financial document.
- Invoice must not be required before recording customer money received.

### 5.2 Minimum domain

```text
Project
  ├── Payment Requirements / Milestones
  ├── Actual Customer Payment Transactions
  └── Payment Allocations
```

A payment transaction may exist before any requirement is created.

Unallocated amount remains visible as Project customer credit until allocated.

Example:

```text
Payment received          $10,000
Allocated                  $5,000
Unallocated Project credit $5,000
```

### 5.3 Payment requirements

Finance/Admin can define milestones such as:

- Deposit
- Production
- Before Delivery
- Completion
- Custom milestone

The current Project Order total is shown as a reference only. Requirements are not forced to equal Orders line-by-line or order-by-order.

Requirements support:

- due date,
- amount,
- sequence/order,
- description/milestone name,
- status derived from allocations,
- optional Invoice relation later,
- non-destructive adjustment/cancellation semantics.

Derived states:

- Pending
- Partially Paid
- Paid
- Overdue
- Cancelled where appropriate

### 5.4 Actual customer payments

Actual payments are append-safe financial transactions.

They support:

- partial payments,
- multiple transactions against one requirement,
- one transaction allocated across multiple requirements,
- unallocated Project credit,
- payment method/reference,
- transaction date,
- reversal/refund/void without destructive history edits.

Existing `customer_invoices.paid_amount` must not remain a competing editable source of truth after ledger migration. It should become ledger-derived or ledger-synchronized through one authoritative DB contract.

## 6. Invoice Relationship

Invoice and payment are separate concepts.

An Invoice may be created later in the Project lifecycle. When present, it may be related to payment requirements/allocations for reconciliation, but Invoice creation is not required to receive money.

The previous idea "Invoice issued -> mandatory payment requirement" is rejected as the core model.

If an Invoice exists:

- historical payments are never recreated,
- payment transactions remain their original records,
- allocations/reconciliation connect existing payment truth to the Invoice where required,
- Invoice paid/balance state must reconcile to the canonical payment ledger.

## 7. Project Outgoing Money / Expenses

Outgoing Project money remains Finance-owned truth.

Existing `company_expenses` should be extended with nullable `project_id` rather than creating a duplicate Project expense ledger.

```text
project_id = null
  -> company/general expense

project_id = <project>
  -> Project-linked outgoing payment/expense
```

Examples:

- Stone vendor payment
- Sink vendor payment
- Installer
- Contractor
- Extra labor
- Delivery
- Material
- Other Project expense

Project Finance reads these records as a filtered Project view of Finance truth.

Do not double-count product cost and cash-out. Product cost/profitability and cash payment are separate financial dimensions.

## 8. Role Visibility

### Admin / Finance

May see authorized Project finance data, including:

- Project Order reference value,
- payment plan,
- actual incoming payments,
- allocations,
- unallocated customer credit,
- Project-linked outgoing expenses/payments,
- PB-2 cost/margin summary,
- purchase prices where authorized,
- cash in / cash out summaries,
- reconciliation warnings.

### Sales

Sales must not see:

- vendor purchase price,
- product cost,
- outgoing expense amounts,
- vendor payment amounts,
- gross profit,
- gross margin,
- markup,
- other internal financial details.

Sales may see operational customer collection state only, such as:

- Deposit: Received
- Production: Partially Received
- Before Delivery: Pending
- Overall: Partially Received

The exact customer payment amount should not be required for Sales workflow unless later explicitly approved.

### Store / Customer Portal / Dealer Portal

No new internal finance, procurement cost, vendor payment, margin, or audit data is exposed by this package.

## 9. Procurement

Procurement is a first-class Project operational domain, not just an expense row.

Example:

```text
Quartz B1233AS
Vendor: Venezia Surfaces
Purchase price: $1,000 (Admin/Finance only)
Ordered: 2026-09-03
Expected delivery: 2026-09-10
Status: ORDERED
```

```text
Sink C1232123
Vendor: Karran
Purchase price: $300 (Admin/Finance only)
Expected delivery: 2026-09-15
Status: ORDERED
```

Minimum lifecycle:

- PLANNED
- ORDERED
- CONFIRMED
- SHIPPED
- RECEIVED
- BACKORDERED
- CANCELLED

Procurement records should support:

- Project relation,
- optional source Order / Order item relation,
- product reference and immutable SKU/name snapshot,
- vendor reference/name snapshot,
- quantity,
- purchase price/currency where authorized,
- vendor order / PO reference,
- ordered date,
- expected delivery date,
- shipped date,
- received date,
- status,
- notes,
- actor/audit metadata.

Purchase price is authorization-sensitive. Sales may see vendor/product/status/expected date where operationally useful, but must not see purchase price or internal cost.

Procurement vendor integration must remain independent from the parallel vendor-catalog work. PB-3 consumes stable vendor/product references where available and must not rewrite vendor ingestion/catalog pipelines.

## 10. Fulfillment

Fulfillment tab aggregates existing Shipment and Installation truth.

Sections:

- Delivery / Shipment
- Installation

It may also surface procurement-derived blockers such as:

- Stone not received
- Sink backordered
- Cabinet shipment not ready

Initial package may show warnings without automatically enforcing scheduling blocks unless an existing canonical rule already does so.

Existing Shipment and Installation lifecycle ownership remains unchanged.

## 11. Documents

Project Documents is a Project-centered document index.

Initial conceptual groups:

- Customer
- Orders
- Procurement
- Installation
- Other

Examples:

- signed agreement,
- measurement,
- kitchen plan,
- cabinet order PDF,
- stone specification,
- vendor PO,
- vendor confirmation,
- installation checklist,
- DXF/specification files where later supported.

This design does not require inventing a new storage system if an existing Modulex document/media contract can be reused. Implementation must inspect existing storage/document contracts first.

## 12. Activity

Activity is the chronological Project audit/operations timeline.

It can include:

- Order created/confirmed/status changed,
- customer payment recorded,
- payment allocation/reversal,
- procurement ordered/shipped/received,
- Project expense recorded,
- shipment status,
- installation status,
- Project status changes.

Activity presentation must be role-sanitized.

Example Sales view:

`Customer payment recorded.`

Admin/Finance may see more authorized detail such as:

`ACH payment $5,000 recorded.`

No hidden financial detail may leak through activity text, metadata, API payloads, or client-side filtering.

## 13. Project Finance Composition

For Admin/Finance, the Project Finance tab composes separate canonical truths rather than creating a mega-ledger.

```text
Commercial value / PB-2 profitability
  <- Orders + canonical current-cost contract

Customer receivables / cash in
  <- PB-3 payment requirements + payment transactions + allocations

Project outgoing cash / expenses
  <- Finance `company_expenses` filtered by project_id

Invoices
  <- customer_invoices, reconciled to payment ledger where applicable
```

This preserves the distinction between:

- sales value,
- accounting/invoice document state,
- expected receivable,
- actual cash received,
- product cost,
- actual cash paid out.

## 14. Currency Safety

PB-2 currently fails closed on mixed-currency Project rollups because no canonical FX ledger exists.

PB-3 must not invent an FX conversion model silently.

Until canonical transaction-time FX infrastructure is implemented:

- each payment/expense/procurement amount stores its currency,
- cross-currency totals must either be grouped by currency or fail closed,
- no hidden conversion to default currency,
- no fake consolidated profit/cash result across currencies.

## 15. Security Boundary

DB authorization is authoritative; UI hiding is not sufficient.

Expected direction:

- Project operational read: existing `projects.view` / domain-specific permission contracts.
- Customer payment mutation: Admin/Finance only.
- Project outgoing expense mutation: existing `finance.manage` authority.
- Cost/margin/purchase-price read: `pricing.cost.view` and/or `finance.view` as appropriate to the final contract.
- Sales receives sanitized RPC/projection that cannot return restricted finance fields.
- SECURITY DEFINER, if required, stays in private/unexposed schema with explicit role checks and hardened search_path; public wrapper follows existing advisor-safe pattern.
- Security and Performance Advisors must be checked before production acceptance.

## 16. UI Architecture

Project Detail should use one tabbed workspace shell, not seven unrelated pages.

Recommended component split:

- `ProjectDetailWorkspace` — page shell, tab state/navigation, shared header.
- `ProjectOverviewTab`
- `ProjectOrdersTab`
- `ProjectFinanceTab`
- `ProjectProcurementTab`
- `ProjectFulfillmentTab`
- `ProjectDocumentsTab`
- `ProjectActivityTab`

Domain data access remains in focused adapters, not embedded Supabase queries throughout presentation components.

Use shared Admin UI primitives and comply with `ADMIN_UI_GUIDE.md`.

## 17. Implementation Packaging

This architecture is larger than the original PB-3 payment-only package. Implementation should be delivered in safe sequential subpackages while keeping this design as the target Project workspace.

Recommended order:

### PB-3A — Project Detail Tabs + Customer Payment Ledger

- tabbed Project Detail shell,
- Overview adaptation,
- customer payment requirements,
- actual payments,
- allocations/unallocated credit,
- Invoice reconciliation migration path,
- Sales sanitized payment-status projection,
- Finance/Admin detailed payment UI.

### PB-3B — Project Procurement

- procurement tables/RPCs,
- lifecycle/audit,
- Project Procurement tab,
- Sales-safe operational projection,
- Admin/Finance purchase-price visibility.

### PB-4 — Project Outgoing Finance

- add nullable `project_id` to existing `company_expenses`,
- Project Finance outgoing-payment projection,
- no duplicate Project expense ledger,
- Admin/Finance only.

### PB-5 — Fulfillment Rollup

- Shipment/Installation aggregation,
- procurement blockers/warnings,
- existing fulfillment domains remain canonical.

### Later — Documents / expanded Activity / Change Orders

Documents should reuse existing storage/document contracts where possible. Activity expands as each domain emits Project-safe events.

## 18. Acceptance Scenarios

At minimum the target architecture must eventually prove:

1. Project can receive a customer deposit before any Invoice exists.
2. Project can receive multiple interim payments over weeks/months.
3. A payment can be partly allocated and retain unallocated Project credit.
4. One payment can allocate across multiple requirements.
5. Payment requirements can reference Order total without being locked to it.
6. Sales can see collection status but cannot retrieve customer payment amounts if not authorized by the final projection.
7. Sales cannot retrieve cost, margin, purchase price, Project outgoing amounts, or vendor payment amounts through UI or direct authenticated API/RPC.
8. Admin/Finance can see incoming and outgoing Project money in Project Finance while sources remain separate.
9. A Stone procurement item can record vendor, SKU, purchase price, status, and expected delivery.
10. Sales can see operational procurement status/date but not purchase price.
11. Project-linked `company_expenses` remain the Finance source of truth rather than duplicated Project rows.
12. Product cost and outgoing cash are not double-counted.
13. Existing standalone Orders and non-Project company expenses continue to work.
14. Existing Invoice/Shipment/Installation behavior remains backward compatible during staged migration.
15. Store/Portal receives no new internal finance/procurement leakage.
16. Mixed currency remains fail-closed/grouped until canonical FX exists.
17. Security and Performance Advisors show no package-specific blocking finding.

## 19. Explicit Non-Goals for Initial PB-3A

- No new FX conversion engine.
- No automatic accounting/tax rules beyond existing Invoice behavior.
- No duplicate Finance expense ledger.
- No vendor-catalog ingestion changes.
- No automatic procurement PO emailing unless separately approved.
- No hard fulfillment dependency blocking unless supported by existing business rules.
- No Store/Portal finance/procurement expansion.

## 20. Locked Design Decisions

The following decisions are approved in conversation and must not be changed during implementation without explicit business approval:

1. Project Detail uses tabs: Overview, Orders, Finance, Procurement, Fulfillment, Documents, Activity.
2. Order total is a payment-plan reference, not a 1:1 constraint.
3. Customer payments can be recorded before Invoice issuance.
4. Payment Requirements and Actual Payments are separate.
5. Invoice is related to, but not the parent of, customer payment truth.
6. Unallocated Project customer credit is supported.
7. Project outgoing payments are Finance truth and visible only to authorized Finance/Admin users.
8. Existing `company_expenses` is extended with nullable Project linkage rather than duplicated.
9. Procurement is first-class operational data with vendor/product/status/expected delivery.
10. Purchase price/cost/margin/outgoing money are hidden from Sales.
11. Sales receives operational collection status and procurement status only.
12. Project Finance composes canonical sources instead of creating one destructive mega-ledger.
