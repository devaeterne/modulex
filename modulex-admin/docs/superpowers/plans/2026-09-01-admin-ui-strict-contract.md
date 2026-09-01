# Admin UI Strict Contract + Countertop Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Modulex Admin shared-component rules enforceable for every new or changed feature UI file, and bring Countertop Catalog + Countertop Setup into that standard without changing Countertop pricing, RPC, or database behavior.

**Architecture:** Add a diff-aware Node/TypeScript-AST contract that audits only changed Admin route pages and feature components, while excluding the reviewed primitive-owner roots. Refactor the two Countertop managers to compose `ComponentCard`, shared form controls, `Alert`, `Badge`, `Modal`, and the shared table system. Keep all existing Supabase reads and mutation RPCs authoritative; remove only the duplicate Stone Product Profile operator UI from Setup because Catalog now owns Stone product/profile association.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Node.js contract scripts, TypeScript compiler API, Git/GitHub Actions.

**Spec:** `modulex-admin/docs/superpowers/specs/2026-09-01-admin-ui-strict-contract-design.md`

## Global Constraints

- Work from branch `feat/admin-ui-strict-contract`, originally based on main `0e976d0e95c003b1e3a16d52ec053171213be562`; re-check execution-time `main` before final PR delivery and reconcile only if needed.
- This package is Admin UI/CI/documentation only. Do not add or edit Supabase migrations, RLS, grants, RPC bodies, pricing rules, order rules, or production business data.
- Preserve `save_countertop_catalog_product`, `set_product_status`, and `upsert_countertop_reference` as the existing mutation boundaries.
- Stone pricing stays Material Price Band based; do not add a Stone amount field. Sink pricing stays one amount per active, order-eligible, non-internal Price Group.
- `CountertopReferenceManager` must stop exposing duplicate Stone Product Profile CRUD, but the underlying profile table/RPC compatibility must remain untouched.
- Strict CI applies only to new/changed feature UI files. Unchanged legacy feature files must not fail the package.
- Shared primitive implementations under `src/components/ui/**`, `src/components/form/**`, and `src/components/common/**` are the only excluded component roots.
- Do not add feature-level ignore comments or suppression flags. If a legitimate reusable state is missing, extend the reviewed shared primitive layer instead.
- Keep `ADMIN_ROADMAP.md` / `AdminUICheck.md` `[~]` until merge/deploy and signed-in visual acceptance are complete; branch CI alone is not production acceptance.
- No automatic merge or production deploy.

## File Map

**Create**
- `modulex-admin/scripts/admin-ui-strict-contract.mjs` — changed-file resolution + AST-based strict feature UI audit.
- `modulex-admin/scripts/admin-ui-strict-contract.test.mjs` — deterministic positive/negative self-test for the checker.
- `modulex-admin/scripts/countertop-ui-contract.mjs` — focused source contract for Catalog/Setup shared UI ownership and duplicate-profile removal.

**Modify**
- `modulex-admin/src/components/countertop/CountertopCatalogManager.tsx` — modal/table/shared-feedback refactor; preserve data/RPC behavior.
- `modulex-admin/src/components/countertop/CountertopReferenceManager.tsx` — typed four-reference Setup UI using shared primitives; remove duplicate profile UI.
- `modulex-admin/src/app/(admin)/pricing/countertop/settings/page.tsx` — align route composition with the established page spacing/header convention.
- `modulex-admin/scripts/countertop-domain-contract.mjs` — move operator-facing Stone profile ownership assertions from Setup to Catalog while preserving DB/profile assertions.
- `modulex-admin/package.json` — expose strict/self-test/Countertop UI smoke commands.
- `.github/workflows/admin-ui-foundation.yml` — execute the strict gate before broader UI regressions and include new scripts in path filters.
- `modulex-admin/docs/ADMIN_UI_GUIDE.md` — mandatory changed-file gate + canonical component matrix.
- `AGENTS.md` — require strict gate and forbid feature-level bypasses.
- `modulex-admin/AdminUICheck.md` — track UI-2F strict gate + Countertop first adoption as `[~]`.
- `modulex-admin/ADMIN_ROADMAP.md` — reconcile the now-merged #230 baseline and track this UI package as `[~]`.

