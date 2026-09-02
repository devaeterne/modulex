# Modulex Project Base — Implementation Plan

Last reviewed: 2026-09-03
Branch: `project-base`
Main baseline: `29a8e6b74bd5ae073b92b7771d5442374c699281`
Current package: **PB-0 — Isolation & Project foundation planning**
Current status: **Git branch created; implementation plan committed. Supabase preview branch is pending platform-required cost confirmation before creation. Production Supabase has not been mutated.**
Next action: **Create the isolated Supabase `project-base` branch, bind preview environment, then implement PB-1 Project Core with additive migrations only.**

This document is the operational source of truth for the `project-base` workstream. Every meaningful package must update this file in the same branch/PR before it is considered complete.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Blocked

---

# 1. Goal

Introduce **Project / Job** as the business-level parent for customer work without replacing or breaking the existing Orders, Invoices, Shipments, Installations, Store portal projections, pricing contracts, or production data.

Target hierarchy:

```text
Customer / Account
  └── Project / Job
       ├── Sales Rep
       ├── Project Address / Site
       ├── Orders
       │    ├── Cabinets
       │    ├── Countertops
       │    ├── Sinks
       │    ├── Materials
       │    └── Other
       ├── Invoices
       ├── Payments
       ├── Shipments / Delivery
       ├── Installations
       ├── Participants
       ├── Change Orders
       ├── Commissions
       └── Project Financials
```

The 2023–2026 cabinet sales workbooks are treated as evidence of the desired **project-level operational/financial workflow**, not as a schema to copy literally.

---

# 2. Non-Negotiable Rollout Rules

1. **Production `main` remains untouched until reviewed merge.**
2. **Production Supabase remains untouched while PB packages are developed in preview.**
3. Database rollout is additive first:
   - create new tables,
   - create new indexes,
   - create new RLS/RPC contracts,
   - add nullable foreign keys only where required.
4. Do not drop, rename, repurpose, or make existing Order columns stricter during the foundation rollout.
5. Existing orders with no project remain valid.
6. `project_id` must remain nullable until legacy/backfill acceptance is explicitly complete.
7. Existing Store / Customer Portal / Dealer Portal projections must not expose Project data automatically.
8. Internal cost, margin, commissions, notes, or staff fields must never leak into public/portal projections.
9. Do not weaken RLS, RPC authorization, grants, idempotency, or audit boundaries to simplify Project UI.
10. Every schema package must run Security + Performance Advisors before completion.
11. Every package must update this tracker before being marked complete.

---

# 3. Current Production Truth — Baseline

Verified on production Supabase before implementation:

Existing operational tables include:

- `customers`
- `profiles`
- `customer_orders`
- `customer_order_items`
- `customer_order_revisions`
- `customer_order_status_history`
- `customer_order_reservations`
- `customer_invoices`
- `customer_invoice_items`
- `customer_shipments`
- `customer_shipment_items`
- `customer_installations`
- `customer_activity`

Important current facts:

- `customer_orders.customer_id` is required.
- `customer_invoices.order_id` is currently nullable.
- `customer_shipments.order_id` is required.
- `customer_installations.order_id` is required.
- `customers.sales_rep_id` already exists.
- No first-class payment transaction ledger table currently exists; invoices keep summary fields such as `paid_amount`.
- Order revision history already exists and should not be replaced by Project change-order semantics.

### Sales Rep decision

Project owns the commercial salesperson for the job:

```text
customers.sales_rep_id
  = optional/default account salesperson

customer_projects.sales_rep_id
  = authoritative salesperson for that specific project/job
```

When creating a project, Admin may prefill the customer's salesperson, but changing the customer salesperson later must not silently rewrite historical projects.

---

# 4. Core Domain Decisions

## 4.1 Project is the primary business container

A Customer may have many Projects. A Project may have many Orders.

Examples:

```text
Paul Davis
  ├── Cruz Job
  ├── Bowen Job
  └── Rawat Island
```

This replaces spreadsheet naming tricks such as customer-name suffixes with a structured relationship.

## 4.2 Quote is not required for Project foundation

Do **not** block the foundation on a separate Quote entity.

A Project can exist before an Order. If later operations require proposal versions, approvals, expirations, or customer-facing quote PDFs, a Quote domain can be added under Project without changing the Project foundation.

## 4.3 Order remains the commercial transaction object

Do not replace `customer_orders`.

Initial relationship:

```text
customer_orders.project_id uuid null
```

Legacy orders continue working with `project_id = null`.

## 4.4 Order revisions and Change Orders are different concepts

- `customer_order_revisions` = revision/audit history of an Order.
- Project Change Order = approved post-sale scope/value change across a project.

Do not overload the existing order revision table to represent project change orders.

