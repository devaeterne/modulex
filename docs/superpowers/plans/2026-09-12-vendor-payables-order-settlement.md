# Vendor Payables / Order Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Finance-owned Vendor Payables workspace that derives Vendor Cabinet commitments from Order cost lines, attributes real Vendor Bills to those commitments, attributes real posted Vendor Payments to Order-level settlement, and redesigns Vendor Bills into a list-first UI without creating a second AP or cash ledger.

**Architecture:** Keep `customer_order_items` as commitment truth, `vendor_invoices` as AP document truth, `vendor_invoice_payment_allocations` as invoice payment truth, and `finance_transactions` as cash truth. Add only two attribution ledgers (`vendor_invoice_order_allocations`, `vendor_payment_order_allocations`) plus guarded Finance RPCs and derived read models. Preserve `/finance/bills` as the route but make it a tabbed Vendor Payables workspace. Reuse the existing Payment Schedule manager unchanged in meaning.

**Tech Stack:** Next.js/React/TypeScript, Supabase/PostgreSQL RPC + RLS, existing Modulex Admin UI primitives, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-12-vendor-payables-order-settlement-design.md`

## Global Constraints

- Do not use terminal or Remote Desktop Commander for this project. Use GitHub, Supabase and Vercel connectors only.
- Follow test-driven development: commit a failing contract first, observe the expected GitHub Actions failure, then implement the minimum code to make it green.
- Canonical schema migrations live under `modulex-store/supabase/migrations`; the Finance contract mirror under `modulex-admin/sql` must remain byte-identical where this plan says so.
- Do not auto-create Vendor Bills from Vendor Cabinet lines.
- Do not create Product/SKU rows for Vendor Cabinet lines.
- Do not add a manual Paid/Partially Paid checkbox. Payment status must be derived only from posted Vendor Payment allocation history.
- Do not allow commitment-only Payment Schedule rows; `vendor_payment_schedules.invoice_id` remains required.
- V1 bill-to-commitment attribution is same-currency only.
- Do not apply production migrations before the implementation PR is fully green and merged. After merge, apply only the merged canonical migrations with `Supabase.apply_migration` and verify them read-only.
- Preserve existing public RPC signatures wherever possible. In particular, keep `reverse_vendor_invoice_payment_allocation(uuid,uuid,text,uuid)` and `reverse_vendor_payment(uuid,text,uuid)` stable for current clients.

---

## Task 1: Add the RED Vendor Payables contract and CI ownership

**Files:**
- Create: `modulex-admin/scripts/a6-finance-vendor-payables-contract.mjs`
- Modify: `.github/workflows/admin-a6-finance-core.yml`
- Modify: `modulex-admin/scripts/a6-finance-vendor-bills-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-vendor-payments-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-payment-schedule-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-vendor-master-contract.mjs`
- Modify: `modulex-admin/scripts/order-custom-vendor-cabinet-contract.mjs`

- [ ] **Step 1: Write the new failing architectural contract.**

The new contract must fail unless all of the following exist:

```js
const sqlPath = "sql/a6-finance-vendor-payables.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql";
const adapter = "src/lib/finance/vendorPayables.ts";
const manager = "src/components/finance/FinanceVendorBillsManager.tsx";
const commitmentsPanel = "src/components/finance/vendor-payables/VendorCommitmentsPanel.tsx";
const billsPanel = "src/components/finance/vendor-payables/VendorBillsPanel.tsx";
const billEditor = "src/components/finance/vendor-payables/VendorBillEditorModal.tsx";
const billDetail = "src/components/finance/vendor-payables/VendorBillDetailPanel.tsx";
```

The contract must assert:

```js
for (const table of ["vendor_invoice_order_allocations", "vendor_payment_order_allocations"]) {
  expect(sql.includes(`public.${table}`), `Missing ${table}`);
}
for (const rpc of [
  "get_vendor_order_commitments_page",
  "get_vendor_order_commitment_detail",
  "get_vendor_invoice_commitment_reference_data",
  "set_vendor_invoice_order_allocations",
  "allocate_vendor_payment_to_orders",
]) {
  expect(sql.includes(`public.${rpc}`), `Missing public ${rpc}`);
  expect(sql.includes(`private.${rpc}`), `Missing private ${rpc}`);
}
expect(sql.includes("manual_vendor_cabinet"), "Vendor Cabinet order lines must be the commitment source");
expect(sql.includes("finance_assert_view") && sql.includes("finance_assert_manage"), "Finance permission cores must be reused");
expect(sql.includes("set search_path = ''"), "SECURITY DEFINER functions must pin search_path");
expect(!/insert\s+into\s+public\.finance_transactions/i.test(sql), "Vendor Payables must not create a second cash ledger");
```

UI assertions must require `Commitments`, `Vendor Bills`, `Payment Schedule`, `+ Add Vendor Bill`, `Overview`, `Order Allocations`, `Payments`, `Audit`, and must reject the old permanently visible `New Vendor Bill Draft` / `AP Lifecycle Inputs` layout.

- [ ] **Step 2: Wire the contract into A6 Finance CI.**

Add these paths to both `push.paths` and `pull_request.paths` in `.github/workflows/admin-a6-finance-core.yml`:

```yaml
- "modulex-admin/scripts/a6-finance-vendor-payables-contract.mjs"
- "modulex-admin/sql/a6-finance-vendor-payables.sql"
- "modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql"
```

Add the step after Vendor Bills/Payments contracts:

```yaml
- run: node scripts/a6-finance-vendor-payables-contract.mjs
```

- [ ] **Step 3: Strengthen neighboring contracts without changing behavior yet.**

Require:
- Vendor Bills contract: route remains `/finance/bills`, shared UI primitives remain, but workspace title may become `Vendor Payables`.
- Vendor Payments contract: existing reversal RPC signatures remain present.
- Payment Schedule contract: `invoice_id` remains required and UI still says an Open Vendor Bill is required.
- Vendor Master contract: detail tabs must include `Commitments` after implementation.
- Vendor Cabinet contract: financial identity becomes immutable after bill attribution.

- [ ] **Step 4: Commit only the RED contracts/workflow changes.**

Suggested commit:

`test(finance): define vendor payables settlement contract`

- [ ] **Step 5: Observe expected RED in GitHub Actions.**

Use the GitHub connector to inspect `Admin A6 Finance Core`. The failure must be caused by missing Vendor Payables SQL/adapters/UI, not by unrelated baseline failures. If a baseline failure appears first, resolve or isolate it before implementation.

---

## Task 2: Add the attribution tables, security boundary and Vendor Cabinet financial guard

**Files:**
- Create: `modulex-admin/sql/a6-finance-vendor-payables.sql`
- Create byte-identical mirror: `modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql`

- [ ] **Step 1: Create `vendor_invoice_order_allocations`.**

Use this shape:

```sql
create table public.vendor_invoice_order_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on update cascade on delete restrict,
  invoice_line_id uuid not null references public.vendor_invoice_lines(id) on update cascade on delete restrict,
  order_item_id uuid not null references public.customer_order_items(id) on update cascade on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code)=3),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_invoice_order_alloc_uq unique(invoice_line_id, order_item_id)
);
```

Add covering indexes for `invoice_id`, `invoice_line_id`, `order_item_id`, and `(order_item_id, invoice_id)`.

- [ ] **Step 2: Create append-only `vendor_payment_order_allocations`.**

```sql
create table public.vendor_payment_order_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_payment_allocation_id uuid not null references public.vendor_invoice_payment_allocations(id) on update cascade on delete restrict,
  order_item_id uuid not null references public.customer_order_items(id) on update cascade on delete restrict,
  amount_delta numeric(18,4) not null check (amount_delta <> 0),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code)=3),
  reversal_of_allocation_id uuid null references public.vendor_payment_order_allocations(id) on update cascade on delete restrict,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vendor_payment_order_alloc_shape check (
    (amount_delta > 0 and reversal_of_allocation_id is null)
    or (amount_delta < 0 and reversal_of_allocation_id is not null and nullif(btrim(coalesce(reason,'')),'') is not null)
  )
);
```

Add unique reversal protection and indexes on `invoice_payment_allocation_id` and `order_item_id`.

- [ ] **Step 3: Close direct browser mutation.**

Enable RLS on both tables. Revoke direct INSERT/UPDATE/DELETE/TRUNCATE from `anon` and `authenticated`. Reads should also remain RPC-owned unless an existing Finance policy convention explicitly requires table SELECT. Private cores must be revoked from application roles.

- [ ] **Step 4: Add validation helpers.**

Implement private helpers that, under `finance_assert_manage`, verify:
- Order item is `product_id is null` + `pricing_model_snapshot='manual_vendor_cabinet'`.
- Order is not Draft/cancelled for bill attribution.
- Order item `vendor_id` equals bill `vendor_id`.
- `cost_currency_code` equals bill currency in V1.
- `invoice_line_id` belongs to `invoice_id`.
- Sum of allocations for one invoice line does not exceed `vendor_invoice_lines.amount`.
- Open or void bills cannot have their bill-to-order allocation map rewritten.

Serialize capacity decisions with `FOR UPDATE` on the Vendor Bill and invoice line rows.

- [ ] **Step 5: Add an append-only settlement guard.**

A BEFORE UPDATE/DELETE trigger on `vendor_payment_order_allocations` must raise; corrections use explicit negative reversal rows only.

- [ ] **Step 6: Guard Vendor Cabinet financial identity after attribution.**

Add a scoped BEFORE UPDATE/DELETE trigger on `customer_order_items`. If the OLD row is `manual_vendor_cabinet` and any `vendor_invoice_order_allocations` exists for it:

```sql
if tg_op = 'DELETE' then
  raise exception 'Vendor Cabinet line has Finance attribution and cannot be deleted.' using errcode='23514';