---

### Task 1: Build the Strict Checker with Deterministic Self-Tests

**Files:**
- Create: `modulex-admin/scripts/admin-ui-strict-contract.mjs`
- Create: `modulex-admin/scripts/admin-ui-strict-contract.test.mjs`

**Interfaces:**
- `isAuditedFeaturePath(relativePath: string): boolean`
- `auditSource(relativePath: string, source: string): Violation[]`
- `resolveChangedFiles(options): string[]`
- CLI supports deterministic explicit files through `ADMIN_UI_STRICT_FILES` and a deterministic base through `ADMIN_UI_STRICT_BASE_REF`.
- Default CI discovery uses Git merge-base on pull requests and commit ranges on pushes.

- [ ] **Step 1 — Write the self-test first.** Import the checker functions and define in-memory fixtures. Required assertions:

```js
const goodFeature = `
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
export default function Good() {
  return <ComponentCard title="Example"><div className="grid gap-4 md:grid-cols-2"><Label htmlFor="name">Name</Label><Input id="name" /><Button>Save</Button></div></ComponentCard>;
}`;

assert.equal(auditSource("src/components/example/Good.tsx", goodFeature).length, 0);
assert.ok(auditSource("src/components/example/Bad.tsx", `export default () => <button>Save</button>`)
  .some((v) => v.rule === "native-primitive"));
assert.ok(auditSource("src/components/example/Bad.tsx", `export default () => <div className="rounded-2xl bg-white text-gray-700 dark:bg-gray-900" />`)
  .some((v) => v.rule === "route-appearance"));
assert.equal(auditSource("src/components/example/Layout.tsx", `export default () => <div className="grid gap-4 md:grid-cols-2 max-w-3xl" />`).length, 0);
assert.equal(isAuditedFeaturePath("src/components/ui/button/Fake.tsx"), false);
assert.equal(isAuditedFeaturePath("src/components/countertop/CountertopCatalogManager.tsx"), true);
```

Also verify changed-file selection only audits the explicit list passed to the resolver, proving an unchanged legacy file is not implicitly scanned.

- [ ] **Step 2 — Run the self-test and verify RED because the checker module does not exist yet.** From `modulex-admin`:

```bash
node scripts/admin-ui-strict-contract.test.mjs
```

Expected result: non-zero exit caused by the missing checker/export contract.

- [ ] **Step 3 — Implement path ownership.** Normalize slashes and audit only:
  - `src/app/(admin)/**/page.tsx`
  - `src/components/**/*.tsx`

Exclude exactly:
  - `src/components/ui/**`
  - `src/components/form/**`
  - `src/components/common/**`

Do not treat `src/layout/**` as an exclusion; it is simply outside the audited roots.

- [ ] **Step 4 — Implement AST-based native-element detection.** Parse TSX with `typescript.createSourceFile`; visit `JsxElement` / `JsxSelfClosingElement`; reject native tags:

```js
const BANNED_NATIVE_TAGS = new Map([
  ["button", "@/components/ui/button/Button"],
  ["input", "@/components/form/input/InputField"],
  ["select", "@/components/form/Select"],
  ["textarea", "@/components/form/input/TextArea"],
  ["label", "@/components/form/Label"],
  ["table", "@/components/ui/table"],
  ["thead", "@/components/ui/table"],
  ["tbody", "@/components/ui/table"],
  ["tr", "@/components/ui/table"],
  ["th", "@/components/ui/table"],
  ["td", "@/components/ui/table"],
]);
```

Violation text must be actionable, e.g. `native <label> is not allowed in feature UI; use @/components/form/Label`.

