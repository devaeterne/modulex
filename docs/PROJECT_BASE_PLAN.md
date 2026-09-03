# Modulex Project Base — Implementation Plan

Last reviewed: 2026-09-03
Branch: `project-base`
Draft PR: `#267 — feat: establish project-base workstream`
Current package: **PB-1 — Project Core + Order Integration — CLOSEOUT**
Current status: **PB-1 implementation and runtime acceptance are complete on the accepted runtime SHA `e36126913a92acdf4d5c2783f12c29e87dff5030`. The additive Project foundation is live in the existing production Supabase, legacy standalone Orders remain supported, and PR #267 remains draft/open for user-owned merge after docs-only closeout CI.**
Next action: **Finish docs-only closeout verification, confirm PR #267 remains mergeable against execution-time `main`, then hand the PR to the project owner for merge. Do not start PB-2 until the PB-1 merge and production Admin deployment are confirmed.**

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

## PB-1 — Mergeable Project Foundation `[x]`

### A. DB foundation

- [x] Add Project foundation contract coverage before/with implementation.
- [x] Add `customer_projects` production contract.
- [x] Add `customer_project_status_history` lifecycle history.
- [x] Add covering indexes for customer/status/sales-rep/date/FK access paths.
- [x] Add RLS/grants using current Admin authorization conventions.
- [x] Add DB-authoritative Project number generation.
- [x] Add Project create/update/status/list/detail RPC/server contracts.
- [x] Add nullable `customer_orders.project_id` FK.
- [x] Enforce Order Customer = Project Customer when Project is present.
- [x] Preserve legacy Orders without automatic backfill.
- [x] Apply reviewed additive Project migrations to production Supabase.
- [x] Verify existing Orders with `project_id = null` still work.
- [x] Run Security Advisor; no Project-specific blocking finding.
- [x] Run Performance Advisor; no Project-specific blocking finding. New Project indexes may report unused-index `INFO` until production traffic exercises them.

Production migration history at PB-1 closeout:

- `20260902232013_project_base_core`
- `20260902232311_project_base_order_assignment`
- `20260902234109_project_base_fk_covering_indexes`

Read-only closeout introspection confirms Project tables have RLS enabled, public Project RPCs are authenticated-executable and anon-denied, `customer_orders.project_id` remains nullable, 16 standalone Orders still have `project_id = null`, and 3 Orders are Project-linked. No business-data mutation was performed during closeout.

### B. Admin Project UI

- [x] Read `modulex-admin/docs/ADMIN_UI_GUIDE.md`.
- [x] Read `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md` before form/mutation closeout.
- [x] Define Project RBAC mapping with `projects.view` / `projects.manage`.
- [x] Add `/projects` navigation and route.
- [x] Add Project list with server-side search/filter/pagination.
- [x] Search covers Project # / customer / Project name; filters cover Customer, Sales Rep and Status. The stale pre-implementation date-filter requirement is removed from PB-1 because it was not part of the accepted foundation UI.
- [x] Add Project create flow.
- [x] Prefill Customer salesperson when present; persist Project salesperson independently.
- [x] Add `/projects/[id]` detail shell.
- [x] Initial foundation sections: Overview, Orders, Project Progress and dedicated Activity.
- [x] Keep future financial/delivery/install capabilities truthful: PB-1 Project Progress is read-only derived summary and Commercial is count/status only; authoritative rollups remain PB-2/PB-3/PB-5.
- [x] Implement explicit loading/empty/populated/error/retry/permission-aware states.

### C. Order integration

- [x] Allow Order creation from Project context.
- [x] Persist `project_id` server-side.
- [x] Show Project on Order detail when present.
- [x] Show child Orders on Project detail.
- [x] Preserve standalone Order creation.
- [x] Preserve pricing snapshots, countertop behavior, reservations, revisions and fulfillment contracts.
- [x] Add regressions for Order with Project and Order without Project.
- [x] Exclude cancelled Orders from normal Order `All` results, Project Detail active Orders/count, Project Progress calculations and Link Existing Order choices; retain explicit `Cancelled` filtering.

### D. Foundation verification

