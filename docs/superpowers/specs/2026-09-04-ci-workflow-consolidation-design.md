# CI Workflow Consolidation Design

Date: 2026-09-04
Status: Proposed / user-approved direction, pending written-spec review

## Context

Modulex currently has 29 GitHub Actions workflow files. The individual domain contracts are useful, but many workflows repeat the same expensive setup and global verification steps (`npm ci`, RBAC, production-surface, typecheck, lint, and full Next.js build). Several workflows also use broad `modulex-admin/**` or `modulex-store/**` pull-request path filters, so unrelated changes fan out into multiple workflows. This caused hundreds of queued runs even though most individual checks were valid.

The goal is to preserve contract coverage while reducing duplicate runners, duplicate builds, and unrelated workflow triggers.

## Decisions

### 1. Admin UI standard has one owner

`.github/workflows/admin-ui-foundation.yml` remains the only global owner of:

- `modulex-admin/AdminUICheck.md`
- `modulex-admin/docs/ADMIN_UI_GUIDE.md`
- `npm run smoke:admin-ui-strict:self-test`
- `npm run smoke:admin-ui-strict`
- shared Admin UI/theme/table/resolution contracts
- `npm run smoke:production-surface`
- `npm run smoke:rbac`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

No feature/domain workflow may trigger merely because `AdminUICheck.md` or `ADMIN_UI_GUIDE.md` changed. No feature/domain workflow may repeat the global Admin lint/typecheck/build/RBAC/production-surface gate.

### 2. Keep domain contracts, remove duplicate global work

Domain workflows remain only where the domain is large enough to benefit from an isolated contract gate. They run domain-specific contracts after one install and do not repeat global Admin verification.

The retained Admin domain workflows are:

1. `admin-a1-core-operations.yml` — Orders/core operations contracts only.
2. `admin-inventory-warehouse-qr-ui.yml` — consolidated A2 inventory, warehouse, stock operations, low-stock, QR, and VAL-4 contracts.
3. `admin-a3-product-master.yml` — consolidated Product Master, Product UI/reference, and Pricing contracts.
4. `admin-a6-finance-core.yml` — consolidated Finance Core and Finance Reports contracts.
5. `admin-project-base.yml` — Project Base/payment/procurement contracts with project-only path filters.
6. `admin-vendor-catalog-sync.yml` — Vendor/Stone catalog contracts only.

Small feature UI contracts are consolidated into `admin-ui-foundation.yml` instead of each owning a separate workflow. After the single `npm ci`, cheap feature/domain contract checks run before expensive typecheck/lint/build so failures are fail-fast. This includes approvals, commercial documents, customers, dashboard shell, general settings, mobile shell, personnel/leave, request center, and users/store UI contracts.

### 3. Consolidate inventory checks

These workflows are retired into `admin-inventory-warehouse-qr-ui.yml`:

- `admin-a2-low-stock-reporting.yml`
- `admin-a2-stock-operations-scanning.yml`
- `admin-low-stock-ui.yml`
- `admin-val4-inventory-validation.yml`

The consolidated inventory gate keeps the unique contracts but runs each shared regression once:

- inventory/warehouse/QR UI contract
- stock movement actions
- A2 warehouse/location integrity
- A2 inventory movements
- A2 stock operations/scanning
- A2 low-stock reporting
- low-stock UI
- VAL-4 inventory validation

It does not run Admin global build/lint/typecheck/RBAC/production-surface; `Admin UI Foundation` owns those.

### 4. Consolidate Product checks

These workflows are retired into `admin-a3-product-master.yml`:

- `admin-product-list-ui.yml`
- `admin-products-pricing-ui.yml`

The retained Product gate keeps Product Master, Product Master v2, Product List/Form/Reference/Taxonomy UI, pricing UI, pricing-product-type, and relevant Product validation contracts. It removes unrelated A1/A2 regression chains and all global Admin lint/typecheck/build/RBAC repetitions.

### 5. Consolidate Finance checks

`admin-finance-reports-ui.yml` is retired into `admin-a6-finance-core.yml`.

The retained Finance gate runs Finance Core/hardening plus Finance Reports UI contracts only. Global Admin verification remains in `Admin UI Foundation`.

### 6. Consolidate small Admin feature workflows

The following workflows are retired and their unique contract commands move into the Admin UI Foundation feature-contract bundle:

- `admin-approvals-ui.yml`
- `admin-commercial-documents-ui.yml`
- `admin-customers-ui.yml`
- `admin-dashboard-shell-ui.yml`
- `admin-general-settings-ui.yml`
- `admin-mobile-shell-ui.yml`
- `admin-personnel-ui.yml`
- `admin-request-center-ui.yml`
- `admin-users-store-ui.yml`

The bundle must keep each unique contract, but the expensive global checks run only once in the same workflow.

### 7. Narrow broad Admin triggers

`admin-a1-core-operations.yml` and `admin-project-base.yml` must no longer use `modulex-admin/**` as a pull-request trigger. Each retained domain workflow uses only its domain routes/components/libs/scripts/SQL/migrations/docs plus its own workflow file.

The only intentionally broad Admin source trigger is `Admin UI Foundation`, because it is the global Admin quality/UI gate.

### 8. Store CI has one normal PR core gate

`.github/workflows/gc8a-store-chrome-seo.yml` is retained but its workflow display name and responsibility become `Store Core CI`.

It becomes the single normal Store PR gate for `modulex-store/**` changes. After one install it runs the currently protected Store source contracts without duplicate nested GC workflows, then one lint and one production build. The preserved contract set includes the existing coverage from GC-6, GC-7, GC-8A, Showroom SEO, gallery/public regressions, and Store portal boundary checks.