- [ ] **Step 5 — Implement literal/template class inspection.** Extract statically knowable class tokens from `className="..."`, string literals, no-substitution templates, and literal segments of template expressions. Reject appearance ownership tokens:
  - `bg-*`
  - `dark:*`
  - `rounded*`
  - `shadow*`
  - visual `ring*`
  - color-bearing `border-*`
  - color-bearing `text-*`

Allow structural/typographic composition such as `grid`, `flex`, `gap-*`, `space-*`, `m*/p*`, `w-*`, `min-w-*`, `max-w-*`, alignment, overflow, responsive layout, `text-sm` / `text-base` / `text-lg`, `text-left|center|right`, and `font-*`.

Implement helper predicates rather than one broad regex so `text-sm` does not become a false positive while `text-gray-700` does.

- [ ] **Step 6 — Enforce page heading convention.** For audited `src/app/(admin)/**/page.tsx`, require one of the reviewed route-header tokens (`PageBreadcrumb`, `PageBreadCrumb`, or an explicitly documented shared page-header component). Current Countertop pages use `PageBreadcrumb`.

- [ ] **Step 7 — Add guardrails against bypass/recreated primitives.** Reject strict-disable markers such as `admin-ui-strict-disable` / `admin-ui-ignore`. Reject feature-local declarations named like canonical visual primitives when they render a banned native primitive or own blocked appearance classes.

- [ ] **Step 8 — Implement changed-file discovery.** Priority order:
  1. `ADMIN_UI_STRICT_FILES` comma/newline-separated explicit list for deterministic local/tests.
  2. `ADMIN_UI_STRICT_BASE_REF` => `git merge-base HEAD <base>` then `git diff --name-only --diff-filter=ACMR <merge-base>...HEAD`.
  3. PR CI with `GITHUB_BASE_REF` => `origin/$GITHUB_BASE_REF` merge-base.
  4. Push CI with `GITHUB_EVENT_BEFORE` and `GITHUB_SHA` when both are valid non-zero SHAs.
  5. fallback `HEAD^...HEAD`.

Convert repo-root paths like `modulex-admin/src/...` into module-relative `src/...` because the script runs from `modulex-admin`.

- [ ] **Step 9 — Make the CLI fail once with all violations.** Print each violation on its own line and exit 1 if any audited changed file fails; print `PASS: admin UI strict changed-file contract (<N> audited files)` otherwise.

- [ ] **Step 10 — Run self-test GREEN.**

```bash
node scripts/admin-ui-strict-contract.test.mjs
```

Expected: exit 0 with all positive/negative fixtures passing.

- [ ] **Step 11 — Record RED evidence against the pre-refactor Countertop files using explicit file mode.**

```bash
ADMIN_UI_STRICT_FILES='src/components/countertop/CountertopCatalogManager.tsx,src/components/countertop/CountertopReferenceManager.tsx' node scripts/admin-ui-strict-contract.mjs
```

Expected: exit 1 with actionable violations including the Catalog raw `<label>` and Setup route-local surface/dark-mode styles/native or hand-built semantics.

- [ ] **Step 12 — Commit the checker + self-test while Countertop RED remains intentional.** Commit message:

```text
test(admin): add strict changed-file UI contract
```

---

### Task 2: Add a Focused Countertop UI RED Contract

**Files:**
- Create: `modulex-admin/scripts/countertop-ui-contract.mjs`

**Interfaces:**
- Reads both Countertop managers and both route pages.
- Protects shared primitive composition, Catalog mutation ownership, Setup reference-only ownership, and removal of duplicate Stone profile UI.

- [ ] **Step 1 — Write assertions for the desired end state.** At minimum:

