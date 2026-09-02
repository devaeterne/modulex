# Modulex Project Base — Implementation Plan

Last reviewed: 2026-09-03
Branch: `project-base`
Current main baseline: `d1e272b4cc239bee4ba3f1ece0c0b9c1618b8248`
Current Project branch head before this tracker update: `d0c9bfc9cdffa6636f58ab8c47dc8b890d3a4b12`
Draft PR: `#267 — feat: establish project-base workstream`
Current package: **PB-0 — Isolation & Project foundation planning**
Current status: **Git isolation is ready and synced with current main. Production Supabase has only been inspected read-only. Supabase `project-base` branch is pending the platform-required branch cost confirmation.**
Next action: **Create the isolated Supabase `project-base` branch, verify Preview credentials, then start PB-1 Project Core with additive migrations only.**

This file is the operational source of truth for the `project-base` workstream. When the project owner asks **“project-base’de şu an neredeyiz?”**, read this file first and report the current package, completed items, blockers, and next action.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Blocked

---

# 1. Goal

Introduce **Project / Job** as the business-level parent for customer work without replacing or breaking the existing Orders, Invoices, Shipments, Installations, pricing contracts, Customer/Dealer Portal projections, or production data.

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

The 2023–2026 cabinet sales workbooks are evidence of the desired **project-level operational and financial workflow**. They are not a database schema to copy literally.

---

# 2. Non-Negotiable Rollout Rules

1. Production `main` is not modified directly by Project work.
2. Production Supabase is not used as the Project development sandbox.
3. Project schema rollout is additive first:
   - new tables,
   - new indexes,
   - new RLS/RPC contracts,
   - nullable foreign keys only where required.
4. Do not drop, rename, repurpose, or tighten existing Order columns during the foundation rollout.
5. Existing Orders with no Project remain valid.
6. `project_id` stays nullable until legacy/backfill acceptance is explicitly complete.
7. Store / Customer Portal / Dealer Portal must not receive Project data automatically.
8. Internal cost, margin, commissions, internal notes, vendor data, and audit metadata must never leak to public/portal projections.
9. Do not weaken RLS, grants, RPC authorization, idempotency, or audit semantics.
10. Schema/RPC packages require Supabase Security + Performance Advisor review before completion.
11. Every meaningful package updates this tracker in the same branch/PR.

---

# 3. Current Production Truth — Verified Baseline

Production Supabase was inspected read-only before implementation.

Existing operational tables relevant to this work include:

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

Important verified facts:

- `customer_orders.customer_id` is required.
- `customer_invoices.order_id` is nullable.
- `customer_shipments.order_id` is required.
- `customer_installations.order_id` is required.
- `customers.sales_rep_id` already exists.
- There is currently no first-class payment transaction ledger table; invoice payment is summarized with fields such as `paid_amount`.
- Order revision history already exists and must not be replaced by Project change-order semantics.

## Sales Rep decision

```text
customers.sales_rep_id
  = account/default salesperson

customer_projects.sales_rep_id
  = authoritative salesperson for that specific project/job
```

When creating a Project, Admin may prefill the Customer salesperson. Afterwards, changing the Customer salesperson must not silently rewrite historical Projects.

---

# 4. Core Domain Decisions

## 4.1 Project is the primary business container

A Customer may have many Projects and a Project may have many Orders.

Example:

```text
Paul Davis
  ├── Cruz Job
  ├── Bowen Job
  └── Rawat Island
```

This replaces spreadsheet naming tricks such as customer-name suffixes with structured relationships.

## 4.2 Quote is not required for Project foundation

Do not block Project foundation on a Quote table.

A Project may exist before an Order. If later operations require proposal versions, approvals, expirations, or customer-facing quote PDFs, Quote can be introduced as a child domain without changing Project foundation.

## 4.3 Existing Order remains the commercial transaction object

Do not replace `customer_orders`.

Initial relationship target:

```text
customer_orders.project_id uuid null
```

Legacy Orders continue to work with `project_id = null`.

## 4.4 Order revisions and Project Change Orders are different

- `customer_order_revisions` = revision/audit history of a specific Order.
- Project Change Order = approved post-sale scope/value change for a Project.

Do not overload the current revision table for Project change orders.

## 4.5 Status dimensions stay separate