## 4.5 Project status dimensions stay separate

Do not reproduce the spreadsheet's single mixed Status/Note column.

Project lifecycle:

```text
DRAFT
QUOTED
APPROVED
ORDERED
IN_PROGRESS
COMPLETED
CANCELLED
```

Separate derived/operational dimensions:

- Payment: `UNPAID | PARTIAL | PAID`
- Delivery: `NOT_READY | READY | SCHEDULED | PARTIAL | DELIVERED`
- Installation: `NOT_REQUIRED | NOT_SCHEDULED | SCHEDULED | IN_PROGRESS | INSTALLED`

Exact enums/check constraints must be aligned with existing Modulex status conventions before migration.

## 4.6 Financial semantics

Never use `Sold / Cost` as "Profit Margin".

Canonical calculations:

```text
Gross Profit = Sales - Cost
Gross Margin % = Gross Profit / Sales
Markup % = Gross Profit / Cost
Balance = Invoiced / Project Receivable - Payments Applied
```

Do not store values that can be safely derived unless a historical snapshot/audit requirement demands it.

---

# 5. Target Project Data Model

The exact migration is PB-1 work; this is the approved design target.

## `customer_projects`

Core fields:

```text
id uuid pk
project_number text unique
customer_id uuid not null -> customers.id
name text not null
status text not null
sales_rep_id uuid null -> profiles.id
project_address_id uuid null -> customer_addresses.id (if appropriate)
project_address_snapshot jsonb null
start_date date null
target_date date null
completed_at timestamptz null
customer_notes text null
internal_notes text null
created_by uuid null
updated_by uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

Design requirements:

- Project number generation must be deterministic/idempotent and DB-authoritative.
- Customer relationship is immutable after commercial activity begins unless a reviewed correction path exists.
- Project address should preserve historical snapshot semantics similar to Orders/Shipments.
- Soft lifecycle/audit behavior preferred over physical delete after references exist.

## `customer_project_status_history`

Append-safe history for lifecycle transitions.

## `customer_project_participants`

For roles beyond the authoritative salesperson:

```text
project_id
profile/person reference where available
participant_name snapshot where external
role
notes
created_at
```

Initial roles:

- SALES_REP
- DESIGNER
- CONTRACTOR
- INSTALLER
- REFERRAL_PARTNER

The authoritative `sales_rep_id` remains directly on `customer_projects` for reporting/filtering; participant rows must not create ambiguity.

---

# 6. Work Packages

## PB-0 — Isolation & Baseline

- [x] Verify current `main` before branching.
- [x] Confirm `project-base` did not already exist.
- [x] Create Git branch `project-base` from current `main`.
- [x] Review repo-wide `AGENTS.md` rules.
- [x] Review current Admin roadmap.
- [x] Review current Store roadmap.
- [x] Inspect production schema read-only for Orders/Invoices/Shipments/Installations/Customers/Profiles/Payments baseline.
- [x] Add this operational tracking document.
- [!] Create Supabase `project-base` preview/persistent branch.
  - Blocker: Supabase branch creation requires platform cost lookup + explicit cost confirmation before the tool permits creation.
  - Production has not been changed.
- [ ] Bind Vercel Preview to the isolated Supabase branch credentials/integration.
- [ ] Record Supabase branch project ref here after creation.
- [ ] Verify Preview uses non-production Supabase credentials.

**PB-0 done when:** Git + Supabase isolation are verified and a Preview deployment can run without touching production data.

---

## PB-1 — Project Core DB Foundation

- [ ] Add `customer_projects` migration.
- [ ] Add `customer_project_status_history` migration.
- [ ] Add required indexes for customer/status/sales-rep/date filtering.
- [ ] Add RLS and grants using existing Admin authorization conventions.
- [ ] Add server/RPC create/update/status-transition contracts.
- [ ] Add project-number generation contract.
- [ ] Add `customer_orders.project_id` as **nullable** FK.
- [ ] Do not backfill legacy orders yet.
- [ ] Verify existing Order create/read/update flows with `project_id = null`.
- [ ] Verify Store/portal order projections are unchanged.
- [ ] Run Security Advisor.
- [ ] Run Performance Advisor.
- [ ] Add/extend DB contract tests.

**PB-1 done when:** Project rows can safely exist and optionally own new Orders while every existing Order path remains backward compatible.

---

## PB-2 — Admin Project List / Create / Detail Shell

- [ ] Read `modulex-admin/docs/ADMIN_UI_GUIDE.md` before UI changes.
- [ ] Read `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md` before forms/mutations.
- [ ] Add permission/RBAC decision for Project read/manage.
- [ ] Add `/projects` navigation and route.
- [ ] Add server-side pagination/search/filtering.
- [ ] Filters: project number, customer, salesperson, status, date.
- [ ] Add project create flow.
- [ ] Prefill salesperson from Customer where present; store independently on Project.
- [ ] Add `/projects/[id]` shell.
- [ ] Tabs/sections:
  - Overview
  - Orders
  - Financials
  - Payments
  - Delivery
  - Installation
  - People
  - Activity
- [ ] Loading / empty / populated / error / retry / permission states.
- [ ] Strict Admin UI smoke + RBAC tests + typecheck/lint/build.

**PB-2 done when:** A Project can be created and managed in Preview using existing shared Admin UI primitives.

---

## PB-3 — Orders ↔ Project Integration

- [ ] Allow Order creation from Project context.
- [ ] Project-created Order receives `project_id` server-side.
- [ ] Prevent customer/project mismatch at DB/RPC boundary.
- [ ] Show Project on Order detail where present.
- [ ] Show Orders on Project detail.
- [ ] Keep standalone legacy Order creation working.
- [ ] Decide whether general Order-create UI may optionally select a Project.
- [ ] Preserve Order idempotency, pricing snapshots, reservations, revision history and fulfillment rules.
- [ ] Add regression tests for Orders with and without Projects.

**PB-3 done when:** New Project jobs can contain multiple Orders without changing legacy Order behavior.

---

## PB-4 — Project Financial Rollup

Initial financial rollup should consume existing commercial truth before inventing parallel values.

- [ ] Define canonical project sales rollup from Orders/Invoices.
- [ ] Define canonical project cost rollup from existing profitability/current-cost contracts or approved snapshots.
- [ ] Define Cabinet / Countertop / Sink / Labor / Material / Other category mapping from Product Type/UOM/domain truth.
- [ ] Calculate:
  - Total Cost
  - Total Sales
  - Gross Profit
  - Gross Margin %
  - Markup %
  - Invoiced
  - Paid
  - Balance
- [ ] Decide whether non-product/manual financial adjustments are genuinely required before adding a table.
- [ ] Never expose internal cost/margin through Store/portal RPCs.
- [ ] Add Project financial summary UI.

**PB-4 done when:** Project financials reconcile to underlying Modulex records and do not depend on spreadsheet formulas/manual totals.

---

## PB-5 — Payment Ledger

Production currently has no first-class payment transaction ledger table.

- [ ] Design additive `customer_payments` ledger (final contract to be reviewed before migration).
- [ ] Link payment to Customer + Project, with optional Invoice/Order allocation where business rules require it.
- [ ] Support deposit / progress / delivery / final payment patterns without special-case columns.
- [ ] Record amount, currency, payment method, received date, reference, notes, actor and audit timestamps.
- [ ] Define reversal/void semantics; avoid destructive delete.
- [ ] Derive invoice/project `paid` and `balance` from ledger/allocation truth where safe.
- [ ] Preserve compatibility with existing `customer_invoices.paid_amount` until migration strategy is explicitly accepted.
- [ ] Add Project Payments UI and ledger history.

**PB-5 done when:** Partial payments and balances are transaction-backed rather than free-text/boolean spreadsheet states.

---

## PB-6 — Delivery & Installation Rollup

Existing shipments/installations remain authoritative child operational objects.

- [ ] Derive project delivery state from project Orders/Shipments.
- [ ] Derive project installation state from project Orders/Installations.
- [ ] Show upcoming shipment/install dates on Project.
- [ ] Support multiple deliveries/installations across multiple Orders.
- [ ] Keep existing shipment/install lifecycle contracts unchanged.

**PB-6 done when:** Project displays truthful fulfillment progress without duplicating shipment/installation state.

---

## PB-7 — Participants & Commissions

- [ ] Implement Project participant model after the core Project flow is stable.
- [ ] Support Designer / Contractor / Installer / Referral Partner.
- [ ] Decide internal profile vs external participant identity contract.
- [ ] Design structured Project commission records.
- [ ] Commission category examples: Cabinet / Countertop / Project Total / Other.
- [ ] Commission type: fixed / percentage.
- [ ] Track earned / approved / paid status and payment timestamp.
- [ ] Do not parse or persist commission logic as unstructured notes.

**PB-7 done when:** Spreadsheet-style contractor/commission notes are represented as queryable, auditable data.

---

## PB-8 — Change Orders

- [ ] Define Project Change Order lifecycle and approval semantics.
- [ ] Keep `customer_order_revisions` as Order revision history.
- [ ] Support additions such as island revision, added cabinets, master bath, extra scope.
- [ ] Change Order must show cost/sales delta and approval history.
- [ ] Approved deltas roll into Project financials.
- [ ] Define whether implementation creates a new child Order, adjusts an existing Order through approved revision, or supports both by explicit type.

**PB-8 done when:** Post-sale scope additions are first-class and financially/audit traceable.

---

## PB-9 — Customer / Dealer Portal Project Projection

This phase is intentionally deferred until Admin/DB Project truth is stable.

- [ ] Design a **narrow sanitized** Project projection.
- [ ] Customer can only see own Projects.
- [ ] Dealer can only see authorized Projects.
- [ ] Explicitly exclude:
  - internal cost
  - gross profit / margin / markup
  - internal notes
  - commissions
  - vendor/internal inventory data
  - audit metadata
- [ ] Decide portal navigation: Projects → Orders / Shipments / Installations.
- [ ] Update `STORE_ROADMAP.md` in the same package.
- [ ] Run Store Customer + Dealer portal isolation regressions.

**PB-9 done when:** Portal users can navigate Project-level fulfillment safely without any internal commercial leakage.

---

## PB-10 — Historical Excel Import

Do this **last**, after Project contracts are production-accepted.

- [ ] Build deterministic import/mapping tooling for 2023–2026 Cabinet Sold workbooks.
- [ ] Never import spreadsheet rows directly into production without staging/review.
- [ ] Match/create Customer separately from Project.
- [ ] Convert job/customer suffixes into Project names where confidently supported.
- [ ] Map salesperson into Project `sales_rep_id`.
- [ ] Preserve source row/file provenance.
- [ ] Do not treat spreadsheet `Profit Margin` as canonical margin.
- [ ] Split mixed status/note content into structured fields only when the source supports it.
- [ ] Flag ambiguous rows for review instead of inventing business facts.
- [ ] Reconcile aggregate totals before production import.

**PB-10 done when:** Historical project data is reviewable, traceable and reconciled before any production write.

---

# 7. Preview / Production Rollout Strategy

```text
Git main
   │
   └── project-base
          │
          ├── Vercel Preview
          │       │
          │       └── Supabase project-base branch
          │
          └── Draft PR → acceptance → merge
                              │
                              └── reviewed production migrations
