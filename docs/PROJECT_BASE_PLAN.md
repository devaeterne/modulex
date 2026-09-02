# Modulex Project Base — Implementation Plan

Last reviewed: 2026-09-03
Branch: `project-base`
Draft PR: `#267 — feat: establish project-base workstream`
Current package: **PB-1 — Project Core + Order Integration**
Current status: **Git work remains isolated on `project-base`. Project schema changes will be additive and applied to the existing production Supabase. No separate Supabase branch/project will be used. PB-1 is the mergeable foundation package.**
Next action: **Implement Project Core in production Supabase, connect `customer_orders.project_id`, add Admin Project list/create/detail, prove legacy standalone Orders still work, then evaluate merge to `main`.**

This file is the operational source of truth for the `project-base` workstream. When the project owner asks **“project-base’de şu an neredeyiz?”**, read this file first and report the current package, completed items, blockers, acceptance evidence, and next action.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Blocked

---

# 1. Goal

Introduce **Project / Job** as the business-level parent for customer work while preserving the existing Orders, Invoices, Shipments, Installations, pricing, Customer Portal, and Dealer Portal behavior.

```text
Customer / Account
  └── Project / Job
       ├── Sales Rep
       ├── Project Address / Site
       ├── Orders
       ├── Invoices
       ├── Payments
       ├── Delivery / Shipments
       ├── Installations
       ├── Participants
       ├── Change Orders
       ├── Commissions
       └── Financial Summary
```

The 2023–2026 cabinet sales workbooks are business evidence for this workflow; they are not a schema to copy literally.

---

# 2. Rollout Strategy — Approved 2026-09-03

## Git

- Project work stays on `project-base` until the foundation acceptance gate passes.
- `main` is not directly edited by Project implementation work.
- Parallel `main` changes are periodically synced into `project-base` after conflict review.

## Supabase

**Approved decision:** use the existing production Supabase project `bzjoeernnmvuhzyvbowc`.

There will be **no separate Supabase development branch/project** for Project Base.

This is acceptable because the Project foundation migrations are deliberately additive and backward compatible:

- create new Project tables,
- add new indexes,
- add new RLS/RPC contracts,
- add nullable `customer_orders.project_id`,
- do not drop/rename existing columns,
- do not make Project mandatory for existing Orders,
- do not backfill or rewrite existing business rows unless separately approved.

Production DB changes must be safe for the current `main` application before they are applied. New schema must remain dormant/backward compatible until `project-base` code consumes it.

## Merge gate

The first mergeable Project foundation is intentionally small:

```text
Customer
   ↓
Project
   ↓
One or more existing Customer Orders
```

`project-base` may be merged to `main` once all of the following are verified:

1. Project create/list/detail works.
2. Project has an authoritative Project-level Sales Rep.
3. A Project can contain multiple existing-style Orders.
4. New Project-context Orders persist `project_id` server-side.
5. Order customer must match Project customer.
6. Existing standalone Orders with `project_id = null` behave exactly as before.
7. Existing pricing, revisions, reservations, shipments and installations remain intact.
8. Store / Customer Portal / Dealer Portal projections do not expose new internal Project data accidentally.
9. Required Admin UI/RBAC/typecheck/lint/build/contracts pass.
10. Supabase Security + Performance Advisors show no Project-specific blocking finding.

After this merge, the remaining Project capabilities are **upgrades**, not blockers for the Project foundation:

- Finance rollups
- Customer payment ledger
- External/project expenses
- Change Orders
- Participants
- Commissions
- Project-level delivery/install rollups
- Portal Project navigation
- Historical Excel import

---

# 3. Non-Negotiable Safety Rules

1. All foundation DB changes are additive.
2. Do not drop, rename, repurpose, or tighten existing Order columns during PB-1.
3. `customer_orders.project_id` is nullable.
4. Existing Orders without a Project remain valid indefinitely unless a later migration is explicitly approved.
5. No automatic legacy Order backfill in PB-1.
6. Project Customer and Order Customer mismatches fail closed at the authoritative server/DB boundary.
7. Do not weaken RLS, grants, role checks, idempotency, pricing snapshots, reservations, revision history, or audit semantics.
8. Project data does not automatically become Store/Portal data.
9. Internal cost, margin, commission, vendor, audit, and internal-note data must not leak to public/portal projections.
10. Every Project package updates this tracker before it is considered complete.

