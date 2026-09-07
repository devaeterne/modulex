# CUST-7 / VAL-3 Customers, Orders & Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close CUST-7 / VAL-3 by making Customers, Orders, and Invoices honor the existing production DB/RPC validation contracts end to end.

**Architecture:** Keep Supabase RPCs and DB constraints authoritative. Add exact reusable client validation for DB decimals and normalize mutation payloads before existing RPCs; add field-level UX on changed Admin forms without changing business lifecycle semantics. Test first with the existing consolidated VAL-3/A1 contracts and reuse existing CI workflows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-cust-7-val3-customers-orders-invoices.md`

## Global Constraints

- Work from execution-time `main` baseline `4a785c37e5e6384545d9f12b79a200402f54899f`.
- Preserve existing Customer, Order, Invoice, Finance/Project payment, RLS, grants, audit/history, Store, Customer Portal, and Dealer Portal boundaries.
- Frontend validation is an early UX guard; DB/RPC remains authoritative.
- Preserve DB `numeric` precision/scale and never use JavaScript floating-point conversion as mutation truth.
- No new CI workflow wrapper; extend existing Admin smoke/A1 ownership only.
- No production migration/deploy before owner merge and production acceptance gate.

---

### Task 1: Establish VAL-3 RED contract

**Files:**
- Modify: `modulex-admin/scripts/val3-customers-orders-invoices-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Consumes: existing `src/lib/validation.ts`, Customer/Order/Invoice components and order-domain.
- Produces: executable contract defining exact decimal behavior, field-level UX requirements, and canonical mutation invariants.

- [ ] Write failing VAL-3 assertions for exact `numeric(18,4)` quantity/money, `numeric(7,3)` percentages, no `Number()` mutation serialization, customer commercial exact decimal handling, invoice paid <= total early guard, field error state/focus, and roadmap `[~]` status.
- [ ] Run the branch CI contract and verify failure is caused by the intended missing behavior.
- [ ] Commit RED evidence before production changes.

### Task 2: Exact Order mutation validation

**Files:**
- Create: `modulex-admin/src/lib/customers/order-validation.ts`
- Modify: `modulex-admin/src/lib/customers/order-domain.ts`
- Modify: `modulex-admin/src/components/customers/NewCustomerOrder.tsx`
- Modify: `modulex-admin/src/components/customers/EditCustomerOrder.tsx`

**Interfaces:**
- Produces: `parseOrderQuantity`, `parseOrderMoney`, and `parseOrderPercent` returning normalized decimal strings/error state.
- Mutation serializers consume validated strings and never coerce authoritative values through `Number()`.

- [ ] Implement minimal exact decimal helpers using shared `parseDbDecimal` contracts: quantity `{ precision:18, scale:4, min:0.0001, allowNull:false }`, money `{ precision:18, scale:4, min:0, allowNull:false }`, percent `{ precision:7, scale:3, min:0, max:100, allowNull:false }`.
- [ ] Route create/edit validation through these helpers and preserve normalized strings into existing RPC inputs.
- [ ] Add field-level errors/focus for changed header/line fields and preserve preview-only number arithmetic.
- [ ] Run VAL-3 plus order-domain/lifecycle/A1/UI strict regressions.

### Task 3: Customer validation UX and exact commercial values

**Files:**
- Modify: `modulex-admin/src/components/customers/CustomersTable.tsx`
- Modify: `modulex-admin/src/components/customers/CustomerCard.tsx`

**Interfaces:**
- Consumes shared `validation.ts` exact decimal/email/phone/country/currency/URL helpers.
- Keeps `create_customer`, `update_customer_master`, contact/address lifecycle, price-group, and commercial RPC boundaries.

- [ ] Add typed field errors and first-invalid focus to New Customer.
- [ ] Validate Customer Master contact/format fields before `update_customer_master`.
- [ ] Validate Contact and Address required/email/phone/country fields before lifecycle RPCs.
- [ ] Replace `optionalNumber()` commercial mutation parsing with exact nullable `numeric(18,4)` parsing and field errors.
- [ ] Run VAL-3 plus Customer directory/master/detail and UI strict regressions.

### Task 4: Invoice payment UX hardening

**Files:**
- Modify: `modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx`

**Interfaces:**
- Keeps `update_customer_invoice_state` as canonical mutation boundary.
- Preserves ledger-managed invoice read-only payment semantics.

- [ ] Add field-level paid amount error state using existing exact `numeric(18,4)` parser.
- [ ] Reject a manual amount greater than canonical `total_amount` before RPC while leaving DB validation authoritative.
- [ ] Focus the invalid payment input and keep duplicate-submit protection.
- [ ] Run VAL-3 and invoice/A1/UI strict regressions.

### Task 5: Final verification and PR

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Create: `modulex-admin/docs/acceptance/cust-7-val3-customers-orders-invoices.md`

**Interfaces:**
- Produces exact-head CI/acceptance evidence and draft PR; does not mark production closeout `[x]` before deploy acceptance.

- [ ] Run VAL-3, validation-data-contract, Customer, Order, A1, Admin UI strict, typecheck, lint, and build gates plus affected Store/Portal regressions.
- [ ] Confirm no migration is required; if schema/RPC changes unexpectedly become necessary, stop and run migration/advisor preflight before any production change.
- [ ] Record acceptance evidence and keep roadmap `[~]` until post-merge/deploy production acceptance.
- [ ] Open a draft PR from `feat/cust-7-val3-customers-orders-invoices` to `main` with exact test evidence and no production deployment claim.