```

Rules:

- Preview must never use production service-role credentials.
- Supabase branch data is disposable test data; do not assume production rows are cloned.
- Seed only the minimum representative data needed for Project acceptance.
- Migrations live in source control even when first tested on preview.
- Production migration happens only after PR review/acceptance and explicit rollout.
- After production DDL: run Security + Performance Advisors and relevant Admin/Store regressions.

---

# 8. Acceptance Scenarios

At minimum the Project foundation must prove:

1. Existing legacy Order with `project_id = null` still loads and mutates exactly as before.
2. Customer can have multiple Projects.
3. Project can have multiple Orders.
4. Project salesperson can differ from Customer default salesperson without changing the Customer.
5. Project customer cannot conflict with Order customer.
6. Project financial rollup excludes another customer's/order's data.
7. Multiple shipments/installations across child Orders roll up correctly.
8. Partial payment ledger produces correct paid/balance values once PB-5 lands.
9. Internal cost/margin/commission fields are unavailable to public/portal consumers.
10. Project status, payment status, delivery status and installation status do not overwrite each other.
11. Existing Customer/Dealer portal Order projections remain stable until PB-9 explicitly changes them.

---

# 9. Tracking Protocol

For every future `project-base` package:

1. Re-check latest `main` and open parallel work before implementation.
2. Re-read this file before deciding the next action.
3. Rebase/merge current `main` into `project-base` only when needed and after checking migration conflicts.
4. Mark active package `[~]`.
5. Record any design decision that changes this plan before or in the same commit as implementation.
6. Mark `[x]` only after the package's tests/acceptance pass.
7. Update at minimum:
   - `Last reviewed`
   - `Main baseline`
   - `Current package`
   - `Current status`
   - `Next action`
   - package checkboxes
   - blockers / decisions
8. If Admin functionality materially changes, update `modulex-admin/ADMIN_ROADMAP.md` in the same workstream.
9. If Store/Portal functionality materially changes, update `modulex-store/STORE_ROADMAP.md` in the same workstream.
10. Never declare `project-base` complete solely because code exists; preview acceptance and final production rollout are separate gates.

---

# 10. Current Snapshot

As of 2026-09-03:

- Git `project-base`: **created from current main**.
- Baseline SHA: `29a8e6b74bd5ae073b92b7771d5442374c699281`.
- Production Supabase: **read-only inspection only; no schema/data mutation performed by this workstream**.
- Supabase `project-base`: **not created yet — waiting for required cost confirmation step**.
- Vercel Preview DB isolation: **pending Supabase branch creation/binding**.
- Implementation: **PB-1 not started**.
- Recommended next package after isolation: **PB-1 Project Core DB Foundation**.