```js
for (const primitive of ["ComponentCard", "Label", "Input", "Select", "Alert", "Badge", "Button", "Modal", "TableViewport", "TableStateRow"]) {
  assert(catalog.includes(primitive), `Countertop Catalog must compose shared ${primitive}`);
  assert(setup.includes(primitive), `Countertop Setup must compose shared ${primitive}`);
}
assert(catalog.includes('rpc("save_countertop_catalog_product"'), "Catalog must preserve atomic product save RPC");
assert(catalog.includes('rpc("set_product_status"'), "Catalog status changes must preserve canonical lifecycle RPC");
assert(setup.includes('rpc("upsert_countertop_reference"'), "Setup must preserve canonical reference RPC");
assert(!setup.includes("Stone Product Profiles"), "Setup must not duplicate Stone Product Profile management");
assert(!setup.includes("saveProfile") && !setup.includes("toggleProfile"), "Setup must not keep duplicate profile mutation handlers");
assert(!setup.includes('from("countertop_stone_product_profiles")'), "Setup must not load Stone Product Profiles after Catalog becomes canonical operator surface");
assert(catalogPage.includes("PageBreadcrumb") && setupPage.includes("PageBreadcrumb"), "Countertop routes must preserve shared page heading convention");
```

Also assert the Catalog exposes `Add Stone`, `Add Sink`, Stone Type, Material Price Band, and per-price-group Sink pricing.

- [ ] **Step 2 — Run the contract and verify RED against current presentation.**

```bash
node scripts/countertop-ui-contract.mjs
```

Expected: non-zero exit because Catalog/Setup do not yet compose the full shared primitive set and Setup still owns Stone Product Profiles.

- [ ] **Step 3 — Commit the RED contract independently.** Commit message:

```text
test(admin): define countertop shared UI contract
```

---

### Task 3: Refactor Countertop Catalog to Shared Cards, Tables, Feedback, and Modal Editors

**Files:**
- Modify: `modulex-admin/src/components/countertop/CountertopCatalogManager.tsx`

**Interfaces preserved:**
- Reads active brands, Stone Types, Material Bands, order-eligible commercial Price Groups, STONE/SINK Product Types, products, Stone profiles, current USD Sink prices.
- Writes through `save_countertop_catalog_product` and `set_product_status` only.

- [ ] **Step 1 — Replace local visual primitives/imports.** Remove `labelClass` and local `Field`. Add imports:

```ts
import Label from "@/components/form/Label";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
```

Keep `ComponentCard`, `Input`, `Select`, `Button`.

- [ ] **Step 2 — Add editor state and helpers.** Use one discriminated editor state:

```ts
type CatalogEditor = "stone" | "sink" | null;
const [editor, setEditor] = useState<CatalogEditor>(null);

function openNewStone() { resetMessages(); setStoneDraft(EMPTY_STONE); setEditor("stone"); }
function openNewSink() { resetMessages(); setSinkDraft(EMPTY_SINK); setEditor("sink"); }
function closeEditor() { if (saving) return; setEditor(null); setStoneDraft(EMPTY_STONE); setSinkDraft(EMPTY_SINK); }
```

`editStone` / `editSink` populate the draft and set the matching editor.

- [ ] **Step 3 — Preserve failure state and duplicate-submit protection.** Do not close/reset the modal when RPC save fails. On successful save: close/reset, reload, then show success. Keep save/status buttons disabled while their matching mutation is in progress.

- [ ] **Step 4 — Use runtime locale for display formatting without changing USD business currency.**

```ts
new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
```

Do not use JS arithmetic for authoritative prices.

- [ ] **Step 5 — Render global feedback through shared `Alert`.** Example:

```tsx
{error ? (
  <div className="space-y-3">
    <Alert variant="error" title="Countertop Catalog" message={error} />
    <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
  </div>
) : null}
{message ? <Alert variant="success" title="Saved" message={message} /> : null}
```

Only layout classes are allowed in feature code.

- [ ] **Step 6 — Convert Stones to `ComponentCard` + shared table.** Use `headerAction={<Button onClick={openNewStone}>Add Stone</Button>}`. Table structure:
  - `TableViewport`
  - `Table variant="admin" minWidth="wide"`
  - 8 columns: Stone, SKU, Brand, Stone Type, Material Price Band, Vendor, Status, Actions.
  - loading/empty rows via `TableStateRow colSpan={8}`.
  - status via `<Badge color={row.status === "active" ? "success" : "light"}>`.
  - actions via shared outline/ghost Buttons.

