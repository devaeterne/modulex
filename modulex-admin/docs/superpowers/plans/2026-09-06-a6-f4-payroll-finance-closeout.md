# A6-F4 Payroll / Finance Closeout Plan

Date: 2026-09-06  
Base: `d3de70f181ffa5c36a62f672e26149a4e1b0468a`  
Branch: `feat/a6-f4-payroll-integration-hardening`

## Goal

Complete the existing Payroll/Finance bridge without creating a parallel payroll ledger, while closing direct-source double-payment paths and making employee payment drafting atomic.

## Work packages

1. **Integrity hardening**
   - fail-closed direct source vocabulary
   - source-specific Employee/amount/status/currency validation
   - direct Variable Pay settlement/reversal reconciliation
   - payroll-preparation exclusion for already directly paid Variable Pay
   - base-currency-only Payroll preparation for F4
2. **Payroll lifecycle and obligation projection**
   - retain HR calculation workflow status
   - derive payment state from Finance
   - expose approved Payroll obligations, withholding and employer costs as read-only Finance projection
3. **Atomic Employee Payment drafting**
   - replace browser two-step transaction/link save with one DB RPC transaction
4. **Admin UX**
   - keep existing `/finance/payroll` and `/finance/transactions` routes
   - show Finance obligation summary on approved Payroll runs
   - add `Pay Remaining` handoff with Employee/Payroll Item/remaining amount prefill
5. **Verification and acceptance**
   - update legacy Employee Payment contract for the atomic flow
   - add F4 hardening contract
   - reuse the approved Admin A6 Finance Core workflow
   - keep production migration unapplied until owner merge and post-merge acceptance

## Safety decisions

- Posted Finance history remains immutable.
- Existing acceptance/demo Finance rows are not hard-deleted.
- Advance disbursement does not mutate payroll repayment balance.
- Direct Variable Pay settlement is full-remaining-only in F4 to avoid ambiguous partial source state.
- True multi-currency Payroll is deferred; F4 fails closed outside company base currency.
- Project/Order attribution remains optional and is not added as a Payroll ownership dependency.

## Exit

Source closeout is ready for owner merge only when current-head Finance Core, F4 contract, Admin UI, TypeScript, lint and build gates are GREEN. Production completion remains a separate post-merge migration/deploy/live-acceptance gate documented in `docs/acceptance/a6-f4-payroll-finance-integration.md`.
