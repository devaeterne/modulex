# Project & Order Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure shared Project/Order attachments with multi-file Admin upload, private preview/download, append-safe deactivation, and Project visibility of linked Order documents.

**Architecture:** A canonical `entity_documents` table and private `entity-documents` Storage bucket own metadata and bytes. RPCs own registration/list/deactivation and Project aggregation; one reusable Admin component is mounted on Project Documents and Order Detail while accepted Proposal PDFs remain a separate immutable system-document surface.

**Tech Stack:** PostgreSQL/Supabase RLS + Storage, Next.js 16, React 19, TypeScript, existing Modulex Admin shared UI primitives, Node smoke contracts.

**Spec:** `docs/superpowers/specs/2026-09-10-project-order-documents-design.md`

## Global Constraints

- Canonical shared migrations live in `modulex-store/supabase/migrations`.
- No browser service-role/elevated credential.
- Maximum file size is 25 MiB.
- Supported files: PDF, JPEG, PNG, WEBP, DOCX, XLSX and CSV.
- Metadata lifecycle is append-safe; deactivation retains bytes/history.
- Accepted Proposal PDFs remain immutable system documents.
- Admin feature UI uses shared Modulex primitives and must satisfy the strict UI contract.

---

### Task 1: Canonical document database/storage contract

**Files:**
- Create: `modulex-store/supabase/migrations/20260910173000_project_order_entity_documents.sql`
- Modify: `modulex-admin/scripts/customer-detail-integrity-contract.mjs`

**Interfaces:**
- Produces: `entity_documents`, `list_entity_documents(text,uuid,boolean)`, `register_entity_document(text,uuid,text,text,text,bigint,text,text)`, `deactivate_entity_document(uuid)` and private Storage policies.

- [ ] **Step 1: Extend the smoke contract first** with assertions for a private `entity-documents` bucket, 25 MiB limit, allowed MIME types, entity/document-type checks, pinned RPC search paths, authenticated-only execute grants, append-safe deactivation, and linked Order reads for Project mode.
- [ ] **Step 2: Verify RED in PR CI**: the contract must fail while the migration is absent.
- [ ] **Step 3: Add the migration** defining the table, indexes required by entity/project aggregation, RLS/grants, private bucket configuration, guarded Storage policies, canonical lifecycle RPCs, validation and Customer activity writes.
- [ ] **Step 4: Verify GREEN in PR CI** with the targeted customer-detail contract and database/static contracts.

### Task 2: Shared Admin document panel

**Files:**
- Create: `modulex-admin/src/components/customers/EntityDocumentsPanel.tsx`
- Modify: `modulex-admin/scripts/customer-detail-integrity-contract.mjs`

**Interfaces:**
- Consumes: canonical entity document RPCs and `entity-documents` Storage bucket.
- Produces: `EntityDocumentsPanel({ entityType, entityId, includeLinkedOrders?, title? })`.

- [ ] **Step 1: Add RED contract assertions** for multi-file input, accepted extensions, 25 MiB client guard, canonical registration/list/deactivation RPC usage, 60-second signed access, orphan cleanup and no direct metadata mutation.
- [ ] **Step 2: Verify RED in PR CI** because the component does not exist yet.
- [ ] **Step 3: Implement the panel** with shared `ComponentCard`, `Input`, `Select`, `Label`, `Button`, `Alert`, `Badge` and Table primitives; support loading/empty/error/retry, sequential multi-file upload, source labels, preview/download and deactivate.
- [ ] **Step 4: Verify GREEN in PR CI**, including `smoke:admin-ui-strict`, typecheck and lint.

### Task 3: Project and Order integration

**Files:**
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectDocumentsTab.tsx`
- Create: `modulex-admin/src/components/customers/OrderDocumentsPanel.tsx`
- Modify: `modulex-admin/src/app/(admin)/customers/[id]/orders/[orderId]/page.tsx`
- Modify: `modulex-admin/scripts/customer-detail-integrity-contract.mjs`

**Interfaces:**
- Project: `EntityDocumentsPanel` with `entityType="project"` and `includeLinkedOrders`.
- Order: `OrderDocumentsPanel` resolves `orderId` from route params and mounts `EntityDocumentsPanel` with `entityType="order"`.

- [ ] **Step 1: Add RED integration assertions** that Project Documents contains Uploaded Documents plus System Documents, linked Orders are included, and Order Detail mounts Documents & Photos.
- [ ] **Step 2: Verify RED in PR CI** against the pre-change UI.
- [ ] **Step 3: Update Project Documents** to mount the shared uploaded-documents panel and retain the existing Proposal artifact table under `System Documents`.
- [ ] **Step 4: Add Order integration** through a small route-aware wrapper so the large Order domain component remains untouched.
- [ ] **Step 5: Verify GREEN in PR CI** with customer detail, Order, Admin UI strict, RBAC, typecheck, lint and build gates.

### Task 4: PR verification and handoff

**Files:**
- No new product files unless CI reveals an in-scope defect.

- [ ] **Step 1: Review the branch diff** for unrelated changes, direct privileged browser access, destructive metadata/file deletes, or Proposal artifact regressions.
- [ ] **Step 2: Confirm PR CI results** and record any environment-only checks that cannot execute in GitHub.
- [ ] **Step 3: Open the PR against current `main`** with migration/deployment status explicitly marked as not applied to production before merge.