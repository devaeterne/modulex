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

The contract must additionally assert Admin UI ownership, Admin global-command ownership, broad trigger ownership, GC-5 write/non-interruptible behavior, GC-8B specialization, and concurrency on retained read-only workflows. Error text must name the offending workflow and violated rule.

- [ ] **Step 2: Add the npm command and run it to verify RED**

Add:

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

Add an explicit CI governance section to `AGENTS.md` and create `docs/CI_WORKFLOW_ARCHITECTURE.md` containing the approved inventory and the rule that existing coverage must be checked first and genuinely new workflow files require explicit user approval.

- [ ] **Step 4: Wire the architecture contract into Admin UI Foundation before expensive checks**

Add immediately after `npm ci`:

```yaml
      - name: CI workflow architecture contract
        run: npm run smoke:ci-workflow-architecture
```

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

Cover Inventory, stock movement/operations, warehouse/location/zone, QR/scan, low-stock/reporting, validation, matching scripts/SQL, and the retained workflow file. Do not add `modulex-admin/**`.

- [ ] **Step 2: Replace duplicate regressions with the unique contract set**

After one `npm ci`, run once:

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

Delete the four files listed above; keep every underlying contract script.

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

Expected: domain contracts PASS; architecture contract may still FAIL only on not-yet-consolidated workflows.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows
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

After one install retain Product Master, Product Master v2, Product list/form/reference/taxonomy UI, products-pricing, pricing-product-type, and VAL-2 Product/Pricing validation. Remove A1/A2 regression chains and global Admin quality commands.

- [ ] **Step 2: Delete the two retired Product wrappers**

Delete `admin-product-list-ui.yml` and `admin-products-pricing-ui.yml`.

- [ ] **Step 3: Make Finance workflow domain-only and absorb Finance Reports**

Run only:

```yaml
      - run: npm run smoke:a6-finance-core
      - run: node scripts/finance-reports-ui-contract.mjs
```

Retain Finance-specific paths from both former workflows. Remove Admin UI strict, RBAC, typecheck, lint, and build.

- [ ] **Step 4: Delete the retired Finance Reports wrapper**

Delete `.github/workflows/admin-finance-reports-ui.yml`.

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

- [ ] **Step 6: Commit**