- [x] Project contract tests pass — Admin Project Base #71.
- [x] Existing Order domain/lifecycle/pricing/countertop regressions pass — Admin A1 Core Operations #594 and Admin Customers UI #301 remain green on the accepted runtime SHA.
- [x] Admin UI strict gate passes — Admin UI Foundation #977.
- [x] RBAC smoke passes — Admin UI Foundation #977.
- [x] TypeScript passes — Admin UI Foundation #977.
- [x] Lint passes — Admin UI Foundation #977.
- [x] Production build passes — Admin UI Foundation #977.
- [x] Vercel Preview is available for runtime acceptance: deployment `dpl_CfyHrv5kboYLAiPckd1HZg7Bz2dp` is `READY` on exact runtime SHA `e36126913a92acdf4d5c2783f12c29e87dff5030`.
- [x] Signed-in Preview acceptance completed by the project owner for the final Project Detail / Project Progress presentation and Project↔Order workflow.
- [x] Production DB acceptance confirms the nullable legacy path and Project-linked path coexist.
- [x] Store/Customer Portal/Dealer Portal regression confirms no accidental Project/internal projection exposure.
- [x] Project Progress acceptance is locked as a **full-width compact overview** with horizontal lifecycle badge flow (`Draft → Quoted → Approved → Ordered → In Progress → Completed`, `Done / Current / Pending`), responsive Orders / Delivery / Installation / Commercial blocks, cancelled-Order exclusion, and a separate actor-aware `Activity` card as the official Project lifecycle/audit timeline.

**PB-1 done:** Project is a real production DB entity, Admin can create/manage it, existing Orders can optionally belong to it, Project Customer is authoritative for Project-context Orders, and legacy standalone Orders remain backward compatible.

### PB-1 merge decision

PB-1 is functionally accepted. PR #267 remains draft/open and must be merged by the project owner only after the docs-only closeout commit is green and GitHub still reports the PR mergeable against execution-time `main`.

The following packages are explicitly not required for that merge.

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

All PB-1 foundation scenarios are accepted by the runtime/DB/CI evidence recorded above. No PB-2/PB-3/PB-5 authoritative rollup is implied by this acceptance.

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
- Draft PR: #267, open; **do not auto-merge**. The project owner performs the merge.
- Accepted runtime SHA: `e36126913a92acdf4d5c2783f12c29e87dff5030`.
- Accepted Vercel Admin Preview: `dpl_CfyHrv5kboYLAiPckd1HZg7Bz2dp`, `READY`, exact runtime SHA above.
- Execution-time `main` observed during closeout: `0c5e3feec4f213002b7268b70d6d483e789acefb`; the accepted runtime branch was 2 commits behind but PR #267 was mergeable before docs-only closeout. Re-check this gate after the closeout commit.
- Supabase strategy: **existing production project `bzjoeernnmvuhzyvbowc`**.
- Separate Supabase branch/project: **cancelled**.
- Production Project foundation migrations are applied: `project_base_core`, `project_base_order_assignment`, `project_base_fk_covering_indexes`.
- Project tables/RPC/FK/RLS/grants are present; `customer_orders.project_id` is nullable; Project/customer assignment fails closed on mismatch.
- Fresh closeout Security/Performance Advisor review shows **no Project-specific blocking finding**. Project unused-index notices are informational, not a reason to remove the new covering/filter indexes during PB-1 closeout.
- Business-data mutation during PB-1 closeout: **none**; verification used repository/runtime metadata and read-only production introspection.
- Current package: **PB-1 — Mergeable Project Foundation — functionally accepted, docs/PR closeout in progress**.
- Store public/Customer Portal/Dealer Portal Project projection: **unchanged**; `modulex-store/STORE_ROADMAP.md` is intentionally untouched for PB-1 closeout.
- Finance, Payments, Change Orders, Participants, Commissions and authoritative Project delivery/install rollups remain **post-foundation upgrades**.
- Immediate next action: **finish docs-only CI + PR mergeability verification, report `PB-1 merge-ready`, then wait for the project owner to merge and production-deploy PB-1 before any PB-2 implementation.**
