# PB-3A Project Payment Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Project Detail into a tabbed workspace and add a Project-first customer payment ledger that records deposits/interim payments independently from invoices while exposing only payment state to Sales.

**Architecture:** `customer_projects` remains the operational parent. New payment requirement, payment transaction, and allocation tables are canonical for Project receivables; invoices can optionally reconcile to requirements without becoming the payment parent. Admin/Finance receive detailed ledger RPCs, Sales receives a separate sanitized status projection, and existing `customer_invoices.paid_amount` is retained only as a compatibility field for legacy invoices or as a DB-maintained projection once an invoice is ledger-managed.

**Tech Stack:** PostgreSQL/Supabase SQL + RPC/RLS, Next.js 16 App Router, React 19, TypeScript 5.9, existing Admin UI primitives, Node contract scripts.

**Spec:** `docs/superpowers/specs/2026-09-03-project-operations-hub-design.md`

## Global Constraints

- Project Detail navigation target is Overview, Orders, Finance, Procurement, Fulfillment, Documents, Activity.
- Order totals are reference commercial value, not a 1:1 payment-plan constraint.
- Customer payments can exist before invoice issuance.
- Payment Requirements and Actual Payment Transactions are separate concepts.
- Invoice is related to, but is not parent of, customer payment truth.
- Unallocated Project customer credit is supported.
- Sales must not receive payment amounts, product cost, purchase price, outgoing expense amounts, margin, profit, or markup through UI or RPC payloads.
- Admin/Finance customer-payment mutations are DB-authorized; UI hiding is not a security boundary.
- Existing vendor-catalog work is out of scope and must not be modified.
- Existing standalone Orders, historical invoices, Shipment, Installation, and Store/Portal behavior remain backward compatible.
- Mixed currencies stay grouped/fail-closed; PB-3A does not invent FX conversion.
- No historical payment transactions are fabricated from existing `customer_invoices.paid_amount`.

---

## File Structure

### Database

- Create `modulex-store/supabase/migrations/20260903143000_customer_project_payment_ledger.sql` — ledger tables, constraints, indexes, immutable-posted guards, authoritative RPCs, sanitized Sales projection, invoice compatibility synchronization.
- Create `modulex-store/supabase/migrations/20260903143500_customer_project_payment_ledger_hardening.sql` — grants/revokes, hardened wrapper exposure, advisor-safe search paths and final RLS/policy cleanup if the first migration intentionally stages private functions before public wrappers.

### Admin domain

- Create `modulex-admin/src/lib/customers/project-payments.ts` — typed adapter for payment summaries, requirements, transactions, allocations, and Admin/Finance mutations.
- Create `modulex-admin/src/lib/customers/project-payment-status.ts` — sanitized Sales-facing status adapter that never models money amounts.
- Modify `modulex-admin/src/lib/auth/permissions.ts` — add dedicated customer-payment permissions and remove Sales ability to mutate actual payment truth through invoice controls.

### Project UI

- Modify `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx` — become the shared Project header + tab shell and keep cross-tab reload/error orchestration.
- Create `modulex-admin/src/components/customers/project-detail/ProjectOverviewTab.tsx` — Project progress/summary and Sales-safe collection state.
- Create `modulex-admin/src/components/customers/project-detail/ProjectOrdersTab.tsx` — move existing linked-order table and link/new-order controls without behavior change.
- Create `modulex-admin/src/components/customers/project-detail/ProjectFinanceTab.tsx` — role-aware customer receivables UI; detailed for Admin/Finance, sanitized state-only for Sales.
- Create `modulex-admin/src/components/customers/project-detail/ProjectFulfillmentTab.tsx` — reuse current progress-derived shipment/installation truth during PB-3A.
- Create `modulex-admin/src/components/customers/project-detail/ProjectActivityTab.tsx` — move existing Project status activity, preserving actor display and role-safe wording.
- Create `modulex-admin/src/components/customers/project-detail/ProjectPendingDomainTab.tsx` — neutral empty-state used for Procurement/Documents until their canonical packages land; no fake data.

### Invoice compatibility

