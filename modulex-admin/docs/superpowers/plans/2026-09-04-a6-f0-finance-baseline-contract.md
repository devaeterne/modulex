# A6-F0 Finance Baseline & Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the current Finance/HR/Invoice/Project-payment baseline and define the compatibility, posting, permission, audit, and migration contracts required before Finance Core schema work begins.

**Architecture:** Finance remains a first-class domain. Project/Order/Customer/Vendor/Employee relationships are optional attribution in Finance Core unless a source-domain document naturally requires one. Existing customer invoices, Project payment ledger, HR payroll/advances, and company expenses remain source domains and are bridged incrementally rather than rewritten.

**Tech Stack:** PostgreSQL/Supabase, RLS, public-wrapper/private-core RPC pattern, Next.js 16 Admin, TypeScript RBAC.

**Spec:** `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`

## Global Constraints

- Work from current `main` and re-check production Supabase before schema implementation.
- Project does not own general Finance transactions.
- Preserve existing Project payment and HR payroll behavior until an explicit integration migration is reviewed.
- Posted/settled Finance history is append-safe; corrections use void/reversal rather than destructive edits.
- Cross-currency transactions retain transaction-time FX snapshot; historical reporting never silently revalues from a newer rate.
- Do not introduce a duplicate Supplier/Vendor or Employee master solely for Finance.
- Do not expose elevated credentials to browser code or weaken RLS/RPC boundaries.
- No production DDL or business-data mutation is part of A6-F0.

---

### Task 1: Freeze production schema and usage baseline

**Files:**
- Create: `modulex-admin/docs/FINANCE_F0_BASELINE.md`
- Modify: `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`

**Interfaces:**
- Consumes: production Supabase `information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_proc`, and migration history.
- Produces: an owner/nullability/usage matrix that all later Finance migrations must preserve.

- [ ] **Step 1:** Record current production tables/columns for `company_expenses`, customer invoices, Project payment tables, HR payroll/advances, payment methods/terms, Orders and Projects.
- [ ] **Step 2:** Record current production row counts for source domains to determine backfill risk.
- [ ] **Step 3:** Record constraints and FK nullability that define existing lifecycle contracts.
- [ ] **Step 4:** Record current indexes relevant to Project payments, invoices, expenses and payroll.
- [ ] **Step 5:** Record canonical migration names that established Finance-role, expense, invoice, HR payroll and Project-payment behavior.
- [ ] **Step 6:** Verify no general bank/cash/AP/Finance-ledger table currently exists.
- [ ] **Step 7:** Commit the baseline documentation.

### Task 2: Freeze RPC, RLS, RBAC and route boundaries

**Files:**
- Modify: `modulex-admin/docs/FINANCE_F0_BASELINE.md`
- Reference: `modulex-admin/src/lib/auth/permissions.ts`
- Reference: `modulex-admin/src/app/(admin)/finance/payroll/page.tsx`
- Reference: `modulex-admin/src/app/(admin)/finance/compensation/page.tsx`
- Reference: `modulex-admin/src/components/hr/PayrollManager.tsx`
- Reference: `modulex-admin/scripts/finance-reports-ui-contract.mjs`

**Interfaces:**
- Consumes: current public RPC wrappers, private cores, RLS policies and Admin permissions.
- Produces: the mutation/read boundary that F1-F5 must follow.

- [ ] **Step 1:** Inventory Project payment, invoice and payroll RPCs and mark `SECURITY INVOKER`/wrapper behavior.
- [ ] **Step 2:** Record which tables deny direct authenticated access and which still allow browser table writes.
- [ ] **Step 3:** Record Finance/HR/Sales/Admin role differences for expenses, invoices, Project payments and payroll.
- [ ] **Step 4:** Record existing Finance routes and identify which are HR projections rather than Finance-owned models.
- [ ] **Step 5:** Lock the F1 rule that sensitive Finance mutations use canonical server/RPC boundaries and do not regress to ad-hoc browser writes.
- [ ] **Step 6:** Commit the boundary matrix.

### Task 3: Define Finance Core lifecycle contract

**Files:**
- Modify: `modulex-admin/docs/FINANCE_F0_BASELINE.md`
- Modify: `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`