Do not reproduce the spreadsheet’s mixed single status/note field.

Project lifecycle target:

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

Final DB enums/checks must align with existing Modulex conventions before migration.

## 4.6 Financial semantics

Never use `Sold / Cost` as Profit Margin.

Canonical formulas:

```text
Gross Profit = Sales - Cost
Gross Margin % = Gross Profit / Sales
Markup % = Gross Profit / Cost
Balance = Receivable - Payments Applied
```

Prefer derived values. Store snapshots only where historical/audit requirements require them.

---

# 5. Target Project Core

Exact SQL is PB-1 work. Approved target shape:

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

- Project number generation is DB-authoritative and idempotent.
- Customer/project mismatch must fail closed.
- Project address preserves historical snapshot semantics.
- Referenced/historical Projects are not physically deleted by default.

## `customer_project_status_history`

Append-safe lifecycle transition history.

## `customer_project_participants`

Roles beyond the authoritative salesperson:

- SALES_REP
- DESIGNER
- CONTRACTOR
- INSTALLER
- REFERRAL_PARTNER

`customer_projects.sales_rep_id` remains the reporting/filtering source of truth for the Project salesperson.

---

# 6. Work Packages

## PB-0 — Isolation & Baseline

- [x] Verify current `main` before branching.
- [x] Confirm `project-base` did not already exist.
- [x] Create Git branch `project-base`.
- [x] Review repo-wide `AGENTS.md`.
- [x] Review current Admin roadmap.
- [x] Review current Store roadmap.
- [x] Inspect production Supabase read-only for Project-relevant operational tables.
- [x] Add this operational tracking document.
- [x] Open long-lived draft PR #267 against `main`.
- [x] Sync newer `main` work into `project-base` after Stone vendor PR #266 merged; sync PR #268 was merged only into `project-base`.
- [!] Create Supabase `project-base` branch.
  - Blocker: Supabase branch creation requires cost lookup + explicit cost confirmation before the connected tool permits creation.
  - Production Supabase remains unchanged.
- [ ] Record Supabase branch project ref here after creation.
- [ ] Verify Preview environment uses the Supabase branch credentials, not production credentials.
- [ ] Verify Vercel Preview deployment after the first `modulex-admin` runtime change.
  - Current PR changes only `docs/`; the Admin Vercel project root is `modulex-admin`, so the docs-only commit does not currently produce a Project preview deployment.

**PB-0 done when:** Git + Supabase isolation are verified and Preview can run without writing Project test data to production.

---

## PB-1 — Project Core DB Foundation

- [ ] Add `customer_projects` migration.
- [ ] Add `customer_project_status_history` migration.
- [ ] Add indexes for customer/status/sales-rep/date filtering.
- [ ] Add RLS and grants using existing Admin authorization conventions.
- [ ] Add create/update/status-transition RPC/server contracts.
- [ ] Add DB-authoritative project-number generation.
- [ ] Add nullable `customer_orders.project_id` FK.
- [ ] Do not backfill legacy Orders yet.
- [ ] Enforce Order customer = Project customer when `project_id` is present.
- [ ] Verify existing Orders with `project_id = null` remain unchanged.
- [ ] Verify Store/portal projections are unchanged.
- [ ] Add DB/contract tests.
- [ ] Run Security Advisor.
- [ ] Run Performance Advisor.

**PB-1 done when:** Project rows can safely exist and optionally own new Orders while existing Order contracts remain backward compatible.

---

## PB-2 — Admin Project List / Create / Detail Shell

- [ ] Read `modulex-admin/docs/ADMIN_UI_GUIDE.md`.
- [ ] Read `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md`.
- [ ] Define Project RBAC permission mapping.
- [ ] Add `/projects` route/navigation.
- [ ] Add server-side pagination/search/filtering.
- [ ] Filters: Project #, Customer, Sales Rep, Status, date.
- [ ] Add Project create flow.
- [ ] Prefill Customer salesperson where present; persist independently on Project.
- [ ] Add `/projects/[id]` shell.
- [ ] Initial sections:
  - Overview
  - Orders
  - Financials
  - Payments
  - Delivery
  - Installation
  - People
  - Activity
- [ ] Implement loading/empty/populated/error/retry/permission-denied states.
- [ ] Run strict Admin UI, RBAC, typecheck, lint, build and relevant smoke gates.