- Modify `modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx` — when invoice is ledger-managed, remove direct editable `paid_amount` behavior and surface ledger-derived payment/balance information plus navigation to Project Finance. Legacy invoices retain current payment UI until explicitly attached to ledger truth.

### Contracts / CI / trackers

- Create `modulex-admin/scripts/project-payment-ledger-contract.mjs` — source-level contract for permissions, RPC boundaries, Sales payload isolation, tab structure, and invoice compatibility rules.
- Modify `.github/workflows/admin-project-base.yml` — run PB-3A contract.
- Modify `docs/PROJECT_BASE_PLAN.md` — mark PB-3 active/decisions and record staged migration semantics.
- Modify `modulex-admin/ADMIN_ROADMAP.md` — document Project Detail tabbed workspace and PB-3A acceptance state.

---

### Task 1: Define the PB-3A RED contract

**Files:**
- Create: `modulex-admin/scripts/project-payment-ledger-contract.mjs`
- Modify: `.github/workflows/admin-project-base.yml`

**Interfaces:**
- Consumes: current Project Base source files and migration directory.
- Produces: deterministic contract failures for every PB-3A architectural boundary before implementation exists.

- [ ] **Step 1: Write the failing contract**

Create a Node contract that reads the migration, permissions, payment adapters, Project tab components, and invoice detail. It must assert at least these literal contracts:

```js
assert(permissions.includes('"project_payments.view"'), "PB-3A requires project_payments.view");
assert(permissions.includes('"project_payments.manage"'), "PB-3A requires project_payments.manage");
assert(paymentDomain.includes('.rpc("get_customer_project_payment_ledger"'), "Finance/Admin must use authoritative ledger RPC");
assert(paymentStatusDomain.includes('.rpc("get_customer_project_payment_status"'), "Sales must use sanitized payment status RPC");
assert(!paymentStatusDomain.includes("amount"), "Sales payment status adapter must not model money amounts");
assert(projectDetail.includes('"Overview"') && projectDetail.includes('"Orders"') && projectDetail.includes('"Finance"'), "Project detail must become tabbed");
assert(invoiceDetail.includes("ledger_managed"), "Invoice detail must distinguish legacy and ledger-managed invoices");
assert(migration.includes("customer_project_payment_requirements"), "PB-3A migration must create payment requirements");
assert(migration.includes("customer_project_payment_transactions"), "PB-3A migration must create payment transactions");
assert(migration.includes("customer_project_payment_allocations"), "PB-3A migration must create allocations");
```

Also assert the Sales RPC return contract contains only status identifiers/labels and never `amount`, `paid_amount`, `balance`, `cost`, `margin`, `profit`, `vendor_price`, or `expense_amount`.

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
cd modulex-admin
node scripts/project-payment-ledger-contract.mjs
```

Expected: FAIL because PB-3A tables/adapters/tabs do not yet exist.

- [ ] **Step 3: Wire the contract into Project Base CI**

Add to `.github/workflows/admin-project-base.yml`:

```yaml
      - name: Project Payment Ledger contract
        run: node scripts/project-payment-ledger-contract.mjs
