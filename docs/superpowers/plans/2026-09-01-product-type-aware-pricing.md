# Product Type Aware Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Admin product pricing through the Product Type `pricing_model` contract so price-group products remain on `product_prices`, countertop materials use canonical material bands, and unsupported/no-pricing products cannot be accidentally written into the wrong engine.

**Architecture:** `product_types.pricing_model` is the routing authority. The existing `product_prices + price_groups` engine remains canonical for `price_group`; `countertop_stone_product_profiles.material_price_band_id -> countertop_material_price_bands.price_per_sqft` remains canonical for `countertop_material_band`; `none` has no editable commercial price. Add a backward-compatible v2 pricing directory RPC plus a DB guard in the existing price mutation boundary. Admin UI uses shared Modulex primitives and a dedicated Material Bands route; no price amount is stored on Product Type or UOM.

**Tech Stack:** Next.js 16 / React / TypeScript, Tailwind via Modulex shared UI primitives, Supabase Postgres/RPC, GitHub Actions contracts.

**Spec:** Approved conversation design: Product Type selects pricing engine; UOM describes quantity semantics; Product Prices manages `price_group`; Material Bands manages B1-R22; Stone product profile selects a band; `none` is non-commercial.

## Global Constraints

- Do not move price amounts into `product_types`, `products`, or `units_of_measure`.
- Do not change Ramazan Bey's B1-R22 values automatically.
- Preserve `product_prices`, `price_groups`, pricing history/audit, Dealer no-fallback behavior, and existing bulk price workflow.
- Preserve the existing countertop calculator, edge/service pricing, and stone profile contract.
- Applied migrations are immutable; all DB work is additive.
- No service-role/elevated key in browser code.
- Use shared Modulex Admin UI primitives; route-level Tailwind is composition/layout only.
- No production migration or production business-data mutation before merge/review.

---

### Task 1: Lock the pricing-engine contract with RED tests

**Files:**
- Create: `modulex-admin/scripts/pricing-product-type-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `.github/workflows/admin-products-pricing-ui.yml`

**Interfaces:**
- Consumes: current Product Master `product_types.pricing_model`, `products.product_type_id`, `products.uom_id`, existing pricing and countertop tables.
- Produces: `npm run smoke:pricing-product-types` regression gate.

- [ ] **Step 1: Write failing contract assertions**

Require an additive migration containing `get_product_prices_page_v2`, product type/UOM joins, `pricing_model = 'price_group'` filtering, and a `set_product_price` guard that rejects non-`price_group` products. Require Product Prices UI to call the v2 RPC and expose Product Type/UOM filters. Require a `/pricing/material-bands` route using shared UI primitives and `upsert_countertop_reference` rather than direct browser updates.

- [ ] **Step 2: Run RED**

Run: `npm run smoke:pricing-product-types`
Expected: FAIL because the migration, v2 RPC and Material Bands UI do not exist.

- [ ] **Step 3: Wire the gate into the pricing workflow**

Add the script after the existing products/pricing UI contract so future PRs cannot regress engine routing.

- [ ] **Step 4: Commit**

Commit message: `test(pricing): define product type pricing contract`

---

### Task 2: Add the DB-authoritative pricing routing boundary

**Files:**
- Create: `modulex-store/supabase/migrations/20260901010000_pricing_product_type_routing.sql`

**Interfaces:**
- Produces: `public.get_product_prices_page_v2(...) -> jsonb`.
- Preserves: legacy `get_product_prices_page(...)` signature for rollback/older deployed clients.
- Hardens: `public.set_product_price(uuid, uuid, numeric, text)` without changing its signature.

- [ ] **Step 1: Verify production assumptions read-only**

Confirm all current products have `product_type_id`/`uom_id`; confirm pricing models are supported values; inspect current current-price rows on non-`price_group` products so the guard does not silently strand legitimate production behavior.

- [ ] **Step 2: Implement `get_product_prices_page_v2`**

The function must perform server-side search/filter/pagination and return only products whose Product Type `pricing_model = 'price_group'`. Each row returns `product_type_id`, `product_type_code`, `product_type_name`, `pricing_model`, `uom_id`, `uom_code`, `uom_name` in addition to the existing price map/stock/taxonomy fields. Filters include Product Type and UOM. Filter option payload includes only eligible Product Types/UOMs. Existing price groups, filled/missing price summary, selection IDs, status/brand/category/stock filters, deterministic sort, and USD behavior remain intact.

- [ ] **Step 3: Harden `set_product_price`**

After existing product existence/lifecycle validation, join the product to `product_types` and reject writes unless `pricing_model = 'price_group'` with a business-readable exception such as `This Product Type does not use Price Group pricing.`. Keep role checks, advisory lock, history close/insert behavior and return semantics unchanged.

- [ ] **Step 4: Preserve grants/security posture**

Keep functions `SECURITY INVOKER` unless the existing function explicitly requires otherwise; preserve pinned search path and authenticated execution model.

- [ ] **Step 5: Run migration contract**

Run: `npm run smoke:pricing-product-types`
Expected: migration assertions pass; UI assertions still fail until Task 3/4.

- [ ] **Step 6: Commit**

Commit message: `feat(pricing): route prices by product type`

---

### Task 3: Make Product Prices Product-Type/UOM aware

**Files:**
- Modify: `modulex-admin/src/components/pricing/ProductPricesServerTable.tsx`
- Test: `modulex-admin/scripts/pricing-product-type-contract.mjs`

**Interfaces:**
- Consumes: `get_product_prices_page_v2`.
- Preserves: `set_product_prices_bulk`, `get_product_prices_for_products`, bulk preview, unsaved-change guard, permission handling, exact pagination.

- [ ] **Step 1: Extend payload types**

Add Product Type/UOM metadata and filter options. Introduce `productTypeFilter` and `uomFilter` state.

- [ ] **Step 2: Switch list RPC to v2**

Pass `p_product_type_id` and `p_uom_id`. Do not client-filter the full product set.

- [ ] **Step 3: Update UI with shared primitives**

Use the existing shared controls/table conventions. Add Product Type and UOM filters and visible Product Type/UOM columns/badges. Add explanatory copy that this matrix edits only `Price Group` products and link to `/pricing/material-bands` for countertop material pricing.

- [ ] **Step 4: Preserve bulk behavior**

Selection and bulk price calculations operate only on rows/filtered IDs returned by v2, so Stone/`none` products cannot enter a Price Group bulk write from this screen.

- [ ] **Step 5: Run targeted contracts**

Run: `npm run smoke:pricing-product-types && npm run smoke:val-2-products-pricing`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat(admin): add product type pricing filters`

