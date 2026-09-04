# Finance Employee Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record an employee payment once in Finance, require canonical Employee attribution, optionally link salary payments to a Payroll Item, and expose posted settlement in Personnel/Payroll without duplicate payment records.

**Architecture:** Extend Finance through a new additive migration rather than rewriting the already-merged F1 migration. The new migration validates Employee/Payroll Item attribution at the DB boundary and adds authenticated read projections for Finance employee-payment entry and HR settlement/history. React uses those RPCs only; HR remains the payroll-calculation owner while Finance remains the actual-money owner.

**Tech Stack:** PostgreSQL/Supabase RPC + RLS/grants, Next.js 16, React 19, TypeScript, existing Modulex Admin UI primitives, Node smoke contracts.

**Spec:** `docs/superpowers/specs/2026-09-04-finance-employee-payments.md`

## Global Constraints

- `finance_transactions` is the only canonical money movement record.
- Do not add an HR payment table or duplicate payment mutation.
- Posted `employee_payment` requires exactly one Employee attribution and full amount allocation.
- Payroll Item attribution uses `source_document_type='hr_payroll_item'` and `source_document_id=hr_payroll_items.id`.
- Payroll settlement is derived from posted Finance history and must reflect void/reversal corrections.
- The Payroll UI must not treat manual `Mark Paid` as canonical proof of payment.
- No production migration/deploy in this PR.

---

### Task 1: RED contract for Employee payment integration

**Files:**
- Create: `scripts/a6-finance-employee-payments-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing F1 Finance SQL, adapter and Admin components.
- Produces: `npm run smoke:a6-finance-employee-payments`, chained into `smoke:a6-finance-core`.

- [ ] **Step 1: Write the failing contract**

The contract must assert the additive Admin SQL/migration mirror exists and remains byte-identical, and that source includes:

```js
expect(sql.includes("private.validate_finance_employee_payment_posting"), "Employee payment posting must be DB validated");
expect(sql.includes("source_document_type = 'hr_payroll_item'"), "Payroll Item attribution must use the canonical source-document type");
expect(core.includes("getFinanceEmployeeDirectory"), "Finance adapter must expose Employee choices");
expect(manager.includes("finance-employee"), "Employee payment UI must expose Employee selection");
expect(payroll.includes("Finance Paid"), "Payroll UI must expose Finance-paid settlement");
expect(!payroll.includes('setRunStatus("paid")'), "Payroll UI must not manually mark money as paid");
expect(employees.includes("Payments"), "Employee Directory must expose payment history");
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
npm run smoke:a6-finance-employee-payments
```

Expected: FAIL because the additive SQL/migration and UI/RPC behavior do not exist yet.

- [ ] **Step 3: Commit RED evidence**

```bash
git add modulex-admin/scripts/a6-finance-employee-payments-contract.mjs modulex-admin/package.json
git commit -m "test(finance): define employee payment link contract"
```

### Task 2: DB-authoritative Employee/Payroll attribution

**Files:**
- Create: `sql/a6-finance-employee-payments.sql`
- Create: `../modulex-store/supabase/migrations/20260904150000_a6_finance_employee_payments.sql`

**Interfaces:**
- Consumes: `finance_transactions`, `finance_transaction_links`, `hr_employees`, `hr_payroll_items`, existing Finance private/public RPCs.
- Produces: posting validation and narrow authenticated read RPCs.

- [ ] **Step 1: Add Employee/Payroll Item link validation**

Define a DB trigger/private validator that proves:

```sql
if new.employee_id is not null then
  perform 1 from public.hr_employees e where e.id = new.employee_id;
  if not found then
    raise exception 'Finance attribution Employee not found.' using errcode='23503';
  end if;
end if;

if new.source_document_type = 'hr_payroll_item' then
  select i.employee_id into v_payroll_employee
  from public.hr_payroll_items i
  where i.id = new.source_document_id;
  if not found or new.employee_id is distinct from v_payroll_employee then
    raise exception 'Finance Payroll Item attribution must match the Employee.' using errcode='23514';
  end if;
