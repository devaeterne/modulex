# Modulex Finance Domain — Locked Architecture & Delivery Plan

Status: **LOCKED FOR A6 IMPLEMENTATION — F0/F1/F2/F3/F4 COMPLETE; F5 NEXT**
Date: 2026-09-06
Scope: `modulex-admin` operational finance

Supporting architecture and acceptance evidence:

- `docs/FINANCE_F0_BASELINE.md`
- `docs/superpowers/plans/2026-09-04-a6-f0-finance-baseline-contract.md`
- `docs/superpowers/plans/2026-09-06-a6-f4-payroll-finance-closeout.md`
- `docs/acceptance/a6-f4-payroll-finance-integration.md`

## 1. Locked ownership rule

Finance is a first-class Modulex domain. **Project does not own financial transactions.**

A general Finance record must be valid without a Project, Order, Customer, Vendor/Supplier, or Employee relationship when the business event does not require one.

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

## 2. Verified production baseline

Production Supabase project: `bzjoeernnmvuhzyvbowc`.

The original F0 baseline is preserved in `docs/FINANCE_F0_BASELINE.md`. Important locked facts remain:

- standalone Orders are valid; Project ownership is not universal;
- Customer Invoices remain customer-owned source documents;
- Project payment requirement/transaction tables are intentionally Project-scoped compatibility surfaces;
- HR payroll periods/runs/items, compensation, Variable Pay, advances, deductions and benefits remain HR-owned source records;
- Finance Core is the canonical money-movement layer;
- Vendor Catalog integration identity is not treated as the AP Vendor master by accident;
- historical Finance transaction reporting uses stored transaction-time/base-currency snapshots rather than current FX.

Every later migration must re-check production immediately before backfill or constraint work; baseline row counts are evidence, not permanent assumptions.

## 3. Domain boundary

### HR owns

- employee master data
- compensation configuration/history
- payroll periods/runs/items and payroll calculation inputs
- Variable Pay
- advances/deductions/benefits
- employment lifecycle data

### Finance owns

- actual money movement
- cash/bank/clearing accounts
- receipts and payments
- general expenses
- vendor/purchase payables and payments
- employee payments
- transaction currency and main-currency value
- Finance audit/reversal history
- AR/AP and cash-flow reporting/projections

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

F4 deliberately does **not** introduce true multi-currency payroll. Payroll preparation fails closed when compensation, Variable Pay, Advance, or Benefit Plan source currency differs from the Finance company base currency. A later explicit payroll-currency design may widen that boundary without weakening Finance transaction snapshots.

## 5. Core model direction

Do not force all business documents into one table. Keep source documents and actual money movement separate.

### Finance Core

- `finance_accounts` — bank/cash/clearing accounts
- `finance_categories` — expense/income operational categories
- `finance_transactions` — actual money movement / ledger event
- `finance_transaction_links` — optional Project/Order/Customer/Vendor/Employee/source-document attribution/allocation
- `finance_transaction_audit` — immutable mutation/reversal history

### Operational account types

- `bank`
- `cash`
- `clearing`

Do not introduce a chart-of-accounts-grade statutory GL taxonomy inside the current A6 operational Finance scope.

### Finance transaction kinds

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

Retain domain-specific documents:

- customer invoices
- Project payment requirements
- HR payroll runs/items, Variable Pay and advances
- expenses
- vendor bills/purchase documents

A document is not automatically a cash movement. Posting/receiving/paying a document creates or links Finance transactions.

## 6. Allocation rule

One financial event may relate to zero, one or multiple Projects/Orders. Do not make a single mandatory `project_id` the universal allocation model.

For multi-project costs/revenue, use the Finance allocation/link layer with an amount or an equivalent deterministic allocation model. The source transaction total remains authoritative; allocation totals must be validated and must not exceed the source transaction amount.

## 7. Posting, reversal and audit rule

Finance Core financial history is append-safe:

- `draft` transactions may be edited and may be deleted before posting;
- `posted` transactions affect Finance balances and are immutable as money history;
- a posted transaction may be voided only when the canonical mutation proves no dependent allocation/reconciliation requires a counter-transaction;
- otherwise corrections use a new reversal transaction linked to the original;
- posted amount/currency/account changes are never silent in-place edits;
- actor, timestamp, reason, source reference and reversal relationship must be auditable;
- idempotency is required for payment/posting mutations that may be retried.

Deactivating an account/category must not make historical correction impossible. Draft hard-delete remains guarded and must never widen into posted/voided history deletion.

### Existing Project-payment compatibility exception

The specialized Project-payment domain still has historical compatibility behavior that is broader than Finance Core. **Do not copy this exception into Finance Core.** Existing Project payment IDs/history remain intact until F5 deliberately integrates or narrows that behavior through an explicit reviewed migration.

## 8. Authorization boundary

Finance mutations must align every layer:

`Admin permission -> route/server boundary -> public RPC -> private authorization/validation core -> grants/RLS -> lifecycle constraints -> audit`

Public Finance mutation/read wrappers use authenticated-only execution, `SECURITY DEFINER`, and pinned empty `search_path` where required to bridge into private, role-checked cores. Private cores remain revoked from browser roles.

Source-domain permissions remain source-specific. `finance.manage` must not silently widen HR employee-master, Project, Customer, Vendor, or other protected domain authority.

## 9. Delivery status and plan

### A6-F0 — Baseline & contract lock — **COMPLETE / APPROVED 2026-09-04**

