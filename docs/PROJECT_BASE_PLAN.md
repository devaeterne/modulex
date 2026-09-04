# Modulex Project Base — Implementation Plan

Last reviewed: 2026-09-04
Active branch: `feat/project-pb5-fulfillment-rollup`
Production Supabase: `bzjoeernnmvuhzyvbowc`

Current package: **PB-5 — Delivery & Installation Rollup — implementation / PR acceptance**

Current status: **PB-1, PB-2, PB-3A and PB-3B are completed Project capabilities. PB-4 Project Expenses/Outgoings is intentionally removed from the Project workstream and owned by Finance. PB-5 is implemented on an isolated branch as a read-only Project projection over canonical Order, Shipment, Installation and Procurement truth; production DDL has not been applied.**

Next action: **Complete PB-5 final-head Admin UI/Project CI and PR review, let the Project owner merge/deploy, then perform the separately approved production DB acceptance. After PB-5 closes, continue with PB-6 Participants & Commission Ledger.**

This file is the operational source of truth for the Project Base workstream. When asked where Project Base stands, read this file first and report the current package, completed packages, acceptance evidence, blockers and next action.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Intentionally skipped / owned by another workstream

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
       ├── Delivery / Shipments
       ├── Installations
       ├── Participants
       ├── Change Orders
       ├── Commissions
       └── Financial Summary
```

Project-linked expenses/outgoing cash remain Finance-owned canonical truth and are not a Project ledger.

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
9. Project must not create a parallel expense, outgoing-payment, commission-payment or AP truth when Finance owns that money movement.
10. No automatic historical business-data fabrication/backfill unless separately approved.
11. DB migration acceptance and code merge/deploy acceptance are separate gates.
12. Every Project package must run relevant CI, production-safe DB acceptance and Supabase Advisor review before closeout.
13. Parallel work must be preserved: re-check execution-time `main` and open PRs before every new package.

---

# 3. Approved Financial Semantics

```text
Gross Profit = Sales - Cost
Gross Margin % = Gross Profit / Sales
Markup % = Gross Profit / Cost
```

Project completion and financial closure are different states.

Finance overview must consume the same Project-linked finance truth rather than a Project-owned copy.

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
- [x] Category mapping: Cabinet, Countertop, Sink, Labor, Material, Other.
- [x] Total Sales, Total Cost, Gross Profit, Gross Margin %, Markup %, Invoiced, Paid, Balance.
- [x] Cancelled Orders excluded.
- [x] Invoice lifecycle excludes draft/void from active commercial rollup.
- [x] Missing cost fails closed instead of presenting false profitability.
- [x] Mixed currencies fail closed instead of inventing FX conversion.
- [x] Cost/margin visibility restricted to Admin/Finance through `pricing.cost.view` plus DB role guard.
- [x] Sales denied detailed Project profitability with SQLSTATE `42501`.
- [x] Project Financial Summary Admin UI.
- [x] No Store/Portal finance leakage.

### Git / deployment acceptance

PR #271: `feat: add PB-2 project financial rollup`

Merge SHA: `2f5fc9f2638c41af86124cf5f907f9f25a355399`

Accepted production Admin deployment: `dpl_575svdZs7mu9ZKXKTydAVzkNNMno`

### Production migrations

- `20260903110906_project_financial_rollup`
- `20260903111231_project_financial_rollup_runtime_fix`
- `20260903111716_project_financial_rollup_advisor_hardening`

**Status: MERGED / DEPLOYED / ACCEPTED.**

---

## PB-3A — Customer Payment Ledger `[x]`

Payment plan and actual customer cash are separate concepts.

```text
Project
  ├── Payment Requirement / Milestone
  ├── Actual Customer Payment Transaction
  └── Payment Allocation
       └── transaction ↔ requirement