Resolve Brand/Stone Type/Band display names with `Map`s derived from current reference arrays; display Band as `CODE — $price / sq ft`.

- [ ] **Step 7 — Convert Sinks to `ComponentCard` + dynamic shared wide table.** Use `headerAction={<Button onClick={openNewSink}>Add Sink</Button>}`. Fixed columns: Sink, SKU, Brand, Status, Actions plus one column for each `priceGroups` entry. Use `minWidth="extraWide"`. Compute:

```ts
const sinkColumnCount = 5 + priceGroups.length;
```

Use `TableStateRow colSpan={sinkColumnCount}` for loading/empty states.

- [ ] **Step 8 — Add Stone Modal.** Use shared `Modal` with layout-only width/padding classes, e.g. `className="max-w-3xl p-6 lg:p-8"`. Every field gets a stable `id` and matching `Label htmlFor`:
  - Stone Name
  - SKU
  - Brand
  - Stone Type
  - Material Price Band
  - Vendor
  - Source

Use `required` on the same fields already enforced by `saveStone()`. Footer uses Cancel (`outline`) and Save (`primary`) Buttons. No manual `$ / sq ft` field.

- [ ] **Step 9 — Add Sink Modal.** Identity fields: Sink Name, SKU, Brand. Render price group amounts as a responsive labeled grid using `Label + Input type="number" min={0} step="0.01"`; field IDs derive from Price Group id. Keep the existing requirement that every active order Price Group has a non-negative amount.

- [ ] **Step 10 — Run Catalog-only strict GREEN.**

```bash
ADMIN_UI_STRICT_FILES='src/components/countertop/CountertopCatalogManager.tsx' node scripts/admin-ui-strict-contract.mjs
```

Expected: exit 0.

- [ ] **Step 11 — Run the focused UI contract.** It may still be RED because Setup is not refactored yet; confirm any remaining failure points only at Setup.

- [ ] **Step 12 — Commit Catalog refactor.** Commit message:

```text
fix(admin): align countertop catalog with shared UI
```

---

### Task 4: Refactor Countertop Setup and Reconcile Domain Contracts

**Files:**
- Modify: `modulex-admin/src/components/countertop/CountertopReferenceManager.tsx`
- Modify: `modulex-admin/src/app/(admin)/pricing/countertop/settings/page.tsx`
- Modify: `modulex-admin/scripts/countertop-domain-contract.mjs`

**Interfaces preserved:**
- `upsert_countertop_reference` remains the only Setup mutation boundary.
- Setup manages exactly Stone Types, Material Price Bands, Edge Profiles, Services.
- Underlying `countertop_stone_product_profiles` table/RPC remains supported by domain SQL; only duplicate Setup UI is removed.

- [ ] **Step 1 — Replace `any`/compressed state with explicit types.** Suggested types:

```ts
type ReferenceKind = "stone_type" | "material_band" | "edge" | "service";
type PricingMethod = "each" | "sq_ft" | "linear_ft" | "flat";

type ReferenceRow = {
  id: string;
  name?: string | null;
  code?: string | null;
  price_per_sqft?: string | number | null;
  unit_price?: string | number | null;
  pricing_method?: PricingMethod | null;
  is_active: boolean;
};

type ReferenceDraft = {
  name: string;
  code: string;
  price: string;
  pricing_method: PricingMethod | "";
};
```

Use one editor state containing `{ kind, rowId? } | null`, one draft, and `rows: Record<ReferenceKind, ReferenceRow[]>`.

- [ ] **Step 2 — Delete duplicate Stone Product Profile state/query/handlers/UI.** Remove:
  - `profileRows`
  - `products`, `stoneTypes`, `bands` option state used only by profile mapping
  - second profile-loading `useEffect`
  - `saveProfile`
  - `toggleProfile`
  - `Stone Product Profiles` card/markup.

