# A6-F6 Finance Reporting & Project Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Finance-owned operational reporting and Project/Order financial actuals from canonical posted Finance transactions and allocation links, while preserving existing AR/AP and commercial/current-cost profitability surfaces.

**Architecture:** Add a read-only F6 reporting layer over `finance_transactions`, `finance_transaction_links`, `finance_accounts`, and the existing F5 AR/AP projections. Company cash reporting derives direction from Finance account sides; operational income/expense reporting includes only business kinds whose meaning is already canonical, while transfer/deposit/withdrawal/refund remain cash-movement-only unless a later explicit accounting rule classifies them. Project and Order actuals consume explicit Finance allocation links and transaction-time base snapshots; they never fabricate attribution from source documents and never become a second ledger.

**Tech Stack:** PostgreSQL/Supabase RPCs, Next.js 16 App Router, React/TypeScript, existing Modulex Admin UI primitives, Node contract scripts, GitHub Actions.

**Spec:** `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`

## Global Constraints

- Finance remains the canonical owner of actual money movement; Project/Order are optional attribution contexts.
- Historical base-currency reporting must use stored `finance_transactions.base_amount` / transaction-time FX snapshots, never current FX.
- Draft and voided Finance rows do not contribute to actual reporting; posted reversal rows negate the original event.
- Company cash direction is account-side based: source account is negative, destination account is positive; a transfer changes two account balances but is zero company-wide.
- Operational income includes canonical `customer_receipt`; operational expense includes canonical `expense`, `vendor_payment`, and `employee_payment`. `deposit`, `withdrawal`, `transfer`, and `refund` stay visible as other cash movement and are not silently classified as income/expense.
- Project/Order allocation base value is proportional to the transaction snapshot: `allocated_amount / transaction.amount * transaction.base_amount`; missing posted base snapshots fail closed as unconverted instead of inventing a rate.
- Existing F5 AR Aging and AP Aging RPCs remain the receivable/payable truth and are reused, not copied into a new ledger.
- Existing `ProjectFinancialSummary` current-cost/commercial view stays intact. F6 adds a separate Finance-derived actuals projection.
- F6 reporting is read-only and permission-scoped to `finance.view`; it does not widen source-domain write permissions.
- Private reporting cores use `private.finance_assert_view()`, `SECURITY DEFINER`, and `set search_path = ''`; all relation references are schema-qualified.
- Public reporting RPCs revoke `EXECUTE` from `PUBLIC` and `anon` and intentionally grant only `authenticated`, with authorization still enforced inside the private Finance boundary.
- Admin canonical SQL and Store migration mirror remain byte-identical.
- No production migration is applied before the implementation PR is merged by the project owner.

---

## File Structure

- Create `modulex-admin/scripts/a6-finance-reporting-contract.mjs` — F6 architecture/security/UI contract and SQL/migration byte-equivalence gate.
- Modify `.github/workflows/admin-a6-finance-core.yml` — trigger on F6 files and run the new contract.
- Create `modulex-admin/sql/a6-finance-reporting.sql` — canonical read-only reporting RPC package.
- Create `modulex-store/supabase/migrations/<generated-timestamp>_a6_finance_reporting.sql` — byte-identical Store migration mirror created with the repository/Supabase migration convention at implementation time.
- Create `modulex-admin/src/lib/finance/reports.ts` — typed client adapters for F6 RPCs.
- Create `modulex-admin/src/app/(admin)/finance/reports/page.tsx` — Finance Reports route metadata/shell.
- Create `modulex-admin/src/components/finance/reports/FinanceReportsWorkspace.tsx` — consolidated company reporting workspace.
- Create `modulex-admin/src/components/customers/project-detail/ProjectFinanceActuals.tsx` — Finance-derived Project actuals card.
- Modify `modulex-admin/src/components/customers/project-detail/ProjectFinanceTab.tsx` — preserve commercial summary and mount Finance actuals only when allowed.
- Modify `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx` — derive `finance.view` and pass it to the Finance tab.
- Modify `modulex-admin/src/layout/AppSidebar.tsx` — add `/finance/reports` under Finance using `finance.view`.
- Modify `modulex-admin/scripts/finance-reports-ui-contract.mjs` — include the new route in legacy Finance/Reports UI coverage.
- Create `modulex-admin/docs/acceptance/a6-f6-finance-reporting.md` — pre-merge verification and post-merge production acceptance matrix.

