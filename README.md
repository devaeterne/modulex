# Modulex

Modulex is the Oakwell Cabinetry monorepo. It contains the internal operations application, the public/portal delivery application, shared release contracts, and the canonical Supabase migration history.

## Applications and ownership

- `modulex-admin` — internal operational/control plane: Customers, Projects, Orders, Finance, Personnel, Inventory/Warehouse, Product/Pricing, Settings, Users/RBAC, Approvals, Calendar, Vendor workflows, and the Store CMS/control plane.
- `modulex-store` — public Oakwell website plus Customer/Dealer portal delivery surfaces. It consumes narrow public/portal projections; it does not become the owner of internal Admin data.
- Supabase — shared system of record. Canonical migrations live in `modulex-store/supabase/migrations`; any Admin migration copy is a compatibility mirror, not production history.

## Start here

For Admin work, read in this order:

1. `AGENTS.md` — repository-wide execution and safety contract.
2. `modulex-admin/ADMIN_ROADMAP.md` — current Admin workstream/status source of truth.
3. `modulex-admin/README.md` — Admin documentation index and architecture entry point.
4. `modulex-admin/docs/ADMIN_PRODUCTION_SURFACE.md` — route/domain ownership, Admin vs Store boundary, and Supabase/public-vs-internal map.
5. `modulex-admin/docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md` — canonical verification, migration, Advisor, production-smoke, and Vercel release flow.

For Store work, read `modulex-store/STORE_ROADMAP.md` before implementation. Cross-surface work must respect both roadmaps.

## Documentation precedence

Current code/schema and execution-time production state are implementation truth. `ADMIN_ROADMAP.md` / `STORE_ROADMAP.md` are current delivery-status truth. Domain contracts describe current architecture. Acceptance files and archived plans are point-in-time evidence and do not override newer roadmap, code, schema, or production state.

Do not use chat history, remembered SHAs, stale Advisor counts, old deployment URLs, or archived planning checkboxes as current operational truth.