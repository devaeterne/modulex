# Modulex Admin Roadmap

Last reviewed: 2026-09-11
Main baseline: `02f2bce3433df43c7b4fb10d611ed99e7406a822`
Current phase: **Admin Final Workstreams**
Production Supabase: `bzjoeernnmvuhzyvbowc`

This file is the current execution/status source of truth for `modulex-admin`. The previous detailed roadmap is preserved at `docs/archive/ADMIN_ROADMAP_2026-09-08.md`; acceptance documents are point-in-time historical proof and do not override current code, production state, or this roadmap.

## Status legend

- `[x]` closed: the workstream's required implementation/documentation and applicable verification/acceptance evidence are complete. A PR that changes the status to `[x]` must carry that evidence; merge makes the closed state authoritative on `main`.
- `[~]` active/partial: work has started or substantial implementation exists, but one or more exit gates remain open.
- `[ ]` not closed: work remains or has not started.
- `[!]` deferred / not product scope: intentionally not being implemented now. The item must state the reason, owner decision or dependency, and the concrete condition that would reopen it. `[!]` is not a substitute for an unexplained blocker.

## Workstream lifecycle contract

### Open a workstream when

- a roadmap-coded requirement is newly approved, a concrete regression reopens a closed capability, or current evidence proves a material gap in an existing domain;
- the owning prefix/domain is explicit and duplicate work in another active PR/workstream has been ruled out;
- execution-time `main`, open PRs, current production migration state when relevant, and applicable deployment state have been re-read;
- acceptance/exit criteria are specific enough to prove completion without relying on chat history.

Do not open a new prefix merely to rename an existing requirement. Extend the existing owning workstream when the architecture/domain is unchanged.

### While active

- Mark the package/workstream `[~]` once implementation or reconciliation work begins.
- Preserve one canonical owner for each domain, route, RPC/data source, release rule and documentation contract; prefer REUSE/EXTEND/BRIDGE over parallel replacements.
- Use TDD for behavior changes. Documentation-only reconciliation must still be backed by executable documentation/domain contracts where such contracts exist.
- Record blockers/dependencies in the roadmap or owning acceptance record rather than leaving stale implied status.

### Evidence required for `[x]`

An item may become `[x]` only after all applicable evidence for that item is present:

1. **Source/contract evidence** — requested code/docs/schema are present and current architecture/ownership is explicit.
2. **Automated verification** — relevant domain contract/CI plus Admin global typecheck/lint/build and UI/RBAC gates when the scope affects them.
3. **Database evidence when applicable** — canonical merged migration, production migration-state verification, RLS/RPC/grant/lifecycle checks, and fresh relevant Security/Performance Advisor disposition.
4. **Production acceptance when applicable** — signed-in production-safe smoke, negative authorization path where relevant, and zero test residue; prefer read-only/rollback-only probes.
5. **Deployment evidence when runtime changed** — expected merged SHA is the Vercel production artifact and is healthy.
6. **Handoff evidence** — the owning acceptance record and this roadmap are updated in the same PR so the result can be understood without chat history.

A docs-only package does not invent migrations, Advisors, deployment or production mutations merely to satisfy ceremony; record those gates as not applicable and prove the changed documentation through the existing documentation/domain/CI contracts.

### Use `[!]` only when

- the owner intentionally defers the work, explicitly declares it not product scope, or a named external dependency makes execution inappropriate now;
- the reason is written next to the item; and
- the reopen condition is explicit when future work is possible.

Do not mark an implementation defect `[!]` simply because it is inconvenient. Security/integrity blockers stay open until fixed or explicitly owner-deferred with risk recorded.

### Same-PR maintenance rule

Any PR that opens, closes, defers, materially re-scopes, or changes the architecture/acceptance contract of a coded workstream **must update `ADMIN_ROADMAP.md` in that same PR**. It must also update the owning acceptance/domain document when the evidence or contract changes. Cross-surface changes review/update `modulex-store/STORE_ROADMAP.md` where affected.

