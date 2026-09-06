# Personnel UI/UX Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every non-Compensation Personnel admin surface on the shared Modulex UI system with reliable light/dark contrast, accessible forms, structured tables, safe feedback, responsive behavior, and unchanged HR business/data contracts.

**Architecture:** Keep every existing HR manager and Supabase data flow in place. Replace feature-local/native presentation layers with existing shared admin primitives, strengthen the Personnel UI regression contract first, then modernize surfaces in risk-ordered batches. Compensation remains isolated in PR #325 and this branch must neither copy nor depend on its implementation.

**Tech Stack:** Next.js 16 / React / TypeScript / Tailwind CSS / Supabase / existing Modulex Admin shared components and Node-based contract scripts.

**Spec:** `docs/superpowers/specs/2026-09-06-personnel-ui-standardization-design.md`

## Global Constraints

- Do not change Supabase schema, migrations, RLS policies, Personnel RBAC permissions, RPC names/signatures, payroll calculation rules, compensation business rules, leave balance semantics, storage bucket privacy, or Finance source-of-truth semantics.
- Compensation implementation remains owned by PR #325; do not copy its component changes into this branch.
- Reuse `ComponentCard`, `StatTile`, `Label`, `Input`, `Select`, `TextArea`, `Checkbox`/`Switch`, `Button`, `Badge`, `Alert`, `Modal`, shared `Table*` primitives, and `ADMIN_TEXT_STYLES` instead of feature-local visual systems.
- Do not render raw Supabase/database mutation or load error messages to users on targeted Personnel surfaces.
- Preserve existing insert/update/delete payload semantics and workflow state transitions.
- Use deterministic human-readable date presentation; compact Personnel tables should converge on `DD.MM.YYYY` where raw ISO dates are currently shown.
- Use semantic badges for statuses and right-aligned tabular formatting for money/numeric table columns.
- Every data-backed surface needs explicit loading and empty states; state-changing actions need disabled/busy behavior.
- Destructive actions must use a deliberate confirmation convention rather than unguarded destructive text links.

---

## File Structure / Responsibility Map

**Contract / regression boundary**
- Modify: `modulex-admin/scripts/personnel-ui-contract.mjs` — enforce route/RBAC coverage and shared UI rules across targeted Personnel components while explicitly excluding Compensation implementation ownership.
- Modify only if needed: `modulex-admin/package.json` — keep `smoke:personnel-ui` wired; do not add redundant scripts if the existing command already points at the contract.

**Route page hierarchy**
- Modify: `modulex-admin/src/app/(admin)/personnel/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/benefits/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/compliance/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/documents/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/lifecycle/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/payroll/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/performance/page.tsx`
- Modify: `modulex-admin/src/app/(admin)/personnel/reports/page.tsx`
- Audit-only unless regression found: Attendance, Leave, Employees, Departments, Positions routes.

**Low-risk presentation**
- Modify: `modulex-admin/src/components/hr/PersonnelOverview.tsx`
- Modify: `modulex-admin/src/components/hr/HrReports.tsx`

**CRUD/configuration**
- Modify: `modulex-admin/src/components/hr/DepartmentsManager.tsx`
- Modify: `modulex-admin/src/components/hr/PositionsManager.tsx`
- Modify: `modulex-admin/src/components/hr/BenefitsManager.tsx`

**Operational employee records**
- Modify: `modulex-admin/src/components/hr/EmployeeTasksManager.tsx`
- Modify: `modulex-admin/src/components/hr/PerformanceManager.tsx`
- Modify: `modulex-admin/src/components/hr/DocumentsManager.tsx`

**Sensitive/workflow-heavy**
- Modify: `modulex-admin/src/components/hr/ComplianceManager.tsx`
- Modify: `modulex-admin/src/components/hr/PayrollManager.tsx`

