# A6-F4 Payroll / Finance Integration Acceptance

Status: **SOURCE IMPLEMENTATION COMPLETE — PRE-MERGE VERIFICATION IN PROGRESS**  
Date: 2026-09-06  
Branch: `feat/a6-f4-payroll-integration-hardening`  
Production mutation: **NOT APPLIED**

## Ownership contract

- HR remains the source of truth for employees, compensation, payroll periods/runs/items, variable pay, deductions, benefits, advances, and payroll calculations.
- Finance remains the source of truth for actual employee money movement.
- No duplicate payroll ledger or employee-payment ledger is introduced.
- Project/Order attribution remains optional Finance context and is not required for payroll settlement.

## F4 closeout invariants

### Direct HR source integrity

Canonical direct Employee Payment source vocabulary is fail-closed to:

- `hr_payroll_item`
- `hr_variable_pay`
- `hr_advance`

Source-specific validation must prove source existence, Employee identity, lifecycle eligibility, amount, and company base currency before posting.

Direct Variable Pay payment must settle the remaining source amount in full. Once the posted Finance total settles the source, HR Variable Pay becomes `paid`. A Finance void/reversal that reopens the source restores `approved` only when no Payroll settlement effect owns the paid state.

Direct Advance Finance payment represents advance cash disbursement. It must not reduce payroll repayment balance; repayment remains an HR payroll calculation source and is reconciled only by the Payroll Item settlement flow.

### Double-payment prevention

Payroll preparation must not include Variable Pay already settled directly through posted Finance Employee Payments. The hardening migration also reconciles pre-existing fully settled direct Variable Pay rows to `paid` when it lands.

A Variable Pay source already included in a calculated/approved Payroll run cannot be paid directly as standalone Variable Pay; the Payroll Item must be used instead.

### Payroll currency boundary

F4 does not attempt true multi-currency payroll. Payroll preparation fails closed when compensation, Variable Pay, Advance, or Benefit Plan source currency differs from the company Finance base currency. Historical Finance transaction FX behavior remains unchanged.

### Payroll lifecycle

HR run workflow remains calculation state (`draft` / `calculated` / `approved`). Payment completion is Finance-derived and exposed as `unpaid` / `partial` / `paid`; F4 does not rely on a manually maintained HR `paid` flag.

### Finance obligation projection

`get_finance_payroll_obligations()` is a read-only projection over approved HR Payroll Items and posted Finance settlement history. It exposes:

- employee net pay
- Finance paid amount
- remaining amount
- payment status
- employee withholding
- employee deductions
- advance repayment
- employer payroll taxes
- employer benefit cost
- total employer cost

The projection is planning/reporting data; it does not create a second liability ledger and does not move cash.

### Atomic Employee Payment draft

`save_employee_payment_draft(...)` saves the Finance draft and canonical Employee/Payroll source link inside one DB transaction boundary. The Admin UI no longer creates a Finance draft first and links it in a second browser RPC that can leave an orphan draft.

### Pay Remaining UX

Approved Payroll Item rows expose `Pay Remaining`. The handoff opens `/finance/transactions` with:

- `kind=employee_payment`
- Employee ID
- Payroll Item ID
- current remaining amount

The Finance form still requires the user to select the actual source account and explicitly save/post the transaction.

## Automated verification

Required contracts:

- `scripts/a6-finance-employee-payments-contract.mjs`
- `scripts/a6-payroll-finance-reconciliation-contract.mjs`
- `scripts/a6-f4-payroll-integration-hardening-contract.mjs`

The F4 contract is wired into the existing `.github/workflows/admin-a6-finance-core.yml`; no parallel CI workflow is added.

Required repository gates before owner merge:

- F4 contracts GREEN
- Finance Core regression GREEN
- Admin UI Foundation GREEN
- TypeScript GREEN
- lint GREEN
- production build GREEN
- Admin SQL and Store migration mirror byte-identical

## Read-only production evidence before implementation

Production project: `bzjoeernnmvuhzyvbowc`.

Observed before this hardening package:

- Payroll periods: 0
- Payroll runs: 0
- Payroll items: 0
- Payroll settlement state/effects: 0
- posted Finance Employee Payments: 2
- one posted Employee Payment linked to `hr_advance`
- one posted Employee Payment linked to `hr_variable_pay`
- the directly paid Variable Pay source remained `approved`, which made it eligible for a future Payroll preparation and exposed a double-payment path

This package was designed to close that path without deleting posted Finance history.

## Post-merge production acceptance gate

Do not mark F4 production-complete until all steps below are executed after owner merge/deploy:

1. Re-read current production migration history and confirm the exact merged migration is still missing.
2. Apply the exact merged `20260906170000_a6_f4_payroll_integration_hardening.sql` through the canonical migration path.
3. Confirm historical directly settled Variable Pay is reconciled without deleting or rewriting posted Finance transactions.
4. Execute a controlled Payroll acceptance path:
   - create Payroll Period
   - create Run
   - Prepare
   - enter/verify taxes
   - Approve
   - create partial Payroll Item Employee Payment
   - verify `partial` / remaining projection
   - settle remaining amount
   - verify full settlement HR side effects
   - reverse/void through canonical Finance correction flow
   - verify settlement reopens and reconciliation-owned HR effects revert safely
5. Verify standalone direct Variable Pay full payment and reversal behavior.
6. Verify unsupported direct source type, Employee mismatch, overpayment, and currency mismatch fail closed.
7. Verify `Pay Remaining` prefill and atomic draft behavior in authenticated Admin UI.
8. Run Security Advisor and Performance Advisor; classify intentional Finance `SECURITY DEFINER` findings against role checks/search-path/grants.
9. Remove acceptance artifacts only through canonical void/reversal or transactional rollback; leave no demo residue.
10. Update roadmap/domain plan to production-complete only after all evidence is GREEN.

## Rollback principle

The migration is additive hardening. Posted Finance history is never hard-deleted for rollback. If post-merge acceptance identifies a business-state issue, use a new corrective migration and canonical Finance reversal/void semantics rather than mutating historical posted transactions in place.
