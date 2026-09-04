# Modulex CI Workflow Architecture

## Purpose

Modulex keeps domain contract coverage while avoiding duplicate GitHub Actions runners, installs, lint/typecheck/build work, and unrelated workflow fan-out.

## Approved workflow inventory

Only these workflow files are approved:

1. `.github/workflows/admin-ui-foundation.yml`
2. `.github/workflows/admin-a1-core-operations.yml`
3. `.github/workflows/admin-inventory-warehouse-qr-ui.yml`
4. `.github/workflows/admin-a3-product-master.yml`
5. `.github/workflows/admin-a6-finance-core.yml`
6. `.github/workflows/admin-project-base.yml`
7. `.github/workflows/admin-vendor-catalog-sync.yml`
8. `.github/workflows/gc5-branch-contract.yml`
9. `.github/workflows/gc8a-store-chrome-seo.yml` (`Store Core CI`)
10. `.github/workflows/gc8b-accessibility-performance.yml`

## Ownership rules

### Admin UI Foundation

`admin-ui-foundation.yml` is the sole global Admin owner for:

- `modulex-admin/AdminUICheck.md`
- `modulex-admin/docs/ADMIN_UI_GUIDE.md`
- Admin UI strict self-test and changed-file gate
- shared Admin UI/theme/table/resolution contracts
- Admin production-surface regression
- Admin RBAC regression
- Admin typecheck
- Admin lint
- Admin production build

Admin domain workflows run domain-specific contracts only and must not repeat those global commands.

### Admin domains

- `admin-a1-core-operations.yml`: Orders/core operations and portal-boundary contracts.
- `admin-inventory-warehouse-qr-ui.yml`: Inventory, warehouse/location, stock movement/operations, scan/QR, low-stock/reporting, and VAL-4 contracts.
- `admin-a3-product-master.yml`: Product Master, Product UI/reference/taxonomy, pricing, and product validation contracts.
- `admin-a6-finance-core.yml`: Finance Core/hardening and Finance Reports contracts.
- `admin-project-base.yml`: Project, payment, finance rollup, and procurement contracts.
- `admin-vendor-catalog-sync.yml`: Vendor/Stone catalog contracts.

Broad `modulex-admin/**` pull-request triggers are reserved for Admin UI Foundation. Domain workflows must use domain-scoped paths.

### Store Core CI

`.github/workflows/gc8a-store-chrome-seo.yml` keeps its filename but has display name `Store Core CI`. It is the single normal pull-request owner for broad `modulex-store/**` changes and runs the preserved Store source contracts, one lint pass, and one production build.

GC-6, GC-7, and Showroom SEO remain as contract scripts, not independent workflow wrappers.

### Specialized workflows

- `gc5-branch-contract.yml` is the write-capable branch-scoped migration workflow. It remains `contents: write` and must not use interruptible concurrency.
- `gc8b-accessibility-performance.yml` is specialized for manual/post-deploy Lighthouse baseline capture and must not duplicate normal Store lint/build.

## Concurrency

Every retained read-only workflow must use workflow-level concurrency with `cancel-in-progress: true`. The GC-5 write workflow is intentionally exempt because interrupting mutation preparation can leave an unsafe partial state.

## New workflow governance

Before adding any new `.github/workflows/*` file:

1. Inspect the approved inventory and existing path/contract coverage.
2. Check whether the behavior can be added to an existing workflow without violating responsibility boundaries.
3. Check for duplicate contract commands, duplicate `npm ci`, duplicate lint/typecheck/build, and overlapping broad path filters.
4. Prefer extending an existing workflow whenever coverage overlaps.
5. If a genuinely new workflow is still required, obtain explicit user approval before creating it.
6. Update this approved inventory only after that approval.

The static `modulex-admin/scripts/ci-workflow-architecture-contract.mjs` contract enforces the mechanical part of these rules from the existing Admin UI Foundation workflow. Governance does not get its own workflow.
