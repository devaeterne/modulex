# PB-6 Gross Profit Commission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed gross-profit percentage commission method to PB-6, clean up the Project commission UI, add Project Participant Roles to the General Settings sidebar, and prove the calculation with rollback-only DB smoke evidence.

**Architecture:** Keep the existing PB-6 obligation/event ledger and Project/category/product scope model. Extend `basis_type` with `gross_profit_percentage`, calculate its immutable basis server-side from canonical non-cancelled Order line revenue minus canonical current `product_costs`, and snapshot revenue/cost alongside gross profit. A richer preview RPC supplies UI breakdowns while create RPC recalculates independently.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Next.js 16/React/TypeScript Admin UI, Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-pb6-profit-commission-design.md`

## Global Constraints

- Gross Profit = scoped `customer_order_items.line_total` revenue minus `quantity × current active product_costs.amount`.
- Tax and payment-fee amounts are excluded from gross-profit commission.
- Missing product id or missing current cost fails closed; never treat missing cost as zero.
- Existing `fixed` and sales `percentage` semantics remain unchanged.
- Whole-Project sales-percentage basis continues to use `customer_orders.grand_total`.
- Actual payouts remain canonical Finance transactions; no new payment ledger.
- Commission detail remains Finance/Admin/Super Admin only.
- Migration and Admin SQL mirror must be byte-identical.
- Demo financial writes must occur only inside a transaction that rolls back and must leave no residue.

---

### Task 1: RED contracts for sidebar, DB basis semantics, and UI

**Files:**
- Create: `modulex-admin/scripts/project-pb6-gross-profit-commission-contract.mjs`
- Modify: `.github/workflows/admin-project-base.yml`

**Interfaces:**
- Consumes: existing PB-6 migration/domain/component files and `AppSidebar.tsx`.
- Produces: one focused contract asserting `gross_profit_percentage`, richer preview RPC, snapshot columns, missing-cost guards, sidebar entry, and UI method/preview labels.

- [ ] **Step 1: Write the failing contract**

Create a Node `assert` contract that reads the planned migration/mirror, `project-participants-commission-domain.ts`, `ProjectParticipantsCommissionPanel.tsx`, and `AppSidebar.tsx`. Assert the migration/mirror exist and are byte-identical; DB SQL contains `gross_profit_percentage`, `basis_revenue_amount`, `basis_cost_amount`, `PROJECT_COMMISSION_COST_INCOMPLETE`, `get_customer_project_commission_calculation_preview`, canonical `product_costs`, `quantity`, and server-side create recalculation; UI contains `Gross profit %`, `Scoped sales`, `Product cost`, `Gross profit`, `Estimated commission`, and an explicit incomplete-cost state; sidebar contains `/settings/general/project-participant-roles`.

- [ ] **Step 2: Run contract to verify RED**

Run: `cd modulex-admin && node scripts/project-pb6-gross-profit-commission-contract.mjs`
Expected: FAIL because the new migration/mirror and UI/domain tokens do not exist yet.

- [ ] **Step 3: Wire contract into Project Base CI**

Add a workflow step immediately after existing PB-6 steps:

```yaml
- name: Project PB-6 gross profit commission contract
  run: node scripts/project-pb6-gross-profit-commission-contract.mjs
```

- [ ] **Step 4: Commit RED**

Commit message: `test(pb6): require gross profit commission basis`

---

### Task 2: Canonical DB gross-profit basis and immutable snapshots

**Files:**
- Create: `modulex-store/supabase/migrations/20260905014000_customer_project_gross_profit_commission.sql`
- Create: `modulex-admin/sql/project-pb6-gross-profit-commission.sql`

**Interfaces:**
- Produces: `private.project_commission_gross_profit_basis(uuid,text,text,uuid,uuid)`, `public.get_customer_project_commission_calculation_preview(uuid,text,text,text,uuid,uuid)`, extended `public.create_customer_project_commission_obligation(...)` behavior, nullable obligation snapshot columns `basis_revenue_amount`, `basis_cost_amount`.
- Preserves: existing numeric `get_customer_project_commission_basis_preview(...)` contract and existing RPC signature for create.

- [ ] **Step 1: Extend obligation constraints and snapshots**

Add nullable numeric columns:

```sql
alter table public.project_commission_obligations
  add column if not exists basis_revenue_amount numeric,
  add column if not exists basis_cost_amount numeric;
