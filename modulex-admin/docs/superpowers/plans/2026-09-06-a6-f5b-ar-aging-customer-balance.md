# A6-F5B AR Aging, Customer Balance & Payment History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finance/Admin read model for Accounts Receivable aging, customer balances, and customer payment history without creating a second payment ledger or silently revaluing historical invoices.

**Architecture:** `customer_invoices` remains the AR source document and its canonical `paid_amount` remains synchronized by F5A from posted Finance receipt allocations plus preserved unbridged Project payment history. F5B adds read-only private projections and authenticated Finance-view RPC wrappers, modeled after AP Aging. Because Customer Invoices/Orders do not store a historical base-currency FX snapshot, F5B reports monetary totals per transaction currency and does not convert them using today's FX; main-currency historical reporting remains a later F6 concern unless a trustworthy snapshot is introduced.

**Tech Stack:** PostgreSQL/Supabase RPCs, Next.js App Router, React/TypeScript, shared Admin UI primitives, Node contract tests, GitHub Actions.

**Spec:** `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`

## Global Constraints

- Finance Core remains the canonical money-movement ledger; do not create a parallel Customer payment table.
- Customer Invoice balance is `greatest(total_amount - paid_amount, 0)` after F5A synchronization.
- Aging buckets are `current`, `1_30`, `31_60`, `61_90`, `90_plus`, based on invoice `due_date` and caller-supplied `as_of` date.
- Draft, void, and fully paid invoices are excluded from open AR aging.
- Payment history must not double-count a Project payment that is explicitly bridged to a Finance receipt.
- Read RPCs require Finance view authorization. Private helpers are not executable by browser roles; public wrappers are authenticated-only.
- Do not use current FX for historical AR conversion. Multi-currency totals remain currency-grouped.
- No Store/Dealer/Customer portal widening in F5B.
- No production migration or deploy before owner merge and preflight.
- Follow `AGENTS.md`, `modulex-admin/docs/ADMIN_UI_GUIDE.md`, and `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md`.

---

### Task 1: RED F5B Contract & CI Gate

**Files:**
- Create: `modulex-admin/scripts/a6-finance-ar-aging-contract.mjs`
- Modify: `.github/workflows/admin-a6-finance-core.yml`

**Interfaces:**
- Consumes: F5A `customer_invoices`, `finance_transactions`, `finance_transaction_links`, `customer_project_payment_finance_links`.
- Produces: executable contract requiring the SQL, client, route, navigation and migration listed below.

- [ ] **Step 1: Write the failing contract**

Require:
- `sql/a6-finance-ar-aging.sql` and mirrored Store migration are byte-identical.
- private `ar_aging_invoice_projection(date)` exists.
- public `get_ar_aging_page`, `get_ar_aging_summary`, `get_customer_ar_balance`, `get_customer_payment_history` wrappers exist.
- open AR excludes draft/void/paid and uses `greatest(total_amount - paid_amount, 0)`.
- exact bucket names are present.
- payment history excludes bridged Project payments from the legacy leg and exposes source identity.
- no current-FX lookup/revaluation exists in F5B SQL.
- `/finance/ar-aging` route, sidebar link and `finance.view` permission exist.

- [ ] **Step 2: Wire the contract into Admin A6 Finance Core**

Add the script, SQL and mirrored migration paths to both push/pull-request path filters and execute `node scripts/a6-finance-ar-aging-contract.mjs` after the F5A receipt contract.

- [ ] **Step 3: Run exact-head CI and confirm RED**

Expected failure: F5B SQL/client/UI/migration missing, proving the new contract detects absent behavior.

- [ ] **Step 4: Commit**

Commit the RED contract and CI wiring before implementation.

---

### Task 2: AR Read Model & Security Boundary

**Files:**
- Create: `modulex-admin/sql/a6-finance-ar-aging.sql`
- Create: `modulex-store/supabase/migrations/<generated>_a6_finance_ar_aging.sql`

**Interfaces:**
- Produces:
  - `private.ar_aging_invoice_projection(p_as_of date)`
  - `public.get_ar_aging_page(p_limit integer, p_offset integer, p_customer_id uuid, p_bucket text, p_search text, p_as_of date)`
  - `public.get_ar_aging_summary(p_customer_id uuid, p_as_of date)`
  - `public.get_customer_ar_balance(p_customer_id uuid, p_as_of date)`
  - `public.get_customer_payment_history(p_customer_id uuid, p_limit integer, p_offset integer)`

- [ ] **Step 1: Implement open-invoice projection**

For issued/partially-paid/overdue invoices with `greatest(total_amount - paid_amount,0) > 0`, return Customer/Order/Project attribution, dates, status, invoice currency, total, paid, outstanding, `days_past_due`, and bucket. Use `coalesce(due_date, invoice_date)` only as the aging anchor when due date is absent.

- [ ] **Step 2: Implement paginated AR page**

Support server-side Customer, bucket, search, as-of filters and `total_count`. Search Invoice Number, Customer code/name, Order snapshot/number, and Customer reference where available.

