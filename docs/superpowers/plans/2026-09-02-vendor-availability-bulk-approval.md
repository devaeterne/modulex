# Vendor Availability + Bulk Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track vendor sale eligibility independently from Modulex inventory/content changes, reconcile approved canonical SKU status safely, and add availability-filtered Select All + bulk approval to Vendor Imports.

**Architecture:** Extend the existing Vendor Catalog normalization with a separate availability state/hash, persist it on staging rows, and reconcile linked canonical `products.status` only from fresh vendor observations. Keep Store editorial publish state family-level and untouched; the public Store already filters inactive canonical variants. Bulk approval reuses the existing idempotent single-item approval pipeline through bounded server-validated chunks.

**Tech Stack:** Next.js 16 App Router, React/TypeScript, Supabase/Postgres/RLS, supabase-js, existing TailAdmin primitives, Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-vendor-availability-bulk-approval-design.md`

## Global Constraints

- Vendor availability is external sale eligibility, never Modulex warehouse on-hand inventory.
- Availability statuses are exactly `AVAILABLE | OUT_OF_STOCK | UNAVAILABLE | UNKNOWN | MISSING`.
- `OUT_OF_STOCK`, `UNAVAILABLE`, `UNKNOWN`, and `MISSING` are fail-closed for single and bulk approval.
- Availability must not change the existing content `discovery_hash`, `change_state`, or reset approved content to `PENDING`.
- Store family editorial `store_product_content.is_published` is never used as a stock switch.
- A vendor-driven inactive canonical SKU may auto-reactivate only if it has not been manually changed since Modulex applied vendor inactivity; archived products never auto-reactivate.
- Category-scoped absence never increments missing counters; two consecutive successful full-vendor absences are required for `MISSING`.
- Bulk approval processes at most 5 item IDs per HTTP batch with approval concurrency at most 2.
- No automatic category/type/UOM creation during bulk approval.
- No Modulex selling price creation and no Store auto-publish.
- Browser never receives service-role/secret keys and never writes canonical approval state directly.
- All changed admin feature UI uses shared TailAdmin primitives and must pass strict Admin UI contract.
- Production migration is not applied from this feature branch.
- Supabase public-schema Data API grants/RLS are explicit where needed because automatic public-table exposure is no longer safe to assume.

---

## File Map

**Domain / normalization**
- Modify `modulex-admin/src/lib/vendor-catalog/domain.ts` — availability types, stable availability hash, approval eligibility helpers.
- Modify `modulex-admin/src/lib/vendor-catalog/adapters.ts` — Karran `variant.available`; Ruvati `is_in_stock` / `is_purchasable` / `low_stock_remaining` normalization.

**Persistence / reconciliation**
- Create `modulex-admin/src/lib/vendor-catalog/availability.ts` — availability comparison and canonical active/inactive reconciliation.
- Modify `modulex-admin/src/lib/vendor-catalog/check.ts` — persist availability in check snapshots and report availability counts.
- Modify `modulex-admin/src/lib/vendor-catalog/sync.ts` — availability-only persistence, missing tracking for successful full-vendor runs, canonical reconciliation and run counters.
- Modify `modulex-admin/src/lib/vendor-catalog/approve.ts` — fail-closed availability guard before expensive enrichment/image work.

**API / bulk**
- Create `modulex-admin/src/app/api/vendor-catalog/bulk/eligible/route.ts` — auth-protected resolution of eligible IDs for the complete current filter result set.
- Create `modulex-admin/src/app/api/vendor-catalog/bulk/approve/route.ts` — max 5 explicit IDs, server revalidation, concurrency 2, per-item success/skip/failure results using `approveVendorCatalogItem`.
- Modify `modulex-admin/src/app/api/vendor-catalog/items/[itemId]/approve/route.ts` only if needed to map availability rejection to a structured non-500 response.

**UI**
- Modify `modulex-admin/src/app/(admin)/products/vendor-imports/page.tsx` — availability filter/badge, row/header checkbox, filtered Select All, selected count/progress, chunked bulk approval.

**Schema**
- Create `modulex-store/supabase/migrations/<generated>_vendor_catalog_availability_bulk_approval.sql` — availability columns/checks/indexes and run/check count columns; preserve existing RLS/grant model.
- Mirror canonical SQL only if this repo maintains a canonical Vendor Catalog schema file for the affected objects; do not create a second schema authority.

**Contracts / CI / docs**
- Create `modulex-admin/scripts/vendor-availability-contract.mjs` — domain/adapter/sync/approval/UI/schema source contract.
- Modify `.github/workflows/admin-vendor-catalog-sync.yml` — run new contract before typecheck/lint/build.
- Modify `modulex-admin/README.md` Vendor Catalog section and `roadmap.md` acceptance/status entries only after behavior is implemented.

---

### Task 1: Availability Domain Contract and Migration

**Files:**
- Create: `modulex-admin/scripts/vendor-availability-contract.mjs`
- Modify: `.github/workflows/admin-vendor-catalog-sync.yml`
- Modify: `modulex-admin/src/lib/vendor-catalog/domain.ts`
- Create: `modulex-store/supabase/migrations/<generated>_vendor_catalog_availability_bulk_approval.sql`

**Interfaces:**
- Produces: `VendorAvailabilityStatus`, `NormalizedVendorAvailability`, `stableAvailabilityHash(product)`, `isVendorApprovalEligible(status)`.
- Produces DB columns: `availability_status`, `vendor_available`, `vendor_purchasable`, `vendor_stock_quantity`, `availability_hash`, `availability_changed_at`, `missing_success_count`, `canonical_inactivated_by_vendor_at`, `canonical_status_version_at`, `reactivation_requires_review`.

- [ ] **Step 1: Add a failing source contract**

Create a Node contract that asserts the domain exports/contains all availability statuses and helpers, the migration contains explicit availability constraints/indexes, and the Vendor Catalog workflow invokes the contract.

```js
assert.match(domain, /AVAILABLE/);
assert.match(domain, /stableAvailabilityHash/);
assert.match(domain, /isVendorApprovalEligible/);
assert.match(migration, /availability_status/);
assert.match(migration, /reactivation_requires_review/);
assert.match(workflow, /vendor-availability-contract\.mjs/);
```

- [ ] **Step 2: Run RED**

Run from `modulex-admin`:

```bash
node scripts/vendor-availability-contract.mjs
```

Expected: FAIL because availability domain/schema do not exist yet.

- [ ] **Step 3: Implement domain primitives**

Add:

```ts
export type VendorAvailabilityStatus =
  | "AVAILABLE"
  | "OUT_OF_STOCK"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "MISSING";

