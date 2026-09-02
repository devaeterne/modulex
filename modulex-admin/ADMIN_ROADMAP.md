# Modulex Admin Roadmap

Last reviewed: 2026-09-03
Main baseline: `2789ffebf147e701682ea97f4f1a09481fa29e45`
Current phase: **Phase A4 — Store CMS, Leads & Dealer Operations**
Current cross-roadmap package: **Vendor Catalog Review v3 availability/bulk-approval hardening is active on `feat/vendor-availability-bulk-approval`; current `main` is incorporated and Store public projections remain unchanged.**
Current Admin next action: **Review/merge Vendor Catalog availability/bulk approval, then apply `20260902093000_vendor_catalog_sync_family_v3` and `20260902113500_vendor_catalog_availability_bulk_approval`, run post-DDL advisors, deploy Admin, and perform signed-in sync/mapping/availability/bulk-approval acceptance.**

## Customer read performance cleanup

- [~] Deduplicate Customers summary, Customer Detail, and Order Detail initial reads without adding persistent client caching or changing mutation behavior.
  - Customers summary reuses `get_customer_dashboard` with zero recent-row limits while preserving the directory's exact filtered count and server-side range.
  - Customer and order detail consumers share only concurrent in-flight reads; settled requests are removed immediately so mutation-driven reloads cannot reuse stale data.
  - Keep this package `[~]` until the draft PR contracts, full Admin verification, and a post-deploy authenticated production browser re-audit confirm the duplicate calls are removed.

## Admin UI standardization program

- [x] Standardize the production Dashboard with shared TailAdmin cards, alerts, buttons, and admin table primitives without changing KPI/RPC, retry, or role-filtering behavior.
  - `smoke:dashboard-ui` is wired into the normal Admin smoke chain; Dashboard UI, Admin UI, production-surface, RBAC, TypeScript, lint, production build, and diff-check passed locally.

## Product Master UX v2

- [x] Dynamic Product Types, Units of Measure, Product create/edit/list, QR compatibility, Brands/Categories usage-aware UX, and type/UOM-aware Low Stock.
  - PR #190 and advisor-hardening PR #191 are merged/deployed; production Product Master migrations, DB/runtime acceptance, canonical type/UOM backfill, and post-migration advisor verification are complete.
  - Final production closeout on 2026-09-02 verified current-main route bundles, authenticated Product Master v2/Low Stock data boundaries, 1,031 production products with 0 missing Product Type/UOM assignments, fresh Product Master CI, and no Product Master route-family runtime errors in the inspected window.
  - The project owner completed and accepted the required signed-in browser click-through across Products list/Create/Edit, Product Types, Units of Measure, Brands/Categories, and Low Stock. Detailed evidence: `docs/acceptance/product-master-v2-production.md`.

## Pricing UI v2 — Product Type routing

- [x] Route Admin pricing workspaces through `product_types.pricing_model` without moving price amounts into Product Type or UOM.
  - `price_group` remains canonical on `product_prices + price_groups`; `countertop_material_band` remains canonical on Stone profile → `countertop_material_price_bands`; `none` exposes no editable commercial product price. UOM remains quantity/measurement semantics only.
  - PR #206 adds Product Type/UOM-aware server-side Product Prices filtering, the focused `/pricing/material-bands` rate workspace, and a DB-authoritative guard that rejects new Price Group amounts for non-`price_group` Product Types while retaining an explicit null-cleanup path for legacy rows.
  - Fresh production closeout on 2026-09-02 reproduced the authenticated application-role acceptance after merge: `get_product_prices_page_v2` returned 1,029 routable `price_group` products, with routing reconciliation of 1,029 `price_group`, 1 `countertop_material_band`, and 0 `none` products; sampled rows and Product Type/UOM filters matched the routing contract.
  - Rollback-only authenticated mutation acceptance proved a Stone/material-band product is rejected by `set_product_price` with `This Product Type does not use Price Group pricing.`, while the canonical `upsert_countertop_reference('material_band', ...)` path succeeds for existing B1. Rollback left B1 unchanged at $34 and persisted no business-data mutation.
  - Production migration history contains `pricing_product_type_routing` (`20260831235918`). Relevant public RPCs remain `SECURITY INVOKER`, authenticated-executable, and anon-denied; the private Material Band mutation core remains role-checked with a pinned search path.
  - Current-main Admin deployment `dpl_Pn56aQhDGKAXprs7K2bUXJdKwFNg` is `READY`; `/pricing/products` and `/pricing/material-bands` both return HTTP 200 with the expected Modulex bundles/titles, and no runtime errors were found for either route in the inspected 24-hour window.
  - Fresh Security + Performance Advisor scans show no Pricing UI v2-specific finding. Existing Store/support/security and unrelated FK/index/policy backlog remains separate and does not block this closeout.
  - Permanent CI evidence remains green from PR #206 (`33451480069`) and final Pricing workspace polish PR #211 (`33453776288`). Detailed evidence: `docs/acceptance/pricing-ui-v2-production.md`.
  - Store public/Dealer projection behavior is unchanged by this package; the migration lives in the shared Supabase migration directory but does not widen Store data exposure, so `STORE_ROADMAP.md` requires no functional status change for this package.

## Vendor Catalog Review v3

- [~] Add category-scoped vendor discovery, durable Check Updates snapshots, family/variant grouping, mapping-driven approval, normalized vendor availability, and bounded bulk review controls.
  - Karran supports collection discovery and scoped `/collections/{handle}/products.json`; Ruvati supports Store API categories and scoped category discovery. Unscoped cron remains lightweight and does not download images.
  - `Check Updates` records short-lived durable snapshots with discovered/new/updated/unchanged counts plus normalized availability counts/change detection. `Sync Changes` consumes the exact snapshot; Full Rescan performs fresh discovery.
  - Vendor availability is supply-eligibility metadata, not Modulex warehouse inventory. Normalized states are `AVAILABLE`, `OUT_OF_STOCK`, `UNAVAILABLE`, `UNKNOWN`, and `MISSING`; content/discovery hashes remain separate from availability hashes so stock-state changes do not manufacture content edits.
  - `MISSING` is fail-safe: only an authoritative unscoped full discovery may advance the miss counter, and two successful misses are required before the state becomes `MISSING`. Category-scoped runs and the Ruvati sitemap fallback never mark unrelated catalog rows missing, and canonical products are never auto-deleted.
  - Linked canonical SKUs can be vendor-deactivated when the vendor is no longer sale-eligible. Automatic reactivation is allowed only when Modulex can prove the canonical status has not been manually changed since the vendor-driven deactivation; otherwise `reactivation_requires_review` preserves the manual-override boundary.
  - Sellable vendor SKU identity remains canonical. Conservative family grouping maps variants such as `SQS200BL/GR/WH` to common `base_product_code=SQS200` while preserving separate canonical SKUs/color identity.
  - Approval requires persistent vendor category → active Modulex Category + Product Type + allowed UOM mapping. Missing mappings fail closed; Admin may select an existing Category or explicitly create one with an editable name, then save the mapping and continue approval.
  - Approval is restricted to `AVAILABLE` + review-eligible rows and remains server-only for the `APPROVED` transition and canonical link. Unavailable/unknown/missing rows remain visible for tracking but cannot be imported.
  - Approval downloads all images only at that boundary, optimizes them to WebP in `store-media`, creates/links canonical products, and creates/reuses draft Store family content without setting Modulex selling price or publishing.
  - `/products/vendor-imports` uses server-side pagination (25/50/100), search, vendor/category/review/change/availability/linked filters, family/SKU approval, legacy Complete Import, shared Alerts, Product/Store edit links, row/header checkboxes, filtered Select All, and `Approve Selected` progress.
  - Bulk approval resolves eligibility server-side, sends at most 5 products per request, and processes each server batch with concurrency 2. Unavailable, review-ineligible, or unmapped rows are skipped fail-closed instead of being imported.
  - Fresh branch verification run `33621807160` passed Vendor Catalog, approval-idempotency and availability contracts plus TypeScript, lint, and production build on head `fe4e0b512e41dca2d4eaef37e212b569918dbecf`; current `main` was then merged without Vendor Catalog conflicts.
  - Canonical migrations: `20260902093000_vendor_catalog_sync_family_v3.sql` and `20260902113500_vendor_catalog_availability_bulk_approval.sql`. Both remain intentionally **unapplied before merge**; keep this row `[~]` until post-merge migration, advisor review, Admin deploy, and signed-in production acceptance complete.

This document is the operational source of truth for `modulex-admin` delivery planning and status. It is designed to survive chat/session boundaries and must be kept current as implementation progresses.

## GC-6 Cabinet Content cross-roadmap status

- [x] Add Admin-managed Cabinet Planning process and FAQ content.
  - `/store/cabinet-content` manages typed process/FAQ records under `store.manage` with explicit draft/publish/unpublish/delete behavior and source attribution metadata.
  - `cabinet-process` page-level copy, CTA and SEO remain managed through the existing Store Pages editor rather than a parallel page system.
  - Production schema/data and Admin scoped lint + production build are verified.
  - Live `/cabinet-process` acceptance is complete: HTTP 200, 4 process steps, 6 FAQs, CTA, FAQ structured data and sitemap inclusion verified on production.

