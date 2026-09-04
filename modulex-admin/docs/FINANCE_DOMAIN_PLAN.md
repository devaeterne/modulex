# Modulex Finance Domain — Locked Architecture & Delivery Plan

Status: **LOCKED FOR A6 IMPLEMENTATION — A6-F0 ACTIVE / REVIEW PENDING**
Date: 2026-09-04
Scope: `modulex-admin` operational finance

Supporting F0 evidence:

- `docs/FINANCE_F0_BASELINE.md`
- `docs/superpowers/plans/2026-09-04-a6-f0-finance-baseline-contract.md`

## 1. Locked ownership rule

Finance is a first-class Modulex domain. **Project does not own financial transactions.**

A general finance record must be valid without a Project, Order, Customer, Vendor/Supplier, or Employee relationship when the business event does not require one.

Context relationships are attribution/source links, not universal ownership requirements:

- `project_id` — optional in Finance Core
- `order_id` — optional in Finance Core
- `customer_id` — optional in Finance Core
- `vendor_id` / supplier reference — optional in Finance Core
- `employee_id` — optional in Finance Core

Physical FK names must reuse the canonical Modulex domain table that exists at implementation time. Do not create a duplicate Supplier/Employee master solely for Finance.

### Conditional domain requirements

Nullable at Finance Core does **not** mean every transaction type may omit all context. Domain-specific records enforce their own required relationship:

| Business event | Required business context | Optional attribution |
| --- | --- | --- |
| General expense | expense category + financial account | project, order, customer, vendor, employee |
| Customer invoice | customer | order, project |
| Customer payment | customer | invoice, order, project |
| Project payment requirement/allocation | project + customer by definition | invoice/order when applicable |
| Purchase/vendor invoice | vendor/supplier | project, order |
| Vendor payment | vendor/supplier | purchase invoice, project, order |
| Payroll item / salary | employee | project/order only when explicitly allocated |
| Employee advance/reimbursement | employee | project/order when attributable |
| Bank/cash transfer | source + destination financial accounts | all business entities |

Project-specific payment tables are therefore allowed to require `project_id`: they are a specialized Project commercial sub-domain, not the universal Finance ledger.

## 2. Verified production baseline — 2026-09-04

Production Supabase project: `bzjoeernnmvuhzyvbowc`.

Verified schema facts:

- `customer_orders.project_id` is nullable. Standalone Orders remain valid.
- `customer_invoices.customer_id` is required while `customer_invoices.order_id` is nullable.
- `customer_invoices.ledger_managed` exists; at the F0 snapshot no production invoice had it enabled.
- `company_expenses` already exists and has no `project_id`, `order_id`, `customer_id`, or `employee_id`; its textual `vendor` field is nullable.
- `customer_project_payment_transactions.project_id` and `customer_id` are required because that table is explicitly Project-payment scoped.
- `customer_project_payment_requirements.project_id` is required; `invoice_id` is nullable.
- `hr_payroll_periods`, `hr_payroll_runs`, `hr_payroll_items`, and `hr_advances` exist. `hr_payroll_items.employee_id` and `hr_advances.employee_id` are required, as expected for HR-owned source records.
- Existing routines include Project payment record/allocation/edit/delete/void/reversal operations plus payroll run preparation/status operations.
- No canonical operational purchase-invoice/AP, bank-account, cash-account, or general Finance ledger table was found in the production table-name review.
- No canonical business Supplier/Vendor master or `supplier_id`/`vendor_id` FK was identified; Vendor Catalog vendor codes remain integration identities, not AP counterparties.
- Current `/finance/payroll` and `/finance/compensation` routes reuse HR managers; they do not constitute a separate Finance payroll data model.
- Current `/reports` contains inventory/movement reporting only; there is no canonical Finance cash-flow/AP/AR/account-movement reporting surface yet.

### F0 usage snapshot

At the 2026-09-04 read-only production snapshot:

- `company_expenses`: 0 rows
- `customer_invoices`: 2 rows
- `customer_invoices` with `ledger_managed = true`: 0 rows
- `customer_project_payment_transactions`: 2 rows
- `customer_project_payment_requirements`: 2 rows
- `hr_advances`: 0 rows
- `hr_payroll_periods` / `hr_payroll_runs` / `hr_payroll_items`: 0 rows

These values are not permanent assumptions. Every later migration must re-check production immediately before backfill/constraint work.

## 3. Domain boundary

### HR owns

- employee master data
- compensation configuration/history
- payroll periods and payroll calculation inputs
- advances/deductions/benefits
- employment lifecycle data

### Finance owns

