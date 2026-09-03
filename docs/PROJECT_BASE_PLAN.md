# Modulex Project Base — Implementation Plan

Last reviewed: 2026-09-03
Active branch: `feat/project-operations-hub-pb3`
Active PR: `#272 — feat: add PB-3A Project payment ledger`
Production Supabase: `bzjoeernnmvuhzyvbowc`

Current package: **PB-3A — Customer Payment Ledger — production DB accepted / code PR closeout**

Current status: **PB-1 Project foundation and PB-2 Project Financial Rollup are merged/deployed. PB-3A production migrations, live role/RPC smoke tests, zero-residue rollback acceptance and package-specific Advisor cleanup are complete. PR #272 contains the tabbed Project workspace and Admin UI integration and remains user-owned for review/merge.**

Next action: **Finish final-head CI and preview/UI review for PR #272, then hand it to the project owner for merge. After PB-3A merges/deploys, continue with PB-3B Procurement, PB-4 Project-linked outgoing Finance, then PB-5 Fulfillment rollup.**

This file is the operational source of truth for the Project Base workstream. When asked where Project Base stands, read this file first and report the current package, completed packages, acceptance evidence, blockers and next action.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Blocked

---

# 1. Goal

Project / Job is the business-level parent for customer work while existing operational domains stay canonical.

```text
Customer / Account
  └── Project / Job
       ├── Sales Rep
       ├── Project Address / Site
       ├── Orders
       ├── Invoices
       ├── Customer Receivables / Payments
       ├── Procurement
       ├── Project Expenses / Outgoing Payments
       ├── Delivery / Shipments
       ├── Installations
       ├── Participants
       ├── Change Orders
       ├── Commissions
       └── Financial Summary
```

The historical cabinet-sales workbooks are business evidence, not a schema to copy literally.

---

# 2. Non-Negotiable Architecture Rules

1. `customer_orders` remains canonical for Orders.
2. Project is optional for legacy standalone Orders; `customer_orders.project_id` remains nullable.
3. Project Customer and Order Customer mismatch fails closed at the authoritative DB/server boundary.
4. Project Sales Rep is authoritative for the Project and is independent from later Customer default-sales-rep changes.
5. Order revision history is not Project Change Order history.
6. Project lifecycle, payment state, fulfillment state and financial closure are separate dimensions.
7. Internal cost, margin, vendor, commission, payment-detail, audit and internal-note data must not leak to Store/Portal without an explicitly approved narrow projection.
8. Finance and Project screens must read the same canonical financial truth; no duplicate Project-vs-Finance ledger.
9. No automatic historical business-data fabrication/backfill unless separately approved.
10. DB migration acceptance and code merge/deploy acceptance are separate gates.
11. Every Project package must run relevant CI, production-safe DB acceptance and Supabase Advisor review before closeout.
12. Parallel work must be preserved: re-check execution-time `main` and open PRs before every new package.

---

# 3. Approved Financial Semantics

```text
Gross Profit = Sales - Cost
Gross Margin % = Gross Profit / Sales
Markup % = Gross Profit / Cost
```

Project completion and financial closure are different states.

Future Finance overview must consume the same Project-linked finance truth:

- Expected Receivables
- Collected
- Remaining Receivables
- Overdue
- Expected Payables
- Paid Out
- Remaining Payables
- Cash In
- Cash Out
- Net Cash Flow

---

# 4. Package Status

## PB-0 — Git Isolation & Baseline `[x]`

- [x] Establish Project workstream and tracker.
- [x] Review repo/admin/store instructions and production schema.
- [x] Use the existing production Supabase project with additive/backward-compatible migrations.
- [x] Preserve parallel `main` work rather than overwriting it.

**Status: COMPLETE.**

---

## PB-1 — Project Core + Order Integration `[x]`

### Canonical model

```text
Customer
  └── Project
       └── one or more Customer Orders
```

### Accepted capabilities

- [x] `customer_projects` and append-safe Project lifecycle history.
- [x] DB-authoritative Project numbering.
- [x] authoritative Project Sales Rep.
- [x] nullable `customer_orders.project_id`.
- [x] Project Customer = Order Customer enforcement.
- [x] Project create/list/detail/update contracts.
- [x] Project-context Order creation.
- [x] existing Order linking.
- [x] legacy standalone Orders remain valid.
- [x] cancelled Orders excluded from active Project work while remaining explicitly filterable.
- [x] `/projects` and `/projects/[id]` Admin surfaces with `projects.view` / `projects.manage`.
- [x] compact Project Progress summary and actor-aware lifecycle Activity.
- [x] no Store/Customer Portal/Dealer Portal internal Project projection widening.