- [ ] **Step 3: Implement currency-safe summary and Customer balance**

Return JSON currency groups, each containing open, overdue, due-soon and aging bucket totals. Do not collapse different currencies into one numeric total. Customer balance reuses the same projection and returns the selected Customer plus currency groups.

- [ ] **Step 4: Implement normalized Customer payment history**

Union:
1. Finance Core `customer_receipt` transactions for the Customer, including posted/void/reversal state and invoice allocation context.
2. live Project `payment` rows only where no `customer_project_payment_finance_links` bridge exists.

Expose `source_kind` (`finance_receipt` / `project_payment`) and stable source IDs so consumers cannot double-count bridged history.

- [ ] **Step 5: Harden grants**

Private functions call `private.finance_assert_view()`. Revoke private EXECUTE from PUBLIC/anon/authenticated. Public wrappers are `security definer` only where existing Finance read patterns require it, with pinned `search_path`, internal authorization, PUBLIC/anon revoked, authenticated granted.

- [ ] **Step 6: Keep migration mirror byte-identical**

The Admin canonical SQL and Store migration must match exactly.

---

### Task 3: TypeScript Finance AR Client

**Files:**
- Create: `modulex-admin/src/lib/finance/arAging.ts`

**Interfaces:**
- Produces typed `getArAgingPage`, `getArAgingSummary`, `getCustomerArBalance`, `getCustomerPaymentHistory` wrappers around the four public RPCs.

- [ ] **Step 1: Define row and summary types**

Use `parseDbDecimal` for numeric database fields; retain `currency_code` alongside every amount.

- [ ] **Step 2: Implement RPC wrappers**

Use exact RPC parameter names and propagate user-safe Finance error messages using the established Finance client pattern.

- [ ] **Step 3: Run typecheck**

Expected: no implicit `any`, no browser-side Number coercion for persisted money mutations (F5B is read-only).

---

### Task 4: Admin AR Aging Surface

**Files:**
- Create: `modulex-admin/src/components/finance/FinanceArAgingManager.tsx`
- Create: `modulex-admin/src/app/(admin)/finance/ar-aging/page.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/scripts/admin-full-route-regression-contract.mjs`

**Interfaces:**
- Consumes: Task 3 AR client.
- Produces: `/finance/ar-aging` Finance-view screen.

- [ ] **Step 1: Build filter/header controls**

Use as-of date, Customer, aging bucket and search filters. Reset pagination when filters change.

- [ ] **Step 2: Render currency-safe AR summary**

Show one summary group per currency with Open AR, Overdue, Due Soon and bucket totals. Never visually sum USD/EUR/etc into one amount.

- [ ] **Step 3: Render open invoice table**

Columns: Customer, Invoice, Order/Project attribution, Invoice Date, Due Date, Aging Bucket, Total, Paid, Outstanding, Status. Use shared `TableViewport`, `TableStateRow`, `Badge`, `ComponentCard`, `Button` and Admin text tokens.

- [ ] **Step 4: Render selected Customer balance and payment history**

When a Customer filter is selected, show Customer balance by currency and normalized payment history. Clearly label source as Finance Receipt or Legacy Project Payment; bridged events appear once through the Finance leg.

- [ ] **Step 5: Add navigation and route regression**

Add `/finance/ar-aging` with `finance.view`; increment the current sidebar-route assertion from 85 to 86 and require the route in the post-audit set.

---

### Task 5: Roadmap / Finance Plan Reconciliation

**Files:**
- Modify: `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

- [ ] **Step 1: Mark F5A merged and F5B implementation state accurately**

Document F5A Customer Receipts as merged/code-complete but production migration acceptance pending until deployed. Mark F5B as implemented only after code/CI verification; do not mark production acceptance complete.

- [ ] **Step 2: Record FX limitation explicitly**

State that AR aging is currency-grouped because current Customer Invoice/Order source documents do not carry historical base-currency FX snapshots; no today-FX revaluation is permitted.

- [ ] **Step 3: Set next Finance action**

After F5B code completion, next package is remaining F5 closeout/production acceptance, then F6 reporting/project financial projections.

---

### Task 6: Verification & Draft PR

**Files:**
- No new implementation files.

- [ ] **Step 1: Run focused F5B contract**

`node scripts/a6-finance-ar-aging-contract.mjs` → PASS.

- [ ] **Step 2: Run Finance regression**

Admin A6 Finance Core workflow → PASS, including F5A and F5B contracts.

- [ ] **Step 3: Run Admin regression**

Admin UI Foundation → PASS, including route regression, TypeScript, lint and production build.

- [ ] **Step 4: Run Store boundary CI**

Store Core CI → PASS because the shared Supabase migration path changed; no Store/Portal API surface is widened.

- [ ] **Step 5: Review diff**

Branch must be based directly on current `main`, contain only F5B/roadmap changes, and introduce no production writes/deploys.

- [ ] **Step 6: Open draft PR**

PR title: `feat(finance): add AR aging and customer balances`. Include architecture, TDD evidence, currency behavior, security boundary and explicit production migration/deploy gate.