- actual money movement
- cash/bank accounts
- receipts and payments
- general expenses
- vendor/purchase payables
- payment transaction ledger
- transaction currency and main-currency value
- finance audit trail
- AR/AP and cash-flow reporting

### Projects/Orders own

- operational/commercial context
- order commercial amounts
- project payment requirements and commercial progress

Finance may link to Projects/Orders, but those domains do not become parents of Finance Core records.

## 4. Multi-currency rule

Preserve the existing Modulex currency decision:

- Every transaction records its transaction currency.
- Reporting is normalized to the company main currency.
- If transaction currency equals main currency, an FX conversion snapshot is not required.
- If currencies differ, persist the effective transaction-time FX snapshot used for reporting/accounting value.
- An explicitly agreed/manual rate may override the market rate when business terms require it; preserve the source/type of the rate for auditability.
- Historical reporting must use the stored transaction snapshot, not silently recalculate old transactions using a later FX rate.

## 5. Core model direction

Do not force all business documents into one table. Keep source documents and actual money movement separate.

### Finance Core

- `finance_accounts` — bank/cash/clearing accounts
- `finance_categories` — expense/income operational categories
- `finance_transactions` — actual money movement / ledger event
- `finance_transaction_links` or equivalent attribution/allocation layer — optional Project/Order/Customer/Vendor/Employee/source-document links
- `finance_transaction_audit` — immutable mutation/reversal history

Final physical schema names may change during migration design, but the ownership/nullability contract in this document may not change without an explicit architecture decision.

### Initial F1 account types

Keep the first operational account model deliberately narrow:

- `bank`
- `cash`
- `clearing`

Do not introduce a chart-of-accounts-grade statutory GL taxonomy in F1.

### Initial Finance transaction kinds

The initial operational vocabulary is:

- `expense`
- `customer_receipt`
- `vendor_payment`
- `employee_payment`
- `deposit`
- `withdrawal`
- `transfer`
- `refund`
- `reversal`

Source domains may add subtype/reference metadata without turning these into universal ownership requirements.

### Source documents

Retain or add domain-specific documents:

- existing customer invoices
- existing Project payment requirements
- existing HR payroll runs/items and advances
- existing company expenses, migrated/bridged rather than discarded
- future purchase/vendor invoices

A document is not automatically a cash movement. Posting/receiving/paying a document creates or links Finance transactions.

## 6. Allocation rule

One financial event may relate to zero, one, or multiple Projects/Orders. Do not make a single mandatory `project_id` the universal allocation model.

For multi-project costs/revenue, use an allocation/link layer with an amount (or an equivalent deterministic allocation model). The source transaction total remains authoritative; allocation totals must be validated and must not exceed the source transaction amount.

## 7. Posting, reversal and audit rule

Finance Core financial history is append-safe:

- `draft` transactions may be edited and may be deleted before posting;
- `posted` transactions affect Finance balances and are immutable as money history;
- a posted transaction may be voided only when the canonical mutation proves no dependent allocation/reconciliation requires a counter-transaction;
- otherwise corrections use a new reversal transaction linked to the original;
- posted amount/currency/account changes are never silent in-place edits;
- actor, timestamp, reason, source reference and reversal relationship must be auditable;
- idempotency is required for payment/posting mutations that may be retried.

### Existing Project-payment compatibility exception

The specialized Project-payment domain currently permits guarded edit and, in limited cases, hard-delete of an original posted payment. Those operations require role checks and audit/reconciliation behavior and are part of the current production compatibility surface.

**Do not copy this exception into Finance Core.** New Finance Core uses immutable posted history with void/reversal. The existing Project-payment edit/delete behavior remains intact until F5 deliberately integrates/deprecates it without breaking live payment history.

Project payment record/allocation/reversal/audit behavior remains a useful behavioral precedent for locking, reconciliation, role checks and append-safe correction.

## 8. Authorization boundary

Finance mutations must align every layer rather than treating frontend permission labels as DB authority:

`Admin permission -> route/server boundary -> public RPC -> private authorization/validation core -> grants/RLS -> lifecycle constraints -> audit`

Production already demonstrates this distinction: the Finance role has `invoices.manage`, while direct `customer_invoices` insert/update policies remain Admin/Super Admin-only and guarded invoice RPCs provide the authorized Finance mutation path.

Project-payment tables deny direct authenticated table access and use RPC/private-core mutations. This is the preferred precedent for sensitive Finance Core money mutations.

Current Payroll UI still performs some direct browser table writes to HR payroll tables. That is a legacy HR boundary and must not be copied into Finance Core.

Source-domain permissions remain source-specific. Adding `finance.manage` must not silently widen HR employee-master, Project, Customer or other protected domain authority.

