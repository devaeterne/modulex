# Vendor Catalog Family Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Vendor Imports with scoped category discovery, check-before-sync counts, family/variant grouping, persistent vendor→Modulex category/type/UOM mappings, server-side review pagination/filtering, safe approval recovery, and auditable sync runs.

**Architecture:** Keep vendor feeds as staging only. Adapters expose categories and scoped discovery; discovery derives a stable family identity and variant identity while preserving each vendor SKU. A check endpoint compares discovery hashes without mutating catalog items and records a durable audit snapshot; sync persists only the selected scope. Approval resolves a required mapping before canonical product creation and uses the family key as `base_product_code`, while each SKU remains its own `products` row. Store media remains draft-only and vendor images are archived to `store-media` only on approval.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/Postgres/RLS, Shopify public JSON, WooCommerce Store API, TailAdmin/Modulex shared UI primitives, sharp, GitHub Actions.

**Spec:** Conversation-approved Vendor Catalog Review v3 scope, 2026-09-02.

## Global Constraints

- Start from current `main`; do not merge automatically.
- Vendor sync never auto-publishes Store content.
- Vendor price remains reference-only; Modulex selling-price gate stays authoritative.
- No browser service-role/elevated credentials.
- Data-heavy review uses server-side pagination/filter/search and stale-response protection.
- Mapping absence fails closed; never guess Product Type/UOM/category.
- Existing vendor SKU is preserved; family grouping must not rewrite sellable SKU identity.
- Unknown/unsafe family inference stays ungrouped rather than merging incorrectly.
- Approval sets `APPROVED` only after canonical product + Store draft + media pipeline succeeds.
- Modified Admin feature UI must use shared Modulex primitives and pass `smoke:admin-ui-strict`.
- Schema changes are source-controlled only in this PR; production migration is not applied before merge.

---

### Task 1: Extend vendor domain and adapters for scoped categories and family identity

**Files:**
- Modify: `modulex-admin/src/lib/vendor-catalog/domain.ts`
- Modify: `modulex-admin/src/lib/vendor-catalog/adapters.ts`
- Test: `modulex-admin/scripts/vendor-catalog-sync-contract.mjs`

**Interfaces:**
- Produces `VendorCatalogCategory`, `VendorCatalogDiscoveryScope`, `familyKey`, `variantCode`, `variantLabel`, adapter `listCategories()` and `discover(scope?)`.
- Karran category scope uses collection handle; Ruvati scope uses Woo category id/slug.

- [ ] Add failing contract assertions for category discovery, scoped endpoints, and family fields.
- [ ] Verify Vendor Catalog workflow fails on the new assertions.
- [ ] Implement category listing/scoped discovery and conservative Karran color-family inference.
- [ ] Keep unknown suffixes as their own family and preserve SKU exactly.
- [ ] Verify contract GREEN.

### Task 2: Add durable category mapping and check/audit schema

**Files:**
- Create: `modulex-admin/sql/vendor-catalog-sync-family-v3.sql`
- Create: `modulex-store/supabase/migrations/20260902093000_vendor_catalog_sync_family_v3.sql`
- Modify: `modulex-admin/scripts/vendor-catalog-sync-contract.mjs`

**Interfaces:**
- Adds item columns: vendor category key/label, family key, variant code/label.
- Adds `vendor_catalog_category_mappings` with unique `(vendor_code, vendor_category_key)` and FK to Modulex category/type/UOM.
- Adds run scope/mode fields for audit and `vendor_catalog_checks` / `vendor_catalog_check_items` for check-before-sync snapshots.

- [ ] Add RED contract assertions for schema, uniqueness, checks, indexes, RLS and mirrored migration.
- [ ] Verify RED.
- [ ] Implement additive SQL with admin/service-role policies and fail-closed FK/check constraints.
- [ ] Verify production data is compatible read-only; do not apply migration.
- [ ] Verify GREEN.

### Task 3: Implement check-before-sync and scoped sync

**Files:**
- Modify: `modulex-admin/src/lib/vendor-catalog/sync.ts`
- Create: `modulex-admin/src/lib/vendor-catalog/check.ts`
- Create: `modulex-admin/src/app/api/vendor-catalog/check/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/sync/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/vendors/route.ts`
- Test: `modulex-admin/scripts/vendor-catalog-sync-contract.mjs`

