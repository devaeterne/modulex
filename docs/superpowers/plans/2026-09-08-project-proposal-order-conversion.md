# Project Proposal P6 — Proposal → Order Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the latent P5 accepted-artifact compatibility defect, then implement explicit accepted-Proposal → Draft Project Order conversion while preserving accepted customer-visible sell and all canonical Order invariants.

**Architecture:** P5 compatibility removes the non-canonical `accepted_revision_id` dependency and validates exact accepted Revision + acceptance evidence. P6 adds immutable conversion provenance plus preview/read/mutation RPCs; accepted Proposal commercial units are represented through the canonical `SERVICE` / `manual_service` Order route, with Administrative Fee reverse-netted so accepted pre-tax sell is preserved exactly. The existing New Order screen remains the only Order header editor.

**Tech Stack:** PostgreSQL / Supabase migrations + RPCs, Next.js App Router, React/TypeScript, Supabase JS, Modulex shared Admin UI primitives, GitHub Actions contract CI.

**Spec:** `docs/superpowers/specs/2026-09-08-project-proposal-order-conversion-design.md`

## Global Constraints

- Work from execution-time current `main`; keep PR #405 sidebar work isolated.
- Canonical shared migrations live under `modulex-store/supabase/migrations`; Admin keeps a byte-identical mirror.
- No production migration before owner merge.
- Proposal acceptance alone creates no Order.
- Exact accepted Revision + immutable acceptance evidence is the accepted baseline; `customer_project_proposals.accepted_revision_id` does not exist and must not be introduced.
- Standalone Orders and Project Orders without Proposal remain valid.
- Pricing Groups are atomic; accepted group amount is counted once and never allocated across Areas.
- Administrative Fee is internal; accepted Proposal amount is customer-visible pre-tax truth and must not have fee added on top.
- Browser code never supplies authoritative Proposal prices and never duplicates DB financial arithmetic.
- Converted Order always starts `draft`; initial Order Discount is `0`.
- No Procurement, Fulfillment, Invoice, Calendar, Inventory reservation, or Proposal mutation side effects.
- Admin UI uses shared Modulex primitives and must pass strict changed-file UI gates.

---

### Task 1: P5 accepted-artifact compatibility RED → GREEN

**Files:**
- Modify: `modulex-admin/scripts/project-proposal-acceptance-snapshot-contract.mjs`
- Create: `modulex-store/supabase/migrations/20260908183000_project_proposal_artifact_acceptance_compatibility.sql`
- Create mirror: `modulex-admin/supabase/migrations/20260908183000_project_proposal_artifact_acceptance_compatibility.sql`

**Interfaces:**
- Consumes: existing `public.register_project_proposal_accepted_artifact(...)`, `customer_project_proposal_revisions`, `customer_project_proposal_acceptances`.
- Produces: corrected registration RPC validating exact accepted Revision + acceptance row without `accepted_revision_id`.

- [ ] **Step 1: Make P5 contract require the compatibility migration and forbid the non-canonical column dependency**

Require byte-identical Store/Admin hardening migration, `state = 'accepted'`, `customer_project_proposal_acceptances`, and absence of `accepted_revision_id` in the replacement function.

- [ ] **Step 2: Verify RED**

Run through Admin Project Base / Proposal contract chain. Expected failure: missing `20260908183000_project_proposal_artifact_acceptance_compatibility.sql`.

- [ ] **Step 3: Implement minimal compatibility migration**

Use `create or replace function public.register_project_proposal_accepted_artifact(...)` with the existing signature/security/storage/idempotency behavior, but derive accepted truth from `pr.state='accepted'`, `pp.status='accepted'`, and the exact `pa.revision_id = pr.id` identity. Do not add a Proposal column.

- [ ] **Step 4: Verify P5 contract GREEN and P6 remains the next intentional RED**

Expected: P5 acceptance snapshot contract passes; P6 contract fails only because P6 runtime files are still missing.

- [ ] **Step 5: Commit**

Commit only the P5 contract + two byte-identical compatibility migrations.

---

### Task 2: P6 database/RPC contract GREEN

**Files:**
- Create: `modulex-store/supabase/migrations/20260908190000_project_proposal_order_conversion.sql`
- Create mirror: `modulex-admin/supabase/migrations/20260908190000_project_proposal_order_conversion.sql`
- Test: `modulex-admin/scripts/project-proposal-order-conversion-contract.mjs`

