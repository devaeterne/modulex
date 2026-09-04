# Finance Employee Payments — Approved Design

Status: **APPROVED 2026-09-04**

## Goal

Record an employee salary/payment once in Finance and expose the same posted money movement in Personnel/Payroll without duplicate manual payment records.

## Ownership

- HR owns employee master data, compensation, payroll periods/runs/items and payroll calculation.
- Finance owns the actual bank/cash money movement.
- `finance_transactions` remains the canonical payment event.
- `finance_transaction_links` provides Employee and optional Payroll Item attribution.
- Personnel/Payroll surfaces Finance payment data as read-only projections; they do not create a second payment record.

## Employee payment invariant

A posted `employee_payment` must:

1. use the existing Finance transaction lifecycle;
2. have a source Finance account only;
3. have exactly one employee attribution;
4. allocate the full Finance transaction amount to that employee;
5. reject a missing/nonexistent employee;
6. reject an employee attribution that does not match a linked Payroll Item.

Drafts may be created before the Employee/Payroll Item link is complete, but posting fails closed until the Employee invariant is satisfied.

## Payroll Item link

For a salary payment, use the existing Finance link fields:

- `employee_id = hr_payroll_items.employee_id`
- `source_document_type = 'hr_payroll_item'`
- `source_document_id = hr_payroll_items.id`
- `allocated_amount = finance_transactions.amount` for a full payment, or the partial amount for a partial payment

Multiple posted Finance transactions may settle one Payroll Item. This supports partial salary payments without duplicating payroll items.

A linked Payroll Item must exist and belong to the same Employee as the Finance link.

## Settlement projection

Payroll settlement is derived only from posted Finance transaction links whose source document is the Payroll Item. Voided Finance rows do not count. Reversal rows compensate the original money movement and must reduce the derived paid amount rather than silently preserving a paid state.

For each Payroll Item, expose:

- net pay
- Finance paid amount
- remaining amount = max(net pay - Finance paid, 0)
- payment status: `unpaid`, `partial`, or `paid`
- latest payment timestamp when available

The existing HR payroll run lifecycle (`draft`, `calculated`, `approved`, legacy `paid`) is not used as the canonical proof that money moved. The Personnel UI must not offer a manual `Mark Paid` action that can contradict Finance.

## Employee payment history

Personnel Employees must expose a read-only payment-history view for a selected employee. It is derived from posted Finance transactions linked through `finance_transaction_links.employee_id` and includes transaction date, amount/currency, reference, linked payroll item when present and Finance transaction id/status context needed for traceability.

## UI behavior

### Finance / Transactions

When `Transaction type = Employee payment`:

- Employee selector is required before draft save/post workflow can complete.
- Payroll Item selector is optional and filtered to the selected employee.
- Saving the draft creates one Finance transaction and then writes its canonical Finance link through `set_finance_transaction_links`.
- No HR payment row is inserted.

### Personnel / Payroll

Payroll item rows display `Finance Paid`, `Remaining` and derived payment status. Remove/disable the manual `Mark Paid` control as a money-movement source of truth.

### Personnel / Employees

Provide a read-only Payments action/modal for an employee, backed by the Finance projection.

## Authorization

- Finance mutations remain behind `finance.manage` and existing private/public Finance RPC boundaries.
- HR/Personnel reads use a narrowly scoped authenticated read RPC/projection; no direct write grant to Finance tables is introduced.
- Finance source-domain attribution validation occurs in the database, not only in React.

## Audit and corrections

Posted Finance history remains immutable. Void/reversal rules remain unchanged. Payroll/Employee projections must reflect corrected Finance history rather than maintain a separate editable payment status.

## Rollout

This change is source-only until owner review/merge. Do not apply the new migration to production or deploy Admin as part of the implementation PR.