**Audit-only unless concrete regression is found**
- `modulex-admin/src/components/hr/EmployeeDirectory.tsx`
- `modulex-admin/src/components/hr/AttendanceManager.tsx`
- `modulex-admin/src/components/hr/LeaveManager.tsx`
- `modulex-admin/src/components/hr/CompensationManager.tsx` — do not implement here.

---

### Task 1: Expand the Personnel UI contract and prove RED

**Files:**
- Modify: `modulex-admin/scripts/personnel-ui-contract.mjs`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: existing route list and sidebar RBAC checks.
- Produces: helper assertions covering targeted component source files without requiring Compensation changes from PR #325.

- [ ] **Step 1: Add explicit target component groups and shared-primitive checks**

Extend the contract with a target list that excludes `CompensationManager.tsx` from implementation requirements:

```js
const modernizationTargets = [
  "src/components/hr/PersonnelOverview.tsx",
  "src/components/hr/HrReports.tsx",
  "src/components/hr/DepartmentsManager.tsx",
  "src/components/hr/PositionsManager.tsx",
  "src/components/hr/BenefitsManager.tsx",
  "src/components/hr/EmployeeTasksManager.tsx",
  "src/components/hr/PerformanceManager.tsx",
  "src/components/hr/DocumentsManager.tsx",
  "src/components/hr/ComplianceManager.tsx",
];

for (const file of modernizationTargets) {
  const source = read(file);
  expect(source.includes("ComponentCard"), `${file} must use ComponentCard`);
  expect(source.includes("Button"), `${file} must use shared Button`);
  expect(!/const\s+(input|inputClass|card|cardClass|buttonClass)\s*=/.test(source), `${file} must not define a local visual system`);
  expect(!/<table\b|<thead\b|<tbody\b|<tr\b|<th\b|<td\b/.test(source), `${file} must not use native table markup`);
}
```

Add form-specific requirements for Benefits, Lifecycle, Performance, Documents, Compliance, Departments and Positions:

```js
for (const file of formTargets) {
  const source = read(file);
  expect(source.includes("Label"), `${file} must use visible labels`);
  expect(source.includes("Input") || source.includes("Select"), `${file} must use shared form fields`);
  expect(!/<select\b|<textarea\b/.test(source), `${file} must not use native select/textarea controls`);
}
```

Allow a native file `<input type="file">` only in Documents because the existing shared `Input` primitive is not a file-upload abstraction; assert that it has an accessible label and theme-safe class instead of banning all native inputs globally.

- [ ] **Step 2: Add behavior/UX assertions**

Require the targeted sources collectively to contain:

```js
expect(targetSources.includes("TableStateRow"), "Personnel tables need structured loading/empty states");
expect(targetSources.includes("ADMIN_TEXT_STYLES"), "Personnel surfaces must use admin text tokens");
expect(targetSources.includes("Badge"), "Personnel statuses need semantic badges");
expect(targetSources.includes("Alert"), "Personnel feedback must use shared alerts");
expect(!targetSources.includes("window.confirm("), "Personnel destructive actions must not use native confirm dialogs");
expect(!targetSources.includes("setMessage(error.message)"), "Personnel surfaces must not expose raw mutation errors");
expect(!targetSources.includes("setError(error.message)"), "Personnel surfaces must not expose raw database errors");
```

Do not ban `console.error`; logging internal errors is allowed.

- [ ] **Step 3: Run the focused contract and verify RED**

Run from `modulex-admin`:

```bash
node scripts/personnel-ui-contract.mjs
```

Expected: FAIL on one or more current legacy targets such as Benefits, Departments, Positions, Lifecycle, Performance, Documents, Compliance, Overview, or Reports.

- [ ] **Step 4: Commit the RED contract**

```bash
git add modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "test: expand personnel UI standardization contract"
```

---

### Task 2: Standardize Personnel route hierarchy