Historical acceptance/plan documents remain evidence; do not rewrite old proof to make current status look cleaner. Mark their role as historical/obsolete from a current canonical document and add new acceptance evidence when current behavior changes.

## Execution rules

- Each prefix below is an independent conversation/workstream unless a hard dependency is discovered.
- At the start of every workstream, re-check execution-time `main`, open PRs, production migrations when relevant, and relevant production deployment state.
- Do not reopen completed domains without a concrete regression or explicitly approved new scope.
- Canonical Supabase migrations live under `modulex-store/supabase/migrations`; Admin mirrors are secondary only where an established mirror exists.
- Before closeout, run the relevant domain workflow, Admin UI/RBAC gates when affected, production-safe acceptance, and fresh Supabase Advisors for DB/RLS/RPC/grant/index changes.
- Production mutation acceptance should be read-only or rollback-only whenever possible and must leave zero test residue.
- `docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md` is the single verification/migration/Advisor/Vercel release flow; do not create per-feature duplicate release checklists.

# Closed domains

- [x] **Customers** — CUST-7→CUST-11 / VAL-3 lifecycle, validation, server-side list/search/filter/pagination, Sales Rep relationships, UI/accessibility, AR/Finance boundary and owner acceptance are closed.
- [x] VAL-3 — Customers / Orders / Invoices.
- [x] **Orders Core** — create/edit/detail, lifecycle/status validation, revisions, pricing, procurement/reservation integration and portal-safe projection are closed.
  - The stale legacy roadmap item for Product Type + UOM + `pricing_model` routing is closed; production migration `order_product_pricing_v2` is live and current Admin uses the routed order behavior.
  - The stale legacy roadmap item for configured Countertop Replace/Remove is closed; the migration is live and the dedicated Draft-only flow is in current main.
- [x] **Shipment / Installation** — canonical fulfillment lifecycle and Project rollups are production-accepted.
- [x] **Inventory / Warehouses / Scanning / QR** — A2 exit gate is closed, including idempotent stock mutations and append-safe movement audit.
- [x] **Product Master** — Product Types, UOM, Brands, Categories, SKU/base product/color model and Product Master UX v2 are production-accepted.
- [x] **Pricing** — Product Prices, Price Groups, Material Bands, Product Type routing and cost/margin foundation are closed through A3.
- [x] **Countertop Core** — Stone/Sink/Faucet catalog, multi-fixture pricing, manual Sink fallback, services/material cost, Replace/Remove, immutable snapshots and Multi-Backsplash are live. #424 includes the no-edge backsplash regression fix.
  - The stale legacy roadmap item for operational Countertop Catalog/Setup is closed; `countertop_catalog_product` is live in production.
- [x] **Projects** — PB-1→PB-3B and PB-5→PB-9 are delivered/accepted; PB-4 intentionally remains Finance-owned rather than a duplicate Project cash ledger.
- [x] **Project Proposal / Estimate P1→P6** — Proposal Core, Admin UI, revision/send/accept, PDF/artifact, accepted-artifact persistence and Proposal→Draft Order conversion are closed. #424 includes production SERVICE UUID conversion hardening.
- [x] **Commission** — fixed, Sales %, Gross Profit %, participant roles and Finance payout attribution are production-accepted.
- [x] **Change Orders** — PB-7 approval/application separation, canonical revision linkage, audit and Sales cost hardening are production-accepted.
- [x] **Finance F0→F7** — Cash/Bank, FX snapshot/manual negotiated FX, immutable posted transactions, reversal/void, Expenses, AP, Vendor Payments/Schedules, AR, reporting and hardening are production-verified.
- [x] **Vendor Master / AP / Purchasing→AP / AP Aging** — canonical Vendor/Supplier master, compliance, Vendor Bills, allocations, payment lifecycle/schedules, procurement bridge and aging are closed.
- [x] **Calendar** — Company Calendar and Google Calendar bidirectional V3 are implemented with permanent regression coverage.
- [x] **Admin UI Foundation** — UI-2A→UI-2E responsive shell, table system, theme/dark mode, route regression and resolution matrix are closed. Remaining UI work is domain-specific polish only.
- [x] **Sales & Production Report** — finance-only dashboard/report with Overview, Collections and Jobs structure is merged and live at the data-contract level.
- [x] **Test foundation** — RBAC, A1/A2/A3, Finance, Project, Vendor, Calendar, UI, production-surface and related regression suites exist.
- [x] **README/runtime baseline** — Modulex Admin README, runtime config, RBAC matrix, UI guide, validation guide and production-surface documentation exist.

