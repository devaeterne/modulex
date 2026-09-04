# Payroll ↔ Finance Reconciliation Spec

## Goal

Make Finance the only source of truth for actual employee cash movement while preserving HR as the owner of payroll inputs and lifecycle. When an approved payroll item becomes fully settled by posted Finance employee payments, HR-side variable pay and advance repayment effects must be applied exactly once. If Finance reversals reopen that payroll item, those effects must be safely undone.

## Locked domain boundaries

- HR owns compensation, variable pay, deductions, advances, benefits, payroll calculation and approved payroll items.
- Finance owns actual money movement, accounts, posting, void/reversal and payment history.
- No duplicate HR payment transaction table.
- `finance_transaction_links` remains the canonical bridge between a Finance payment and `hr_payroll_item`.
- A payroll item is financially settled only from posted Finance `employee_payment` minus posted Finance `reversal` allocations.

## Settlement rules

1. Partial Finance payment does not mutate HR variable-pay status or advance balances.
2. Full settlement (`paid_amount >= net_pay`) applies HR settlement effects once.
3. Variable-pay records included in the payroll period for the employee move from `approved` to `paid` only when the payroll item is fully settled.
4. Advance repayment is applied only when the payroll item is fully settled.
5. The aggregate eligible advance repayment must match the payroll item's `advance_repayment`; otherwise reconciliation fails closed.
6. The aggregate eligible variable-pay amounts by type must match the payroll item snapshots (`bonus_pay`, `commission_pay`, `other_earnings`, `reimbursements`); otherwise reconciliation fails closed.
7. Reversal that makes the payroll item no longer fully settled reverts only effects previously applied by this reconciliation package.
8. Re-applying after a reversal is allowed and idempotent.
9. Finance posting/reversal remains immutable/audited; HR settlement metadata is reconciliation state, not a second money-movement record.

## Reconciliation ledger

Use a dedicated internal reconciliation ledger so reversal is deterministic:

- one settlement-state row per payroll item
- effect rows for each HR variable-pay record transitioned by settlement
- effect rows for each advance repayment amount applied by settlement
- effect rows retain applied/reverted timestamps and never masquerade as Finance transactions

## Trigger points

Reconciliation is invoked after Finance transitions that can change payroll settlement:

- `employee_payment` draft → posted
- `reversal` draft → posted when it reverses a payroll-linked employee payment

The reconciliation function recomputes signed posted Finance allocations and derives whether each touched payroll item is fully settled.

## Permissions and safety

- Private reconciliation functions are not executable by `public`, `anon`, or `authenticated`.
- Public read projections remain governed by the #298 Finance/Personnel permission boundary.
- Reconciliation is fail-closed on source mismatch, unexpected HR state, overpayment, or inconsistent advance/variable-pay snapshots.
- No production migration is applied before owner review/merge.
