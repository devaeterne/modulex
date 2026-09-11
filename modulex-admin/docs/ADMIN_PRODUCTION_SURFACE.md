# Modulex Admin Production Surface & Domain Map

Last reviewed: 2026-09-11
Baseline main: `02f2bce3433df43c7b4fb10d611ed99e7406a822`

This is the canonical handoff map for the Modulex Admin production surface. It answers four questions without relying on chat history: **which domain owns a capability, where its Admin route lives, where Supabase changes are canonical, and what may cross from internal Admin data into Store/public/portal delivery.**

`ADMIN_ROADMAP.md` owns delivery status. `ADMIN_RBAC_MATRIX.md` owns role/permission expectations. This document owns route/domain and cross-surface architecture.

## Ownership model

| Layer / domain | Primary owner | Runtime surface | Boundary |
| --- | --- | --- | --- |
| Internal operations | `modulex-admin` | authenticated Admin routes | RBAC + server/RPC + grants/RLS + DB lifecycle guards |
| Store CMS/control plane | `modulex-admin` | `/store/*`, relevant Settings | edits canonical Supabase business content; does not directly render the public site |
| Public Oakwell website | `modulex-store` | public Store routes | published/public projection only |
| Customer Portal | `modulex-store` | authenticated customer routes | customer-scoped projection only |
| Dealer Portal | `modulex-store` | authenticated dealer routes | dealer/customer-scoped projection only |
| Shared system of record | Supabase | Postgres/Auth/Storage/RPC | one data model; access differs by caller/surface |
| Canonical migration history | `modulex-store/supabase/migrations` | source-controlled SQL | production migration source of truth |
| Admin migration mirror | `modulex-admin/supabase/migrations` | compatibility mirror where established | secondary only; never decides production history |

A domain may be displayed by another surface without transferring ownership. Example: Finance can show approved payroll settlement while Personnel/HR remains the payroll calculation/source owner; Store can display an Order/Project projection while Admin remains the operational owner.

## Current Admin production route families

The table describes current route families and canonical ownership. Nested detail/new/edit/print routes inherit the same domain unless a stricter permission is documented in `ADMIN_RBAC_MATRIX.md`.

| Route family | Domain owner / purpose |
| --- | --- |
| `/` | Admin operational dashboard |
| `/customers`, `/customers/dashboard` | Customer master and customer operations |
| `/customers/orders` and nested order routes | Orders commercial/lifecycle domain |
| `/customers/shipments` | Shipment/fulfillment execution |
| `/customers/installations` | Installation execution |
| `/customers/invoices` | Customer invoice document surface; Finance owns resulting money movement |
| `/projects`, `/projects/import` | Project operations/import; Finance remains money-movement owner |
| `/calendar` | Company Calendar and Google Calendar integration surface |
| `/products`, `/products/types`, `/products/uom`, `/brands`, `/categories` | Product Master/taxonomy |
| `/products/vendor-imports` | Vendor Catalog review/import into canonical Product Master |
| `/pricing/dashboard`, `/pricing/products`, `/pricing/groups`, `/pricing/material-bands` | Pricing and price-group/material-band controls |
| `/pricing/countertop/*` | Countertop configuration/catalog/services/settings |
| `/pricing/cost-margin` | restricted internal cost/margin projection |
| `/inventory`, `/stock-movements`, `/stock-operations`, `/low-stock` | Inventory snapshots, append-safe movements and stock operations |
| `/warehouses`, `/zones`, `/locations` | Warehouse/location master and read surfaces |
| `/qr-labels`, `/scan`, `/shelf-inventory` | QR/barcode and physical stock workflows |
| `/requests` | Request Center |
| `/approvals` | shared approval queue/workflow; requesting remains domain-owned |
| `/updates` | product/release updates visible to authorized staff |
| `/finance/*` | Finance Core, expenses, AR/AP, accounts, vendors/bills/payments/schedules/aging/reports and settlement projections |
| `/personnel/*` | Personnel/HR: employees, departments, positions, attendance, leave, lifecycle, documents, performance, compliance, compensation, benefits, payroll and reports |
| `/reports/sales-production`, `/reports/inventory`, `/reports/movements` | production reporting surfaces; each report reads its owning domain truth |
| `/store/*` | Admin Store control plane: content/company/pages/cabinet content/products/colors/projects/media/reviews/leads/form options/marketing |
| `/users`, `/roles` | Users, effective roles and access administration |
| `/settings/general/*` | company/localization/documents/email/notifications/product updates/project participant roles and other general settings |
| `/settings/payment-methods` | shared payment-method configuration with Finance mutation authority |
| `/settings/integrations/google-calendar` | Google Calendar integration settings |
| `/profile` | authenticated user profile |

