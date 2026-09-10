# Modulex Admin RBAC Matrix

Last reviewed: 2026-09-10
Baseline: USR-A1→USR-A4 closeout (`feat/usr-users-roles-closeout`)

This document is the navigation, direct-route, API and database authorization inventory for Modulex Admin. It records the permission expected by production navigation and the current roles that receive each permission.

## Enforcement model

Admin authorization has four independent layers:

1. **Navigation visibility** — `src/layout/AppSidebar.tsx` filters entries with `hasPermission()`.
2. **Direct-route visibility** — `src/app/(admin)/layout.tsx` calls `canAccessPath()` and renders Access Denied when the authenticated role does not satisfy the path permission.
3. **In-page/API mutation visibility** — readable routes must separately gate mutation affordances and API handlers with the corresponding manage permission. `/api/admin/users` now requires `users.view` for GET and `users.manage` for POST/PATCH/DELETE.
4. **Data authorization** — Supabase RLS/RPC/database invariants remain authoritative for reads/writes. UI visibility must never be treated as a replacement for data authorization.

`scripts/rbac-smoke.mjs` asserts that every sidebar path resolves to the same permission through `requiredPermissionForPath()`. `scripts/admin-users-contract.mjs` additionally locks the Users API permission boundary, negative-role behavior, lifecycle/session contract and USR database invariants.

## Current production roles

| Role | Expected scope |
| --- | --- |
| `super_admin` | Full permission set, including protected Super Admin account management. |
| `admin` | Full business/system permission set; protected Super Admin account actions remain separately constrained. |
| `sales` | Customer, lead/dealer application, order, invoice, shipment, installation and selling-price workflows; no Store CMS or internal finance/personnel/user administration. |
| `finance` | Pricing/cost visibility, invoices, approvals, finance/payroll operations and reports; no customer master, Store CMS, personnel, user administration or warehouse mutation access. |
| `hr` | Personnel lifecycle management and training; no general dashboard/business/user administration. |
| `warehouse` | Inventory mutation, shipments, QR operations and warehouse-structure read access; warehouse structure master-data and user administration remain Admin-only. |
| `shipping` | Shipment execution plus inventory/warehouse/QR visibility; no general stock, warehouse-structure mutation or user administration. |

All active roles receive `profile.view` for their own `/profile` surface.

## Users & Roles canonical model (USR closeout)

- `public.user_roles` is the canonical effective-role source. Multi-role permission union is derived from it.
- `public.profiles.role` remains a compatibility/primary-role mirror for legacy consumers; managed role RPCs keep it synchronized.
- `users.view`, `users.manage` and `roles.manage` are currently granted only to `super_admin` and `admin` by `ROLE_PERMISSIONS`.
- Super Admin targets are separately protected: only an effective Super Admin may assign/remove the `super_admin` role or mutate an existing Super Admin account.
- `public.set_user_roles(...)` and `public.admin_set_user_access(...)` are service-role-only mutation RPCs and re-authorize the explicit actor against active `user_roles`; browser roles cannot call them directly.
- `profiles`/`user_roles` RLS direct reads align with the current `users.view` model. Authenticated direct role mutation remains unavailable.
- A database trigger serializes every effective-Super-Admin reducing path with a transaction advisory lock and rejects `last_effective_super_admin`, including direct/cascade delete, demotion and deactivation paths.
- `public.user_role_change_audit` is append-only and captures immutable `actor_user_id`, `changed_at`, `from_roles` and `to_roles` evidence for managed role changes.
- Deactivation is enforced on every Admin API request through `profiles.is_active`; an otherwise-valid stale Auth session receives 403 immediately after deactivation. Reactivation restores access according to the current canonical roles.

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
- User list API read → `users.view`; invite/create, recovery/password action, role update, activate/deactivate and delete → `users.manage`, with protected-Super-Admin target checks layered on top.

The `warehouse` and `shipping` roles can therefore view warehouse structure but cannot open create/edit warehouse, zone or location routes. On the readable `/warehouses`, `/zones`, and `/locations` list pages, Add/Edit, activate/deactivate, delete, and double-click edit behavior is also gated by `warehouse.manage`; non-mutating drill-down links remain available.

## Intentional aliases and non-navigation permissions

- `/customers/payment-methods` is a legacy redirect to `/settings/payment-methods`. It is not a second navigation destination and uses the same `finance.manage` authorization as its canonical target.
- `training.view` remains a valid route permission for the decision-pending `/training` surface.
- `system.view` remains defined for system diagnostics, but the old `/api-test` production route/navigation was removed in A0.1 and is prohibited by the production-surface contract.
- `settings.manage`, `users.manage`, `approvals.review`, and similar mutation permissions may be consumed inside business flows even when the top-level navigation route uses a view permission.

## Regression guard

`npm run smoke:rbac` and `npm run test:admin-users` must fail when:

- a sidebar path and `requiredPermissionForPath()` disagree,
- `/profile` is unavailable to an active role,
- an operational role gains `users.manage` or the Users API falls back to a coarse Admin/staff guard,
- warehouse/shipping roles gain warehouse-structure mutation routes,
- warehouse-structure list pages expose or invoke mutation behavior without `warehouse.manage`,
- the legacy payment-method alias diverges from `finance.manage`,
- last-effective-Super-Admin DB serialization/guard evidence disappears,
- immutable role-change actor/time/from/to evidence disappears, or
- current positive/negative role-path expectations regress.

Route checks are a UI authorization boundary only. Supabase RLS/RPC/API authorization is independently required and is part of the USR closeout contract.
