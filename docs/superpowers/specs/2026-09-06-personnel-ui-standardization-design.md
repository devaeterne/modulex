# Personnel UI/UX Standardization Design

Date: 2026-09-06
Scope: `modulex-admin` Personnel / HR admin surfaces
Branch: `personnel-ui-standardization-20260906`

## Goal

Bring all Personnel routes and HR-facing components to the same UI/UX quality bar already established by Attendance, Leave, and the focused Compensation cleanup, while preserving the existing HR data model, RPC/API contracts, permissions, and business rules.

This package is intentionally separate from PR #325. Compensation remains owned by that focused PR and is not reimplemented here.

## In Scope

Personnel routes under `modulex-admin/src/app/(admin)/personnel`:

- Personnel overview
- Employees
- Attendance
- Leave & PTO
- Payroll
- Benefits
- Documents
- Compliance & Emergency
- Onboarding & Offboarding
- Performance
- HR Reports
- Departments
- Positions

Compensation is audited for consistency but implementation changes remain in PR #325.

HR components under `modulex-admin/src/components/hr` are reviewed against the same shared UI contract, with implementation work focused on surfaces that still use legacy/native UI patterns.

## Current State

The Personnel area is visually and behaviorally inconsistent.

Attendance and Leave already use shared Modulex Admin primitives and explicit dark-mode-safe text styles. Employees and Payroll are partially modernized. Benefits, Compliance, Departments, Documents, Lifecycle, Performance, HR Reports, Positions, and Personnel Overview still contain combinations of locally defined card/input styles, native form controls, native tables, inherited text colors, raw database error messages, weak empty/loading states, inconsistent date/status presentation, or destructive actions without the current UI conventions.

Route heading behavior is also inconsistent: some Personnel pages render `PageBreadcrumb` at the route level while others render a heading inside the manager component.

## Design Principles

### 1. Shared Modulex Admin primitives

Feature components should use existing shared primitives instead of recreating local visual systems:

- `ComponentCard`
- `StatTile`
- `Label`
- `Input`
- `Select`
- `TextArea`
- `Checkbox` or `Switch`
- `Button`
- `Badge`
- `Alert`
- `Modal` where appropriate
- shared `Table*` primitives
- `ADMIN_TEXT_STYLES` and existing admin theme tokens

Do not introduce a new color system, card system, form library, or table system.

### 2. Theme-safe typography and contrast

No Personnel feature component should rely on browser-default text color for meaningful content. Strong, body, muted, helper, status, and action text must inherit from shared primitives or use existing theme tokens.

Avoid feature-level hard-coded `text-black`, light-only text colors, or raw CSS colors. Existing scoped global theme fixes may be adjusted only when a shared/global source is proven to be the root cause.

### 3. Consistent page hierarchy

Each Personnel page should have one clear page heading system. Route-level breadcrumb/title behavior should be standardized without duplicating a second H1 inside the manager.

Recommended pattern:

- route owns `PageBreadcrumb` / page title
- manager owns operational cards, filters, forms, summaries, and lists

Where a manager currently needs descriptive context, place it in the first `ComponentCard` or a shared page header pattern rather than rendering a second page-level title.

### 4. Forms

All visible controls should have labels rather than placeholder-only semantics. Forms should use responsive grids, consistent vertical rhythm, required/optional cues where useful, and action buttons with clear busy/disabled states.

Do not change validation or business behavior unless a UI bug exposes an already-invalid state. Existing payload semantics remain unchanged.

### 5. Tables and lists

Operational collections should use shared table primitives where tabular data is appropriate. Tables should provide:

- explicit headers, including `Actions`
- loading state
- empty state
- horizontal overflow handling
- non-wrapping date / numeric columns where appropriate
- right-aligned money and numeric values
- semantic status badges
- readable secondary metadata

Card/list layouts may remain where the content is genuinely narrative rather than tabular.

### 6. Dates, money, and statuses

Visible dates should use a deterministic human-readable formatter rather than raw ISO strings. Personnel surfaces should converge on `DD.MM.YYYY` for compact admin tables unless a more descriptive existing format is intentionally retained by an already-modernized screen.

Money values remain USD where the underlying Personnel modules currently hard-code USD. This project does not change payroll/compensation currency semantics.

Statuses should use readable labels and semantic badges rather than raw snake_case values.

### 7. Loading, empty, success, and error states

Every data-backed Personnel surface should have explicit loading and empty states. Mutations should expose per-action busy states where practical.

Raw Supabase/database error messages must not be rendered directly to end users. Errors should be logged where needed and translated into safe, actionable UI messages.

Existing data should not be cleared unnecessarily on transient reload errors when preserving the prior view is safe.

### 8. Destructive and state-changing actions

Delete/end/void/disable style actions should use the existing Modulex confirmation pattern or a deliberate two-step confirmation. Avoid raw destructive text links with no confirmation when the action is irreversible.

Workflow status changes such as Start, Complete, Enable/Disable, End Enrollment, and payroll transitions should have clear busy state and disabled-state behavior.