### Production migrations

- `20260902232013_project_base_core`
- `20260902232311_project_base_order_assignment`
- `20260902234109_project_base_fk_covering_indexes`

**Status: MERGED / DEPLOYED / ACCEPTED.**

---

## PB-2 — Project Financial Rollup `[x]`

### Accepted scope

- [x] Roll up canonical Order sales and current canonical product cost.
- [x] Category mapping:
  - Cabinet
  - Countertop
  - Sink
  - Labor
  - Material
  - Other
- [x] Calculate:
  - Total Sales
  - Total Cost
  - Gross Profit
  - Gross Margin %
  - Markup %
  - Invoiced
  - Paid
  - Balance
- [x] Cancelled Orders excluded.
- [x] Invoice lifecycle includes `issued`, `partially_paid`, `paid`, `overdue`; excludes `draft` and `void`.
- [x] Missing cost fails closed instead of presenting false profitability.
- [x] Mixed currencies fail closed instead of inventing FX conversion.
- [x] Cost/margin visibility restricted to Admin/Finance through `pricing.cost.view` plus DB role guard.
- [x] Sales denied detailed Project profitability with SQLSTATE `42501`.
- [x] Project Financial Summary Admin UI.
- [x] No Store/Portal finance leakage.

### Git / deployment acceptance

PR #271: `feat: add PB-2 project financial rollup`

Merge SHA:
`2f5fc9f2638c41af86124cf5f907f9f25a355399`

Accepted production Admin deployment:
`dpl_575svdZs7mu9ZKXKTydAVzkNNMno`

### Production migrations

- `20260903110906_project_financial_rollup`
- `20260903111231_project_financial_rollup_runtime_fix`
- `20260903111716_project_financial_rollup_advisor_hardening`

**Status: MERGED / DEPLOYED / ACCEPTED.**

---

## PB-3A — Customer Payment Ledger `[~]`

Payment plan and actual customer cash are separate concepts.

```text
Project
  ├── Payment Requirement / Milestone
  ├── Actual Customer Payment Transaction
  └── Payment Allocation
       └── transaction ↔ requirement
```

### Approved business rules

- [x] Customer deposit/prepayment may exist before an Invoice.
- [x] Requirement and actual payment are separate records.
- [x] Partial payment supported.
- [x] Multiple transactions may satisfy one requirement.
- [x] One payment may allocate across multiple requirements.
- [x] Unallocated Project customer credit remains explicit.
- [x] Requirement state is derived from effective allocations.
- [x] Reversal/refund/void is append-safe; posted financial history is not destructively rewritten.
- [x] Project/currency mismatch fails closed.
- [x] No silent FX conversion is invented.
- [x] No automatic FIFO allocation; allocation is explicit.

### Invoice compatibility

- [x] Add `customer_invoices.ledger_managed` compatibility state.
- [x] Historical `paid_amount` is preserved; migration does not fabricate historical payment transactions.
- [x] Ledger-managed Invoice paid amount/payment-derived status is maintained from allocations.
- [x] Ledger-managed Invoice payment values are read-only in Invoice UI.
- [x] Legacy Invoice history remains readable.
- [x] New customer payment mutation is Finance/Admin-only.
- [x] Sales cannot write `paid_amount` or force paid/partially-paid state even on legacy Invoice workflow.
- [x] Invoice → Project Finance deep-link uses `?tab=Finance` and Project Detail honors tab deep links.

### RBAC

- [x] `project_payments.view`
- [x] `project_payments.manage`
- [x] Sales receives view-only sanitized collection state.
- [x] Finance/Admin receive detailed ledger + mutations.
- [x] PB-2 cost/margin remains a separate permission boundary.

### Project Detail workspace

PB-3A establishes the long-lived Project workspace shell:

- [x] Overview
- [x] Orders
- [x] Finance
- [x] Procurement
- [x] Fulfillment
- [x] Documents
- [x] Activity

Implemented now:

- [x] Overview and Orders preserve PB-1 behavior.
- [x] Finance implements customer receivables/payment ledger.
- [x] Activity preserves lifecycle history.
- [x] Fulfillment reuses the existing Project Progress truth without replacing Shipment/Installation domains.
- [x] Procurement/Documents remain truthful staged shells; no fake records are created.

### Finance tab — Admin/Finance

- [x] Expected
- [x] Received
- [x] Remaining
- [x] Overdue
- [x] Unallocated Credit
- [x] Payment Plan / milestone table
- [x] Add Requirement
- [x] Customer Payments table
- [x] Record Payment
- [x] Allocate Payment
- [x] Reverse Payment
- [x] PB-2 Project Financial Summary remains separately gated by cost/margin permission.

### Finance tab — Sales

Sales sees only collection progress:

- [x] overall collection state
- [x] milestone name
- [x] due date
- [x] milestone status

Sales projection intentionally does **not** model:

- payment amount
- paid amount
- balance
- cost
- margin
- profit
- vendor price
- outgoing expense amount

### Production migrations

Applied successfully:

- `20260903124606_customer_project_payment_ledger`
- `20260903124630_customer_project_payment_ledger_hardening`
- `20260903124645_customer_project_payment_invoice_role_guard`
- `20260903125353_customer_project_payment_advisor_cleanup`

Repository mirrors:

- `20260903143000_customer_project_payment_ledger.sql`
- `20260903143500_customer_project_payment_ledger_hardening.sql`
- `20260903144000_customer_project_payment_invoice_role_guard.sql`
- `20260903144500_customer_project_payment_advisor_cleanup.sql`

### Production authorization acceptance

- [x] RLS enabled on all three ledger tables.
- [x] anon/authenticated direct table access denied.
- [x] explicit restrictive deny-by-default policies installed.
- [x] anon public RPC execution denied.
- [x] public RPCs are SECURITY INVOKER.
- [x] private role-guarded implementations use pinned SECURITY DEFINER boundaries.
- [x] Sales sanitized status RPC succeeds.
- [x] Sales detailed ledger RPC returns SQLSTATE `42501`.
- [x] Sales record-payment RPC returns SQLSTATE `42501`.

### Rollback-only production mutation acceptance

Finance-role test flow:

```text
Requirement 100 USD
Payment      60 USD
Allocate     40 USD
Reverse      20 USD
-------------------
Effective Collected 40 USD
Remaining           60 USD
```

- [x] canonical ledger returned Expected 100 / Received 40 / Allocated 40 / Remaining 60.
- [x] requirement derived `partially_paid`.
- [x] reversal preserved append-safe history.
- [x] transaction rolled back.
- [x] follow-up production counts: 0 requirements / 0 transactions / 0 allocations.

Void smoke:

- [x] posted payment can be voided through authoritative RPC when unallocated/unreversed.
- [x] `voided_at`, `voided_by`, `void_reason` recorded.
- [x] transaction rolled back with zero residue.

### Advisor acceptance

- [x] Initial PB-3A RLS-no-policy INFO identified.
- [x] Initial PB-3A unindexed-FK INFO identified.
- [x] forward cleanup migration added explicit restrictive deny policies.
- [x] covering FK indexes added.
- [x] fresh Security/Performance Advisor scan shows those PB-3A findings removed.
- [x] new ledger indexes may appear as `unused_index` INFO until real traffic exists; this is expected.
- [x] unrelated Store/HR/vendor/support advisor backlog remains outside PB-3A.

### Acceptance artifact

`docs/acceptance/pb-3a-project-payment-ledger.md`

### Git state

PR #272: `feat: add PB-3A Project payment ledger`

- [x] production DB migration acceptance complete.
- [x] live role/RPC smoke complete.
- [x] advisor cleanup complete.
- [x] strict shared Admin UI primitives/tokens used by new Project shell/Finance surfaces.
- [~] final-head CI + preview/UI review.
- [ ] project owner merge.
- [ ] production Admin deployment after merge.

**PB-3A status: DB ACCEPTED; CODE PR CLOSEOUT IN PROGRESS.**

---

## PB-3B — Procurement `[ ]`

Goal: make Project procurement first-class without duplicating Vendor Catalog or Inventory truth.

Expected scope:

- vendor purchase/order commitment linked to Project/Order scope where appropriate;
- expected vendor delivery dates;
- procurement status/blockers;
- purchase-cost truth feeding Project finance without double counting;
- existing Vendor Catalog remains product-discovery/import domain, not procurement ledger;
- no Store/Portal projection unless separately approved.

