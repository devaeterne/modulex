# Modulex Admin Roadmap

Last reviewed: 2026-08-29
Main baseline: `16ba530f91a7229c25cef5df626e609b5ba63ffe`
Current phase: **Phase A0 — Production Surface & Operational Truth Cleanup**
Current cross-roadmap package: **Store Phase 2.1C — About live accepted; Gallery/Projects content acceptance pending**

This document is the operational source of truth for `modulex-admin` delivery planning and status. It is designed to survive chat/session boundaries and must be kept current as implementation progresses.

## Mandatory Session & Change Tracking Protocol

These rules are mandatory for all future Modulex Admin work:

1. **Every new conversation/session that touches `modulex-admin` must read this file first**, before planning or implementation.
2. The current phase, next action, completed history, blockers, and changed assumptions in this file take precedence over older chat summaries or remembered plans.
3. **Every material Admin change must be reflected in this file in the same workstream/PR** before that work is considered complete.
4. When a roadmap task is started, mark it `[~]`. When verified complete, mark it `[x]`. If blocked, mark it `[!]` and record the blocker briefly.
5. Do not mark work complete merely because code was written. Completion requires the task's stated done criteria plus the relevant lint/build/smoke/live verification.
6. If implementation reveals that the roadmap is wrong or incomplete, update the roadmap first or in the same PR; do not silently diverge from it.
7. New work that is not yet listed must be added to the appropriate phase before or alongside implementation.
8. Completed capabilities remain in **Completed Foundation History** so future sessions do not rediscover or rebuild them.
9. At the end of each meaningful Admin work package, update:
   - `Last reviewed`
   - `Main baseline` when applicable
   - `Current phase`
   - task checkboxes
   - blockers/decisions
   - `Next Action`
10. If a change spans Admin and Store, **both `modulex-admin/ADMIN_ROADMAP.md` and `modulex-store/STORE_ROADMAP.md` must be reviewed and updated where affected**.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete and verified
- [!] Blocked

## Global Working Rules

- `modulex-admin` is the operational control plane for products, inventory, customers, pricing, Store CMS, dealer onboarding, settings, and internal workflows.
- Production Supabase remains the shared system of record; Admin may use authenticated operational access, but authorization must stay role-aware and auditable.
- Do not weaken RLS/RPC boundaries to make an Admin screen easier to implement.
- Customer/Dealer portal visibility must be explicit. Internal-only financial, pricing, document, or operational data must not leak into Store projections.
- Prefer reusable domain components/services over route-specific duplicated Supabase logic.
- New operational writes must define validation, authorization, audit implications, and failure behavior.
- Every implementation PR that materially changes a listed capability must update this roadmap.
- No automatic merge or production deploy unless explicitly requested.

---

# Phase A0 — Production Surface & Operational Truth Cleanup

**Goal:** Remove TailAdmin/demo residue from the production Admin surface and make every reachable route intentional, authorized, and operationally meaningful.

## A0.1 Demo/template route cleanup

- [x] Audit TailAdmin/demo routes under `src/app/(admin)`.
  - Route classification is recorded in `docs/ADMIN_PRODUCTION_SURFACE.md`.
  - TailAdmin component/chart/form/table/blank/calendar and `api-test` demo routes were classified for removal; `/profile` is intentionally retained as the Modulex authenticated profile surface.
  - Personnel, Finance, Approvals, and Training remain explicit A6 scope decisions rather than being silently treated as template residue.
  - **Done when:** every non-business route is either intentionally retained, removed, or inaccessible from production navigation.

- [x] Remove or disable unused demo pages and their navigation entries.
  - Removed `/alerts`, `/avatars`, `/badge`, `/buttons`, `/images`, `/modals`, `/videos`, `/bar-chart`, `/line-chart`, `/form-elements`, `/basic-tables`, `/blank`, `/calendar`, and `/api-test`.
  - Removed the `API Test` System navigation entry.
  - **Done when:** no generic TailAdmin sample page is reachable through normal Admin navigation unless explicitly required.

- [ ] Audit dashboard widgets for template/sample data.
  - Replace invented/demo values with real operational data or remove the widget.

- [ ] Audit placeholder links, sample text, fake metrics, dead buttons, and development-only controls across Admin.

