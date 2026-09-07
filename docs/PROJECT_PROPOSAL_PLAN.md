# Project Proposal / Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Project-owned Proposal / Estimate domain to Modulex that can represent room/area-based commercial scope, flexible optional details, grouped pricing, revisions, customer acceptance, PDF output, and later explicit conversion into canonical Orders without duplicating Order, Finance, Procurement, Fulfillment, Change Order, Calendar, or document-storage truth.

**Architecture:** `customer_projects` remains the business parent. Proposal is a separate commercial-scope domain under Project and before Order. Proposal Areas use an admin-configurable Area Type plus a required free-text Area Name, while all other scope fields are optional and structured where they need to be searchable/reportable. An accepted Proposal Revision becomes an immutable commercial baseline; subsequent scope/price changes use the existing Project Change Order domain instead of rewriting the accepted Proposal.

**Tech Stack:** Next.js / React Admin UI, TypeScript, Supabase Postgres/RPC/RLS, existing Modulex shared Admin primitives, canonical Supabase migration mirror, existing Project/Order/Change Order domains.

**Spec:** `docs/PROJECT_PROPOSAL_PLAN.md` — this file is both the design lock and the execution tracker.

## Global Constraints

- Always rebase/re-align each implementation package from execution-time current `main`; parallel Modulex work is common.
- Do not replace or duplicate canonical `customer_projects`, `customer_orders`, Order lifecycle/pricing, Finance, Procurement, Fulfillment, Calendar, Change Orders, or document/storage ownership.
- Do not create a second customer/job hierarchy. Proposal belongs to an existing `customer_project`.
- Proposal commercial lifecycle, Project lifecycle, and Area readiness state are separate concepts.
- Accepted Proposal revisions are immutable; post-acceptance commercial changes flow through Project Change Orders.
- Area types are configurable suggestions, not hard-coded room enums. Area Name remains free text and required.
- Optional Proposal fields must stay nullable. Empty numeric inputs must remain `NULL`, never implicit `0` or `NaN`.
- Core searchable/reportable fields are columns, not a single catch-all JSON document. A small extension JSON field may be added only for genuinely non-core attributes after review.
- Proposal sell totals are derived at the DB/RPC boundary. Browser floating-point math is presentation-only.
- Grouped pricing is first-class: multiple Areas may belong to one Pricing Group with one sell amount. Never invent per-Area allocation when the source proposal only provides a grouped price.
- V1 contains sell-side Proposal pricing only. Product cost, vendor cost, margin, AP, payment, and Finance truth remain in their canonical domains.
- UI must reuse Modulex shared Admin controls (`ComponentCard`, `Label`, `Input`, `Select`, `TextArea`, `Button`, `Badge`, `Modal`, Admin tables) and pass `smoke:admin-ui-strict` plus normal Admin regression gates.
- New form/mutation behavior must follow `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md`: DB/RPC contract first, explicit normalization, duplicate-submit protection, end-to-end authorization, and clear loading/empty/error/permission states.
- Schema/RPC/grant/RLS changes require Security/Performance Advisor review and production migration only after owner merge unless the user explicitly requests otherwise.
- Do not broaden Store/Customer Portal/Dealer Portal exposure in the Proposal Core phases. Any later customer-facing proposal surface requires its own explicit package and contract.
- Current planning baseline: `main` at `aaba756e21ff15ad5290bf6b6c923a623113f39c` (2026-09-07). Open PR #361 is Calendar-specific; Proposal Core must not depend on or modify its Calendar range-query work.

---

## 1. Locked Product Decisions

### 1.1 Placement

Project Detail tab order target:

`Overview | Proposal | Orders | Finance | Participants & Commission | Change Orders | Procurement | Fulfillment | Calendar | Documents | Activity`

V1 does **not** add a top-level `/proposals` Admin module. A global proposal pipeline may be added later only if sales-volume workflow justifies it.

### 1.2 Area UX

Each Proposal Revision contains zero or more Areas. `+ Add Area` opens a modal/drawer-style editor composed from shared Modulex primitives.

Minimum valid Area:

- `area_name` — required free text.

Optional Area classification:

- `area_type_id` — optional FK to a configurable Area Type.

Recommended seed Area Types:

- Kitchen
- Kitchen Island
- Bathroom
- Master Bathroom
- Powder Room
- Laundry
- Wet Bar
- Bar
- Pantry
- Fireplace
- Outdoor Kitchen
- Pool House
- Garage
- Basement
- Office
- Other