**Files:**
- Modify: the Personnel route files listed in the route hierarchy map above.
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: `PageBreadcrumb`.
- Produces: one route-level title/breadcrumb per Personnel page; managers no longer need duplicate page-level H1 headings.

- [ ] **Step 1: Add route hierarchy assertions to the contract**

For each Personnel route except pages intentionally already compliant, assert the route includes `PageBreadcrumb` or `PageBreadCrumb` and a matching `pageTitle`. Also assert target managers do not render the old page-level `<h1>` title string after migration.

Example:

```js
const routeTitles = [
  ["src/app/(admin)/personnel/benefits/page.tsx", "Benefits"],
  ["src/app/(admin)/personnel/compliance/page.tsx", "Compliance & Emergency"],
  ["src/app/(admin)/personnel/documents/page.tsx", "Employee Documents"],
  ["src/app/(admin)/personnel/lifecycle/page.tsx", "Onboarding & Offboarding"],
  ["src/app/(admin)/personnel/payroll/page.tsx", "Payroll"],
  ["src/app/(admin)/personnel/performance/page.tsx", "Performance"],
  ["src/app/(admin)/personnel/reports/page.tsx", "HR Reports"],
];
```

Run the contract and verify it fails before route edits.

- [ ] **Step 2: Move title ownership to routes**

Use this shape consistently:

```tsx
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import BenefitsManager from "@/components/hr/BenefitsManager";

export default function BenefitsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Benefits" />
      <BenefitsManager />
    </div>
  );
}
```

Do not change metadata titles/descriptions.

- [ ] **Step 3: Remove duplicate manager-level H1 blocks only when the route now owns the title**

Keep explanatory copy in the first operational `ComponentCard` description or introductory card. Do not remove business warnings.

- [ ] **Step 4: Run contract and TypeScript check**

```bash
node scripts/personnel-ui-contract.mjs
npm run typecheck
```

Expected: route-hierarchy assertions pass; broader contract may remain RED until later tasks.

- [ ] **Step 5: Commit**

```bash
git add modulex-admin/src/app/'(admin)'/personnel modulex-admin/src/components/hr
git commit -m "refactor: standardize personnel page hierarchy"
```

---

### Task 3: Modernize Personnel Overview and HR Reports

**Files:**
- Modify: `modulex-admin/src/components/hr/PersonnelOverview.tsx`
- Modify: `modulex-admin/src/components/hr/HrReports.tsx`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: existing Supabase selects/counts and existing module navigation routes.
- Produces: shared summary cards, safe feedback, explicit loading presentation, and theme-safe report blocks.

- [ ] **Step 1: Add focused contract assertions**

Require Overview to use `ComponentCard`, `StatTile`, `Alert`, and `ADMIN_TEXT_STYLES`; require Reports to use `ComponentCard`, `StatTile`, `Alert`, `ADMIN_TEXT_STYLES`, and explicit loading state.

Run:

```bash
node scripts/personnel-ui-contract.mjs
```

Expected: FAIL because current files use local `card` styles.

- [ ] **Step 2: Refactor PersonnelOverview presentation**

Keep its existing Supabase query set and `Summary` shape. Replace the local `card` constant with shared imports:

```tsx
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Alert from "@/components/ui/alert/Alert";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
```

Use `StatTile` for the eight KPI values. Use a `ComponentCard` around navigation or a theme-token-based link card class derived from existing admin theme utilities; do not add a new global style system. Preserve every current module route and description.

- [ ] **Step 3: Refactor HrReports presentation and loading**

Add `loading` state around the existing multi-query load. Preserve every formula exactly. Use `StatTile` for `rows`, `ComponentCard` for Headcount by Department and Payroll YTD, and `Alert` for a safe generic load failure:

```ts
setMessage("HR reports could not be loaded. Please try again.");
```

Log the underlying error with `console.error` instead of rendering it.

- [ ] **Step 4: Run focused and regression tests**

