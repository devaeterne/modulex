# Modulex Admin RBAC Matrix

Last reviewed: 2026-09-11
Baseline main: `02f2bce3433df43c7b4fb10d611ed99e7406a822`

This is the canonical navigation/direct-route authorization map for Modulex Admin. `src/lib/auth/permissions.ts` and the database authorization layer are implementation truth; this document records the intended current contract and must move with them in the same PR.

Route/domain ownership is documented in `ADMIN_PRODUCTION_SURFACE.md`. This matrix does not redefine domain ownership or public Store projections.

## Enforcement model

Admin authorization has independent layers that must agree:

1. **Navigation visibility** — `src/layout/AppSidebar.tsx` filters entries with `hasPermission()`.
2. **Direct-route visibility** — the authenticated Admin layout calls `canAccessPath()`/`requiredPermissionForPath()` and denies routes the effective role set cannot access.
3. **Action/API authorization** — a readable page must separately gate mutation affordances and server/API handlers with the corresponding manage/review permission.
4. **Data authorization** — Supabase grants, RLS, RPC authorization/private cores and database lifecycle invariants remain authoritative. UI visibility is never a substitute for data authorization.

Multi-role users receive the union of their effective permissions. Negative acceptance for all production roles is owned by RBS-A4 in `ADMIN_ROADMAP.md`.

## Current production roles

| Role | Current scope |
| --- | --- |
| `super_admin` | Full permission vocabulary, including protected Super Admin account management. |
| `admin` | Full business/system permission vocabulary; protected Super Admin target actions remain separately constrained. |
| `sales` | Customer/lead/dealer, Project, Calendar, Order, Invoice, Shipment/Installation, selling-price, operational report and related read/manage workflows defined in `ROLE_PERMISSIONS`; no Store CMS, Personnel, User administration or Finance ledger authority. |
| `finance` | Finance, invoice/customer-collection, Project/payment visibility, Orders, operational reports and related read/manage workflows defined in `ROLE_PERMISSIONS`; no Customer master, Store CMS, Personnel, User administration or warehouse mutation authority. |
| `hr` | Personnel lifecycle and HR operations only, plus common profile/request/update surfaces. Standalone `/training` is not a product route. |
| `warehouse` | Inventory mutation, shipments, QR operations and warehouse-structure read access; warehouse master-data mutation remains Admin-only. |
| `shipping` | Shipment execution plus inventory/warehouse/QR-label visibility; no general stock mutation or warehouse-structure mutation. |

All active roles receive `profile.view`, `requests.view`, and `updates.view` through the current permission map.

## Users & Roles canonical model

- `public.user_roles` is the canonical effective-role source. Multi-role permission union is derived from it.
- `public.profiles.role` is a compatibility/primary-role mirror for legacy consumers; managed role RPCs keep it synchronized.
- `users.view`, `users.manage` and `roles.manage` are granted only to `super_admin` and `admin` by the current `ROLE_PERMISSIONS`.
- Super Admin targets are separately protected: only an effective Super Admin may assign/remove `super_admin` or mutate an existing Super Admin account.
- `public.set_user_roles(...)` and `public.admin_set_user_access(...)` are trusted server/service-role mutation boundaries and re-authorize the explicit actor against active roles; browser roles do not call them directly.
- Direct authenticated role mutation remains unavailable.
- Database protection prevents deleting, demoting or deactivating the final effective Super Admin.
- `public.user_role_change_audit` is append-only and preserves actor/time/from/to evidence.
- Deactivation is enforced by the Admin server boundary so a stale Auth session does not retain Admin access.

## Navigation → permission → operational roles

`super_admin` and `admin` receive every permission below. “—” means no additional operational role receives the required permission in the current code.