These values are seed data only. They are not a hard-coded enum and may be renamed/deactivated/extended by Admin users.

Example valid combinations:

- Type `Kitchen`, Name `Kitchen Perimeter`
- Type `Kitchen`, Name `Kitchen Island #1`
- Type `Bar`, Name `Basement Bar`
- Type `Other`, Name `Pet Feeding Area`
- No type selected, Name `Custom Fabrication Area`

### 1.3 Optional structured Area fields

V1 data model should support the following nullable fields without forcing a customer/job to use them:

- readiness status
- readiness/status note
- material product reference
- material description snapshot/custom description
- supplier/vendor text snapshot only when needed for the commercial document; this is not Procurement ownership
- finish
- thickness
- square feet
- linear feet
- edge profile
- edge linear feet
- sink quantity
- sink source/type note
- sink cutout quantity
- sink template status
- backsplash value/type
- backsplash notes
- scope/fabrication notes — customer-facing capable
- measurement notes — operational detail
- internal notes — never rendered to customer PDF
- direct sell amount when the Area is not group-priced
- pricing group reference when multiple Areas share one commercial price
- sort order

### 1.4 Status separation

Project lifecycle remains canonical and unchanged:

`draft | quoted | approved | ordered | in_progress | completed | cancelled`

Proposal commercial lifecycle target:

`draft | sent | accepted | rejected | superseded`

Area readiness target for V1:

`not_ready | ready_to_measure | needs_remeasure | ready_to_cut`

Readiness may be `NULL`. Do not extend readiness into fabrication/install states until business workflow requires it; Fabrication/Fulfillment domains already exist and should not be duplicated casually.

### 1.5 Revision rule

- A draft Proposal may be edited.
- Sending a Proposal locks the exact Revision content that was sent.
- A new commercial edit after send creates a new Revision instead of mutating the sent Revision.
- Accepting a Revision makes that exact Revision the accepted baseline.
- Other previous sent/draft revisions become superseded as appropriate.
- Accepted Revision rows and their Areas/Pricing Groups cannot be edited or deleted.
- A later commercial change uses the existing Project Change Order domain.

### 1.6 Pricing rule

Proposal total is:

`SUM(un-grouped Area direct sell amounts) + SUM(each Pricing Group sell amount exactly once)`

Rules:

- An Area may have `direct_sell_amount` **or** `pricing_group_id`, not both.
- A Pricing Group may contain one or more Areas.
- Group price is not automatically allocated across member Areas.
- Currency is Proposal-level in V1; all Area/group sell amounts inherit it.
- Proposal total is derived server-side and returned as part of the read model.

### 1.7 Proposal → Order rule

Acceptance does not silently create an Order.

After acceptance, authorized users receive an explicit `Create Order from Proposal` workflow. It may select Areas and map them into one or more canonical Orders. Order remains authoritative for order items, selling lifecycle, fulfillment, invoicing, procurement requirements, reservations, and downstream operational truth.

### 1.8 PDF / document rule

Structured Proposal data is canonical; PDF is a rendered output.

Proposal PDF target sections:

- Modulex/company branding
- Proposal number and revision
- date / validity
- customer
- Project / job site
- Area-by-Area scope
- material/specification details when present
- grouped and direct pricing summary
- Proposal total
- terms
- customer acceptance/signature metadata

Accepted PDF must eventually be stored as an immutable Project document snapshot. The current Project `Documents` tab is still a pending-domain placeholder, so implementation must first map/reuse the canonical Modulex storage/document contract; Proposal must not invent a parallel document-storage system.

---

## 2. Proposed Database Contract

Names remain locked unless current production schema forces a collision.

### 2.1 `proposal_area_types`

Purpose: configurable reusable suggestions for Area classification.

Columns:

- `id uuid primary key`
- `name text not null`
- `normalized_key text not null unique`
- `is_active boolean not null default true`
- `sort_order integer not null default 0`
- standard created/updated audit metadata following current Modulex conventions

Behavior:

- Deactivation hides a type from new selection but historical Areas remain readable.
- Do not hard-delete a referenced Area Type.

### 2.2 `customer_project_proposals`

Purpose: stable commercial document identity under a Project.

Columns:

- `id uuid primary key`
- `project_id uuid not null references customer_projects(id)`
- `proposal_number text not null`
- `status text not null` with locked lifecycle values
- `currency_code text not null`
- `valid_until date null`
- `customer_message text null`
- `terms_text text null`
- `created_by uuid null`
- `updated_by uuid null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints/indexes:

- proposal number uniqueness follows existing business-number convention discovered at implementation time
- index `project_id`
- index `(project_id, status)` only if query plan/advisor evidence supports it

### 2.3 `customer_project_proposal_revisions`

Purpose: immutable sent/accepted commercial snapshots and editable draft revisions.

Columns:

- `id uuid primary key`
- `proposal_id uuid not null references customer_project_proposals(id)`
- `revision_no integer not null`
- `state text not null` — `draft | sent | accepted | rejected | superseded`
- `revision_note text null`
- `sent_at timestamptz null`
- `sent_by uuid null`
- `accepted_at timestamptz null`
- `accepted_by uuid null`
- `created_by uuid null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:

- unique `(proposal_id, revision_no)`
- at most one accepted Revision per Proposal
- non-draft revision content is mutation-locked by DB lifecycle guard

### 2.4 `customer_project_proposal_pricing_groups`

Purpose: represent one commercial sell amount shared by multiple Areas.

Columns:

- `id uuid primary key`
- `revision_id uuid not null references customer_project_proposal_revisions(id)`
- `label text not null`
- `description text null`
- `sell_amount numeric(...) not null`
- `sort_order integer not null default 0`
- audit metadata

Rules:

- amount cannot be negative unless a later explicit discount/credit design permits it
- mutation blocked when parent Revision is not draft

### 2.5 `customer_project_proposal_areas`

Purpose: dynamic room/area/scope rows for one Proposal Revision.

Columns:

- `id uuid primary key`
- `revision_id uuid not null references customer_project_proposal_revisions(id)`
- `area_type_id uuid null references proposal_area_types(id)`
- `area_name text not null`
- `readiness_status text null`
- `status_note text null`
- `material_product_id uuid null references products(id)` if current Product FK contract supports it
- `material_description text null`
- `supplier_snapshot text null`
- `finish text null`
- `thickness text null`
- `sq_ft numeric(...) null`
- `linear_ft numeric(...) null`
- `edge_profile text null`
- `edge_linear_ft numeric(...) null`
- `sink_quantity integer null`
- `sink_source text null`
- `sink_cutout_quantity integer null`
- `sink_template_status text null`
- `backsplash text null`
- `backsplash_notes text null`
- `scope_notes text null`
- `measurement_notes text null`
- `internal_notes text null`
- `pricing_group_id uuid null references customer_project_proposal_pricing_groups(id)`
- `direct_sell_amount numeric(...) null`
- `sort_order integer not null default 0`
- audit metadata

DB guards:

- `btrim(area_name) <> ''`
- nullable measurements stay nullable
- nonnegative numeric measurements/counts
- `direct_sell_amount` and `pricing_group_id` cannot both be set
- pricing group must belong to the same Revision
- mutation blocked when parent Revision is not draft

### 2.6 `customer_project_proposal_acceptances`

Purpose: append-safe acceptance evidence for an exact Revision.

Columns:

- `id uuid primary key`
- `revision_id uuid not null references customer_project_proposal_revisions(id)`
- `accepted_name text not null`
- `accepted_email text null`
- `accepted_at timestamptz not null`
- `acceptance_method text not null`
- `signature_text text null`
- `source_ip` only if current privacy/security architecture explicitly permits it; otherwise omit
- future canonical Project document reference after Documents contract mapping
- standard created metadata

Rules:

- append-safe; no browser hard-delete
- only one effective acceptance for a Revision
- acceptance transaction locks Revision and transitions Proposal commercial status atomically

---

## 3. Server / RPC Boundary

Target API surface; exact signatures are finalized against current DB conventions before migration is written.

Reads:

- `get_project_proposals(project_id)` — Proposal list + current/latest Revision summary.
- `get_project_proposal(proposal_id)` — Proposal header, Revisions, active/current Revision, Areas, Pricing Groups, derived total.
- `get_proposal_area_types(include_inactive boolean default false)` — configurable selector data.

Writes:

- `create_project_proposal(...)`
- `create_project_proposal_revision(proposal_id, revision_note)`
- `update_project_proposal_draft(...)`
- `upsert_project_proposal_area(...)`
- `delete_project_proposal_area(area_id)` — draft-only physical removal is acceptable before any send/audit boundary; otherwise fail closed.
- `upsert_project_proposal_pricing_group(...)`
- `delete_project_proposal_pricing_group(group_id)` — draft-only and only when no Areas reference it, or require explicit reassignment first.
- `send_project_proposal_revision(revision_id)`
- `reject_project_proposal_revision(revision_id, note)`
- `accept_project_proposal_revision(...)`