## GC-7 Reviews & Social Proof cross-roadmap status

- [~] Add Admin-managed, source-attributed Store review excerpts.
  - `/store/reviews` is protected by `store.manage` in both sidebar and direct-route RBAC.
  - Parent-attributed records require source entity, HTTPS source URL and visible attribution before they can be valid public content.
  - Production contains two curated source-linked Granite & Cabinet Center excerpts; no third-party widget or inferred rating is used.
  - Admin RBAC, scoped lint and production build are verified.
  - PR #167 is merged on `main`; live Store homepage acceptance remains a separate verification item.

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
10. If a change spans Store and Admin, **both `modulex-admin/ADMIN_ROADMAP.md` and `modulex-store/STORE_ROADMAP.md` must be reviewed and updated where affected**.
11. Because Modulex work may run in parallel conversations, every new implementation package must re-read current `main` and this roadmap before branching; never rely on a remembered base SHA.

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
- For Oakwell public-site content, Admin is the management surface for mutable production business data. Granite migration domains must follow **Admin → Supabase DB/Storage → narrow public projection → Store**; ordinary business content changes must not require Store source-code edits or manual SQL at final acceptance.
- Existing Store CMS/company settings foundations must be extended incrementally with typed domains when needed; do not create a parallel migration-only CMS or unrestricted generic page builder.
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
  - Removed `/alerts`, `/avatars`, `/badge`, `/buttons`, `/images`, `/modals`, `/videos`, `/bar-chart`, `/line-chart`, `/form-elements`, `/basic-tables`, `/blank`, `/calendar`, `/api-test`, and the explicit TailAdmin `/error-404` route.
  - Removed the `API Test` System navigation entry.
  - **Done when:** no generic TailAdmin sample page is reachable through normal Admin navigation unless explicitly required.

- [x] Audit dashboard widgets for template/sample data.
  - Existing Modulex dashboard KPIs and recent stock movements are sourced from production RPCs (`get_dashboard_kpis`, `get_recent_inventory_movements`); no invented metric values were found.
  - Dashboard Quick Actions now resolve the active profile and reuse `canAccessPath()` so unauthorized/dead shortcuts fail closed while KPI loading remains independent.
  - TDD evidence: Actions run `33253263982` failed on the missing profile/route guard before implementation; targeted GREEN run `33253331280` passed the expanded production-surface contract.
  - Full package verification: `33253394213` passed production-surface, RBAC, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, production build, and diff-check.

- [x] Audit placeholder links, sample text, fake metrics, dead buttons, and development-only controls across Admin.
  - Retained production shell/auth/profile/settings/roles surfaces were reviewed in this bounded A0.1 pass; no additional fake dashboard metrics or dead actions were found in scope. Personnel, Finance, Approvals, and Training remain explicit A6 classification work rather than being silently removed here.
  - Removed the explicit `/error-404` TailAdmin template route, rebranded the global Next.js 404 as Modulex Admin, and removed the `info@dasoft.me` sign-in prefill in favor of an empty production login field.
  - `smoke:production-surface` now prevents the explicit template 404 route, TailAdmin branding in the global 404, and the known developer-account prefill from returning.
  - TDD evidence: Actions run `33254287380` failed on the still-present explicit TailAdmin 404 route before implementation; targeted GREEN run `33254350807` passed after the bounded fixes.
  - Full package verification: Actions run `33254494898` passed production-surface, RBAC, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check.

- [x] Add an Admin production-surface contract test.
  - `scripts/admin-production-surface-contract.mjs` blocks the known demo route files and `/api-test` navigation, protects the intentional `/profile` surface, and guards the production 404/login shell against known template/developer residue.
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
- [x] Gate warehouse-structure list-page mutation controls and handlers with `warehouse.manage`.
  - Post-merge Codex review on PR #103 identified a P1 gap: `/warehouses`, `/zones`, and `/locations` correctly remained readable through `warehouse.view`, but their list components still exposed mutation controls/handlers to read-only roles.
  - Add/Edit, activate/deactivate, delete, and double-click edit behavior now fail closed unless the active profile has `warehouse.manage`; read-only navigation such as Warehouses → Zones and Zones → Locations remains available.
  - TDD evidence: run `33251261334` failed 12/13 on the missing list-page mutation guard before the fix; targeted GREEN run `33251331146` passed 13/13 RBAC checks after the fix.
  - Full verification run `33251372987` passed RBAC, production-surface, secondary CMS, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint (0 errors / 35 existing warnings), Next.js production build, and diff-check.
- [x] Document role expectations for `super_admin`, `admin`, `sales`, `finance`, `hr`, `warehouse`, and `shipping`.
  - Role expectations, route families, mutation rules, aliases, and enforcement layers are documented in `docs/ADMIN_RBAC_MATRIX.md`.
  - TDD evidence: run `33249649439` failed on the pre-fix parity gaps; targeted GREEN run `33249708946` passed 12/12 RBAC checks.
  - Full verification run `33249988130` passed RBAC parity, production-surface, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check.

## A0.3 Runtime/config cleanup

- [x] Align package metadata/name with Modulex Admin rather than template identity.
  - `package.json` and the root package entries in `package-lock.json` now use `modulex-admin`; dependency versions and the lock graph remain unchanged.
- [x] Review `.env.example` and runtime environment requirements.
  - `.env*` is ignored by default with an explicit `!.env.example` exception, and the tracked example remains value-free while documenting browser-safe, server-only, and local/CI smoke variables.
  - `docs/ADMIN_RUNTIME_CONFIG.md` is the runtime/environment ownership contract and `npm run smoke:runtime-config` guards it.
- [x] Review Vercel production configuration and Admin subdomain assumptions.
  - Verified deployment metadata identifies Vercel project `modulex`, root directory `modulex-admin`, production branch `main`, and a `READY` production deployment. Hostname/custom-domain aliases remain Vercel configuration-owned and are not hardcoded in source.
  - The connected project/domain-detail endpoint did not expose the custom-domain alias during this package, so no unverified hostname is recorded as canonical; `NEXT_PUBLIC_SITE_URL` is the deployment-owned Admin origin.
- [x] Ensure no client bundle can receive Supabase service-role/secret credentials.
  - The browser client remains limited to `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the elevated client remains `server-only`, prefers `SUPABASE_SECRET_KEY`, and retains `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback.
  - The runtime-config contract fails if privileged key/password/DB variables are introduced with `NEXT_PUBLIC_`, if the browser client references elevated Supabase keys, or if the elevated client loses its server-only boundary.
  - TDD evidence: Actions run `33255658800` failed on the legacy package identity before implementation; targeted GREEN run `33255818899` passed the runtime-config contract with the minimized lockfile identity delta.
  - Full deterministic verification: Actions run `33255912909` passed runtime-config, production-surface, RBAC, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check. Credential-bound API/DB live smoke was not rerun because this package changes no schema, RLS, RPC, API, or production data behavior.
- [x] Close post-merge Codex runtime/config findings before Phase A0 exit.
  - PR #113 merged as `f6d7f9673dc874b5c254e47c750ff1bd4793c7c3`; Vercel deployment `dpl_5jbrwJDsdJv3FtXuMhfsstX7DY6k` is production `READY` from that exact merge SHA.
  - Post-merge Codex review found a P1 gap in source-wide privileged `NEXT_PUBLIC_*` detection and a P2 gap in Store activation-origin configuration/fallback handling.
  - Follow-up scope: strict source-wide browser-safe env allowlist, configuration-owned `STORE_SITE_URL` / `NEXT_PUBLIC_STORE_URL`, removal of the legacy `oakwell-phi.vercel.app` fallback, and fresh deterministic verification.
  - TDD RED: Actions run `33256670583` proved the previous runtime contract did not reject an injected `NEXT_PUBLIC_DATABASE_URL` source reference.
  - Targeted GREEN: Actions run `33256841429` rejected the negative fixture and passed the positive runtime-config contract.
  - Full deterministic verification: Actions run `33256903655` passed runtime-config, production-surface, RBAC, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check.

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
  - A0.2 route-permission parity, negative direct-URL cases, and warehouse-structure list mutation UI guards passed in full verification runs `33249988130` and `33251372987`; data authorization remains independently enforced by RLS/RPC/API contracts.
- [x] No known TailAdmin demo/sample route remains exposed unintentionally.
  - Production-surface contract plus the production build guard the removed route set, Modulex-branded global 404, and empty production sign-in state.
- [x] Phase A0 production acceptance is deployed on current `main`.
  - PR #114 merged as `978df97c9fd56e75eed2c5d1972d7b86fbc07fcd`; its final Codex review found no major issues.
  - PR #115 then advanced `main` to `e1bb780b1c5bbaed3bca4a5e82bebec5c010365`; Admin Vercel production deployment `dpl_47gPYNow2GpAeQwGnLRVBYQBTr61` is `READY` from that exact SHA and serves `admin.oakwellcabinetry.com`.

---