---

### Task 4: Add dedicated Material Bands pricing UI

**Files:**
- Create: `modulex-admin/src/components/pricing/MaterialBandPricingTable.tsx`
- Create: `modulex-admin/src/app/(admin)/pricing/material-bands/page.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Test: `modulex-admin/scripts/pricing-product-type-contract.mjs`

**Interfaces:**
- Reads: `countertop_material_price_bands` ordered by `sort_order`.
- Writes: existing `upsert_countertop_reference(p_kind => 'material_band', ...)` RPC.
- Does not mutate: Product Type, UOM, stone profile mappings, edge/service prices.

- [ ] **Step 1: Build shared-primitives table**

Render Code, Price / sq ft, Status and Actions with `ComponentCard`, `TableViewport/Table`, `Badge`, `Button`, `Modal`, `Input`, `Label`, `Alert`. Show B1-R22 values exactly as stored.

- [ ] **Step 2: Add edit modal**

Only Code and Price / sq ft (plus lifecycle state through Activate/Deactivate) are editable. Parse price with the existing decimal validation helpers; prevent duplicate submit; map RPC errors to readable messages.

- [ ] **Step 3: Add navigation**

Expose `Material Bands` under Pricing with the same pricing permission boundary as Product Prices. Do not remove the broader Countertop References route; this is the focused pricing surface.

- [ ] **Step 4: Run targeted UI contracts**

Run: `npm run smoke:pricing-product-types && npm run smoke:admin-ui && npm run smoke:rbac`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(admin): add material band pricing workspace`

---

### Task 5: Roadmap, cross-surface regression and final gate

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Review/update if affected: `modulex-store/STORE_ROADMAP.md`
- Modify if necessary: `.github/workflows/admin-products-pricing-ui.yml`

**Interfaces:**
- Records: implementation is in-review, not production-accepted.

- [ ] **Step 1: Record roadmap state**

Add Pricing UI v2/Product Type routing as `[~]`; explicitly state production migration/deployment acceptance remains pending.

- [ ] **Step 2: Run final verification**

Run:
- `npm run smoke:pricing-product-types`
- `npm run smoke:product-master-v2`
- `npm run smoke:a3-product-master`
- `npm run smoke:val-2-products-pricing`
- `npm run smoke:admin-ui`
- `npm run smoke:rbac`
- Store/Dealer pricing boundary contract(s) affected by shared pricing functions
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all PASS; existing unrelated warnings may remain but no new errors.

- [ ] **Step 3: Review migration without applying production**

Verify current production data is compatible, then run Security and Performance Advisors after the migration is eventually applied post-merge. Do not apply production migration in this PR-prep stage.

- [ ] **Step 4: Open PR**

Title: `feat(admin): route pricing by product type`

PR must state DB routing behavior, UI behavior, Material Bands scope, unchanged B1-R22 values, preserved Dealer no-fallback boundary, exact tests, migration pending production, and no production data mutation.
