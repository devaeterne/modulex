# A6-F5C — Project Payment Reconciliation / Compatibility Hardening

Status: **COMPLETE / PRODUCTION VERIFIED 2026-09-07**
Date: 2026-09-07

## Scope

A6-F5C narrows the remaining legacy Project-payment compatibility exception without rewriting historical Project payment IDs or fabricating Finance transactions.

Canonical implementation:

- Admin SQL: `modulex-admin/sql/project-f5c-payment-hardening.sql`
- Store migration mirror: `modulex-store/supabase/migrations/20260907090000_a6_f5c_project_payment_hardening.sql`
- Contract: `modulex-admin/scripts/project-f5c-payment-hardening-contract.mjs`
- Implementation plan: `modulex-admin/docs/superpowers/plans/2026-09-06-a6-f5c-project-payment-reconciliation-hardening.md`
- Implementation PR: `#345 — fix(project): harden F5C posted payment history`
- Merge commit: `4a785c37e5e6384545d9f12b79a200402f54899f`

The Admin SQL and Store migration mirror are byte-identical by contract.

## Locked behavior after F5C

- posted and voided Project payment transaction history cannot be hard-deleted;
- posted transaction financial/identity fields remain immutable;
- canonical `posted -> voided` remains available only with required void metadata;
- allocations attached to posted/voided Project payment transactions cannot be updated or deleted after posting;
- initial allocation and reversal/refund allocation INSERT paths remain available;
- legacy `update_customer_project_payment` and `delete_customer_project_payment` RPC ABIs remain present but fail closed before mutation;
- a Payment Plan with posted/voided allocation history cannot be hard-deleted;
- an unallocated Payment Plan can still use the existing controlled delete path;
- Finance-bridged Project payment source/allocation history remains protected by the F5A bridge guards;
- bridged cash corrections remain owned by canonical Finance Customer Receipt void/reversal;
- the Admin Project Finance surface no longer advertises posted-payment Edit/Delete operations.

F5C does not create a replacement payment ledger, backfill Project history into Finance, or silently mutate canonical Finance history.

## TDD / CI evidence

The initial PR run was intentionally RED. `Admin Project Base` run `34063302639` passed the existing Project Base, financial rollup, Project Payment Ledger and legacy edit/delete contracts, then failed at the new F5C contract because the implementation artifacts did not yet exist.

After implementation, the final PR head `b8a8a9f5c880bf672a0321ec5ffbda41aeb54bee` passed fresh merge gates:

- `Admin Project Base` run `34094698525` / run number `409` — GREEN, including F5C, legacy ledger/edit-delete/simple-flow and later Project contracts;
- `Store Core CI` run `34094698629` / run number `763` — GREEN;
- `Admin UI Foundation` run `34094698641` / run number `2189` — GREEN, including strict UI/RBAC, TypeScript, lint and production build.

No F5C migration was applied before PR #345 merged.

## Production migration

Production Supabase project: `bzjoeernnmvuhzyvbowc`.

Canonical repository migration:

- `20260907090000_a6_f5c_project_payment_hardening.sql`

Applied production migration version:

- `20260907090811 — a6_f5c_project_payment_hardening`

The version timestamp recorded by production is the Supabase migration-history version generated at application time; the applied SQL is the merged canonical F5C migration.

## Production acceptance

Acceptance was executed against production using an authenticated active Admin/Finance-capable identity and controlled fixtures inside an explicit transaction that ended with `ROLLBACK`.

| Scenario | Production result |
| --- | --- |
| posted direct UPDATE | GREEN — rejected by immutable posted-transaction guard |
| posted direct DELETE | GREEN — rejected; posted/voided history cannot be hard-deleted |
| legacy update RPC | GREEN — fails closed and leaves transaction/allocation unchanged |
| legacy delete RPC | GREEN — fails closed and leaves transaction/allocation unchanged |
| posted allocation UPDATE | GREEN — rejected |
| posted allocation DELETE | GREEN — rejected |
| allocated Payment Plan delete | GREEN — rejected while posted history exists |
| unallocated Payment Plan delete | GREEN — canonical controlled delete remains available |
| unallocated Project payment void | GREEN — canonical void succeeds and records `voided` state |
| allocated Project payment reversal | GREEN — original ID/history remains and append-only reversal is created |
| Project payment → Finance bridge | GREEN — matching Customer/Invoice/currency/amount allocation links successfully |
| bridged Project-side correction | GREEN — blocked by bridge ownership guard |
| Finance-side correction | GREEN — canonical Customer Receipt void succeeds and owns correction |
| synthetic Finance movement | GREEN — Project-only F5C operations create zero Finance transactions |
| authenticated boundary | GREEN — acceptance executes under the intended authenticated role boundary |

Production acceptance result: **15 / 15 GREEN**.

## Rollback / residue

The acceptance transaction ended with explicit `ROLLBACK`.

Fresh post-rollback verification:

- acceptance Payment Plan residue: `0`
- acceptance Project payment transaction residue: `0`
- acceptance Finance transaction residue: `0`
- acceptance Project→Finance bridge residue: `0`
- acceptance Payment Plan audit residue: `0`
- temporary existing Invoice restored to `draft`
- temporary existing Invoice restored to `paid_amount=0`
- temporary existing Invoice restored to `issued_at=NULL`

No acceptance fixture remained in production.

## Production deployment smoke

The Admin production deployment is `READY` on merge commit `4a785c37e5e6384545d9f12b79a200402f54899f`, with Git root `modulex-admin` and aliases including `admin.oakwellcabinetry.com`.

That production artifact contains the #345 Admin changes that remove destructive posted-payment Edit/Delete affordances. The public unauthenticated smoke is intentionally limited by the Admin session boundary; database acceptance is the authoritative mutation proof.

The same current-main Admin artifact also resolves `/finance/ar-aging` HTTP `200` with title `AR Aging | Modulex Admin`, confirming the prior F5B deployment skew is closed.

## Advisors

Fresh Supabase Security and Performance Advisors were reviewed after F5C migration and acceptance. No F5C-specific blocking finding was identified.

The production project still has pre-existing Security/Performance advisor debt unrelated to this F5C migration. In particular, baseline advisor findings are not being declared clean; remaining broad RLS/function/index/policy hardening belongs to the documented F7 package. The existing `customer_project_payment_finance_links.created_by` unindexed-FK INFO also remains deferred to F7 performance hardening.

## Exit

F5C is COMPLETE: Project-specific payment workflows retain historical IDs and append-safe correction paths, destructive posted-history compatibility has been narrowed, and reconciled cash correction ownership is unambiguously Finance-owned.