```bash
node scripts/personnel-ui-contract.mjs
npm run smoke:admin-ui
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add modulex-admin/src/components/hr/PersonnelOverview.tsx modulex-admin/src/components/hr/HrReports.tsx modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "refactor: modernize personnel overview and reports UI"
```

---

### Task 4: Modernize Departments and Positions configuration

**Files:**
- Modify: `modulex-admin/src/components/hr/DepartmentsManager.tsx`
- Modify: `modulex-admin/src/components/hr/PositionsManager.tsx`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: `HrDepartment`, `HrPosition`, existing inline-edit state and exact Supabase insert/update payloads.
- Produces: shared forms/tables and safe save feedback while preserving inline editing and sort order.

- [ ] **Step 1: Strengthen assertions for both configuration managers**

Require imports/usages of `ComponentCard`, `Label`, `Input`, `Select` for Positions, `Checkbox` or `Switch`, `Button`, `Alert`, `TableViewport`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, and `TableStateRow`. Ban local `inputClass`/`buttonClass` and native table markup.

Run the contract; expected FAIL.

- [ ] **Step 2: Refactor DepartmentsManager**

Keep `addDepartment()` and `saveDepartment()` data payloads unchanged. Replace raw error rendering with:

```ts
function showError(message: string, error?: unknown) {
  if (error) console.error(message, error);
  setError(message);
}
```

Use visible labels for Code, Name, Description. Use shared table cells containing shared `Input` fields for inline edits, and shared `Checkbox`/`Switch` for Active. Add empty `TableStateRow` when there are no departments.

Use action-specific save state rather than disabling every row if practical:

```ts
const [savingId, setSavingId] = useState<string | "new" | null>(null);
```

- [ ] **Step 3: Refactor PositionsManager**

Preserve department filtering, `sort_order`, insert/update payloads, and inline editing. Use shared `Select` for department selection, a shared active control, safe alerts, loading/empty state, and an explicit Actions column.

- [ ] **Step 4: Run tests**

```bash
node scripts/personnel-ui-contract.mjs
npm run smoke:admin-ui-strict
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add modulex-admin/src/components/hr/DepartmentsManager.tsx modulex-admin/src/components/hr/PositionsManager.tsx modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "refactor: standardize departments and positions UI"
```

---

### Task 5: Modernize Benefits

**Files:**
- Modify: `modulex-admin/src/components/hr/BenefitsManager.tsx`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: `hr_benefit_plans`, `hr_employee_benefits`, existing `Plan` and `Enrollment` shapes.
- Produces: labeled plan/enrollment forms, semantic tables, safe feedback, and controlled End Enrollment action.

- [ ] **Step 1: Add Benefits-specific RED assertions**

Require shared form/table primitives, visible labels `Plan code`, `Plan name`, `Benefit type`, `Provider`, `Employee cost`, `Employer cost`, `Tax treatment`, `Employee`, `Plan`, `Coverage level`, `Effective date`, `Actions`, plus loading and empty-state strings.

Run contract; expected FAIL.

- [ ] **Step 2: Introduce safe feedback and loading/busy state**

Replace `message: string | null` with:

```ts
type Notice = { variant: "success" | "error"; title: string; message: string };
```

Add `loading`, `busyAction`, and generic messages. Preserve raw errors only in `console.error`.

- [ ] **Step 3: Replace native plan/enrollment forms**

Use `ComponentCard`, `Label`, `Input`, `Select`, and `Button`. Keep the exact insert payloads and default values.

- [ ] **Step 4: Replace native tables and add confirmation state**

Use shared table primitives, semantic `Badge` for plan/enrollment status, right-aligned money, deterministic date formatting, loading/empty rows, and a two-step End Enrollment flow:

```ts
const [endCandidateId, setEndCandidateId] = useState<string | null>(null);
```

First click marks the row; second `Confirm end` performs the existing update `{ status: "ended", effective_to: today }`.

- [ ] **Step 5: Run tests and commit**