# Open workstreams

## VC — Vendor Catalog Review / Imports

Status: `[~]` substantial implementation exists; final production acceptance and cleanup remain.

- [ ] **VC-A1 — Production review/import acceptance.** Run signed-in Admin acceptance for Check Updates → review → mapping → single/family/bulk approval → canonical Product/Store draft links. Verify idempotent retry and bounded bulk behavior.
- [ ] **VC-A2 — Availability/missing-state closeout.** Verify AVAILABLE/OUT_OF_STOCK/UNAVAILABLE/UNKNOWN/MISSING semantics against production adapters and prove scoped discovery cannot mark unrelated rows missing.
- [ ] **VC-A3 — Mapping/media/pricing boundary.** Verify category→Category/Product Type/UOM mapping, approval-time media import and vendor reference price→base List Price behavior without Store auto-publish or non-base repricing.
- [ ] **VC-A4 — Vendor Catalog final gate.** Fresh CI + Advisor review + production signed-in smoke; update acceptance docs and mark Vendor Catalog v3 closed.

## CMS — Store CMS / Public Business Content

Status: `[~]` core is strong; broader A4 CMS exit gate remains open.

- [ ] **CMS-A1 — Navigation/footer configurability.** Finish business-editable labels/order/visibility/approved destinations while route allowlists/security remain code-owned.
- [ ] **CMS-A2 — Typed CMS domain reconciliation.** Reconcile Company/contact/location/hours, Cabinet process/FAQ, testimonials/reviews, Pages/Projects and media ownership; remove duplicate/hard-coded mutable business content paths.
- [ ] **CMS-A3 — Media intake/publish production acceptance.** Close private staging → review → publish/unpublish/delete lifecycle with provenance, reference protection and no manual SQL requirement.
- [ ] **CMS-A4 — A4 CMS exit gate.** Prove normal public content changes are Admin-manageable and Store/Admin contracts remain synchronized.

## LD — Leads

Status: `[x]` LD-A1→LD-A4 implemented in the final Leads workstream.

- [x] **LD-A1 — Lead workspace operations.** Complete server-side search/filter/pagination, status handling, owner assignment, notes/activity and clear action hierarchy for contact/dealer leads.
- [x] **LD-A2 — Lead conversion.** Define and implement guarded Lead → Customer/Project/Dealer handoff without duplicate identities or manual SQL.
- [x] **LD-A3 — Privacy and retention.** Minimize sensitive form exposure, define role visibility, retention/archive behavior and audit expectations.
- [x] **LD-A4 — Consultation options integration.** Ensure business-configurable consultation options/fields are Admin-managed and captured values remain privacy-safe.

## DLR — Dealer Onboarding & Customer Documents

Status: `[x]` DLR-A1→DLR-A4 implemented and production-accepted.

- [x] **DLR-A1 — Dealer approval to activation.** Verify/finish application approval → Customer/account setup → portal activation as one coherent operator flow.
- [x] **DLR-A2 — Rejection/deactivation/reactivation.** Define allowed transitions, reasons, audit behavior and portal access consequences.
- [x] **DLR-A3 — Document privacy.** Prove supporting/customer documents remain private by default, Dealer visibility is explicit, and labels/categories/expiry metadata are added only where business-required.
- [x] **DLR-A4 — Dealer/document exit gate.** Signed-in production acceptance with negative cross-customer/document access checks and zero manual SQL.