- [x] Add an Admin production-surface contract test.
  - `scripts/admin-production-surface-contract.mjs` blocks the known demo route files and `/api-test` navigation while explicitly protecting the intentional `/profile` surface.
  - Wired as `npm run smoke:production-surface` and into the main `npm run smoke` chain.
  - TDD evidence: Actions run `33248189596` failed on the first existing demo route before cleanup; run `33248248681` passed after route removal.
  - Full A0 verification run `33248339553` passed the production-surface contract, lint, deterministic Admin contracts, and production build.
  - PR #101 merged to `main` as `adfd9210740c77a4196a4938caa6a41a2f71556e` and Vercel Admin production deployment `dpl_VfZRggevcjmgp25axPY493c1NyC4` is `READY`.

## A0.2 Navigation and RBAC truth

- [x] Inventory all Admin navigation entries and map each to required roles/permissions.
  - `docs/ADMIN_RBAC_MATRIX.md` is the authoritative navigation → permission → role inventory for current production roles.
  - `scripts/rbac-smoke.mjs` now parses sidebar entries and asserts direct-route permission parity.
- [x] Verify hidden navigation is also enforced at route/data level; hidden UI alone is not authorization.
  - `/profile` now has explicit `profile.view` access for every active Admin role.
  - Store CMS manage-only routes (`content`, `marketing`, `colors`, Pages/Projects and mutation details) require `store.manage` on direct URL access.
  - Supabase RLS/RPC/API authorization remains independently authoritative and is not replaced by the UI route guard.
- [x] Remove duplicated or conflicting navigation destinations.
  - `/customers/payment-methods` remains only as an intentional legacy redirect to `/settings/payment-methods` and now shares the canonical `finance.manage` permission.
- [x] Verify direct URL access behavior for unauthorized roles.
  - Warehouse/zone/location create/edit routes require `warehouse.manage`; `warehouse` and `shipping` retain read-only warehouse-structure access and are denied mutation URLs.
  - Personnel Departments/Positions direct routes now match their sidebar `personnel.manage` requirement.
- [x] Document role expectations for `super_admin`, `admin`, `sales`, `finance`, `hr`, `warehouse`, and `shipping`.
  - Role expectations, route families, mutation rules, aliases, and enforcement layers are documented in `docs/ADMIN_RBAC_MATRIX.md`.
  - TDD evidence: run `33249649439` failed on the pre-fix parity gaps; targeted GREEN run `33249708946` passed 12/12 RBAC checks.
  - Full verification run `33249988130` passed RBAC parity, production-surface, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check.

## A0.3 Runtime/config cleanup

- [ ] Align package metadata/name with Modulex Admin rather than template identity.
- [ ] Review `.env.example` and runtime environment requirements.
- [ ] Review Vercel production configuration and Admin subdomain assumptions.
- [ ] Ensure no client bundle can receive Supabase service-role/secret credentials.

### Phase A0 Exit Gate

- [x] `npm run lint` passes.
  - Fresh A0 CI evidence: Actions run `33248339553` passed with 0 errors / 35 existing warnings.
- [x] `npm run build` passes.
  - Fresh A0 Next.js/TypeScript production build passed in Actions run `33248339553`; the generated route manifest no longer contains the removed demo routes.
- [x] `npm run smoke` passes.
  - Full local Admin smoke passed on 2026-08-29 through RBAC, API/RLS, Phase 1 API/DB, dealer onboarding/DB, portal Admin contracts, auth recovery, and polling. Package B additionally has a fresh targeted CMS contract plus deterministic contract verification.
- [x] Production navigation contains only intentional Modulex business or explicitly decision-pending surfaces.
  - Route/navigation classification is documented in `docs/ADMIN_PRODUCTION_SURFACE.md`; `API Test` was removed from navigation.
- [x] Unauthorized direct route access is denied consistently.
  - A0.2 route-permission parity and negative direct-URL cases passed in full verification run `33249988130`; data authorization remains independently enforced by RLS/RPC/API contracts.
- [x] No known TailAdmin demo/sample route remains exposed unintentionally.
  - Production-surface contract plus the fresh production build guard the removed route set.

---

# Phase A1 — Customer, Order & Fulfillment Operations