```bash
node scripts/personnel-ui-contract.mjs
npm run typecheck
npm run lint
git add modulex-admin/src/components/hr/BenefitsManager.tsx modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "refactor: modernize benefits personnel UI"
```

---

### Task 6: Modernize Lifecycle and Performance

**Files:**
- Modify: `modulex-admin/src/components/hr/EmployeeTasksManager.tsx`
- Modify: `modulex-admin/src/components/hr/PerformanceManager.tsx`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: existing onboarding/offboarding templates, task status transitions, performance review insert/delete semantics.
- Produces: shared CRUD presentation, semantic statuses, deterministic dates, and two-step destructive actions.

- [ ] **Step 1: Add RED assertions for both managers**

Require `ComponentCard`, `StatTile` where KPI cards exist, `Label`, `Input`, `Select`, `TextArea`, `Button`, `Badge`, `Alert`, shared tables or structured cards, loading/empty states, and absence of `window.confirm`.

- [ ] **Step 2: Refactor EmployeeTasksManager**

Preserve the `onboarding`/`offboarding` arrays exactly and preserve `applyTemplate`, task insert fields, and status update values. Add:

```ts
const [loading, setLoading] = useState(true);
const [busyAction, setBusyAction] = useState<string | null>(null);
const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
```

Use semantic task badges for Pending / In progress / Completed / Cancelled and `DD.MM.YYYY` for due dates. Replace native confirm with Cancel + Confirm delete.

- [ ] **Step 3: Refactor PerformanceManager**

Preserve review payload fields and rating scale. Use visible labels for every field, shared controls, KPI `StatTile`s, structured review history, semantic status/rating presentation, safe feedback, and two-step delete confirmation. The employee selector used as the history filter should clearly support `All employees` without allowing an empty employee in the create form; use separate create/filter state if necessary rather than overloading one state value.

- [ ] **Step 4: Run tests**

```bash
node scripts/personnel-ui-contract.mjs
npm run smoke:admin-ui-strict
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add modulex-admin/src/components/hr/EmployeeTasksManager.tsx modulex-admin/src/components/hr/PerformanceManager.tsx modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "refactor: standardize personnel lifecycle and performance UI"
```

---

### Task 7: Modernize Employee Documents without weakening storage safety

**Files:**
- Modify: `modulex-admin/src/components/hr/DocumentsManager.tsx`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: private `hr-documents` storage bucket, 60-second signed URLs, upload rollback on DB failure, existing metadata insert/delete behavior.
- Produces: shared form/table UX while preserving storage privacy and rollback semantics exactly.

- [ ] **Step 1: Add Documents-specific RED assertions**

Require shared cards/labels/selects/text area/buttons/tables/badges/alerts/stats, loading/empty state, two-step delete state, and deterministic expiry date formatting. Explicitly permit one native `type="file"` input with `id="hr-document-file"` and a corresponding `Label htmlFor="hr-document-file"`.

- [ ] **Step 2: Separate upload employee from table filter state**

Current `employeeId` controls both upload form and table filter, which makes `All employees` incompatible with the required upload employee. Introduce:

```ts
const [uploadEmployeeId, setUploadEmployeeId] = useState("");
const [filterEmployeeId, setFilterEmployeeId] = useState("");
```

Use `uploadEmployeeId` only in upload path/metadata and `filterEmployeeId` only for list filtering. This is a UI-state correction; do not change the persisted data contract.

- [ ] **Step 3: Preserve secure upload/open behavior while adding safe feedback**

Keep:

```ts
supabase.storage.from("hr-documents").upload(..., { upsert: false })
supabase.storage.from("hr-documents").createSignedUrl(row.storage_path, 60)
```

and keep storage removal rollback when metadata insert fails. Do not expose raw storage/database error strings to the user; log internally and show generic context-specific messages.

- [ ] **Step 4: Replace delete confirmation and table presentation**

