# Modulex Admin RBAC Matrix

Last reviewed: 2026-08-29
Baseline: `f248d04864c9e55111d416f99a1cced4ee4f02f3`

This document is the Phase A0.2 navigation and direct-route authorization inventory for Modulex Admin. It records the permission expected by production navigation and the current roles that receive each permission.

## Enforcement model

Admin authorization has three independent layers:

1. **Navigation visibility** — `src/layout/AppSidebar.tsx` filters entries with `hasPermission()`.
2. **Direct-route visibility** — `src/app/(admin)/layout.tsx` calls `canAccessPath()` and renders Access Denied when the authenticated role does not satisfy the path permission.
3. **In-page mutation visibility** — list routes that are intentionally readable by operational roles must separately gate mutation affordances and handlers with the corresponding manage permission. Warehouse structure lists use `warehouse.manage`.
4. **Data authorization** — Supabase RLS/RPC boundaries and protected Admin API handlers remain authoritative for reads/writes. UI visibility must never be treated as a replacement for data authorization.

`scripts/rbac-smoke.mjs` asserts that every sidebar path resolves to the same permission through `requiredPermissionForPath()`. It also covers profile access, intentional aliases, negative mutation-route cases, and warehouse-structure list mutation UI guards.

## Current production roles

| Role | Expected scope |
| --- | --- |
| `super_admin` | Full permission set, including protected Super Admin account management. |
| `admin` | Full business/system permission set; protected Super Admin account actions remain separately constrained. |
| `sales` | Customer, lead/dealer application, order, invoice, shipment, installation and selling-price workflows; no Store CMS or internal finance/personnel administration. |
| `finance` | Pricing/cost visibility, invoices, approvals, finance/payroll operations and reports; no customer master, Store CMS, personnel or warehouse mutation access. |
| `hr` | Personnel lifecycle management and training; no general dashboard/business operations. |
| `warehouse` | Inventory mutation, shipments, QR operations and warehouse-structure read access; warehouse structure master-data mutation remains Admin-only. |
| `shipping` | Shipment execution plus inventory/warehouse/QR visibility; no general stock or warehouse-structure mutation. |

All active roles receive `profile.view` for their own `/profile` surface.

## Navigation → permission → role inventory

`super_admin` and `admin` receive every permission below. The table lists additional operational roles where applicable.

| Navigation / route | Required permission | Additional roles |
| --- | --- | --- |
| `/` | `dashboard.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/products` | `products.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/low-stock` | `inventory.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/brands`, `/categories` | `products.manage` | — |
| `/pricing/dashboard`, `/pricing/products` | `pricing.view` | `sales`, `finance` |
| `/pricing/groups` | `pricing.manage` | — |
| `/customers/dashboard`, `/customers` | `customers.view` | `sales` |
| `/customers/orders` | `orders.view` | `sales`, `finance` |
| `/customers/shipments` | `shipments.view` | `sales`, `warehouse`, `shipping` |
| `/customers/installations` | `installations.view` | `sales` |
| `/inventory`, `/stock-movements` | `inventory.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/stock-operations` | `inventory.manage` | `warehouse` |
| `/warehouses`, `/zones`, `/locations` | `warehouse.view` | `warehouse`, `shipping` |
| `/qr-labels` | `qr.view` | `warehouse`, `shipping` |
| `/scan`, `/shelf-inventory` | `qr.manage` | `warehouse` |
| `/personnel`, employee/attendance/leave/compensation/payroll/benefits/documents/compliance/lifecycle/performance/reports | `personnel.view` | `hr` |
| `/personnel/departments`, `/personnel/positions` | `personnel.manage` | `hr` |
| `/customers/invoices` | `invoices.view` | `sales`, `finance` |
| `/finance/payroll`, `/finance/compensation` | `finance.view` | `finance` |
| `/approvals` | `approvals.view` | `sales`, `finance` |
| `/pricing/cost-margin` | `pricing.cost.view` | `finance` |
| `/settings/general/tax-rules`, `/settings/payment-methods` | `finance.manage` | `finance` |
| `/reports/inventory`, `/reports/movements` | `reports.view` | `sales`, `finance` |
| `/users` | `users.view` | — |
| `/roles` | `roles.manage` | — |
| `/store/content`, `/store/pages`, `/store/projects`, `/store/marketing`, `/store/colors` | `store.manage` | — |
| `/store/products` | `store.view` | — |
| `/store/leads` | `leads.view` | `sales` |
| `/settings/general` and company/localization/documents/email/notifications/email-delivery-log pages | `settings.view` | — |
| `/profile` (header dropdown) | `profile.view` | `sales`, `finance`, `hr`, `warehouse`, `shipping` |

## Direct-route mutation rules

Navigation list permissions are not sufficient for mutation URLs. The following deeper routes are intentionally stricter:

- Product create/edit routes → `products.manage`.
- Order create/edit routes → `orders.manage`.
- Store product/color detail mutation routes → `store.manage`.
- Store Pages/Projects and CMS management routes → `store.manage`.
- Warehouse structure mutations (`/warehouses/new`, `/warehouses/:id/edit`, `/zones/new`, `/zones/:id/edit`, `/locations/new`, `/locations/:id/edit`) → `warehouse.manage`.
- Personnel departments/positions and descendants → `personnel.manage`.
- Store lead detail routes → `leads.manage`.

The `warehouse` and `shipping` roles can therefore view warehouse structure but cannot open create/edit warehouse, zone or location routes. On the readable `/warehouses`, `/zones`, and `/locations` list pages, Add/Edit, activate/deactivate, delete, and double-click edit behavior is also gated by `warehouse.manage`; non-mutating drill-down links remain available.

## Intentional aliases and non-navigation permissions

- `/customers/payment-methods` is a legacy redirect to `/settings/payment-methods`. It is not a second navigation destination and uses the same `finance.manage` authorization as its canonical target.
- `training.view` remains a valid route permission for the decision-pending `/training` surface.
- `system.view` remains defined for system diagnostics, but the old `/api-test` production route/navigation was removed in A0.1 and is prohibited by the production-surface contract.
- `settings.manage`, `users.manage`, `approvals.review`, and similar mutation permissions may be consumed inside business flows even when the top-level navigation route uses a view permission.

## Regression guard

`npm run smoke:rbac` must fail when:

- a sidebar path and `requiredPermissionForPath()` disagree,
- `/profile` is unavailable to an active role,
- warehouse/shipping roles gain warehouse-structure mutation routes,
- warehouse-structure list pages expose or invoke mutation behavior without `warehouse.manage`,
- the legacy payment-method alias diverges from `finance.manage`, or
- current positive/negative role-path expectations regress.

Route checks are a UI authorization boundary only. Supabase RLS/RPC/API authorization must continue to be verified independently by the existing Admin smoke suites.
