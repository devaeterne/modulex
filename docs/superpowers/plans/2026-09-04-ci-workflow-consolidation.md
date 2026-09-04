# CI Workflow Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Modulex GitHub Actions from 29 workflow wrappers to 10 responsibility-aligned workflows without losing contract coverage, while making `Admin UI Foundation` the sole Admin UI/global quality owner and enforcing a no-duplicate-workflow governance rule.

**Architecture:** Keep domain-specific contract scripts, but consolidate duplicate workflow wrappers and move all repeated global Admin verification into `admin-ui-foundation.yml`. Consolidate Store PR verification into the existing GC-8A workflow file, renamed by display name to `Store Core CI`, while keeping GC-5 write behavior and GC-8B Lighthouse behavior specialized. Add a static CI architecture contract to the existing Admin UI Foundation workflow so future workflow additions/duplication fail closed unless the approved inventory is intentionally updated after explicit user approval.

**Tech Stack:** GitHub Actions YAML, Node.js contract scripts, npm, Next.js 16, ESLint, TypeScript, existing Modulex smoke-contract scripts.

**Spec:** `docs/superpowers/specs/2026-09-04-ci-workflow-consolidation-design.md`

## Global Constraints

- Final approved workflow inventory is exactly 10 files.
- `Admin UI Foundation` is the only global owner of `modulex-admin/AdminUICheck.md`, `modulex-admin/docs/ADMIN_UI_GUIDE.md`, Admin UI strict checks, Admin production-surface, RBAC, typecheck, lint, and full Admin build.
- Admin feature/domain workflows must not repeat global `build`, `lint`, `typecheck`, `smoke:rbac`, or `smoke:production-surface` steps.
- Admin feature/domain workflows must not trigger merely because `AdminUICheck.md` or `ADMIN_UI_GUIDE.md` changes.
- Broad `modulex-admin/**` PR triggers are allowed only in `admin-ui-foundation.yml`.
- Normal Store PR verification is owned by existing `.github/workflows/gc8a-store-chrome-seo.yml`, with display name `Store Core CI`.
- Broad `modulex-store/**` PR triggers are allowed only in Store Core CI for normal PR verification.
- `gc5-branch-contract.yml` remains write-capable, branch-scoped, and non-interruptible.
- `gc8b-accessibility-performance.yml` remains specialized for manual/post-deploy Lighthouse and must not duplicate ordinary Store lint/build.
- No new workflow file may be added unless existing workflow coverage has first been checked for overlap and the user explicitly approves creation of the new workflow.
- The governance rule must be recorded in `AGENTS.md` and `docs/CI_WORKFLOW_ARCHITECTURE.md` and mechanically enforced by an existing workflow, not a new workflow.
- Application runtime behavior, DB schema, RLS, business logic, and contract-script semantics are out of scope.

---

### Task 1: Add a failing CI architecture contract and governance documentation