These normal PR workflows are retired into Store Core CI:

- `gc6-cabinet-journey.yml`
- `gc7-attributed-social-proof.yml`
- `store-seo-showroom.yml`

Store contracts remain as scripts; only the duplicate workflow wrappers are removed.

### 9. Performance and write workflows stay specialized

`gc8b-accessibility-performance.yml` remains separate but is no longer a second full Store PR build pipeline. Source accessibility/performance contracts move into Store Core CI. GC-8B becomes a manual/post-deploy Lighthouse baseline workflow and must not duplicate Store Core lint/build on ordinary PRs.

`gc5-branch-contract.yml` remains separate and unchanged in principle because it can generate, commit, and push a migration. It is the only write-capable workflow and must not use interruptible concurrency.

### 10. Concurrency is part of the architecture

Every retained read-only workflow that can run from PR/push events uses:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

`gc5-branch-contract.yml` is the intentional exception because it writes/commits/pushes migration changes. Manual-only Lighthouse execution does not need to cancel another manually requested baseline unless explicitly changed later.

### 11. Target workflow inventory

After consolidation the approved workflow inventory is 10 files:

1. `.github/workflows/admin-ui-foundation.yml`
2. `.github/workflows/admin-a1-core-operations.yml`
3. `.github/workflows/admin-inventory-warehouse-qr-ui.yml`
4. `.github/workflows/admin-a3-product-master.yml`
5. `.github/workflows/admin-a6-finance-core.yml`
6. `.github/workflows/admin-project-base.yml`
7. `.github/workflows/admin-vendor-catalog-sync.yml`
8. `.github/workflows/gc5-branch-contract.yml`
9. `.github/workflows/gc8a-store-chrome-seo.yml` (display name: `Store Core CI`)
10. `.github/workflows/gc8b-accessibility-performance.yml`

This reaches the requested 8–12 workflow range without inventing a new workflow file.

## CI Governance Rule

Before any future workflow file is added:

1. Inspect the approved workflow inventory and existing path/contract coverage.
2. Prove that the requested behavior cannot be added to an existing workflow without creating an invalid responsibility boundary.
3. Check for duplicate contract commands, duplicate `npm ci`, duplicate build/lint/typecheck, and overlapping broad path filters.
4. Prefer modifying an existing workflow when coverage already overlaps.
5. If a genuinely new workflow is still required, obtain explicit user approval before creating the workflow file.
6. Only after approval may the approved workflow inventory be updated.

This rule is recorded in `AGENTS.md` and `docs/CI_WORKFLOW_ARCHITECTURE.md`.

A repository contract will enforce the mechanical part of the rule from the existing `Admin UI Foundation` workflow; no new governance workflow is created. The contract will fail when:

- a workflow exists outside the approved inventory;
- a retired workflow reappears;
- `AdminUICheck.md` / `ADMIN_UI_GUIDE.md` is owned by a workflow other than Admin UI Foundation;
- a retained Admin domain workflow reintroduces global `build`, `lint`, `typecheck`, `smoke:rbac`, or `smoke:production-surface` steps;
- broad `modulex-admin/**` triggers reappear outside Admin UI Foundation;
- broad normal-PR `modulex-store/**` triggers reappear outside Store Core CI;
- an event-driven read-only retained workflow omits the approved concurrency/cancel policy.

Updating the inventory is a policy change and therefore requires the explicit approval described above.

## Verification Strategy

The consolidation PR must demonstrate coverage before deleting wrappers.

### Contract inventory test

Create a CI architecture contract that maps every retired workflow's unique contract command to a retained workflow. The test must fail if a unique command disappears during consolidation.

### Duplicate-core test

The CI architecture contract scans retained workflow YAML and asserts that Admin global checks are owned only by Admin UI Foundation and Store global lint/build is owned only by Store Core CI for normal PRs.

### Trigger test

The contract asserts that broad Admin/Store path filters exist only at their approved global owners and that specialized workflows are domain-scoped.

### Concurrency test

The contract asserts the standard concurrency block for all retained read-only event-driven workflows and explicitly exempts the GC-5 write workflow.

### Local/static verification

Before opening the PR, run at minimum:

- CI workflow architecture contract
- Admin UI strict self-test
- Admin UI strict changed-file gate
- Admin production surface
- Admin RBAC
- Admin typecheck
- Admin lint
- Admin production build
- consolidated Inventory contracts
- consolidated Product/Pricing contracts
- consolidated Finance contracts
- Project contracts
- Vendor contracts
- Store preserved contract set
- Store lint
- Store production build

GC-5 write behavior is inspected but not executed as a mutation during ordinary consolidation verification.

## Expected PR behavior after consolidation

A normal Personnel/Leave UI PR should produce the Admin UI Foundation gate rather than six unrelated workflows. Its Personnel/Leave contract runs inside the same Admin workflow, and only one Admin install/lint/typecheck/build occurs.

A Product PR should produce Admin UI Foundation plus the Product domain workflow. Inventory, Project, GC-6, and GC-7 wrappers no longer run.

A Store page PR should produce Store Core CI. The separate Lighthouse baseline is manual/post-deploy and does not create a second normal PR build. GC-6/GC-7/Showroom wrappers no longer multiply Store builds.

## Non-goals

- Do not remove domain contract scripts merely because workflow wrappers are removed.
- Do not weaken Admin UI strict enforcement.
- Do not weaken RBAC, production-surface, typecheck, lint, or build gates.
- Do not alter application runtime behavior, database schema, RLS, or business logic.
- Do not make GC-5 write workflow interruptible.
