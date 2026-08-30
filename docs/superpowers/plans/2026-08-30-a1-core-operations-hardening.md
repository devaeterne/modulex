# A1 Core Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase A1 by hardening order, shipment, installation and invoice operational boundaries, proving portal projections remain narrow, and adding deterministic core-operation smoke coverage.

**Architecture:** Preserve the existing Admin → authenticated RPC → private domain-function architecture. Add focused Supabase SQL hardening patches that centralize validation/transition helpers and harden the existing mutation functions; keep Store portal access read-only through the existing narrow RPC projections. Admin shipment and installation actions mirror—but never replace—the database transition policy.

**Tech Stack:** Next.js 16, React/TypeScript, Supabase PostgreSQL/RPC/RLS, Node.js dependency-free contract tests, GitHub Actions.

**Spec:** `modulex-admin/ADMIN_ROADMAP.md` Phase A1 and the approved 2026-08-30 A1 design discussion.

## Global Constraints

- Production Supabase remains the shared system of record.
- Do not weaken RLS/RPC boundaries.
- Customer/Dealer portal visibility must be explicit; internal financial/pricing/operational fields must not leak.
- New operational writes must define validation, authorization, audit implications and failure behavior.
- No automatic merge or production deploy unless explicitly requested.
- Payment methods remain active order/invoice scope; a standalone payment transaction/ledger module remains deferred.
- Portal invoice/payment visibility remains out of scope.

---

### Task 1: Add failing A1 core-operations contract

**Files:**
- Create: `modulex-admin/scripts/a1-core-operations-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Consumes: the A1 migration, `CustomerInstallationDetail.tsx`, Store portal migration/helper contracts.
- Produces: `npm run smoke:a1-core-operations` and permanent `npm run smoke` coverage.

- [ ] **Step 1: Write the failing contract**

The contract must assert that the A1 migration defines order/shipment/installation transition guards, delivery shipping-address/tax validation, product/price-source validation, invoice/payment boundary comments/grants, and narrow portal field exclusions. It must also assert that installation UI derives available next actions instead of rendering every status as an unrestricted select.

- [ ] **Step 2: Run RED**

Run: `node scripts/a1-core-operations-contract.mjs` from `modulex-admin`.
Expected: FAIL because the A1 migration/installation next-action policy does not exist yet.

- [ ] **Step 3: Wire the targeted smoke command only after the contract exists**

Add `smoke:a1-core-operations` and append it to the existing `smoke` chain without removing any existing checks.

- [ ] **Step 4: Commit test-only RED state**

Commit message: `test: define A1 core operations contract`.

### Task 2: Harden database operational contracts

**Files:**
- Create: `modulex-admin/sql/a1-core-operations-hardening.sql` and focused A1 compatibility SQL patches under `modulex-admin/sql/`

**Interfaces:**
- Consumes: existing public RPC signatures for order, shipment, installation and invoice mutations.
- Produces: compatible hardened implementations with no caller signature changes.

- [ ] **Step 1: Add order validation helpers**

Create private helpers for fulfillment/tax/shipping validation and forward lifecycle transition validation. Delivery and delivery+installation require a customer-owned active shipping address; configured active `order_tax_rules` are authoritative; Draft records may remain editable, while confirmation/non-Draft commercial validation requires Active products; quantities must remain positive; server-derived pricing-source classification remains authoritative.

- [ ] **Step 2: Harden order create/update/status functions**

Keep public wrappers unchanged. Reject invalid forward transitions at the private apply boundary while retaining explicit cancellation/approval behavior. Fulfillment-driven private calls must still support legitimate shipment and installation progression.

- [ ] **Step 3: Harden shipment transitions and associations**

Enforce `draft → picking → packed → shipped → delivered`, allow cancellation only before shipping, prevent backwards status changes, retain reservation/source-location/quantity checks, and keep shipment customer/order associations immutable and validated.

- [ ] **Step 4: Harden installation create/schedule/status functions**

Move installation mutations behind private SECURITY DEFINER implementations with safe search paths and public SECURITY INVOKER wrappers. Enforce `scheduled → confirmed → in_progress → completed`, allow cancellation only before completion, require valid order/customer/shipment association, require delivery+installation fulfillment, and require coherent schedule timestamps.

- [ ] **Step 5: Preserve invoice/payment boundary**

Keep invoice creation/state mutation roles at `super_admin/admin/sales/finance`; keep sales protected changes approval-gated; do not introduce payment-ledger tables or portal invoice/payment RPCs.

- [ ] **Step 6: Apply migration and verify catalog**

Use the Supabase migration tool, then query function definitions/grants to confirm safe search paths, role checks, wrapper signatures and authenticated-only execution.

### Task 3: Align Admin installation UI with DB state machine

**Files:**
- Modify: `modulex-admin/src/components/customers/CustomerInstallationDetail.tsx`

**Interfaces:**
- Consumes: existing `set_customer_installation_status` RPC.
- Produces: deterministic next-action buttons/options that cannot suggest invalid jumps.

- [ ] **Step 1: Keep RED contract failing until UI changes**

The contract must fail while the unrestricted `statuses.map(...)` select remains.

- [ ] **Step 2: Add a pure next-status policy**

Map scheduled → confirmed/cancelled, confirmed → in_progress/cancelled, in_progress → completed/cancelled, completed/cancelled → no actions. Completion notes appear only for the completed action.

- [ ] **Step 3: Render only valid next actions**

Remove the unrestricted status select. Keep DB errors visible because the database remains authoritative.

- [ ] **Step 4: Re-run targeted contract**

Expected: PASS once migration and UI both satisfy the contract.

### Task 4: Verify portal projections and operational acceptance

**Files:**
- Verify: `modulex-store/scripts/store-portal-contract.mjs`
- Verify: `modulex-store/scripts/portal-experience-contract.mjs`
- Verify: existing Store fulfillment/order migrations and helpers.

**Interfaces:**
- Produces: evidence for A1 portal-narrowness and exit gates without adding invoice/payment visibility.

- [ ] **Step 1: Run Store portal contracts**

Run the existing dependency-free portal contracts. They must continue to reject monetary/internal order fields and fulfillment source/internal fields.

- [ ] **Step 2: Run transaction-scoped DB acceptance**

Use rollback-only authenticated acceptance to prove invalid order/shipment/installation transitions fail and valid next transitions succeed without persistent test data.

- [ ] **Step 3: Run security/performance advisors**

Record only A1-specific findings; do not expand scope into unrelated existing advisory backlog.

### Task 5: Full verification and roadmap closeout

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces: Phase A1 closed and Phase A2 set as the next Admin phase only after verification is green.

- [ ] **Step 1: Run Admin targeted and full checks**

Run `npm run smoke:a1-core-operations`, `npm run smoke`, `npm run lint`, and `npm run build` through CI/current repository tooling.

- [ ] **Step 2: Verify Store contracts/build remain green where affected**

At minimum run the existing portal contract suites; run full Store build if CI workflow scope includes the touched cross-roadmap files.

- [ ] **Step 3: Update roadmap with evidence**

Mark A1.2 remaining validation/projection items, A1.3, A1.4, A1.5 and all Phase A1 exit gates complete only when the corresponding verification evidence exists. Set Current phase/next action to A2.

- [ ] **Step 4: Open PR without merge/deploy**

Create a non-draft PR to `main` summarizing DB hardening, UI change, portal boundaries, RED/GREEN evidence, advisor results and remaining deferred payment-ledger scope.