**PB-2 done when:** A Project can be created and managed in Preview using existing shared Admin UI patterns.

---

## PB-3 — Orders ↔ Project Integration

- [ ] Allow Order creation from Project context.
- [ ] Project-created Order receives `project_id` server-side.
- [ ] Prevent Customer/Project mismatch at DB/RPC boundary.
- [ ] Show Project on Order detail where present.
- [ ] Show child Orders on Project detail.
- [ ] Keep standalone legacy Order creation working.
- [ ] Preserve Order idempotency, pricing snapshots, reservations, revision history and fulfillment rules.
- [ ] Add regressions for Orders with and without Projects.

**PB-3 done when:** New Project jobs can contain multiple Orders without changing legacy Order behavior.

---

## PB-4 — Project Financial Rollup

Use existing Modulex commercial truth before creating parallel financial values.

- [ ] Define Project sales rollup from Orders/Invoices.
- [ ] Define Project cost rollup from approved profitability/cost snapshot contracts.
- [ ] Define Cabinet / Countertop / Sink / Labor / Material / Other category mapping from canonical Product Type/domain data.
- [ ] Calculate:
  - Total Cost
  - Total Sales
  - Gross Profit
  - Gross Margin %
  - Markup %
  - Invoiced
  - Paid
  - Balance
- [ ] Decide whether manual/non-product adjustments are genuinely required before adding another table.
- [ ] Add Project financial summary UI.
- [ ] Verify no cost/margin leakage to Store/portal APIs.

**PB-4 done when:** Project financials reconcile to underlying Modulex records rather than spreadsheet formulas/manual totals.

---

## PB-5 — Payment Ledger

Production currently has no first-class payment transaction ledger.

- [ ] Design additive `customer_payments` ledger.
- [ ] Link payment to Customer + Project, with optional Invoice/Order allocation where required.
- [ ] Support deposit / progress / delivery / final payment patterns through transactions, not special-case columns.
- [ ] Record amount, currency, payment method, received date, reference, notes, actor and audit timestamps.
- [ ] Define reversal/void semantics; avoid destructive delete.
- [ ] Preserve compatibility with `customer_invoices.paid_amount` until migration strategy is accepted.
- [ ] Derive Project paid/balance from ledger truth.
- [ ] Add Project Payments UI.

**PB-5 done when:** Partial payments and balances are transaction-backed and auditable.

---

## PB-6 — Delivery & Installation Rollup

Existing shipments/installations remain authoritative child operational objects.

- [ ] Derive Project delivery state from child Orders/Shipments.
- [ ] Derive Project installation state from child Orders/Installations.
- [ ] Show upcoming shipment/install dates.
- [ ] Support multiple deliveries/installations across multiple Orders.
- [ ] Keep existing fulfillment lifecycle contracts unchanged.

**PB-6 done when:** Project displays truthful fulfillment progress without duplicating shipment/installation state.

---

## PB-7 — Participants & Commissions

- [ ] Implement Project participants after Project core stabilizes.
- [ ] Support Designer / Contractor / Installer / Referral Partner.
- [ ] Define internal profile vs external participant identity.
- [ ] Add structured Project commission records.
- [ ] Commission category examples: Cabinet / Countertop / Project Total / Other.
- [ ] Commission type: fixed / percentage.
- [ ] Track earned / approved / paid status and timestamps.

**PB-7 done when:** Spreadsheet-style person/commission notes are queryable and auditable.

---

## PB-8 — Change Orders

- [ ] Define Project Change Order lifecycle and approval semantics.
- [ ] Keep `customer_order_revisions` as Order revision history.
- [ ] Support additions such as island revision, added cabinets, master bath, extra scope.
- [ ] Track cost/sales delta and approval history.
- [ ] Approved deltas roll into Project financials.
- [ ] Decide explicitly whether a Change Order creates a new child Order, revises an existing Order, or supports both through typed behavior.

**PB-8 done when:** Post-sale scope changes are first-class and financially/audit traceable.

---

## PB-9 — Customer / Dealer Portal Project Projection

Deferred until Admin/DB Project truth is stable.

