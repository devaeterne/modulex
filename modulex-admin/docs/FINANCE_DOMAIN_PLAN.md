# Modulex Finance Domain — Locked Architecture & Delivery Plan

Status: **LOCKED FOR A6 IMPLEMENTATION**
Date: 2026-09-04
Scope: `modulex-admin` operational finance

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
- `company_expenses` already exists and has no `project_id`, `order_id`, `customer_id`, or `employee_id`; its textual `vendor` field is nullable.
- `customer_project_payment_transactions.project_id` and `customer_id` are required because that table is explicitly Project-payment scoped.
- `customer_project_payment_requirements.project_id` is required; `invoice_id` is nullable.
- `hr_payroll_periods`, `hr_payroll_runs`, and `hr_payroll_items` exist. `hr_payroll_items.employee_id` is required, as expected for payroll.
- HR also contains employee advances/compensation-related data; these remain HR source domains and must not be duplicated in Finance.
- Existing routines include Project payment record/allocation/void/reversal operations plus payroll run preparation/status operations.
- No canonical operational purchase-invoice/AP, bank-account, cash-account, or general Finance ledger table was found in the production table-name review.
- Current `/finance/payroll` and `/finance/compensation` routes reuse HR managers; they do not constitute a separate Finance payroll data model.

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
- `finance_transaction_links` or equivalent attribution layer — optional Project/Order/Customer/Vendor/Employee/source-document links
- `finance_transaction_audit` — immutable mutation/reversal history

Final physical schema names may change during migration design, but the ownership/nullability contract in this document may not change without an explicit architecture decision.

### Source documents

Retain or add domain-specific documents:

- existing customer invoices
- existing Project payment requirements
- existing HR payroll runs/items
- existing company expenses, migrated/bridged rather than discarded
- future purchase/vendor invoices

A document is not automatically a cash movement. Posting/receiving/paying a document creates or links Finance transactions.

## 6. Allocation rule

One financial event may relate to zero, one, or multiple Projects/Orders. Do not make a single mandatory `project_id` the universal allocation model.

For multi-project costs/revenue, use an allocation/link layer with an amount (or an equivalent deterministic allocation model). The source transaction total remains authoritative; allocation totals must be validated.

## 7. Reversal and audit rule

Financial history is append-safe:

- posted/settled money movements are not hard-deleted;
- corrections use reversal/void + replacement where appropriate;
- actor, timestamp, reason, before/after or reversal reference must be auditable;
- idempotency is required for payment/posting mutations that may be retried.

Existing Project payment reversal/audit behavior should be reused as a behavioral precedent, not replaced casually.

## 8. Delivery plan

### A6-F0 — Baseline & contract lock

- Inventory current Finance/HR/Invoice/Project-payment schema, RPCs, routes, RBAC, RLS, indexes and tests.
- Reconcile `company_expenses`, customer invoices, HR payroll/advances and Project payment ledger with this architecture.
- Confirm canonical Vendor/Supplier master choice before AP FKs are introduced.
- Define transaction types/statuses, account types and posting/reversal state machine.
- Define Finance permissions and audit matrix.

**Exit:** migration design and compatibility/backfill plan are approved; no destructive rewrite.

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

- Establish/reuse canonical Vendor/Supplier master.
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

## 9. Implementation order

Required sequence:

`F0 contract/baseline → F1 Finance Core → F2 Expenses → F3 AP → F4 Payroll integration → F5 AR integration → F6 Reporting → F7 hardening`

Do not start by rewriting the existing Project payment ledger or HR payroll. Build the neutral Finance Core first, then integrate those source domains incrementally.

## 10. Non-goals for the first Finance package

Unless separately approved, the first package does not attempt to become a full statutory accounting/ERP general ledger. Defer chart-of-accounts-grade double-entry accounting, bank-feed reconciliation, tax filing, and external accounting integrations until the operational Finance layer is stable and their requirements are explicit.
