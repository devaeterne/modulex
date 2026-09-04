# Payroll ↔ Finance Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile fully settled payroll items into HR variable-pay and advance lifecycle without creating duplicate payment records.

**Architecture:** Finance remains canonical for actual employee money movement. A private reconciliation function derives signed posted payroll allocations from Finance, applies HR effects only on full settlement, records reversible effect rows, and undoes only its own effects if a Finance reversal reopens the payroll item.

**Tech Stack:** PostgreSQL/Supabase, PL/pgSQL, Next.js Admin contract tests, GitHub Actions.

**Spec:** `modulex-admin/docs/superpowers/specs/2026-09-04-payroll-finance-reconciliation.md`

## Global Constraints

- #298 is the prerequisite employee-payment/payroll-link package.
- Partial payment must not settle HR side effects.
- Reversal must be deterministic and idempotent.
- Finance transactions remain the only actual money-movement records.
- Do not apply the migration to production before owner review/merge.

---

### Task 1: Lock reconciliation contract

**Files:**
- Create: `modulex-admin/scripts/a6-payroll-finance-reconciliation-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-employee-payments-contract.mjs`

**Interfaces:**
- Consumes: #298 Finance employee-payment SQL and payroll-item links.
- Produces: a static CI contract requiring reconciliation state/effect ledger, full-settlement gating, reversal support and private grants.

- [ ] Write the failing contract requiring byte-identical Admin/migration SQL and reconciliation primitives.
- [ ] Chain the contract from the existing Finance Employee Payments contract.
- [ ] Verify the Finance workflow fails because reconciliation SQL does not yet exist.

### Task 2: Add reconciliation schema and engine

**Files:**
- Create: `modulex-admin/sql/a6-payroll-finance-reconciliation.sql`
- Create: `modulex-store/supabase/migrations/20260904153000_a6_payroll_finance_reconciliation.sql`

**Interfaces:**
- Produces: `private.reconcile_hr_payroll_finance_item(uuid)` and trigger orchestration for posted employee-payment/reversal transitions.

- [ ] Add settlement state and effect ledger tables with RLS enabled and no direct app-role mutation grants.
- [ ] Add helpers to compute signed posted paid amount for a payroll item.
- [ ] Validate variable-pay source totals against payroll item snapshots before applying status changes.
- [ ] Validate eligible advance repayment total against payroll item `advance_repayment` before mutating balances.
- [ ] On transition to fully settled, mark included `hr_variable_pay` rows paid and apply advance repayments, recording every effect.
- [ ] On transition away from fully settled, revert only active reconciliation effects and mark effect rows reverted.
- [ ] Invoke reconciliation after relevant Finance posting/reversal transitions.
- [ ] Revoke app-role execution on private helpers and reload PostgREST schema.
- [ ] Keep Admin SQL and Supabase migration byte-identical.

### Task 3: Verification and stacked PR

**Files:**
- Modify: PR metadata only if required.

**Interfaces:**
- Consumes: Finance Core smoke chain and Admin CI.
- Produces: a draft stacked PR targeting `feat/a6-finance-employee-payments` until #298 is merged.

- [ ] Run Finance Core contract and confirm reconciliation contract passes.
- [ ] Confirm Admin UI/typecheck/lint/build remain unaffected.
- [ ] Open draft PR with explicit dependency on #298 and no production rollout.
- [ ] After #298 merge, retarget this PR to `main` before merge.
