# Modulex Admin Production Surface Inventory

Last reviewed: 2026-08-29
Baseline main: `6cbd27198d930cb129b912fa4faece3bf967e292`

This inventory classifies the Admin route/navigation surface for Phase A0. It is intentionally conservative: a route is removed only when it is clearly TailAdmin/demo residue. Business modules whose long-term scope is still under review remain explicit rather than being silently deleted.

## Classification

### Production operational surfaces

These route families are Modulex business/control-plane surfaces and remain reachable subject to the existing permission model:

- `/` — operational dashboard
- `/products`, `/brands`, `/categories`, `/low-stock` — product master and stock visibility
- `/pricing/*` — pricing dashboard, product pricing, groups, cost/margin
- `/customers/*` — customers, orders, shipments, installations, invoices
- `/inventory`, `/stock-movements`, `/stock-operations` — inventory operations
- `/warehouses`, `/zones`, `/locations` — warehouse/location model
- `/qr-labels`, `/scan`, `/shelf-inventory` — QR/barcode and physical stock workflows
- `/reports/*` — inventory/movement reporting
- `/users`, `/roles` — identity and access administration
- `/store/*` — Store CMS, products, colors, marketing, leads, Pages and Projects
- `/settings/general/*`, `/settings/payment-methods` — operational settings
- `/profile` — intentional Modulex user-profile surface used by the authenticated header dropdown

### Intentional business surfaces pending later scope decisions

These are not TailAdmin component demos. They remain in place for later roadmap decisions and must not be removed as part of A0 demo cleanup:

- `/personnel/*` — Phase A6 classification still required
- `/finance/*` — Phase A6 classification still required
- `/approvals` — Phase A6 decision still required
- `/training` — Phase A6 decision still required

Their presence is deliberate for now; future A6 work must classify each as production, planned, or remove.

### Removed TailAdmin/demo surfaces

The following sample routes are prohibited from the production Admin surface and are protected by `scripts/admin-production-surface-contract.mjs`:

- `/alerts`
- `/avatars`
- `/badge`
- `/buttons`
- `/images`
- `/modals`
- `/videos`
- `/bar-chart`
- `/line-chart`
- `/form-elements`
- `/basic-tables`
- `/blank`
- `/calendar`
- `/api-test`
- `/error-404` — explicit TailAdmin template route; global `not-found.tsx` is the single intentional 404 surface

`/api-test` was also removed from the authenticated sidebar navigation.

## Guardrails

`npm run smoke:production-surface` fails when a known TailAdmin/demo route file is reintroduced or when `/api-test` is added back to navigation. The contract also asserts that the intentional `/profile` surface remains present, the operational dashboard continues to source KPIs/recent movements from the production RPC boundary, dashboard Quick Actions resolve the active profile and filter through `canAccessPath()`, the global 404 does not expose TailAdmin branding, and production Sign In does not preload the known developer account.

Phase A0.2 navigation/direct-route permission truth is documented in `docs/ADMIN_RBAC_MATRIX.md`. `npm run smoke:rbac` compares every sidebar path with `requiredPermissionForPath()`, verifies all active roles can reach `/profile`, protects manage-only Store and warehouse mutation routes, and keeps intentional route aliases aligned with their canonical permissions.

These UI/route guards do not replace Supabase RLS/RPC/API authorization; data authorization remains independently enforced and tested.

## Remaining A0 work

- Complete runtime/package/environment cleanup tasks listed in `ADMIN_ROADMAP.md` (A0.3).
- Keep A6 Personnel/Finance/Training/Approvals scope decisions explicit rather than treating them as template residue.
