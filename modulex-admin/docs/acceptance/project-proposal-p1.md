# Project Proposal P1 — Acceptance Record

Date: 2026-09-08
Package: P1 — Proposal Core DB + RBAC + Read Model
PR: #370 (`feat/project-proposal-core`)
Status: production accepted / completed

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

## Production migration closeout

PR #370 was verified merged before production mutation. The exact merged canonical migrations were applied to Supabase production project `bzjoeernnmvuhzyvbowc` in timestamp order:

1. `20260907203000_project_proposal_core.sql`
2. `20260907204500_project_proposal_rejection_state.sql`
3. `20260907210000_project_proposal_accepted_revision_lock.sql`

No unmerged or locally modified Proposal SQL was applied.

## Persisted production acceptance

Rollback-safe behavioral acceptance was run against the persisted production schema and passed:

- minimal Proposal plus Area creation
- Area creation with only `area_name`
- nullable optional Area fields remaining `NULL`
- direct Area pricing
- grouped pricing counted once per Pricing Group
- representative authoritative total `350.00`
- cross-Revision Pricing Group assignment rejected fail-closed
- sent Revision content immutability
- accepted Revision full immutability, including update/delete attempts
- Acceptance append-only behavior
- rejecting an older sent Revision while a newer draft exists preserves the Proposal header draft state
- Proposal detail read-model authoritative total
- anonymous access denied
- read/manage role boundary enforcement
- RLS/grant boundary verification

The acceptance transaction was rolled back. Post-acceptance residue check found zero temporary Proposal business rows.

## Advisor closeout

Fresh Supabase Security and Performance Advisor scans were reviewed with the Proposal objects present.

- No Proposal-specific Performance Advisor warning/error blocks P1. Remaining Proposal signals are informational FK/index-usage observations expected on a newly introduced domain with no production workload history yet.
- Security Advisor identifies the intentional Proposal `SECURITY DEFINER` RPC boundary. The functions retain pinned search paths, explicit application-role guards, authenticated-only execution, and anon/PUBLIC denial. Production negative RBAC/anon acceptance confirmed the boundary fails closed, so it was not weakened merely to silence the advisor.

## Final status

P1 is production accepted and completed. P2 — Project Proposal Admin UI may build on this persisted Proposal Core contract.