Use `deleteCandidateId`, shared Button variants, semantic expiry/status badge, `TableStateRow` for loading/empty, and right-sized date/file-size columns. Preserve storage object removal before DB row deletion.

- [ ] **Step 5: Run tests and commit**

```bash
node scripts/personnel-ui-contract.mjs
npm run typecheck
npm run lint
git add modulex-admin/src/components/hr/DocumentsManager.tsx modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "refactor: modernize employee documents UI"
```

---

### Task 8: Modernize Compliance & Emergency with sensitive-data guardrails

**Files:**
- Modify: `modulex-admin/src/components/hr/ComplianceManager.tsx`
- Test: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: `hr_tax_profiles`, `hr_emergency_contacts`, existing tax/profile/contact payloads.
- Produces: labeled grouped sensitive forms, employee-switch loading state, safe feedback, and controlled contact deletion.

- [ ] **Step 1: Add Compliance RED assertions**

Require shared labels/inputs/text area/checkboxes/buttons/cards/alerts/badges or table/list primitives, explicit loading state on employee switch, safe error strings, no native confirmation, and visible sensitive-data note.

- [ ] **Step 2: Add employee-switch loading and stale-data protection**

Before loading a new employee profile:

```ts
setLoadingEmployee(true);
setProfile(null);
setContacts([]);
```

On completion set `loadingEmployee(false)`. Do not display the previous employee's sensitive profile while the new request is in flight.

- [ ] **Step 3: Migrate profile and contact forms to shared controls**

Preserve every payload field including `i9_verified_at` behavior and last-four-only filtering. Use `Checkbox` for W-4 multiple jobs, W-4 on file, I-9 verified, and Primary contact. Keep the explicit statement that full SSN is not stored.

- [ ] **Step 4: Make primary-contact update fail closed**

The existing flow clears all current primary contacts before inserting a new primary contact but ignores the update error. Preserve the intended semantics while checking the update result:

```ts
if (primary) {
  const clearPrimary = await supabase
    .from("hr_emergency_contacts")
    .update({ is_primary: false })
    .eq("employee_id", employeeId);
  if (clearPrimary.error) throw clearPrimary.error;
}
```

If clearing fails, do not proceed to insert the new contact. This is error handling for the existing workflow, not a new business rule.

- [ ] **Step 5: Add controlled contact deletion**

Use `deleteCandidateId` and Cancel / Confirm delete buttons. Preserve the existing delete query.

- [ ] **Step 6: Run tests and commit**

```bash
node scripts/personnel-ui-contract.mjs
npm run smoke:rbac
npm run typecheck
npm run lint
git add modulex-admin/src/components/hr/ComplianceManager.tsx modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "refactor: standardize compliance and emergency UI"
```

---

### Task 9: Audit Payroll, Employees, Attendance and Leave; finish contract coverage

**Files:**
- Modify if concrete issues are found: `modulex-admin/src/components/hr/PayrollManager.tsx`
- Modify if concrete issues are found: `modulex-admin/src/components/hr/EmployeeDirectory.tsx`
- Audit-only unless regression found: `modulex-admin/src/components/hr/AttendanceManager.tsx`
- Audit-only unless regression found: `modulex-admin/src/components/hr/LeaveManager.tsx`
- Modify: `modulex-admin/scripts/personnel-ui-contract.mjs`

**Interfaces:**
- Consumes: already-modernized shared UI patterns and existing payroll/finance source-of-truth semantics.
- Produces: final Personnel contract with no known targeted regressions.

- [ ] **Step 1: Add safe-error and presentation assertions for Payroll/Employees**

Do not require a rewrite. Add assertions only for concrete standards they should already satisfy: shared primitive usage, no local visual system, theme-safe text, loading/error states, and no raw database errors.

Run contract and record actual failures before changing code.

- [ ] **Step 2: Fix Payroll only where the contract exposes real UX defects**