**Goal:** Make Admin the complete operational control plane for customer lifecycle, orders, shipments, installations, invoices, and portal visibility.

## A1.1 Customer master record

- [ ] Review customer list/search/filter scalability and pagination.
- [ ] Review customer detail information architecture and action hierarchy.
- [ ] Verify customer status/account-type/portal-enabled changes have explicit validation.
- [ ] Verify address management and default-address behavior.
- [ ] Add/confirm audit visibility for sensitive customer changes.

## A1.2 Orders

- [ ] Review global and customer-scoped order list consistency.
- [ ] Verify create/edit/detail flows use one domain contract.
- [ ] Define immutable vs editable fields by order lifecycle state.
- [ ] Add validation for quantity, product/variant validity, pricing source, tax/shipping fields, and status transitions.
- [ ] Verify customer portal order projections remain narrower than Admin order data.

## A1.3 Shipments

- [ ] Review shipment creation/edit/status workflow.
- [ ] Verify shipment-to-order/customer associations.
- [ ] Define tracking/carrier/reference fields and status transition rules.
- [ ] Verify only approved fulfillment fields are exposed to portals.

## A1.4 Installations

- [ ] Review installation scheduling/status workflow.
- [ ] Define installer/contact/location/date fields and transition rules.
- [ ] Verify portal installation visibility and neutral foreign-ID behavior.

## A1.5 Invoices and payments boundary

- [ ] Review current invoice list/detail/print behavior.
- [ ] Define whether payment methods/payment records are active scope or intentionally deferred.
- [ ] Keep portal invoice/payment visibility out of scope until explicitly approved.
- [ ] Verify financial fields are protected by appropriate roles.

### Phase A1 Exit Gate

- [ ] Customer → order → shipment/installation lifecycle can be operated without manual SQL.
- [ ] Invalid status transitions are prevented or explicitly handled.
- [ ] Portal-visible projections expose only approved fields.
- [ ] Core customer/order/fulfillment smoke coverage exists.

---

# Phase A2 — Inventory, Warehouses & Physical Operations

**Goal:** Make stock state trustworthy across warehouses, zones, movements, scanning, low-stock, and labels.

## A2.1 Warehouse/location model

- [ ] Review warehouses CRUD and role restrictions.
- [ ] Review locations/zones hierarchy and data integrity.
- [ ] Prevent deletion/deactivation that would orphan active stock without an explicit migration path.

## A2.2 Inventory and movements

- [ ] Review inventory list filters/search/pagination.
- [ ] Define stock-on-hand, reserved, available, damaged/hold semantics if not already explicit.
- [ ] Review stock movement types and required references/reasons.
- [ ] Require idempotent or guarded writes for repeated scan/operation requests where relevant.
- [ ] Verify movement history is append-safe and auditable.

## A2.3 Stock operations and scanning

- [ ] Review `/stock-operations` workflows.
- [ ] Review QR/barcode scan behavior, error handling, and duplicate scan protection.
- [ ] Review QR label generation/printing workflow.
- [ ] Verify mobile usability for warehouse operations.

## A2.4 Low-stock and reporting

- [ ] Define low-stock threshold source of truth.
- [ ] Verify low-stock views use efficient queries/indexes.
- [ ] Review inventory and movement reports for correctness and export needs.

### Phase A2 Exit Gate

- [ ] Stock-changing actions are validated and auditable.
- [ ] Warehouse/location integrity is enforced.
- [ ] Scan/label workflows pass device/mobile regression checks.
- [ ] Inventory reports reconcile against source records.

---

# Phase A3 — Products, Catalog & Pricing Control

**Goal:** Make Admin the reliable source for product master data, Store publication, color/media content, pricing groups, and margin visibility.

## A3.1 Product master data

- [ ] Review product create/edit flows and SKU/base-product/color relationships.
- [ ] Verify category/brand management and referential integrity.
- [ ] Define activation/deactivation rules for variants already referenced by orders/inventory.
- [ ] Review bulk operations/import/export requirements.

## A3.2 Store product publishing

- [ ] Review `/store/products` publish/unpublish workflow.
- [ ] Verify publish guards require sufficient product content/media.
- [ ] Review Store slug uniqueness and change behavior.
- [ ] Review media management: primary image, color-specific media, documents, video, alt text, sort order.
- [ ] Review Store color management and swatches.