### 9. Responsive behavior and accessibility

Forms and summary grids should collapse cleanly for tablet/mobile. Data tables may scroll horizontally instead of compressing into unreadable cells.

Controls must retain keyboard focus visibility, labels, accessible state attributes where relevant, and practical hit areas.

## Surface-Specific Direction

### Personnel Overview

Replace local cards with `StatTile` / `ComponentCard`, preserve module navigation, improve loading/error semantics, and ensure link cards have consistent theme-safe focus/hover states.

### Employees

Keep the current shared primitive architecture. Audit inherited text colors, raw errors, date formatting, modal hierarchy, filter UX, and loading/busy states. Avoid unnecessary rewrite.

### Attendance

Treat as a reference implementation. Only fix regressions discovered by the broader contract; no redesign.

### Leave & PTO

Treat as a reference implementation. Preserve its current workflows and contract. Only fix inconsistencies uncovered by the shared audit.

### Payroll

Retain existing shared form/table primitives and sensitive workflow warnings. Improve safe error handling, date/status formatting, page hierarchy, and any inconsistent inherited text or action state behavior. Do not change payroll calculations, approval semantics, or Finance settlement source-of-truth behavior.

### Benefits

Migrate native controls/cards/tables to shared primitives. Add visible labels, safe feedback, semantic plan/enrollment statuses, structured empty/loading states, readable dates, and controlled End Enrollment behavior.

### Documents

Migrate form/table/card UI to shared primitives while preserving private storage behavior, signed URLs, upload rollback behavior, accepted file semantics, and delete semantics. Improve upload busy state, safe errors, status/expiry presentation, employee filtering, and confirmation UX.

### Compliance & Emergency

Migrate native forms/checks/cards to shared primitives. Preserve the existing tax-profile and emergency-contact data contract. Improve sensitive-data messaging, field grouping, loading when employee changes, safe feedback, contact empty state, and destructive confirmation. Do not expand the sensitive data collected.

### Onboarding & Offboarding

Migrate native UI to shared primitives, preserve template/task semantics, add semantic task badges, date formatting, loading/empty states, safe feedback, and confirmation for delete. Keep template application behavior unchanged.

### Performance

Migrate review form and review history to shared primitives. Use visible labels, semantic review/status presentation, readable dates, safe feedback, busy states, and confirmation for delete. Do not change review scoring or stored fields.

### HR Reports

Replace local summary cards with shared stat/card primitives, add explicit loading/error handling, theme-safe typography, and clearer report grouping. Reporting formulas and data sources remain unchanged.

### Departments and Positions

Migrate local inline-edit tables and native controls to shared primitives while preserving inline editing and sort-order behavior. Add safe errors, clear loading/empty states, controlled save busy state per workflow where practical, accessible active toggles, and consistent action columns.

## Data and Security Constraints

This package must not change:

- Supabase schema
- migrations
- RLS policies
- Personnel RBAC permissions
- RPC names or signatures
- payroll calculation rules
- compensation business rules
- leave balance semantics
- storage bucket privacy
- Finance source-of-truth semantics

If a UI defect can only be solved by changing one of these contracts, stop and document it rather than inventing new behavior.

## Testing Strategy

Use TDD for the standardization contract.

1. Expand Personnel UI contract coverage so legacy/native regressions are detectable across all targeted HR components.
2. Prove the expanded contract fails against current legacy surfaces before implementation.
3. Modernize components in bounded batches while keeping the contract green after each batch.
4. Run existing Personnel, Leave, admin strict, admin UI regression, production surface, RBAC, typecheck, lint, and production build checks.
5. Keep Compensation-specific assertions compatible with PR #325 and avoid creating an implementation dependency on that branch.

## Delivery Strategy

Use one focused Personnel standardization branch and PR, separate from PR #325.

Implementation should be grouped by risk:

1. Low-risk presentation surfaces: Personnel Overview, HR Reports.
2. Simple CRUD configuration: Departments, Positions, Benefits.
3. Employee operational records: Lifecycle, Performance, Documents.
4. Sensitive/workflow-heavy surfaces: Compliance, Payroll.
5. Final audit of Employees, Attendance, Leave, route headings, and shared contract coverage.

This sequencing minimizes the chance that a broad UI cleanup accidentally alters sensitive payroll/compliance behavior.

## Acceptance Criteria

The work is complete when:

- targeted Personnel surfaces no longer recreate local card/input/button/table visual systems
- meaningful text remains readable in light and dark themes
- forms use visible accessible labels
- data lists have clear loading and empty states
- raw Supabase error text is not rendered to users on targeted surfaces
- dates/statuses/actions use consistent admin presentation
- destructive actions use a confirmation convention
- responsive behavior remains usable at narrow widths
- existing Personnel RBAC and business/data contracts are unchanged
- expanded Personnel UI contract passes
- admin strict UI gate passes
- Personnel/Leave regression contracts pass
- production surface and RBAC regressions pass
- TypeScript typecheck passes
- lint passes
- production build passes
