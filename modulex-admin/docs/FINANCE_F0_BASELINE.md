# Modulex Finance — A6-F0 Production Baseline & Contract

Status: **IN REVIEW / F0 ACTIVE**
Date: 2026-09-04
Production Supabase: `bzjoeernnmvuhzyvbowc`
Main baseline reviewed: `79c6fa7629d13d39d5af2c241087df10e213dd48`
Architecture source: `docs/FINANCE_DOMAIN_PLAN.md`

## 1. Purpose

This document freezes the production Finance-adjacent baseline before A6-F1 introduces Finance Core.

A6-F0 performs no production DDL and no business-data mutation. Its job is to answer four questions before schema design begins:

1. Which existing domains already contain financial truth?
2. Which relationships are naturally required by those domains versus optional Finance attribution?
3. Which existing authorization/audit behaviors must be preserved or deliberately not copied?
4. How can Finance Core be introduced without destructive rewrites or double sources of truth?

## 2. Locked ownership rule

**Finance is a first-class domain. Project does not own general financial transactions.**

At Finance Core level the following are optional attribution/context links:

- Project
- Order
- Customer
- Vendor/Supplier
- Employee

A source-domain document may require one of those relationships by definition. Examples:

- customer invoice requires Customer;
- Project payment requires Project + Customer;
- payroll item requires Employee;
- future vendor invoice requires Vendor/Supplier.

That does not make any of those domains the universal parent of Finance Core.

## 3. Production usage snapshot

Read-only production counts captured on 2026-09-04:

| Domain | Production rows | F0 interpretation |
| --- | ---: | --- |
| `company_expenses` | 0 | Schema exists but has no history to backfill today. Preserve table; bridge in F2. |
| `customer_invoices` | 2 | Live commercial documents exist; migration must preserve them. |
| `customer_invoices` where `ledger_managed = true` | 0 | Ledger-management contract exists but current invoices are not managed by it. |
| `customer_project_payment_transactions` | 2 | Live Project customer-payment history exists; no destructive rewrite. |
| `customer_project_payment_requirements` | 2 | Live Project Payment Plan/requirement history exists. |
| `hr_advances` | 0 | HR source model exists; no current advance backfill. |
| `hr_payroll_periods` | 0 | Payroll model exists but no current production run history. |
| `hr_payroll_runs` | 0 | Payroll model exists but no current production run history. |
| `hr_payroll_items` | 0 | Payroll model exists but no current production item history. |

These counts are an execution-time baseline, not a permanent assumption. F1/F2/F4/F5 migrations must re-check production immediately before applying constraints/backfills.

## 4. Existing source-domain matrix

| Source domain | Natural owner / required context | Optional context today | Current state model | Finance-Core treatment |
| --- | --- | --- | --- | --- |
| `company_expenses` | category + amount + currency + date | textual vendor; no Project/Order/Customer/Employee FK | `posted`, `void` | Retain as source document/history and bridge to Finance posting in F2. |
| `customer_invoices` | `customer_id` required | `order_id` nullable; Project indirect through Order/Payment Plan | `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void` | Retain invoice document truth. Payment truth migrates toward Finance allocations in F5. |
| `customer_project_payment_requirements` | `project_id` required | `invoice_id` nullable | active vs `cancelled_at` | Retain specialized Project commercial requirement model. |
| `customer_project_payment_transactions` | `project_id` + `customer_id` required | payment method/reference optional | type `payment/refund/reversal`; status `posted/voided` | Retain specialized customer-collection history; integrate to Finance in F5, do not generalize as Finance Core. |
| `customer_project_payment_allocations` | transaction + requirement required | none | allocation rows | Retain Project payment allocation semantics; later reconcile to Finance/customer receipts. |
| `hr_payroll_periods` | payroll period | none | `open/locked/closed` | HR remains payroll calendar owner. |
| `hr_payroll_runs` | payroll period | none | `draft/calculated/approved/paid/void` | HR remains calculation/lifecycle owner; Finance records money movement in F4. |
| `hr_payroll_items` | payroll run + employee required | none | calculated values | HR remains calculation truth. |
| `hr_advances` | employee required | none | `open/paid/cancelled` | HR remains advance obligation/source truth; actual payment/repayment movement posts to Finance. |
| `payment_methods` | payment configuration | n/a | active/inactive | Shared commercial/Finance configuration; reuse. |
| `payment_terms` | commercial terms configuration | n/a | active/inactive | Shared commercial configuration; do not confuse with money movement. |

## 5. Verified nullability and ownership facts

### General expenses

`company_expenses` contains:

- required `expense_date`, `category`, `description`, `amount`, `currency_code`, `status`;
- nullable textual `vendor`, `reference_no`, `notes`, actor metadata;
- no `project_id`, `order_id`, `customer_id`, `employee_id`;
- positive amount constraint;
- three-character currency constraint;
- status constraint limited to `posted` / `void`.

This is direct evidence that an ordinary expense already exists independently of Project ownership.

### Customer invoices / Orders

- `customer_invoices.customer_id` is required.
- `customer_invoices.order_id` is nullable.
- `customer_orders.project_id` is nullable.
- `customer_invoices.ledger_managed` is required boolean; currently 0 production rows are `true`.
- Invoice amount constraint requires `0 <= paid_amount <= total_amount`.

Standalone Orders and invoices are therefore compatible with the locked Finance ownership rule.

### Project payments

`customer_project_payment_transactions` intentionally requires both Project and Customer. It is not a candidate for the universal Finance transaction table.

Current DB constraints enforce:

- positive amount;
- three-letter uppercase currency;
- `payment` rows have no reversal source;
- `refund/reversal` rows require `reversal_of_transaction_id`;
- transaction status is `posted` or `voided`;
- reversal and business FKs use restrictive deletion behavior.

`customer_project_payment_requirements` requires Project while invoice linkage is nullable.

### HR payroll and advances

- Payroll item requires `payroll_run_id` + `employee_id`.
- Employee advance requires `employee_id`.
- Payroll run state is `draft/calculated/approved/paid/void`.
- Advance state is `open/paid/cancelled`; repayment mode is `payroll/manual`.

Employee is a natural requirement for those HR records, not a universal Finance-Core owner.

## 6. Current RPC/mutation boundaries

### Project payment / Project financial summary

Public authenticated RPC surface includes:

- `get_customer_project_payment_ledger`
- `get_customer_project_payment_status`
- `get_customer_project_financial_summary`
- `create_customer_project_payment_requirement`
- `delete_customer_project_payment_requirement`
- `record_customer_project_payment`
- `record_and_allocate_customer_project_payment`
- `allocate_customer_project_payment`
- `update_customer_project_payment`
- `void_customer_project_payment`
- `reverse_customer_project_payment`
- `delete_customer_project_payment`

Anon EXECUTE is revoked on the reviewed RPCs; authenticated/service-role EXECUTE is present. Public wrappers delegate to private canonical functions where applicable.

Project-payment tables themselves have restrictive `no_direct_access` RLS for anon/authenticated. Mutation is therefore RPC-owned rather than browser direct-table-write.

### Customer invoices

Relevant public RPCs include:

- `create_customer_invoice_from_order`
- `update_customer_invoice_state`

`update_customer_invoice_state` delegates to a private core and distinguishes Admin/Finance/Sales behavior. If `ledger_managed = true`, manual paid amount and paid/partially-paid status mutations are rejected because those values are intended to be derived from Project payment allocations.

### HR payroll

Relevant RPCs include:

- `get_hr_payroll_employee_directory`
- `prepare_hr_payroll_run`
- `set_hr_payroll_run_status`

Private payroll core permits Super Admin/Admin/HR/Finance. Marking a payroll run `paid` currently also updates approved variable-pay state and payroll-repayment advances.

## 7. Known mutation-boundary differences

These differences are important architectural inputs, not cleanup to perform in F0.

### Strong precedent to reuse

Project payment sensitive writes use:

`authenticated public RPC -> private authorization/validation core -> protected tables -> audit/reconciliation`

Finance Core F1 must follow this style for posting, transfer, void and reversal mutations.

### Existing browser-write behavior that must not be copied

Current `PayrollManager` directly inserts/updates `hr_payroll_periods`, `hr_payroll_runs` and `hr_payroll_items` for some operations, while calculation/status operations use RPCs.

This is an HR legacy/UI boundary. New Finance Core sensitive money mutations must not adopt direct browser writes simply because payroll currently does.

### Existing Project-payment edit/delete compatibility exception

The current specialized Project-payment domain allows:

- editing an original posted payment under guarded conditions, with audit and allocation reset/reconciliation;
- hard-deleting a posted original payment only when it has no reversal/refund history, with a required reason and a durable audit snapshot.

**This behavior is not the Finance Core model.**

F1 locks posted Finance transactions as immutable money history. New Finance Core will use void/reversal semantics and will not add a generic hard-delete/edit-posted API. Existing Project-payment edit/delete remains a compatibility exception until F5 deliberately migrates/deprecates it without breaking production history.

## 8. RLS/RBAC matrix

### Admin application permissions

Current Admin permissions include:

- `finance.view`
- `finance.manage`
- `invoices.view`
- `invoices.manage`
- `project_payments.view`
- `project_payments.manage`
- `personnel.view`
- `personnel.manage`

Finance role currently has `finance.view/manage`, `invoices.view/manage`, `project_payments.view/manage`, and payroll visibility/processing through the Finance routes. Sales can view Project payment status but cannot record Project customer payments.

### Production table-policy observations

| Table/domain | Finance read | Finance direct write | Canonical mutation expectation |
| --- | --- | --- | --- |
| `company_expenses` | yes | insert/update yes; delete no (Super Admin only) | F2 introduces Finance posting boundary; do not expand direct-table writes. |
| `customer_invoices` | yes | direct insert/update RLS is Admin/Super Admin only | Finance payment/status behavior is available through guarded RPC; preserve cross-layer distinction. |
| Project payment tables | no direct table access | no direct table access | Authenticated RPC with private role guard. |
| HR payroll periods/runs/items | yes | Finance direct write allowed by current RLS | Legacy HR boundary; do not copy into Finance Core. |
| `hr_advances` | yes | Finance cannot direct write; HR/Admin can | Finance consumes/posts money movement; HR owns source record. |
| `payment_methods` | yes | Finance can manage | Shared configuration. |
| `payment_terms` | yes | Finance read only; Admin/Super Admin manage | Commercial terms, not Finance transaction authorization. |

**F0 lock:** frontend permission labels do not by themselves define DB write authority. Every Finance mutation must align UI permission, route/server boundary, RPC/private authorization, grants, RLS and lifecycle constraints.

## 9. Existing Admin routes

Current `/finance` surface contains only:

- `/finance/payroll` -> `@/components/hr/PayrollManager`
- `/finance/compensation` -> `@/components/hr/CompensationManager`

Those routes are Finance-visible projections of HR models; they are not a separate Finance data engine.

Current `/reports` contains inventory and stock-movement reports only. There is no Finance cash-flow/AP/AR/account movement report surface yet.

Customer invoices remain under `/customers/invoices` and Project collections under Project UI.

## 10. Canonical migration history relevant to Finance F0

Verified production migration history includes:

- `20260827081218_reporting_center_and_expense_ledger`
- `20260827091128_add_finance_user_role`
- `20260827092706_finance_role_permissions_v2`
- `20260827094303_finance_panel_notification_access`
- `20260827094726_finance_financial_settings_access`
- `20260827102412_fix_finance_invoice_state_core_access`
- `20260827104719_personnel_employee_master_foundation`
- `20260827105551_isolate_hr_from_shared_operational_reads`
- `20260827111759_hr_core_suite_foundation`
- `20260827112047_hr_payroll_workflow`
- `20260827113359_hr_payroll_workflow_fixes`
- `20260827113904_hr_schedules_training_relations_and_accruals`
- `20260903110906_project_financial_rollup`
- `20260903111231_project_financial_rollup_runtime_fix`
- `20260903111716_project_financial_rollup_advisor_hardening`
- `20260903124606_customer_project_payment_ledger`
- `20260903124630_customer_project_payment_ledger_hardening`
- `20260903124645_customer_project_payment_invoice_role_guard`
- `20260903125353_customer_project_payment_advisor_cleanup`
- `20260903164638_customer_project_payment_edit_delete_audit`
- `20260903180008_customer_project_payment_plan_quick_flow`

The historical migration name `reporting_center_and_expense_ledger` does not mean a general Finance transaction ledger exists today. Production table review found no canonical bank account, cash account, AP, journal or general Finance transaction table.

## 11. Supplier/Vendor master decision

Production contains vendor-catalog integration tables and textual vendor fields, but no canonical business `suppliers`/`vendors` master or `supplier_id`/`vendor_id` FK was identified in the public schema review.

Therefore:

- F1 must not invent a Supplier master merely to satisfy optional Finance attribution.
- F2 may preserve free-text vendor on existing expenses during bridge work.
- F3 owns the deliberate creation/reuse decision for the canonical Vendor/Supplier business master before AP FKs are introduced.
- Vendor Catalog vendor codes are integration/source identities and must not automatically be treated as accounts-payable counterparties.

## 12. Finance Core lifecycle locked for F1

### Account types

Initial operational account types:

- `bank`
- `cash`
- `clearing`

Do not introduce full statutory chart-of-accounts classes in F1.

### Transaction lifecycle

- `draft` — editable, does not affect account balance; may be hard-deleted before posting.
- `posted` — affects account balance and is immutable as financial history.
- `voided` — only for a posted transaction when the canonical mutation proves it has no dependent allocation/reconciliation that requires a counter-transaction.
- otherwise correction is a new `reversal` transaction linked to the original.

