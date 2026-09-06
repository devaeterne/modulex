# Customer Operations Hardening Implementation Plan

**Goal:** close the remaining Customer master mutation gaps without changing canonical Order, Project, Portal, or Finance ownership.

**Base:** execution-time `main` at `d3de70f181ffa5c36a62f672e26149a4e1b0468a`.

## Package 1 — Customer mutation contract + VAL-3 customer core

1. Add RED assertions to the existing Customer master/detail contracts for canonical Customer create, contact mutation, and address update/deactivation boundaries.
2. Verify the branch CI fails specifically because these boundaries do not yet exist / are not consumed by the UI.
3. Add additive SQL RPCs with existing `super_admin/admin/sales` authorization, normalized inputs, active-FK validation, row locking where needed, and atomic `customer_activity` writes.
4. Mirror the SQL into the shared Supabase migration directory; do not apply production migration before merge.
5. Route Customer create and Customer detail contact/address mutations through the canonical RPCs; eliminate the identified multi-step browser writes.
6. Run customer contracts, A1 regressions, RBAC, Admin UI strict, typecheck, lint, build, and affected portal boundaries in CI.

## Package 2 — Customer operations UX + documents

1. Add Customer → Projects navigation/deep-link behavior without changing Project ownership.
2. Consolidate customer document management around the existing private `customer-documents` panel; keep `portal_visible=false` by default.
3. Add signed private preview/download and append-safe deactivate behavior; remove stale duplicate document messaging from the Customer card.
4. Preserve server-mediated Portal lifecycle and existing RBAC.
5. Run Customer detail/UI/portal/document regressions and Admin UI strict.

## Package 3 — Customer closeout / Finance handoff

1. Complete VAL-3 audit for Customers/Orders/Invoices and record remaining Finance-owned gaps separately.
2. Close Customer read-dedup/UI standardization only after post-deploy authenticated browser acceptance; keep roadmap `[~]` before that gate.
3. Implement Finance F5 AR aging/customer balances as a separate Finance PR on the then-current `main`, reusing canonical invoice/payment/Finance allocation truth rather than adding Customer-owned money tables.

## Safety / rollout

- No automatic merge or production deploy.
- No production business-data mutation in PR preparation.
- New RPCs remain authenticated and role-checked; do not weaken RLS/grants.
- Security/Performance Advisor review is required after the production migration is applied post-merge.
- Store/Customer Portal/Dealer Portal projections must not widen unless explicitly required and tested.
