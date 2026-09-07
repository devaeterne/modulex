# A6-F7 — Finance Hardening & Production Acceptance

Status: **IMPLEMENTATION / PRE-MERGE VERIFICATION**
Date: 2026-09-07

## Scope

A6-F7 is the closing hardening package for the locked A6 operational Finance architecture. It does not introduce a new ledger, change Finance ownership, or widen source-domain permissions.

Canonical artifacts:

- Admin SQL: `modulex-admin/sql/a6-finance-f7-hardening.sql`
- Store migration mirror: `modulex-store/supabase/migrations/20260907123000_a6_finance_f7_hardening.sql`
- Contract: `modulex-admin/scripts/a6-finance-f7-hardening-contract.mjs`
- Existing CI owner: `.github/workflows/admin-a6-finance-core.yml`
- Draft PR: `#349 — chore(finance): harden A6 F7 production boundaries`

The Admin SQL and Store migration mirror must remain byte-identical. The migration is intentionally index-only and must not rewrite Finance business data or alter RLS/RPC/RBAC behavior.

## Pre-merge baseline

- Execution-time baseline was refreshed to current `main` `bd0f2afe765681415c6e34fe0c342457819c8bf6` after parallel VAL-3 PR #348 merged.
- The initial F7 RED head was `e4fc1f4806e2ea1864a905379bdc4f5928c43692`.
- Admin A6 Finance Core run `#322` kept F1–F6 contracts GREEN and failed only on `Missing A6-F7 artifact: sql/a6-finance-f7-hardening.sql`.
- Production Performance Advisor was read before implementation. F7 only addresses Finance-owned / Finance-integration `unindexed_foreign_keys` findings with covering indexes; unrelated project-wide findings and `unused_index` INFO findings are not treated as permission to delete indexes.
- Production Security Advisor flags reviewed public `SECURITY DEFINER` wrappers. This is classified against the locked architecture: direct execution remains authenticated-only and authorization remains inside private role-checked Finance cores with pinned empty `search_path`. F7 must not weaken that boundary merely to silence a generic linter warning.

## RLS/RPC/RBAC hardening contract

F7 preserves the existing authorization chain:

`Admin permission -> public authenticated wrapper -> private role-checked core -> RLS/grants/lifecycle guards -> audit`

Production acceptance must verify:

- unauthenticated/anon Finance reads and writes fail closed;
- `finance.view` can execute read projections but cannot gain `finance.manage` mutations;
- Finance mutation wrappers remain authenticated-only;
- private Finance cores remain non-executable by browser roles;
- reviewed `SECURITY DEFINER` wrappers retain pinned empty `search_path`;
- source-domain permissions (HR, Project, Customer, Vendor) are not broadened by Finance hardening.

## Idempotency and concurrency

The canonical Finance Core already serializes same-key retries with `pg_advisory_xact_lock` and enforces unique `(operation, idempotency_key)` ownership. F7 keeps this contract and adds final acceptance coverage rather than introducing another idempotency table.

Post-merge rollback-only acceptance must prove:

- exact same-key/same-fingerprint retry returns the original result;
- same-key/different-fingerprint retry fails closed;
- concurrent/same-key behavior cannot create duplicate Finance movement;
- Vendor Payment, Customer Receipt and Employee Payment paths continue to converge on canonical Finance idempotency/transaction ownership;
- failed domain validation does not leave orphan draft/idempotency state.

## Append-safe correction and FX snapshot

Post-merge acceptance must re-prove:

- posted Finance history cannot be silently edited or hard-deleted;
- permitted void remains lifecycle-guarded;
- reversal is append-safe, links back through `reversal_of_transaction_id`, and offsets cash/reporting/allocation effect;
- historical reporting uses stored `base_currency_code`, `base_amount` and FX snapshot fields;
- foreign-currency rows without an authoritative historical snapshot fail closed where the source document cannot supply one;
- no current FX rate is invented for historical reconciliation.

## Allocation reconciliation

Read-only reconciliation and rollback-only behavioral acceptance must cover:

- no Finance link allocation total exceeds its source transaction amount;
- Project/Order/Customer/Vendor/Employee attribution remains contextual and never becomes universal ownership;
- Customer Receipt -> Invoice settlement reconciles to AR without double counting bridged Project payments;
- Vendor Payment allocations reconcile to AP and reversals;
- Payroll/Employee Payment settlement effects reconcile to Finance transactions;
- Project Finance actuals consume explicit Finance allocations only;
- reversal attribution offsets the original allocation deterministically.

## Migration / reconciliation gate

Before production migration after owner merge:

- verify the target foreign-key columns still lack covering indexes and that no parallel migration has added equivalent indexes;
- verify current production schema contains every target table/column;
- verify the migration remains index-only and contains no DML/backfill;
- compare Admin SQL and Store migration mirror byte-for-byte.

After migration:

- confirm every F7 covering index exists;
- rerun Performance Advisor and classify only F7/Finance findings;
- rerun Security Advisor and confirm no new Finance authorization finding was introduced;
- run the reconciliation queries and ensure no orphan, over-allocation or bridge double-count result appears.

## Signed-in Admin production acceptance

After owner merge and production migration, signed-in Admin acceptance must cover at least:

- Finance Overview;
- Transactions / Cash & Bank;
- Expenses;
- Vendor/AP surfaces and AP Aging;
- Customer Receipts and AR Aging;
- Finance Reports;
- Project Finance actuals under `finance.view`;
- permission-denied behavior for a user without Finance access.

The final acceptance record must capture deployment SHA, production migration version, smoke outcomes, Security Advisor classification, Performance Advisor classification, and reconciliation results.

## ROLLBACK discipline

Any production behavioral fixture used for idempotency, concurrency, append-safe reversal, FX snapshot, allocation reconciliation, AR/AP, Payroll or Project bridge verification must run inside an explicit transaction ending in `ROLLBACK`. Residue counts must be checked after rollback. Read-only production checks are preferred where mutation is unnecessary.

## Pre-merge exit criteria

- F1–F6 contracts GREEN on the exact F7 head;
- F7 contract GREEN;
- CI workflow architecture contract GREEN after modifying the existing Finance workflow;
- F7 Admin SQL and Store migration mirror byte-identical;
- F6 production closeout documentation corrected;
- Finance plan and Admin roadmap show F7 active, not complete;
- no F7 production migration applied before owner merge.

F7 must remain in progress until the separate post-merge production acceptance above is complete.