end if;
if new.order_id is distinct from old.order_id
   or new.product_id is distinct from old.product_id
   or new.pricing_model_snapshot is distinct from old.pricing_model_snapshot
   or new.vendor_id is distinct from old.vendor_id
   or new.manual_cost_amount is distinct from old.manual_cost_amount
   or new.cost_currency_code is distinct from old.cost_currency_code then
  raise exception 'Vendor Cabinet financial identity is locked after Vendor Bill attribution.' using errcode='23514';
end if;
```

Allow descriptive/PDF replacement fields to continue using the existing dedicated Vendor Cabinet edit flow.

- [ ] **Step 7: Keep Admin SQL and canonical migration byte-identical.**

The new contract must compare the files exactly.

Suggested commit:

`feat(finance): add vendor payable attribution ledgers`

---

## Task 3: Add derived commitment reads and Finance adapters

**Files:**
- Modify: `modulex-admin/sql/a6-finance-vendor-payables.sql`
- Modify mirror: `modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql`
- Create: `modulex-admin/src/lib/finance/vendorPayables.ts`
- Modify: `modulex-admin/src/lib/finance/vendorBills.ts`

- [ ] **Step 1: Add the paginated commitment RPC.**

Lock this public interface:

```sql
public.get_vendor_order_commitments_page(
  p_limit integer,
  p_offset integer,
  p_vendor_id uuid,
  p_commitment_status text,
  p_invoice_status text,
  p_payment_status text,
  p_project_id uuid,
  p_order_id uuid,
  p_search text
)
```

Each row must include:

```text
order_item_id, customer_id,
vendor_id, vendor_code, vendor_name,
project_id, project_number, project_name,
order_id, order_number, order_status,
line_description, source_document_id,
committed_amount, currency_code,
invoiced_amount, paid_amount,
uninvoiced_amount, invoiced_outstanding_amount,
remaining_exposure, invoice_variance,
invoice_count, payment_count,
commitment_status, invoice_status, payment_status,
order_date, created_at, total_count
```

Count `invoiced_amount` only from non-void, Open Vendor Bills. Draft bill mappings remain editable preview data and appear in detail/reference data, but they must not make the Finance projection say an obligation has been invoiced.

- [ ] **Step 2: Add `get_vendor_order_commitment_detail(p_order_item_id uuid) returns jsonb`.**

Return:
- commitment summary,
- active/open bill allocations,
- draft allocation previews,
- payment settlement history including reversal rows,
- source document metadata needed by the existing private signed-URL helper.

Use `finance_assert_view`; do not expose unrelated Order/customer fields.

- [ ] **Step 3: Add bill commitment reference data.**

Lock:

```sql
public.get_vendor_invoice_commitment_reference_data(p_invoice_id uuid) returns jsonb
```

Return bill lines, current bill-to-order allocations, and eligible commitment candidates for the bill vendor/currency. Candidate rows must exclude Draft/cancelled Orders.

- [ ] **Step 4: Implement the TypeScript adapter.**

Create `vendorPayables.ts` with explicit types:

```ts
export type VendorCommitmentState = "planned" | "committed" | "cancelled";
export type VendorCommitmentInvoiceState = "not_invoiced" | "partially_invoiced" | "invoiced";
export type VendorCommitmentPaymentState = "unpaid" | "partially_paid" | "paid";

