# A6-F5A — Customer Receipts / AR Bridge Production Acceptance

Status: **COMPLETE / PRODUCTION VERIFIED — 2026-09-06**

Scope: canonical Customer Receipts, Customer Invoice reconciliation, and the compatibility bridge from existing Project customer-payment history into Finance Core.

## Architecture verified

- Finance Core remains the canonical money-movement ledger.
- New customer cash receipts use `finance_transactions(transaction_kind='customer_receipt')`.
- Invoice allocation uses `finance_transaction_links` with `source_document_type='customer_invoice'`.
- Customer / Order / Project context is attribution, not Finance ownership.
- Existing `customer_project_payment_*` source history is preserved; no destructive backfill and no fabricated historical Finance transactions were introduced.
- Explicitly bridged Project payments are excluded from the Invoice Project-payment component so one cash event is never counted twice.
- Posted Finance history is corrected through canonical void/reversal behavior rather than in-place edits.

## Production migrations

Production Supabase project: `bzjoeernnmvuhzyvbowc`.

Applied migrations:

1. `20260906202606` — `a6_finance_customer_receipts`
2. `20260906203738` — `a6_f5a_customer_receipts_rpc_hardening`
3. `20260906205554` — `a6_f5a_customer_receipts_uuid_aggregate_fix`

The rollout exposed and corrected three production-only/runtime defects without rewriting already-applied migration history:

- the original F5A Invoice validator mixed a `%rowtype` record and scalar in one `SELECT ... INTO` target list; PR #339 separated the Invoice lock from Project lookup;
- public wrappers were `SECURITY INVOKER` while private Finance cores were intentionally revoked from browser roles; PR #340 aligned all seven public F5A wrappers with the canonical authenticated `SECURITY DEFINER` + `search_path=''` bridge pattern;
- the Customer Receipts page projection used `max(uuid)`, which PostgreSQL does not provide; PR #341 replaced it with a UUID-native ordered aggregate.

## TDD / CI evidence

Runtime-fix evidence:

- Invoice row-lock regression: RED Finance Core #252; GREEN Finance Core #257; Store Core #730; Admin UI Foundation #2111.
- Authenticated RPC bridge regression: RED Finance Core #260; GREEN Finance Core #261; Store Core #733; Admin UI Foundation #2116.
- UUID aggregate regression: production `42883 function max(uuid) does not exist`; RED Finance Core #269; GREEN Finance Core #271; Store Core #738; Admin UI Foundation #2129.

Admin SQL and Store migration mirrors were kept byte-identical for each corrective migration.

## Authenticated production smoke

Production role-boundary smoke used an active Admin profile through the authenticated role boundary. No browser grants were widened for testing.

Verified:

- `get_customer_receipt_reference_data()` executes through the hardened public wrapper;
- `get_customer_receipt_invoices(customer_id)` returns the rollback-only issued Invoice fixture as an open receivable;
- `get_customer_receipts_page(...)` executes after the UUID aggregate fix and resolves the receipt Customer UUID correctly;
- PUBLIC / anon execution remains revoked while authenticated execution is explicit;
- public wrappers use `SECURITY DEFINER` with pinned empty `search_path`; private cores retain Finance role assertions.

A PostgREST schema-cache desynchronization observed immediately after migration was resolved with schema reload; the parameterless reference-data RPC was then re-smoked successfully.

## Controlled production acceptance

Acceptance ran inside one explicit transaction and ended with `ROLLBACK`. An existing draft Invoice was temporarily issued only inside that transaction and was restored automatically by rollback.

Scenario result: `F5A_CUSTOMER_RECEIPTS_PASS`.

Verified sequence:

1. Open Invoice balance: `$279.00` USD.
2. Record `$100.00` Customer Receipt through `public.record_customer_receipt(...)`.
   - Finance Customer Receipt posts successfully.
   - canonical Invoice allocation link exists.
   - Invoice becomes `partially_paid`, `paid_amount = 100.00`.
3. Retry the exact same mutation with the same idempotency key.
   - same Finance transaction ID is returned;
   - no duplicate Finance row is created.
4. Negative cases fail closed:
   - `$180.00` allocation against `$179.00` remaining balance;
   - wrong Customer;
   - wrong currency.
5. Record the remaining `$179.00`.
   - Invoice becomes `paid`, `paid_amount = 279.00`.
6. Void that receipt through `public.void_customer_receipt(...)`.
   - canonical Finance status becomes `voided`;
   - Invoice reopens to `partially_paid`, `paid_amount = 100.00`.
7. Re-settle `$179.00` with a new Finance Customer Receipt.
8. Create matching Project payment requirement/payment through the existing canonical Project payment RPCs.
9. Bridge the Project payment to the Finance Customer Receipt.
   - bridge row exists;
   - bridged Project payment contribution to the Invoice projection becomes zero;
   - Finance contribution remains `$279.00`;
   - Invoice remains `paid = 279.00` with no double counting.
10. Attempt Project-side reversal of the bridged payment.
    - blocked fail-closed; correction must occur through Customer Receipts.
11. Reverse the bridged Finance Customer Receipt through `public.reverse_customer_receipt(...)`.
    - posted Finance reversal is created;
    - Invoice reopens to `partially_paid`, `paid_amount = 100.00`.

Internal double-counting proof was performed under the database owner only for read/assertion access to protected Project source tables. User-facing mutation/read behavior remained tested through the authenticated public RPC boundary.

## Rollback / residue proof

After explicit rollback:

- acceptance Finance receipt residue: `0`
- acceptance Project payment residue: `0`
- acceptance Project payment requirement residue: `0`
- acceptance Finance bridge residue: `0`
- original Invoice status restored to `draft`
- original Invoice `paid_amount` restored to `0.0000`

No production cash history or source-document state from the acceptance run remains.

## Advisors

Fresh Security Advisor results contain no F5A-specific blocking finding. The remaining warning is the project-level leaked-password-protection setting, which is outside the F5A ledger/RPC boundary.

Fresh Performance Advisor results contain no F5A runtime blocker. The new bridge table has an informational unindexed-FK finding for `created_by`; this is non-blocking and is tracked for the broader F7 performance-hardening pass rather than changing the already-GREEN F5A business contract.

## Production deployment / route

Vercel Admin production is `READY` on current `main` commit `e2c04c92ec901f190fc3db8a9209b0b88b730e47` (`fix(finance): repair F5A customer UUID aggregation (#341)`).

Production fetch of `/finance/customer-receipts` returned HTTP `200`, matched the expected route, loaded the dedicated Customer Receipts page bundle, and exposed the expected page metadata. Without a browser session the route correctly remained at the Admin `Checking session...` boundary.

## Exit

F5A is complete when Customer Receipts are canonical Finance money movements, Invoice settlement is Finance-derived, legacy Project payment history can be reconciled without duplication, bridged source history is protected from conflicting Project-side correction, and production acceptance leaves zero test residue.

**F5A exit is GREEN. Next package: A6-F5B — AR Aging / Customer Balance.**
