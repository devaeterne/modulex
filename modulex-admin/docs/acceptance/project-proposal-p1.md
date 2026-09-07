# Project Proposal P1 — Acceptance Record

Date: 2026-09-07
Package: P1 — Proposal Core DB + RBAC + Read Model
PR: #370 (`feat/project-proposal-core`)
Status: implementation verified; owner merge + production migration/advisor acceptance pending

## Scope delivered

P1 introduces a Project-owned Proposal commercial domain without changing canonical Order, Finance, Procurement, Fulfillment, Calendar, or Change Order ownership.

Database boundary:

- `proposal_area_types`
- `customer_project_proposals`
- `customer_project_proposal_revisions`
- `customer_project_proposal_pricing_groups`
- `customer_project_proposal_areas`
- `customer_project_proposal_acceptances`

Commercial lifecycle is separate from Project lifecycle: `draft | sent | accepted | rejected | superseded`.
Area readiness is separately nullable: `not_ready | ready_to_measure | needs_remeasure | ready_to_cut`.

Revision-owned commercial snapshot fields are `currency_code`, `valid_until`, `customer_message`, and `terms_text`. This keeps sent/accepted commercial content versioned with the exact Revision instead of mutable on the stable Proposal header.

## Pricing contract

Proposal total is server-derived as:

`SUM(ungrouped Area direct_sell_amount) + SUM(Pricing Group sell_amount exactly once)`

An Area may use direct pricing or Pricing Group membership, never both. A Pricing Group can cover multiple Areas without inventing per-Area allocations. Cross-Revision Pricing Group assignment fails closed.

## Authorization / integrity

- Read authorization: `super_admin`, `admin`, `sales`, `finance`.
- Mutation authorization: `super_admin`, `admin`, `sales`.
- New tables have RLS enabled.
- Direct table access is revoked from `public`, `anon`, and `authenticated`.
- Proposal RPCs are not exposed to `anon`; authenticated RPCs perform authoritative role checks.
- Proposal/revision creation uses idempotency keys and transaction/advisory locking.
- Non-draft Area/Pricing Group content is mutation-locked.
- Accepted Revision is fully immutable after acceptance, including lifecycle metadata rewrites.
- Acceptance evidence is append-only.
- No P1 SQL mutates `customer_orders`, Finance, Procurement, Fulfillment, or Calendar truth.

## TDD evidence

The focused contract is `modulex-admin/scripts/project-proposal-core-contract.mjs`, executed by the existing `Admin Project Base` workflow.

Two semantic defects were captured with RED tests before their fixes:

1. Rejecting an older sent Revision while a newer draft exists must keep the Proposal header `draft`. The corrective migration is `20260907204500_project_proposal_rejection_state.sql`.
2. Once a Revision is already accepted, every later UPDATE must fail, including accepted lifecycle metadata rewrites. The corrective migration is `20260907210000_project_proposal_accepted_revision_lock.sql`.

Canonical Store migrations and Admin SQL mirrors are contract-checked byte-identical.

## Rollback-only production-schema verification

Production Supabase project `bzjoeernnmvuhzyvbowc` was used only for rollback-only compile/behavior tests. No Proposal schema or data was persisted.

Verified behavior includes:

- minimal Proposal / Area creation contract
- nullable optional fields
- grouped total calculation
- Proposal read total
- sent Revision immutability
- cross-Revision Pricing Group rejection
- acceptance and draft superseding
- append-only acceptance
- rejection preserving a newer active draft
- accepted Revision metadata rewrite/delete rejection

Post-test residue check: 0 Proposal tables, 0 Proposal functions, 0 Proposal sequence in production.

## Production gate

Do not apply the Proposal migrations before owner merge unless explicitly requested.

After merge:

1. Apply the exact merged Proposal migrations in timestamp order.
2. Run read-only/rollback-safe production acceptance against the persisted schema.
3. Run Supabase Security and Performance Advisors with the Proposal objects present.
4. Only then mark P1 production-accepted and move the execution tracker to P2 — Project Proposal Admin UI.