## USR — Users & Roles

Status: `[x]` USR-A1→USR-A4 implemented, production-migrated and rollback/read-only accepted.

- [x] **USR-A1 — User/role management flow audit.** Reconcile `/users` and role-management UI with the canonical permission model and direct-route/data enforcement.
- [x] **USR-A2 — Last Super Admin protection.** Prevent accidental removal/deactivation of the final effective Super Admin through every mutation path, with concurrency-safe DB enforcement.
- [x] **USR-A3 — Invite/recovery/deactivation lifecycle.** Verify invitation, password recovery, account deactivation/reactivation and stale-session behavior end to end.
- [x] **USR-A4 — Role-change audit.** Add/verify immutable actor/time/from/to audit evidence and regression coverage for role assignment/removal.

## SET — General Settings

Status: `[x]` SET-A1→SET-A5 implemented and production-accepted.

- [x] **SET-A1 — Company/public profile ownership.** `general_settings` owns the singleton company/public profile; structured contact/location/hours retain their canonical tables and Store consumes narrow public RPC projections only.
- [x] **SET-A2 — Locale/timezone/currency.** Locale, timezone and main currency have canonical ownership; customer/order/invoice fallbacks no longer silently force USD and Finance transaction-time FX snapshots are unchanged.
- [x] **SET-A3 — Tax rules.** Active/inactive fulfillment Tax Rules remain server-enforced at Order confirmation, Order→Invoice tax snapshots remain historical, and mutation/audit boundaries are explicit.
- [x] **SET-A4 — Document settings.** Order/Invoice numbering format, titles, footers and branding stay in canonical General Settings while existing sequences remain counters; no duplicate document configuration store was introduced.
- [x] **SET-A5 — Settings exit gate.** Settings RBAC/RLS/RPC boundaries and Store/Finance/Documents downstream contracts are covered by final regression and production-safe acceptance.

## NTF — Email & Notifications

Status: `[~]` polling/queue coordination and routing foundations exist; operational closeout remains.

- [ ] **NTF-A1 — Email transport and secrets.** Audit provider configuration so secrets are server-only and no secret material enters browser settings payloads/logs.
- [ ] **NTF-A2 — Notification routing/preferences/templates.** Reconcile role/permission-aware recipients, user preferences and templates; prevent unrelated operational notifications from reaching roles such as Sales.
- [ ] **NTF-A3 — In-app notification lifecycle.** Verify read/unread, bulk-read, dedupe/idempotency, links, authorization and hidden-tab/poll behavior.
- [ ] **NTF-A4 — Delivery observability.** Add failed email queue monitoring/retry visibility and an operator-facing failure state with regression coverage.

## PER — Personnel / HR

Status: `[x]` PER-A1→PER-A4 closed; all listed Personnel routes are production scope and HR/Finance payroll ownership is production-verified.

- [x] **PER-A1 — Route/product-scope classification.** Employees, Departments, Positions, Attendance, Leave, Lifecycle, Documents, Performance, Compliance, Compensation, Benefits, Payroll and Reports are production routes; no listed route is planned/remove.
- [x] **PER-A2 — Production-domain contracts.** Production routes are reconciled against the live HR data model, RBAC, lifecycle, validation, audit, bounded data-access/performance and regression contracts; the final Personnel contract is permanent CI coverage.
- [x] **PER-A3 — HR/Finance boundary.** Payroll calculation/source records are HR-owned; Finance receives approved-obligation/read settlement projections and owns actual employee payment/money movement/reporting through the Finance transaction ledger, without a duplicate payroll cash ledger.
- [x] **PER-A4 — Placeholder cleanup + production acceptance.** No Personnel route was removed because none is a true placeholder. Production migration/RLS/RPC authorization, Advisor checks and Admin production-surface/Personnel/Leave regressions are closed with zero acceptance residue.