---

### Task 1: Lock the F6 contract in RED

**Files:**
- Create: `modulex-admin/scripts/a6-finance-reporting-contract.mjs`
- Modify: `.github/workflows/admin-a6-finance-core.yml`

**Interfaces:**
- Consumes: locked F6 requirements from `docs/FINANCE_DOMAIN_PLAN.md` and existing F1/F5 SQL contracts.
- Produces: one executable Node contract that fails until every required F6 artifact and security invariant exists.

- [ ] **Step 1: Write the failing contract**

The contract must assert all of the following with deterministic file/string checks:

```js
const required = [
  "sql/a6-finance-reporting.sql",
  "src/lib/finance/reports.ts",
  "src/app/(admin)/finance/reports/page.tsx",
  "src/components/finance/reports/FinanceReportsWorkspace.tsx",
  "src/components/customers/project-detail/ProjectFinanceActuals.tsx",
];
```

It must also assert canonical RPC names `get_finance_reporting_summary`, `get_finance_cash_flow_series`, `get_finance_account_movements_page`, `get_finance_project_actuals_page`, `get_project_finance_actuals`; `private.finance_assert_view()`; `security definer`; `set search_path = ''`; explicit `revoke execute ... from public, anon`; `grant execute ... to authenticated`; posted-only reporting; base snapshot use; proportional allocation-base calculation; transfer neutrality; reversal handling; `/finance/reports` sidebar presence; Project Finance mounting the F6 actuals card; and byte-identical SQL/migration content.

- [ ] **Step 2: Wire the contract into Finance CI**

Add the new script, canonical SQL, Store migration pattern, Project Finance component paths, and F6 acceptance doc to workflow path filters. Add:

```yaml
- run: node scripts/a6-finance-reporting-contract.mjs
```

after the existing AR contract and before the general Finance/Reports UI contract.

- [ ] **Step 3: Commit RED**

```bash
git add modulex-admin/scripts/a6-finance-reporting-contract.mjs .github/workflows/admin-a6-finance-core.yml
git commit -m "test(finance): lock F6 reporting contract"
```

- [ ] **Step 4: Verify RED**

Run or observe the `Admin A6 Finance Core` workflow for the RED commit. Expected: the F6 contract fails because `sql/a6-finance-reporting.sql` and the F6 UI/client artifacts do not exist; pre-existing Finance contracts remain GREEN.

---

### Task 2: Implement canonical Finance reporting projections

**Files:**
- Create: `modulex-admin/sql/a6-finance-reporting.sql`
- Create: `modulex-store/supabase/migrations/<generated-timestamp>_a6_finance_reporting.sql`

**Interfaces:**
- Consumes: `private.finance_assert_view()`, `private.finance_base_currency()`, `finance_transactions`, `finance_transaction_links`, `finance_accounts`, `finance_categories`.
- Produces:
  - `private.finance_reporting_transaction_projection(p_from date, p_to date)`
  - `public.get_finance_reporting_summary(p_from date, p_to date) -> jsonb`
  - `public.get_finance_cash_flow_series(p_from date, p_to date, p_grain text) -> table`
  - `public.get_finance_account_movements_page(p_from date, p_to date, p_account_id uuid, p_limit int, p_offset int) -> table`
  - `public.get_finance_project_actuals_page(p_from date, p_to date, p_limit int, p_offset int, p_search text) -> table`
  - `public.get_project_finance_actuals(p_project_id uuid, p_from date, p_to date) -> jsonb`

- [ ] **Step 1: Build the posted transaction projection**