```

### Accepted business rules

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

### Invoice compatibility / RBAC

- [x] Ledger-managed Invoice compatibility preserves historical Invoice truth.
- [x] Payment mutation is Finance/Admin-only.
- [x] Sales receives sanitized collection status only.
- [x] `project_payments.view` / `project_payments.manage` boundaries are DB-enforced.
- [x] PB-2 cost/margin remains a separate permission boundary.

### Project Detail workspace

- [x] Overview
- [x] Orders
- [x] Finance
- [x] Procurement shell established for later PB-3B wiring
- [x] Fulfillment shell established for later PB-5 wiring
- [x] Documents shell
- [x] Activity

### Production migrations

- `20260903124606_customer_project_payment_ledger`
- `20260903124630_customer_project_payment_ledger_hardening`
- `20260903124645_customer_project_payment_invoice_role_guard`
- `20260903125353_customer_project_payment_advisor_cleanup`

Repository mirrors:

- `20260903143000_customer_project_payment_ledger.sql`
- `20260903143500_customer_project_payment_ledger_hardening.sql`
- `20260903144000_customer_project_payment_invoice_role_guard.sql`
- `20260903144500_customer_project_payment_advisor_cleanup.sql`

### Acceptance

- [x] RLS / public-RPC / private SECURITY DEFINER boundaries accepted.
- [x] Sales sanitized status RPC succeeds while detailed ledger/payment mutation is denied.
- [x] rollback-only requirement/payment/allocation/reversal and void smoke passed with zero production residue.
- [x] PB-3A Advisor-specific RLS/FK findings cleaned.
- [x] acceptance artifact: `docs/acceptance/pb-3a-project-payment-ledger.md`.

**Status: MERGED / DEPLOYED / ACCEPTED.**

---

## PB-3B — Procurement `[x]`

Project procurement is first-class without duplicating Vendor Catalog or Inventory truth.

Accepted capabilities:

- [x] Confirmed Order → Procurement requirements.
- [x] vendor resolution and Project/Order/product/quantity linkage.
- [x] Vendor Order / PO reference.
- [x] partial procurement delivery events.
- [x] procurement delivery does not fabricate Inventory movement.
- [x] Vendor Invoice support, including one Invoice allocated across multiple Projects.
- [x] invoice-cost allocation into Project procurement truth.
- [x] append-safe delivery correction / invoice-allocation reversal semantics.
- [x] detailed Admin/Finance boundaries and sanitized Sales procurement status.
- [x] production RPC hardening / acceptance completed.
- [x] Sales-safe `get_customer_project_procurement_status` exposes requirement/order/delivery states without vendor/cost detail.
- [x] Project Detail now renders the approved role-aware `ProjectProcurementTab`; PB-5 verification restored the intended PB-3B workspace wiring that had remained a placeholder on `main`.

**Status: MERGED / DEPLOYED / ACCEPTED; WORKSPACE INTEGRATION RESTORED IN PB-5 PR.**

---

## PB-4 — Project Expenses / Outgoings `[!]`

**SKIPPED IN PROJECT WORKSTREAM.** Finance owns expenses, AP, payroll/commission payment and outgoing cash.

Project may later consume a stable Finance projection/interface, but PB-4 must not create a parallel Project ledger or modify Finance schema/runtime.

---

## PB-5 — Delivery & Installation Rollup `[~]`

Goal: Project-level fulfillment visibility without changing ownership of Shipment, Delivery, Installation or Procurement truth.

### Implementation

- [x] derive active Project delivery state from child Orders + Shipments.
- [x] keep Project delivery and installation dimensions separate.
- [x] support multiple Shipments / deliveries.
- [x] support multiple Installations.
- [x] represent Customer Pickup separately through existing `fulfillment_type` semantics.
- [x] honor existing canonical Installation records even when legacy Order metadata does not say `delivery_installation`.
- [x] project PB-3B procurement blockers without vendor/cost/internal detail.
- [x] exclude cancelled Orders from active rollup while preserving cancelled history rows.
- [x] replace the Fulfillment placeholder with real shared-primitive Admin UI.
- [x] preserve existing Sales/Admin Shipment + Installation visibility boundaries; Finance is not broadened.
- [x] no duplicate Project fulfillment table/ledger.
- [x] no Store/Portal projection.
- [x] TDD RED contract committed before implementation.
- [x] PB-5 contract wired into the consolidated `.github/workflows/admin-project-base.yml` job; no package-specific workflow wrapper remains.
- [x] Admin Project Base fresh runs #220 and #221 are green on the PB-5 branch after restoring PB-3B workspace wiring.
- [x] acceptance artifact added: `docs/acceptance/pb-5-project-fulfillment.md`.
- [ ] final-head Admin UI Foundation green.
- [ ] owner merge.
- [ ] separate post-merge production DDL/RPC acceptance after explicit owner approval.
- [ ] production Admin deploy after DB acceptance.

Repository migration/RPC source:

- `modulex-admin/sql/project-pb5-fulfillment-rollup.sql`
- `public.get_customer_project_fulfillment(uuid)` → private role-guarded projection implementation.

**Status: CODE IMPLEMENTED; PR/CI ACCEPTANCE IN PROGRESS. PRODUCTION UNCHANGED.**

---

## PB-6 — Participants & Commission Ledger `[ ]`

Participants may include Designer, Contractor, Installer, Referral Partner and other business participants.

Commission obligation must support fixed/percentage/category scope, earned/approved states and append-safe adjustment/offset/reversal entries rather than one editable amount field.

Actual commission payment remains Finance-owned canonical truth; Project must not create a second payment ledger.

---

## PB-7 — Change Orders `[ ]`

Support post-sale business-level approved scope/value changes such as added cabinets, island revision, extra vanity/bath scope, removed items, customer/vendor credit and price adjustment.

Customer/sell impact and vendor/cost impact remain separate. Original approved commercial history is not destructively rewritten. Order revisions remain distinct from Project Change Orders.

---

## PB-8 — Portal Project Projection `[ ]`

Only after Admin/DB Project truth is stable:

- narrow sanitized Project projection;
- strict customer/dealer isolation;
- no internal cost/margin/commission/vendor/payment-detail/audit leakage;
- Project → Orders / Shipments / Delivery / Installation / Documents navigation.

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
- flag ambiguous/unmatched rows for review;
- enforce idempotency and duplicate prevention;
- reconcile legacy totals separately from canonical Modulex calculations;
- require dry-run/reconciliation before any production import.

---

# 5. Current Snapshot

As of 2026-09-04:

- execution-time `main` incorporated into PB-5 branch: `190da5745fe2b6972deabff0d11c16263cd5c0f5`.
- open PRs at PB-5 start: none; current PB-5 draft PR: #296.
- PB-1: merged/deployed/accepted.
- PB-2: merged/deployed/accepted.
- PB-3A: merged/deployed/accepted.
- PB-3B: merged/deployed/accepted; role-aware workspace integration restored in PR #296.
- PB-4: intentionally delegated to Finance; Project will consume stable Finance interfaces only when needed.
- PB-5 branch: `feat/project-pb5-fulfillment-rollup`.
- PB-5 production schema inspection: read-only only; no migration/RPC/data mutation applied.
- Store public/Customer Portal/Dealer Portal behavior: unchanged by PB-5.
- next Project package after PB-5 owner merge/deploy acceptance: **PB-6 Participants & Commission Ledger**.

---

# 6. Tracking Protocol

For every Project package:

1. Re-check latest `main` and parallel PRs.
2. Re-read this tracker before deciding the next action.
3. Preserve safe newer parallel work and do not touch Finance workstream files.
4. Mark active package `[~]`.
5. Record business/architecture decisions immediately.
6. Mark `[x]` only after fresh verification evidence.
7. Update Current package / Current status / Next action.
8. Update `modulex-admin/ADMIN_ROADMAP.md` when Admin capability materially changes.
9. Update `modulex-store/STORE_ROADMAP.md` only when Store/Portal behavior materially changes.
10. Keep DB migration acceptance separate from code merge/deploy acceptance.
11. Use rollback-only production mutation probes only after explicit approval when real writes are required for acceptance.
12. Never leave acceptance-test business data in production.
13. Never create Project-owned parallel financial truth when Finance owns the canonical money movement.