## MOD — Approvals / Training Optional Modules

Status: `[x]` MOD-A1→MOD-A3 closed; Approvals is a shared production workflow and standalone Training is not product scope.

- [x] **MOD-A1 — Approvals decision.** `/approvals` is the shared approval engine for `order_exception`, `order_revision`, `order_status_change`, `customer_commercial_change`, `customer_price_group_change`, and `invoice_change`. Requesting remains domain-owned; queue visibility is `approvals.view`, review is Admin/Super Admin only, decisions are pending-only approve/reject, reviewer note/time/actor and notification events preserve audit evidence, and order/customer/invoice deep links remain canonical.
- [x] **MOD-A2 — Training decision.** The standalone `/training` surface was browser-local static help content rather than the production HR training model. It is removed from Admin product scope; existing `hr_training_courses` / `hr_employee_training` schema remains Personnel-owned for PER decisions and is not dropped by MOD.
- [x] **MOD-A3 — Optional-module exit gate.** Approvals is exposed as a shared operational workflow rather than Finance-owned navigation; standalone Training route/content and its obsolete route permission are removed, with regression coverage locking the decision.

## RBS — RBAC / Security

Status: `[~]` role enforcement is strong, but project-wide Advisor/security debt remains.

- [ ] **RBS-A1 — SECURITY DEFINER inventory.** Triage every Supabase Advisor `anon_security_definer_function_executable` / `authenticated_security_definer_function_executable` finding into intentional guarded public API vs defect. Prove authorization inside intentional wrappers; revoke/switch/move anything unnecessary.
- [ ] **RBS-A2 — RLS no-policy inventory.** Review RLS-enabled tables with no policy. Preserve intentional RPC-only tables with explicit revoked direct grants; add policies only where direct table access is actually required. Document the decision per table family.
- [ ] **RBS-A3 — Auth hardening.** Enable/verify leaked-password protection and re-check invitation/recovery/session behavior without weakening current auth flows.
- [ ] **RBS-A4 — Permission matrix negative acceptance.** Re-run all roles (`super_admin`, `admin`, `sales`, `finance`, `hr`, `warehouse`, `shipping`) across route, sidebar, RPC and sensitive-data boundaries; repair mismatches and update `ADMIN_RBAC_MATRIX.md`.
- [ ] **RBS-A5 — Security closeout.** Fresh Security Advisor, safe `search_path`, narrow grants, production rollback/read-only probes, no test residue, and an intentional-warning register.

## PRF — Performance

Status: `[~]` domain-specific performance work exists; project-wide A7 performance closeout remains.

- [ ] **PRF-A1 — Foreign-key index triage.** Review current Advisor unindexed-FK findings by real query/delete/update paths; add only justified covering indexes, not a blind index-every-FK migration.
- [ ] **PRF-A2 — RLS policy performance.** Fix current `auth_rls_initplan` findings and the duplicate permissive `store_pages` SELECT policy where semantics can be preserved exactly.
- [ ] **PRF-A3 — Frontend data/load audit.** Identify large client components, repeated Supabase reads, unnecessary chart/heavy dependencies and missing loading/error boundaries in high-value operations.
- [ ] **PRF-A4 — Baselines and closeout.** Capture repeatable timings for Dashboard, Customers, Orders, Products/Inventory and Finance/report surfaces; fresh Performance Advisor and no regression in production builds.

## UXA — Accessibility & Responsive Operations

Status: `[x]` UXA-A1→UXA-A3 closed; operational accessibility and responsive hardening are covered by shared primitives and permanent UI contracts.

- [x] **UXA-A1 — Keyboard/focus audit.** Tables, dropdowns, modals, drawers, forms, scanner and navigation must be keyboard-operable with predictable focus restoration.
- [x] **UXA-A2 — Mobile/tablet operations.** Re-test warehouse/scanner, Customer/Order, Finance and high-use forms at supported breakpoints with no hidden critical action/data.
- [x] **UXA-A3 — Destructive/loading states.** Standardize confirmation, disabled, pending, retry and error recovery for destructive/high-risk mutations.