Expected likely fixes:
- replace raw `error.message` user feedback with generic safe text while keeping `console.error`;
- format selected period/run dates/statuses for display;
- replace native `window.confirm` approval prompt with a deliberate two-step confirmation state;
- preserve `prepare_hr_payroll_run`, `set_hr_payroll_run_status`, tax editing, settlement RPCs, Finance payment source-of-truth, and all calculation semantics.

Do not change tax calculations or add tax tables.

- [ ] **Step 3: Fix EmployeeDirectory only where the audit exposes real defects**

Preserve employee master CRUD, modal architecture, finance payment read-only RPC, filters, and RBAC. Candidate fixes are theme-safe secondary text, deterministic hire/payment dates, safe raw-error handling, and `aria-busy` on data regions.

- [ ] **Step 4: Audit Attendance and Leave against the final contract**

Run source assertions only. Do not redesign either screen if they already pass. If a regression is found, make the smallest shared-pattern fix.

- [ ] **Step 5: Confirm Compensation independence**

The branch diff must not include `src/components/hr/CompensationManager.tsx`. The Personnel contract must not require the #325 implementation to pass on this branch.

Run:

```bash
git diff --name-only main...HEAD | grep CompensationManager && exit 1 || true
node scripts/personnel-ui-contract.mjs
```

Expected: no CompensationManager diff; contract PASS.

- [ ] **Step 6: Commit**

```bash
git add modulex-admin/src/components/hr modulex-admin/scripts/personnel-ui-contract.mjs
git commit -m "fix: complete personnel UI consistency audit"
```

---

### Task 10: Full verification, branch review, and PR

**Files:**
- No product changes unless verification exposes a defect.
- Review: all branch-changed files.

**Interfaces:**
- Consumes: completed tasks 1–9.
- Produces: verified PR ready for human merge.

- [ ] **Step 1: Run focused Personnel contracts**

From `modulex-admin`:

```bash
node scripts/personnel-ui-contract.mjs
node scripts/leave-ui-contract.mjs
```

Expected: PASS.

- [ ] **Step 2: Run strict/admin regressions**

```bash
npm run smoke:admin-ui-strict
npm run smoke:admin-ui
npm run smoke:production-surface
npm run smoke:rbac
```

Expected: PASS.

- [ ] **Step 3: Run compiler/linter/build**

```bash
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key \
npm run build
```

Expected: PASS.

- [ ] **Step 4: Review scope and data-contract safety**

Run:

```bash
git diff --name-only main...HEAD
git diff --stat main...HEAD
```

Verify there are no migrations, schema files, RLS changes, API routes, RPC definitions, or `CompensationManager.tsx` changes.

- [ ] **Step 5: Check for prohibited legacy patterns in changed HR files**

```bash
git diff --name-only main...HEAD -- 'modulex-admin/src/components/hr/*.tsx' \
  | xargs grep -nE 'window\.confirm\(|set(Message|Error)\([^\n]*error\.message|const (input|inputClass|card|cardClass|buttonClass) ?=' || true
```

Expected: no matches except a deliberately documented non-user-facing pattern; fix any unexpected match before proceeding.

- [ ] **Step 6: Push and wait for GitHub Actions**

Confirm `Admin UI Foundation` passes on the final head SHA, including Personnel UI contract, Admin UI strict changed-file gate, Admin UI regression, Production Surface, RBAC, Typecheck, Lint, and Build.

- [ ] **Step 7: Open a focused PR**

PR title:

```text
Standardize Personnel admin UI/UX
```

PR body must state:
- which Personnel surfaces were modernized;
- that Compensation remains in #325 and is not duplicated;
- no schema/RPC/API/RBAC/business-rule changes;
- storage/privacy and Finance source-of-truth semantics preserved;
- RED contract evidence and final GREEN workflow URL/SHA;
- exact verification commands/results.

Do not merge automatically.