Posted amount/currency/account changes are never implemented as silent in-place edits in Finance Core.

### Initial operational transaction kinds

- `expense`
- `customer_receipt`
- `vendor_payment`
- `employee_payment`
- `deposit`
- `withdrawal`
- `transfer`
- `refund`
- `reversal`

These are operational money-movement kinds, not a statutory GL chart. Source-domain subtype/reference metadata may provide more detail without changing ownership semantics.

## 13. Finance Core attribution/allocation contract

A Finance transaction may have zero or more contextual links. Project/Order/Customer/Vendor/Employee references are nullable at Core level.

For amounts shared across multiple business contexts, use an allocation/link layer. Do not add one universal required `project_id` to the transaction header.

Required validation:

- allocated amounts cannot exceed the source transaction amount;
- allocation currency/value semantics must be deterministic;
- cross-entity links must be valid and auditable;
- source transaction total remains authoritative;
- Project financial summary consumes these links/allocations later; it does not own them.

## 14. Currency/FX contract for F1

Every posted Finance transaction must preserve:

- transaction currency;
- transaction amount;
- company main/base currency at posting time;
- base-currency amount;
- FX rate when transaction currency differs from base currency;
- FX rate source/type;
- explicit manual/negotiated-rate indicator when applicable;
- transaction-time rate snapshot timestamp/effective date.

If transaction currency equals base currency, conversion fields may be null/identity as designed, but reporting remains deterministic.

Historical reports use the stored snapshot and do not silently revalue old transactions with a newer daily FX rate.

## 15. Idempotency and audit contract

Sensitive Finance posting/payment mutations must have an idempotency boundary suitable for retrying UI/network requests without duplicating money movement.

Minimum audit fields/behavior:

- actor;
- created/posted/voided/reversed timestamps where applicable;
- source document/reference;
- original transaction/reversal reference;
- reason for void/reversal;
- immutable amount/currency/account snapshot once posted;
- optional Project/Order/Customer/Vendor/Employee attribution history;
- idempotency key/request identity;
- before/after snapshot only where a draft/admin mutation legitimately changes mutable state.

## 16. Compatibility/backfill strategy

### `company_expenses`

Current production count is zero. F2 can add a bridge/posting FK/relationship without historical data migration today, but the migration must still be additive because new expense rows may exist by execution time.

### Customer invoices

Two live invoices exist. Keep current document schema and `paid_amount/status` compatibility through F1-F4. F5 will make payment allocation/posting authoritative incrementally; do not zero/recalculate historical values without reconciliation.

`ledger_managed` remains a compatibility flag. F1 does not repurpose or remove it.

### Project payments

Two live transaction rows and two Payment Plan/requirement rows exist. Preserve IDs, allocations, audit history and current Project UX. F5 adds Finance linkage/reconciliation; it does not replace these rows in-place.

### HR payroll/advances

Current production payroll/advance counts are zero, but source models are real and UI/RPC behavior exists. F4 integrates them additively and re-checks for rows at migration time.

### Vendor/Supplier

No backfill is possible until F3 defines a canonical business counterparty master. Existing free-text vendor/source-vendor identifiers remain untouched before that decision.

## 17. F1 schema-design prerequisites

F1 may begin only after this F0 contract is accepted. Its migration design must include at minimum:

1. `finance_accounts` operational account model.
2. `finance_transactions` immutable posted transaction model.
3. account balance semantics derived from posted transactions, never manually edited balance truth.
4. optional attribution/allocation layer.
5. audit/reversal/idempotency model.
6. base-currency + FX snapshot model.
7. public wrapper/private core RPC boundary.
8. RLS/grants aligned with `finance.view` / `finance.manage` and source-domain permissions.
9. zero destructive rewrite of existing Project payment, invoice, expense or payroll source domains.
10. reconciliation queries proving no production source rows are lost or double-counted.

## 18. F0 status

### Completed evidence collection

- production table inventory;
- nullability/constraint inventory;
- production row-count snapshot;
- relevant index inventory;
- RLS policy inventory;
- public RPC inventory and execute grants;
- private authorization behavior for key invoice/Project-payment/payroll operations;
- current Finance/Admin route review;
- Admin permission review;
- relevant production migration history;
- Supplier/Vendor master absence check.

### Review gate

A6-F0 remains **active / `[~]`** until the project owner accepts this baseline and lifecycle/permission/backfill contract. No A6-F1 production schema migration should be created before that acceptance.