```

Replace the basis-type check so allowed values are `fixed`, `percentage`, `gross_profit_percentage`. Replace `project_commission_basis_shape` so fixed still requires only `flat_amount`, while both percentage modes require positive `basis_amount` and `rate`; gross-profit rows additionally require non-null nonnegative revenue/cost snapshots and `basis_revenue_amount - basis_cost_amount = basis_amount`; legacy percentage rows keep both audit snapshots null.

- [ ] **Step 2: Implement canonical gross-profit helper**

Create `private.project_commission_gross_profit_basis(...) returns table(revenue_amount numeric, cost_amount numeric, gross_profit_amount numeric, missing_cost_line_count integer, detected_currency text)`.

Use only non-cancelled Project Orders and the selected Project/category/product scope. Join `product_costs` on product id, requested currency, `is_active = true`, `valid_to is null`. Count a line as missing when `product_id is null` or no cost row exists. Validate one detected Order currency, requested currency match, positive revenue, zero missing lines, and positive gross profit. Raise explicit exceptions including `PROJECT_COMMISSION_COST_INCOMPLETE`, mixed-currency/currency-mismatch, empty-basis and nonpositive-profit states.

- [ ] **Step 3: Add richer preview RPC**

Create `public.get_customer_project_commission_calculation_preview(...) returns jsonb` accepting project id, basis type, scope type, currency, optional category/product. For `percentage`, call the existing revenue helper and return mode `revenue`, revenue/basis, null cost, zero missing count. For `gross_profit_percentage`, call the new gross-profit helper and return mode `gross_profit`, revenue, cost, gross-profit basis, missing line count, currency. Restrict execution to authenticated internal PB-6 roles; revoke PUBLIC and do not grant anon.

- [ ] **Step 4: Recalculate and snapshot inside create RPC**

Extend existing `create_customer_project_commission_obligation(...)` body without changing its signature. For `gross_profit_percentage`, validate rate, call the gross-profit helper at creation time, ignore caller `p_basis_amount`, and insert `basis_amount = gross_profit`, `basis_revenue_amount = revenue`, `basis_cost_amount = cost`. Existing fixed and sales percentage paths remain unchanged.

- [ ] **Step 5: Copy migration byte-for-byte to Admin SQL mirror**

The two files must be exactly identical.

- [ ] **Step 6: Run RED contract again**

Run: `cd modulex-admin && node scripts/project-pb6-gross-profit-commission-contract.mjs`
Expected: still FAIL only on client/UI/sidebar requirements.

- [ ] **Step 7: Commit DB GREEN slice**

Commit message: `feat(pb6): add gross profit commission basis`

---

### Task 3: Client domain, Project UI cleanup, and General Settings sidebar

**Files:**
- Modify: `modulex-admin/src/lib/customers/project-participants-commission-domain.ts`
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`

**Interfaces:**
- Domain type: `ProjectCommissionBasisType = "fixed" | "percentage" | "gross_profit_percentage"`.
- New preview result: `{ mode: "revenue" | "gross_profit"; revenueAmount: number; costAmount: number | null; basisAmount: number; missingCostLineCount: number; currencyCode: string }`.
- UI uses existing create RPC wrapper; no client-supplied gross-profit amount.

- [ ] **Step 1: Extend domain types and preview wrapper**

Add the third basis type. Add `getCustomerProjectCommissionCalculationPreview(...)` that calls `get_customer_project_commission_calculation_preview`, normalizes JSON numeric fields, and returns the typed preview result. Keep the existing numeric preview wrapper for compatibility.