## 9. Delivery plan

### A6-F0 — Baseline & contract lock — **ACTIVE / REVIEW PENDING**

Completed evidence collection:

- current Finance/HR/Invoice/Project-payment schema and usage snapshot
- RPC/private-core boundary inventory
- RLS/RBAC/grant review
- current Finance/Reports route review
- relevant constraints/indexes
- production migration-history review
- Vendor/Supplier master decision boundary
- Finance Core account/transaction lifecycle vocabulary
- compatibility/backfill strategy
- permission/audit/idempotency contract

Detailed evidence is in `docs/FINANCE_F0_BASELINE.md`.

**Exit:** project owner accepts the F0 baseline/compatibility contract; only then does F1 migration design begin. No destructive rewrite.

### A6-F1 — Finance Core + Cash/Bank

- Add financial accounts (bank/cash/clearing).
- Add Finance transaction ledger and optional attribution/link model.
- Add transaction create/post/void/reverse boundaries with validation, idempotency and audit.
- Add main-currency + FX snapshot fields/logic.
- Admin: Finance Overview, Transactions, Cash & Bank.

**Exit:** a generic expense, deposit/withdrawal and account transfer can be recorded without Project/Order ownership.

### A6-F2 — Expenses

- Bridge/migrate existing `company_expenses` into the Finance Core posting model without losing history.
- Add controlled categories, payment account, attachments/reference, status and audit.
- Support optional Project/Order/Employee/Vendor attribution and multi-project allocation when needed.
- Admin: Expenses list/detail/create/edit/void flow.

**Exit:** office rent, utilities, fuel, employee reimbursement and project-attributable expenses use the same audited money-movement boundary.

### A6-F3 — Purchases & Accounts Payable

- Establish/reuse canonical Vendor/Supplier master deliberately; do not reuse Vendor Catalog source identities as AP counterparties by accident.
- Add purchase/vendor invoices and invoice lines where needed.
- Add due date/status/partial payment/payment allocation.
- Link vendor payments to Finance transactions.
- Add AP aging and outstanding-payables views.

**Exit:** a vendor invoice can exist without a Project and can optionally be allocated across Projects/Orders; partial/full payments reconcile correctly.

### A6-F4 — Payroll Finance Integration

- Keep compensation/payroll calculation in HR.
- Post approved/paid payroll runs/items into Finance as actual obligations/payments; do not duplicate payroll calculation tables.
- Handle salary, advances, deductions/reimbursements and employer costs according to HR source records.
- Employee is required for employee-level payroll records; Project/Order attribution remains optional.

**Exit:** payroll payment appears in Finance/cash flow while HR remains source of payroll calculation truth.

### A6-F5 — Sales / Accounts Receivable integration

- Preserve existing customer invoices and Project payment requirement/allocation behavior.
- Introduce/complete standalone customer payment transaction ledger through Finance Core.
- Reconcile `paid_amount`/status from authoritative allocations/postings rather than parallel manual truth.
- Preserve live Project-payment IDs/history while introducing Finance linkage/reconciliation.
- Retire or narrow the Project-payment posted-edit/hard-delete compatibility exception only through an explicit reviewed migration, never silently.
- Add AR aging, customer balance and payment history.

**Exit:** customer payment may reference invoice/order/project when applicable; Project-specific payment workflows still function and reconcile to Finance.

### A6-F6 — Reporting & Project financial projection

- Cash flow
- income vs expense operational report
- AR aging
- AP aging
- account balances/movements
- Project financial summary based on linked/allocated Finance records
- Order/Project profitability inputs where applicable

**Exit:** Project reports consume Finance attribution; they do not own or duplicate Finance transactions.

### A6-F7 — Hardening & production acceptance

- RLS/RPC/RBAC review
- mutation idempotency and concurrency tests
- append-safe audit/reversal tests
- FX snapshot tests
- allocation reconciliation tests
- migration/backfill reconciliation
- Security/Performance Advisors
- signed-in Admin acceptance
- production smoke and reporting reconciliation

## 10. Implementation order

Required sequence:

`F0 contract/baseline → F1 Finance Core → F2 Expenses → F3 AP → F4 Payroll integration → F5 AR integration → F6 Reporting → F7 hardening`

Do not start by rewriting the existing Project payment ledger or HR payroll. Build the neutral Finance Core first, then integrate those source domains incrementally.

## 11. Non-goals for the first Finance package

Unless separately approved, the first package does not attempt to become a full statutory accounting/ERP general ledger. Defer chart-of-accounts-grade double-entry accounting, bank-feed reconciliation, tax filing, and external accounting integrations until the operational Finance layer is stable and their requirements are explicit.
