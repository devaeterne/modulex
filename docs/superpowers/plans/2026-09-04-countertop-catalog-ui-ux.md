# Countertop Catalog UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Countertop Catalog into a tabbed, searchable, paginated, compact Admin workspace while preserving existing catalog mutations and pricing rules.

**Architecture:** Keep `CountertopCatalogManager` as the owner of loaded Stone/Sink catalog state and existing save/status RPC calls. Add presentation-only derived filtering/paging via `useMemo`, render one active table, and use existing shared Admin primitives for tabs, filters, pagination, and row actions. No server/data contract changes are needed.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase client, Modulex shared Admin UI primitives, source-level Node contract tests.

**Spec:** `docs/superpowers/specs/2026-09-04-countertop-catalog-ui-ux.md`

## Global Constraints

- No database/schema changes.
- Preserve `save_countertop_catalog_product` and `set_product_status` RPC usage.
- Preserve existing Stone reference/profile and Sink price validation behavior.
- Changed Admin feature UI must pass `npm run smoke:admin-ui-strict`.
- Use shared Admin primitives; do not add route-local appearance styling.

---

### Task 1: Lock the new Catalog UX in the Countertop UI contract

**Files:**
- Modify: `modulex-admin/scripts/countertop-ui-contract.mjs`

**Interfaces:**
- Consumes: current `CountertopCatalogManager.tsx` source.
- Produces: source assertions for tabbed workspace, filters, pagination, compact tables, and dropdown actions.

- [ ] **Step 1: Write the failing contract assertions**

Add assertions requiring:

```js
for (const primitive of ["Dropdown", "DropdownItem"]) {
  assert(catalog.includes(primitive), `Countertop Catalog must compose shared ${primitive}`);
}
assert(catalog.includes('role="tablist"'), "Catalog must expose Stones/Sinks as an accessible tab list");
assert(catalog.includes('role="tab"'), "Catalog tab triggers must expose tab semantics");
assert(catalog.includes('placeholder="Search catalog"'), "Catalog must provide active-catalog search");
assert(catalog.includes('placeholder="All statuses"'), "Catalog must provide status filtering");
assert(catalog.includes("PAGE_SIZE_OPTIONS"), "Catalog must provide page-size choices");
assert(catalog.includes("getPageNumbers"), "Catalog must provide bounded page navigation");
assert(catalog.includes("pagedStones") && catalog.includes("pagedSinks"), "Catalog must render paged Stone and Sink rows");
assert(catalog.includes('aria-label={`Actions for ${product.name}`}'), "Catalog row actions must use an accessible compact menu trigger");
assert(!catalog.includes('priceGroups.map((group) => <TableCell key={group.id} isHeader'), "Sink table must not render one visible header per Price Group");
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
cd modulex-admin && npm run smoke:countertop-ui
```

Expected: FAIL on the first missing tabbed-catalog assertion because the existing UI renders both tables simultaneously and has no filter/pagination controls.

- [ ] **Step 3: Commit the RED contract**

```bash
git add modulex-admin/scripts/countertop-ui-contract.mjs
git commit -m "test(admin): define Countertop Catalog workspace contract"
```

---

### Task 2: Implement the tabbed, filtered, paginated Catalog workspace

**Files:**
- Modify: `modulex-admin/src/components/countertop/CountertopCatalogManager.tsx`

**Interfaces:**
- Consumes: `stones`, `sinks`, reference maps, existing editor state and mutation handlers.
- Produces: `activeCatalog: "stone" | "sink"`, `catalogQuery`, `statusFilter`, `currentPage`, `pageSize`, `filteredStones`, `filteredSinks`, `pagedStones`, `pagedSinks`, `totalPages`.

- [ ] **Step 1: Add presentation state and derived catalog rows**

Use:

```ts
type CatalogTab = "stone" | "sink";
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const [activeCatalog, setActiveCatalog] = useState<CatalogTab>("stone");
const [catalogQuery, setCatalogQuery] = useState("");
const [statusFilter, setStatusFilter] = useState("");
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(25);
```

Normalize the query with `trim().toLowerCase()`. Filter Stones by name, SKU, brand, Stone Type, Material Price Band, and vendor; filter Sinks by name, SKU, and brand. Apply status when non-empty. Slice the active result set with `(currentPage - 1) * pageSize` and `pageSize`.

Reset `currentPage` to 1 from tab/search/status/page-size change handlers.

- [ ] **Step 2: Add accessible Stones/Sinks tabs and active-catalog controls**

Render one `ComponentCard` with:
- `role="tablist"` container.
- two shared `Button` triggers with `role="tab"`, `aria-selected`, and count labels.
- active Add button (`Add Stone` / `Add Sink`).
- shared `Input` with `placeholder="Search catalog"`.
- shared `Select` with `placeholder="All statuses"`, `allowEmpty`, Active and Inactive options.
- shared `Select` for 25 / 50 / 100 rows.

- [ ] **Step 3: Simplify Stone and Sink tables**

Stone headers:

```ts
["Stone", "Details", "Price Band", "Status", "Actions"]
```

Combine SKU under the Stone name; combine brand, Stone Type, and optional vendor in Details. Keep Material Price Band, status badge, and compact row actions.

Sink headers:

```ts
["Sink", "Brand", "Pricing", "Status", "Actions"]
```

Replace the Price Group column explosion with a compact pricing summary calculated from available current row prices, e.g. one price, a min–max range, and group count. Do not change the editor; every Price Group remains editable there.

- [ ] **Step 4: Replace row action button pairs with the shared Dropdown**

Create a feature-local `CatalogRowActions` function using shared `Button`, `Dropdown`, and `DropdownItem`. The trigger is `…` with `aria-label={`Actions for ${product.name}`}` and `aria-haspopup="menu"`. Menu actions remain exactly Edit and Activate/Deactivate.

- [ ] **Step 5: Add compact pagination controls**

Add `getPageNumbers(currentPage, totalPages)` with at most five numbered pages. Render shared Buttons for Previous, numbered pages, and Next; disable Previous on page 1 and Next on the last page. Show a shared-token muted summary such as `1–25 of 317`.

- [ ] **Step 6: Run GREEN verification**

Run:

```bash
cd modulex-admin && npm run smoke:countertop-ui
npm run smoke:admin-ui-strict
npm run typecheck
npm run lint
npm run build
```

Expected: all PASS. Build uses CI placeholder Supabase environment values where required.

- [ ] **Step 7: Commit implementation**

```bash
git add modulex-admin/src/components/countertop/CountertopCatalogManager.tsx
git commit -m "feat(admin): redesign Countertop Catalog workspace"
```

---

### Task 3: Final regression and PR review

**Files:**
- Review only: branch diff against `main`.

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: review-ready PR with no mutation/data-contract drift.

- [ ] **Step 1: Re-run targeted and Admin UI gates**

```bash
cd modulex-admin && npm run smoke:countertop-ui && npm run smoke:admin-ui-strict && npm run typecheck && npm run lint
```

Expected: PASS.

- [ ] **Step 2: Diff review**

Confirm only the approved UX/design docs, Countertop UI contract, and `CountertopCatalogManager.tsx` changed. Confirm no migrations, SQL, pricing formula, or RPC argument changes.

- [ ] **Step 3: Open PR**

Use title:

```text
feat(admin): redesign Countertop Catalog workspace
```

PR body must summarize tabs, filters, pagination, compact tables, compact actions, TDD RED/GREEN evidence, and explicitly state no DB/schema/business-rule changes.