# Phase A1 — Customer, Order & Fulfillment Operations

**Goal:** Make Admin the complete operational control plane for customer lifecycle, orders, shipments, installations, invoices, and portal visibility.

## A1.1 Customer master record

- [x] Review customer list/search/filter scalability and pagination.
  - A1.1A moved customer rows, search, status/type/price-group/country/sales-rep/portal filters, exact filtered count, and page windows to the Supabase query layer; the browser no longer downloads the full customer table and slices it locally.
  - Lookup-name search remains supported by resolving matching customer-type, price-group, and sales-rep IDs before building the server-side OR filter. Search is debounced and query values are sanitized for the raw PostgREST `.or()` syntax.
  - Filter/page/page-size state round-trips through URL query parameters so operational views can be shared and revisited. Country remains a two-letter code filter, avoiding an all-row country-facet download.
  - Summary cards now use count-only (`head: true`) queries and remain global rather than becoming page-local metrics.
  - `scripts/customer-directory-contract.mjs` is wired as `npm run smoke:customer-directory` and into the main Admin smoke chain.
  - TDD RED: Actions run `33257591106` failed because the legacy directory had no exact server-side count/pagination contract. Targeted GREEN: run `33257782375` passed after the query-layer migration.
  - Full deterministic verification: Actions run `33257875905` passed runtime-config, production-surface, customer-directory, RBAC, secondary CMS Admin, dealer onboarding, dealer portal Admin, Store portal Admin, auth recovery, polling, lint, Next.js production build, and diff-check; post-closeout verification run `33258088112` repeated the same suite successfully on the committed roadmap closeout.
  - Production schema/RLS/RPC/data were not mutated by A1.1A; existing customer status/type/price-group/sales-rep indexes remain the query foundation. Mutation validation/audit and atomic default-address work remain intentionally separated into A1.1B/C.
- [x] Review customer detail information architecture and action hierarchy.
  - A1.1C removed the route-level CSS that hid a duplicate legacy portal tab and made the hierarchy explicit: customer operations → core customer card → secure Store portal lifecycle → documents.
  - PR #122 merged as `8ad3eaa928f2955fdcd0b4ae5c646f1f19101796`; Admin Vercel production deployment `dpl_3rXooxJDgD7rtbecjymSVuVDi83p` is `READY`. Current `main` has since advanced to `98ca9f264fbae5a039ec117877842e0ca5287c0e` through GC-2C and remains production `READY`.
- [x] Verify customer status/account-type changes have explicit validation.
  - A1.1B moves General customer-master saves to a validated RPC and adds DB-level status/type guards so direct table updates cannot bypass lifecycle rules. Converted customers cannot return to prospect; changed customer types must be active.
  - Production migration `20260829155809_customer_master_mutation_contract` is present on Supabase. Live catalog verification confirmed the guard/audit triggers are enabled, the public RPC is `SECURITY INVOKER` with an empty `search_path`, and RPC execution is granted to `authenticated` while revoked from `anon`/`public`.
  - Production acceptance used an authenticated Admin context inside an explicit transaction and rollback: a valid RPC save produced the expected `customer_master_updated` audit entry, a direct non-prospect → prospect update was rejected, and assignment of a transaction-only inactive customer type was rejected. No test customer/type mutation persisted.
  - PR #119 is included in current `main` `8998871b81d0e41840fd67d7af66c835e4b5840b`; Admin Vercel production deployment `dpl_214r7D8Dhy9bBzEmbkuGTgvXnTYx` is `READY` from that exact SHA.
- [x] Verify portal-enabled changes use the secure lifecycle API consistently across all customer-detail surfaces. (A1.1C)
  - The duplicate browser-DML Web / Portal surface is removed; portal enable/disable and portal-user lifecycle remain only in the dedicated Admin server API surface.
  - Production acceptance confirmed the deployed customer-detail surface contains the A1.1C merge while portal lifecycle mutations remain server-mediated.
- [x] Verify address management and default-address behavior. (A1.1C)
  - Production migration `20260829165525_customer_address_integrity` installed `create_customer_address(...)` and `set_customer_address_default(...)` as `SECURITY INVOKER` RPCs with an empty `search_path`; execution is granted to `authenticated` and revoked from `anon`/`public`.
  - Live acceptance used an authenticated Admin context inside an explicit transaction and rollback. Two compatible addresses were created, billing/shipping defaults were moved atomically to the requested address, exactly one active default of each kind remained, and the expected `customer_activity` rows were written in the same transaction.
  - A profiles-less authenticated caller was rejected with `42501`. Rollback verification confirmed zero acceptance addresses and zero acceptance activity rows persisted.
  - Post-DDL Supabase advisors reported no A1.1C-specific security or performance finding; remaining Store SECURITY DEFINER warnings, leaked-password protection, unindexed-FK/unused-index backlog, and Store permissive-policy warnings are outside this package.
- [x] Add/confirm audit visibility for sensitive customer master changes.
  - A1.1B adds an atomic AFTER UPDATE audit trigger with changed field names plus status/type from/to metadata, without full-row PII snapshots.
  - Production acceptance confirmed the audit is written in the same transaction as the customer-master update and is rolled back with the mutation. Post-DDL Supabase advisors reported no A1.1B-specific security or performance finding; unrelated Store security warnings and existing performance advisory items remain outside this package.

## A1.2 Orders

- [~] Route order products through dynamic Product Type + UOM + `pricing_model`.
  - Price Group lines remain server-authoritative through canonical `product_prices`; ordinary Countertop Material Band and No Commercial Pricing lines fail closed, while configured Stone continues through `calculate_countertop_price` → `attach_countertop_configuration`.
  - Semantic Product Type/UOM snapshots are immutable unless product identity changes; Stone commercial writes require the private canonical-attach transaction gate; deferred item mutation triggers reconcile header totals from stored line totals.
  - Production migration `20260901130000_order_product_pricing_v2` is applied and structurally/advisor verified. Production Admin still serves the pre-#217 UI, so signed-in feature acceptance and deployment remain pending; do not mark complete before those gates pass.

- [~] Add explicit configured Countertop Replace/Remove workflow to Draft order revisions.
  - PR #248 makes configured Countertop quantity/discount non-generic, removes the misleading generic Remove path, and exposes dedicated **Replace Countertop** / **Remove Countertop** actions only on Draft orders with `orders.manage`.
  - Replace preserves the existing `order_item_id` and reuses the canonical `calculate_countertop_price` → `attach_countertop_configuration` path. Remove uses a dedicated authenticated Draft-only RPC backed by a private `SECURITY DEFINER` function, requires a matching `countertop_configurations` row, releases reservation through the existing DELETE trigger, relies on the existing DEFERRABLE totals reconciler, and writes `customer_activity` atomically.
  - Production prerequisite review confirmed `countertop_configurations.order_item_id` is `ON DELETE CASCADE`, the reservation-release and totals triggers are present, and `customer_order_items.line_no` requires only positive order-unique values. Remaining line numbers therefore stay stable after removal so unrelated Cabinet rows are not UPDATEd and accidentally repriced by the global pricing trigger.
  - Generic `update_customer_order` errors for configured Countertop mutation/removal remain unchanged and fail closed. Store public/Customer/Dealer projections are unchanged; the Store migration directory contains only the shared DB deployment mirror.
  - TDD RED is recorded in Admin A1 Core Operations run `33617490217`. Functional GREEN evidence on head `7f0eff31fd8b35b6a98564d13c57b16a442f9fe2`: Admin A1 Core Operations `33618763836`, Admin Customers UI `33618763728`, and Admin UI Foundation `33618763854`; strict changed-file UI, Countertop domain/UI, order Countertop context/initiation, order domain/lifecycle, RBAC, typecheck, lint, Store portal boundaries, and production builds passed.
  - Migration `20260902114500_countertop_replace_remove` is source-controlled but intentionally **unapplied before merge**. Keep this row `[~]` until PR merge, production migration, Supabase Security + Performance Advisor review, Admin deploy, and signed-in Replace/Remove acceptance are complete.

- [x] Review global and customer-scoped order list consistency. (A1.2A)
  - Both `/customers/orders` and `/customers/[id]/orders` use the shared `CustomerOrdersList` contract with server-side search/status filtering, exact filtered count, page windows, URL state, and route-scope summary aggregation.
  - PR #130 repaired the earlier stacked-PR base error and merged A1.2A to `main` as `f9d9571c70e911ee41c588e2ff8bd17a9a351a05`; Vercel Admin production deployment `dpl_699J47YQfSx3fW9bvkEAAC9c8eo` is `READY` from that exact SHA.
  - Production migration `20260829193058_customer_order_list_summary` installed `customer_order_directory` with `security_invoker=true` and authenticated-only SELECT plus `get_customer_order_list_summary(uuid)` as SECURITY INVOKER / STABLE with an empty `search_path` and authenticated-only EXECUTE.
  - Read-only authenticated Admin acceptance verified 5/5 direct-vs-directory RLS-visible rows, working order/customer-code/customer-name searches, 1/1 scoped rows, and exact global/scoped summary parity. A profiles-less authenticated caller saw 0 directory rows and a zero summary, confirming underlying RLS remains authoritative.
  - No production data writes were made during acceptance. Post-DDL Supabase advisors reported no A1.2A-specific security or performance finding; existing Store SECURITY DEFINER/auth warnings and broader FK/index/policy performance backlog remain outside this package.