Each posted row must expose base currency/amount and cash direction. For company-wide cash:

```sql
case
  when t.source_account_id is not null and t.destination_account_id is null then -t.base_amount
  when t.destination_account_id is not null and t.source_account_id is null then t.base_amount
  else 0::numeric
end as company_cash_delta
```

Transfers therefore net to zero company-wide. Reversals already swap source/destination in Finance Core, so the same account-side rule negates the original. Do not re-negate reversal rows by kind.

Operational classification must be explicit:

```sql
case when t.transaction_kind = 'customer_receipt' then t.base_amount else 0 end as operating_income,
case when t.transaction_kind in ('expense','vendor_payment','employee_payment') then t.base_amount else 0 end as operating_expense
```

For reversal rows, derive the original `transaction_kind` through `reversal_of_transaction_id` and apply the opposite income/expense effect.

- [ ] **Step 2: Implement summary and cash-flow series**

`get_finance_reporting_summary` returns base currency, period, operating income, operating expense, operating result, net cash change, other cash inflow/outflow, posted event count, reversal count, and unconverted posted count. If any relevant posted row lacks a base snapshot, affected base totals return `NULL` plus `unconverted_count > 0`.

`get_finance_cash_flow_series` supports `month` and `day`, validates the grain, and returns deterministic period buckets with operating income/expense, other inflow/outflow, and net cash change.

- [ ] **Step 3: Implement account movements**

Return one row per posted transaction touching the requested account with `account_delta` based on the account side, transaction/base amounts, kind, status, reference, date, counter-account name, and total_count. A transfer appears once for each account when each account is queried; a reversal offsets the original naturally.

- [ ] **Step 4: Implement Project/Order linked actuals**

For each `finance_transaction_links` row attached to a Project or Order, calculate:

```sql
case
  when t.base_amount is null or t.amount <= 0 then null
  else round(l.allocated_amount / t.amount * t.base_amount, 4)
end
```

Then apply source/destination cash direction and reversal semantics. Never infer Project/Order attribution from invoice, bill, customer, or vendor links when `project_id` / `order_id` is absent.

`get_project_finance_actuals` returns Project identity, base currency, linked operating income, linked operating expense, other linked cash movement, net linked cash, linked transaction count, linked order count, and unconverted allocation count. `get_finance_project_actuals_page` returns the same Project-level actuals with project number/name/customer, search and stable server pagination.

- [ ] **Step 5: Lock security and grants**

Every private core calls `private.finance_assert_view()` and uses `SECURITY DEFINER SET search_path = ''`. Public wrappers expose only the narrow projection outputs. Revoke function execution from `PUBLIC` and `anon`, and grant the public wrapper signatures only to `authenticated`; private cores remain revoked from browser roles.

- [ ] **Step 6: Create the Store migration mirror**

Create the migration using the repository/Supabase migration convention at implementation time, then copy the canonical Admin SQL byte-for-byte. Verify SHA/content equality before commit.

- [ ] **Step 7: Commit DB GREEN candidate**

```bash
git add modulex-admin/sql/a6-finance-reporting.sql modulex-store/supabase/migrations/*_a6_finance_reporting.sql
git commit -m "feat(finance): add F6 reporting projections"
```

---

### Task 3: Add typed Finance reporting client

**Files:**
- Create: `modulex-admin/src/lib/finance/reports.ts`

**Interfaces:**
- Consumes: F6 public RPCs from Task 2 and existing `getArAgingSummary` / `getApAgingSummary` from F5/F3.
- Produces: typed fetch functions used by company and Project reporting UI.

- [ ] **Step 1: Define exact types**

Define `FinanceReportingSummary`, `FinanceCashFlowPoint`, `FinanceAccountMovementRow`, `FinanceProjectActualsRow`, and `ProjectFinanceActuals`. Numeric nullable fields stay nullable so unconverted data cannot silently become zero.

- [ ] **Step 2: Add RPC adapters**

