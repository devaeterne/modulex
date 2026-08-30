# Modulex Admin UI Check

This file tracks the Admin UI audit in sidebar order. A package is fully complete only after implementation, regression checks, production build, merge/deploy, and any required production database rollout are verified.

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

### [x] 02 — Request Center
PR: #148 — `fix(admin): harden Request Center UI and notifications`

### [x] 03 — Product List (`/products`)
PR: #151 — `fix(admin): harden Product List UI`

### [x] 04 — Low Stock (`/low-stock`)
PR: #153 — `fix(admin): harden Low Stock UI`
Follow-up PR: #154 — `fix(admin): preserve low stock threshold retry`

- [x] Search/view filtering, pagination, page-size control, filtered result summary, and page clamping.
- [x] Mobile-safe horizontally scrollable stock table.
- [x] Single-row threshold editing only; no unsupported bulk mutation UI.
- [x] Threshold editing gated through `products.manage`.
- [x] Controlled user-facing errors, technical logging, and mutation-aware retry that preserves failed drafts.
- [x] Runtime-locale number formatting.
- [x] Labels, ARIA state, live feedback, and focus-visible behavior.
- [x] Dedicated Low Stock contract + production-surface/RBAC/lint/build verification.
- [x] Merged and deployed.

## Category audit packages

The remaining sidebar audit was grouped into category PRs to keep review/merge manageable while preserving per-route coverage. Implementation/CI status below reflects repository state; merge/deploy is recorded separately and is not inferred.

### Products + Pricing — 05–09
PR: #155 — `fix(admin): audit Products and Pricing UI`
Status: **merged; deployment confirmation not recorded here**.

- [x] 05 — Brands (`/brands`)
- [x] 06 — Categories (`/categories`)
- [x] 07 — Pricing Dashboard (`/pricing/dashboard`)
- [x] 08 — Product Prices (`/pricing/products`)
- [x] 09 — Price Groups (`/pricing/groups`)
- [x] Category contract, production-surface, RBAC, lint, and production build passed.

### Customers — 10–14
PR: #156 — `test(admin): audit Customers UI surfaces`
Status: **merged; deployment confirmation not recorded here**.

- [x] 10 — Customers Dashboard (`/customers/dashboard`)
- [x] 11 — Customer List (`/customers`)
- [x] 12 — Orders (`/customers/orders`)
- [x] 13 — Shipments (`/customers/shipments`)
- [x] 14 — Installations (`/customers/installations`)
- [x] Category contract, production-surface, RBAC, lint, and production build passed.

### Inventory + Warehouse + QR — 15–23
PR: #157 — `test(admin): audit Inventory Warehouse and QR UI`
Status: **implementation complete / CI green / merge pending**.

- [x] 15 — Stock Overview (`/inventory`)
- [x] 16 — Stock Movements (`/stock-movements`)
- [x] 17 — Stock Operations (`/stock-operations`)
- [x] 18 — Warehouses (`/warehouses`)
- [x] 19 — Zones (`/zones`)
- [x] 20 — Locations (`/locations`)
- [x] 21 — QR Labels (`/qr-labels`)
- [x] 22 — Scan QR / Barcode (`/scan`)
- [x] 23 — Shelf Inventory (`/shelf-inventory`)
- [x] Dead Shelf Inventory navigation replaced with a real read-only shelf/location stock view backed by existing inventory search and linked to the guided scan flow.
- [x] Inventory search/error/locale/table accessibility and mobile behavior hardened.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [ ] Merge and deploy.

### Personnel — 24–37
PR: #158 — `test(admin): audit Personnel UI surfaces`
Status: **implementation complete / CI green / merge pending**.