### Intentional aliases / compatibility routes

- `/customers/payment-methods` is a legacy redirect/alias for `/settings/payment-methods`; it is not a second configuration source.
- Compatibility projections/tables/RPCs may exist for older consumers, but they do not create a second business owner. Their deprecation/removal requires explicit migration evidence.

## Product-scope decisions already closed

The old Phase A0/A6 classification is no longer current.

- **Finance** is production scope and closed through the Finance F0→F7 architecture/acceptance track.
- **Personnel/HR** is production scope; all listed Personnel routes are retained.
- **Approvals** is a shared production workflow.
- **Standalone `/training` is not product scope.** Its former static route and obsolete route permission were removed. Existing HR training schema, where retained, remains Personnel-owned rather than resurrecting a standalone Training product surface.
- **`/calendar` is a production Company Calendar route.** Only the old TailAdmin sample calendar route under the template route group is prohibited.

## Public vs internal data boundary

Modulex uses one Supabase project, but shared storage does **not** mean shared visibility.

### Internal by default

The following remain internal unless a deliberately narrow projection says otherwise:

- cost, margin, landed-cost and internal pricing inputs;
- inventory internals, stock movement/audit detail and warehouse mutation metadata;
- Finance ledger/audit internals and payment-sensitive operational data;
- HR/Personnel records and payroll source detail;
- internal notes, approval/audit history, actor metadata and idempotency/debug state;
- private customer/dealer/supporting documents unless visibility is explicitly granted;
- service-role/secret/provider credentials and server-only configuration.

### Allowed cross-surface pattern

```text
Admin mutation / canonical domain truth
        ↓
Supabase table/RPC/storage + RLS/lifecycle guards
        ↓
reviewed narrow public/customer/dealer projection
        ↓
modulex-store public or portal consumer
```

Public/portal consumers must not bypass a reviewed projection merely because the underlying table is in the same Supabase project. `SECURITY DEFINER` functions are acceptable only as intentional narrow boundaries with reviewed authorization/grants and safe `search_path` behavior.

## Store CMS ownership

`modulex-admin` is the business-editable control plane for mutable Store content. `modulex-store` owns rendering/delivery. The intended flow is:

`Admin → Supabase DB/Storage → published/public projection → Store`.

Do not create a second hard-coded production copy of company profile, contact/location/hours, real project/media/review/FAQ content, configurable navigation/footer labels, or other operator-owned content inside Store runtime source.

## Removed / prohibited production residue

The production-surface regression prohibits the old TailAdmin/demo routes, including UI-element demos, chart demos, form/table samples, blank page, `/api-test`, and the template-specific error page. The global Modulex `not-found.tsx` is the intentional 404 surface.

The old TailAdmin sample calendar path under `(others-pages)/calendar` remains prohibited; the current `/calendar` production domain is a separate Modulex route and must not be treated as demo residue.

## Executable guardrails

- `npm run smoke:production-surface` protects demo-route removal, dashboard production RPC use, permission-filtered quick actions, Modulex 404 identity and sign-in/profile expectations.
- `npm run smoke:rbac` protects navigation/direct-route permission alignment; it does not replace RLS/RPC authorization.
- Domain contracts protect deeper behavior, lifecycle and cross-surface projections.
- `docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md` defines the verification/release flow for changes to this map or the underlying runtime.

## Documentation lifecycle

Historical acceptance files may describe the route set that existed when they were written. They remain evidence, not the current route inventory. When current code/product ownership changes, update this document, the relevant RBAC/domain contract, `ADMIN_ROADMAP.md`, and acceptance evidence in the same PR.