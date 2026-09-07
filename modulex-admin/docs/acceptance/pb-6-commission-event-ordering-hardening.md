# PB-6 — Deterministic Commission Event Ordering Hardening

Date: 2026-09-07
Branch: `fix/pb6-commission-event-ordering`
PR: #352
Status: implementation / CI gate; production migration intentionally unapplied before merge

## Production-closeout finding

PB-6 production acceptance reproduced a real lifecycle race inside a single PostgreSQL transaction.

`project_commission_events.created_at` defaults to `now()`. PostgreSQL `now()` is transaction-scoped, so several append-only commission events created in one transaction receive the same timestamp. The existing `private.current_project_commission_status(uuid)` and bounded event projection then used `created_at desc, id desc`; random UUID ordering could therefore decide which same-timestamp event was treated as latest.

The reproduced valid lifecycle was:

1. create fixed commission obligation;
2. append `earned`;
3. append `approved`;
4. append `adjustment`;
5. append `approved` again.

Step 5 could fail because the current-status helper could observe an earlier same-timestamp event instead of the latest append. The acceptance transaction rolled back and left no business-data residue.

## Hardening design

The fix is additive and does not rewrite commission history:

- add `project_commission_events.event_sequence bigint generated always as identity`;
- add a unique sequence index and an `(obligation_id, event_sequence desc)` lookup index;
- derive current commission status by `event_sequence desc`;
- return bounded commission event history by `event_sequence desc`;
- preserve the existing public RPC signature and role boundary;
- keep the private status helper execute-locked from PUBLIC;
- keep public event projection execute revoked from PUBLIC and granted only to authenticated callers;
- do not UPDATE or DELETE existing commission event history;
- do not disable/drop the immutable history trigger.

A rollback-only PostgreSQL probe confirmed that adding an identity column to an existing table assigns sequence values to existing rows without firing row UPDATE triggers. Production currently has only one historical commission event, so there is no pre-existing same-timestamp ambiguity to reconcile.

## PB-6 Performance Advisor closeout

Fresh production Performance Advisor review during this closeout identified PB-6-owned foreign keys that did not have a full covering index. Existing indexes were inspected against the actual FK column order; partial indexes and indexes whose next column was `created_at` were not counted as covering composite FK prefixes.

The same additive hardening migration therefore adds covering indexes for the remaining PB-6 FK columns on:

- `project_commission_events.created_by`;
- `project_commission_obligations(participant_id, project_id)`;
- `project_commission_obligations.created_by`;
- `project_commission_obligations.order_id`;
- `project_commission_obligations.product_category_id`;
- `project_commission_obligations.product_id`;
- `project_participant_roles.created_by`;
- `project_participants.created_by`;
- `project_participants.customer_contact_id`;
- `project_participants.employee_id`;
- `project_participants.profile_id`;
- `project_participants.role_id`;
- `project_participants.updated_by`.

This is index-only hardening. It does not change participant, commission, Finance payout, or RBAC semantics. Existing project-wide Advisor debt outside PB-5/PB-6 remains out of scope. Newly created indexes may initially appear as `unused_index` INFO until production traffic exercises them; that is not a reason to remove FK-covering indexes immediately after creation.

## TDD evidence

RED head: `52ac721a5f8857c4cfb9d60a5f2cfdb85c519c2e`

Admin Project Base run `34131174019` / run #418:

- PB-1 / Project Base contracts: GREEN
- PB-2 Project financial rollup: GREEN
- PB-3A payment contracts: GREEN
- PB-3B Procurement: GREEN
- PB-5 Fulfillment: GREEN
- existing PB-6 Participants & Commission: GREEN
- PB-6 tab access + percentage basis: GREEN
- PB-6 gross-profit commission: GREEN
- new deterministic event-ordering contract: expected RED because the migration artifact did not yet exist

The permanent GREEN contract additionally requires all PB-6-owned FK covering indexes listed above so this package cannot be closed while its known Advisor debt remains unaddressed.

## Repository artifacts

Canonical Store migration:

- `modulex-store/supabase/migrations/20260907140000_customer_project_commission_event_ordering.sql`

Byte-identical Admin mirror:

- `modulex-admin/sql/project-pb6-commission-event-ordering.sql`

Permanent regression contract:

- `modulex-admin/scripts/project-pb6-commission-event-ordering-contract.mjs`

CI owner:

- `.github/workflows/admin-project-base.yml`

## Production boundary

The hardening migration must not be applied to production before PR #352 is merged.

After merge, production acceptance must:

1. apply the canonical migration;
2. verify `event_sequence` is identity-backed and non-null for historical rows;
3. verify event-ordering indexes and PB-6 FK covering indexes;
4. reproduce `earned -> approved -> adjustment -> approved` deterministically in one rollback-only transaction;
5. verify offset/reversal ordering and negative-entitlement guard;
6. verify immutable UPDATE/DELETE guards remain active;
7. verify Admin/Finance commission management and denied roles;
8. verify event projection ACLs and deterministic order;
9. rerun Security and Performance Advisors and confirm no PB-5/PB-6-specific blocking finding remains;
10. confirm zero acceptance residue.

PB-5 production acceptance is independently GREEN; final Project Base plan/roadmap closeout will mark PB-5 and PB-6 complete only after this PB-6 migration and post-merge acceptance pass.