---

# 4. Verified Existing Production Truth

Relevant existing tables include:

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
- `payment_methods`
- `payment_terms`

Verified decisions/facts:

- `customer_orders.customer_id` is required.
- `customer_invoices.order_id` is nullable.
- `customer_shipments.order_id` is required.
- `customer_installations.order_id` is required.
- `customers.sales_rep_id` already exists.
- Order currently has no first-class salesperson field.
- Order `created_by` is audit identity, not salesperson.
- There is currently no first-class customer payment transaction ledger; invoices summarize `paid_amount`.
- Existing Order revision history must stay distinct from future Project Change Orders.

## Sales Rep rule

```text
customers.sales_rep_id
  = Customer/account default salesperson

customer_projects.sales_rep_id
  = authoritative salesperson for that Project/Job
```

Project creation may prefill the Customer salesperson, but later Customer salesperson changes must not rewrite historical Project ownership.

---

# 5. Project Core Domain

## 5.1 Project is the business container

A Customer may have multiple Projects; a Project may have multiple Orders.

```text
Paul Davis
  ├── Cruz Job
  │    ├── Order #1
  │    └── Order #2
  ├── Bowen Job
  └── Rawat Island
```

## 5.2 Quote is not a foundation blocker

A Project can exist before an Order. Quote/proposal versioning may be added later without changing Project ownership.

## 5.3 Existing Order stays canonical

Do not replace `customer_orders`.

Foundation relationship:

```text
customer_orders.project_id uuid null -> customer_projects.id
```

## 5.4 Order Revision ≠ Project Change Order

- `customer_order_revisions` = revision/audit history of a specific Order.
- Project Change Order = later post-sale scope/value adjustment.

These remain separate domains.

## 5.5 Status dimensions stay separate

Project lifecycle candidate:

```text
DRAFT
QUOTED
APPROVED
ORDERED
IN_PROGRESS
COMPLETED
CANCELLED
```

Payment, delivery and installation statuses are separate derived/operational dimensions and must not be collapsed into one status field.

---

# 6. Target Project Tables

Exact SQL must follow current Modulex migration/RLS conventions.

## `customer_projects`