- [x] Verify create/edit/detail flows use one domain contract. (A1.2B)
  - PR #135 merged the shared Admin order-domain adapter to `main` as `e04425c0bd6c7ae0bf7df4fc447c90ed2e8809af`; `NewCustomerOrder`, `EditCustomerOrder`, and `CustomerOrderDetail` now consume `src/lib/customers/order-domain.ts` for scoped context reads, price reads, mutation payload normalization, and Supabase error propagation while preserving the existing database mutation boundaries.
  - TDD evidence: RED Actions run `33272031540` failed on the missing shared adapter; targeted GREEN run `33272225887` passed the new order-domain contract; final deterministic verification run `33272334038` passed order-domain/order-list/customer-detail/production-surface smoke checks, lint with 0 errors, production build, and diff-check after fixing the TypeScript narrowing regression exposed by the first full run.
  - Admin Vercel production deployment `dpl_EZnRkBzEpnU4quNdKPS2XAWaQy86` and Store deployment `dpl_Gq24GKZyrTZiL2xu1cE7KLzALVth` are both `READY` from exact merge SHA `e04425c0bd6c7ae0bf7df4fc447c90ed2e8809af`.
  - Read-only authenticated Admin acceptance verified the adapter's production query surface under existing RLS: the scoped customer/order resolved 1/1, the sample order exposed 3 items plus status history, and shared create/edit lookups returned 6 order price groups, 3 active payment methods, 462 products, 3 tax rules, and 462 current price rows. A profiles-less authenticated caller saw 0 profile/customer/order/item/approval rows.
  - Catalog verification confirmed `create_customer_order`, `update_customer_order`, and `set_customer_order_status` remain SECURITY INVOKER (`prosecdef=false`), use `search_path=pg_catalog, private`, allow authenticated EXECUTE, and deny anon/PUBLIC EXECUTE. No production mutation RPC was invoked during acceptance, no production data was written, and A1.2B required no Supabase DDL or migration.
- [x] Define immutable vs editable fields by order lifecycle state. (A1.2C)
  - PR #139 merged to `main` as `406bd374a4b4a7738a1a785709f3b277d21e4410`; Admin Vercel production deployment `dpl_CP331iPmZH2KdnJw1YURTfJjFX8i` is `READY` from that exact merge SHA, and the deployed `/signin` surface returned HTTP 200.
  - Production migration `20260829205817_customer_order_lifecycle_editability` installed the private lifecycle policy and hardened order-update wrapper. Live policy checks returned Draft Sales=`direct`, Confirmed Sales=`approval`, Ready for Shipment Admin=`direct`, and Shipped/Completed/Cancelled/null-role=`locked`.
  - Transaction-scoped authenticated acceptance proved a temporarily `shipped` order rejects commercial revision and a profiles-less authenticated subject is denied; both tests rolled back and the sample order remained `draft` with no acceptance-test data persistence.
  - Post-DDL security/performance advisors reported no A1.2C-specific new finding; unrelated existing Store/security and index/policy backlog remains separately tracked.
- [x] Add validation for quantity, product/variant validity, pricing source, tax/shipping fields, and status transitions.
  - Production migrations `a1_core_operations_hardening`, `a1_order_confirmation_validation`, `a1_order_legacy_progression_compatibility`, `a1_fulfillment_order_status_compatibility`, and `a1_order_product_lifecycle_compatibility` install DB-authoritative line/commercial guards plus explicit order/shipment/installation transition policies. Draft orders may remain incomplete, while new confirmation validates fulfillment readiness; historical Confirmed orders are not retroactively blocked by status-only progression.
  - Transaction-scoped production acceptance proved Draft → Shipped is rejected and a legacy Confirmed → In Preparation progression is allowed; all acceptance writes were rolled back.
  - TDD evidence: RED runs `33304214076`, `33304574072`, and `33304725633` caught missing compatibility guards; final GREEN run `33304761896` passed the A1 contract, order regressions, Admin portal regression, RBAC, Admin lint/build, Store portal boundaries, scoped Store lint and Store production build.
- [x] Verify customer portal order projections remain narrower than Admin order data.
  - Store `smoke:store-portal` continues to reject monetary/internal fields such as unit price, totals, payment commission and internal notes from the customer portal projection.
  - Fresh A1 Store boundary verification passed in Actions run `33304311685`.

## A1.3 Shipments

- [x] Review shipment creation/edit/status workflow.
  - Shipment creation remains reservation-backed; source quantity/location edits remain limited to Draft/Picking. The operational lifecycle is now fail-closed as Draft → Picking → Packed → Shipped → Delivered, with cancellation allowed only before shipment.
  - Admin actions now expose only valid next workflow operations; Draft can no longer jump directly to Packed or Shipped. Shipment RPCs also preserve later order lifecycle states (`installation_scheduled`, `installation_in_progress`, `completed`) instead of regressing the order when ship/deliver events arrive.
- [x] Verify shipment-to-order/customer associations.
  - `a1_customer_shipment_guard` rejects shipment rows whose customer does not match the source order; existing reservation/source-location checks remain authoritative for shipment lines.
- [x] Define tracking/carrier/reference fields and status transition rules.
  - `shipment_number` remains the canonical immutable shipment reference. Carrier, service level and tracking number remain optional operational metadata captured at ship time so local-delivery flows are not forced into carrier semantics. Status progression is enforced in DB and mirrored by Admin actions.
- [x] Verify only approved fulfillment fields are exposed to portals.
  - Store fulfillment contracts continue to exclude source warehouse/location IDs, stock-deduction metadata and internal notes; fresh portal boundary verification passed in final Actions run `33304761896`.

## A1.4 Installations

- [x] Review installation scheduling/status workflow.
  - Installation mutations now use controlled private cores behind authenticated `SECURITY INVOKER` public wrappers. Admin workflow is Scheduled → Confirmed → In Progress → Completed, with cancellation available before completion.
  - Production rollback acceptance proved Scheduled → Completed is rejected while Scheduled → Confirmed succeeds.
- [x] Define installer/contact/location/date fields and transition rules.
  - `assigned_to` remains an internal staff identifier; team/contact fields are operational appointment metadata; the installation location remains the order-derived address snapshot. Scheduled start is required and scheduled end, when supplied, must be after start. Status transitions are now explicit and fail closed.
- [x] Verify portal installation visibility and neutral foreign-ID behavior.
  - Existing portal installation RPCs remain customer-scoped, omit internal assignment/notes fields, and return neutral `installation_unavailable` behavior for foreign/non-visible IDs; fresh Store portal experience contract passed in Actions run `33304311685`.

## A1.5 Invoices and payments boundary

- [x] Review current invoice list/detail/print behavior.
  - Existing invoice list/detail/print surfaces and issue/paid/void workflow remain the active A1 financial operations surface; A1 hardening did not widen portal visibility or bypass invoice approval rules.
- [x] Keep Order/Invoice A4 print and direct-PDF detail aligned with immutable Countertop snapshots.
  - PR #247 reads the existing `countertop_configurations.pricing_snapshot` for Order items and uses Invoice `order_item_id` linkage to render Material/Area/Band, Edge, Sink, Services, and any saved line note in both browser print and direct PDF. PDF line height/pagination now accounts for wrapped detail rows, and Logo 2 uses a dedicated normalized box with whitespace trimming for PDF assets.
  - No schema, RLS, RPC, pricing, or production-data mutation is introduced. Countertop-detail reads remain under the existing RLS boundary and fail soft so an otherwise-authorized document print remains available even when that optional detail projection is not readable for a role.
  - TDD RED is recorded in Admin Commercial Documents UI run `33610771763`; branch GREEN verification on functional head `a4907086740c1c3c55de2b781c1aac6813075577` passed Commercial Documents `33611901990`, Admin A1 Core Operations `33611901985`, Admin Customers UI `33611901993`, Admin UI Foundation `33611902001`, GC-6 `33611902033`, and GC-7 `33611901999`.
  - Production acceptance is closed on 2026-09-02: PR #247 and Logo 2 follow-up #251 are merged, current-main Admin deployment is `READY`, the real Countertop Order print route returns HTTP 200, production contains real immutable Countertop snapshot data, and the inspected runtime/advisor results show no Commercial Document-specific blocker. Production currently has no naturally linked Countertop Invoice item, so no synthetic production invoice was created; the Invoice path is accepted through the shared source contract, production `order_item_id` linkage, and passing CI. Detailed evidence: `docs/acceptance/commercial-documents-production.md`.
- [x] Define whether payment methods/payment records are active scope or intentionally deferred.
  - Payment Methods remain active order/invoice commercial configuration. Invoice `paid_amount`/status remains the current payment-recording boundary; a standalone payment transaction ledger is intentionally deferred beyond A1.