Mutation requirements:

- DB/RPC lifecycle guards are authoritative.
- All protected writes are role/permission checked at the authoritative boundary.
- Do not expose service-role credentials to browser code.
- Duplicate submit must not create duplicate Proposal/Revision/Acceptance records.
- Unknown lifecycle transitions fail closed.
- Commercial numbering/revision increment is concurrency-safe.

---

## 4. Admin UI Contract

### 4.1 Project Detail integration

Modify `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx` to insert `Proposal` before `Orders` and render a focused `ProjectProposalTab` component.

### 4.2 Proposed focused components

Create under `modulex-admin/src/components/customers/project-detail/`:

- `ProjectProposalTab.tsx` — orchestration, loading/error/empty/permission states, Proposal/revision summary.
- `ProjectProposalEditor.tsx` — Proposal header/terms/validity editing for draft Revision.
- `ProjectProposalAreaList.tsx` — ordered Area cards/table and add/edit actions.
- `ProjectProposalAreaModal.tsx` — dynamic optional Area editor using shared Modulex form controls.
- `ProjectProposalPricingGroups.tsx` — group creation/editing, Area membership visibility, pricing summary.
- `ProjectProposalRevisionHistory.tsx` — revision lifecycle timeline/actions.

Keep files focused. Do not move unrelated ProjectDetailWorkspace behavior during Proposal work.

### 4.3 Domain client

Create:

- `modulex-admin/src/lib/customers/project-proposal-domain.ts`

Responsibilities:

- canonical TypeScript Proposal/Revision/Area/Pricing Group types
- read wrappers
- mutation wrappers
- input normalization helpers specific to Proposal domain
- no UI rendering

### 4.4 Area editor behavior

Collapsed default form should prioritize the fields most users need:

- Area Type
- Area Name
- Readiness
- Status Note

Expandable/secondary sections:

- Material
- Measurements
- Edge / Backsplash
- Sink / Cutout
- Scope Notes
- Internal Notes
- Pricing

The UI must not require irrelevant fields. A valid Area can consist only of `area_name`.

### 4.5 Area Type settings

V1 recommendation: expose lightweight management from Proposal UI or existing Settings surface using current settings/navigation patterns after inspecting the actual route ownership. Do not create a new top-level settings architecture.

Required capabilities:

- list active/inactive Area Types
- add custom type
- rename type
- deactivate/reactivate type
- referenced historical type remains readable

---

## 5. Implementation Packages / Tracking

### P0 — Design Lock & Baseline

Status: `[x] PLANNED`

- [x] Review current Project architecture and canonical domain boundaries.
- [x] Confirm Project Detail already owns Orders, Finance, Participants & Commission, Change Orders, Procurement, Fulfillment, Calendar, Documents placeholder, and Activity.
- [x] Decide Proposal belongs under Project and before Orders.
- [x] Decide Area Type = configurable selection; Area Name = required free text.
- [x] Decide all other Area fields optional.
- [x] Decide structured core columns + optional future extension instead of single JSON blob.
- [x] Decide grouped pricing is first-class and not force-allocated.
- [x] Decide accepted Revision immutable and post-acceptance changes use Change Orders.
- [x] Decide Proposal acceptance does not auto-create Order.
- [x] Create this tracking document.

Exit criteria: design decisions above are accepted and this file is on the implementation branch/PR.

### P1 — Proposal Core DB + RBAC + Read Model

Status: `[ ] NOT STARTED`

Primary files:

- Create `modulex-admin/sql/project-proposal-core.sql`
- Create canonical mirrored migration under `modulex-store/supabase/migrations/<timestamp>_project_proposal_core.sql`
- Create/update focused DB contract tests under the existing Admin Project Base contract location discovered on current main
- Update `modulex-admin/ADMIN_ROADMAP.md` in the same workstream

Scope:

- [ ] Create `proposal_area_types` with seed types.
- [ ] Create Proposal, Revision, Pricing Group, Area, Acceptance tables.
- [ ] Add RLS/grants/lifecycle guards.
- [ ] Add derived Proposal total read model.
- [ ] Add Proposal list/detail + Area Type reads.
- [ ] Add draft Proposal/Revision/Area/Pricing Group mutation RPCs.
- [ ] Add send/reject/accept lifecycle RPCs with concurrency-safe revision/acceptance behavior.
- [ ] Lock non-draft Revision content at DB boundary.
- [ ] Verify accepted Revision cannot be rewritten/deleted.
- [ ] Verify Area direct pricing vs Pricing Group exclusivity.
- [ ] Verify cross-Revision Pricing Group assignment fails closed.
- [ ] Run targeted RED → GREEN contract.
- [ ] Run migration mirror contract.
- [ ] Run Supabase Security/Performance Advisors after schema/RPC/grant/RLS changes.