## A3.3 Pricing

- [ ] Review pricing dashboard, product pricing, groups, and cost-margin pages.
- [ ] Define price-group lifecycle and effective-date behavior.
- [ ] Verify Dealer Portal only sees assigned active groups with approved ordering visibility.
- [ ] Ensure missing dealer-tier price never silently falls back to public/list price unless business rules explicitly change.
- [ ] Add validation/audit coverage for price changes.

### Phase A3 Exit Gate

- [ ] Product and Store publish state is deterministic.
- [ ] Pricing changes are role-restricted and auditable.
- [ ] Dealer pricing boundary tests pass.
- [ ] Store catalog content can be managed without direct SQL.

---

# Phase A4 — Store CMS, Leads & Dealer Operations

**Goal:** Complete the Admin side of Oakwell public-site management and controlled dealer acquisition.

## A4.1 Store CMS

- [x] Homepage Store content/settings foundation exists.
- [x] Store product content/media/color management foundation exists.
- [x] Store marketing/analytics settings foundation exists.
- [x] Expand CMS for production secondary pages in coordination with `STORE_ROADMAP.md` Phase 2.1.
  - Approved architecture is split into ordered Store Phase 2.1 packages A → B → C → D; all four written specs are approved.
  - Package B adds dedicated `/store/pages` and `/store/projects` management rather than extending the large existing Site Content editor.
  - Implemented with `store.manage` route/sidebar enforcement, admin/super_admin mutation controls, and existing production RLS as the real write boundary.
  - Verification: targeted secondary CMS Admin contract, lint, deterministic Admin contracts, and build passed in GitHub Actions run `33243001683`.
  - Package C Store consumer implementation is verified in Store run `33244098018`: published-only About/Gallery queries, fail-closed Gallery readiness, conditional Navbar/sitemap exposure, and project media rendering now consume the Package A/B CMS foundation. No new Admin schema or production database change is required for Package C. About production content is now published and live-accepted; Gallery remains intentionally closed until approved real project content exists.
- [x] Add draft/published workflow where required.
  - Pages and Projects expose separate Save draft / Publish / Unpublish actions; uploads do not auto-publish.
- [x] Add SEO/OG/media fields with validation.
  - Page hero/OG and project cover/OG uploads use `store-media` with JPEG/PNG/WebP/AVIF ≤20 MB validation; project media also supports external public video URLs with required alt text.
- [~] Review navigation/footer configurability needs.
  - Package D design keeps Account and Contact controls code-owned while ordinary navigation/footer link groups become `store.manage` CMS data.

## A4.2 Leads

- [x] Store lead list/detail surfaces exist.
- [ ] Review contact/dealer application filters, search, status, owner/assignment, notes, and conversion workflow.
- [ ] Verify lead attribution fields are useful but do not expose sensitive form values unnecessarily.
- [ ] Define retention/archive behavior.

## A4.3 Dealer onboarding

- [x] Controlled dealer onboarding contract exists.
- [x] Dealer supporting-document handling exists.
- [x] Dealer portal activation lifecycle exists.
- [ ] Review end-to-end dealer approval → customer/account setup → portal activation UX.
- [ ] Review rejection/deactivation/reactivation behavior.
- [ ] Ensure supporting documents remain private and access is role-restricted.

## A4.4 Customer document visibility

- [x] Admin document management supports explicit Dealer visibility.
- [ ] Review labels/categories/expiry metadata if business needs them.
- [ ] Verify no document becomes portal-visible by default.

### Phase A4 Exit Gate

- [ ] Public Store content needed for normal operations is Admin-manageable.
- [ ] Lead/dealer lifecycle is executable without manual SQL.
- [ ] Private supporting/customer documents remain access-controlled.
- [ ] Store/Admin contracts remain synchronized.

---

# Phase A5 — Users, Roles, Settings & Notifications

**Goal:** Harden internal administration, settings, email, notifications, and identity operations.

## A5.1 Users and roles

- [ ] Review users and roles management flows.
- [ ] Define protected roles/permissions that cannot be accidentally removed from the last super-admin.
- [ ] Verify invitation/password recovery/deactivation behavior.
- [ ] Add audit trail expectations for role changes.