Implement:

```ts
getFinanceReportingSummary({ from, to })
getFinanceCashFlowSeries({ from, to, grain })
getFinanceAccountMovementsPage({ from, to, accountId, limit, offset })
getFinanceProjectActualsPage({ from, to, limit, offset, search })
getProjectFinanceActuals({ projectId, from, to })
```

Normalize optional dates to `null`, clamp client page sizes to the same server contract, and throw RPC messages without fabricating fallback totals.

- [ ] **Step 3: Run the F6 contract**

```bash
cd modulex-admin && node scripts/a6-finance-reporting-contract.mjs
```

Expected: DB/client assertions progress; UI assertions still fail because Task 4/5 artifacts are not complete.

- [ ] **Step 4: Commit**

```bash
git add modulex-admin/src/lib/finance/reports.ts
git commit -m "feat(finance): add reporting client"
```

---

### Task 4: Build `/finance/reports` workspace

**Files:**
- Create: `modulex-admin/src/app/(admin)/finance/reports/page.tsx`
- Create: `modulex-admin/src/components/finance/reports/FinanceReportsWorkspace.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/scripts/finance-reports-ui-contract.mjs`

**Interfaces:**
- Consumes: Task 3 reporting client, existing `getArAgingSummary`, `getApAgingSummary`, and existing Admin table/card/input primitives.
- Produces: `/finance/reports` under `finance.view`.

- [ ] **Step 1: Add route shell and navigation**

Use metadata title `Finance Reports | Modulex Admin`, PageBreadcrumb, and add `{ name: "Reports", path: "/finance/reports", permission: "finance.view" }` under the Finance sidebar group.

- [ ] **Step 2: Build date-filtered summary**

The workspace must load company reporting summary, AR summary, AP summary, and monthly cash flow in parallel. Show cards for Operating Income, Operating Expense, Operating Result, Net Cash Change, Open AR, Open AP. For unavailable base totals, render `Unavailable` and a warning with the unconverted count.

- [ ] **Step 3: Build cash-flow and account movement sections**

Render monthly cash-flow rows/charts using existing visual primitives without introducing a new charting dependency. Provide account movement table with account selector, server pagination, transaction kind/date/reference/base delta, and explicit transfer/reversal labels.

- [ ] **Step 4: Build Project actuals section**

Render searchable/paginated Project rows with linked income, linked expense, other linked cash, net linked cash, allocation count, and an `Open Project` link to `/projects/<id>?tab=Finance`.

- [ ] **Step 5: Extend the general Finance/Reports UI contract**

Add `/finance/reports` to `finance-reports-ui-contract.mjs` and ensure the new surface has dark mode, responsive behavior, accessible labels/state, no dead template links, and permission-scoped navigation.

- [ ] **Step 6: Commit**

```bash
git add modulex-admin/src/app/'(admin)'/finance/reports modulex-admin/src/components/finance/reports modulex-admin/src/layout/AppSidebar.tsx modulex-admin/scripts/finance-reports-ui-contract.mjs
git commit -m "feat(finance): add reporting workspace"
```

---

### Task 5: Add Finance-derived Project actuals without replacing commercial profitability

**Files:**
- Create: `modulex-admin/src/components/customers/project-detail/ProjectFinanceActuals.tsx`
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectFinanceTab.tsx`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`

**Interfaces:**
- Consumes: `getProjectFinanceActuals`, existing `ProjectFinancialSummary`, existing Project Finance/payment permissions.
- Produces: Finance actuals visible only to `finance.view` roles inside the existing Project Finance tab.

- [ ] **Step 1: Derive Finance reporting permission**

In `ProjectDetailWorkspace`, compute:

```ts
const nextCanViewFinanceReporting = Boolean(profile && hasPermission(profile.roles, "finance.view"));
```

Store it and pass `canViewFinanceReporting` to `ProjectFinanceTab`.

- [ ] **Step 2: Create Project Finance actuals card**

