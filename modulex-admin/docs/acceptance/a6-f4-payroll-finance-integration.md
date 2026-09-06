# A6-F4 Payroll / Finance Integration Acceptance

Status: **PRODUCTION ACCEPTANCE COMPLETE — F4 CLOSED**  
Date: 2026-09-06  
Production project: `bzjoeernnmvuhzyvbowc`  
Production Admin: `https://admin.oakwellcabinetry.com`

## Ownership contract

- HR remains the source of truth for employees, compensation, payroll periods/runs/items, Variable Pay, deductions, benefits, advances, and payroll calculations.
- Finance remains the source of truth for actual employee money movement.
- No duplicate payroll ledger, employee-payment ledger, or editable payroll-liability ledger is introduced.
- Project/Order attribution remains optional Finance context and is not required for payroll settlement.

## F4 production artifacts

Merged source baseline:

- F4 application/source merge commit: `5b24b2d2e8c5ff6c885106dae658ad1e2f793580`
- Atomic Employee Payment corrective merge commit: `24d828b1a2438043e890f4ffccf0018b8ae9526e` (PR #337)

Production migration history:

- `20260906175045` — `a6_finance_ap_aging`
- `20260906175226` — `a6_f4_payroll_integration_hardening`
- `20260906183539` — `a6_f4_atomic_employee_payment_draft_fix`

The corrective migration is additive. The already-applied F4 migration was not rewritten or removed from history.

## Closed integrity gaps

### Direct HR source integrity

Canonical direct Employee Payment source vocabulary fails closed to:

- `hr_payroll_item`
- `hr_variable_pay`
- `hr_advance`

Source-specific validation proves source existence, Employee identity, lifecycle eligibility, amount, and company base currency before posting.

Direct Variable Pay payment must settle the remaining source amount in full. Once posted Finance settlement fully covers the source, HR Variable Pay becomes `paid`. A Finance correction that reopens the source restores `approved` only when no Payroll settlement effect owns the paid state.

Direct Advance Finance payment represents advance cash disbursement. It does not reduce payroll repayment balance; repayment remains an HR Payroll calculation source and is reconciled only by the Payroll Item settlement flow.

### Double-payment prevention

Payroll preparation excludes Variable Pay already settled directly through posted Finance Employee Payments. The production hardening migration reconciled the pre-existing directly paid reimbursement from `approved` to `paid` without deleting or rewriting its posted Finance history.

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

The projection is reporting/planning data only; it does not create a second liability ledger and does not move cash.

### Atomic Employee Payment draft

`save_employee_payment_draft(...)` saves the Finance draft and canonical Employee/Payroll source link inside one database transaction boundary.

Production acceptance found that the first F4 migration accidentally called the canonical Finance Core draft creator with an obsolete extra `NULL` argument. PR #337 added a RED regression contract and an additive corrective migration. Production now verifies:

- the bad 11-argument call shape is absent;
- the canonical 10-argument call shape is present;
- the public RPC is executable only by `authenticated` and `postgres`;
- the private core is executable only by `postgres`;
- the RPC remains `SECURITY DEFINER` with pinned empty `search_path` through the established Finance boundary.

### Pay Remaining UX

Approved Payroll Item rows expose `Pay Remaining`. The handoff opens `/finance/transactions` with Employee, Payroll Item, and current remaining amount prefilled while Finance still requires source-account selection and explicit save/post.

The production Admin deployment is `READY` on F4 application commit `5b24b2d2e8c5ff6c885106dae658ad1e2f793580`. PR #337 changed only SQL migration/contract/workflow artifacts, so no newer UI bundle is required for its runtime fix; the corrective behavior is database-owned and is live through migration `20260906183539`.

## Repository verification

Permanent F4 contracts:

- `scripts/a6-finance-employee-payments-contract.mjs`
- `scripts/a6-payroll-finance-reconciliation-contract.mjs`
- `scripts/a6-f4-payroll-integration-hardening-contract.mjs`

The F4 contract is wired into `.github/workflows/admin-a6-finance-core.yml`.

Atomic-draft regression evidence:

- RED: Admin A6 Finance Core run #229 failed on the new arity regression assertion before the corrective migration existed.
- GREEN: Admin A6 Finance Core run #230 passed after the corrective migration.
- Admin UI Foundation run #2075 passed on the corrective branch head.

## Production transactional acceptance

A controlled production acceptance was executed inside one explicit transaction with an authenticated Admin actor and finished with `ROLLBACK`. Assertions covered the real Finance/HR functions and triggers while guaranteeing that test business data could not persist.

Verified path:

1. Create temporary Payroll Period and Run.
2. Prepare Payroll.
3. Confirm the already-direct-paid reimbursement does **not** re-enter Payroll.
4. Confirm the approved `$500` bonus enters Payroll once.
5. Confirm `$100` payroll advance repayment enters Payroll once.
6. Approve the Payroll Run.
7. Verify Finance obligation projection starts `unpaid` with full remaining amount.
8. Create atomic partial Employee Payment draft and verify exactly one canonical Employee/Payroll link.
9. Post partial payment and verify `partial` paid/remaining projection.
10. Confirm partial settlement does not prematurely apply Variable Pay or Advance repayment HR effects.
11. Post the remaining amount and verify `paid`, Variable Pay transition to `paid`, and Advance balance reduction exactly once.
12. Reverse the remaining payment and verify settlement reopens, Variable Pay returns to `approved`, and Advance balance is restored.
13. Re-settle after reversal and verify `paid` again.
14. Reverse the re-settlement and void the original partial payment; verify final derived state returns to `unpaid` with HR effects restored.
15. Confirm manually setting Payroll Run to `paid` remains blocked because payment state is Finance-derived.
16. Create a temporary standalone Variable Pay source, pay it through Finance, verify `paid`, reverse it, and verify `approved` is restored.
17. Confirm duplicate direct Advance disbursement fails closed.

Negative-path assertions also verified:

- unsupported Employee Payment source type fails closed;
- Employee/source mismatch fails closed;
- Payroll overpayment fails closed;
- non-base-currency Payroll payment fails closed;
- failed atomic operations leave no orphan Finance draft.

After rollback, production residue checks returned:

- acceptance Payroll Period rows: `0`
- acceptance Finance transaction rows: `0`
- temporary direct Variable Pay rows: `0`

The pre-existing business state also remained correct after rollback:

- historical directly paid reimbursement: `paid`
- approved bonus: `approved`
- open Advance balance: `300`

## Production security boundary

Fresh catalog/ACL inspection verified the F4/F3F Finance wrappers and private cores use the intended boundary:

- public read/write wrappers: `SECURITY DEFINER`, pinned empty `search_path`, authenticated-only application execution;
- private validation/reconciliation cores: `SECURITY DEFINER`, pinned empty `search_path`, no browser-role execute grant.

Security Advisor produced no F4-specific blocking `WARN`/`ERROR`. The F4 settlement state/effects tables appear only as INFO-level `rls_enabled_no_policy`; these tables are intentionally internal and are not exposed as browser-callable application data.

Performance Advisor produced no F4-specific blocking `WARN`/`ERROR`. Relevant F4 findings are INFO-level missing covering indexes on actor/update foreign keys. Unrelated global advisor debt, including an existing Store permissive-policy warning, remains outside F4 scope.

## Production deployment evidence

Vercel project `modulex` (`modulex-admin` root) reports the production deployment as `READY` with aliases including `admin.oakwellcabinetry.com`.

The active production deployment was built from F4 application commit `5b24b2d2e8c5ff6c885106dae658ad1e2f793580`. The subsequent #337 correction contains no application/UI source delta; its required runtime change is the production database function correction already applied and verified above.

## F4 exit decision

A6-F4 is **production-complete** for the locked scope:

- HR calculation ownership is preserved;
- Finance money-movement ownership is preserved;
- direct-source double-payment paths are closed;
- Payroll payment state is Finance-derived;
- employer cost/withholding obligations are projected without a duplicate ledger;
- Employee Payment draft+link persistence is atomic;
- partial/full/reversal/void reconciliation is production-verified;
- negative integrity cases fail closed;
- migration/RPC/ACL/search-path boundaries are verified;
- advisor findings contain no F4 blocking issue;
- transactional acceptance left no test residue.

The next Finance delivery package is **A6-F5 — Sales / Accounts Receivable integration**.

## Rollback principle

Posted Finance history is never hard-deleted for rollback. Future production corrections must use additive migrations and canonical Finance void/reversal semantics rather than mutating historical posted transactions in place.
