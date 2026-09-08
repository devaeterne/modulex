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
- Current execution baseline for P5 closeout: `main` at `9adf26fa53779825eac554f50a666287f6fe392c` (2026-09-08). PR #400 is merged, no open PRs were present at closeout verification, Admin production is `READY` on the same SHA, P1–P4 are closed according to the evidence below, and P5 implementation is merged via PR #398 with live signed-in artifact acceptance still pending.

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

Accepted PDF is stored as an immutable Project document snapshot through the existing canonical `customer_documents` lifecycle and private `customer-documents` bucket. Proposal must not invent a parallel document-storage system.

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
- canonical accepted Project document linkage is provided by P5 through `customer_project_proposal_artifacts`
- standard created metadata

Rules:

- append-safe; no browser hard-delete
- only one effective acceptance for a Revision
- acceptance transaction locks Revision and transitions Proposal commercial status atomically

### 2.7 `customer_project_proposal_artifacts`

Purpose: immutable linkage from an exact accepted Proposal Revision/Acceptance to the canonical `customer_documents` record created for the persisted accepted PDF.

Rules:

- one artifact per accepted Revision
- one artifact per acceptance row
- one Proposal artifact link per canonical customer document
- registration only through the guarded canonical RPC
- accepted artifact metadata is immutable
- stored bytes live in the existing private `customer-documents` bucket
- `portal_visible=false` initially
- no parallel Proposal document/storage lifecycle

---

## 3. Server / RPC Boundary

Target API surface; exact signatures are finalized against current DB conventions before migration is written.

Reads:

- `get_project_proposals(project_id)` — Proposal list + current/latest Revision summary.
- `get_project_proposal(proposal_id)` — Proposal header, Revisions, active/current Revision, Areas, Pricing Groups, derived total.
- `get_proposal_area_types(include_inactive boolean default false)` — configurable selector data.
- `get_project_proposal_artifact(...)` — exact accepted artifact metadata.
- `get_project_proposal_artifacts(project_id)` — Project accepted Proposal document index.

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
- `register_project_proposal_accepted_artifact(...)` — exact accepted Revision only, canonical customer document registration, idempotent and immutable.

Mutation requirements:

- DB/RPC lifecycle guards are authoritative.
- All protected writes are role/permission checked at the authoritative boundary.
- Do not expose service-role credentials to browser code.
- Duplicate submit must not create duplicate Proposal/Revision/Acceptance/artifact records.
- Unknown lifecycle transitions fail closed.
- Commercial numbering/revision increment is concurrency-safe.

---

## 4. Admin UI Contract

### 4.1 Project Detail integration

`modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx` owns `Proposal` before `Orders` and renders the focused `ProjectProposalTab` component. `Documents` renders the real `ProjectDocumentsTab` accepted-artifact index introduced by P5.

### 4.2 Focused components

Proposal components under `modulex-admin/src/components/customers/project-detail/` include:

- `ProjectProposalTab.tsx` — orchestration, loading/error/empty/permission states, Proposal/revision summary.
- `ProjectProposalEditor.tsx` — Proposal header/terms/validity editing for draft Revision.
- `ProjectProposalAreaList.tsx` — ordered Area cards/table and add/edit actions.
- `ProjectProposalAreaModal.tsx` — dynamic optional Area editor using shared Modulex form controls.
- `ProjectProposalPricingGroups.tsx` — group creation/editing, Area membership visibility, pricing summary.
- `ProjectProposalRevisionHistory.tsx` — revision lifecycle timeline/actions.
- `ProjectProposalLifecycleActions.tsx` — Send/New Revision/Reject/Accept plus accepted-snapshot persistence/retry state.
- `ProjectDocumentsTab.tsx` — canonical accepted Proposal artifact listing and stored-byte download.

Keep files focused. Do not move unrelated ProjectDetailWorkspace behavior during Proposal work.

### 4.3 Domain clients

Proposal domain/client responsibilities remain separated from UI rendering:

- `modulex-admin/src/lib/customers/project-proposal-domain.ts`
- `modulex-admin/src/lib/customers/project-proposal-artifact-client.ts`
- `modulex-admin/src/lib/customers/project-proposal-artifact-server.ts`

Responsibilities:

- canonical TypeScript Proposal/Revision/Area/Pricing Group/artifact types
- read wrappers
- mutation wrappers
- input normalization helpers specific to Proposal domain
- P4 customer-safe projection/PDF renderer reuse for P5 persistence
- no UI rendering
- no service-role browser bypass

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

Status: `[x] PRODUCTION ACCEPTED`

Implementation: PR #370.

Scope:

- [x] Create `proposal_area_types` with seed types.
- [x] Create Proposal, Revision, Pricing Group, Area, Acceptance tables.
- [x] Add RLS/grants/lifecycle guards.
- [x] Add derived Proposal total read model.
- [x] Add Proposal list/detail + Area Type reads.
- [x] Add draft Proposal/Revision/Area/Pricing Group mutation RPCs.
- [x] Add send/reject/accept lifecycle RPCs with concurrency-safe revision/acceptance behavior.
- [x] Lock non-draft Revision content at DB boundary.
- [x] Verify accepted Revision cannot be rewritten/deleted.
- [x] Verify Area direct pricing vs Pricing Group exclusivity.
- [x] Verify cross-Revision Pricing Group assignment fails closed.
- [x] Run targeted RED → GREEN contract.
- [x] Run migration mirror contract.
- [x] Run Supabase Security/Performance Advisors after schema/RPC/grant/RLS changes.

P1 acceptance:

- Minimal Proposal with one Area name can be created.
- Optional fields can remain NULL.
- One grouped price can cover multiple Areas without invented allocations.
- Server-derived total is correct.
- Unauthorized mutation is denied.
- Sent/accepted Revision is immutable.
- No Order/Finance/Procurement/Fulfillment/Calendar truth is created or modified.

### P2 — Project Proposal Admin UI

Status: `[x] MERGED / VERIFIED`

Implementation: PR #376.

Scope:

- [x] Add `Proposal` Project tab before `Orders`.
- [x] Explicit loading, empty, populated, error/retry, and permission-denied states.
- [x] `Create Proposal` empty-state action.
- [x] Draft Proposal header editor.
- [x] `+ Add Area` workflow.
- [x] Configurable Area Type selector + free-text Area Name.
- [x] Optional secondary Area sections.
- [x] Material Product search/select with custom description fallback.
- [x] Pricing Group UI and direct/group pricing exclusivity.
- [x] Derived pricing summary and total.
- [x] Reorder Areas without changing commercial values.
- [x] Duplicate-submit guards and RPC error mapping.
- [x] Responsive Admin UI and keyboard/accessibility behavior.
- [x] Run `smoke:admin-ui-strict`, relevant Project regression, RBAC, typecheck, lint, and production build at final gate.

P2 acceptance:

- User can create a Proposal that contains only `Area Name`.
- User can also create a detailed Area similar to the reviewed countertop example.
- Standard Area Types speed entry but never block custom names.
- Inactive Area Types cannot be newly selected but remain visible on historical Areas.
- No route-local visual primitive is introduced.

### P3 — Revision / Send / Acceptance UX

Status: `[x] MERGED / PRODUCTION VERIFIED`

Implementation: PR #381.

Scope:

- [x] Show Proposal revision history.
- [x] Send a draft Revision.
- [x] Create a new draft Revision from a previously sent Revision.
- [x] Reject a sent Revision with note.
- [x] Accept an exact sent Revision.
- [x] Freeze accepted Revision controls in UI as well as DB.
- [x] Reflect Proposal commercial state without overloading Project status.
- [x] Preserve the explicit boundary that Proposal acceptance does not create an Order or silently mutate Project lifecycle.

P3 acceptance:

- Sent content cannot be edited in-place.
- Revision N+1 does not alter Revision N.
- Acceptance points to an exact immutable Revision.
- Project lifecycle and Proposal lifecycle remain independently auditable.

Closeout evidence:

- PR #381 merged.
- Current production deployment is a descendant of the P3 merge and is `READY`.
- Proposal lifecycle contracts are GREEN on the #400/current-main-equivalent tree.

### P4 — Proposal PDF Rendering

Status: `[x] PRODUCTION ACCEPTED`

Implementation: PR #384.

Merge SHA: `29515c907ca3cc79f49e5a030b5c8e6f36d70ae2`.

Scope:

- [x] Inspect and reuse current Modulex document/PDF rendering conventions before choosing a library.
- [x] Create server-side Proposal PDF rendering from structured Proposal Revision data.
- [x] Hide empty optional fields/sections instead of printing blank labels.
- [x] Render grouped pricing once per Pricing Group.
- [x] Exclude internal/readiness/measurement/supplier-internal fields from customer-facing output unless an explicit customer-facing contract exists.
- [x] Include proposal/revision/date/customer/project/job site/terms/total.
- [x] Add preview/download action for authorized Admin users.
- [x] Snapshot/contract the PDF data projection separately from visual rendering.

P4 acceptance:

- Reviewed sample-style Proposal can be represented without manual PDF editing.
- PDF total equals DB-derived Proposal total.
- No duplicate grouped price appears.
- Internal-only notes never appear.

Closeout evidence:

- PR #384 merged and is contained by the current production deployment.
- Signed-in Preview/Download smoke was manually owned and accepted by the project owner.
- P4 PDF contract remains GREEN on the #400/current-main-equivalent tree.

### P5 — Acceptance Snapshot + Project Documents

Status: `[~] IMPLEMENTED / MERGED / PRODUCTION SCHEMA + DEPLOY + CI VERIFIED — SIGNED-IN LIVE ARTIFACT ACCEPTANCE PENDING`

Implementation: PR #398.

Merge SHA: `3cf0d62dac1641bdd6674959de9bdb706ab62d2d`.

Closeout evidence: `docs/acceptance/project-proposal-p5-production-closeout.md`.

Canonical ownership is resolved: P5 reuses `public.customer_documents` and the existing private `customer-documents` bucket. No parallel Proposal document/storage system is introduced.

Scope:

- [x] Inspect existing storage/document contracts and choose canonical Project document reference.
- [x] Do not create a second storage system.
- [x] Persist the exact accepted rendered Proposal PDF as immutable evidence.
- [x] Link acceptance metadata to the exact Revision/document snapshot.
- [x] Surface accepted Proposal artifact in Project Documents.
- [x] Preserve append-safe audit semantics.
- [x] Store SHA-256/file-size/storage metadata and verify stored bytes on download.
- [x] Keep persistence retryable/idempotent without rolling back a successful Proposal acceptance.
- [x] Keep accepted artifact `portal_visible=false` initially.
- [x] Preserve no-Order/no-Project-lifecycle-mutation boundary.
- [x] Verify canonical Store migration and Admin mirror are byte-identical.
- [x] Verify production table/constraints/lifecycle guard/RPC signatures/grants/RLS/Storage boundary.
- [x] Verify P5 focused contract GREEN through Admin Project Base.
- [x] Verify current Admin production deployment contains P5 and is `READY`.
- [ ] Complete signed-in production artifact acceptance using a real accepted Proposal Revision.

P5 acceptance:

- The exact document the customer accepted can be retrieved later.
- Re-rendering a newer Revision does not change the accepted artifact.
- Storage permissions do not expose private draft Proposals publicly.
- Duplicate persistence retry does not create a second artifact/document/object.
- Download returns the exact stored bytes and verifies stored SHA metadata.
- Acceptance alone creates zero Orders and does not mutate Project lifecycle.

Current live acceptance gate:

At the 2026-09-08 closeout verification, production contained `0` accepted Proposals, `0` accepted Proposal Revisions, `0` Proposal acceptances, and `0` Proposal artifacts. The remaining signed-in artifact/retry/download smoke therefore cannot be proven safely without creating artificial production business data. Do not fabricate production Proposal/Acceptance state to satisfy this gate.