Architecture ownership, schema baseline, security boundary, lifecycle vocabulary, compatibility strategy and migration rules were locked before Finance Core implementation.

**Exit:** accepted by the project owner; no destructive rewrite approved.

### A6-F1 — Finance Core + Cash/Bank — **COMPLETE**

Delivered:

- Finance accounts and core transaction ledger
- optional attribution/link model
- create/post/void/reverse boundaries
- idempotency and audit
- guarded draft deletion
- base-currency / FX snapshot behavior
- Finance Overview, Transactions and Cash/Bank Admin surfaces
- RPC/private-core hardening and regression contracts

**Exit:** generic operational money movement exists independently from Project/Order ownership.

### A6-F2 — Expenses — **COMPLETE**

Delivered canonical Expense → Finance movement integration with controlled categories, account/payment behavior, audit and optional business attribution while preserving Finance Core ownership.

**Exit:** operational and project-attributable expenses use the same audited money-movement boundary.

### A6-F3 — Purchases & Accounts Payable — **COMPLETE**

Delivered through staged F3 packages:

- canonical Vendor master
- Vendor Bills
- Vendor Payments
- Payment Schedule
- Purchasing/AP integration
- AP Aging and Vendor financial projections

**Exit:** Vendor liabilities and partial/full payments reconcile through Finance while optional Project/Order attribution remains contextual.

### A6-F4 — Payroll Finance Integration — **COMPLETE / PRODUCTION VERIFIED 2026-09-06**

F4 connects HR-owned Payroll obligations and Employee source records to Finance-owned money movement without introducing a duplicate payroll ledger.

Delivered and production-verified:

- HR remains payroll-calculation/source truth; Finance remains employee money-movement truth.
- Canonical Employee Payment HR source vocabulary fails closed to `hr_payroll_item`, `hr_variable_pay`, and `hr_advance`.
- Direct Variable Pay payment validates Employee/status/amount/currency, settles the remaining source in full, marks the HR source paid, and restores eligibility safely on Finance correction when no Payroll settlement effect owns that state.
- Variable Pay already directly settled in posted Finance is excluded from future Payroll preparation, closing the observed double-payment path.
- Direct Advance Finance linkage validates cash disbursement without treating that disbursement as payroll repayment.
- Payroll preparation fails closed when supported monetary source currencies differ from company base currency.
- HR run status remains calculation/workflow state; Finance derives `unpaid` / `partial` / `paid` settlement state.
- Approved Payroll Items are exposed to Finance as read-only obligations including employee withholding, deductions, advance repayment, employer payroll taxes, employer benefits and total employer cost; no duplicate payroll/liability ledger is created.
- Employee Payment draft + Employee/Payroll source link are saved atomically by one Finance RPC.
- Approved Payroll rows expose `Pay Remaining`, which hands Employee, Payroll Item and current remaining amount to the Finance transaction form while leaving account selection and explicit posting under Finance control.
- Production migration `20260906175226` applied the F4 hardening package; corrective migration `20260906183539` fixed the atomic draft call to the canonical 10-argument Finance Core signature without rewriting migration history.
- Controlled production acceptance exercised Payroll prepare/approve, partial settlement, full settlement, Variable Pay + Advance reconciliation, reversal, re-settlement, void, direct Variable Pay payment/reversal, negative source/Employee/overpayment/currency cases, and orphan-draft prevention inside a transaction that ended with `ROLLBACK`.
- Post-rollback residue is zero for acceptance Payroll Periods, Finance transactions and temporary direct Variable Pay sources.
- Production ACL/search-path checks and fresh Security/Performance Advisors contain no F4-specific blocking finding.
- Admin production deployment is `READY` on the F4 application bundle; the corrective PR changed only SQL migration/contract/workflow artifacts, so its runtime correction is database-owned and already live.

Detailed production evidence: `docs/acceptance/a6-f4-payroll-finance-integration.md`.

**Exit:** Payroll obligations remain HR-owned, actual Employee Payments remain Finance-owned, settlement state is Finance-derived, direct-source double-payment paths fail closed, and partial/full/reversal/void behavior is production-verified with no acceptance residue.

### A6-F5 — Sales / Accounts Receivable integration — **NEXT**

- Preserve existing customer invoices and Project payment requirement/allocation behavior.
- Introduce/complete standalone customer payment transaction flow through Finance Core.
- Reconcile invoice paid/status from authoritative Finance allocations/postings rather than parallel manual truth.
- Preserve live Project-payment IDs/history while introducing Finance linkage/reconciliation.
- Retire/narrow the Project-payment posted-edit/hard-delete compatibility exception only through an explicit reviewed migration.
- Add AR aging, customer balance and payment history.

**Exit:** customer payment may reference invoice/order/project when applicable; Project-specific payment workflows still function and reconcile to Finance.

### A6-F6 — Reporting & Project financial projection

- cash flow
- income vs expense operational reporting
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

Required sequence remains:

`F0 contract/baseline → F1 Finance Core → F2 Expenses → F3 AP → F4 Payroll integration → F5 AR integration → F6 Reporting → F7 hardening`

Do not rewrite existing Project payment or HR payroll as the Finance ledger. Integrate source domains into the neutral Finance Core incrementally.

## 11. Non-goals

The current A6 operational Finance scope does not attempt to become a full statutory accounting/ERP general ledger. Chart-of-accounts-grade double-entry accounting, bank-feed reconciliation, tax filing and external accounting integrations remain deferred until operational Finance is stable and their requirements are explicit.