export type NormalizedVendorAvailability = {
  status: VendorAvailabilityStatus;
  available: boolean | null;
  purchasable: boolean | null;
  stockQuantity: number | null;
};
```

Extend `NormalizedVendorProduct` with `availability: NormalizedVendorAvailability`. `stableDiscoveryHash()` must continue hashing content only. `stableAvailabilityHash()` hashes only normalized availability fields. `isVendorApprovalEligible()` returns true only for `AVAILABLE`.

- [ ] **Step 4: Add migration with safe legacy defaults**

Use a generated Supabase migration filename. Add columns with legacy rows defaulting to `UNKNOWN`, indexes on `(availability_status, review_status)` and `(vendor_code, availability_status)`, and `check` constraints for status/non-negative missing count. Add availability count columns to `vendor_catalog_runs` and `vendor_catalog_checks` rather than a new audit subsystem. Do not deactivate canonical products in the migration.

- [ ] **Step 5: Run GREEN**

```bash
node scripts/vendor-availability-contract.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/admin-vendor-catalog-sync.yml modulex-admin/scripts/vendor-availability-contract.mjs modulex-admin/src/lib/vendor-catalog/domain.ts modulex-store/supabase/migrations/*vendor_catalog_availability_bulk_approval.sql
git commit -m "feat: add vendor availability domain"
```

---

### Task 2: Normalize Karran and Ruvati Availability

**Files:**
- Modify: `modulex-admin/src/lib/vendor-catalog/adapters.ts`
- Modify: `modulex-admin/scripts/vendor-availability-contract.mjs`

**Interfaces:**
- Consumes: `NormalizedVendorAvailability` from Task 1.
- Produces: every discovered Karran/Ruvati `NormalizedVendorProduct` has a deterministic `availability` value.

- [ ] **Step 1: Extend RED contract with vendor fixtures**

Require Karran variant type to include `available?: boolean` and Woo product type to include `is_in_stock?: boolean`, `is_purchasable?: boolean`, `low_stock_remaining?: number | null`. Require normalization branches:

```text
Karran true -> AVAILABLE
Karran false -> UNAVAILABLE
Karran absent -> UNKNOWN
Woo purchasable false -> UNAVAILABLE
Woo purchasable true + in_stock false -> OUT_OF_STOCK
Woo purchasable true + in_stock true -> AVAILABLE
missing required Woo booleans -> UNKNOWN
```

- [ ] **Step 2: Run RED**

```bash
node scripts/vendor-availability-contract.mjs
```

Expected: FAIL on adapter availability assertions.

- [ ] **Step 3: Implement Karran normalization**

Extend `ShopifyProduct.variants` with `available?: boolean`. Map `true` to `{status:"AVAILABLE", available:true, purchasable:true, stockQuantity:null}`, `false` to `{status:"UNAVAILABLE", available:false, purchasable:false, stockQuantity:null}`, and absent to UNKNOWN/null booleans. Production staging already proves Karran payloads contain `variant.available`, so source payload remains untouched.

- [ ] **Step 4: Implement Ruvati normalization**

Extend `WooProduct` and map `is_purchasable` before `is_in_stock`. Use `low_stock_remaining` only as nullable `stockQuantity` reference when it is a finite non-negative number; never map it to Modulex inventory.

- [ ] **Step 5: Preserve sitemap fallback as UNKNOWN**

Ruvati sitemap discovery has no reliable sale eligibility, so every sitemap-only normalized product must use UNKNOWN and therefore cannot approve until Woo Store API observation succeeds.

- [ ] **Step 6: Run GREEN and commit**

```bash
node scripts/vendor-availability-contract.mjs
npm run typecheck
git add modulex-admin/src/lib/vendor-catalog/adapters.ts modulex-admin/scripts/vendor-availability-contract.mjs
git commit -m "feat: normalize vendor availability"
```

---

### Task 3: Check Snapshot and Availability-Only Sync

**Files:**
- Modify: `modulex-admin/src/lib/vendor-catalog/check.ts`
- Modify: `modulex-admin/src/lib/vendor-catalog/sync.ts`
- Create: `modulex-admin/src/lib/vendor-catalog/availability.ts`
- Modify: `modulex-admin/scripts/vendor-availability-contract.mjs`

**Interfaces:**
- Produces: check snapshots containing availability; `VendorCatalogCheckResult`/`VendorCatalogSyncResult` availability counters.
- Produces: `reconcileVendorAvailability(item, nextAvailability, now)` used after staging persistence.

- [ ] **Step 1: Add RED contract for hash separation and sync persistence**

Require `check.ts` to serialize/deserialize availability, require `sync.ts` to calculate/persist `availability_hash` independently, and require availability-only candidates even when `changeState === "UNCHANGED"`.

- [ ] **Step 2: Run RED**

```bash
node scripts/vendor-availability-contract.mjs
```

Expected: FAIL on check/sync availability persistence.

- [ ] **Step 3: Extend Check Updates**

Load both `discovery_hash` and `availability_hash`, compare both, persist availability in `vendor_catalog_check_items.normalized_payload`, and return counters:

```ts
availabilityChanged: number;
available: number;
outOfStock: number;
unavailable: number;
unknown: number;
missing: number;
```

`willSync` remains `created + updated` only.

- [ ] **Step 4: Extend sync candidate selection**

A row must be persisted when content is NEW/UPDATED, classification backfill is needed, or availability hash/status changed. Asset delete/reinsert remains only for content-changed rows. Availability-only updates must preserve review status and details/media.

- [ ] **Step 5: Implement explicit unavailability reconciliation**

In `availability.ts`, load linked canonical product status/updated_at. For AVAILABLE -> OUT_OF_STOCK/UNAVAILABLE, if canonical is active set it inactive, then persist the canonical resulting `updated_at` as `canonical_status_version_at`, set `canonical_inactivated_by_vendor_at`, and clear review-required marker.

- [ ] **Step 6: Implement safe recovery**

For next AVAILABLE, auto-reactivate only when vendor inactivity marker exists, canonical is inactive, canonical `updated_at` exactly matches the stored vendor-applied version, and product is not archived. If the version differs, keep inactive and set `reactivation_requires_review=true`.

- [ ] **Step 7: Run GREEN and commit**

```bash
node scripts/vendor-availability-contract.mjs
npm run typecheck
git add modulex-admin/src/lib/vendor-catalog/check.ts modulex-admin/src/lib/vendor-catalog/sync.ts modulex-admin/src/lib/vendor-catalog/availability.ts modulex-admin/scripts/vendor-availability-contract.mjs
git commit -m "feat: reconcile vendor availability"
```

---

### Task 4: Missing Detection on Successful Full-Vendor Runs

**Files:**
- Modify: `modulex-admin/src/lib/vendor-catalog/sync.ts`
- Modify: `modulex-admin/src/lib/vendor-catalog/availability.ts`
- Modify: `modulex-admin/scripts/vendor-availability-contract.mjs`

**Interfaces:**
- Consumes: full-vendor sync iff `scope.categoryKey` is null and discovery completed successfully.
- Produces: two-successful-full-run `MISSING` transition and canonical inactivity.

- [ ] **Step 1: Add RED contract**

Require full-vendor-only missing reconciliation, threshold `2`, reset-on-seen behavior, and no missing advancement in failure path/category-scoped path.

- [ ] **Step 2: Run RED**

```bash
node scripts/vendor-availability-contract.mjs
```

- [ ] **Step 3: Implement successful full-run absence reconciliation**

After discovery/persistence succeeds, compare existing vendor item external IDs to discovered IDs. For absent rows increment `missing_success_count`; at count >=2 set availability MISSING and reconcile canonical inactivity. Seen rows reset missing count to 0. Category-scoped runs do not touch missing counters.

- [ ] **Step 4: Ensure failed/partial runs do not advance missing**

Do not execute absence reconciliation until all required persistence succeeds. Any thrown sync failure returns FAILED without missing updates.

- [ ] **Step 5: Run GREEN and commit**

```bash
node scripts/vendor-availability-contract.mjs
npm run typecheck
git add modulex-admin/src/lib/vendor-catalog/sync.ts modulex-admin/src/lib/vendor-catalog/availability.ts modulex-admin/scripts/vendor-availability-contract.mjs
git commit -m "feat: track missing vendor products"
```

---

### Task 5: Fail-Closed Single Approval and Bulk Approval APIs

**Files:**
- Modify: `modulex-admin/src/lib/vendor-catalog/approve.ts`
- Create: `modulex-admin/src/app/api/vendor-catalog/bulk/eligible/route.ts`
- Create: `modulex-admin/src/app/api/vendor-catalog/bulk/approve/route.ts`
- Modify: `modulex-admin/src/app/api/vendor-catalog/items/[itemId]/approve/route.ts`
- Modify: `modulex-admin/scripts/vendor-availability-contract.mjs`

**Interfaces:**
- Produces structured code `VENDOR_UNAVAILABLE` for single-item stale calls.
- Eligible resolver input mirrors Vendor Imports server-side filters: vendor, category, review status, change states, linked, search, availability.
- Bulk approve body: `{ itemIds: string[] }`, length 1..5.
- Bulk response: `{ results: Array<{itemId,status:"APPROVED"|"SKIPPED"|"FAILED",code?:string,error?:string,productId?:string,storeProductContentId?:string|null}> }`.

- [ ] **Step 1: Add RED approval/bulk contract**

Require `approveVendorCatalogItem` to read `availability_status` and reject anything other than AVAILABLE before adapter enrichment/image download. Require bulk route max 5 and concurrency 2, and eligible resolver to include `availability_status='AVAILABLE'` plus mapping readiness.

- [ ] **Step 2: Run RED**

```bash
node scripts/vendor-availability-contract.mjs
```

- [ ] **Step 3: Implement single approval guard**

Extend staging item select with availability fields. Throw a dedicated `VendorUnavailableError` before enrichment. Route returns HTTP 409 with `{code:"VENDOR_UNAVAILABLE", availabilityStatus}` rather than 500.

- [ ] **Step 4: Implement eligible-ID resolver**

Authorize admin. Query `vendor_catalog_items` using the exact current filters and `availability_status=AVAILABLE`. Join/check `vendor_catalog_category_mappings` so returned IDs have an active mapping to category/product type/UOM. Return stable ordered IDs and total eligible count. Do not mutate state.

- [ ] **Step 5: Implement bounded bulk endpoint**

Authorize admin, reject >5 IDs with 400, dedupe IDs, re-read availability/review/mapping server-side, and run at concurrency 2. Call the same `approveVendorCatalogItem` used by single approval. Mapping/unavailable/stale conditions return SKIPPED with code; independent item failures return FAILED and do not abort the batch.

- [ ] **Step 6: Run GREEN and commit**

```bash
node scripts/vendor-availability-contract.mjs
npm run typecheck
npm run lint
git add modulex-admin/src/lib/vendor-catalog/approve.ts modulex-admin/src/app/api/vendor-catalog/bulk modulex-admin/src/app/api/vendor-catalog/items/[itemId]/approve/route.ts modulex-admin/scripts/vendor-availability-contract.mjs
git commit -m "feat: add safe vendor bulk approval"
```

---

### Task 6: Vendor Imports Availability Filter and Selection UX

**Files:**
- Modify: `modulex-admin/src/app/(admin)/products/vendor-imports/page.tsx`
- Modify: `modulex-admin/scripts/vendor-availability-contract.mjs`

**Interfaces:**
- Consumes persisted availability and bulk APIs from prior tasks.
- Produces page selection state scoped to current filters and bulk progress.

- [ ] **Step 1: Add RED UI contract**

Require `availability_status` in `VENDOR_CATALOG_SELECT`, Availability filter options, shared Checkbox header/row usage, `Approve Selected`, filtered-selection action, and progress copy.

- [ ] **Step 2: Run RED**

```bash
node scripts/vendor-availability-contract.mjs
```

- [ ] **Step 3: Add server-side availability filter and badge**

Add state `availabilityFilter` with All/Available/Out of Stock/Unavailable/Unknown/Missing. Apply `.eq("availability_status", ...)` before pagination. Render a Badge column. Disable single/family approval action for non-AVAILABLE rows with explanatory text.

- [ ] **Step 4: Add current-page selection**

Add `selectedIds: Set<string>`. Row checkbox is checked/enabled only for rows that are AVAILABLE and mapping-ready as resolved by the bulk eligible endpoint/cache. Header checkbox selects/deselects eligible rows on the loaded page. Any search/filter/review scope change clears selection.

- [ ] **Step 5: Add complete filtered Select All**

When page eligible count is smaller than total eligible filtered count, expose `Select all N eligible filtered products`. Call eligible resolver with current filters and replace selection with returned IDs. Always show selected count.

- [ ] **Step 6: Add chunked bulk approve with progress**

Split selected IDs into chunks of 5. Send batches sequentially to avoid stacking 300-second image work; each server batch internally runs max concurrency 2. Show `Approved X of N`, collect skipped/failed reasons, refresh table after completion, and keep failed/skipped IDs selected only when retry remains meaningful.

- [ ] **Step 7: Run GREEN and strict UI checks**

```bash
node scripts/vendor-availability-contract.mjs
npm run typecheck
npm run lint
npm run smoke:admin-ui
```

Expected: PASS; no native feature controls or hardcoded TailAdmin-violating appearance classes.

- [ ] **Step 8: Commit**

```bash
git add modulex-admin/src/app/(admin)/products/vendor-imports/page.tsx modulex-admin/scripts/vendor-availability-contract.mjs
git commit -m "feat: add vendor availability bulk review UI"
```

---

### Task 7: Acceptance Tests, Documentation, and Roadmap

**Files:**
- Modify: `modulex-admin/scripts/vendor-availability-contract.mjs`
- Modify: `modulex-admin/README.md`
- Modify: `roadmap.md`

**Interfaces:**
- Produces durable acceptance coverage for all spec invariants.

- [ ] **Step 1: Expand contract coverage**

Cover: Karran true/false/absent, Woo stock+purchasable combinations, hash separation, availability-only persistence, no review reset, approval rejection, bulk max/concurrency/revalidation, mapping fail-closed, canonical deactivate/reactivate/manual-review/archived rules, category-vs-full missing behavior, legacy UNKNOWN block, server-side availability filtering, TailAdmin selection controls.

- [ ] **Step 2: Update docs**

Document availability semantics, that vendor quantity never becomes Modulex inventory, bulk approval limits, and migration/deploy smoke sequence.

- [ ] **Step 3: Update roadmap acceptance/status**

Record Vendor Availability + Bulk Approval as implemented on branch/PR only; do not mark production migration/deploy complete before user merge/deploy.

- [ ] **Step 4: Commit**

```bash
git add modulex-admin/scripts/vendor-availability-contract.mjs modulex-admin/README.md roadmap.md
git commit -m "docs: record vendor availability acceptance"
```

---

### Task 8: Final Verification and PR

**Files:**
- No intended code changes; fixes discovered by verification must get their own focused commit.

- [ ] **Step 1: Verify branch is based on execution-time latest main**

Fetch latest `main` and all open PRs. If main advanced, compare changed files and integrate latest main without reverting unrelated work.

- [ ] **Step 2: Run Vendor Catalog gate**

```bash
cd modulex-admin
node scripts/vendor-catalog-sync-contract.mjs
node scripts/vendor-approval-idempotency-contract.mjs
node scripts/vendor-availability-contract.mjs
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 3: Run Admin UI gate**

Run the same strict Admin UI workflow commands used by `.github/workflows/admin-ui-foundation.yml`, including `npm run smoke:admin-ui` and the strict changed-file gate.

- [ ] **Step 4: Review migration security/performance statically**

Confirm no unsafe `SECURITY DEFINER`, explicit public-schema grants remain aligned with existing Data API access, indexes support new filters, and legacy backfill does not mutate canonical product status.

- [ ] **Step 5: Compare diff to latest main**

Expected diff contains only Vendor Catalog availability/bulk approval, migration, contracts/workflows, and roadmap/docs files.

- [ ] **Step 6: Open one draft PR**

PR summary must explicitly state:
- migration not applied to production;
- legacy rows start UNKNOWN until fresh sync;
- no vendor quantity writes Modulex inventory;
- Store editorial publish state is preserved;
- bulk approval excludes/revalidates unavailable products;
- final CI status.

Do not merge automatically.