- [x] Keep portal invoice/payment visibility out of scope until explicitly approved.
  - A1 creates no Store portal invoice/payment RPC, projection or navigation surface; the permanent A1 contract guards this boundary.
- [x] Verify financial fields are protected by appropriate roles.
  - Admin permissions retain `invoices.view` / `invoices.manage`; Finance retains invoice management while portal projections continue excluding order financial/internal fields. Fresh RBAC and portal boundary tests passed in Actions run `33304311685`.

### Phase A1 Exit Gate

- [x] Customer → order → shipment/installation lifecycle can be operated without manual SQL.
  - Existing Admin create/edit/detail operations now sit on the hardened RPC/DB lifecycle contracts; production acceptance used the same mutation boundaries and required no persistent manual data correction.
- [x] Invalid status transitions are prevented or explicitly handled.
  - Rollback-only production acceptance passed six lifecycle assertions: valid order/shipment/installation next steps succeeded and Draft → Shipped, Draft shipment → Packed, and Scheduled installation → Completed were rejected. Production row-status counts were unchanged after rollback.
- [x] Portal-visible projections expose only approved fields.
  - Fresh Store order and fulfillment portal contracts passed in final Actions run `33304761896`, protecting financial, source-stock, assignment and internal-note boundaries.
- [x] Core customer/order/fulfillment smoke coverage exists.
  - `smoke:a1-core-operations` is permanent in the Admin smoke chain and `.github/workflows/admin-a1-core-operations.yml` runs A1, order-domain/lifecycle, portal, RBAC, lint and production-build verification across Admin and Store.
  - Final post-DDL Supabase Security/Performance Advisor review found no A1-specific new finding. Rollback acceptance also proved inactive products cannot confirm and left all 462 production products Active; unrelated existing Store/support/HR/index backlog remains outside A1.

---

# Phase A2 — Inventory, Warehouses & Physical Operations

**Goal:** Make stock state trustworthy across warehouses, zones, movements, scanning, low-stock, and labels.

## A2.1 Warehouse/location model

- [x] Review warehouses CRUD and role restrictions.
  - Production retains Admin-only location creation while the warehouse role keeps the narrow QR-update path; `private.guard_location_master_role()` prevents warehouse-role changes to location master fields. Current production contains the expected A2 location policies and guard trigger set.
- [x] Review locations/zones hierarchy and data integrity.
  - Production contains the A2 hierarchy/parent-state triggers for zones, locations, and inventory, and `smoke:a2-warehouse-integrity` is GREEN in Actions run `33312699819`.
- [x] Prevent deletion/deactivation that would orphan active stock without an explicit migration path.
  - Production contains warehouse/zone/location deactivation guards, and the inventory/warehouse/location plus movement provenance foreign keys resolve with `ON DELETE RESTRICT`.

## A2.2 Inventory and movements

- [x] Review inventory list filters/search/pagination.
  - PR #173 moved inventory discovery to `search_stock_page` with server-side query, warehouse/zone/location/status filters, deterministic SKU/location/inventory ordering, exact window total, and 25-row pagination. Desktop inventory labels physical quantity as **On Hand**.
  - Production acceptance confirmed the paginated RPC is installed and returns a 25-row window with the exact 463-row production total.
- [x] Define stock-on-hand, reserved, available, damaged/hold semantics if not already explicit.
  - A2.2 defines `inventory.quantity` as physical On Hand, `reserved_quantity` as allocated stock still physically present, and `available = on_hand - reserved`. Low-stock classification is based on available quantity versus `products.min_stock_level`.
  - Operational holds use reserved quantity with explicit audit context. A2.2 does not introduce a separate damaged bucket; damaged stock must leave usable inventory through an explicit audited stock mutation rather than remaining silently available.
- [x] Review stock movement types and required references/reasons.
  - New A2.2 writes require a non-empty reason. `reference_no` remains optional because not every warehouse operation has an external document, but is stored when supplied; movement actor/time/reason/reference remain part of the ledger.
  - Automatic reversal is deliberately limited to `in`, `out`, `transfer`, `reservation`, and `release`; ambiguous legacy `adjustment`, `return`, and `damage` movements are not guessed.
  - Production ledger acceptance confirms 4 existing movement rows and 0 null/blank reasons.
- [x] Require idempotent or guarded writes for repeated scan/operation requests where relevant.
  - PR #173 adds idempotent stock-in/out/transfer/reserve/release RPC contracts with client UUID keys, server-generated canonical JSONB fingerprints, advisory transaction locks, same-payload replay, and changed-payload conflict behavior. Desktop and guided-scan flows both pass the idempotency key.
  - Rollback-only production acceptance proved same-key/same-payload replay returns the existing movement, changed-payload reuse fails with SQLSTATE `22023`, and reversal restores stock without leaving acceptance-test data behind.
- [x] Verify movement history is append-safe and auditable.
  - PR #173 adds an append-only UPDATE/DELETE trigger, removes application UPDATE/DELETE movement policies/grants, and records reversal links through compensating movement rows. Existing historical rows remain valid through nullable metadata.
  - The production bundle is applied in order: `a2-inventory-movements.sql`, `a2-inventory-movements-reversal-lock-fix.sql`, then the final `a2-inventory-movements-truncate-privilege-fix.sql` recorded by closeout PR #174.
  - Final least-privilege acceptance confirms `anon` and `authenticated` have no `TRUNCATE` privilege on `inventory_movements`; authenticated UPDATE and DELETE remain denied. This closes the RLS-bypassable table-level privilege gap without changing movement data.
  - TDD closeout RED: Actions run `33315567541` failed specifically because the TRUNCATE corrective migration was absent. GREEN run `33315626138` passes A2.1, A2.2, production-surface, RBAC, full lint, and the Next.js production build.
  - PR #173 is merged on `main` as `f0281e1e00ce3045c59cc7b0209ecfadf1855e9b`; its Admin Vercel production deployment is `READY` and serves the deployed Inventory surface. PR #174 is the repository closeout package for the final privilege regression/migration record.
  - Fresh post-DDL Supabase Security and Performance Advisor scans report no A2.2-specific new finding; unrelated existing Store/support/HR/index backlog remains outside A2.2.
  - **A2.2 production acceptance: complete.** Normal inventory discovery, quantity semantics, retry-safe writes, append-only movement audit, controlled reversal, production DB acceptance, advisor review, Admin deploy verification, and final TRUNCATE privilege hardening are all closed.

## A2.3 Stock operations and scanning

- [x] Review `/stock-operations` workflows.
  - The existing desktop form remains on the A2.2 idempotent RPC boundary for Stock In, Stock Out, Transfer, Reserve, and Release; it validates product/location/quantity inputs, Available/Reserved limits, source/target separation, and concurrent-submit state before writes.
  - Failed requests retain the same client idempotency key for safe retry; successful operations clear it. A2.3 introduces no parallel mutation path or schema change.
- [x] Review QR/barcode scan behavior, error handling, and duplicate scan protection.
  - `CameraScanner` suppresses the same decoded value for 2200 ms and serializes decode callbacks through `processingRef`; guided writes still rely on A2.2 idempotency as the final duplicate-submission guard.
  - Guided scanning rejects unsupported/malformed workflow inputs, inactive or missing products, ambiguous shelf codes, ineligible source shelves, identical transfer source/target shelves, insufficient Available quantity, and excessive Release quantity. `/scan` retains Manual Input / Hardware Scanner fallback through the same input router.
- [x] Review QR label generation/printing workflow.
  - QR Labels supports bulk A4, bulk label-printer, single A4 sign, and single-label output with 50 × 30, 60 × 40, and 70 × 50 mm label sizes. Printed values use the same canonical Zone/Location QR payload family consumed by scanning.
  - Read-only production acceptance found 6 active Zones and 2 active Locations, all with QR code + payload, with zero checked active duplicate Zone/Location QR identifiers. All 462 active products have barcode + product QR values, with zero duplicate active barcodes/product QR values.
- [x] Verify mobile usability for warehouse operations.
  - Scan and QR-label surfaces use mobile-first responsive grids/forms, 44px-class controls, environment-facing camera capture, vibration feedback where supported, and manual/hardware scanner fallback. Physical printer-model/device-farm certification is intentionally not claimed by this source/data acceptance.
  - Permanent acceptance: `scripts/a2-stock-operations-scanning-contract.mjs` + `docs/acceptance/a2-3-stock-operations-scanning.md` + `.github/workflows/admin-a2-stock-operations-scanning.yml`.
  - TDD RED run `33318262025` failed on the intentionally missing production acceptance artifact. GREEN run `33318383553` passes A2.3, A2.2, A2.1, production-surface, RBAC, lint, and Next.js production build.
  - Production inventory/movement mutation during A2.3 acceptance: **NONE**; read-only integrity checks also found zero negative/over-reserved inventory rows.

## A2.4 Low-stock and reporting

- [x] Define low-stock threshold source of truth.
  - `products.min_stock_level` is authoritative; `0` means not configured. A configured product is low only when A2.2 Available (`On Hand - Reserved`) is less than or equal to the threshold.