```bash
git add .github/workflows
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

Add approvals, commercial-document, customers, dashboard shell, general settings, mobile shell, personnel, Leave, request-center/requests-admin, and users/store/admin-users unique contracts. Do not add another build/lint/typecheck/RBAC copy.

If `leave-ui-contract.mjs` is not yet present on execution-time `main`, sync the consolidation branch after the Leave PR merges rather than inventing a replacement contract.

- [ ] **Step 2: Preserve one copy of all Admin global checks**

Keep exactly one Admin global sequence in `admin-ui-foundation.yml`: Admin UI strict self-test, Admin UI strict, Admin UI, production-surface, RBAC, typecheck, lint, build.

- [ ] **Step 3: Delete the nine retired small Admin wrappers**

Delete the nine files listed above and keep their contract scripts.

- [ ] **Step 4: Run all migrated feature contracts locally**

Run each migrated feature contract plus `npm run smoke:ci-workflow-architecture`; expected feature contracts PASS and architecture contract fail only if later Store/admin-domain cleanup remains.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/admin-ui-foundation.yml .github/workflows
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

Replace `modulex-admin/**` with Orders/core-operations/portal boundary paths. Keep A1/order/store-portal contracts and remove Admin global RBAC/lint/build duplication.

- [ ] **Step 2: Narrow Project Base trigger scope**

Replace `modulex-admin/**` and blanket migration scope with Project routes/components/libs/scripts/SQL/project-procurement-payment migrations/docs only.

- [ ] **Step 3: Strip global quality commands from Vendor workflow**

Keep Vendor/Stone contract commands only. Remove typecheck, lint, and build.

- [ ] **Step 4: Run retained domain contracts**

Run A1/order/store-portal Admin, all Project contract commands, all Vendor/Stone contracts, then architecture contract.

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

Keep filename but set `name: Store Core CI`. Use broad Store PR path ownership there and Admin Store CMS paths only where needed.

- [ ] **Step 2: Run the preserved Store contract set exactly once after one install**

Include public-production, secondary CMS, Store public content, GC3 domain/public, GC5, GC6, GC7, GC8A, GC8B accessibility/performance source contracts, gallery freshness/theme, showroom SEO, Store portal, portal experience, portal auth RPC guard, and public navbar. Then lint once and build once.

- [ ] **Step 3: Delete GC-6, GC-7, and Showroom wrapper workflows**

Delete those three workflow files only; keep their scripts.

- [ ] **Step 4: Convert GC-8B to specialized Lighthouse/manual verification**

Remove ordinary PR full Store build behavior. Keep `workflow_dispatch` and production Lighthouse baseline. Do not duplicate Store Core lint/build.

- [ ] **Step 5: Verify GC-5 remains write-specialized**

Confirm `contents: write`, branch-scoped migration behavior, and no interruptible concurrency. Do not execute mutation behavior.

- [ ] **Step 6: Run Store contract coverage locally**

Run all preserved Store contracts, Store lint, and one Store production build with CI placeholder env values.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows
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

Expected: **PASS** and exactly 10 approved workflow files.

- [ ] **Step 2: Verify workflow count and names directly**

Expected filenames:

```text
admin-a1-core-operations.yml
admin-a3-product-master.yml
admin-a6-finance-core.yml
admin-inventory-warehouse-qr-ui.yml
admin-project-base.yml
admin-ui-foundation.yml
admin-vendor-catalog-sync.yml
gc5-branch-contract.yml
gc8a-store-chrome-seo.yml
gc8b-accessibility-performance.yml
```

- [ ] **Step 3: Verify no duplicate Admin global commands outside UI Foundation**

Search retained Admin domain workflows for production-surface, RBAC, typecheck, lint, build; expected none.

- [ ] **Step 4: Verify broad triggers have one owner each**

Search workflow YAML for `modulex-admin/**` and `modulex-store/**`; expected owners are Admin UI Foundation and Store Core CI respectively, with GC-5 exempt as specialized non-PR behavior.

- [ ] **Step 5: Commit any final contract/doc corrections**

```bash
git add modulex-admin/scripts/ci-workflow-architecture-contract.mjs docs/CI_WORKFLOW_ARCHITECTURE.md .github/workflows/admin-ui-foundation.yml
git commit -m "test: enforce consolidated CI ownership"
```

---

### Task 8: Run the full pre-PR verification and inspect actual workflow fan-out

**Files:**
- No application code changes expected.
- Modify only CI/docs files if verification exposes a contract-coverage gap.

**Interfaces:**
- Consumes: final consolidated workflow set.
- Produces: evidence that global quality gates and all preserved domain contract groups still pass before the PR is opened.

- [ ] **Step 1: Run Admin global verification**

Run architecture contract, Admin UI strict self-test, Admin UI strict, Admin UI, production-surface, RBAC, typecheck, lint, and one production build. Expected all PASS.

- [ ] **Step 2: Run retained Admin domain verification**

Run A1, Inventory/A2, Product, Finance, Project, and Vendor contract sets. Expected all PASS.

- [ ] **Step 3: Run migrated small Admin feature contracts**

Run approvals, commercial docs, customers, dashboard, settings, mobile shell, personnel/Leave, request center, and users/store contracts. Expected all PASS.

- [ ] **Step 4: Run Store global verification**

Run the preserved Store contract set, Store lint, and Store production build. Expected all PASS.

- [ ] **Step 5: Sync against execution-time current `main` before opening the PR**

```bash
git fetch origin
git rebase origin/main
```

Preserve newly merged contract additions inside the correct retained workflow owner; do not drop coverage to simplify the consolidation.

- [ ] **Step 6: Re-run architecture + affected verification after sync**

At minimum rerun architecture contract, Admin UI strict, typecheck, lint, Admin build, and any domain contract affected by sync conflicts.

- [ ] **Step 7: Open a non-draft PR and inspect workflow fan-out**

Use title `ci: consolidate Modulex workflow architecture`. Verify a Personnel-only change maps to Admin UI Foundation, Product-only maps to Admin UI Foundation + Product domain, and Store-only maps to Store Core CI.

- [ ] **Step 8: Final verification commit only if evidence required a correction**

Do not create a new workflow file during this step.