## A5.2 General settings

- [ ] Review company settings as the canonical public company profile source.
- [ ] Review localization settings and where locale/timezone/currency are consumed.
- [ ] Review tax-rules functionality and business requirements.
- [ ] Review document settings and numbering/templates where applicable.

## A5.3 Email and notifications

- [ ] Review email transport/configuration UI and secret handling.
- [ ] Review email notification preferences/templates.
- [ ] Review in-app notification settings.
- [x] Admin notification polling reduced and hidden-tab polling suspended.
- [x] Email queue pump coordinated across tabs with a lease.
- [ ] Add operational monitoring for failed email queue deliveries.

### Phase A5 Exit Gate

- [ ] Role/identity administration has regression coverage.
- [ ] Secret material is never exposed to client-side settings payloads.
- [ ] Notification/email failures are observable.
- [ ] Settings have clear ownership and downstream consumers.

---

# Phase A6 — Personnel, Finance & Optional Business Modules

**Goal:** Decide which broad TailAdmin-era business modules are true Modulex product scope and either finish or deliberately remove/defer them.

## A6.1 Personnel

Current routes include employees, departments, positions, attendance, leave, lifecycle, documents, performance, compliance, compensation, benefits, payroll, and reports.

- [ ] Classify each Personnel route as **production / planned / remove**.
- [ ] For production modules, define data model, permissions, workflows, and acceptance tests.
- [ ] Remove navigation/routes that are only placeholders and have no committed business scope.

## A6.2 Finance

- [ ] Classify finance payroll/compensation surfaces as production / planned / remove.
- [ ] Avoid duplicating Personnel compensation/payroll without an explicit domain distinction.

## A6.3 Approvals and training

- [ ] Decide whether `/approvals` is a real shared workflow engine or placeholder.
- [ ] Decide whether `/training` belongs in Modulex scope.
- [ ] Remove or formalize accordingly.

### Phase A6 Exit Gate

- [ ] Every visible business module has an explicit product purpose.
- [ ] Placeholder modules are removed from production navigation/routes.
- [ ] Overlapping domains have one documented source of truth.

---

# Phase A7 — Quality, Security, Performance & Operations

**Goal:** Make Admin safe and maintainable as the system grows.

## A7.1 Test strategy

- [x] RBAC smoke suite exists.
- [x] API smoke suite exists.
- [x] Phase 1 API/DB smoke coverage exists.
- [x] Dealer onboarding contracts exist.
- [x] Dealer portal Admin contract exists.
- [x] Store portal Admin contract exists.
- [x] Secondary CMS Admin contract exists and protects Pages/Projects routes, RBAC, lifecycle actions, media constraints, and service-role exclusion.
- [x] Auth recovery contract exists.
- [x] Polling regression contract exists.
- [x] Production-surface/demo-route contract exists and is part of the Admin smoke chain.
- [ ] Add targeted regression contracts whenever roadmap work changes critical domain behavior.
- [ ] Document what each smoke suite protects.

## A7.2 Supabase security/performance

- [ ] Run Security Advisor after schema/RLS/RPC changes and record intentional remaining warnings.
- [ ] Run Performance Advisor after query/index changes.
- [ ] Keep SECURITY DEFINER functions pinned to safe `search_path` and narrow grants.
- [ ] Review RLS policies for duplicated scans and auth-function evaluation patterns.
- [ ] Prevent test data residue in production smoke workflows.

## A7.3 Frontend performance

- [x] Notification polling churn has been reduced.
- [ ] Review large client components and repeated Supabase reads.
- [ ] Review charts/heavy libraries and remove unused TailAdmin dependencies after route cleanup.
- [ ] Add loading/error boundaries to high-value operational flows where needed.
- [ ] Capture baseline for dashboard and key operations.

## A7.4 Accessibility and responsive operations

- [ ] Keyboard/focus audit for tables, drawers, modals, forms, scanner, and navigation.
- [ ] Mobile/tablet audit for warehouse and customer operations.
- [ ] Verify destructive actions have clear confirmations and disabled/loading states.

## A7.5 Observability and release process

- [ ] Define minimum client/server error monitoring.
- [ ] Define audit/event logging expectations for high-risk mutations.
- [ ] Document migration rollout and rollback process.
- [ ] Document release checklist for Admin + shared Supabase changes.

