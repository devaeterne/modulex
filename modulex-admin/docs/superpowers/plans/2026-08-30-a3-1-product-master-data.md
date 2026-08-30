# A3.1 Product Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Admin A3.1 product-master integrity, lifecycle controls, canonical variant editing, and full CSV export without weakening A1/A2 history.

**Architecture:** Keep `products` as the variant table and `base_product_code` as the family key. Enforce invariants in PostgreSQL so browser, bulk, and future service writes cannot bypass them; expose a narrow lifecycle RPC for status changes. Extend existing Admin product surfaces rather than introducing a parallel master-data UI.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Supabase/PostgreSQL, Node contract scripts, GitHub Actions.

**Spec:** `modulex-admin/docs/superpowers/specs/2026-08-30-a3-1-product-master-data-design.md`

## Global Constraints

- `products` remains the stockable/sellable variant source; do not introduce a second product-master table.
- Preserve existing A1 order and A2 inventory/movement semantics.
- Store public catalog remains published-content + active-variant only and must continue using canonical taxonomy FKs.
- Do not physically delete products from Admin product-master workflows.
- Production currently has 462 active products and must require no data backfill for these new guards.
- Bulk import remains deferred; full canonical CSV export is in scope.

---

### Task 1: Permanent A3.1 Contract

**Files:**
- Create: `modulex-admin/scripts/a3-product-master-contract.mjs`
- Modify: `modulex-admin/package.json`
- Create: `.github/workflows/admin-a3-product-master.yml`

**Interfaces:**
- Consumes: approved A3.1 design and existing product/taxonomy components.
- Produces: `npm run smoke:a3-product-master` and CI gate that detects missing SQL/UI/lifecycle/export requirements.

- [ ] **Step 1:** Add contract assertions for the A3.1 SQL bundle, lifecycle RPC usage, required family/color form fields, taxonomy protected mutation usage, complete CSV export path, roadmap/acceptance artifacts, and Store canonical taxonomy migration preservation.
- [ ] **Step 2:** Run the contract before implementation and verify RED because A3.1 SQL/RPC/export/form wiring is absent.
- [ ] **Step 3:** Add the smoke script to `package.json` and a targeted GitHub Actions workflow that also runs A1/A2 regressions, RBAC, typecheck, lint, and production build.

### Task 2: Database Product-Master Guards

**Files:**
- Create: `modulex-admin/sql/a3-product-master-data.sql`

**Interfaces:**
- Produces: `set_product_status(uuid, product_status)` lifecycle RPC plus product/taxonomy integrity triggers and indexes.

- [ ] **Step 1:** Normalize/validate SKU, barcode, base product code, and color code before writes; reject blank required canonical values.
- [ ] **Step 2:** Add case-insensitive unique indexes for SKU, non-null barcode, and `(base_product_code,color_code)`.
- [ ] **Step 3:** Add family brand/category consistency guard.
- [ ] **Step 4:** Replace product taxonomy FKs with `ON DELETE RESTRICT` and set canonical taxonomy/family/color columns `NOT NULL` after production preflight proves compatibility.
- [ ] **Step 5:** Add taxonomy rename mirror synchronization and block taxonomy deactivation while referenced by active products.
- [ ] **Step 6:** Add lifecycle guard: archived is terminal; active/inactive -> archived and active -> inactive require zero on-hand and zero reserved quantity.
- [ ] **Step 7:** Add authenticated, role-checked `SECURITY INVOKER` lifecycle RPC; revoke public execution and grant only authenticated/service role as appropriate.

### Task 3: Canonical Product Create/Edit

**Files:**
- Modify: `modulex-admin/src/components/products/ProductForm.tsx`

**Interfaces:**
- Consumes: canonical product columns and active taxonomy rows.
- Produces: browser create/edit payloads containing family/color master fields and canonical taxonomy mirrors.

- [ ] **Step 1:** Add `base_product_code`, `color_code`, and `color_name` to form state, read query, duplicate behavior, validation, and payload.
- [ ] **Step 2:** Require brand/category/family/color selections in UI validation.
- [ ] **Step 3:** Preserve existing QR fields on edit and continue generating no QR metadata directly from the product form.
- [ ] **Step 4:** Improve database constraint/RPC error mapping so duplicate SKU/barcode/family-color and family-taxonomy conflicts are actionable to operators.

### Task 4: Protected Lifecycle and Complete CSV Export

**Files:**
- Modify: `modulex-admin/src/components/products/ProductsTable.tsx`
- Modify/Create SQL read RPC only if necessary for export completeness.

**Interfaces:**
- Consumes: `set_product_status`, existing `get_products_page` pagination/filter contract.
- Produces: status actions through protected RPC and full filtered canonical CSV export.

- [ ] **Step 1:** Replace direct product status updates with `set_product_status` RPC.
- [ ] **Step 2:** Keep archive confirmation, disable archived reactivation, and surface stock/lifecycle rejection clearly.
- [ ] **Step 3:** Implement CSV export by exhausting bounded deterministic `get_products_page` pages for the active filters/sort until `total_count` is reached; never export only the current page.
- [ ] **Step 4:** Include canonical columns in CSV: SKU, barcode, name, base product code, color code/name, brand, category, unit, minimum stock, status.
- [ ] **Step 5:** Extend `get_products_page` fixed projection with family/color fields if required by the export/list contract while preserving exact count/pagination behavior.

### Task 5: Taxonomy Integrity UI

**Files:**
- Modify: `modulex-admin/src/components/products/TaxonomyManager.tsx`

**Interfaces:**
- Consumes: DB taxonomy guards.
- Produces: operator messaging aligned with restrictive delete/deactivation rules.

- [ ] **Step 1:** Update delete confirmation copy to state that referenced taxonomy cannot be deleted rather than implying products keep stale text only.
- [ ] **Step 2:** Surface database guard failures for referenced delete/deactivation with actionable messages.
- [ ] **Step 3:** Preserve create/rename/reactivate behavior and existing route/RBAC boundary.

### Task 6: Acceptance and Roadmap Closeout

**Files:**
- Create: `modulex-admin/docs/acceptance/a3-1-product-master-data.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces: permanent production evidence and A3.1 closed roadmap state.

- [ ] **Step 1:** Run repository verification: A3.1 contract, product list/UI contracts, A1 lifecycle/core, A2 inventory/movements/scanning/reporting, RBAC, typecheck, lint, build, and diff check.
- [ ] **Step 2:** Apply the reviewed migration to production only after repository/client compatibility is ready; run reconciliation for 462 products, duplicate/family/taxonomy integrity, lifecycle rollback probes, grants/RLS/function security, and advisors.
- [ ] **Step 3:** Verify deployed Admin product create/edit/list/taxonomy routes and CSV behavior against the merged deployment SHA.
- [ ] **Step 4:** Record exact production evidence and mark all four A3.1 roadmap bullets complete only after post-deploy acceptance passes.