| Navigation / route family | Required permission | Additional roles |
| --- | --- | --- |
| `/` | `dashboard.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/profile` | `profile.view` | `sales`, `finance`, `hr`, `warehouse`, `shipping` |
| `/requests` | `requests.view` | `sales`, `finance`, `hr`, `warehouse`, `shipping` |
| `/updates` | `updates.view` | `sales`, `finance`, `hr`, `warehouse`, `shipping` |
| `/projects` | `projects.view` | `sales`, `finance` |
| `/projects/import` | `projects.import` | — |
| `/calendar` | `calendar.view` | `sales`, `finance` |
| `/products` | `products.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/products/vendor-imports`, `/products/types`, `/products/uom`, `/brands`, `/categories` | `products.manage` | — |
| `/low-stock`, `/inventory`, `/stock-movements` | `inventory.view` | `sales`, `finance`, `warehouse`, `shipping` |
| `/stock-operations` | `inventory.manage` | `warehouse` |
| `/pricing/dashboard`, `/pricing/products`, `/pricing/material-bands` | `pricing.view` | `sales`, `finance` |
| `/pricing/groups`, `/pricing/countertop/*` | `pricing.manage` | — |
| `/pricing/cost-margin` | `pricing.cost.view` | — |
| `/customers/dashboard`, `/customers` | `customers.view` | `sales` |
| `/customers/orders` | `orders.view` | `sales`, `finance` |
| `/customers/shipments` | `shipments.view` | `sales`, `warehouse`, `shipping` |
| `/customers/installations` | `installations.view` | `sales` |
| `/customers/invoices` | `invoices.view` | `sales`, `finance` |
| `/warehouses`, `/zones`, `/locations` | `warehouse.view` | `warehouse`, `shipping` |
| `/qr-labels` | `qr.view` | `warehouse`, `shipping` |
| `/scan`, `/shelf-inventory` | `qr.manage` | `warehouse` |
| `/approvals` | `approvals.view` | `sales`, `finance` |
| `/finance/*` | `finance.view` | `finance` |
| `/personnel/*` general HR routes | `personnel.view` | `hr` |
| `/personnel/departments`, `/personnel/positions` | `personnel.manage` | `hr` |
| `/reports/inventory`, `/reports/movements` | `reports.view` | `sales`, `finance` |
| `/reports/sales-production` | `finance.view` | `finance` |
| `/store/leads` | `leads.view` | `sales` |
| `/store/leads/*` management/detail | `leads.manage` | `sales` |
| `/store/products` | `store.view` | — |
| Store CMS/manage routes (`/store/content`, company/pages/cabinet-content/colors/projects/media/reviews/marketing and product mutation routes) | `store.manage` | — |
| `/settings/general/*` ordinary settings routes | `settings.view` | — |
| `/settings/general/product-updates` | `settings.manage` | — |
| `/settings/general/tax-rules`, `/settings/payment-methods` | `finance.manage` | `finance` |
| `/users` | `users.view` | — |
| `/roles` | `roles.manage` | — |

This table documents the route permission currently required; mutation permissions inside a readable route may be stricter.

## Direct-route and mutation rules

- Product create/edit, Product Types/UOM and Vendor Import mutation routes require `products.manage`.
- Order create/edit actions require `orders.manage` even when the list/detail route is readable with `orders.view`.
- Project mutation actions use Project manage permissions; historical import is separately `projects.import`.
- Store product detail mutation and Store CMS surfaces require `store.manage`.
- Warehouse structure create/edit actions require `warehouse.manage`; warehouse/shipping roles keep read-only structure access.
- Personnel department/position administration requires `personnel.manage`.
- Store lead detail/management actions require `leads.manage`.
- Approval decisions require `approvals.review`; viewing the queue alone does not grant review authority.
- User list/API read requires `users.view`; invite/create/recovery/role/activate/deactivate/delete paths require `users.manage` plus protected-Super-Admin target checks.
- Finance/HR/Inventory high-risk mutations must additionally satisfy the owning RPC/RLS/lifecycle/audit contract; a route permission alone never authorizes them.

## Intentional aliases and removed permissions

- `/customers/payment-methods` is a legacy redirect/alias to `/settings/payment-methods` and uses the same `finance.manage` boundary; it is not a second configuration owner.
- Standalone `/training` was removed from product scope by MOD-A2/MOD-A3. There is no current `training.view` route permission. Any retained HR training schema is Personnel-owned.
- `system.view` remains in the permission vocabulary for system diagnostics, but the old `/api-test` production route/navigation is removed and prohibited by the production-surface contract.
- `settings.manage`, `approvals.review`, `users.manage` and other manage/review permissions may be consumed inside workflows whose top-level route uses a view permission.

## Regression guard

Run:

```bash
npm run smoke:rbac
npm run smoke:admin-users
```

The contracts must fail when navigation and route permission truth diverge, an operational role gains protected User/warehouse behavior, the payment-method alias diverges, Super Admin invariants disappear, role-change audit evidence is lost, or current positive/negative role expectations regress.

For a release, also follow `OPS_OBSERVABILITY_RELEASE_STANDARD.md`. RBS-A4 owns the full role-by-role negative production acceptance matrix; documentation is not a substitute for that verification.