Exact schema/RPC/UI must be designed against execution-time production truth before implementation.

---

## PB-4 — Finance Outgoing Payments / Project Expenses `[ ]`

Finance owns outgoing money movements.

Examples:

- Salary
- Bonus / Commission
- Vendor payment
- Designer payment
- Contractor
- Installer
- Extra labor
- Material
- Delivery
- Other

Project linkage is optional:

```text
project_id = null
→ company/general expense

project_id = <project>
→ Project expense/payment
```

Rules:

- Project Expense view is a filtered view of canonical Finance truth, not a duplicate ledger.
- Cost/accrual and cash payment are separate concepts.
- Paying a vendor bill must not double-count Project cost.
- Sales must not see outgoing money amounts unless a future explicit permission decision says otherwise.

---

## PB-5 — Delivery & Installation Rollup `[ ]`

- [ ] Derive Project delivery state from child Orders/Shipments.
- [ ] Derive Project installation state from child Orders/Installations.
- [ ] Support multiple deliveries/installations.
- [ ] Preserve existing fulfillment lifecycle ownership.
- [ ] Model Customer Pickup separately through existing `fulfillment_type` semantics.
- [ ] Surface procurement blockers once PB-3B exists.

---

## PB-6 — Participants & Commission Ledger `[ ]`

Participants may include:

- Designer
- Contractor
- Installer
- Referral Partner

Commission ledger must support fixed/percentage, category, earned/approved/paid states and adjustment/offset entries rather than one editable amount field.

---

## PB-7 — Change Orders `[ ]`

Support post-sale scope/value changes such as:

- added cabinets;
- island revision;
- additional vanity/bath scope;
- removed item;
- customer credit;
- vendor credit;
- price adjustment.

Customer/sell impact and vendor/cost impact remain separate. Original approved commercial history is not destructively rewritten. Order revisions remain distinct from Project Change Orders.

---

## PB-8 — Portal Project Projection `[ ]`

Only after Admin/DB Project truth is stable:

- narrow sanitized Project projection;
- strict customer/dealer isolation;
- no internal cost/margin/commission/vendor/payment-detail/audit leakage;
- Project → Orders / Shipments / Installations navigation.

Update `modulex-store/STORE_ROADMAP.md` in the same package when this begins.

---

## PB-9 — Historical Excel Import `[ ]`

Historical import remains last and is not a foundation blocker.

When required:

- stage first;
- preserve source file/row provenance;
- match Customer separately from Project;
- map salesperson to Project;
- never trust spreadsheet `Profit Margin` as canonical margin;
- flag ambiguous mixed note/status rows for review;
- reconcile totals before production writes.

---

# 5. Current Snapshot

As of 2026-09-03:

- Production Supabase strategy: existing project `bzjoeernnmvuhzyvbowc`.
- PB-1: merged/deployed/accepted.
- PB-2: merged/deployed/accepted.
- PB-3A DB: production migrations applied/accepted.
- PB-3A production business-data residue from acceptance: **none**.
- PB-3A Sales boundary: status-only works; detailed ledger/payment mutation denied.
- PB-3A Finance boundary: requirement/payment/allocation/reversal rollback flow accepted.
- PB-3A Advisor-specific RLS/FK findings: cleaned.
- PB-3A code branch: `feat/project-operations-hub-pb3`.
- PB-3A PR: #272, user-owned; **do not auto-merge**.
- Store public/Customer Portal/Dealer Portal behavior: unchanged by PB-3A.
- Next business package after PB-3A merge/deploy: **PB-3B Procurement**.

---

# 6. Tracking Protocol

For every Project package:

1. Re-check latest `main` and parallel PRs.
2. Re-read this tracker before deciding the next action.
3. Preserve safe newer parallel work.
4. Mark active package `[~]`.
5. Record business/architecture decisions immediately.
6. Mark `[x]` only after fresh verification evidence.
7. Update Current package / Current status / Next action.
8. Update `modulex-admin/ADMIN_ROADMAP.md` when Admin capability materially changes.
9. Update `modulex-store/STORE_ROADMAP.md` only when Store/Portal behavior materially changes.
10. Keep DB migration acceptance separate from code merge/deploy acceptance.
11. Use rollback-only production mutation probes where real writes are not required for acceptance.
12. Never leave acceptance-test business data in production.