- [ ] **Step 2: Update create validation**

Treat both percentage basis modes as rate-driven, validate `0 < rate <= 100`, and pass only the rate plus scope/currency to the create RPC. Continue passing `p_basis_amount: null` so DB remains authoritative.

- [ ] **Step 3: Clean up commission creation layout**

Use existing Admin primitives/tokens. First form row: Participant, Commission method, Scope, conditional Category/Product. Second row: Fixed amount or Rate %, Currency, Description. Replace inline mini-cards with one dedicated `Commission Preview` block below the form fields.

- [ ] **Step 4: Render method-specific preview**

Method labels: `Fixed amount`, `Sales %`, `Gross profit %`.

For Sales % show `Sales basis`, `Rate`, `Estimated commission`.

For Gross profit % show `Scoped sales`, `Product cost`, `Gross profit`, `Rate`, `Estimated commission`.

On missing-cost preview errors show `Incomplete cost data` with the missing-line count when available and disable Create. Never show a bare unexplained `Unavailable` state.

- [ ] **Step 5: Add General Settings sidebar entry**

Under the existing `General Settings` submenu add:

```ts
{ name: "Project Participant Roles", path: "/settings/general/project-participant-roles", permission: "settings.view" }
```

- [ ] **Step 6: Run focused contract**

Run: `cd modulex-admin && node scripts/project-pb6-gross-profit-commission-contract.mjs`
Expected: PASS.

- [ ] **Step 7: Run existing PB-6 and General Settings contracts**

Run:

```bash
cd modulex-admin
node scripts/project-pb6-participants-commission-contract.mjs
node scripts/project-pb6-tab-access-percentage-basis-contract.mjs
node scripts/general-settings-ui-contract.mjs
```

Expected: all PASS.

- [ ] **Step 8: Commit UI/domain/sidebar slice**

Commit message: `feat(pb6): expose gross profit commission preview`

---

### Task 4: Rollback-only DB smoke and final verification

**Files:**
- Modify if contract documentation needs evidence only: PR body / acceptance notes; no production demo-data file is required.

**Interfaces:**
- Smoke target: existing PB-6 sample Project with current line revenue `$6,540.70`.
- Expected temporary total cost: `$4,000.00`.
- Expected gross profit: `$2,540.70`.
- Expected 2% commission: `$50.81`.

- [ ] **Step 1: Review and apply the schema migration only after code/contract review**

Use the canonical migration through Supabase migration tooling; do not persist demo cost data outside the smoke transaction.

- [ ] **Step 2: Verify negative path before demo costs**

Call gross-profit preview for the sample Project and assert it fails closed because two scoped lines have no current cost.

- [ ] **Step 3: Run rollback-only positive smoke**

Inside one SQL transaction, insert current USD costs only for the two missing demo products so total scoped cost becomes exactly `4000.00`. Call the canonical calculation preview and assert revenue `6540.70`, cost `4000.00`, basis/gross profit `2540.70`; compute 2% and assert `50.81`. Roll back the transaction.

- [ ] **Step 4: Verify no residue**

Re-query the two demo products and prove no additional current product-cost rows remain after rollback.

- [ ] **Step 5: Run final CI-equivalent gates**

Run/verify:

```bash
cd modulex-admin
node scripts/project-pb6-gross-profit-commission-contract.mjs
node scripts/project-pb6-participants-commission-contract.mjs
node scripts/project-pb6-tab-access-percentage-basis-contract.mjs
node scripts/general-settings-ui-contract.mjs
npm run typecheck
npm run lint
npm run build
```

Also verify GitHub `Admin Project Base`, `Admin UI Foundation`, and `Store Core` workflows on the final head.

- [ ] **Step 6: Open/update PR and document evidence**

PR body must include RED evidence, final SHA, migration name, rollback-only smoke values, no-residue result, CI runs, and explicitly state whether production migration was applied. Do not claim deploy/merge unless independently verified.