```text
id uuid pk
project_number text unique
customer_id uuid not null -> customers.id
name text not null
status text not null
sales_rep_id uuid null -> profiles.id
project_address_id uuid null -> customer_addresses.id where appropriate
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

Requirements:

- DB-authoritative Project number generation.
- Customer/project mismatch fails closed.
- Historical address snapshot semantics preserved.
- Referenced/historical Projects are not physically deleted by default.

## `customer_project_status_history`

Append-safe lifecycle history.

## `customer_project_participants`

Deferred until after the mergeable foundation unless needed by the accepted Project UI.

Future roles include:

- SALES_REP
- DESIGNER
- CONTRACTOR
- INSTALLER
- REFERRAL_PARTNER

`customer_projects.sales_rep_id` remains the reporting/filtering source of truth for the Project salesperson.

---

# 7. Work Packages

## PB-0 — Git Isolation & Baseline

- [x] Verify current `main` before branching.
- [x] Confirm `project-base` did not already exist.
- [x] Create Git branch `project-base`.
- [x] Review repo-wide `AGENTS.md`.
- [x] Review Admin and Store roadmaps.
- [x] Inspect production Project-relevant schema.
- [x] Add Project Base tracker.
- [x] Open long-lived draft PR #267.
- [x] Sync Stone vendor work from newer `main` into `project-base` without changing `main` from Project work.
- [x] Decide Supabase rollout strategy: **production Supabase, additive/backward-compatible migrations**.
- [x] Cancel separate Supabase branch/project plan.

**PB-0 status: COMPLETE.**

---

## PB-1 — Mergeable Project Foundation `[~]`

### A. DB foundation

- [ ] Create Project DB contract tests first.
- [ ] Add `customer_projects` migration.
- [ ] Add `customer_project_status_history` if lifecycle history is required for first merge.
- [ ] Add indexes for customer/status/sales-rep/date filtering.
- [ ] Add RLS/grants using current Admin authorization conventions.
- [ ] Add DB-authoritative Project number generation.
- [ ] Add Project create/update/status/list/detail RPC/server contracts.
- [ ] Add nullable `customer_orders.project_id` FK.
- [ ] Enforce Order Customer = Project Customer when Project is present.
- [ ] Do not backfill legacy Orders.
- [ ] Apply reviewed additive migration to production Supabase.
- [ ] Verify existing Orders with `project_id = null` still work.
- [ ] Run Security Advisor.
- [ ] Run Performance Advisor.

### B. Admin Project UI

- [x] Read `modulex-admin/docs/ADMIN_UI_GUIDE.md`.
- [ ] Read `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md` before form/mutation work.
- [ ] Define Project RBAC mapping.
- [ ] Add `/projects` navigation and route.
- [ ] Add Project list with server-side search/filter/pagination.
- [ ] Filters: Project #, Customer, Sales Rep, Status, date.
- [ ] Add Project create flow.
- [ ] Prefill Customer salesperson when present; persist Project salesperson independently.
- [ ] Add `/projects/[id]` detail shell.
- [ ] Initial foundation tabs/sections: Overview, Orders, Activity.
- [ ] Show future Financials/Payments/Delivery/Installation/People surfaces only when they have truthful data; do not fake completed features.
- [ ] Implement loading/empty/populated/error/retry/permission-denied states.

### C. Order integration

- [ ] Allow Order creation from Project context.
- [ ] Persist `project_id` server-side.
- [ ] Show Project on Order detail when present.
- [ ] Show child Orders on Project detail.
- [ ] Preserve standalone Order creation.
- [ ] Preserve pricing snapshots, countertop behavior, reservations, revisions and fulfillment contracts.
- [ ] Add regressions for Order with Project and Order without Project.

### D. Foundation verification

- [ ] Project contract tests pass.
- [ ] Existing Order domain/lifecycle/pricing/countertop tests pass.
- [ ] Admin UI strict gate passes for changed files.
- [ ] RBAC smoke passes.
- [ ] TypeScript passes.
- [ ] Lint passes.
- [ ] Production build passes.
- [ ] Vercel Preview is available for `project-base` runtime changes.
- [ ] Signed-in Preview acceptance: create Project → create/link Order → see Order in Project.
- [ ] Production DB acceptance confirms nullable legacy path still works.
- [ ] Store/Customer Portal/Dealer Portal regression confirms no accidental Project/internal exposure.

**PB-1 done when:** Project is a real production DB entity, Admin can create/manage it, existing Orders can optionally belong to it, and legacy standalone Orders remain backward compatible.

### PB-1 merge decision

Once PB-1 is fully verified, **`project-base` can be merged into `main`**. The following packages are explicitly not required for that merge.

---

## PB-2 — Project Financial Rollup — post-foundation upgrade

- [ ] Roll up sales from canonical Orders/Invoices.
- [ ] Roll up cost from canonical profitability/cost contracts.
- [ ] Category mapping: Cabinet / Countertop / Sink / Labor / Material / Other.
- [ ] Calculate Total Cost, Total Sales, Gross Profit, Gross Margin %, Markup %, Invoiced, Paid, Balance.
- [ ] Never use spreadsheet `Sold / Cost` as Gross Margin.
- [ ] Add Project Financial Summary UI.
- [ ] Prevent internal finance leakage to Store/Portal.

---

## PB-3 — Customer Payment Ledger — post-foundation upgrade

Payment plan and actual payment transaction are separate concepts.

Future minimum model:

```text
Project
  └── Payment Requirement / Installment
       └── Payment Allocations
            └── Actual Payment Transactions