- [x] Verify low-stock views use efficient queries/indexes.
  - The A2.4 SQL package keeps security-invoker views, adds narrow paginated/filterable reporting RPCs with exact counts and deterministic ordering, and adds movement created-at/from/to warehouse indexes.
- [x] Review inventory and movement reports for correctness and export needs.
  - Inventory/location/movement and low-stock CSV paths page through bounded filtered RPC calls to the exact count rather than inheriting the former 1,000-row client ceiling. Permanent repository verification is `smoke:a2-low-stock-reporting` plus `.github/workflows/admin-a2-low-stock-reporting.yml`.
  - Production acceptance: `docs/acceptance/a2-4-low-stock-reporting.md` is PASS/CLOSED. Migration `20260830155834`, source/RPC reconciliation, Advisor review, authenticated browser route smoke, deterministic filtering/pagination, and complete CSV exports passed on deployment SHA `2d08d28`.

### Phase A2 Exit Gate

- [x] Stock-changing actions are validated and auditable.
  - A2.2 idempotent mutation RPCs, required-reason contract, append-only ledger, compensating reversals, and least-privilege table grants are production-verified and permanently regression-tested.
- [x] Warehouse/location integrity is enforced.
  - A2.1 guard triggers and restrictive FK behavior are present in production and covered by the permanent A2.1 contract.
- [x] Scan/label workflows pass device/mobile regression checks.
  - A2.3 permanently guards camera same-value cooldown/serialization, guided confirmation and error handling, manual/hardware scanner fallback, QR label print modes/sizes, responsive warehouse UI contracts, and A2.2 idempotent write boundaries.
- [x] Inventory reports reconcile against source records.
  - A2.4 production migration, RPC/source reconciliation, authenticated route smoke, and full filtered CSV exports passed on deployment SHA `2d08d28`.

---

# Phase A3 — Products, Catalog & Pricing Control

**Goal:** Make Admin the reliable source for product master data, Store publication, color/media content, pricing groups, and margin visibility.

## A3.1 Product master data

- [x] Review product create/edit flows and SKU/base-product/color relationships.
  - Product create/edit now treats one row as one sellable/stockable variant, exposes required `base_product_code` + `color_code` fields, keeps `color_name` descriptive, and preserves canonical SKU/barcode normalization and deterministic list behavior.
- [x] Verify category/brand management and referential integrity.
  - `brand_id` / `category_id` are canonical foreign keys with restrictive deletes, active-taxonomy guards, family consistency checks, case-insensitive taxonomy uniqueness, and synchronized legacy compatibility mirrors. Production brand mirror backfill closed the pre-existing 460 NULL legacy-brand values without changing canonical IDs.
- [x] Define activation/deactivation rules for variants already referenced by orders/inventory.
  - `set_product_status` is the authenticated SECURITY INVOKER lifecycle boundary; products with on-hand/reserved stock cannot be deactivated or archived, archived is terminal, physical DELETE is unavailable to application roles, and A1 active-product downstream rules remain authoritative.
- [x] Review bulk operations/import/export requirements.
  - Full filtered canonical product-master CSV export is implemented through bounded `get_products_page` pagination. Destructive bulk lifecycle mutations remain out of scope; bulk import is explicitly deferred until a validation-first dry-run importer can return row-level errors before writes.
  - PR #177 merged A3.1 as `a6679deed15d0869ec62928b2da182c8305b0883`. Production Admin deployment `dpl_BjCGMYhQ6auRp3KPP7euEAa58bEr` is `READY` on current `main` SHA `fd74962ee6eacd78de952520c26562e7b33d7f31`, which is a direct descendant of the A3.1 merge.
  - Production migrations `20260830184807_a3_1_product_master_data` and `20260830184940_a3_1_product_brand_mirror_backfill` are applied. Reconciliation is clean: 462 products, 0 missing canonical fields, 0 taxonomy mirror mismatches, and 0 duplicate SKU/barcode/family-color groups; product RPC total reconciles 462/462.
  - Authenticated Admin DB smoke passed under the real application role/RLS boundary; anon RPC execution and product DELETE remain denied. Fresh Supabase Security/Performance Advisor review found no A3.1-specific new finding.
  - Fresh CI evidence includes A3.1 + product-list + products/pricing contracts, A1/A2 regressions, RBAC 14/14, typecheck, lint with 0 errors, production build, and 8/8 PR-triggered workflows before merge.
  - Production `/products` returns HTTP 200 with the deployed A3.1 product bundle; no `/products` or `/products/new` Vercel runtime errors were found in the post-deploy acceptance window.
  - **A3.1 production acceptance: complete.** Detailed evidence: `docs/acceptance/a3-1-product-master-data.md`.

## A3.2 Store product publishing

- [x] Review `/store/products` publish/unpublish workflow.
- [x] Verify publish guards require sufficient product content/media.
- [x] Review Store slug uniqueness and change behavior.
- [x] Review media management: primary image, color-specific media, documents, video, alt text, sort order.
- [x] Review Store color management and swatches.

A3.2 implementation, migration, production deployment, authenticated route smoke, and RPC reconciliation are complete. Detailed evidence: `docs/acceptance/a3-2-store-product-publishing.md`.

## A3.3 Pricing

- [x] Review pricing dashboard, product pricing, groups, and cost-margin pages.
- [x] Define price-group lifecycle and effective-date behavior.
- [x] Verify Dealer Portal only sees assigned active groups with approved ordering visibility.
- [x] Ensure missing dealer-tier price never silently falls back to public/list price unless business rules explicitly change.
- [x] Add validation/audit coverage for price changes.

A3.3 implementation, production migration `20260830213328_a3_3_pricing_hardening`, rollback-only lifecycle/audit acceptance, authenticated pricing RPC acceptance, Dealer no-fallback boundary reconciliation, production pricing-route smoke, and post-migration advisor review are complete. Detailed evidence: `docs/acceptance/a3-3-pricing.md`.

Pricing UI v2 / Product Type routing above is an additive follow-up to this closed A3.3 foundation; it does not replace or reopen the A3.3 lifecycle/audit/Dealer boundary.

## Cross-cutting Admin UI hardening track (UI-2A → UI-2E)

- [x] UI-2A Responsive Shell foundation.
- [x] UI-2B shared Data Table System standardization.
- [x] UI-2C Theme / Design Tokens, dark mode, and accessibility normalization.
- [x] UI-2D Full Route Regression.
- [x] UI-2E Resolution Matrix production closeout through PR #223 / merge `ef48dc50029347829fd1d519c449ed38f8b87969`; supported matrix: 360, 390, 768, 1024, 1280, 1366, 1440, 1536, 1920, 2560 with the runtime mobile/desktop boundary at 1024px.

A3.3 Pricing is closed. UI-2A → UI-2E remains a parallel cross-cutting quality track and does not replace the functional roadmap.

## Countertop / Stone / Sink domain

- [x] Deliver the approved additive countertop thin slice.
  - MVP keeps `products` canonical, uses validated metadata for stone/sink attributes, tracks slabs by quantity with `unit = 'slab'`, and reuses existing inventory movements/reservations/idempotency.
  - The end-to-end slice must cover stone → price group/manual price → square-foot/linear-foot/edge/sink/services pricing → immutable order snapshot → existing order item → quantity-based slab reservation.
  - Individual slab identity, remnants, advanced fabrication optimization, Prima/Ruvati imports, and faucet-specific rules remain future extensions.
  - Five additive production migrations are applied and production-accepted. Authenticated Admin, Customer/Dealer safe projection, revision identity, canonical reservation reconciliation, rollback fixture cleanup, Security Advisor, and Performance Advisor checks all passed. Acceptance evidence: `docs/acceptance/countertop-stone-sink.md`.
- [~] Expose operational Stone and Sink catalog/pricing management directly in Admin.
  - PR #230 adds `/pricing/countertop/catalog` plus explicit Pricing navigation for **Countertop Catalog** and **Countertop Setup** so operators no longer need to bounce between Products, Countertop References, and Product Prices.
  - Stone create/edit keeps Product Master v2 canonical, writes the Stone profile atomically, and selects the existing B1–R22 `countertop_material_price_bands`; Order-level manual $/sq ft remains the explicit override path rather than creating a second catalog pricing model.
  - Sink create/edit keeps Product Master v2 canonical and writes USD `product_prices` through the existing append-safe bulk pricing RPC for every active order-eligible, non-internal commercial price group exactly once.
  - Product activate/deactivate stays on `set_product_status`; inactive Stone/Sink catalog products are excluded from Order Countertop dropdowns.
  - TDD RED is recorded in Actions run `33525475929`. Fresh branch CI on PR #230 passes Admin UI Foundation run `33526954540`, Admin Products Pricing run `33526954525`, and Admin A1/Store portal boundaries run `33526954604`.
  - Migration `20260901152500_countertop_catalog_product` is source-controlled but intentionally **not applied to production before merge**. Keep this row `[~]` until merge, production migration/advisor checks, deploy, and signed-in catalog acceptance are complete.

## Cross-cutting validation and data contract hardening track (VAL-1 → VAL-6)