**Interfaces:**
- `check` accepts vendor + optional category; returns discovered/new/updated/unchanged/willSync and durable check id.
- `sync` accepts vendor/category or check id; persists scoped products and run audit metadata.
- `vendors` returns vendor categories for selectors without exposing credentials.

- [ ] Add RED assertions for check route, snapshot ids, category scope and run audit.
- [ ] Verify RED.
- [ ] Implement check classification using existing discovery hashes without mutating catalog items.
- [ ] Implement scoped sync and selected-category audit fields.
- [ ] Keep scheduled cron as all-vendor full discovery while only changed items receive asset replacement.
- [ ] Verify GREEN.

### Task 4: Add category/type/UOM mapping APIs and approval guards

**Files:**
- Create: `modulex-admin/src/lib/vendor-catalog/mappings.ts`
- Create: `modulex-admin/src/app/api/vendor-catalog/category-mappings/route.ts`
- Modify: `modulex-admin/src/lib/vendor-catalog/approve.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/items/[itemId]/approve/route.ts`
- Test: `modulex-admin/scripts/vendor-catalog-sync-contract.mjs`

**Interfaces:**
- Mapping API lists active Modulex categories/types/UOMs, creates a new category when explicitly requested, or maps to an existing category.
- Approval returns structured `CATEGORY_MAPPING_REQUIRED` when absent.
- Approval uses mapped Product Type/UOM/category and family key; SKU remains unique product row.

- [ ] Add RED assertions that hard-coded `SINK` resolution is removed and mapping is mandatory.
- [ ] Verify RED.
- [ ] Implement mapping resolution/creation under authenticated admin boundary.
- [ ] Validate active category/type/UOM and allowed UOM relationship where present.
- [ ] Update product creation to `base_product_code=family_key`, variant code/color label from staging, and media `color_code` per variant.
- [ ] Preserve retry/idempotency and only set `APPROVED` at the end.
- [ ] Verify GREEN.

### Task 5: Upgrade Vendor Imports review UI

**Files:**
- Modify: `modulex-admin/src/app/(admin)/products/vendor-imports/page.tsx`
- Test: `modulex-admin/scripts/vendor-catalog-sync-contract.mjs`

**Interfaces:**
- Separate review filters from sync controls.
- Server-side DB range/count pagination: 25/50/100.
- Search SKU/title/external id, vendor, category, review status, change state, linked/unlinked, sort.
- Check Updates shows discovered/new/updated/unchanged/will sync before Sync New + Updated.
- Family presentation shows family key + variant count; approve one SKU or selected family.
- Mapping-required state renders shared Alert + editable category input + existing category/type/UOM selectors.
- Approved rows expose `Edit Product`, `Edit Store Product`, source link; incomplete legacy approved rows expose `Complete Import`.

- [ ] Add RED UI contract assertions for pagination, filters, independent sync vendor/category, check results, mapping panel, family controls and edit links.
- [ ] Verify RED.
- [ ] Implement with `PageBreadCrumb`, `ComponentCard`, `Label`, `InputField`, `Select`, `Checkbox`, `Alert`, `Badge`, `Button`, `Modal` only where needed, and shared table primitives.
- [ ] Prevent stale query responses via request id and reset page on filter changes.
- [ ] Verify strict Admin UI contract GREEN.

### Task 6: Documentation, roadmap, audit and final verification

**Files:**
- Modify: `modulex-admin/docs/VENDOR_CATALOG_SYNC.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `.github/workflows/admin-vendor-catalog-sync.yml` only if new paths require coverage.

- [ ] Document vendor/category selection, Check Updates, mapping behavior, family semantics, legacy recovery and cron behavior.
- [ ] Mark Vendor Catalog Review v3 `[~]` in roadmap; do not mark complete before merged/deployed production acceptance.
- [ ] Run Vendor Catalog workflow, Admin UI workflow, typecheck, lint and production build.
- [ ] Review migration against production schema/data read-only and run Security/Performance advisors only if supported without applying DDL.
- [ ] Review final diff for no service-role leakage, no auto-publish, no vendor-price publication and no unrelated changes.
- [ ] Open one draft PR from `feat/vendor-catalog-family-sync` to `main`; do not merge.
