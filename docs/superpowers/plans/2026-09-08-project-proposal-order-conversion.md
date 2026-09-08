# Project Proposal P6 — Proposal → Order Conversion Implementation Plan

Date: 2026-09-08

Design: `docs/superpowers/specs/2026-09-08-project-proposal-order-conversion-design.md`

## Task 1 — RED contract

- Add `modulex-admin/scripts/project-proposal-order-conversion-contract.mjs`.
- Require canonical Store migration + Admin mirror.
- Require conversion provenance tables, exact accepted-Revision validation, non-empty Area selection, Area one-time source link, idempotency, Pricing Group atomicity, canonical SERVICE/manual-service mapping, canonical `create_project_customer_order` delegation, role/RLS/grant boundaries and no downstream side effects.
- Require focused domain client + Proposal UI component.
- Require shared Modulex UI primitives and no route-local native controls.
- Wire the contract into Admin Project Base Proposal contract chain.
- Capture intentional RED before implementation exists.

## Task 2 — DB / RPC GREEN

Create byte-identical migration mirrors:

- `modulex-store/supabase/migrations/20260908190000_project_proposal_order_conversion.sql`
- `modulex-admin/supabase/migrations/20260908190000_project_proposal_order_conversion.sql`

Implement:

- `customer_project_proposal_order_conversions`
- `customer_project_proposal_order_conversion_areas`
- append-safe lifecycle guards
- read RLS for `projects.view` roles
- no direct authenticated table mutation
- `create_order_from_accepted_project_proposal(...)`
- `get_project_proposal_order_conversions(...)`

Mutation requirements:

- accepted baseline only
- server-side immutable Proposal projection
- duplicate-free selection
- Pricing Group all-or-none selection
- canonical active `SERVICE` / `manual_service` resolution
- direct Area → one Service line
- Pricing Group → one Service line for all member Areas
- unpriced Area → zero-priced explicit scope Service line
- canonical Order creation delegate
- always create `draft`
- one-time Area conversion
- idempotency retry returns same conversion/order
- conversion provenance written atomically after Order creation

## Task 3 — Domain client

Create `modulex-admin/src/lib/customers/project-proposal-order-conversion-domain.ts`.

Responsibilities:

- typed conversion history
- selected Area normalization
- create RPC wrapper
- read RPC wrapper
- focused error mapping
- no duplicated Order arithmetic

## Task 4 — Admin UI

Create `modulex-admin/src/components/customers/project-detail/ProjectProposalOrderConversion.tsx` and integrate into accepted Proposal experience.

UI requirements:

- accepted Revision only
- `projects.manage` mutation gate
- loading/error/retry states
- Area selection
- Pricing Group members behave atomically
- already-converted Areas disabled with linked Order indication
- Order context fields reuse existing loaders/shared form primitives
- explicit `Create Draft Order`
- duplicate-submit/idempotency guard
- success link to canonical Order detail
- no automatic Order on acceptance

## Task 5 — Verification

Targeted:

- P6 contract GREEN
- Proposal P1→P6 chain GREEN

DB/security:

- canonical/Admin migration byte equality
- Supabase Security Advisor
- Supabase Performance Advisor
- no production migration before owner merge

Admin:

- `smoke:admin-ui-strict`
- relevant Project/Order contracts
- RBAC
- typecheck
- lint
- production build

## Task 6 — PR / rollout

- Open focused draft PR from `feat/project-proposal-order-conversion`.
- Do not merge.
- After owner merge only: apply exact merged migration if missing, run production acceptance, then update Proposal tracker to production-accepted.