export type VendorOrderCommitment = {
  order_item_id: string;
  customer_id: string;
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  project_id: string | null;
  project_number: string | null;
  project_name: string | null;
  order_id: string;
  order_number: string;
  order_status: string;
  line_description: string;
  source_document_id: string | null;
  committed_amount: number;
  currency_code: string;
  invoiced_amount: number;
  paid_amount: number;
  remaining_exposure: number;
  invoice_variance: number;
  commitment_status: VendorCommitmentState;
  invoice_status: VendorCommitmentInvoiceState;
  payment_status: VendorCommitmentPaymentState;
  total_count: number;
};
```

Implement:
- `getVendorOrderCommitmentsPage(...)`
- `getVendorOrderCommitmentDetail(orderItemId)`
- `getVendorInvoiceCommitmentReferenceData(invoiceId)`

- [ ] **Step 5: Extend `VendorBillDetail` without breaking current consumers.**

Add optional typed fields such as:

```ts
order_allocations?: VendorInvoiceOrderAllocation[];
order_settlements?: VendorPaymentOrderAllocation[];
```

Do not remove existing `procurement_allocations`, `payment_allocations`, or `audit`.

Suggested commit:

`feat(finance): expose vendor order commitment projections`

---

## Task 4: Add bill allocation, settlement allocation and atomic reversal mutation RPCs

**Files:**
- Modify: `modulex-admin/sql/a6-finance-vendor-payables.sql`
- Modify mirror: `modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql`
- Modify: `modulex-admin/src/lib/finance/vendorPayables.ts`

- [ ] **Step 1: Add Draft Bill → commitment allocation RPC.**

Public signature:

```sql
public.set_vendor_invoice_order_allocations(
  p_invoice_id uuid,
  p_invoice_line_id uuid,
  p_allocations jsonb
) returns integer
```

JSON items:

```json
{"order_item_id":"uuid","amount":16000.00}
```

Behavior:
- `finance_assert_manage`.
- Lock Bill + line.
- Bill must be Draft.
- Replace only that line's current Vendor Cabinet allocation map atomically.
- Reject duplicate order item entries, nonpositive amounts, vendor/currency mismatch, Draft/cancelled Orders, or total > invoice line amount.
- Do not mutate `vendor_invoice_lines.project_id/order_id` as authoritative attribution when the line covers multiple Orders.

- [ ] **Step 2: Add real payment → Order settlement allocation RPC.**

Public signature:

```sql
public.allocate_vendor_payment_to_orders(
  p_invoice_payment_allocation_id uuid,
  p_allocations jsonb
) returns integer
```

JSON items have `{order_item_id, amount}`. Validate that the referenced invoice payment allocation is a positive, unreversed allocation backed by a posted `vendor_payment` transaction. Lock it before capacity checks.

Enforce:
- each order item is mapped to the same invoice via `vendor_invoice_order_allocations`;
- vendor/currency match;
- net settlements for the invoice payment allocation cannot exceed its `amount_delta`;
- net settlement for an order item cannot exceed the Open-bill amount invoiced to that commitment.

Insert positive append-only rows; do not update old settlement rows.

- [ ] **Step 3: Add a private settlement reversal helper.**

```sql
private.reverse_vendor_payment_order_allocations_for_invoice_allocation(
  p_invoice_payment_allocation_id uuid,
  p_reason text
) returns integer
```

For each surviving positive settlement, insert one matching negative row with `reversal_of_allocation_id` and the same currency/order item.

- [ ] **Step 4: Integrate with the existing reversal boundary without changing its public signature.**

Production currently has:

```text
private.reverse_vendor_invoice_payment_allocation(
  p_allocation_id uuid,
  p_reversal_finance_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
) returns uuid
```

Redefine that private function in the new migration so, after validating and locking the original allocation but before inserting its invoice-level negative row, it calls the new child-settlement reversal helper. The operation stays in one PostgreSQL transaction.

Because `private.vendor_payment_reverse_bill_allocations(...)` already loops through invoice allocations and calls `private.reverse_vendor_invoice_payment_allocation(...)`, reversing a posted Vendor Payment automatically reverses child Order settlements too. Keep the public `reverse_vendor_payment` and `reverse_vendor_invoice_payment_allocation` signatures unchanged.

- [ ] **Step 5: Add adapter mutations.**

```ts
export async function setVendorInvoiceOrderAllocations(
  invoiceId: string,
  invoiceLineId: string,
  allocations: Array<{ orderItemId: string; amount: number }>,
): Promise<number>

