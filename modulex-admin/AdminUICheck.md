# Modulex Admin UI Check

This file tracks the admin UI audit in sidebar order. Each package is reviewed independently and is marked complete only after its code, regression checks, production build, merge/deploy, and any required production database rollout are verified.

## Audit checklist used for every package

- Dark / light theme compatibility
- Mobile and responsive layout
- Hardcoded locale, demo/template copy, and stale placeholder content
- Dead, empty, or TailAdmin/template links and controls
- RBAC visibility and action behavior
- Loading, empty, error, retry, and action states
- Keyboard focus, labels, ARIA, and other accessibility basics
- Existing lint warnings inside the package scope
- Regression contract + production-surface/RBAC checks + production build

## Completed

### [x] 01 — Dashboard + shared shell

PR: #147 — `fix(admin): harden dashboard and shared shell UI`

- [x] Dashboard recent movements table made horizontally scrollable on mobile with a stable minimum width.
- [x] Number/date formatting moved from hardcoded `en-US` to runtime locale behavior.
- [x] Movement types are formatted for display instead of exposing raw enum-like values.
- [x] Raw dashboard backend errors are no longer shown to users; controlled error copy + retry action added.
- [x] Quick-action focus styles kept aligned with RBAC filtering.
- [x] Nonfunctional global header search / shortcut UI removed instead of leaving fake controls.
- [x] Mobile sidebar viewport height corrected for the fixed header; desktop remains full-height.
- [x] Shared-shell lint cleanup completed for the package scope.
- [x] Dedicated Dashboard/Shell UI regression workflow added; RBAC, lint, production-surface, and build verified.
- [x] Merged and deployed.

### [x] 02 — Request Center

PR: #148 — `fix(admin): harden Request Center UI and notifications`

- [x] Runtime locale formatting, responsive sizing, dark-mode details, focus styles, labels, and ARIA states improved.
- [x] Raw Supabase/RPC errors replaced with controlled user-facing messages while technical errors remain logged.
- [x] Initial loading separated from create/update states to avoid unnecessary full-page flicker.
- [x] Request create state and per-request update state isolated.
- [x] `/requests?request=<id>` deep links now scroll to and temporarily highlight the target request.
- [x] Request management honors all assigned roles, including secondary Admin/Super Admin roles.
- [x] Hardcoded request notification recipient removed.
- [x] Request-created notifications/email deliveries now target active Admin/Super Admin request managers dynamically, with per-recipient delivery/idempotency handling.
- [x] Request Center SQL/RLS/RPC contract aligned with the same manager model.
- [x] Dedicated Request Center regression workflow added; UI contract, admin contract, production-surface, RBAC, lint, and build verified.
- [x] Merged and deployed.
- [x] Production Supabase policy/function rollout applied and verified.

### [x] 03 — Product List (`/products`)

PR: #151 — `fix(admin): harden Product List UI`

- [x] Separate `products.view` from `products.manage` UI affordances.
- [x] Hide Add/Edit/Activate/Deactivate/Duplicate/Archive actions from view-only roles.
- [x] Remove mouse-only double-click edit behavior.
- [x] Replace raw Supabase errors with controlled messages + technical logging/retry.
- [x] Replace hardcoded number locale with runtime locale formatting.
- [x] Improve mobile search/table/action sizing.
- [x] Add explicit labels/ARIA/focus-visible states for search, filters, pagination, and actions.
- [x] Replace native archive confirm with an in-app themed confirmation dialog.
- [x] Remove package-scope lint warning for unused search-clear handler.
- [x] Add Product List regression contract/workflow and verify production build.
- [x] Merged and deployed.

## Current

### [ ] 04 — Low Stock (`/low-stock`)

- [x] Keep the existing search/view filter behavior and reset pagination when filters change.
- [x] Add client-side pagination, rows-per-page control, page continuity, and out-of-range page clamping.
- [x] Add a filtered result summary and accessible pagination state.
- [x] Keep the wide stock table horizontally scrollable with an explicit mobile-safe minimum width.
- [x] Keep threshold editing single-row only; do not expose unsupported bulk selection/actions.
- [x] Gate threshold editing through `products.manage` instead of hardcoded role names.
- [x] Replace raw Supabase errors with controlled user-facing messages while retaining technical logging and retry.
- [x] Replace hardcoded number locale with runtime locale formatting.
- [x] Add explicit labels/ARIA/focus-visible states for search, filter, pagination, threshold inputs, and actions.
- [x] Add Low Stock UI regression contract and dedicated workflow.
- [ ] Verify Low Stock contract, production-surface/RBAC regressions, lint, and production build in CI.
- [ ] Merge and deploy.