## VAL — Validation Finalization

Status: `[~]` VAL-1→VAL-4 are closed.

- [~] VAL-5 — Store CMS / Users / Settings / remaining Admin forms.
- [ ] **VAL-A1 — VAL-5 Store CMS / Users / Settings / remaining forms.** Inventory DB-vs-client validation mismatches and remediate only verified gaps across the open Admin domains.
- [ ] **VAL-A2 — VAL-6 full regression / production acceptance.** Run consolidated validation contracts, negative boundary tests and production-safe acceptance; publish final evidence and close the cross-cutting VAL track.

## OPS — Observability & Release Process

Status: `[x]` OPS-A1→OPS-A4 closed; the operational baseline, audit reuse contract, migration runbook and release checklist are documented and CI-enforced.

- [x] **OPS-A1 — Error monitoring baseline.** Minimum client/server/API/background-job/vendor/calendar/email error visibility, severity/correlation expectations and secret/PII logging boundaries are defined against existing runtime and queue sources.
- [x] **OPS-A2 — High-risk audit/event standard.** Actor/time/entity/action/before-after-or-delta/reason/request-or-idempotency expectations are mapped to existing audit/event sources; no parallel per-domain ledger is introduced.
- [x] **OPS-A3 — Migration rollout/rollback.** Canonical `modulex-store/supabase/migrations` ownership, preflight, merge/apply order, backward-compatible expand/contract, failed-migration handling, append-only forward-fix and Advisor gates are documented and contract-checked.
- [x] **OPS-A4 — Admin release checklist.** Latest-main/open-PR conflict check, CI, migration state, Security/Performance Advisor, Vercel deploy, signed-in smoke, zero residue and roadmap/acceptance handoff are required by the release standard and executable OPS contract.

## DOC — Repository Documentation / Handoff

Status: `[x]` DOC-A1→DOC-A4 reconciled; existing docs are retained with explicit canonical/historical roles and executable drift checks.

- [x] **DOC-A1 — Documentation inventory/reconciliation.** README/Production Surface/RBAC/Runtime/UI/Validation/Finance/acceptance sources have explicit ownership/precedence; stale Training/Calendar/Finance-baseline contradictions and duplicate current-status claims are removed or classified as historical evidence.
- [x] **DOC-A2 — Route/domain/Supabase map.** `docs/ADMIN_PRODUCTION_SURFACE.md` is the canonical route/domain + Admin/Store + canonical migration + public/internal boundary map; root/Admin READMEs lead new developers/agents to it.
- [x] **DOC-A3 — Verification/deploy handbook.** `docs/OPS_OBSERVABILITY_RELEASE_STANDARD.md` remains the single verification/release flow for typecheck/lint/build, relevant smoke/domain CI, production-safe smoke, canonical migrations, Advisors and Vercel; duplicate feature-level release handbooks are not created.
- [x] **DOC-A4 — Roadmap maintenance contract.** This roadmap now permanently defines open/active/closed/deferred semantics, evidence required for `[x]`, valid `[!]` use, and same-PR roadmap/acceptance maintenance.

# Final Admin exit gate

The Admin program is considered fully closed only when all open coded workstreams above are `[x]` or explicitly `[!] deferred/not product scope` with owner approval.

- [ ] All visible production modules have explicit product ownership.
- [ ] No unresolved Admin validation/RBAC/security blocker remains.
- [ ] Store/Lead/Dealer/User/Settings/Personnel operational flows require no manual SQL.
- [ ] Critical workflows have repeatable CI + production-safe acceptance.
- [ ] Security/Performance Advisor results are triaged and intentional warnings are documented.
- [x] Release/handoff documentation is sufficient to operate without prior chat context.
