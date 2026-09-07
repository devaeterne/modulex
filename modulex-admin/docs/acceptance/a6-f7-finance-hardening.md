# A6-F7 — Finance Hardening & Production Acceptance

Status: **COMPLETE / PRODUCTION VERIFIED 2026-09-07**
Date: 2026-09-07

## Scope

A6-F7 closes the locked A6 operational Finance delivery sequence without introducing another ledger, changing Finance ownership, or widening source-domain permissions.

Canonical artifacts:

- Admin SQL: `modulex-admin/sql/a6-finance-f7-hardening.sql`
- Store migration mirror: `modulex-store/supabase/migrations/20260907123000_a6_finance_f7_hardening.sql`
- Contract: `modulex-admin/scripts/a6-finance-f7-hardening-contract.mjs`
- Existing CI owner: `.github/workflows/admin-a6-finance-core.yml`
- Implementation PR: `#349 — chore(finance): harden A6 F7 production boundaries`
- Merge SHA: `c9dcebc552d61b79ed4609e670a9df2dda58b78c`
- Production migration: `20260907114208 — a6_finance_f7_hardening`

The Admin SQL and Store migration mirror are byte-identical. The migration is deliberately narrow: covering indexes for Finance-owned / Finance-integration foreign keys plus one targeted execute revoke on an internal private trigger helper. It contains no Finance business-data rewrite/backfill, public GRANT widening, or function-body rewrite.

## TDD / pre-merge evidence

- F7 was rebased onto execution-time current `main` after parallel VAL-3 work merged.
- Initial F7 RED head: `e4fc1f4806e2ea1864a905379bdc4f5928c43692`.
- Admin A6 Finance Core run `#322` kept F1–F6 contracts GREEN and failed only on the intentionally missing F7 implementation artifact.
- The existing Finance workflow was extended; no parallel workflow wrapper was introduced.
- Production Performance Advisor was inspected before implementation. The package targeted 24 Finance-owned / Finance-integration `unindexed_foreign_keys` findings only; unrelated project-wide debt and `unused_index` INFO findings were not treated as permission to delete indexes.
- Production ACL/catalog inspection found one real deviation: `private.guard_allocated_vendor_payment_void()` retained default EXECUTE for PUBLIC/anon/authenticated. The F7 migration revokes exactly that browser exposure.

## Production migration acceptance

Immediately before migration:

- target covering indexes: **24**;
- already present: **0**;
- missing: **24**;
- `private.guard_allocated_vendor_payment_void()` executable by PUBLIC/anon/authenticated: **yes / yes / yes**.

After applying `20260907114208 — a6_finance_f7_hardening`:

- target covering indexes present: **24/24**;
- missing target indexes: **0**;
- private trigger helper executable by PUBLIC/anon/authenticated: **no / no / no**;
- no F7 business-data backfill or rewrite occurred.

## RLS / RPC / RBAC acceptance

A production authenticated-role catalog and behavioral pass verified:

- reviewed Finance private cores executable by browser roles: **0**;
- reviewed public Finance wrappers executable by PUBLIC/anon: **0**;
- reviewed public Finance wrappers missing authenticated EXECUTE: **0**;
- reviewed SECURITY DEFINER public Finance wrappers with an invalid/unpinned empty `search_path`: **0**;
- a real Finance-authorized application profile can execute Finance reads and canonical mutations;
- a real active Sales-only application profile is rejected with `42501` for both Finance read and Finance mutation boundaries;
- source-domain permissions were not widened by F7.

This re-confirms the locked chain:

`Admin permission -> public authenticated wrapper -> private role-checked core -> RLS/grants/lifecycle guards -> audit`

## Idempotency, posting and correction acceptance

A Finance-authorized production application role exercised the canonical Finance Core inside an explicit transaction ending in `ROLLBACK`:

1. created a temporary USD deposit draft;
2. exact same-key / same-fingerprint retry returned the original transaction ID;
3. same-key / different-fingerprint retry failed closed;
4. posting produced the canonical base-currency snapshot;
5. posted draft-edit and draft-delete paths failed closed;
6. reversal created a new posted `reversal` transaction linked through `reversal_of_transaction_id`;
7. reversal swapped the original account side and preserved amount/base-amount semantics;
8. final Finance transaction and idempotency residue: **0 / 0**.

Production structural concurrency verification additionally confirmed:

- `private.finance_idempotency_existing(...)` still contains `pg_advisory_xact_lock`;
- `finance_idempotency_requests` still owns a unique `(operation, idempotency_key)` constraint.

F3/F4/F5 production acceptance remains authoritative for Vendor Payment, Employee/Payroll Payment and Customer Receipt domain-specific retries/reconciliation; F7 did not manufacture replacement source-domain fixtures merely to duplicate those already accepted behaviors.

## FX snapshot acceptance

A Finance-authorized production application role created a temporary EUR Finance account and EUR deposit inside an explicit transaction ending in `ROLLBACK`.

The transaction was posted with an explicit manual EUR→USD rate of `1.25` and production stored:

- transaction amount: `EUR 10.00`;
- base currency: `USD`;
- stored FX rate: `1.25`;
- stored base amount: `USD 12.50`;
- stored source: `manual:F7 acceptance manual rate`.

After rollback:

- temporary EUR account residue: **0**;
- temporary F7 Finance transaction residue: **0**;
- existing posted foreign-currency Finance rows missing a required stored snapshot: **0**.

No current FX rate was substituted for historical reporting.

## Allocation / reconciliation acceptance

Read-only production reconciliation returned:

- Finance transactions whose link allocation total exceeds source amount: **0**;
- broken Finance transaction links: **0**;
- broken reversal linkage: **0**;
- Project/Order/Customer context mismatches on Finance links: **0**;
- reversal attribution mismatches: **0**;
- Project-payment bridge broken/duplicate rows: **0**;
- Vendor allocation broken/currency-mismatch/out-of-bounds rows: **0**;
- Payroll settlement orphan/invalid-state rows: **0**.

At this final F7 scan, the bridge, Vendor payment-allocation and Payroll settlement-state/effect tables had no active production rows to reconcile. Their behavior is therefore not re-invented from empty data; the already completed F3/F4/F5 rollback acceptance remains the behavioral evidence for those domain paths.

## Security / Performance Advisors

Fresh post-migration Advisors were reviewed.

### Performance Advisor

- the 24 F7 target `unindexed_foreign_keys` findings are closed;
- the newly created F7 indexes can immediately appear as `unused_index` INFO because production has not yet accumulated workload against them; that is expected and is **not** a removal signal;
- remaining unindexed-FK / policy / unused-index findings belong to unrelated project domains and remain separate backlog.

### Security Advisor

- F7 introduced no new Finance authorization blocker;
- the reviewed public Finance SECURITY DEFINER wrappers remain an intentional authenticated-only bridge to private role-checked cores with pinned empty `search_path`;
- direct catalog verification confirms no reviewed Finance public wrapper is executable by PUBLIC/anon and no reviewed Finance private core is browser-executable after F7.

## Admin production smoke

PR #349 changes SQL/docs/CI only, so it does not require a new Admin application bundle. Vercel production remains `READY` on the existing current runtime lineage while the F7 database hardening is live.

Fresh production route smoke returned HTTP `200` with the expected Modulex title/bundle and session boundary for:

- `/finance` — Finance Overview;
- `/finance/transactions` — Finance Transactions;
- `/finance/expenses` — Finance Expenses;
- `/finance/bills` — Vendor Bills;
- `/finance/customer-receipts` — Customer Receipts;
- `/finance/ap-aging` — AP Aging;
- `/finance/ar-aging` — AR Aging;
- `/finance/reports` — Finance Reports.

Production runtime logs contained **0 Finance error/fatal entries** in the inspected two-hour window.

F7 does not add or alter Admin UI behavior. The signed-in browser behavior of F1–F6 remains covered by those phases' production acceptance; F7 re-verifies the production application-role/RPC boundary and deployed route/session bundles rather than claiming a new UI workflow that does not exist.

## ROLLBACK discipline

All F7 production behavioral fixtures were transaction-scoped and ended in explicit `ROLLBACK`. Final acceptance checks found:

- F7 Finance transaction residue: **0**;
- F7 idempotency residue: **0**;
- F7 temporary Finance account residue: **0**.

## Exit

**A6-F7 is COMPLETE / PRODUCTION VERIFIED.**

The A6 F0→F7 operational Finance foundation is closed. Future Finance work must be proposed as a new explicitly scoped package and must preserve the neutral Finance Core, append-safe correction, stored FX snapshots, contextual allocation model, and existing source-domain ownership boundaries rather than reopening or duplicating the ledger.