### P6 — Proposal → Order Conversion

Status: `[ ] NOT STARTED — BLOCKED ON P5 LIVE ACCEPTANCE`

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

P6 must not begin until P5's remaining signed-in production artifact acceptance is explicitly completed/accepted.

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
- accepted artifact exact-Revision/acceptance linkage
- duplicate artifact persistence is idempotent
- artifact lifecycle mutation outside canonical guard denied
- customer document/Storage boundary remains private and role-scoped

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
- accepted snapshot persistence/retry state
- Project Documents accepted artifact listing/download

Cross-domain regression:

- existing Project tabs unchanged
- existing Order creation/linking unchanged
- Proposal acceptance creates no Order
- Change Orders unchanged
- Finance/Procurement/Fulfillment projections unchanged
- Store public catalog unchanged
- Customer/Dealer Portal unchanged unless a later explicit package adds Proposal exposure

---

## 7. Rollout Discipline

For every package:

1. Re-read execution-time `main`, open PRs, `AGENTS.md`, `modulex-admin/ADMIN_ROADMAP.md`, Admin UI Guide, and Validation Guide as relevant.
2. Create an isolated package branch from current `main`.
3. Add/update the focused RED contract first for executable behavior; documentation-only closeout packages may rely on already-captured implementation RED/GREEN evidence.
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
| 2026-09-07 | P0 — Design Lock & Baseline | Planned / documented | `docs/project-proposal-plan` | Initial Proposal architecture locked. |
| 2026-09-08 | P1 — Proposal Core DB + RBAC + Read Model | Production accepted | PR #370 | Exact merged migrations are live; rollback-safe production acceptance, RBAC/RLS/grants and advisor review completed. |
| 2026-09-08 | P2 — Project Proposal Admin UI | Merged / verified | PR #376 | Proposal tab, draft editor, Areas, Pricing Groups and authoritative total UI merged; Project Base + Admin UI Foundation green. |
| 2026-09-08 | P3 — Revision / Send / Acceptance UX | Merged / production verified | PR #381 | Send/New Revision/Reject/Accept and exact accepted Revision lock are merged; current production contains the implementation and lifecycle contracts remain green. |
| 2026-09-08 | P4 — Proposal PDF Rendering | Production accepted | PR #384 | Merge `29515c9...`; production contains the renderer; signed-in Preview/Download smoke manually accepted by owner; P4 contract green. |
| 2026-09-08 | P5 — Acceptance Snapshot + Project Documents | Merged / schema + deploy + CI verified; live smoke pending | PR #398 | Merge `3cf0d62...`; canonical document/storage reuse, production schema/security boundary, byte-identical migration mirror, P5 contract and current deployment verified. Production has no accepted Proposal data, so signed-in artifact/retry/download acceptance remains pending. |
| 2026-09-08 | P5 — Production closeout evidence | Reviewable docs closeout | `docs/project-proposal-p5-closeout-20260908` | Detailed evidence recorded in `docs/acceptance/project-proposal-p5-production-closeout.md`; no production mutation performed. |

---

## 9. Current Next Action

**Current package: P5 — Acceptance Snapshot + Project Documents production acceptance.** Implementation PR #398 is merged, current production contains it, production schema/security/storage boundaries are verified, the Store/Admin migration mirrors are byte-identical, and the focused P5 contract is GREEN through Admin Project Base. The remaining gate is a signed-in production artifact smoke using a real accepted Proposal Revision. At closeout verification time production had no accepted Proposal/Revision/Acceptance/artifact rows, so this gate must remain pending rather than being satisfied with fabricated production data.

Once a real accepted Proposal Revision exists, verify idempotent snapshot persistence, one canonical `customer_documents` record, one private Storage object, SHA/file-size metadata, Project Documents listing, exact stored-byte download, immutability against newer revisions, customer-safe projection, grouped-price-once behavior, and the no-Order/no-Project-lifecycle-mutation boundary.

**P6 — Proposal → Order Conversion remains NOT STARTED and blocked until P5 live acceptance is explicitly completed.**