- [x] VAL-1 — Validation & Data Contract Foundation.
  - `docs/ADMIN_VALIDATION_GUIDE.md`, root mutation/authorization guardrails, a reusable validation/data-contract smoke contract, and the domain audit method are established. Legacy form remediation is intentionally deferred. The foundation contract and Admin final gate pass; no schema or production data changes were required.
- [x] VAL-2 — Products & Pricing.
  - PR #188 is merged and included in the deployed Admin lineage. Production schema confirms `products.min_stock_level` is `numeric(12,2)`, product price/cost amounts are `numeric(18,4)`, and margin settings are `numeric(7,3)`, matching the shared validation contracts.
  - Authenticated super-admin rollback acceptance exercised the canonical `set_product_price` boundary with `0.0001`; the active row preserved the exact four-decimal value inside the transaction and returned to its original `0.0000` after rollback, leaving no production business-data mutation.
  - `set_product_price`, `set_product_prices_bulk`, and `set_product_costs_bulk` remain SECURITY INVOKER, authenticated-executable, and anon/PUBLIC-denied. `/products`, `/pricing/products`, and `/pricing/cost-margin` return production HTTP 200 with the expected Modulex bundles, and no runtime errors were found for those routes in the inspected 24-hour window.
  - Fresh Security + Performance Advisor scans show no VAL-2-specific blocker; existing unrelated project-wide advisor backlog remains separate. Detailed evidence: `docs/acceptance/val-2-val-4-production.md`.
- [ ] VAL-3 — Customers / Orders / Invoices.
- [x] VAL-4 — Inventory + Warehouses + Stock Operations.
  - PR #224 is merged and included in the deployed Admin lineage. Production schema confirms inventory on-hand/reserved quantities are `numeric(12,2)`, while warehouse code/name/type constraints match the client-side validation contract.
  - Authenticated super-admin rollback acceptance exercised `stock_in_idempotent` with quantity `0.01`; the transaction created one idempotent movement and adjusted inventory by exactly `0.01`, then rollback restored the original quantity and left zero acceptance movement rows.
  - Stock in/out/transfer/reserve/release RPCs remain SECURITY INVOKER, authenticated-executable, and anon/PUBLIC-denied. `/warehouses`, `/stock-operations`, and `/inventory` return production HTTP 200 with the expected Modulex bundles, and no runtime errors were found for those routes in the inspected 24-hour window.
  - Fresh Security + Performance Advisor scans show no VAL-4-specific blocker; existing unrelated project-wide advisor backlog remains separate. Detailed evidence: `docs/acceptance/val-2-val-4-production.md`.
- [ ] VAL-5 — Store CMS / Users / Settings / remaining Admin forms.
- [ ] VAL-6 — Full validation regression & production acceptance.

The VAL track is cross-cutting and additive: it does not overwrite the UI-2 track or functional Admin roadmap. Domain packages remediate validation debt only after a mismatch inventory and the database-contract-first audit described in `docs/ADMIN_VALIDATION_GUIDE.md`.

### Phase A3 Exit Gate

- [x] Product and Store publish state is deterministic.
- [x] Pricing changes are role-restricted and auditable.
- [x] Dealer pricing boundary tests pass.
- [x] Store catalog content can be managed without direct SQL.

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
  - Package C Store consumer implementation is verified in Store run `33244098018`: published-only About/Gallery queries, fail-closed Gallery readiness, conditional Navbar/sitemap exposure, and project media rendering now consume the Package A/B CMS foundation. About production content is published/live-accepted; Gallery remains intentionally closed until approved real project content exists.
- [x] Approve the broader Oakwell dynamic-content/CMS ownership architecture for Granite migration.
  - Design: `modulex-store/docs/superpowers/specs/2026-08-29-oakwell-dynamic-content-cms-design.md`.
  - Rule: mutable Store business content/media is Admin-managed Supabase DB/Storage data; Store consumes narrow public projections; production phone/address/hours/projects/media/reviews/FAQ/navigation/footer/SEO content must not be added as runtime hard-coded business constants.
  - Existing `store_pages`, `store_projects`, `store_project_media`, company/settings and lead foundations are extended incrementally rather than replaced.
- [x] Add draft/published workflow where required.
  - Pages and Projects expose separate Save draft / Publish / Unpublish actions; uploads do not auto-publish.
- [x] Add SEO/OG/media fields with validation.
  - Page hero/OG and project cover/OG uploads use `store-media` with JPEG/PNG/WebP/AVIF ≤20 MB validation; project media also supports external public video URLs with required alt text.
- [~] Review navigation/footer configurability needs.
  - Package D design keeps route behavior/allowlists code-owned while ordinary business-editable navigation/footer labels, order, visibility and approved destinations become `store.manage` CMS/settings data.
  - Granite GC-8 is the natural final coordination point unless an earlier migration package needs shared chrome sooner.
- [ ] Add/extend typed Store CMS domains as Granite packages require them.
  - GC-2A/GC-2C provide reusable media assets/provenance plus Admin review/publish lifecycle management; GC-2D now has a controlled Admin/Vercel Node intake path that uses the logged-in Admin JWT + existing RLS and writes only to private staging. Production import/review/publish lifecycle acceptance remains pending.
  - GC-3 may add structured contact/location/hours management around the existing company-profile domain.
  - GC-6 may add cabinet FAQ/process content domains.
  - GC-7 may add attributed reviews/testimonials.
  - Exact schemas are decided only in the package that first needs them after current production schema review.

## A4.2 Leads

- [x] Store lead list/detail surfaces exist.
- [ ] Review contact/dealer application filters, search, status, owner/assignment, notes, and conversion workflow.
- [ ] Verify lead attribution fields are useful but do not expose sensitive form values unnecessarily.
- [ ] Define retention/archive behavior.
- [ ] When GC-4 adds business-configurable project-consultation options/fields, ensure Admin can manage the mutable options and view approved captured values without weakening lead/privacy boundaries.

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
  - Final Granite migration acceptance also requires normal business content/media changes to avoid Store code edits/manual SQL.
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
  - Current Oakwell public profile remains rooted in the existing controlled `general_settings` → public profile RPC path.
  - GC-3 may extend this domain with typed contact channels, public locations/showrooms and location hours when required; preserve backward compatibility during migration and do not duplicate values into Store constants.
- [ ] Review localization settings and where locale/timezone/currency are consumed.
- [ ] Review tax-rules functionality and business requirements.
- [ ] Review document settings and numbering/templates where applicable.
- [ ] Ensure any new public business setting used by Store has one clear ownership model, Admin management, role/RLS protection and a narrow public projection.

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
- [x] GC-2 Media Library Admin contract protects `/store/media`, `store.manage` RBAC, private signed previews, metadata/provenance review, and controlled publish/unpublish/delete behavior; it is part of the permanent Admin smoke chain.
- [x] GC-3 Company Admin contract protects `/store/company`, `store.manage` route/sidebar RBAC, reuse of the canonical company-profile editor, and structured contact/location/hour management; it is part of the permanent Admin smoke chain.
- [x] Auth recovery contract exists.
- [x] Polling regression contract exists.
- [x] Production-surface/demo-route contract exists and is part of the Admin smoke chain.
- [x] Add targeted regression contracts whenever roadmap work changes critical domain behavior.
  - A2.1 warehouse/location integrity, A2.2 inventory/movement, and A2.3 stock-operations/scanning contracts are permanent Admin workflow gates. A2.3 protects scanner duplicate handling, guided confirmation/error recovery, QR label printing, mobile fallback behavior, and continued use of the A2.2 idempotent write boundary.
  - A3.1 product-master contract permanently protects canonical taxonomy/family/color semantics, lifecycle guards, server-side product list/export behavior, and A1/A2 regression boundaries.
  - Countertop catalog/context regression protects visible Catalog/Setup navigation, Stone/Sink catalog ownership, active-product Order dropdown filtering, order-eligible commercial price-group scope, and canonical Product Master/Product Prices write reuse.
  - Configured Countertop Replace/Remove regression protects Draft-only dedicated actions, same-item replacement, dedicated authenticated removal, stable retained-line pricing/identity, and the generic revision fail-closed guards.
  - Vendor Catalog Review v3 contracts protect scoped adapter discovery, durable check snapshots, mapping-driven approval, family/variant identity, normalized availability and missing detection, safe canonical deactivate/reactivate behavior, AVAILABLE-only approval, server-only approval state, bounded bulk approval, migration mirrors, and scalable review UI behavior.
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
- [x] Store homepage/content settings exists.
- [x] Store marketing settings exists.
- [x] Store lead list/detail surfaces exist.
- [x] Dealer onboarding and portal activation Admin flows have contract coverage.
- [x] Customer document dealer-visibility controls exist.
- [x] Phase 2.1B secondary Pages/Projects CMS exists with controlled page slugs, project/media management, explicit publishing, SEO/OG fields, and Store media validation.
- [x] GC-2C Admin Media Library exists at `/store/media` with `store.manage` route/sidebar RBAC, asset/provenance review, 5-minute authenticated signed previews for private staging, metadata editing, and server-side publish/unpublish/delete lifecycle controls.
- [x] GC-3 Company workspace exists at `/store/company` with `store.manage` route/sidebar RBAC, canonical profile reuse, and authenticated structured contact/location/hour management. Public Store consumption remains through the narrow active projection.
- [x] Oakwell dynamic-content architecture is approved for Granite migration: mutable public business content/media remains Admin/Supabase-owned and Store-consumed through controlled projections.

