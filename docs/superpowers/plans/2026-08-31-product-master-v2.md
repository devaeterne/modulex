# Product Master UX V2 Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with targeted RED → GREEN checks and a final Admin/Store regression gate.

**Goal:** Add dynamic Product Type and UOM master data while extending existing Product CRUD, list, QR, Brands/Categories, and Low Stock surfaces without breaking current inventory, pricing, order, countertop, or Store contracts.

**Architecture:** Additive `product_types`, `units_of_measure`, and product FK/mapping columns will coexist with the legacy `products.unit` and taxonomy mirrors. Existing server/RPC boundaries remain authoritative; Admin UI consumes a bounded product projection and reuses existing shared controls. QR generation remains server-controlled and uses the existing product-qrcodes storage contract.

**Tech Stack:** Next.js/React, TypeScript, Supabase/PostgreSQL migrations, existing Admin shared UI and smoke contracts.

**Spec:** User Product Master UX v2 requirements in the active task.

## Global Constraints

- Applied migrations are never rewritten; schema work is additive and production-safe.
- `products.unit` remains a compatibility mirror until a later removal package.
- Countertop material bands, edge/service prices, pricing formulas, and order snapshots are unchanged.
- Browser code never receives service-role credentials and never bypasses RPC/RLS boundaries.
- Production data is not mutated during implementation or local verification.

### Task 1: Discovery and contract RED

- Inspect current product schema/RPCs, QR storage helpers, inventory projection, taxonomy CRUD, and relevant routes.
- Add a focused contract asserting the new master/projection requirements; run it RED before implementation.

### Task 2: Additive schema and deterministic backfill

- Create a timestamped migration with `product_types`, `units_of_measure`, `product_type_allowed_uoms`, product FK columns, seeded STANDARD/STONE/SINK and PIECE/SLAB data, and idempotent backfill from profiles/metadata/legacy units.
- Add only required FK/lookup indexes and fail-closed constraints after backfill.
- Add migration/source contract and local parser verification.

### Task 3: Shared server product projection and validation

- Extend the existing product page/list RPC or add a backward-compatible projection for type/UOM/stone summary/QR/stock aggregates.
- Add reusable normalization/validation for type/UOM and type-specific profile payloads; preserve pricing and inventory boundaries.

### Task 4: Product Types and UOM management

- Add permission-gated Admin management screens using existing primitives with list/create/edit/activate/deactivate, usage guards, and explicit loading/empty/error states.

### Task 5: Product Create/Edit V2

- Replace free-text unit and implicit brand/category defaults with controlled selectors and explicit required classification.
- Add type-specific Stone profile and Sink compatibility handling, safe type-transition guards, and shared create/edit hydration.

### Task 6: QR lifecycle and Product List V2

- Reuse existing QR generation/storage contract for save, SKU change, retry/regenerate, and QR status display.
- Extend server-side product list filters/sort/pagination/export and compact full-width table columns.

### Task 7: Brands/Categories and Low Stock compatibility

- Add usage counts/view-products and preserve reference guards.
- Make Low Stock type/UOM aware with server pagination and UOM-grouped shortfall metrics; keep canonical inventory arithmetic.

### Task 8: Documentation, tests, final gate

- Update roadmap and acceptance documentation without closing before deployment acceptance.
- Run targeted contracts, Admin/Store regressions, typecheck, lint, build, diff-check, and advisor checks when schema changes are present.