end if;
```

- [ ] **Step 2: Guard posting of `employee_payment`**

Extend the private posting path so posting fails unless exactly one Employee is linked and its allocation equals the Finance transaction amount. Draft creation remains allowed before links are complete.

- [ ] **Step 3: Add read RPCs**

Add authenticated `SECURITY DEFINER` read RPCs with locked `search_path`:

```sql
public.get_finance_employee_directory()
public.get_finance_employee_payroll_items(uuid)
public.get_hr_payroll_finance_settlement(uuid)
public.get_hr_employee_finance_payments(uuid)
```

`get_hr_payroll_finance_settlement` must derive paid/remaining/status from posted Finance transactions and compensate reversals/voids from canonical history.

- [ ] **Step 4: Mirror SQL exactly**

The Admin SQL and Supabase migration file must be byte-identical.

- [ ] **Step 5: Run contract**

Run `npm run smoke:a6-finance-employee-payments`; SQL assertions should pass while UI assertions may still fail.

### Task 3: Finance adapter and Employee payment form

**Files:**
- Modify: `src/lib/finance/core.ts`
- Modify: `src/components/finance/FinanceTransactionsManager.tsx`

**Interfaces:**
- Consumes: the four read RPCs plus existing `createFinanceTransactionDraft` and `setFinanceTransactionLinks`.
- Produces: typed Employee/Payroll choices and one draft+link save workflow.

- [ ] **Step 1: Add adapter types/functions**

Add:

```ts
export type FinanceEmployeeOption = { employee_id: string; employee_number: string; full_name: string };
export type FinancePayrollItemOption = { payroll_item_id: string; payroll_run_id: string; period_code: string; pay_date: string; net_pay: number; paid_amount: number; remaining_amount: number };
export async function getFinanceEmployeeDirectory(): Promise<FinanceEmployeeOption[]>;
export async function getFinanceEmployeePayrollItems(employeeId: string): Promise<FinancePayrollItemOption[]>;
```

- [ ] **Step 2: Add form state and selectors**

When kind is `employee_payment`, render required Employee selection and optional Payroll Item selection filtered to that employee.

- [ ] **Step 3: Persist one transaction plus one canonical link**

After draft creation:

```ts
const transactionId = await createFinanceTransactionDraft(...);
await setFinanceTransactionLinks(transactionId, [{
  employee_id: employeeId,
  source_document_type: payrollItemId ? "hr_payroll_item" : null,
  source_document_id: payrollItemId || null,
  allocated_amount: numericAmount,
}]);
```

If link write fails, surface the failure and leave the draft auditable/deletable rather than inventing an HR payment row.

- [ ] **Step 4: Run contract + typecheck**

Run:

```bash
npm run smoke:a6-finance-employee-payments
npm run typecheck
```

### Task 4: Payroll settlement projection

**Files:**
- Modify: `src/components/hr/PayrollManager.tsx`

**Interfaces:**
- Consumes: `get_hr_payroll_finance_settlement` RPC.
- Produces: read-only per-item `Finance Paid`, `Remaining`, and derived payment status.

- [ ] **Step 1: Add settlement type/load**

Use a map keyed by `payroll_item_id` with:

```ts
type FinanceSettlement = {
  payroll_item_id: string;
  paid_amount: number;
  remaining_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  latest_payment_at: string | null;
};
```

- [ ] **Step 2: Replace manual paid mutation**

Remove the `Mark Paid` button/call from the UI. Preserve legacy persisted run statuses for display but do not use `set_hr_payroll_run_status(..., 'paid')` as proof of money movement.

- [ ] **Step 3: Add settlement columns**

Display `Finance Paid`, `Remaining`, and a status badge/label per payroll item.

- [ ] **Step 4: Run contract + UI strict**

Run:

```bash
npm run smoke:a6-finance-employee-payments
npm run smoke:admin-ui-strict
```

### Task 5: Employee payment history projection

**Files:**
- Modify: `src/components/hr/EmployeeDirectory.tsx`

**Interfaces:**
- Consumes: `get_hr_employee_finance_payments(employee_id)`.
- Produces: read-only Payments modal/action per employee.

- [ ] **Step 1: Add payment history type and loader**

Use fields: Finance transaction id, transaction timestamp, amount, currency, reference, source account, payroll item id/period when linked.

- [ ] **Step 2: Add `Payments` action and read-only modal**

No Finance or HR mutation is exposed from the Personnel modal.

- [ ] **Step 3: Run contract + typecheck + lint**

Run:

```bash
npm run smoke:a6-finance-employee-payments
npm run typecheck
npm run lint
```

### Task 6: Roadmap/docs and full verification

**Files:**
- Modify: `docs/FINANCE_DOMAIN_PLAN.md`
- Modify: `ADMIN_ROADMAP.md`
- Modify: this plan checkbox/status as implementation progresses.

**Interfaces:**
- Produces: current A6 status reflecting Employee/Payroll linking without claiming production rollout.

- [ ] **Step 1: Document the link contract**

Record the one-payment/two-view rule, posted Employee invariant and derived Payroll settlement.

- [ ] **Step 2: Run full focused verification**

```bash
npm run smoke:a6-finance-core
npm run smoke:rbac
npm run smoke:admin-ui-strict
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 3: Verify branch diff and CI**

Confirm the branch only contains Finance/HR integration, contracts/docs and the additive migration; then require fresh GitHub Actions GREEN on the final head.

- [ ] **Step 4: Keep rollout separate**

Leave PR draft/open. Do not apply production migration or deploy until explicit owner instruction after merge/review.
