# PB-3A — Project Payment Edit/Delete Audit Acceptance

Date: 2026-09-03

## Scope

This follow-up adds controlled Admin/Finance correction actions to the Project customer payment ledger.

- Original posted customer payment rows can be edited from Project Finance.
- Metadata-only edits preserve existing allocations.
- Amount or currency edits clear the payment's allocations and require explicit re-allocation.
- Original posted customer payments can be hard-deleted from the live ledger.
- Hard delete removes the payment and all linked live allocations.
- Edit/delete snapshots are retained in an immutable audit table.
- Payments with reversal/refund dependency history fail closed for edit and hard delete.
- Sales remains status-only and cannot mutate payment records.

## Production migration

Applied successfully to Supabase project `bzjoeernnmvuhzyvbowc`:

- repository migration: `modulex-store/supabase/migrations/20260903150000_customer_project_payment_edit_delete_audit.sql`
- production migration name: `customer_project_payment_edit_delete_audit`
- production migration version: `20260903164638`

## CI acceptance

Functional head: `369a822b8027ce6d3f4041ac489bc4dbb67ad8d9`

- Admin Project Base `33780334613` — PASS
- Admin UI Foundation `33780334620` — PASS
- Admin Customers UI `33780334731` — PASS
- Admin A1 Core Operations `33780334724` — PASS
- GC-6 Cabinet Journey `33780334663` — PASS
- GC-7 Attributed Social Proof `33780334605` — PASS
- GC-8A Store Chrome SEO `33780334615` — PASS
- GC-8B Accessibility Performance `33780334747` — PASS

Admin UI Foundation includes strict changed-file UI checks, TypeScript, lint and production build.

## Production rollback smoke

The smoke test ran inside a PL/pgSQL exception subtransaction and deliberately rolled back all test business/audit rows before returning the result.

Verified:

- metadata-only edit preserved a `40 USD` allocation
- amount edit reported `allocation_reset=true` and cleared the allocation
- payment was re-allocated and hard-deleted successfully
- hard delete removed both the live payment and live allocation rows
- two update audit rows and one delete audit row were present before rollback
- delete audit retained the linked allocation snapshot
- audit rows rejected UPDATE with SQLSTATE `23514`
- payment with reversal history rejected both update and hard delete
- Sales update and hard delete both rejected with SQLSTATE `42501`
- audit table RLS is enabled
- `authenticated` has no direct SELECT privilege on the audit table

Post-smoke cleanup query confirmed:

- smoke transactions: `0`
- smoke audit rows: `0`
- smoke requirements: `0`

## Advisor acceptance

Security Advisor reported no new Project-payment-specific warning from this migration.

Performance Advisor reported the newly created audit indexes only as `unused_index` INFO because the new audit table has no real production usage yet. No new unindexed foreign-key finding was reported for `customer_project_payment_audit_log`.

Existing unrelated Store, Support, HR, Vendor and general index/security advisor backlog was intentionally left unchanged.

Supabase unused-index remediation reference:
https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## UI behavior

In Project Detail → Finance → Customer Payments, original posted payment rows expose:

- `Edit Payment`
- `Delete Payment`

Edit modal:

- Amount
- Currency
- Transaction date
- Reference
- Notes
- optional change note

When amount/currency changes and the payment has allocations, the UI warns that allocations will be cleared.

Delete modal:

- explains that the live payment and allocations will be permanently removed
- requires a Delete reason
- confirms that an immutable audit snapshot will remain

## Remaining boundary

This package does not expose audit-log browsing UI yet. The audit data is retained as a protected backend record for future Finance/Admin audit/history surfaces.