`ProjectFinanceActuals` loads `getProjectFinanceActuals({ projectId })` and displays canonical linked operating inflow/outflow, other linked cash, net linked cash, transaction/allocation counts, base currency, and an unconverted warning. Zero links must render a valid empty state, not an error.

- [ ] **Step 3: Preserve the commercial summary**

Keep the existing `ProjectFinancialSummary` exactly as the current-cost/commercial profitability view. Mount the new Finance actuals card separately only when `canViewFinanceReporting` is true. Do not expose Finance actuals merely because a Sales user can see collection status or Project payments.

- [ ] **Step 4: Commit**

```bash
git add modulex-admin/src/components/customers/project-detail/ProjectFinanceActuals.tsx modulex-admin/src/components/customers/project-detail/ProjectFinanceTab.tsx modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx
git commit -m "feat(project): add Finance-derived actuals"
```

---

### Task 6: Acceptance documentation and full GREEN verification

**Files:**
- Create: `modulex-admin/docs/acceptance/a6-f6-finance-reporting.md`
- Modify if required by final contract coverage: `.github/workflows/admin-a6-finance-core.yml`

**Interfaces:**
- Consumes: all Tasks 1–5.
- Produces: merge-ready draft PR with explicit post-merge production acceptance steps.

- [ ] **Step 1: Write acceptance matrix**

Document pre-merge CI evidence and post-merge production scenarios:

- posted source-account outflow is negative cash;
- posted destination-account inflow is positive cash;
- transfer is zero company-wide but changes both account balances;
- reversal exactly negates original cash and operating classification;
- voided/draft rows contribute zero;
- customer receipt contributes operating income;
- expense/vendor/employee payment contributes operating expense;
- deposit/withdrawal/refund remain other cash and do not silently change income/expense;
- historical base snapshots are used unchanged;
- missing base snapshot fails closed/unconverted;
- Project allocation proportional base conversion is exact;
- Project without Finance links returns zero actuals;
- Project/Order attribution is not inferred when explicit IDs are absent;
- AR/AP cards equal the existing canonical F5/F3 summaries;
- `finance.view` succeeds and unauthorized authenticated user fails closed;
- pagination/search are stable;
- production acceptance runs transaction-scoped and ends with explicit `ROLLBACK`/zero residue.

- [ ] **Step 2: Run contract suite**

```bash
cd modulex-admin
npm run smoke:a6-finance-core
node scripts/a6-finance-ap-aging-contract.mjs
node scripts/a6-finance-ar-aging-contract.mjs
node scripts/a6-finance-reporting-contract.mjs
node scripts/finance-reports-ui-contract.mjs
npm run typecheck
npm run lint
npm run build
```

Expected: all GREEN.

- [ ] **Step 3: Verify SQL mirror and branch diff**

Confirm Admin SQL and Store migration are byte-identical and the branch contains no unrelated modifications.

- [ ] **Step 4: Open a draft PR**

PR body must state that the production migration is intentionally unapplied until owner merge, list the new read-only RPCs/UI surfaces, state the no-parallel-ledger rule, and include RED/GREEN CI evidence.

- [ ] **Step 5: Final pre-merge CI**

Verify `Admin A6 Finance Core` and `Admin UI Foundation` are GREEN at final head. Leave the PR unmerged for owner review.

---

## Self-Review

- Spec coverage: cash flow, operational income/expense, AR/AP reuse, account balances/movements, Project Finance allocation actuals, and Order/Project profitability inputs are each assigned to a concrete task.
- Ownership: no Project/Order ledger or duplicated AR/AP balance table is introduced.
- Currency: all historical reporting is snapshot-based; missing snapshots fail closed.
- Reversal/account semantics: source/destination direction matches Finance Core and reversal rows naturally offset account cash while operating classification negates the original kind.
- Permission: Finance actuals are gated by `finance.view`, independent of Project payment visibility and current-cost permission.
- TDD: Task 1 produces an observed RED before any production F6 implementation is committed.