## Security and testing

- [x] RBAC smoke coverage exists.
- [x] API and database smoke infrastructure exists.
- [x] Dealer onboarding/portal contracts exist.
- [x] Auth recovery contract exists.
- [x] Polling regression contract exists.
- [x] Recent Supabase security/performance hardening work has been performed.

## Recent operational fix

- [x] PR #85 reduced Admin Supabase polling churn: notification polling cadence, hidden-tab suspension, profile load behavior, and cross-tab email queue coordination.
- [x] PR #106 gated warehouse/zone/location list-page mutations with `warehouse.manage` while preserving read-only structure access; full Admin verification passed before merge.
- [x] A2.1 warehouse/location integrity is present in production: hierarchy/deactivation guards and restrictive warehouse/location/movement provenance foreign keys were re-verified on 2026-08-30.
- [x] A2.2 inventory/movement production acceptance is complete: server-side inventory discovery, explicit On Hand/Reserved/Available semantics, idempotent mutation RPCs, append-only/reversal audit contracts, production migrations, advisor review, Admin deployment verification, and final application-role TRUNCATE revocation are covered by PR #173 plus closeout PR #174.
- [x] A2.3 stock operations/scanning acceptance is complete: existing stock writes remain on A2.2 idempotent RPCs; camera repeated-frame suppression and serialized processing, guided confirmation/error handling, QR label printing, hardware/manual fallback, responsive warehouse behavior, and clean production QR/barcode integrity are covered by the permanent A2.3 gate.
- [x] A3.1 product master production acceptance is complete: canonical family/color/taxonomy enforcement, protected lifecycle mutation, full filtered export, production migrations, mirror reconciliation, advisor review, authenticated DB smoke, and deployed `/products` verification are recorded in `docs/acceptance/a3-1-product-master-data.md`.
- [x] Product Master UX v2 final production acceptance is complete: current-main Product Master routes/bundles and authenticated v2 boundaries were verified, production has 1,031 products with no missing Product Type/UOM assignments, current CI/runtime checks are clean, and the required signed-in visual click-through was accepted on 2026-09-02. Detailed evidence: `docs/acceptance/product-master-v2-production.md`.
- [x] A3.3 pricing production acceptance is complete: the pricing hardening migration is applied, base-group/effective-period/audit contracts pass rollback-only production probes, authenticated price mutation acceptance passes, Dealer pricing remains assigned-group/no-fallback, production pricing routes return 200, and no A3.3-specific advisor finding was introduced.
- [x] Pricing UI v2 final production acceptance is complete: Product Type routing was re-verified under authenticated production role semantics, Stone Price Group writes fail closed, canonical Material Band writes pass rollback-only acceptance, current Product Prices/Material Bands routes are deployed and healthy, and fresh Advisors show no Pricing-specific blocker. Detailed evidence: `docs/acceptance/pricing-ui-v2-production.md`.
- [x] VAL-2 Products & Pricing production acceptance is complete: DB numeric precision/scale matches the client contract, exact four-decimal price mutation passes authenticated rollback acceptance, relevant RPC grants remain narrow, live Product/Pricing routes are healthy, and no VAL-2-specific Advisor blocker was found. Detailed evidence: `docs/acceptance/val-2-val-4-production.md`.
- [x] VAL-4 Inventory/Warehouse production acceptance is complete: warehouse/quantity constraints match the client contract, 0.01 stock-in passes authenticated idempotent rollback acceptance with zero residue, stock RPC grants remain narrow, live warehouse/inventory routes are healthy, and no VAL-4-specific Advisor blocker was found. Detailed evidence: `docs/acceptance/val-2-val-4-production.md`.

---

# Decisions / Open Questions

Record material decisions here when they affect future phases.

- [ ] Which Personnel/Finance/Training/Approvals modules are committed production scope versus template/planned surface?
- [ ] What exact roles beyond the current core Admin roles need operational permission matrices?
- [ ] Which customer financial capabilities, if any, should ever be exposed to the Customer/Dealer portals?
- [x] Phase 2.1 first secondary CMS scope is **About + Gallery/Projects**; Blog remains disabled until a real editorial workflow is required. Ordinary Navbar/Footer links become configurable in Package D while route/security behavior remains code-owned.
- [x] Granite/Oakwell migration uses a **structured hybrid CMS**. Production business content that operators should change without deployment is DB/Storage-backed and Admin-managed; Store receives narrow public projections. Granite Center is migration evidence only, not a runtime backend.
- [x] New Granite migration domains are introduced incrementally by the package that first needs them after current production schema review; no speculative parallel CMS is created.
- [x] A2.2 keeps the existing hybrid inventory architecture: mutable `inventory` snapshot for operational reads plus append-safe `inventory_movements` ledger. It does not adopt full event sourcing or create separate damaged/hold quantity buckets.
- [x] A2.3 does not add a scan-specific write ledger or new mutation API. Camera/manual scans resolve workflow inputs; confirmed stock changes continue through the A2.2 idempotent RPC + movement-ledger boundary.
- [x] A3.1 keeps `brand_id` / `category_id` canonical while legacy text taxonomy columns remain synchronized compatibility mirrors; physical product deletion is not part of the Admin product-master lifecycle.
- [x] Product Type is dynamic master data and selects a controlled pricing behavior; it does not store price amounts. UOM is dynamic quantity/measurement master data and does not select pricing behavior.
- [x] Pricing UI v2 keeps Stone material rates in canonical `countertop_material_price_bands`, Sink/Standard Price Group amounts in canonical `product_prices`, and unsupported `none` Product Types without an editable commercial amount.
- [x] Countertop Catalog keeps Stone catalog pricing on Material Bands and Sink catalog pricing on order-eligible commercial `price_groups`; manual Stone $/sq ft remains an Order configuration override, not a second stored Stone price source.
- [x] Configured Countertop replacement preserves the stable order-item identity through the canonical configurator/attach path; configured Countertop removal is a separate Draft-only transactional RPC and never weakens generic order-revision guards.
- [x] Vendor catalog discovery may stage vendor categories without creating Modulex master data; approval requires an explicit persistent Category + Product Type + allowed UOM mapping and fails closed when the mapping/master data is unavailable.
- [x] Vendor SKU remains sellable identity; conservative family grouping sets `base_product_code` and variant/color identity without rewriting vendor SKU.
- [x] Vendor availability is external supply eligibility only: it never becomes Modulex on-hand inventory. Only `AVAILABLE` rows may be approved; authoritative repeated absence can become `MISSING`; vendor-driven canonical reactivation never overrides a later manual Modulex status change.

---

# Next Action

Vendor Catalog Review v3 availability/bulk approval is the active Admin catalog package.

1. Keep migrations `20260902093000_vendor_catalog_sync_family_v3` and `20260902113500_vendor_catalog_availability_bulk_approval` unapplied until this Vendor Catalog PR is merged; branch CI is not production acceptance.
2. Review/merge the Vendor Catalog PR, then apply the canonical migrations in order and run Supabase Security + Performance Advisor checks before accepting the feature as production-ready.
3. Deploy Admin and signed-in smoke **Karran → one category → Check Updates → Sync Changes**. Verify content counts and availability changes separately before broad/full scans.
4. Verify availability behavior with one explicit review item: only `AVAILABLE` may approve; `OUT_OF_STOCK` / `UNAVAILABLE` / `UNKNOWN` / `MISSING` remain blocked. Confirm vendor-driven deactivation and safe reactivation do not override a manual Modulex status change.
5. Verify mapping creation with an existing Category and with an explicitly created editable Category name; Product Type and UOM must come from valid active canonical masters.
6. Verify one family such as `SQS200` retains separate vendor SKUs while sharing one base product family, then verify filtered Select All + bounded bulk approval and Product/Store draft edit links.
7. Verify legacy `APPROVED + canonical_product_id=null` recovery through Complete Import and confirm direct browser `APPROVED` / canonical-link writes remain DB-blocked.
8. Do not approve arbitrary production vendor data during acceptance; use an explicitly selected test/review item and keep Store content draft/unpublished.

**Parallel A1 rollout:** PR #248 is merged on `main`, but migration `20260902114500_countertop_replace_remove` remains intentionally unapplied. Apply that migration and complete its advisor/deploy/signed-in acceptance separately before marking the A1.2 row complete.

**Cross-roadmap coordination:** Vendor Catalog Review v3 creates canonical Product variants and draft Store product/media through existing boundaries but does not widen public Store/Dealer projections; no functional `STORE_ROADMAP.md` status mutation is required before merge. Countertop Replace/Remove likewise changes no Store runtime/public projection.

**Parallel-work rule:** re-read execution-time `main`, open PRs, and this roadmap before every new package so newer merges are preserved rather than overwritten.
