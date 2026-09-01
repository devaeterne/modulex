# Admin UI Strict Contract + Countertop Refactor Design

Date: 2026-09-01
Status: Approved design; implementation pending
Base: `0e976d0e95c003b1e3a16d52ec053171213be562`

## Goal

Prevent new or modified Modulex Admin business pages from re-inventing visual primitives and then requiring a later UI consistency refactor. The existing `ADMIN_UI_GUIDE.md` remains the design source of truth; this package makes its shared-component rules executable in CI and applies them immediately to Countertop Catalog and Countertop Setup.

The strict rule is intentionally **diff-aware**: legacy untouched Admin files do not fail merely because they predate the rule. A new or modified feature UI file must satisfy the current standard before merge.

## Scope

This package is Admin-only. It changes no Store projection, Supabase schema, pricing behavior, order behavior, or production business data.

In scope:

- New diff-aware Admin UI strict contract.
- `Admin UI Foundation` workflow integration.
- Canonical component/rule documentation in `ADMIN_UI_GUIDE.md` and root `AGENTS.md`.
- Roadmap/UI-audit tracking for the new mandatory gate.
- Refactor `/pricing/countertop/catalog` and `/pricing/countertop/settings` to the shared Admin UI system.
- Remove duplicate Stone Product Profile management from Countertop Setup because Countertop Catalog is now the canonical operator-facing Stone/Sink product surface.

Out of scope:

- Repo-wide legacy UI cleanup.
- New visual design system or TailAdmin fork.
- New Countertop pricing rules or DB migrations.
- Faucet, supplier import, slab identity, or other Countertop domain expansion.

## Canonical UI ownership

Feature and route code composes existing shared primitives. Reusable appearance remains owned by the shared layers:

- Page navigation/header convention: `PageBreadCrumb` and reviewed shared page-header patterns.
- Cards/surfaces: `ComponentCard` / shared common surfaces.
- Form labels and controls: `Label`, `Input`, `Select`, `TextArea`, Checkbox/Switch primitives from `src/components/form`.
- Actions: semantic `Button` variants.
- Feedback: shared `Alert`.
- Status: shared `Badge` / semantic status tones.
- CRUD dialogs: shared `Modal`.
- Data lists: `TableViewport`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableStateRow`.
- Shared visual states/tokens: `src/components/ui/theme/adminTheme.ts`.

A feature requiring a missing reusable visual state must extend the reviewed shared primitive/token API first. It must not solve that state with route-local visual Tailwind.

## Strict changed-file contract

Create `modulex-admin/scripts/admin-ui-strict-contract.mjs` and wire it as `npm run smoke:admin-ui-strict`.

### Changed-file discovery

The contract audits only new or modified `.tsx` Admin feature files.

Comparison rules:

1. In pull-request CI, compute the merge-base of `HEAD` and `origin/$GITHUB_BASE_REF`, then audit `git diff --name-only --diff-filter=ACMR <merge-base>...HEAD`.
2. On push CI, audit the files changed by the pushed commit range when GitHub before/after SHAs are available; otherwise use the previous commit as the fallback.
3. For local deterministic use, allow an explicit base/ref or explicit file list through documented environment/CLI input.
4. Deleted files are ignored.

### Audited feature surface

Audit `.tsx` files under:

- `modulex-admin/src/app/(admin)/**`
- `modulex-admin/src/components/**`

Exclude reviewed shared-owner layers where primitive implementation legitimately uses native elements or visual tokens:

- `src/components/ui/**`
- `src/components/form/**`
- `src/components/common/**`
- shared shell/layout implementation files where the UI guide explicitly assigns ownership.

Exclusions are centralized in the contract. Feature files may not add inline disable comments to bypass the gate.

### Enforced rules

Use TypeScript/JSX-aware source inspection rather than a fragile whole-file regex where practical.

For audited feature files, fail on:

1. Native action/form/table primitives when a Modulex primitive exists: `button`, `input`, `select`, `textarea`, `label`, and raw table elements.
2. Route-local visual surface/color utilities, including direct background colors, text colors, border colors, rounded/shadow/ring appearance, and route-local `dark:*` appearance overrides. Layout/structure utilities such as grid, flex, gap, spacing, width, min-width, alignment and responsive column composition remain allowed.
3. Hand-built colored error/success/warning status text in place of `Alert` / `Badge` semantics.
4. New/changed Admin route pages that abandon the established breadcrumb/page-header convention without using a reviewed shared alternative.
5. Re-creation of existing shared primitives in feature code.

Every failure names the file, offending construct, and canonical replacement, for example:

`CountertopReferenceManager.tsx: native <label> is not allowed in feature UI; use @/components/form/Label.`

### Contract self-test

The strict checker must have deterministic positive and negative fixtures/tests that prove at minimum:

- canonical shared-component composition passes;
- native controls fail;
- blocked appearance utilities fail;
- layout-only utility composition passes;
- shared-owner paths are excluded;
- unchanged legacy files are not audited by changed-file discovery.

## Countertop Catalog UX

Keep all current data/RPC behavior from PR #230. Refactor presentation only.

### Page structure

- `PageBreadCrumb` remains the route heading convention.
- One `Stones` `ComponentCard` and one `Sinks` `ComponentCard`.
- Each card has a short domain description and a primary Add action.
- Load failure uses `Alert` with Retry.
- Mutation success/error uses shared feedback components.

### Stones

Use a responsive `TableViewport` + shared table.

Columns:

- Stone
- SKU
- Brand
- Stone Type
- Material Price Band
- Vendor
- Status
- Actions

Status uses semantic `Badge`. Add/Edit opens shared `Modal` containing `Label + Input/Select` controls for Stone Name, SKU, Brand, Stone Type, Material Price Band, Vendor and Source. Price remains derived from the selected B1–R22 Material Price Band; no new amount field is introduced.

Activate/deactivate continues through canonical `set_product_status`.

### Sinks

Use a responsive wide shared table.

Core columns:

- Sink
- SKU
- Brand
- Status
- one price column per active order-eligible commercial Price Group
- Actions

Add/Edit opens shared `Modal`. Identity fields use shared labeled controls and active order Price Groups render a labeled pricing grid. Save continues through `save_countertop_catalog_product`; no direct table mutation path is introduced.

## Countertop Setup UX

Countertop Setup owns controlled Countertop reference masters only:

- Stone Types
- Material Price Bands
- Edge Profiles
- Services

Each domain becomes a shared `ComponentCard` with:

- concise description;
- Add action;
- shared table with loading/empty/populated state;
- semantic status `Badge`;
- Edit + Activate/Deactivate actions using shared `Button`;
- Add/Edit shared `Modal` with `Label + Input/Select` controls;
- load/mutation feedback through `Alert`.

Human-facing pricing-method labels are used (`Each`, `Sq ft`, `Linear ft`, `Flat`) rather than exposing raw storage codes as the primary UI label.

`Stone Product Profiles` is removed from this Setup screen. Countertop Catalog now owns Stone product creation/editing plus Stone Type/Material Band association. Existing database/RPC compatibility is preserved; this is removal of duplicate operator UI, not removal of the underlying table or RPC capability.

## Accessibility and responsive behavior

Both Countertop surfaces must inherit existing UI-2B/2C/2E contracts:

- visible labels for form fields;
- shared modal focus containment/restore behavior;
- semantic status/feedback;
- no page-level horizontal overflow;
- tables scroll only inside `TableViewport`;
- usable layout at 360, 390, 768, 1024, 1280, 1366, 1440, 1536, 1920 and 2560 widths;
- no route-local dark-mode contrast patches.

## Documentation and agent rule

Update `ADMIN_UI_GUIDE.md` with a mandatory “Strict changed-file gate” section and a concise canonical component matrix.

Update root `AGENTS.md` so future agents must:

1. read `ADMIN_UI_GUIDE.md` before Admin UI work;
2. use canonical shared primitives;
3. run `smoke:admin-ui-strict` for UI-changing work;
4. extend the shared primitive API rather than suppressing the checker.

Track the package in `ADMIN_ROADMAP.md` / `AdminUICheck.md` as in-progress until branch verification, merge/deploy, and required signed-in visual acceptance are complete.

## CI integration

Add the strict contract and its self-test to `Admin UI Foundation` before the broader full-route/typecheck/lint/build gates. Keep existing `fetch-depth: 0` so diff-base resolution is reliable.

The workflow remains responsible for:

- strict changed-file contract;
- shared table/theme contracts;
- full-route regression;
- resolution matrix;
- Admin UI smoke;
- production-surface and RBAC regression;
- typecheck;
- lint;
- production build.

## TDD and acceptance

Implementation follows RED → GREEN.

RED evidence must demonstrate that the current Countertop Setup/Catalog presentation violates the new strict contract before refactor.

GREEN requires:

- strict contract self-test passes;
- strict contract passes on all changed Countertop feature files;
- Countertop domain/order contracts remain green;
- Admin UI Foundation full workflow passes, including typecheck, lint and production build;
- no Supabase migration or production data mutation is required for this package.

After merge/deploy, perform signed-in visual acceptance of both `/pricing/countertop/catalog` and `/pricing/countertop/settings` in light/dark mode and at representative mobile/desktop widths before marking the roadmap item complete.

## Failure policy

The strict checker must fail with an actionable remediation message. It must not silently auto-rewrite feature files. No per-feature inline suppression mechanism is added. A genuine shared-layer exception must be reviewed by changing the centralized contract/guide with a reason, making the exception visible to all future work.