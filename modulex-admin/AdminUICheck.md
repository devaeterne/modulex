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

## Audit v2 — Responsive, theme & component consistency

The original 01–64 audit remains historical evidence. Audit v2 covers cross-cutting issues discovered after later Admin feature work and nested-route growth.

### [x] UI-2A — Admin Shell & Responsive Foundation

- [x] Admin content flex item can shrink with `min-w-0` while preserving 290px expanded and 90px collapsed sidebar offsets.
- [x] Removed the global 1536px content cap so data-heavy pages can use the available viewport; individual surfaces retain responsibility for intentional width constraints.
- [x] Admin shell workflow runs when `(admin)/layout.tsx` changes.
- [x] TDD RED: Actions run `33332911142` failed on the missing responsive shell width contract.
- [x] GREEN: Actions run `33332954949` passed shell contract, production-surface, RBAC, lint, and production build.
- [x] PR #184 merged; behavior is present in the verified current production deployment lineage.

### [x] UI-2B — Data Table System

- [x] Shared `TableViewport` contains intentional horizontal overflow with `min-w-0`, `max-w-full`, and `overflow-x-auto`.
- [x] Shared table minimum-width presets cover standard, wide, and extra-wide admin data surfaces.
- [x] Shared `TableStateRow` reduces loading/empty/header/body column-count drift risk.
- [x] PR #220 merged and production deployment verified.

### [x] UI-2C — Theme & Design Tokens

- [x] Shared button, badge/status, input, dropdown, modal, checkbox/switch, card, focus, and dark-mode behavior normalized.
- [x] Shared semantic status tones and foundational keyboard/ARIA behavior are regression-bound through the Admin UI Foundation workflow.
- [x] PR #221 merged; behavior is present in the verified current production deployment lineage.

### [x] UI-2D — Full Route Regression

- [x] Re-audited all 69 sidebar routes against real app routes.
- [x] Inventoried and regression-covered 23 nested new/edit/detail/print-style routes plus auth surfaces.
- [x] Closed post-audit Product Types, Units of Measure, Material Bands, Store Cabinet Content, and Store Reviews surfaces.
- [x] Re-regressed Product Master, Users/Access, auth, Store publishing, RBAC, typecheck, lint, and production build.
- [x] PR #222 merged at `b9174eb836f9f8125897e92ad616000fc2ffbc0d` and Vercel production deployment is READY on the same SHA.

### [~] UI-2E — Resolution Matrix

- [x] Resolution contract defines 360, 390, 768, 1024, 1280, 1366, 1440, 1536, 1920, and 2560 widths.
- [x] Runtime Admin desktop/mobile boundary is centralized at Tailwind `lg` = 1024px and shared by SidebarContext/AppHeader.
- [x] Shell expanded/collapsed/mobile offsets, notification dropdown mobile/tablet/desktop positioning, modal containment, user dropdown minimum-width safety, and table overflow containment are regression-bound.
- [x] Light/dark, sidebar expanded/collapsed or mobile open/closed, loading/empty/populated, and modal/dropdown state expectations are documented in `ADMIN_UI_GUIDE.md`.
- [x] TDD RED: Admin UI Foundation run `33488434252` failed specifically because the shared resolution matrix did not yet exist.
- [ ] GREEN: resolution contract + full route/RBAC/typecheck/lint/build verification for PR #223.
- [ ] Merge and production deploy for PR #223.

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

The remaining sidebar audit was grouped into category PRs to keep review/merge manageable while preserving per-route coverage. All packages below have now been merged and deployment has been confirmed.

### Products + Pricing — 05–09
PR: #155 — `fix(admin): audit Products and Pricing UI`
Status: **merged and deployed**.

- [x] 05 — Brands (`/brands`)
- [x] 06 — Categories (`/categories`)
- [x] 07 — Pricing Dashboard (`/pricing/dashboard`)
- [x] 08 — Product Prices (`/pricing/products`)
- [x] 09 — Price Groups (`/pricing/groups`)
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [x] Merge and deploy.

### Customers — 10–14
PR: #156 — `test(admin): audit Customers UI surfaces`
Status: **merged and deployed**.

- [x] 10 — Customers Dashboard (`/customers/dashboard`)
- [x] 11 — Customer List (`/customers`)
- [x] 12 — Orders (`/customers/orders`)
- [x] 13 — Shipments (`/customers/shipments`)
- [x] 14 — Installations (`/customers/installations`)
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [x] Merge and deploy.

### Inventory + Warehouse + QR — 15–23
PR: #157 — `fix(admin): audit Inventory Warehouse and QR UI`
Status: **merged and deployed**.

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
- [x] Stock Movements and Stock Operations accessibility/error/locale behavior hardened after per-surface regression review.
- [x] Category contract validates each route surface and exact sidebar permission boundary.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [x] Merge and deploy.

### Personnel — 24–37
PR: #158 — `fix(admin): audit Personnel UI surfaces`
Status: **merged and deployed**.

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
- [x] Personnel routes are regression-bound to their exact `personnel.view` / `personnel.manage` sidebar permissions.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [x] Merge and deploy.

### Finance + Reports — 38–46
PR: #159 — `test(admin): audit Finance and Reports UI`
Status: **merged and deployed**.

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
- [x] Merge and deploy.

### Users + Store — 47–57
PR: #160 — `fix(admin): audit Users and Store UI`
Status: **merged and deployed**.

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
- [x] Users/Store routes are regression-bound to their exact sidebar permissions.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [x] Merge and deploy.

### General Settings — 58–64
PR: #161 — `fix(admin): audit General Settings UI`
Status: **merged and deployed**.

- [x] 58 — Settings Overview (`/settings/general`)
- [x] 59 — Company (`/settings/general/company`)
- [x] 60 — Localization (`/settings/general/localization`)
- [x] 61 — Documents (`/settings/general/documents`)
- [x] 62 — Email (`/settings/general/email`)
- [x] 63 — Notifications (`/settings/general/notifications`)
- [x] 64 — Email Delivery Log (`/settings/general/email-notifications`)
- [x] Settings overview navigation has explicit landmark/labels and keyboard focus treatment.
- [x] General Settings routes are regression-bound to the exact `settings.view` sidebar permission.
- [x] Category contract, production-surface, RBAC, lint, and production build passed.
- [x] Merge and deploy.

## Shared mobile shell follow-up

PR: #162 — `fix(admin): harden mobile shell navigation and notifications` — **merged and deployed**.
Follow-up PR: #164 — `fix(admin): close mobile sidebar on link tap` — **merged and deployed**.

- [x] Mobile breakpoint aligned to the header `lg` boundary at 1024px.
- [x] Notification dropdown uses viewport-safe, safe-area-aware mobile positioning instead of a fixed negative right offset.
- [x] Notification height is constrained by the dynamic viewport while desktop trigger alignment remains intact.
- [x] Mobile application menu closes after navigation.
- [x] Mobile sidebar closes on pathname changes as a fallback.
- [x] Sidebar navigation links close the mobile drawer immediately on tap.
- [x] Desktop sidebar collapse/expand behavior remains independent from the mobile drawer.
- [x] Merge/deploy #164.

## Audit closeout

- [x] Admin UI audit 01–64 completed.
- [x] Category audit PRs #155–#161 merged and deployed.
- [x] Shared mobile shell PRs #162 and #164 merged and deployed.
- [x] Final regression/build evidence recorded before merge for each package.