- [x] 24 — Personnel Overview (`/personnel`)
- [x] 25 — Employees (`/personnel/employees`)
- [x] 26 — Attendance (`/personnel/attendance`)
- [x] 27 — Leave & PTO (`/personnel/leave`)
- [x] 28 — Compensation (`/personnel/compensation`)
- [x] 29 — Payroll (`/personnel/payroll`)
- [x] 30 — Benefits (`/personnel/benefits`)
- [x] 31 — Documents (`/personnel/documents`)
- [x] 32 — Compliance & Emergency (`/personnel/compliance`)
- [x] 33 — Onboarding & Offboarding (`/personnel/lifecycle`)
- [x] 34 — Performance (`/personnel/performance`)
- [x] 35 — HR Reports (`/personnel/reports`)
- [x] 36 — Departments (`/personnel/departments`)
- [x] 37 — Positions (`/personnel/positions`)
- [x] Personnel overview backend errors are controlled/logged; status, navigation, focus, and screen-reader semantics hardened.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [ ] Merge and deploy.

### Finance + Reports — 38–46
PR: #159 — `test(admin): audit Finance and Reports UI`
Status: **merged; deployment confirmation not recorded here**.

- [x] 38 — Invoices (`/customers/invoices`)
- [x] 39 — Payroll (`/finance/payroll`)
- [x] 40 — Compensation (`/finance/compensation`)
- [x] 41 — Approvals (`/approvals`)
- [x] 42 — Cost & Margin (`/pricing/cost-margin`)
- [x] 43 — Tax Rules (`/settings/general/tax-rules`)
- [x] 44 — Payment Methods (`/settings/payment-methods`)
- [x] 45 — Inventory Reports (`/reports/inventory`)
- [x] 46 — Movement Reports (`/reports/movements`)
- [x] Category contract, production-surface, RBAC, lint, and production build passed.

### Users + Store — 47–57
PR: #160 — `test(admin): audit Users and Store UI`
Status: **implementation complete / CI green / merge pending**.

- [x] 47 — User Management (`/users`)
- [x] 48 — Roles & Access (`/roles`)
- [x] 49 — Site Content (`/store/content`)
- [x] 50 — Company (`/store/company`)
- [x] 51 — Pages (`/store/pages`)
- [x] 52 — Projects (`/store/projects`)
- [x] 53 — Media Library (`/store/media`)
- [x] 54 — Marketing & Analytics (`/store/marketing`)
- [x] 55 — Product Content (`/store/products`)
- [x] 56 — Color Options (`/store/colors`)
- [x] 57 — Leads & Dealer Apps (`/store/leads`)
- [x] Roles & Access permission matrix has table caption/header scope and screen-reader permission-state labels.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [ ] Merge and deploy.

### General Settings — 58–64
PR: #161 — `test(admin): audit General Settings UI`
Status: **implementation complete / CI green / merge pending**.

- [x] 58 — Settings Overview (`/settings/general`)
- [x] 59 — Company (`/settings/general/company`)
- [x] 60 — Localization (`/settings/general/localization`)
- [x] 61 — Documents (`/settings/general/documents`)
- [x] 62 — Email (`/settings/general/email`)
- [x] 63 — Notifications (`/settings/general/notifications`)
- [x] 64 — Email Delivery Log (`/settings/general/email-notifications`)
- [x] Settings overview navigation has explicit landmark/labels and keyboard focus treatment.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [ ] Merge and deploy.

## Shared mobile shell follow-up

PR: #162 — `fix(admin): harden mobile shell navigation and notifications` — **merged**.
Follow-up PR: #164 — `fix(admin): close mobile sidebar on link tap` — **merge pending**.

- [x] Mobile breakpoint aligned to the header `lg` boundary at 1024px.
- [x] Notification dropdown uses viewport-safe, safe-area-aware mobile positioning instead of a fixed negative right offset.
- [x] Notification height is constrained by the dynamic viewport while desktop trigger alignment remains intact.
- [x] Mobile application menu closes after navigation.
- [x] Mobile sidebar closes on pathname changes as a fallback.
- [x] #164 adds immediate close-on-tap for sidebar navigation links without changing desktop collapse/expand behavior.
- [ ] Merge/deploy #164.