```

- [ ] **Step 4: Commit RED contract**

```bash
git add modulex-admin/scripts/project-payment-ledger-contract.mjs .github/workflows/admin-project-base.yml
git commit -m "test(admin): define PB-3A payment ledger contract"
```

---

### Task 2: Build the canonical Project payment ledger in PostgreSQL

**Files:**
- Create: `modulex-store/supabase/migrations/20260903143000_customer_project_payment_ledger.sql`
- Create: `modulex-store/supabase/migrations/20260903143500_customer_project_payment_ledger_hardening.sql`

**Interfaces:**
- Produces RPCs:
  - `public.get_customer_project_payment_ledger(p_project_id uuid) returns jsonb`
  - `public.get_customer_project_payment_status(p_project_id uuid) returns jsonb`
  - `public.create_customer_project_payment_requirement(p_project_id uuid, p_name text, p_amount numeric, p_currency_code text, p_due_date date, p_notes text) returns uuid`
  - `public.record_customer_project_payment(p_project_id uuid, p_amount numeric, p_currency_code text, p_transaction_date date, p_payment_method_id uuid, p_reference_no text, p_notes text) returns uuid`
  - `public.allocate_customer_project_payment(p_payment_id uuid, p_requirement_id uuid, p_amount numeric) returns uuid`
  - `public.reverse_customer_project_payment(p_payment_id uuid, p_amount numeric, p_reason text) returns uuid`
- Internal/private functions may perform role checks and invoice synchronization; public wrappers must expose only intended contracts.

- [ ] **Step 1: Create tables with strict checks**

Use three canonical tables:

```sql
create table public.customer_project_payment_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  invoice_id uuid null references public.customer_invoices(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  sequence_no integer not null default 0,
  amount numeric(14,2) not null check (amount > 0),
  currency_code varchar(3) not null,
  due_date date null,
  notes text null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references auth.users(id),
  created_by uuid null references auth.users(id),
  updated_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

```sql
create table public.customer_project_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('payment','refund','reversal')),
  status text not null default 'posted' check (status in ('posted','voided')),
  amount numeric(14,2) not null check (amount > 0),
  currency_code varchar(3) not null,
  transaction_date date not null,
  payment_method_id uuid null references public.payment_methods(id) on delete restrict,
  reference_no text null,
  reversal_of_transaction_id uuid null references public.customer_project_payment_transactions(id) on delete restrict,
  notes text null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);
```

```sql
create table public.customer_project_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.customer_project_payment_transactions(id) on delete restrict,
  requirement_id uuid not null references public.customer_project_payment_requirements(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (transaction_id, requirement_id)
);
```

Add normalized uppercase currency triggers and indexes on `project_id`, `invoice_id`, `transaction_id`, `requirement_id`, due date, and reversal reference.

- [ ] **Step 2: Add immutability and cross-entity guards**

Create triggers/functions that enforce:

```text
posted payment transaction -> amount/currency/project/customer/type/date cannot be edited
allocation -> payment and requirement must belong to same Project and same currency
sum(allocation.amount) <= transaction.amount for positive payment transactions
signed requirement paid = payment allocations - refund/reversal allocations
cancelled requirement accepts no new allocation
reversal transaction must reference a posted payment transaction in the same Project/customer/currency
```

No DELETE grant is given to normal application roles for these financial tables.

- [ ] **Step 3: Add Admin/Finance authorization**

All mutation RPCs must explicitly require one of `super_admin`, `admin`, `finance` using the repository's existing profile-role contract. Sales cannot execute mutation functions even if calling the RPC directly.

- [ ] **Step 4: Add detailed ledger read RPC**

`get_customer_project_payment_ledger` returns Admin/Finance-authorized JSON containing:

```json
{
  "project_id": "uuid",
  "currencies": [
    {
      "currency_code": "USD",
      "expected": 0,
      "received": 0,
      "allocated": 0,
      "unallocated_credit": 0,
      "remaining": 0,
      "overdue": 0
    }
  ],
  "requirements": [],
  "transactions": []
}
```

Mixed currency is never silently summed into one number.

- [ ] **Step 5: Add sanitized Sales status RPC**

`get_customer_project_payment_status` may execute for roles allowed to view the Project. Its JSON shape must be status-only:

```json
{
  "project_id": "uuid",
  "overall_status": "partially_received",
  "requirements": [
    {
      "id": "uuid",
      "name": "Deposit",
      "due_date": "2026-09-10",
      "status": "received"
    }
  ]
}
```

It must not return numeric financial fields.

- [ ] **Step 6: Add invoice compatibility mode without fabricating history**

Add `ledger_managed boolean not null default false` to `customer_invoices`.

Rules:

```text
existing invoice -> ledger_managed remains false
invoice with an attached payment requirement -> ledger_managed becomes true
ledger-managed invoice paid_amount -> recomputed from signed allocations to its active linked requirements
legacy invoice -> current paid_amount remains untouched
update_customer_invoice_state -> rejects direct p_paid_amount mutation when ledger_managed = true
```

Do not create synthetic historical payment transactions for existing `paid_amount` values.

- [ ] **Step 7: Harden grants and wrappers**

Revoke PUBLIC execute where appropriate, grant only `authenticated`/`service_role` as required, keep private SECURITY DEFINER helpers role-guarded with hardened `search_path`, and expose advisor-safe public wrappers following the PB-2 pattern.

- [ ] **Step 8: Apply migration to a test/production-safe target only after SQL review**

Before applying, run the repository migration contract and inspect generated SQL diff. Use Supabase `apply_migration`, not ad-hoc DDL through `execute_sql`.

- [ ] **Step 9: Commit DB layer**

```bash
git add modulex-store/supabase/migrations/20260903143000_customer_project_payment_ledger.sql modulex-store/supabase/migrations/20260903143500_customer_project_payment_ledger_hardening.sql
git commit -m "feat(db): add Project customer payment ledger"
```

---

### Task 3: Add explicit payment permissions and typed adapters

**Files:**
- Modify: `modulex-admin/src/lib/auth/permissions.ts`
- Create: `modulex-admin/src/lib/customers/project-payments.ts`
- Create: `modulex-admin/src/lib/customers/project-payment-status.ts`

**Interfaces:**
- Produces `loadProjectPaymentLedger(projectId: string): Promise<ProjectPaymentLedger>`.
- Produces `loadProjectPaymentStatus(projectId: string): Promise<ProjectPaymentStatus>`.
- Produces mutations `createProjectPaymentRequirement`, `recordProjectPayment`, `allocateProjectPayment`, `reverseProjectPayment`.

- [ ] **Step 1: Extend RBAC**

Add permissions:

```ts
| "project_payments.view"
| "project_payments.manage"
```

Assign:

```text
super_admin/admin -> both
finance -> both
sales -> project_payments.view only
```

`project_payments.view` does not imply access to money amounts; the adapter used depends on the role.

Remove Sales dependence on `invoices.manage` for recording payment truth; invoice workflow permission may remain for invoice actions that are still intentionally Sales-owned, but actual payment mutation must be gated by `project_payments.manage`.

- [ ] **Step 2: Define detailed ledger types**

Use explicit types such as:

```ts
export type ProjectPaymentRequirement = {
  id: string;
  name: string;
  dueDate: string | null;
  currencyCode: string;
  amount: number;
  received: number;
  remaining: number;
  status: "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";
  invoiceId: string | null;
};
```

```ts
export type ProjectPaymentTransaction = {
  id: string;
  transactionType: "payment" | "refund" | "reversal";
  status: "posted" | "voided";
  amount: number;
  allocated: number;
  unallocated: number;
  currencyCode: string;
  transactionDate: string;
  referenceNo: string | null;
};
```

- [ ] **Step 3: Implement detailed Admin/Finance adapter**

`loadProjectPaymentLedger` must first require `project_payments.manage` or an explicit Admin/Finance role boundary, then call only `get_customer_project_payment_ledger`.

- [ ] **Step 4: Implement sanitized status adapter**

The Sales-safe type intentionally has no monetary properties:

```ts
export type ProjectPaymentStatusRequirement = {
  id: string;
  name: string;
  dueDate: string | null;
  status: "not_received" | "partially_received" | "received" | "overdue" | "cancelled";
};
```

`loadProjectPaymentStatus` calls only `get_customer_project_payment_status`.

- [ ] **Step 5: Run contract and typecheck**

```bash
cd modulex-admin
node scripts/project-payment-ledger-contract.mjs
npm run typecheck
```

Expected: permission and adapter assertions pass; UI assertions may still fail until later tasks.

- [ ] **Step 6: Commit adapters**

```bash
git add modulex-admin/src/lib/auth/permissions.ts modulex-admin/src/lib/customers/project-payments.ts modulex-admin/src/lib/customers/project-payment-status.ts
git commit -m "feat(admin): add Project payment RBAC and adapters"
```

---

### Task 4: Refactor Project Detail into the locked tabbed workspace

**Files:**
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectOverviewTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectOrdersTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectFulfillmentTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectActivityTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectPendingDomainTab.tsx`

**Interfaces:**
- `ProjectDetailWorkspace` owns Project loading, permissions, header, selected tab, and refresh callback.
- Child tabs receive typed data/permissions and never duplicate Project identity fetches.

- [ ] **Step 1: Add tab configuration**

Use the exact locked order:

```ts
const PROJECT_TABS = [
  "Overview",
  "Orders",
  "Finance",
  "Procurement",
  "Fulfillment",
  "Documents",
  "Activity",
] as const;
```

Use buttons with `role="tab"`, `aria-selected`, and a containing `role="tablist"` so the layout remains keyboard/screen-reader understandable.

- [ ] **Step 2: Extract Overview**

Move `ProjectProgressSummary` and basic Project summary into `ProjectOverviewTab`. Keep Project Settings either in Overview or a clearly separated settings section there; do not duplicate settings across tabs.

- [ ] **Step 3: Extract Orders without behavior changes**

Move the existing linked Orders table, standalone-order assignment, New Order button, cancelled-order exclusion, and existing shared table primitives into `ProjectOrdersTab`.

- [ ] **Step 4: Extract Fulfillment and Activity**

PB-3A Fulfillment may reuse the canonical progress data already used by `ProjectProgressSummary`; Activity keeps the existing `customer_project_status_history` truth and actor display.

- [ ] **Step 5: Add truthful empty-state tabs for not-yet-delivered domains**

Procurement and Documents must not fabricate data. Render neutral text such as:

```text
No Project procurement records are available in Modulex for this Project yet.
```

and

```text
No Project document index is available for this Project yet.
```

These tabs are replaced by canonical domain implementations in later packages.

- [ ] **Step 6: Run UI contracts/typecheck**

```bash
cd modulex-admin
node scripts/project-base-contract.mjs
node scripts/project-payment-ledger-contract.mjs
npm run typecheck
```

- [ ] **Step 7: Commit tab refactor**

```bash
git add modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx modulex-admin/src/components/customers/project-detail
git commit -m "feat(admin): add tabbed Project operations workspace"
```

---

### Task 5: Implement role-aware Project Finance

**Files:**
- Create: `modulex-admin/src/components/customers/project-detail/ProjectFinanceTab.tsx`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Reuse: `modulex-admin/src/components/customers/ProjectFinancialSummary.tsx`

**Interfaces:**
- Admin/Finance path consumes `ProjectPaymentLedger` plus existing PB-2 `ProjectFinancialSummary`.
- Sales path consumes only `ProjectPaymentStatus`.

- [ ] **Step 1: Build Sales state-only view first**

Render only requirement name/due date/status and overall collection status. Do not format or fetch amounts.

- [ ] **Step 2: Build Admin/Finance receivables summary**

For each currency render cards/table rows for:

```text
Expected
Received
Remaining
Overdue
Unallocated Credit
```

Keep currencies separate.

- [ ] **Step 3: Add requirement/payment actions**

Expose forms/actions only when `project_payments.manage` is true:

```text
Add Requirement
Record Payment
Allocate Payment
Reverse Payment
```

Each action calls the dedicated adapter RPC and refreshes the ledger after success.

- [ ] **Step 4: Preserve PB-2 profitability visibility separately**

Render `ProjectFinancialSummary` only for the existing `pricing.cost.view` permission. Label customer receivables separately from Sales/Cost/Margin so cash-in is never confused with profitability.

- [ ] **Step 5: Verify Sales never loads detailed ledger**

The component branch for Sales must invoke `loadProjectPaymentStatus`, not `loadProjectPaymentLedger`. Contract script must inspect this source boundary.

- [ ] **Step 6: Run contracts/typecheck**

```bash
cd modulex-admin
node scripts/project-financial-rollup-contract.mjs
node scripts/project-payment-ledger-contract.mjs
npm run typecheck
```

- [ ] **Step 7: Commit Finance UI**

```bash
git add modulex-admin/src/components/customers/project-detail/ProjectFinanceTab.tsx modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx
git commit -m "feat(admin): add role-aware Project receivables UI"
```

---

### Task 6: Make invoice payment controls ledger-aware

**Files:**
- Modify: `modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx`
- Modify if required by current invoice adapter: the focused invoice domain file that currently invokes `update_customer_invoice_state`; do not duplicate Supabase calls in UI if a domain adapter exists.

**Interfaces:**
- Legacy invoice: `ledger_managed = false`, current paid amount workflow remains temporarily available under existing invoice rules.
- Ledger-managed invoice: `ledger_managed = true`, `paid_amount` is display-only and payment actions point to Project Finance / canonical ledger.

- [ ] **Step 1: Load `ledger_managed` with invoice detail**

Extend the invoice detail projection/type to include the boolean without changing other invoice fields.

- [ ] **Step 2: Remove direct payment mutation UI for ledger-managed invoices**

For `ledger_managed === true`, do not render numeric Paid amount input, Save Payment, or arbitrary Mark Paid controls. Render ledger-derived paid/balance and a Project Finance navigation/action when a Project can be resolved through the invoice's Order.

- [ ] **Step 3: Keep legacy path explicit**

For `ledger_managed === false`, retain the current workflow so existing historical invoices do not become unusable. Add a small label such as `Legacy payment tracking` only if it improves clarity without exposing internal migration terminology to customers.

- [ ] **Step 4: Verify DB also blocks bypass**

Call `update_customer_invoice_state` directly against a ledger-managed invoice in SQL smoke; expected SQLSTATE is a deliberate application error and `paid_amount` remains unchanged.

- [ ] **Step 5: Run invoice and PB-3A contracts**

```bash
cd modulex-admin
node scripts/project-payment-ledger-contract.mjs
npm run typecheck
```

- [ ] **Step 6: Commit invoice compatibility UI**

```bash
git add modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx
git commit -m "feat(admin): make invoices ledger-aware"
```

---

### Task 7: Acceptance, tracker closeout, and production verification

**Files:**
- Modify: `docs/PROJECT_BASE_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces evidence that PB-3A is safe to merge; PB-3B Procurement remains explicitly next.

- [ ] **Step 1: Run focused local contracts**

```bash
cd modulex-admin
node scripts/project-base-contract.mjs
node scripts/project-progress-layout-contract.mjs
node scripts/project-financial-rollup-contract.mjs
node scripts/project-payment-ledger-contract.mjs
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 2: Run live DB acceptance scenarios**

Prove with test rows/transaction rollback or controlled fixtures:

```text
1. Deposit can be recorded before invoice exists.
2. Multiple payments can exist on one Project.
3. Partial allocation leaves unallocated credit.
4. One payment can allocate to multiple requirements.
5. Requirement status derives Pending -> Partially Paid -> Paid.
6. Past-due unpaid requirement reports Overdue.
7. Sales status RPC returns no amounts.
8. Sales mutation RPC attempts fail.
9. Admin/Finance detailed ledger works.
10. Ledger-managed invoice direct paid_amount mutation fails.
11. Existing legacy invoice paid_amount remains unchanged by migration.
12. Mixed currencies are separated/fail-closed rather than converted.
```

- [ ] **Step 3: Check Supabase advisors**

Run Security and Performance Advisors after migration. Package-specific warnings must be resolved before acceptance; unrelated pre-existing findings are documented without scope-creep changes.

- [ ] **Step 4: Update Project Base tracker**

Record PB-3A as complete only after DB acceptance and code verification both pass. Set next package to PB-3B Procurement.

- [ ] **Step 5: Update Admin roadmap**

Document the Project tab shell, payment ledger source-of-truth, role split, and invoice compatibility behavior.

- [ ] **Step 6: Final diff review**

```bash
git diff main...HEAD --check
git status --short
```

Verify no vendor-catalog files changed and no Store/Portal surface changed.

- [ ] **Step 7: Final commit for tracker/docs**

```bash
git add docs/PROJECT_BASE_PLAN.md modulex-admin/ADMIN_ROADMAP.md
git commit -m "docs: close PB-3A payment ledger package"
```

- [ ] **Step 8: Update draft PR**

Use a descriptive PR title such as:

```text
feat: add PB-3A Project payment ledger
```

PR notes must separately report:

```text
Database migration acceptance
Admin code/build acceptance
RBAC/Sales data-isolation evidence
Invoice legacy compatibility evidence
Supabase advisor result
PB-3B Procurement as next package
```
