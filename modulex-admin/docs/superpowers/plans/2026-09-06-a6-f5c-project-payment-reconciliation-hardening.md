# A6-F5C — Project Payment Reconciliation / Compatibility Hardening

## Baseline

- Execution-time `main`: `b85c4a1063233a6eaf0ede06095f007e4e9be84f`
- Open PRs at package start: none
- Branch: `feat/a6-f5c-project-payment-hardening`
- F5B production DB/auth/reconciliation acceptance: GREEN with explicit rollback and zero residue.
- F5B Admin live route remains deployment-gated because the production Admin alias is still on the older F5A deployment; this does not change the F5C database contract.

## Production facts that define F5C

1. `customer_project_payment_transactions` already blocks destructive field edits on a posted row through `private.guard_posted_project_payment_transaction()`, while still allowing the canonical `posted -> voided` transition with required void metadata.
2. The guard trigger currently fires only on `UPDATE`; a posted Project payment can still be hard-deleted.
3. Legacy `private.update_customer_project_payment(...)` bypasses posted-row immutability by deleting allocations, deleting the posted transaction, then inserting a replacement with the same ID.
4. Legacy `private.delete_customer_project_payment(...)` intentionally hard-deletes posted payment/allocation rows after writing an audit snapshot.
5. Posted allocation rows can still be updated/deleted after the cash event was posted. Payment Plan deletion also clears those allocations.
6. Finance-bridged Project payments are already protected by F5A bridge guards and corrections for bridged cash belong to canonical Finance void/reversal.
7. Unbridged Project payment correction already has canonical Project-side append-safe paths: unallocated payments may be voided and allocated payments may be reversed/refunded.

## Locked F5C design

F5C narrows the compatibility exception without rewriting history or fabricating Finance events:

- Preserve every existing Project payment ID/history row.
- Preserve the canonical `posted -> voided` transition and reversal/refund insertion paths.
- Extend the existing posted transaction guard to reject `DELETE` of posted or voided Project-payment history.
- Add a database guard that rejects `UPDATE`/`DELETE` of allocations belonging to posted or voided Project-payment transactions. Initial allocation `INSERT` remains allowed so record/allocate and reversal flows keep working.
- Replace the legacy posted-payment edit/hard-delete private cores with fail-closed compatibility stubs that preserve their public ABI but do not mutate posted history.
- Make Payment Plan deletion fail closed when it would delete allocations attached to posted/voided payment history; empty/unallocated plans retain the existing delete path.
- Remove destructive posted-payment Edit/Delete affordances from the Admin Project Finance UI and adapters. Posted history is presented as immutable; correction ownership remains canonical void/reversal (or Finance correction after a bridge).
- Do not widen RLS/GRANTs.
- Do not create a new Finance transaction, Project ledger, or backfill.
- Keep Admin SQL and Store canonical migration byte-identical.

## TDD / acceptance gates

### RED

Add `project-f5c-payment-hardening-contract.mjs` to the existing `Admin Project Base` workflow. Before implementation it must fail because the F5C SQL/migration and immutable UI contract are absent, while the pre-existing Project contracts remain green.

### GREEN implementation contract

- posted/voided Project transaction hard-delete rejected at DB trigger level;
- canonical void transition remains explicitly allowed;
- posted/voided allocation update/delete rejected;
- initial/reversal allocation inserts are not blocked;
- legacy update/delete RPC ABI remains callable but fails closed before any mutation;
- allocated Payment Plan hard-delete fails closed;
- unallocated Payment Plan deletion remains available;
- Admin Project Finance no longer advertises destructive posted payment Edit/Delete;
- canonical record/allocate/void/reversal APIs remain present;
- F5A bridge guards remain untouched;
- Admin/Store SQL mirror is byte-identical.

### Post-merge production acceptance

Run only after owner merge and migration application. Use authenticated Admin/Finance boundaries and an explicit transaction ending in `ROLLBACK` to prove:

- posted direct UPDATE fails;
- posted direct DELETE fails;
- legacy `update_customer_project_payment` fails without changing the row/allocation;
- legacy `delete_customer_project_payment` fails without changing the row/allocation;
- posted allocation UPDATE/DELETE fails;
- allocated Payment Plan deletion fails;
- unallocated Payment Plan deletion still works within the rollback transaction;
- unallocated payment canonical void succeeds;
- allocated payment canonical reversal succeeds and keeps original ID/history;
- bridged Project-side mutation/correction remains blocked and Finance correction ownership is unchanged;
- no synthetic Finance rows are created;
- rollback residue is zero.