**Interfaces:**
- Consumes: exact accepted Proposal Revision/acceptance, `customer_project_proposal_areas`, Proposal pricing groups, canonical active `SERVICE`, `public.create_project_customer_order(...)`, `private.customer_order_visible_line_pricing`, `customer_orders.customer_visible_sell_amount`.
- Produces: `get_project_proposal_order_conversion_preview`, `create_order_from_accepted_project_proposal`, `get_project_proposal_order_conversions`, `get_customer_order_proposal_origin` and immutable provenance tables.

- [ ] **Step 1: Create immutable provenance schema**

Add `customer_project_proposal_order_conversions`, `customer_project_proposal_order_conversion_lines`, and `customer_project_proposal_order_conversion_areas` with unique `order_id`, unique `idempotency_key`, unique `proposal_area_id`, request fingerprint, accepted/base amount snapshots, and `initial_order_item_id ON DELETE SET NULL`.

- [ ] **Step 2: Add lifecycle/RLS/grant boundary**

Enable RLS, revoke direct PUBLIC/anon/authenticated DML, permit fixed-projection reads only through authenticated RPCs, and guard provenance insert/update/delete so only the canonical conversion lifecycle can insert while update/delete always fail with `PROPOSAL_ORDER_CONVERSION_IMMUTABLE`.

- [ ] **Step 3: Add preview RPC**

`get_project_proposal_order_conversion_preview(p_revision_id uuid)` must require `projects.view`, exact accepted Revision + acceptance, return direct Areas and atomic Pricing Groups, expose accepted target amount and converted Order linkage, and exclude operational/internal/supplier/cost fields.

- [ ] **Step 4: Add deterministic Administrative Fee reconciliation helpers**

Operate in integer cents. Given accepted commercial-unit target cents and chosen Administrative Fee percent, derive fixed base cents whose canonical fee computation yields the exact accepted visible cents. Allocate base cents deterministically by Proposal sort order and fail closed with `PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED` if exact cent reconciliation cannot be proven.

- [ ] **Step 5: Add authoritative mutation RPC**

`create_order_from_accepted_project_proposal(...)` must: authorize; canonicalize request; enforce idempotency fingerprint; lock accepted source; reject empty/duplicate/foreign/already-converted scope; require full Pricing Group membership; reject currency mismatch; resolve canonical SERVICE; rebuild all accepted target amounts server-side; derive base SERVICE prices; call `create_project_customer_order` with `draft`, zero Order Discount and zero legacy payment commission; re-read canonical visible line pricing; rollback on any cent mismatch; persist immutable header/line/Area provenance; return Order identity.

- [ ] **Step 6: Add history/origin reads**

`get_project_proposal_order_conversions(...)` returns Proposal/Project conversion history for `projects.view`; `get_customer_order_proposal_origin(p_order_id uuid)` returns internal immutable Proposal origin for the Order without modifying the Order.

- [ ] **Step 7: Run P6 DB contract**

Expected: migration token/security/financial/idempotency/source-link assertions pass; UI/domain assertions remain RED until later tasks.

- [ ] **Step 8: Commit**

Commit canonical migration + byte-identical Admin mirror.

---

### Task 3: P6 typed domain client

**Files:**
- Create: `modulex-admin/src/lib/customers/project-proposal-order-conversion-domain.ts`

**Interfaces:**
- Consumes: four P6 public RPCs.
- Produces: `getProjectProposalOrderConversionPreview`, `createOrderFromAcceptedProjectProposal`, `getProjectProposalOrderConversions`, `getCustomerOrderProposalOrigin`, typed preview/history/origin models, stable `PROPOSAL_ORDER_*` error mapping.

- [ ] **Step 1: Add typed preview/history/origin models and normalization**

Normalize selected Area ids as trimmed unique UUID strings and preserve RPC numeric values as strings/numbers without browser financial recomputation.

- [ ] **Step 2: Add read wrappers**

Implement preview, conversion-history and Order-origin RPC calls with focused error mapping.

- [ ] **Step 3: Add mutation wrapper**

Pass exact Revision, selected Areas, idempotency key, and normal Order-owned header context; do not accept Proposal prices from the caller.

- [ ] **Step 4: Run P6 contract**

Expected: domain assertions GREEN; UI assertions remain RED.

- [ ] **Step 5: Commit**

Commit only focused domain client.

---

### Task 4: Proposal selection UI