**Files:**
- Create: `modulex-admin/scripts/ci-workflow-architecture-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `AGENTS.md`
- Create: `docs/CI_WORKFLOW_ARCHITECTURE.md`
- Modify: `.github/workflows/admin-ui-foundation.yml`

**Interfaces:**
- Consumes: the approved 10-file workflow inventory and ownership rules from the spec.
- Produces: `npm run smoke:ci-workflow-architecture`, a static contract that validates workflow inventory, global-check ownership, broad path ownership, concurrency rules, and retired-workflow absence.

- [ ] **Step 1: Write the failing contract**

Implement `modulex-admin/scripts/ci-workflow-architecture-contract.mjs` so it reads `.github/workflows/*.yml` from the repo root and asserts all of the following:

```js
const APPROVED = new Set([
  "admin-ui-foundation.yml",
  "admin-a1-core-operations.yml",
  "admin-inventory-warehouse-qr-ui.yml",
  "admin-a3-product-master.yml",
  "admin-a6-finance-core.yml",
  "admin-project-base.yml",
  "admin-vendor-catalog-sync.yml",
  "gc5-branch-contract.yml",
  "gc8a-store-chrome-seo.yml",
  "gc8b-accessibility-performance.yml",
]);
```

The contract must additionally assert:

```js
// Admin UI ownership
assertOnlyOwner("AdminUICheck.md", "admin-ui-foundation.yml");
assertOnlyOwner("ADMIN_UI_GUIDE.md", "admin-ui-foundation.yml");

// Admin global commands
for (const cmd of [
  "smoke:production-surface",
  "smoke:rbac",
  "npm run typecheck",
  "npm run lint",
  "npm run build",
]) {
  assertAdminGlobalOwner(cmd, "admin-ui-foundation.yml");
}

// Broad triggers
assertOnlyBroadAdminOwner("modulex-admin/**", "admin-ui-foundation.yml");
assertOnlyBroadStoreOwner("modulex-store/**", "gc8a-store-chrome-seo.yml");

// Specialized behavior
assertGc5HasContentsWriteAndNoInterruptibleConcurrency();
assertGc8bHasNoPullRequestFullBuildPipeline();
assertReadOnlyRetainedWorkflowsHaveCancelInProgressConcurrency();
```

The error text must name the offending workflow and violated rule so CI failures are actionable.

- [ ] **Step 2: Add the npm command and run it to verify RED**

Add to `modulex-admin/package.json`:

```json
"smoke:ci-workflow-architecture": "node scripts/ci-workflow-architecture-contract.mjs"
```

Run:

```bash
cd modulex-admin
npm run smoke:ci-workflow-architecture
```

Expected: **FAIL** because the repository still contains retired workflows, broad triggers, and duplicate global checks.

- [ ] **Step 3: Record the governance rule**

Add an explicit CI governance section to `AGENTS.md` and create `docs/CI_WORKFLOW_ARCHITECTURE.md` containing:

```text
Before adding any workflow file, inspect existing workflow ownership and contract coverage first.
If an existing workflow can own the new check without violating its responsibility boundary, modify that workflow instead of creating another one.
A genuinely new workflow file requires explicit user approval before creation.
Any approved inventory change must update the CI architecture contract and this document in the same PR.
```

Document the exact approved 10-file inventory and owner responsibilities from the spec.

- [ ] **Step 4: Wire the architecture contract into Admin UI Foundation before expensive checks**

In `.github/workflows/admin-ui-foundation.yml`, add this step immediately after `npm ci`:

```yaml
      - name: CI workflow architecture contract
        run: npm run smoke:ci-workflow-architecture
```

Keep Admin UI strict checks and all global Admin quality checks intact.

- [ ] **Step 5: Commit the RED governance baseline**

```bash
git add AGENTS.md docs/CI_WORKFLOW_ARCHITECTURE.md modulex-admin/package.json modulex-admin/scripts/ci-workflow-architecture-contract.mjs .github/workflows/admin-ui-foundation.yml
git commit -m "test: define CI workflow architecture contract"
```

---

### Task 2: Consolidate Inventory/A2 workflows

**Files:**
- Modify: `.github/workflows/admin-inventory-warehouse-qr-ui.yml`
- Delete: `.github/workflows/admin-a2-low-stock-reporting.yml`
- Delete: `.github/workflows/admin-a2-stock-operations-scanning.yml`
- Delete: `.github/workflows/admin-low-stock-ui.yml`
- Delete: `.github/workflows/admin-val4-inventory-validation.yml`

**Interfaces:**
- Consumes: existing inventory/warehouse/QR, stock-movement, A2 warehouse, A2 movements, stock-operations, low-stock, and VAL-4 contract scripts.
- Produces: one Inventory domain workflow that runs every unique Inventory/A2 contract once and no global Admin quality commands.

- [ ] **Step 1: Expand the retained Inventory path scope only to Inventory/A2 files**

Ensure `admin-inventory-warehouse-qr-ui.yml` covers these domain families and their contract/config files:

```text
modulex-admin/src/app/(admin)/inventory/**
modulex-admin/src/app/(admin)/stock-movements/**
modulex-admin/src/app/(admin)/stock-operations/**
modulex-admin/src/app/(admin)/warehouses/**
modulex-admin/src/app/(admin)/zones/**
modulex-admin/src/app/(admin)/locations/**
modulex-admin/src/app/(admin)/qr-labels/**
modulex-admin/src/app/(admin)/scan/**
modulex-admin/src/app/(admin)/shelf-inventory/**
modulex-admin/src/app/(admin)/low-stock/**
modulex-admin/src/app/(admin)/reports/**
modulex-admin/src/components/inventory/**
modulex-admin/src/components/stock-movements/**
modulex-admin/src/components/stock-operations/**
modulex-admin/src/components/warehouses/**
modulex-admin/src/components/zones/**
modulex-admin/src/components/locations/**
modulex-admin/src/components/qr-labels/**
modulex-admin/src/components/qr/**
modulex-admin/src/components/scan/**
modulex-admin/src/components/reports/**
modulex-admin/src/lib/inventory/**
modulex-admin/src/lib/scan/**
modulex-admin/src/lib/reports/**
modulex-admin/src/lib/validation.ts
modulex-admin/scripts/*inventory*.mjs
modulex-admin/scripts/*warehouse*.mjs
modulex-admin/scripts/*stock*.mjs
modulex-admin/scripts/*low-stock*.mjs
modulex-admin/scripts/val-4-inventory-warehouses-validation-contract.mjs
modulex-admin/sql/a2-*.sql
.github/workflows/admin-inventory-warehouse-qr-ui.yml
```

Do not add `modulex-admin/**`.

- [ ] **Step 2: Replace duplicate regressions with the unique contract set**

After one `npm ci`, the retained workflow must run exactly these Inventory/A2 checks once:

```yaml
      - run: node scripts/inventory-warehouse-qr-ui-contract.mjs
      - run: node scripts/stock-movement-actions-contract.mjs
      - run: npm run smoke:a2-warehouse-integrity
      - run: npm run smoke:a2-inventory-movements
      - run: node scripts/a2-stock-operations-scanning-contract.mjs
      - run: npm run smoke:a2-low-stock-reporting
      - run: node scripts/low-stock-ui-contract.mjs
      - run: npm run smoke:val-4-inventory-validation
```

Remove `smoke:production-surface`, `smoke:rbac`, `typecheck`, `lint`, and `build` from this domain workflow.

- [ ] **Step 3: Delete the four retired Inventory wrappers**

Delete exactly:

```text
.github/workflows/admin-a2-low-stock-reporting.yml
.github/workflows/admin-a2-stock-operations-scanning.yml
.github/workflows/admin-low-stock-ui.yml
.github/workflows/admin-val4-inventory-validation.yml
```

Do not delete any underlying contract script.

- [ ] **Step 4: Run the architecture contract and Inventory contracts**

```bash
cd modulex-admin
npm run smoke:a2-warehouse-integrity
npm run smoke:a2-inventory-movements
node scripts/a2-stock-operations-scanning-contract.mjs
npm run smoke:a2-low-stock-reporting
node scripts/low-stock-ui-contract.mjs
npm run smoke:val-4-inventory-validation
npm run smoke:ci-workflow-architecture
```

Expected: domain contracts PASS; architecture contract may still FAIL only on not-yet-consolidated workflows from later tasks.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/admin-inventory-warehouse-qr-ui.yml .github/workflows/admin-a2-low-stock-reporting.yml .github/workflows/admin-a2-stock-operations-scanning.yml .github/workflows/admin-low-stock-ui.yml .github/workflows/admin-val4-inventory-validation.yml
git commit -m "ci: consolidate Inventory workflow coverage"
```

---

### Task 3: Consolidate Product and Finance workflows

**Files:**
- Modify: `.github/workflows/admin-a3-product-master.yml`
- Delete: `.github/workflows/admin-product-list-ui.yml`
- Delete: `.github/workflows/admin-products-pricing-ui.yml`
- Modify: `.github/workflows/admin-a6-finance-core.yml`
- Delete: `.github/workflows/admin-finance-reports-ui.yml`

**Interfaces:**
- Consumes: Product Master/UI/pricing contracts and Finance Core/hardening/reports contracts.
- Produces: one Product domain workflow and one Finance domain workflow, each domain-only.

- [ ] **Step 1: Make Product workflow domain-only**

Retain or add these Product checks after one install:

```yaml
      - run: npm run smoke:a3-product-master
      - run: npm run smoke:product-master-v2
      - run: node scripts/product-list-ui-contract.mjs
      - run: node scripts/product-form-ui-contract.mjs
      - run: node scripts/product-reference-ui-contract.mjs
      - run: node scripts/taxonomy-ui-contract.mjs
      - run: node scripts/products-pricing-ui-contract.mjs
      - run: node scripts/pricing-product-type-contract.mjs
      - run: npm run smoke:val-2-products-pricing
```

Remove A1/A2 regression commands and remove global Admin RBAC/typecheck/lint/build commands.

Ensure Product paths cover Product routes/components/scripts/pricing/taxonomy migrations only and do not include `modulex-admin/**`.

- [ ] **Step 2: Delete the two retired Product wrappers**

```text
.github/workflows/admin-product-list-ui.yml
.github/workflows/admin-products-pricing-ui.yml
```

- [ ] **Step 3: Make Finance workflow domain-only and absorb Finance Reports**

After one install, `admin-a6-finance-core.yml` must run:

```yaml
      - run: npm run smoke:a6-finance-core
      - run: node scripts/finance-reports-ui-contract.mjs
```

Retain Finance-specific path filters from both former workflows. Remove Admin UI strict, RBAC, typecheck, lint, and build because Admin UI Foundation owns them.

- [ ] **Step 4: Delete the retired Finance Reports wrapper**

```text
.github/workflows/admin-finance-reports-ui.yml
```

- [ ] **Step 5: Run Product and Finance verification**

```bash
cd modulex-admin
npm run smoke:a3-product-master
npm run smoke:product-master-v2
node scripts/product-list-ui-contract.mjs
node scripts/product-form-ui-contract.mjs
node scripts/product-reference-ui-contract.mjs
node scripts/taxonomy-ui-contract.mjs
node scripts/products-pricing-ui-contract.mjs
node scripts/pricing-product-type-contract.mjs
npm run smoke:val-2-products-pricing
npm run smoke:a6-finance-core
node scripts/finance-reports-ui-contract.mjs
npm run smoke:ci-workflow-architecture
```

Expected: domain contracts PASS; architecture contract may still FAIL only on later consolidation tasks.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/admin-a3-product-master.yml .github/workflows/admin-product-list-ui.yml .github/workflows/admin-products-pricing-ui.yml .github/workflows/admin-a6-finance-core.yml .github/workflows/admin-finance-reports-ui.yml
git commit -m "ci: consolidate Product and Finance workflows"
```

---

### Task 4: Fold small Admin UI contracts into Admin UI Foundation

**Files:**
- Modify: `.github/workflows/admin-ui-foundation.yml`
- Delete: `.github/workflows/admin-approvals-ui.yml`
- Delete: `.github/workflows/admin-commercial-documents-ui.yml`
- Delete: `.github/workflows/admin-customers-ui.yml`
- Delete: `.github/workflows/admin-dashboard-shell-ui.yml`
- Delete: `.github/workflows/admin-general-settings-ui.yml`
- Delete: `.github/workflows/admin-mobile-shell-ui.yml`
- Delete: `.github/workflows/admin-personnel-ui.yml`
- Delete: `.github/workflows/admin-request-center-ui.yml`
- Delete: `.github/workflows/admin-users-store-ui.yml`

**Interfaces:**
- Consumes: each retired wrapper's unique UI/domain contract commands.
- Produces: one Admin UI/global workflow that owns Admin quality checks and runs all small feature contracts once after one install.

- [ ] **Step 1: Add the unique feature-contract bundle to Admin UI Foundation**

After the CI architecture contract and before expensive global checks, add these unique feature checks:

```yaml
      - run: node scripts/approvals-ui-contract.mjs
      - run: node scripts/commercial-document-contract.mjs
      - run: node scripts/customers-ui-contract.mjs
      - run: node scripts/dashboard-shell-ui-contract.mjs
      - run: node scripts/general-settings-ui-contract.mjs
      - run: node scripts/mobile-shell-ui-contract.mjs
      - run: node scripts/personnel-ui-contract.mjs
      - run: node scripts/leave-ui-contract.mjs
      - run: node scripts/request-center-ui-contract.mjs
      - run: npm run smoke:requests-admin
      - run: node scripts/users-store-ui-contract.mjs
      - run: npm run smoke:admin-users
```

If `leave-ui-contract.mjs` is present only on the currently open Leave branch and not yet on the consolidation base, make the consolidation branch consume it only after rebasing/merging the eventual Leave change; do not invent a replacement contract. The final consolidation PR must be based on a `main` that contains every contract referenced by the workflow.

- [ ] **Step 2: Preserve one copy of all Admin global checks**

Keep exactly one Admin global sequence in `admin-ui-foundation.yml`:

```yaml
      - run: npm run smoke:admin-ui-strict:self-test
      - run: npm run smoke:admin-ui-strict
      - run: npm run smoke:admin-ui
      - run: npm run smoke:production-surface
      - run: npm run smoke:rbac
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
```

Keep existing shared table/theme/resolution/countertop/order UI contracts unless the architecture contract proves they are duplicated elsewhere in a retained workflow.

- [ ] **Step 3: Delete the nine retired small Admin wrappers**

Delete exactly:

```text
.github/workflows/admin-approvals-ui.yml
.github/workflows/admin-commercial-documents-ui.yml
.github/workflows/admin-customers-ui.yml
.github/workflows/admin-dashboard-shell-ui.yml
.github/workflows/admin-general-settings-ui.yml
.github/workflows/admin-mobile-shell-ui.yml
.github/workflows/admin-personnel-ui.yml
.github/workflows/admin-request-center-ui.yml
.github/workflows/admin-users-store-ui.yml
```

- [ ] **Step 4: Run all migrated feature contracts locally**

```bash
cd modulex-admin
node scripts/approvals-ui-contract.mjs
node scripts/commercial-document-contract.mjs
node scripts/customers-ui-contract.mjs
node scripts/dashboard-shell-ui-contract.mjs
node scripts/general-settings-ui-contract.mjs
node scripts/mobile-shell-ui-contract.mjs
node scripts/personnel-ui-contract.mjs
node scripts/leave-ui-contract.mjs
node scripts/request-center-ui-contract.mjs
npm run smoke:requests-admin
node scripts/users-store-ui-contract.mjs
npm run smoke:admin-users
npm run smoke:ci-workflow-architecture
```

Expected: feature contracts PASS; architecture contract may still FAIL only on later broad-trigger/Store cleanup.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/admin-ui-foundation.yml .github/workflows/admin-approvals-ui.yml .github/workflows/admin-commercial-documents-ui.yml .github/workflows/admin-customers-ui.yml .github/workflows/admin-dashboard-shell-ui.yml .github/workflows/admin-general-settings-ui.yml .github/workflows/admin-mobile-shell-ui.yml .github/workflows/admin-personnel-ui.yml .github/workflows/admin-request-center-ui.yml .github/workflows/admin-users-store-ui.yml
git commit -m "ci: fold Admin feature checks into UI foundation"
```

---

### Task 5: Narrow A1 and Project Base and strip duplicate global work from retained Admin domains

**Files:**
- Modify: `.github/workflows/admin-a1-core-operations.yml`
- Modify: `.github/workflows/admin-project-base.yml`
- Modify: `.github/workflows/admin-vendor-catalog-sync.yml`

**Interfaces:**
- Consumes: existing A1, Project, and Vendor contract scripts.
- Produces: narrowly triggered domain-only workflows with no duplicate global Admin quality commands.

- [ ] **Step 1: Narrow A1 trigger scope**

Replace `modulex-admin/**` with paths limited to Orders/core operations and Store portal Admin boundaries, including:

```text
modulex-admin/src/app/(admin)/orders/**
modulex-admin/src/app/(admin)/customers/**/orders/**
modulex-admin/src/components/orders/**
modulex-admin/src/components/customers/*Order*.tsx
modulex-admin/src/lib/orders/**
modulex-admin/src/app/api/orders/**
modulex-admin/scripts/a1-core-operations-contract.mjs
modulex-admin/scripts/order-*.mjs
modulex-admin/scripts/store-portal-admin-contract.mjs
modulex-store/scripts/store-portal-contract.mjs
modulex-store/scripts/portal-experience-contract.mjs
.github/workflows/admin-a1-core-operations.yml
```

Keep the A1/order/store-portal domain contracts, but remove Admin global RBAC/lint/build. If Store portal boundary verification remains as a second job, keep only its Store-specific contracts/scoped lint/build when the Store files in this A1 boundary actually change; otherwise move those Store contracts into Store Core CI and remove the duplicate job.

- [ ] **Step 2: Narrow Project Base trigger scope**

Replace `modulex-admin/**` and blanket `modulex-store/supabase/migrations/**` with Project-specific routes/components/libs/scripts/SQL/migrations/docs:

```text
modulex-admin/src/app/(admin)/projects/**
modulex-admin/src/components/projects/**
modulex-admin/src/lib/projects/**
modulex-admin/scripts/project-*.mjs
modulex-admin/scripts/countertop-sink-fallback-contract.mjs
docs/PROJECT_BASE_PLAN.md
modulex-store/supabase/migrations/*project*.sql
modulex-store/supabase/migrations/*procurement*.sql
modulex-store/supabase/migrations/*payment*.sql
.github/workflows/admin-project-base.yml
```

Preserve the existing Project contract sequence; it already does not run duplicate global Admin build/lint/RBAC.

- [ ] **Step 3: Strip global quality commands from Vendor workflow**

Keep Vendor/Stone contract commands only. Remove `npm run typecheck`, `npm run lint`, and `npm run build` from `admin-vendor-catalog-sync.yml` because Admin UI Foundation owns the global Admin quality gate for Admin source changes.

- [ ] **Step 4: Run retained domain contracts**

```bash
cd modulex-admin
npm run smoke:a1-core-operations
npm run smoke:order-domain
npm run smoke:order-lifecycle
npm run smoke:store-portal-admin
node scripts/project-base-contract.mjs
node scripts/project-progress-layout-contract.mjs
node scripts/project-financial-rollup-contract.mjs
node scripts/project-payment-ledger-contract.mjs
node scripts/project-payment-edit-delete-contract.mjs
node scripts/project-finance-simple-flow-contract.mjs
node scripts/project-procurement-contract.mjs
node scripts/countertop-sink-fallback-contract.mjs
node scripts/vendor-catalog-sync-contract.mjs
node scripts/stone-vendor-catalog-contract.mjs
node scripts/stone-media-approval-contract.mjs
node scripts/stone-product-identity-contract.mjs
node scripts/msi-pagination-contract.mjs
node scripts/marble-systems-stale-product-contract.mjs
node scripts/vendor-approval-idempotency-contract.mjs
node scripts/vendor-availability-contract.mjs
npm run smoke:ci-workflow-architecture
```

Expected: all domain contracts PASS; architecture contract may still FAIL only on Store consolidation.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/admin-a1-core-operations.yml .github/workflows/admin-project-base.yml .github/workflows/admin-vendor-catalog-sync.yml
git commit -m "ci: narrow retained Admin domain workflows"
```

---

### Task 6: Consolidate Store PR workflows into Store Core CI

**Files:**
- Modify: `.github/workflows/gc8a-store-chrome-seo.yml`
- Delete: `.github/workflows/gc6-cabinet-journey.yml`
- Delete: `.github/workflows/gc7-attributed-social-proof.yml`
- Delete: `.github/workflows/store-seo-showroom.yml`
- Modify: `.github/workflows/gc8b-accessibility-performance.yml`
- Keep: `.github/workflows/gc5-branch-contract.yml`

**Interfaces:**
- Consumes: Store public, gallery, GC3, GC5, GC6, GC7, GC8A, showroom SEO, portal-boundary, accessibility, and performance contract scripts.
- Produces: one normal Store PR workflow with one install/lint/build; one specialized Lighthouse workflow; unchanged GC-5 write workflow.

- [ ] **Step 1: Rename GC-8A display responsibility to Store Core CI**

Keep the filename `.github/workflows/gc8a-store-chrome-seo.yml`, but set:

```yaml
name: Store Core CI
```

Use the normal PR trigger:

```yaml
  pull_request:
    paths:
      - "modulex-store/**"
      - "modulex-admin/src/components/store/**"
      - "modulex-admin/src/lib/store/**"
      - "modulex-admin/src/app/(admin)/store/**"
      - ".github/workflows/gc8a-store-chrome-seo.yml"
```

Do not introduce another broad Store workflow.

- [ ] **Step 2: Run the preserved Store contract set exactly once after one install**

The Store job must include the preserved contract coverage without nested duplicate workflow wrappers:

```yaml
      - run: npm run smoke:public-production
      - run: npm run smoke:secondary-cms-contract
      - run: npm run smoke:store-public-content
      - run: npm run smoke:gc3-company-domain
      - run: npm run smoke:gc3-company-public
      - run: npm run smoke:gc5-gallery-projects
      - run: npm run smoke:gc6-cabinet-journey
      - run: npm run smoke:gc7-social-proof
      - run: npm run smoke:gc8a-store-chrome-seo
      - run: npm run smoke:gc8b-accessibility
      - run: npm run smoke:gc8b-performance
      - run: npm run smoke:gallery-freshness
      - run: npm run smoke:gallery-theme
      - run: npm run smoke:seo-showroom
      - run: npm run smoke:store-portal
      - run: npm run smoke:portal-experience
      - run: npm run smoke:portal-auth-rpc-guard
      - run: npm run smoke:portal-public-navbar
```

Then run Store lint once and Store production build once.

If Admin Store CMS source paths are in the trigger, keep a single Admin Store-scoped job with one install and only Store-CMS-specific contract/scoped-lint verification. Do not run a second full Admin global build because Admin UI Foundation owns that.

- [ ] **Step 3: Delete GC-6, GC-7, and Showroom wrapper workflows**

Delete exactly:

```text
.github/workflows/gc6-cabinet-journey.yml
.github/workflows/gc7-attributed-social-proof.yml
.github/workflows/store-seo-showroom.yml
```

Keep their contract scripts.

- [ ] **Step 4: Convert GC-8B to specialized Lighthouse/manual verification**

Remove ordinary `pull_request` full Store build behavior. Keep `workflow_dispatch` and the production Lighthouse baseline job. If source accessibility/performance contracts are retained in GC-8B for manual execution, they must not repeat full Store lint/build; those contracts already run in Store Core CI.

- [ ] **Step 5: Verify GC-5 remains write-specialized**

Inspect `.github/workflows/gc5-branch-contract.yml` and confirm:

```text
permissions: contents: write
branch: feat/gc5-gallery-projects-media-library
no cancel-in-progress concurrency
```

Do not execute its migration-writing job during this consolidation task.

- [ ] **Step 6: Run Store contract coverage locally**

```bash
cd modulex-store
npm run smoke:public-production
npm run smoke:secondary-cms-contract
npm run smoke:store-public-content
npm run smoke:gc3-company-domain
npm run smoke:gc3-company-public
npm run smoke:gc5-gallery-projects
npm run smoke:gc6-cabinet-journey
npm run smoke:gc7-social-proof
npm run smoke:gc8a-store-chrome-seo
npm run smoke:gc8b-accessibility
npm run smoke:gc8b-performance
npm run smoke:gallery-freshness
npm run smoke:gallery-theme
npm run smoke:seo-showroom
npm run smoke:store-portal
npm run smoke:portal-experience
npm run smoke:portal-auth-rpc-guard
npm run smoke:portal-public-navbar
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key NEXT_PUBLIC_SITE_URL=https://oakwellcabinetry.com npm run build
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/gc8a-store-chrome-seo.yml .github/workflows/gc6-cabinet-journey.yml .github/workflows/gc7-attributed-social-proof.yml .github/workflows/store-seo-showroom.yml .github/workflows/gc8b-accessibility-performance.yml .github/workflows/gc5-branch-contract.yml
git commit -m "ci: consolidate Store verification workflows"
```

---

### Task 7: Make the architecture contract GREEN and verify the final 10-workflow inventory

**Files:**
- Modify if needed: `modulex-admin/scripts/ci-workflow-architecture-contract.mjs`
- Modify if needed: `docs/CI_WORKFLOW_ARCHITECTURE.md`
- Modify if needed: `.github/workflows/admin-ui-foundation.yml`

**Interfaces:**
- Consumes: all workflow consolidation from Tasks 2–6.
- Produces: final static proof that the workflow inventory and ownership rules match the approved design.

- [ ] **Step 1: Run the architecture contract**

```bash
cd modulex-admin
npm run smoke:ci-workflow-architecture
```

Expected: **PASS** and output identifying exactly 10 approved workflow files.

- [ ] **Step 2: Verify workflow count and names directly**

```bash
cd ..
printf '%s\n' .github/workflows/*.yml | sort
printf '%s\n' .github/workflows/*.yml | wc -l
```

Expected count: `10`.

Expected filenames:

```text
.github/workflows/admin-a1-core-operations.yml
.github/workflows/admin-a3-product-master.yml
.github/workflows/admin-a6-finance-core.yml
.github/workflows/admin-inventory-warehouse-qr-ui.yml
.github/workflows/admin-project-base.yml
.github/workflows/admin-ui-foundation.yml
.github/workflows/admin-vendor-catalog-sync.yml
.github/workflows/gc5-branch-contract.yml
.github/workflows/gc8a-store-chrome-seo.yml
.github/workflows/gc8b-accessibility-performance.yml
```

- [ ] **Step 3: Verify no duplicate Admin global commands outside UI Foundation**

```bash
for f in .github/workflows/admin-*.yml; do
  [[ "$f" == ".github/workflows/admin-ui-foundation.yml" ]] && continue
  if grep -E 'smoke:production-surface|smoke:rbac|npm run typecheck|npm run lint|npm run build' "$f"; then
    echo "duplicate Admin global check in $f"
    exit 1
  fi
done
```

Expected: no output and exit 0.

- [ ] **Step 4: Verify broad triggers have one owner each**

```bash
grep -R -n 'modulex-admin/\*\*' .github/workflows
grep -R -n 'modulex-store/\*\*' .github/workflows
```

Expected:
- broad Admin source trigger appears only in `admin-ui-foundation.yml`;
- broad normal Store PR trigger appears only in `gc8a-store-chrome-seo.yml`;
- specialized GC-5 branch behavior is exempt because it is not a broad normal PR workflow.

- [ ] **Step 5: Commit any final contract/doc corrections**

```bash
git add modulex-admin/scripts/ci-workflow-architecture-contract.mjs docs/CI_WORKFLOW_ARCHITECTURE.md .github/workflows/admin-ui-foundation.yml
git commit -m "test: enforce consolidated CI ownership"
```

---

### Task 8: Run the full pre-PR verification and inspect the actual workflow fan-out

**Files:**
- No application code changes expected.
- Modify only CI/docs files if verification exposes a contract-coverage gap.

**Interfaces:**
- Consumes: final consolidated workflow set.
- Produces: evidence that global quality gates and all preserved domain contract groups still pass before the PR is opened.

- [ ] **Step 1: Run Admin global verification**

```bash
cd modulex-admin
npm run smoke:ci-workflow-architecture
npm run smoke:admin-ui-strict:self-test
npm run smoke:admin-ui-strict
npm run smoke:admin-ui
npm run smoke:production-surface
npm run smoke:rbac
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key npm run build
```

Expected: all PASS.

- [ ] **Step 2: Run retained Admin domain verification**

```bash
npm run smoke:a1-core-operations
npm run smoke:a2-warehouse-integrity
npm run smoke:a2-inventory-movements
node scripts/a2-stock-operations-scanning-contract.mjs
npm run smoke:a2-low-stock-reporting
npm run smoke:val-4-inventory-validation
npm run smoke:a3-product-master
npm run smoke:product-master-v2
npm run smoke:val-2-products-pricing
npm run smoke:a6-finance-core
node scripts/finance-reports-ui-contract.mjs
node scripts/project-base-contract.mjs
node scripts/project-procurement-contract.mjs
node scripts/vendor-catalog-sync-contract.mjs
node scripts/stone-vendor-catalog-contract.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run migrated small Admin feature contracts**

```bash
node scripts/approvals-ui-contract.mjs
node scripts/commercial-document-contract.mjs
node scripts/customers-ui-contract.mjs
node scripts/dashboard-shell-ui-contract.mjs
node scripts/general-settings-ui-contract.mjs
node scripts/mobile-shell-ui-contract.mjs
node scripts/personnel-ui-contract.mjs
node scripts/leave-ui-contract.mjs
node scripts/request-center-ui-contract.mjs
node scripts/users-store-ui-contract.mjs
```

Expected: all PASS.

- [ ] **Step 4: Run Store global verification**

```bash
cd ../modulex-store
npm run smoke:public-production
npm run smoke:secondary-cms-contract
npm run smoke:store-public-content
npm run smoke:gc3-company-domain
npm run smoke:gc3-company-public
npm run smoke:gc5-gallery-projects
npm run smoke:gc6-cabinet-journey
npm run smoke:gc7-social-proof
npm run smoke:gc8a-store-chrome-seo
npm run smoke:gc8b-accessibility
npm run smoke:gc8b-performance
npm run smoke:gallery-freshness
npm run smoke:gallery-theme
npm run smoke:seo-showroom
npm run smoke:store-portal
npm run smoke:portal-experience
npm run smoke:portal-auth-rpc-guard
npm run smoke:portal-public-navbar
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key NEXT_PUBLIC_SITE_URL=https://oakwellcabinetry.com npm run build
```

Expected: all PASS.

- [ ] **Step 5: Rebase/sync against the execution-time current `main` before opening the PR**

```bash
git fetch origin
git rebase origin/main
```

Resolve only CI/docs conflicts by preserving current-main contract additions inside the retained workflow owner. Do not drop newly merged contract scripts or coverage just to make the consolidation simpler.

- [ ] **Step 6: Re-run architecture + affected contracts after sync**

At minimum:

```bash
cd modulex-admin
npm run smoke:ci-workflow-architecture
npm run smoke:admin-ui-strict
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key npm run build
```

Then re-run any domain contract whose workflow changed during the sync.

- [ ] **Step 7: Open a non-draft PR and inspect workflow fan-out**

PR title:

```text
ci: consolidate Modulex workflow architecture
```

PR body must state:

```text
- 29 workflow wrappers reduced to the approved 10-file inventory
- no domain contract scripts removed
- Admin UI Foundation is the sole Admin UI/global quality owner
- Store Core CI is the sole normal Store PR core owner
- GC-5 write workflow remains specialized and non-interruptible
- CI architecture contract prevents duplicate workflow/global-check regressions
- new workflow files require explicit user approval after overlap review
```

Verify that the consolidation PR itself produces only workflows whose changed paths legitimately match. A subsequent Personnel-only test PR should produce Admin UI Foundation rather than A1/Project/GC-6/GC-7 fan-out; a Product-only PR should produce Admin UI Foundation + Product domain; a Store-only PR should produce Store Core CI.

- [ ] **Step 8: Final verification commit only if evidence required a correction**

If and only if verification required a CI/docs correction:

```bash
git add .github/workflows modulex-admin/scripts/ci-workflow-architecture-contract.mjs docs/CI_WORKFLOW_ARCHITECTURE.md AGENTS.md
git commit -m "ci: finalize consolidated workflow gates"
```

Do not create a new workflow file during this step.