### Phase A7 Exit Gate

- [ ] Critical Admin workflows have repeatable verification.
- [ ] Security/performance advisor results are reviewed after relevant changes.
- [ ] High-risk writes are auditable.
- [ ] A developer can safely release Admin changes from repository docs alone.

---

# Phase A8 — Repository Documentation & Operational Handoff

**Goal:** Make `modulex-admin` understandable without chat history.

- [ ] Replace template-oriented README content with Modulex Admin architecture and operating instructions.
- [ ] Document route/domain map.
- [ ] Document environment variables and secret boundaries.
- [ ] Document Supabase relationship with `modulex-store`.
- [ ] Document role model and authorization philosophy.
- [ ] Document lint/build/smoke/live-smoke commands.
- [ ] Document Vercel Admin deployment/subdomain expectations.
- [ ] Document how and when to update `ADMIN_ROADMAP.md`.

### Phase A8 Exit Gate

- [ ] A new developer/agent can identify current status and next work by reading this roadmap first.
- [ ] README + roadmap are sufficient to run, verify, and understand Admin without prior conversation context.

---

# Completed Foundation History

Keep this section current so future planning does not rediscover completed work.

## Core operations

- [x] Product CRUD routes exist.
- [x] Inventory, stock movements, stock operations, low-stock, warehouses, locations/zones, scanning, and QR-label surfaces exist.
- [x] Customer list/detail/dashboard routes exist.
- [x] Customer order create/edit/detail surfaces exist.
- [x] Shipment and installation operational surfaces exist.
- [x] Invoice list/detail/print surfaces exist.
- [x] Pricing dashboard/groups/products/cost-margin surfaces exist.

## Store control plane

- [x] Store product CMS surfaces exist.
- [x] Store color management exists.
- [x] Store homepage/content settings exist.
- [x] Store marketing settings exist.
- [x] Store lead list/detail surfaces exist.
- [x] Dealer onboarding and portal activation Admin flows have contract coverage.
- [x] Customer document dealer-visibility controls exist.
- [x] Phase 2.1B secondary Pages/Projects CMS exists with controlled page slugs, project/media management, explicit publishing, SEO/OG fields, and Store media validation.

## Security and testing

- [x] RBAC smoke coverage exists.
- [x] API and database smoke infrastructure exists.
- [x] Dealer onboarding/portal contracts exist.
- [x] Auth recovery contract exists.
- [x] Polling regression contract exists.
- [x] Recent Supabase security/performance hardening work has been performed.

## Recent operational fix

- [x] PR #85 reduced Admin Supabase polling churn: notification polling cadence, hidden-tab suspension, profile load behavior, and cross-tab email queue coordination.

---

# Decisions / Open Questions

Record material decisions here when they affect future phases.

- [ ] Which Personnel/Finance/Training/Approvals modules are committed production scope versus template/planned surface?
- [ ] What exact roles beyond the current core Admin roles need operational permission matrices?
- [ ] Which customer financial capabilities, if any, should ever be exposed to the Customer/Dealer portals?
- [x] Phase 2.1 first secondary CMS scope is **About + Gallery/Projects**; Blog remains disabled until a real editorial workflow is required. Ordinary Navbar/Footer links become configurable in Package D while Account and Contact remain code-owned.

---

# Next Action

Primary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.

A0.1 production-surface cleanup is live and **A0.2 Navigation & RBAC truth is implementation-complete and fully verified**. Next:

1. Audit dashboard widgets for template/sample/fake data; replace with real operational data or remove the widget.
2. Audit placeholder links/text, fake metrics, dead buttons, and development-only controls across retained Admin surfaces.
3. Execute A0.3 runtime/config cleanup: package identity, `.env.example` contract, Vercel Admin-domain assumptions, and client/server secret boundaries.
4. Re-run the relevant Admin verification chain after each package and keep this roadmap current.
5. Close Phase A0 only after the remaining dashboard/surface audit and runtime/config tasks satisfy their exit criteria.

**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, and Phase 2.1C About is production-accepted. Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published and live-accepted. Package D returns to Admin A4.1 after that Gallery acceptance for configurable ordinary navigation/footer links while Account and Contact remain code-owned.