```

Requirements:

- partial payment,
- multiple transactions against one requirement,
- one transaction allocated across multiple requirements,
- pending / partially paid / paid derived status,
- reversal/refund/void without destructive history edits.

---

## PB-4 — Finance Outgoing Payments / Project Expenses — post-foundation upgrade

Finance remains the owner of outgoing money movements.

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

Project Expense view must be a filtered view of Finance truth, not a second duplicate ledger.

Cost and cash payment remain separate concepts; do not double-count cost when vendor bills are paid.

---

## PB-5 — Delivery & Installation Rollup — post-foundation upgrade

- [ ] Derive Project delivery state from child Orders/Shipments.
- [ ] Derive Project installation state from child Orders/Installations.
- [ ] Support multiple deliveries/installations.
- [ ] Preserve existing fulfillment lifecycle ownership.
- [ ] Model Customer Pickup separately where needed by existing `fulfillment_type` semantics.

---

## PB-6 — Participants & Commission Ledger — post-foundation upgrade

Participants:

- Designer
- Contractor
- Installer
- Referral Partner

Commission must support adjustments/offsets rather than one editable amount field.

Future commission ledger should support fixed/percentage, category, earned/approved/paid states, and correction/offset entries.

---

## PB-7 — Change Orders — post-foundation upgrade

Support post-sale scope changes such as:

- added cabinets,
- island revision,
- added vanity/master bath,
- removed item,
- customer credit,
- vendor credit,
- price adjustment.

Important rule:

- customer/sell impact and vendor/cost impact are separate,
- original approved commercial history is not destructively rewritten,
- Order revisions remain separate from Project Change Orders.

---

## PB-8 — Portal Project Projection — later upgrade

Only after Admin/DB Project truth is stable:

- narrow sanitized Project projection,
- customer/dealer isolation,
- no internal cost/margin/commission/vendor/audit leakage,
- Project → Orders / Shipments / Installations navigation.

Update `modulex-store/STORE_ROADMAP.md` in the same package.

---

## PB-9 — Historical Excel Import — last

Because current production business data is not the migration driver, historical import is not a foundation blocker.

When later required:

- stage first,
- preserve source file/row provenance,
- match Customer separately from Project,
- map salesperson to Project,
- never trust spreadsheet `Profit Margin` as canonical margin,
- flag ambiguous mixed note/status rows for review,
- reconcile totals before production write.

---

# 8. Financial Semantics Already Approved

```text
Gross Profit = Sales - Cost
Gross Margin % = Gross Profit / Sales
Markup % = Gross Profit / Cost
```

Project completion and financial closure are different states.

Finance future overview must read the same Project-linked finance truth used by Project screens:

- Expected Receivables
- Collected
- Remaining
- Overdue
- Expected Payables
- Paid Out
- Remaining Payables
- Cash In
- Cash Out
- Net Cash Flow

No duplicate Finance-vs-Project source of truth.

---

# 9. Foundation Acceptance Scenarios

PB-1 must prove at minimum:

1. Existing Order with `project_id = null` still works.
2. One Customer can have multiple Projects.
3. One Project can have multiple Orders.
4. Project salesperson can differ from Customer default.
5. Changing Customer salesperson does not rewrite Project salesperson.
6. Order Customer cannot conflict with Project Customer.
7. Project-created Order uses the existing commercial Order contract.
8. Order pricing/reservations/revisions remain unchanged.
9. Existing shipment/installation behavior still resolves from Order.
10. Store/Customer Portal/Dealer Portal are unchanged unless explicitly extended later.
11. Internal Project data is not exposed publicly.

---

# 10. Tracking Protocol

For every Project Base package:

1. Re-check latest `main` and parallel PRs.
2. Re-read this file before deciding next action.
3. Sync safe newer `main` work into `project-base` when necessary.
4. Mark active work `[~]`.
5. Record changed business decisions here immediately.
6. Mark `[x]` only after fresh verification evidence.
7. Update Current package / Current status / Next action.
8. Update `modulex-admin/ADMIN_ROADMAP.md` when Admin capability materially changes.
9. Update `modulex-store/STORE_ROADMAP.md` only when Store/Portal behavior materially changes.
10. DB migration acceptance and code merge acceptance are separate checks, even though PB-1 intentionally uses production Supabase.

---

# 11. Current Snapshot

As of 2026-09-03:

- Git branch: `project-base`.
- Draft PR: #267, open; do not auto-merge.
- Supabase strategy: **existing production project `bzjoeernnmvuhzyvbowc`**.
- Separate Supabase branch/project: **cancelled**.
- DB mutation so far from Project Base: **none before PB-1 implementation**.
- Current package: **PB-1 — Mergeable Project Foundation**.
- Merge target: **after Project CRUD + Project↔Order integration + backward compatibility/regression acceptance**.
- Finance, Payments, Change Orders, Participants, Commissions and portal Project navigation: **post-foundation upgrades**.
- Immediate next action: **write PB-1 DB/contract tests, inspect current Order/RBAC/migration conventions, then implement the additive Project migration and Admin foundation.**