Do not edit database migrations or profile RPC implementation.

- [ ] **Step 3 — Define typed reference configs.** Each config provides title, description, table, columns, and editor fields. Keep current source tables and sort rules. Pricing method display map:

```ts
const PRICING_METHOD_LABELS: Record<PricingMethod, string> = {
  each: "Each",
  sq_ft: "Sq ft",
  linear_ft: "Linear ft",
  flat: "Flat",
};
```

- [ ] **Step 4 — Preserve `load`, `save`, and `toggle` business behavior.** `save` still calls:

```ts
supabase.rpc("upsert_countertop_reference", {
  p_kind: kind,
  p_id: editingId ?? null,
  p_name: draft.name.trim() || null,
  p_code: draft.code.trim().toUpperCase() || null,
  p_price: draft.price.trim() || null,
  p_pricing_method: draft.pricing_method || null,
  p_is_active: true,
});
```

Use the row’s current values when toggling active state exactly as the current RPC contract requires. Keep friendly duplicate error mapping.

- [ ] **Step 5 — Render four `ComponentCard`s.** Each card uses `headerAction={<Button ...>Add ...</Button>}` and shared `TableViewport/Table`. Use columns appropriate to each domain:
  - Stone Types: Name, Status, Actions
  - Material Price Bands: Code, $/sq ft, Status, Actions
  - Edge Profiles: Name, Pricing Method, Unit Price, Status, Actions
  - Services: Name, Pricing Method, Unit Price, Status, Actions

Use `TableStateRow` for loading/empty states and `Badge` for Active/Inactive.

- [ ] **Step 6 — Use one shared Modal editor.** Render only the relevant `Label + Input/Select` fields for the active kind. For numeric price fields use `type="number" min={0} step="0.01"`. Pricing method uses human-readable select options but stores canonical codes.

- [ ] **Step 7 — Use `Alert` for load/mutation feedback and Retry Button for load errors.** Do not recreate error/success colors with route-local classes.

- [ ] **Step 8 — Align Setup route wrapper.** Change `settings/page.tsx` to the same layout convention as Catalog:

```tsx
return (
  <div className="space-y-6">
    <PageBreadcrumb pageTitle="Countertop Setup" />
    <CountertopReferenceManager />
  </div>
);
```

Update metadata title from `Countertop References` to `Countertop Setup` to match navigation/operator terminology.

- [ ] **Step 9 — Reconcile `countertop-domain-contract.mjs`.** Keep all SQL/profile-table/security assertions. Replace only UI assertions that currently require `Stone Product Profiles`, `Save mapping`, etc. New UI ownership assertions:

```js
const refs = read("src/components/countertop/CountertopReferenceManager.tsx");
const catalog = read("src/components/countertop/CountertopCatalogManager.tsx");
for (const token of ["stone_type", "material_band", "edge", "service", "upsert_countertop_reference"]) {
  assert(refs.includes(token), `Countertop Setup reference ownership missing: ${token}`);
}
assert(!refs.includes("Stone Product Profiles") && !refs.includes("saveProfile") && !refs.includes("toggleProfile"), "Countertop Setup must not duplicate Stone profile management");
assert(catalog.includes("save_countertop_catalog_product") && catalog.includes("stone_type_id") && catalog.includes("material_price_band_id"), "Countertop Catalog must own operator-facing Stone/profile association");
```

Do not remove the existing assertions proving `countertop_stone_product_profiles` remains relational in SQL/migrations.

- [ ] **Step 10 — Run Setup strict GREEN.**

```bash
ADMIN_UI_STRICT_FILES='src/components/countertop/CountertopReferenceManager.tsx,src/app/(admin)/pricing/countertop/settings/page.tsx' node scripts/admin-ui-strict-contract.mjs
```

Expected: exit 0.

- [ ] **Step 11 — Run Countertop UI + domain contracts GREEN.**

```bash
node scripts/countertop-ui-contract.mjs
npm run smoke:countertop-domain
```