export async function allocateVendorPaymentToOrders(
  invoicePaymentAllocationId: string,
  allocations: Array<{ orderItemId: string; amount: number }>,
): Promise<number>
```

Suggested commit:

`feat(finance): reconcile vendor bills and payments to orders`

---

## Task 5: Build the Vendor Payables shell and Commitments-first UX

**Files:**
- Modify: `modulex-admin/src/app/(admin)/finance/bills/page.tsx`
- Modify: `modulex-admin/src/components/finance/FinanceVendorBillsManager.tsx`
- Create: `modulex-admin/src/components/finance/vendor-payables/VendorCommitmentsPanel.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`

- [ ] **Step 1: Keep route compatibility but rename the workspace.**

`/finance/bills` remains the path. Update metadata/breadcrumb to `Vendor Payables`.

Rename only the sidebar label:

```ts
{ name: "Vendor Payables", path: "/finance/bills", permission: "finance.view" }
```

- [ ] **Step 2: Make `FinanceVendorBillsManager` the small tab coordinator.**

It should own:

```ts
type PayablesTab = "commitments" | "bills" | "schedule";
```

Read optional query params:
- `tab=commitments|bills|schedule`
- `vendor=<uuid>`
- `order=<uuid>`

Default tab is `commitments`.

Render top-level buttons/tabs and delegate to focused components. Do not recreate the old giant permanent forms.

- [ ] **Step 3: Build the list-first commitment panel.**

Use shared `ComponentCard`, `TableViewport`, `Table`, `Badge`, `Button`, `Input`, `Select`, `Modal`, and `ADMIN_TEXT_STYLES`.

Filters:
- Search
- Vendor
- Commitment status
- Invoice status
- Payment status
- Project ID
- Order ID

Columns:
- Vendor
- Project / Order
- Description
- Committed
- Invoiced
- Paid
- Remaining
- Status
- Action

- [ ] **Step 4: Add contextual commitment detail.**

A selected commitment opens a shared Modal with:
- Vendor
- Project/Order links
- source PDF `View PDF`
- committed/invoiced/paid/remaining/variance
- linked bills
- settlement history

Order URL:

```ts
`/customers/${row.customer_id}/orders/${row.order_id}`
```

Project URL:

```ts
row.project_id ? `/projects/${row.project_id}` : null
```

Vendor Bills action switches the workspace to `bills` and preloads vendor + order filters.

- [ ] **Step 5: Keep PDF private.**

Reuse the existing signed-URL mechanism from `custom-vendor-cabinet.ts`; do not expose a public storage URL.

Suggested commit:

`feat(finance): add commitments-first vendor payables workspace`

---

## Task 6: Refactor Vendor Bills into contextual modal/detail UI

**Files:**
- Create: `modulex-admin/src/components/finance/vendor-payables/VendorBillsPanel.tsx`
- Create: `modulex-admin/src/components/finance/vendor-payables/VendorBillEditorModal.tsx`
- Create: `modulex-admin/src/components/finance/vendor-payables/VendorBillDetailPanel.tsx`
- Modify: `modulex-admin/src/components/finance/FinanceVendorBillsManager.tsx`
- Modify: `modulex-admin/src/lib/finance/vendorBills.ts`

- [ ] **Step 1: Move list/filter behavior into `VendorBillsPanel`.**

Keep existing server pagination/filter RPCs. The panel is list-first. Header action is `+ Add Vendor Bill` for `finance.manage`.

- [ ] **Step 2: Move draft create/edit into `VendorBillEditorModal`.**

Preserve existing fields and validation:
- Vendor
- Bill number
- Bill date
- Due date
- Total
- Currency
- PO/Vendor Order
- Reference
- Notes
- bill lines

Do not expose the old form permanently above the list.

- [ ] **Step 3: Build bill detail tabs.**

`VendorBillDetailPanel` tabs:

```ts
const billTabs = ["Overview", "Order Allocations", "Payments", "Audit"] as const;
```

`Overview`: header facts + Draft/Open/Void actions, Manual FX only when opening.

`Order Allocations`: for Draft bills, select a bill line and map it across eligible commitments from `get_vendor_invoice_commitment_reference_data`; for Open/Void bills render read-only attribution.

`Payments`: preserve existing invoice payment allocation behavior, then expose Order settlement allocation for positive unreversed invoice payment allocations.

`Audit`: render existing Vendor Bill audit plus order-attribution history.

- [ ] **Step 4: Make one Bill support many Orders explicitly.**

The allocation UI must show per candidate:

```text
Project / Order · Vendor Cabinet description · committed · already invoiced · available
```

Do not force a single `project_id` or `order_id` onto the bill header.

- [ ] **Step 5: Preserve current AP lifecycle semantics.**

Opening, voiding, posted-payment allocation and invoice payment reversal continue to use existing Vendor Bill RPCs. New order attribution is an added layer, not a replacement.

Suggested commit:

`refactor(finance): make vendor bills contextual and list first`

---

## Task 7: Reuse Payment Schedule and integrate Vendor Management commitments

**Files:**
- Modify: `modulex-admin/src/components/finance/FinanceVendorBillsManager.tsx`
- Reuse without semantic changes: `modulex-admin/src/components/finance/FinancePaymentScheduleManager.tsx`
- Modify: `modulex-admin/src/components/finance/FinanceVendorsManager.tsx`
- Modify: `modulex-admin/src/lib/finance/vendors.ts`
- Modify: `modulex-admin/scripts/a6-finance-vendor-master-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-payment-schedule-contract.mjs`

- [ ] **Step 1: Render the existing Payment Schedule manager in the third tab.**

Do not fork the scheduling model. The existing manager must continue requiring an Open Vendor Bill.

The standalone `/finance/payment-schedule` route stays valid for deep links/backward compatibility.

- [ ] **Step 2: Add `Commitments` to Vendor Management detail tabs.**

Change:

```ts
const detailTabs = ["Overview", "Contacts", "Sources", "Compliance", "Commitments"] as const;
```

When selected, load the shared commitment projection with `vendorId=selectedId` and render:
- Project / Order
- Description
- Committed
- Invoiced
- Paid
- Remaining
- status badges

- [ ] **Step 3: Add filtered navigation to Vendor Payables.**

Use:

```ts
`/finance/bills?tab=commitments&vendor=${vendorId}`
```

and a `View Vendor Bills` action using `tab=bills`.

- [ ] **Step 4: Do not expand permission vocabulary.**

Use only existing `finance.view` and `finance.manage`; do not add `vendor.manage` or a new payable-specific permission.

Suggested commit:

`feat(finance): surface vendor commitments in vendor management`

---

## Task 8: Lock cross-domain lifecycle regressions and complete remote TDD

**Files:**
- Modify: `modulex-admin/scripts/order-custom-vendor-cabinet-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-vendor-bills-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-vendor-payments-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-payment-schedule-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-vendor-master-contract.mjs`
- Modify: `modulex-admin/scripts/a6-finance-vendor-payables-contract.mjs`
- Modify: `.github/workflows/admin-a6-finance-core.yml`

- [ ] **Step 1: Add contract assertions for the locked accounting rules.**

Must prove statically that:
- no Product creation exists in Vendor Payables SQL;
- no Finance transaction insertion exists in Vendor Payables SQL;
- no manual payment status mutation exists in the UI;
- Payment Schedule remains invoice-owned;
- Vendor Cabinet finance guard exists;
- reversal helper is called by the existing invoice allocation reversal path;
- public/private SECURITY DEFINER boundaries pin an empty search path;
- authenticated users cannot call private mutation cores.

- [ ] **Step 2: Run the full GitHub Actions matrix by pushing the implementation head.**

Required green checks:
- `Admin A6 Finance Core`
- `Admin UI Foundation` including strict UI gate, typecheck, lint, build
- any A1/order workflow triggered by the Vendor Cabinet contract change
- Store Core if the canonical migration path triggers it

Inspect failing job logs through GitHub tools only; do not use local terminal.

- [ ] **Step 3: Inspect the final PR diff for accidental scope creep.**

Reject unrelated changes to pricing, customer-facing invoices, Store, HR or generic procurement. The old product-based procurement tables remain intact.

- [ ] **Step 4: Request/perform code review and fix findings before merge.**

Use the superpowers requesting-code-review workflow. Re-run affected CI after every correction.

Suggested final implementation commit if needed:

`test(finance): close vendor payables reconciliation acceptance`

---

## Task 9: Merge, production migration and post-deploy verification

**Files:** No new feature files; this is release execution after all PR checks are green.

- [ ] **Step 1: Merge only after current-head CI is green.**

Verify expected head SHA immediately before merge. Prefer squash merge consistent with recent Modulex PRs.

- [ ] **Step 2: Apply the merged canonical migration to production Supabase.**

Apply exactly:

`modulex-store/supabase/migrations/20260912010000_a6_finance_vendor_payables.sql`

using `Supabase.apply_migration`. Do not hand-edit production DDL outside the merged migration.

- [ ] **Step 3: Verify migration history and security.**

Read-only checks must confirm:
- both allocation tables exist;
- RLS enabled;
- direct authenticated mutation revoked;
- public read/write RPC grants are narrow;
- private RPC execute is not granted to browser roles;
- SECURITY DEFINER functions use empty/safe search path;
- Vendor Cabinet guard trigger is enabled;
- settlement append-only trigger is enabled.

- [ ] **Step 4: Validate the commitment projection against existing production data without mutating it.**

Use the existing Crystal Vendor Cabinet test line only for read verification. The known production row is associated with `ORD-000079` / project `P-2026-000108`. Confirm it appears with the correct Vendor, Order, Project, cost and current derived states. Do not create synthetic production Bill/payment allocations just to test.

- [ ] **Step 5: Verify deployment after the user deploys or Vercel reports the merged SHA.**

Confirm `/finance/bills` shows Vendor Payables with Commitments default, Vendor Bills contextual UI, and Payment Schedule tab. Do not claim production UI completion before the deployed commit is verified.

---

## Acceptance Checklist

- [ ] Vendor Cabinet cost remains sourced from the Order line, not duplicated as a payable master row.
- [ ] Draft Vendor Cabinet lines are visible as Planned but cannot be attached to a real Vendor Bill.
- [ ] Confirmed Vendor Cabinet lines become Committed automatically.
- [ ] One Vendor Bill can allocate across multiple Orders/Projects.
- [ ] One Order commitment can be covered by multiple Vendor Bills.
- [ ] Bill invoice variance is visible and does not rewrite committed cost.
- [ ] Only Open, non-void Vendor Bills count toward derived Invoiced totals.
- [ ] Order Paid/Partially Paid/Unpaid derives only from real posted Vendor Payment settlement attribution.
- [ ] Order settlement never exceeds valid invoice payment allocation or invoiced-to-order amount.
- [ ] Vendor Payment reversal atomically writes matching negative Order settlement rows.
- [ ] Payment Schedule continues to require an Open Vendor Bill.
- [ ] Vendor Bills is list-first; create/edit/lifecycle actions are contextual.
- [ ] Vendor Management exposes Commitments and filtered Vendor Payables navigation.
- [ ] Vendor Cabinet financial identity cannot be changed/deleted after Bill attribution.
- [ ] Existing procurement, Vendor Bill, Vendor Payment, AP Aging and Finance transaction contracts remain green.
- [ ] Production migration is applied only after merge and verified through Supabase.