**Interfaces:**
- Consumes: existing Project-payment `posted/voided + reversal` precedent and HR/invoice lifecycle states.
- Produces: exact F1 design vocabulary for accounts, transactions, posting and reversal.

- [ ] **Step 1:** Lock initial account types as `bank`, `cash`, and `clearing`; do not create chart-of-accounts-grade GL types in F1.
- [ ] **Step 2:** Lock Finance Core transaction lifecycle as `draft -> posted`, with posted history corrected by `void/reversal`; posted transactions are never hard-deleted.
- [ ] **Step 3:** Lock initial operational transaction kinds as `expense`, `customer_receipt`, `vendor_payment`, `employee_payment`, `deposit`, `withdrawal`, `transfer`, `refund`, and `reversal`; source domains may refine subtype metadata without changing universal ownership.
- [ ] **Step 4:** Lock attribution as optional links/allocation rather than mandatory Project ownership.
- [ ] **Step 5:** Lock transaction/account currency, base-currency amount, FX snapshot/source/manual-rate fields as F1 requirements.
- [ ] **Step 6:** Lock idempotency key and append-safe audit requirements for posting/payment mutations.
- [ ] **Step 7:** Commit the lifecycle contract.

### Task 4: Define compatibility and backfill strategy

**Files:**
- Modify: `modulex-admin/docs/FINANCE_F0_BASELINE.md`

**Interfaces:**
- Consumes: production usage counts and source-domain lifecycle constraints.
- Produces: F1-F5 migration order with no destructive rewrite.

- [ ] **Step 1:** Classify `company_expenses` as retained source-document history and define bridge/posting strategy.
- [ ] **Step 2:** Classify `customer_invoices.paid_amount` and `ledger_managed` as legacy/current compatibility fields until F5 reconciliation replaces manual truth.
- [ ] **Step 3:** Classify Project-payment tables as retained specialized customer-collection domain; F5 links them to Finance instead of replacing them.
- [ ] **Step 4:** Classify HR payroll/advances as retained HR source truth; F4 posts actual money movement into Finance.
- [ ] **Step 5:** Confirm there is no canonical Supplier/Vendor business master today; defer AP FK creation until F3 establishes one deliberately.
- [ ] **Step 6:** Define zero-row versus live-row backfill handling and reconciliation checks.
- [ ] **Step 7:** Commit the compatibility strategy.

### Task 5: Lock permission and audit matrix

**Files:**
- Modify: `modulex-admin/docs/FINANCE_F0_BASELINE.md`
- Modify: `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`

**Interfaces:**
- Consumes: current `finance.view`, `finance.manage`, `invoices.*`, `project_payments.*`, `personnel.*` permissions and production RLS policies.
- Produces: minimum F1 permission/audit contract.

- [ ] **Step 1:** Preserve `finance.view` for Finance read surfaces and `finance.manage` for Finance account/transaction mutations.
- [ ] **Step 2:** Preserve source-domain permissions (`invoices.*`, `project_payments.*`, HR/personnel rules) instead of silently widening Finance access.
- [ ] **Step 3:** Require actor, timestamp, source document/reference, reason for void/reversal, idempotency key and before/after or reversal reference where applicable.
- [ ] **Step 4:** Require Project/Order/Customer/Vendor/Employee links to be auditable but nullable in Finance Core.
- [ ] **Step 5:** Document the known mismatch that current Payroll UI permits direct table writes and must not be copied into Finance Core.
- [ ] **Step 6:** Commit the permission/audit matrix.

### Task 6: Roadmap and PR closeout for F0 review

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `modulex-admin/docs/FINANCE_DOMAIN_PLAN.md`
- Modify: PR #284 description if needed.

**Interfaces:**
- Consumes: completed Tasks 1-5.
- Produces: reviewed A6-F0 package ready for owner acceptance; no production runtime change.

- [ ] **Step 1:** Mark A6-F0 `[~]` in Admin roadmap while review is pending.
- [ ] **Step 2:** Add the locked Finance ownership rule and F0 next action to the roadmap without changing unrelated current work.
- [ ] **Step 3:** Verify PR #284 contains documentation only.
- [ ] **Step 4:** Verify production row counts and schema remain unchanged by the package.
- [ ] **Step 5:** Keep A6-F0 `[~]` until the project owner accepts the F0 contract; only then may F1 migration design start.