Expected: both exit 0.

- [ ] **Step 12 — Run Order/Countertop regressions immediately after ownership change.**

```bash
npm run smoke:order-countertop-initiation
npm run smoke:order-countertop-context
```

Expected: both exit 0; Add/Configure Countertop and catalog discovery contracts remain intact.

- [ ] **Step 13 — Commit Setup/domain reconciliation.** Commit message:

```text
fix(admin): align countertop setup with shared UI
```

---

### Task 5: Wire the Strict Gate into Package Scripts, CI, and Permanent Guidance

**Files:**
- Modify: `modulex-admin/package.json`
- Modify: `.github/workflows/admin-ui-foundation.yml`
- Modify: `modulex-admin/docs/ADMIN_UI_GUIDE.md`
- Modify: `AGENTS.md`
- Modify: `modulex-admin/AdminUICheck.md`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

- [ ] **Step 1 — Add package scripts.** Add:

```json
"smoke:admin-ui-strict:selftest": "node scripts/admin-ui-strict-contract.test.mjs",
"smoke:admin-ui-strict": "node scripts/admin-ui-strict-contract.mjs",
"smoke:countertop-ui": "node scripts/countertop-ui-contract.mjs"
```

Do not inject the diff-aware strict script into the long generic `smoke` chain unless it can reliably resolve a meaningful base in every environment; its required home is the Admin UI Foundation workflow and explicit UI-changing package commands.

- [ ] **Step 2 — Update Admin UI Foundation path filters.** Add the strict checker, self-test, and Countertop UI contract so edits to the enforcement itself always trigger the workflow.

- [ ] **Step 3 — Run strict steps immediately after `npm ci` and before broad regressions.** Add:

```yaml
- run: npm run smoke:admin-ui-strict:selftest
- run: npm run smoke:admin-ui-strict
- run: npm run smoke:countertop-ui
```

Keep `fetch-depth: 0` unchanged.

- [ ] **Step 4 — Update `ADMIN_UI_GUIDE.md`.** Add a `## Strict changed-file gate` section containing:
  - audited roots/excluded primitive roots;
  - banned native primitives;
  - route-local appearance ownership rule;
  - no feature-level suppression rule;
  - local command `npm run smoke:admin-ui-strict`;
  - CI behavior.

Add a compact canonical component matrix:

| Need | Canonical owner |
| --- | --- |
| Page heading | `PageBreadCrumb` / reviewed shared header |
| Card/section | `ComponentCard` |
| Form label | `Label` |
| Text/number input | `Input` |
| Select | `Select` |
| Textarea | `TextArea` |
| Action | `Button` semantic variants |
| Feedback | `Alert` |
| Status | `Badge` |
| Dialog/editor | `Modal` |
| Data table | `TableViewport` + shared table primitives |

- [ ] **Step 5 — Update root `AGENTS.md`.** Under Admin UI consistency, explicitly require:
  - `npm run smoke:admin-ui-strict` for UI-changing work;
  - new/changed feature UI must pass strict changed-file gate;
  - no feature-local bypass; extend shared primitive API if missing.

- [ ] **Step 6 — Update `AdminUICheck.md`.** Add:

```md
### [~] UI-2F — Strict Changed-File UI Gate
```

Record that the first adoption covers Countertop Catalog/Setup, changed files only, shared-owner exclusions, RED/GREEN evidence, and that `[x]` requires merge/deploy + signed-in light/dark/mobile/desktop acceptance.

Do not rewrite historical UI-2A–UI-2E evidence.

- [ ] **Step 7 — Reconcile `ADMIN_ROADMAP.md` with execution-time truth.** The inherited file still describes #230 as an active draft and an older main baseline. Update:
  - `Main baseline` to the execution-time main used for this package (or the latest main if it advanced before this step);
  - note #230 is merged;
  - add this strict UI + Countertop refactor as `[~]`;
  - explicitly state no DB migration/business data mutation in this package;
  - retain any unrelated parallel workstreams rather than deleting them.