P1 acceptance:

- Minimal Proposal with one Area name can be created.
- Optional fields can remain NULL.
- One grouped price can cover multiple Areas without invented allocations.
- Server-derived total is correct.
- Unauthorized mutation is denied.
- Sent/accepted Revision is immutable.
- No Order/Finance/Procurement/Fulfillment/Calendar truth is created or modified.

### P2 — Project Proposal Admin UI

Status: `[ ] NOT STARTED`

Primary files:

- Create `modulex-admin/src/lib/customers/project-proposal-domain.ts`
- Create Proposal components listed in section 4.2
- Modify `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Add focused UI/domain tests using current Admin test conventions

Scope:

- [ ] Add `Proposal` Project tab before `Orders`.
- [ ] Explicit loading, empty, populated, error/retry, and permission-denied states.
- [ ] `Create Proposal` empty-state action.
- [ ] Draft Proposal header editor.
- [ ] `+ Add Area` workflow.
- [ ] Configurable Area Type selector + free-text Area Name.
- [ ] Optional secondary Area sections.
- [ ] Material Product search/select with custom description fallback.
- [ ] Pricing Group UI and direct/group pricing exclusivity.
- [ ] Derived pricing summary and total.
- [ ] Reorder Areas without changing commercial values.
- [ ] Duplicate-submit guards and RPC error mapping.
- [ ] Responsive Admin UI and keyboard/accessibility behavior.
- [ ] Run `smoke:admin-ui-strict`, relevant Project regression, RBAC, typecheck, lint, and production build at final gate.

P2 acceptance:

- User can create a Proposal that contains only `Area Name`.
- User can also create a detailed Area similar to the reviewed countertop example.
- Standard Area Types speed entry but never block custom names.
- Inactive Area Types cannot be newly selected but remain visible on historical Areas.
- No route-local visual primitive is introduced.

### P3 — Revision / Send / Acceptance UX

Status: `[ ] NOT STARTED`

Scope:

- [ ] Show Proposal revision history.
- [ ] Send a draft Revision.
- [ ] Create a new draft Revision from a previously sent Revision.
- [ ] Reject a sent Revision with note.
- [ ] Accept an exact sent Revision.
- [ ] Freeze accepted Revision controls in UI as well as DB.
- [ ] Reflect Proposal commercial state without overloading Project status.
- [ ] Define conservative Project lifecycle integration: Proposal sent may support Project `quoted`; Proposal accepted may support Project `approved` only through an explicit reviewed transition, not an accidental side effect.

P3 acceptance:

- Sent content cannot be edited in-place.
- Revision N+1 does not alter Revision N.
- Acceptance points to an exact immutable Revision.
- Project lifecycle and Proposal lifecycle remain independently auditable.

### P4 — Proposal PDF Rendering

Status: `[ ] NOT STARTED`

Scope:

- [ ] Inspect and reuse current Modulex document/PDF rendering conventions before choosing a library.
- [ ] Create server-side Proposal PDF rendering from structured Proposal Revision data.
- [ ] Hide empty optional fields/sections instead of printing blank labels.
- [ ] Render grouped pricing once per Pricing Group.
- [ ] Exclude `internal_notes` from all customer-facing output.
- [ ] Include proposal/revision/date/customer/project/job site/terms/total.
- [ ] Add preview/download action for authorized Admin users.
- [ ] Snapshot test/contract the PDF data projection separately from visual rendering.

P4 acceptance:

- Reviewed sample-style Proposal can be represented without manual PDF editing.
- PDF total equals DB-derived Proposal total.
- No duplicate grouped price appears.
- Internal-only notes never appear.

### P5 — Acceptance Snapshot + Project Documents

Status: `[ ] NOT STARTED`

Dependency: map the canonical Modulex storage/document ownership first; current Project Documents tab is intentionally a placeholder.

Scope:

- [ ] Inspect existing storage/document contracts and choose canonical Project document reference.
- [ ] Do not create a second storage system.
- [ ] Persist the exact accepted rendered Proposal PDF as immutable evidence.
- [ ] Link acceptance metadata to the exact Revision/document snapshot.
- [ ] Surface accepted Proposal artifact in Project Documents.
- [ ] Preserve append-safe audit semantics.

P5 acceptance:

- The exact document the customer accepted can be retrieved later.
- Re-rendering a newer Revision does not change the accepted artifact.
- Storage permissions do not expose private draft Proposals publicly.

### P6 — Proposal → Order Conversion

Status: `[ ] NOT STARTED`

Scope:

- [ ] Add explicit `Create Order from Proposal` action only for accepted Proposal baseline.
- [ ] Allow user to choose which Areas feed an Order.
- [ ] Map Proposal commercial scope into canonical Order inputs without changing Order invariants.
- [ ] Preserve snapshot text needed to explain Proposal origin.
- [ ] Record source Proposal Revision/Area linkage using the narrowest compatible reference model.
- [ ] Prevent duplicate conversion via idempotency/source-link checks.
- [ ] Support multiple Orders per Project rather than assuming one Proposal = one Order.

P6 acceptance:

- Acceptance alone creates no Order.
- Authorized explicit conversion creates canonical Order(s).
- Repeating the same conversion cannot silently duplicate the same selected scope.
- Order pricing/lifecycle remains authoritative after conversion.

### P7 — Operational Readiness Integration (Later Package)

Status: `[ ] DEFERRED`

This package is intentionally deferred until P1–P6 are production-accepted.

Potential scope after business validation:

- Area readiness filters/summary on Project Overview.
- Calendar measurement events linked to Proposal Areas where the canonical Calendar contract supports it.
- Operational handoff into fabrication/fulfillment only through existing canonical domains.

Do not begin P7 while unrelated Calendar work is active unless current main and open PR review confirms safe boundaries.

---

## 6. Test Matrix

DB / RPC:

- create minimal Proposal
- create detailed Proposal Area
- nullable numeric fields remain NULL
- reject blank Area Name
- reject invalid readiness value
- reject negative measurements/counts where prohibited
- reject Area with both direct price and Pricing Group
- reject cross-Revision Pricing Group FK usage
- grouped total counted once
- Revision increment concurrency
- duplicate send/accept behavior is safe
- sent Revision mutation denied
- accepted Revision mutation/delete denied
- unauthorized read/write denied according to Project role contract
- anon execute denied for protected RPCs

Admin UI:

- Proposal tab visibility/permission behavior
- empty/loading/error/retry/populated states
- standard Area Type + custom Area Name
- no Area Type + custom Area Name
- optional field normalization
- material Product + custom material fallback
- grouped price assignment
- direct/group price mutual exclusion
- send/new revision/accept controls by state
- responsive modal/list behavior
- internal notes never enter PDF projection

Cross-domain regression:

- existing Project tabs unchanged
- existing Order creation/linking unchanged
- Change Orders unchanged
- Finance/Procurement/Fulfillment projections unchanged
- Store public catalog unchanged
- Customer/Dealer Portal unchanged unless a later explicit package adds Proposal exposure

---

## 7. Rollout Discipline

For every package:

1. Re-read execution-time `main`, open PRs, `AGENTS.md`, `modulex-admin/ADMIN_ROADMAP.md`, Admin UI Guide, and Validation Guide as relevant.
2. Create an isolated package branch from current `main`.
3. Add/update the focused RED contract first.
4. Implement the minimum GREEN delta.
5. Run targeted tests; only then run broad Admin gates required by the changed surface.
6. Keep canonical Supabase migration mirror byte-identical where shared migration policy requires it.
7. Open a focused PR and record branch/PR/status below.
8. After owner merge, apply only the exact merged production migration if missing.
9. Run read-only or rollback-only production acceptance, Security/Performance Advisors for DB packages, and live Admin route checks where applicable.
10. Mark a package `[x]` only after its stated production acceptance is complete.

---

## 8. Progress Log

| Date | Package | Status | Branch / PR | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-07 | P0 — Design Lock & Baseline | Planned / documented | `docs/project-proposal-plan` | Current `main` verified at `aaba756e...`; Proposal architecture locked; PR #361 is Calendar-only and non-overlapping. |

---

## 9. Current Next Action

**Next package: P1 — Proposal Core DB + RBAC + Read Model.**

Before touching schema, inspect execution-time production tables/functions/grants and current Project Base test/migration conventions. Then add the P1 RED contract and implement only the Proposal Core DB boundary; do not start UI, PDF, Documents, Order conversion, or Calendar integration in the same package.
