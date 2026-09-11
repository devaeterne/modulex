# Modulex Admin

> **Modulex internal operations and Store control plane**

Modulex Admin is the authenticated operational application for Modulex. It manages customers, projects, orders, products, pricing, inventory/warehouses, Finance, Personnel, vendors, approvals, calendar, settings, users/RBAC, reporting, and the business-editable Store control plane against the shared Supabase data model.

Read `ADMIN_ROADMAP.md` first for current delivery status. Do not infer current status from historical acceptance files, archived plans, old PR notes, or chat history.

## Documentation source-of-truth map

| Document | Canonical responsibility | Status semantics |
| --- | --- | --- |
| `../AGENTS.md` | Repo-wide execution, safety, CI and change discipline | Current contract |
| `ADMIN_ROADMAP.md` | Current Admin workstreams, blockers, completion/defer state | Current status source |
| `docs/ADMIN_PRODUCTION_SURFACE.md` | Route/domain map, Admin vs Store ownership, Supabase and public/internal boundaries | Current architecture map |
| `docs/ADMIN_RBAC_MATRIX.md` | Navigation/direct-route/API/data authorization expectations | Current authorization map |
| `docs/ADMIN_RUNTIME_CONFIG.md` | Vercel/runtime/env and browser-vs-server secret boundary | Current runtime contract |
| `docs/ADMIN_UI_GUIDE.md` | Shared Admin UI/component/responsive conventions | Current UI contract |
| `docs/ADMIN_VALIDATION_GUIDE.md` | Validation, mutation, lifecycle and data-contract rules | Current validation contract |
| `docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md` | Verification, CI, migration, Advisor, production smoke and Vercel release flow | Current release/runbook contract |
| `docs/FINANCE_DOMAIN_PLAN.md` | Finance ownership/architecture | Current Finance architecture |
| `docs/FINANCE_F0_BASELINE.md` | Pre-Finance production snapshot | Historical baseline only |
| `financefinal.md` | Earlier Finance execution tracker | Historical execution evidence; not current Finance status |
| `docs/acceptance/**`, `../docs/acceptance/**` | Point-in-time acceptance/evidence for closed packages | Historical evidence; never overrides current code/roadmaps |
| `docs/archive/**`, `../docs/plans/**` | Superseded plans/roadmaps | Historical/obsolete planning evidence |

When two documents appear to conflict, use this precedence: execution-time code/schema/production state → current roadmap → current domain/runtime contracts → acceptance evidence → archived plans/chat history.

## System boundary

```text
Internal operators
      │
      ▼
Modulex Admin ── authenticated/RBAC/RLS/RPC ──┐
                                              │
                                              ▼
                                      Shared Supabase
                                      Postgres/Auth/Storage
                                              │
                         narrow published/portal projections
                                              │
                                              ▼
                              Modulex Store / Customer / Dealer
```

Admin owns internal operations and the CMS/control plane. Store owns public website and Customer/Dealer portal delivery. Mutable public business content is managed through Admin and persisted in Supabase; Store consumes only approved/narrow published projections. Internal cost, margin, private documents, operational audit data, elevated credentials, and unrestricted table access must not leak into public/portal surfaces.

The authoritative route/domain ownership matrix and public/internal boundary are in `docs/ADMIN_PRODUCTION_SURFACE.md`.

## Supabase ownership

The canonical migration history is:

```text
modulex-store/supabase/migrations
```

`modulex-admin/supabase/migrations` is a secondary compatibility mirror only where one already exists. Never use the Admin mirror, a filename, or chat history to decide production migration state; compare canonical merged migrations with the production Supabase migration list.

## Core domain rules

- Product master, pricing, inventory, Finance, HR/Personnel, Projects/Orders, Store CMS and identity/RBAC remain distinct owning domains.
- Modulex inventory truth changes only through approved inventory/movement contracts; vendor availability is reference data, not Modulex stock.
- Store publication is explicit. Vendor import/approval does not automatically make public content live.
- Finance owns actual money movement; HR owns payroll calculation/source records; Projects/Orders remain commercial/operational context rather than a duplicate cash ledger.
- Admin may manage Store content, but Store public/portal reads remain narrow and permission-safe.
- Privileged Supabase/provider credentials are server-only.

## Local setup

Requirements: project-supported Node.js/npm versions from the lockfile/CI configuration.

```bash
git clone <repository-url>
cd modulex/modulex-admin
npm ci
cp .env.example .env.local
npm run dev
```

Browser-safe Supabase variables belong in `.env.local`. Never commit service-role/secret credentials or expose them through `NEXT_PUBLIC_*` variables. Environment ownership and allowed variables are defined in `docs/ADMIN_RUNTIME_CONFIG.md`.

## Verification and release

`docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md` is the single reference flow for development verification and release. In summary:

```bash
npm run typecheck
npm run lint
npm run build
```

Run the relevant domain contracts for the changed scope. `npm run smoke` is the broad aggregate smoke chain and includes DB/live-capable contracts that require their documented environment; it is not a substitute for signed-in production acceptance.

Admin UI changes additionally follow `docs/ADMIN_UI_GUIDE.md` and the strict/shared UI contracts. Authorization changes follow `docs/ADMIN_RBAC_MATRIX.md`. DB/RLS/RPC/grant/index changes require canonical migration discipline, fresh relevant Supabase Advisor evidence, and production-safe acceptance as defined by the release standard.

Do not create a second release checklist in a feature/acceptance document; link to the OPS standard and record only package-specific evidence.

## Working agreement

- Start every package from execution-time current `main` and current open-PR state.
- Preserve existing architecture/contracts unless the package explicitly changes them.
- Reuse/extend canonical primitives rather than creating parallel tables, RPCs, routes, permissions, ledgers, or documentation sources of truth.
- Update the owning roadmap and package acceptance evidence in the same PR when status or architecture changes.
- Mark work complete only with the evidence required by `ADMIN_ROADMAP.md` and the relevant domain/release contracts.