## Queue — sidebar order

### Products
- [ ] 05 — Brands (`/brands`)
- [ ] 06 — Categories (`/categories`)

### Pricing
- [ ] 07 — Pricing Dashboard (`/pricing/dashboard`)
- [ ] 08 — Product Prices (`/pricing/products`)
- [ ] 09 — Price Groups (`/pricing/groups`)

### Customers
- [ ] 10 — Customers Dashboard (`/customers/dashboard`)
- [ ] 11 — Customer List (`/customers`)
- [ ] 12 — Orders (`/customers/orders`)
- [ ] 13 — Shipments (`/customers/shipments`)
- [ ] 14 — Installations (`/customers/installations`)

### Inventory
- [ ] 15 — Stock Overview (`/inventory`)
- [ ] 16 — Stock Movements (`/stock-movements`)
- [ ] 17 — Stock Operations (`/stock-operations`)

### Warehouse
- [ ] 18 — Warehouses (`/warehouses`)
- [ ] 19 — Zones (`/zones`)
- [ ] 20 — Locations (`/locations`)

### QR Operations
- [ ] 21 — QR Labels (`/qr-labels`)
- [ ] 22 — Scan QR / Barcode (`/scan`)
- [ ] 23 — Shelf Inventory (`/shelf-inventory`)

### Personnel
- [ ] 24 — Personnel Overview (`/personnel`)
- [ ] 25 — Employees (`/personnel/employees`)
- [ ] 26 — Attendance (`/personnel/attendance`)
- [ ] 27 — Leave & PTO (`/personnel/leave`)
- [ ] 28 — Compensation (`/personnel/compensation`)
- [ ] 29 — Payroll (`/personnel/payroll`)
- [ ] 30 — Benefits (`/personnel/benefits`)
- [ ] 31 — Documents (`/personnel/documents`)
- [ ] 32 — Compliance & Emergency (`/personnel/compliance`)
- [ ] 33 — Onboarding & Offboarding (`/personnel/lifecycle`)
- [ ] 34 — Performance (`/personnel/performance`)
- [ ] 35 — HR Reports (`/personnel/reports`)
- [ ] 36 — Departments (`/personnel/departments`)
- [ ] 37 — Positions (`/personnel/positions`)

### Finance
- [ ] 38 — Invoices (`/customers/invoices`)
- [ ] 39 — Payroll (`/finance/payroll`)
- [ ] 40 — Compensation (`/finance/compensation`)
- [ ] 41 — Approvals (`/approvals`)
- [ ] 42 — Cost & Margin (`/pricing/cost-margin`)
- [ ] 43 — Tax Rules (`/settings/general/tax-rules`)
- [ ] 44 — Payment Methods (`/settings/payment-methods`)

### Reports
- [ ] 45 — Inventory Reports (`/reports/inventory`)
- [ ] 46 — Movement Reports (`/reports/movements`)

### Users
- [ ] 47 — User Management (`/users`)
- [ ] 48 — Roles & Access (`/roles`)

### Store
- [ ] 49 — Site Content (`/store/content`)
- [ ] 50 — Company (`/store/company`)
- [ ] 51 — Pages (`/store/pages`)
- [ ] 52 — Projects (`/store/projects`)
- [ ] 53 — Media Library (`/store/media`)
- [ ] 54 — Marketing & Analytics (`/store/marketing`)
- [ ] 55 — Product Content (`/store/products`)
- [ ] 56 — Color Options (`/store/colors`)
- [ ] 57 — Leads & Dealer Apps (`/store/leads`)

### General Settings
- [ ] 58 — Settings Overview (`/settings/general`)
- [ ] 59 — Company (`/settings/general/company`)
- [ ] 60 — Localization (`/settings/general/localization`)
- [ ] 61 — Documents (`/settings/general/documents`)
- [ ] 62 — Email (`/settings/general/email`)
- [ ] 63 — Notifications (`/settings/general/notifications`)
- [ ] 64 — Email Delivery Log (`/settings/general/email-notifications`)