- [ ] Design narrow sanitized Project projection.
- [ ] Customer can only see own Projects.
- [ ] Dealer can only see authorized Projects.
- [ ] Explicitly exclude internal cost, margin, markup, notes, commissions, vendor/internal inventory and audit metadata.
- [ ] Decide portal navigation: Projects → Orders / Shipments / Installations.
- [ ] Update `modulex-store/STORE_ROADMAP.md` in the same package.
- [ ] Run Customer + Dealer isolation regressions.

**PB-9 done when:** Portal users can navigate Project-level fulfillment without internal commercial leakage.

---

## PB-10 — Historical Excel Import

Do this last, after Project contracts are accepted.

- [ ] Build deterministic staging/import tooling for 2023–2026 Cabinet Sold workbooks.
- [ ] Never import workbook rows directly to production without staging/review.
- [ ] Match/create Customer separately from Project.
- [ ] Convert job/customer suffixes into Project names only when source evidence supports it.
- [ ] Map salesperson to Project `sales_rep_id`.
- [ ] Preserve source file/row provenance.
- [ ] Do not treat workbook `Profit Margin` as canonical margin.
- [ ] Split mixed status/note content only when the source supports the mapping.
- [ ] Flag ambiguous rows for human review rather than inventing facts.
- [ ] Reconcile aggregate totals before production import.

**PB-10 done when:** Historical Project data is staged, traceable and reconciled before production write.

---

# 7. Preview / Production Rollout

```text
Git main
   │
   └── project-base
          │
          ├── Vercel Preview
          │       │
          │       └── Supabase project-base branch
          │
          └── Draft PR #267
                    │
                    ├── package acceptance
                    └── reviewed merge to main
                              │
                              └── reviewed production migration/deploy
```

Rules:

- Preview must never use production service-role credentials.
- Supabase branch data is disposable test data; production business rows are not assumed to be copied.
- Seed only representative Project test data.
- Migrations remain version-controlled even when first tested on Preview.
- Production migration happens only after review/acceptance and explicit rollout.
- After production DDL: run advisors plus affected Admin/Store regressions.

---

# 8. Foundation Acceptance Scenarios

At minimum Project foundation must prove:

1. Existing legacy Order with `project_id = null` still works as before.
2. One Customer can have multiple Projects.
3. One Project can have multiple Orders.
4. Project salesperson can differ from Customer default without rewriting Customer history.
5. Project Customer and Order Customer cannot conflict.
6. Project financial rollup cannot include another Customer’s data.
7. Multiple Shipments/Installations across child Orders roll up correctly.
8. Partial payments produce correct paid/balance values after PB-5.
9. Internal cost/margin/commission fields are unavailable to public/portal consumers.
10. Project, payment, delivery and installation statuses remain separate.
11. Existing Customer/Dealer Portal Order projections remain stable until PB-9 explicitly changes them.

---

# 9. Tracking Protocol

For every future `project-base` package:

1. Re-check latest `main` and open parallel work.
2. Re-read this file before deciding the next action.
3. Sync current `main` into `project-base` when needed after checking migration conflicts.
4. Mark active package `[~]`.
5. Record design decisions that change this plan before or with implementation.
6. Mark `[x]` only after stated verification passes.
7. Update:
   - Last reviewed
   - Current main baseline
   - Current package
   - Current status
   - Next action
   - package checkboxes
   - blockers/decisions
8. Update `modulex-admin/ADMIN_ROADMAP.md` when Admin capability materially changes.
9. Update `modulex-store/STORE_ROADMAP.md` when Store/Portal capability materially changes.
10. Preview acceptance and production rollout are separate gates.

---

# 10. Current Snapshot

As of 2026-09-03:

- Git `project-base`: **created and synced with current main**.
- Draft Project PR: **#267 open; do not merge automatically**.
- Current main baseline incorporated: `d1e272b4cc239bee4ba3f1ece0c0b9c1618b8248`.
- Production Supabase: **read-only inspection only; no Project schema/data mutation**.
- Supabase development branches currently present before Project setup: **none**.
- Supabase `project-base`: **blocked only on required branch cost confirmation**.
- Vercel Admin project root: `modulex-admin`.
- Project PR currently changes docs only; therefore no dedicated Project Preview deployment is expected until the first Admin runtime change lands on this branch.
- Implementation: **PB-1 not started**.
- Recommended next package: **finish PB-0 Supabase isolation, then PB-1 Project Core DB Foundation**.