- [ ] **Step 8 — Run strict self-test and branch-diff strict gate.** From `modulex-admin`:

```bash
npm run smoke:admin-ui-strict:selftest
ADMIN_UI_STRICT_BASE_REF=origin/main npm run smoke:admin-ui-strict
npm run smoke:countertop-ui
```

Expected: all exit 0.

- [ ] **Step 9 — Commit enforcement/docs.** Commit message:

```text
chore(admin): enforce shared UI on changed feature files
```

---

### Task 6: Full Verification, Diff Audit, and Pull Request Delivery

**Files:**
- No planned feature additions. Only fix defects exposed by verification and keep them within approved scope.

- [ ] **Step 1 — Refresh execution-time main before final verification.** Fetch/check current `main`. If it advanced, compare `main...feat/admin-ui-strict-contract`. Rebase/merge only when needed to preserve newer work; do not overwrite parallel changes.

- [ ] **Step 2 — Verify no DB/shared Store migration drift.** The final diff must not add/edit files under `modulex-store/supabase/migrations`, `modulex-admin/sql`, or Store runtime source for this package.

- [ ] **Step 3 — Run the fresh targeted gate in this order from `modulex-admin`:**

```bash
npm run smoke:admin-ui-strict:selftest
ADMIN_UI_STRICT_BASE_REF=origin/main npm run smoke:admin-ui-strict
npm run smoke:countertop-ui
npm run smoke:countertop-domain
npm run smoke:order-countertop-initiation
npm run smoke:order-countertop-context
node scripts/admin-table-system-contract.mjs
node scripts/admin-theme-design-contract.mjs
node scripts/admin-full-route-regression-contract.mjs
node scripts/admin-resolution-matrix-contract.mjs
npm run smoke:admin-ui
npm run smoke:production-surface
npm run smoke:rbac
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key npm run build
```

Do not claim pass until every command exits 0. Supabase Security/Performance Advisors are intentionally not required because this package changes no schema/RLS/grants/RPC/query/index behavior.

- [ ] **Step 4 — Inspect final diff for strict-scope intent.** Confirm:
  - only approved Admin UI/contract/docs/workflow files changed;
  - Catalog still calls `save_countertop_catalog_product` and `set_product_status`;
  - Setup still calls `upsert_countertop_reference`;
  - no Stone amount input was introduced;
  - Sink pricing still requires all active order-eligible non-internal Price Groups;
  - Setup no longer contains duplicate Stone Product Profile UI;
  - no feature-level strict bypass exists.

- [ ] **Step 5 — Push final HEAD and open a draft PR against current `main`.** Suggested title:

```text
fix(admin): enforce shared UI contract and refactor countertop
```

PR body must record:
  - strict changed-file scope and excluded shared-owner roots;
  - Countertop Catalog/Setup UI changes;
  - preserved RPC/business behavior;
  - RED evidence from pre-refactor strict/UI contracts;
  - GREEN command evidence;
  - no migration/production data mutation;
  - roadmap remains `[~]` pending merge/deploy/signed-in visual acceptance.

- [ ] **Step 6 — Wait for exact-head GitHub Actions and inspect job results.** Required evidence includes Admin UI Foundation exact-head success. If another workflow fails for an unrelated pre-existing issue, document it precisely and do not misrepresent the package as globally green.

- [ ] **Step 7 — Mark PR Ready for Review only after exact-head required checks are green.** Do not merge.

- [ ] **Step 8 — Post-merge acceptance remains a separate closeout.** After the user merges/deploys, signed-in visual acceptance must cover:
  - `/pricing/countertop/catalog`
  - `/pricing/countertop/settings`
  - light + dark mode
  - representative mobile (390px) + desktop (1366px or 1440px)
  - modal open/close/focus behavior
  - table overflow containment
  - loading/empty/error/success states where safely reproducible.

Only after that acceptance should UI-2F / roadmap work move from `[~]` to `[x]`.