**Files:**
- Create: `modulex-admin/src/components/customers/project-detail/ProjectProposalOrderConversion.tsx`
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectProposalTab.tsx`

**Interfaces:**
- Consumes: `getProjectProposalOrderConversionPreview`, accepted Revision identity, existing Project/Customer ids.
- Produces: explicit Area/Pricing Group selection and navigation to existing New Order route with `projectId`, `proposalRevisionId`, repeated/encoded `proposalAreaIds`.

- [ ] **Step 1: Render accepted-only conversion card**

Use `ComponentCard`, `Alert`, `Button`, `Modal` and shared checkbox/form primitive; expose loading, retry, empty, permission and converted states.

- [ ] **Step 2: Implement atomic selection**

Direct Areas toggle independently. Pricing Group unit toggles all member Area ids together. Already-converted units are disabled and show linked Order.

- [ ] **Step 3: Continue to existing Order editor**

`Continue to Order` navigates to `/customers/{customerId}/orders/new` with explicit Project, accepted Revision and selected Area ids. It must not call the mutation RPC.

- [ ] **Step 4: Integrate into Proposal tab**

Render the selector only for the accepted Revision and authorized Project-manage users; acceptance action remains independent.

- [ ] **Step 5: Run P6 + Admin UI strict contracts**

Expected: selector/proposal integration assertions GREEN.

- [ ] **Step 6: Commit**

Commit selector + Proposal tab integration.

---

### Task 5: Reuse existing New Order flow for conversion

**Files:**
- Modify: `modulex-admin/src/app/(admin)/customers/[id]/orders/new/page.tsx`
- Modify: `modulex-admin/src/components/customers/NewCustomerOrder.tsx`

**Interfaces:**
- Consumes: optional `projectId`, `proposalRevisionId`, `proposalAreaIds`; P6 preview and create wrappers; existing order context loaders/defaults.
- Produces: same New Order UI in normal mode and Proposal conversion mode.

- [ ] **Step 1: Parse explicit conversion source on page**

Pass normalized optional query source props into `NewCustomerOrder`; no source means behavior remains exactly normal New Order.

- [ ] **Step 2: Re-read authoritative preview in conversion mode**

Validate selected Areas still belong to exact accepted Revision and are still convertible. Show `Accepted Proposal` banner and locked source commercial units.

- [ ] **Step 3: Preserve normal Order-owned header controls**

Keep Price Group, fulfillment, payment method, Administrative Fee, addresses, expected date, references/notes and tax controls. Force initial Order Discount to `0` and disable it in conversion mode. Prevent adding normal Product/Countertop/Service lines before initial Draft creation.

- [ ] **Step 4: Save via P6 mutation**

Generate one `crypto.randomUUID()` idempotency key per pending submit and retain it across retry until success/source changes. Call `createOrderFromAcceptedProjectProposal`; redirect to canonical Order detail on success.

- [ ] **Step 5: Keep normal mode unchanged**

Existing generic `createCustomerOrder...` path remains used only when no Proposal conversion source exists.

- [ ] **Step 6: Run P6, Admin UI strict, Order regressions**

Expected: P6 contract completely GREEN and normal Order contracts still GREEN.

- [ ] **Step 7: Commit**

Commit New Order reuse changes.

---

### Task 6: Tracker and verification closeout

**Files:**
- Modify: `docs/PROJECT_PROPOSAL_PLAN.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `modulex-store/STORE_ROADMAP.md` only to record the canonical migration mirror impact, without changing public Store behavior.

- [ ] **Step 1: Mark P5 compatibility implementation-verified and P6 implementation-active/verified accurately**

Do not mark production-accepted before owner merge + production migration/deploy acceptance.

- [ ] **Step 2: Verify migration mirrors byte-identical**

Both P5 compatibility and P6 migration pairs must match exactly.

- [ ] **Step 3: Run targeted CI chain**

Admin Project Base Proposal P1→P6; relevant Project/Order contracts; Admin UI strict/regression; RBAC.

- [ ] **Step 4: Run final Admin quality gates**

Typecheck, lint and production build through the owning CI workflows.

- [ ] **Step 5: Run read-only production compatibility checks and Supabase Advisors**

Verify current production data satisfies constraints and current schema supports rollout; run Security and Performance Advisors. Do not apply either migration before owner merge.

- [ ] **Step 6: Update PR #406**

Document RED evidence, P5 root cause/fix, exact migration names, CI results, Advisor findings, and explicit `no production DDL / no merge by ChatGPT` status.
