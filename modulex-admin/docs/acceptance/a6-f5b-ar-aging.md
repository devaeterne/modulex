# A6-F5B — AR Aging / Customer Balance / Customer Payment History

Status: **IMPLEMENTED IN DRAFT PR — PRODUCTION MIGRATION / ACCEPTANCE PENDING OWNER MERGE**
Date: 2026-09-06

## Scope

A6-F5B adds read-only Accounts Receivable projections over existing Customer Invoice, Finance Customer Receipt and Project-payment compatibility truth. It does not create a parallel AR balance ledger and it does not narrow the remaining Project-payment compatibility exception reserved for F5C.

Canonical implementation:

- Admin SQL: `modulex-admin/sql/a6-finance-ar-aging.sql`
- Store migration mirror: `modulex-store/supabase/migrations/20260906212500_a6_finance_ar_aging.sql`
- Contract: `modulex-admin/scripts/a6-finance-ar-aging-contract.mjs`
- Admin route: `/finance/ar-aging`

The Admin SQL and Store migration mirror must remain byte-identical.

## Read-model contract

### Invoice settlement

Invoice paid/outstanding projection uses the same reconciliation semantics already accepted for F5A:

1. Posted Finance `customer_receipt` allocations to the Invoice add settlement.
2. Posted Finance `reversal` transactions of Customer Receipts subtract settlement.
3. Posted Project payment allocations remain compatibility settlement only while they are not Finance-bridged.
4. A Project payment linked through `customer_project_payment_finance_links` is excluded from the Project component, preventing the same cash event from being counted twice.
5. Reconciled paid amount is clamped to `0..invoice.total_amount`.
6. Voided/draft Invoices are not receivables.

F5B does not mutate `customer_invoices.paid_amount/status`; F5A remains the canonical synchronization boundary for those source-document convenience fields.

### Aging

Open receivables are bucketed as of the requested date:

- `current`: due date is null or due date >= as-of date
- `1_30`: 1–30 days past due
- `31_60`: 31–60 days past due
- `61_90`: 61–90 days past due
- `90_plus`: >90 days past due

Fully settled Invoices remain available in Customer Invoice balance history but are excluded from open AR aging.

### Currency

Payment History uses the stored Finance transaction-time `base_currency_code`, `base_amount`, and Finance FX snapshot semantics.

Customer Invoices currently do not own a separate historical base amount / FX snapshot. Therefore an open Invoice denominated in a non-base currency is retained in source currency but its F5B base outstanding amount is `NULL` / `unconverted=true`; affected base-currency aggregates fail closed as unavailable rather than applying a current or invented FX rate.

### Security

- all private F5B cores require `private.finance_assert_view()`
- private cores are `SECURITY DEFINER` with pinned empty `search_path`
- private cores remain revoked from browser roles
- public wrappers are authenticated-only `SECURITY DEFINER` bridges with pinned empty `search_path`
- no RLS/GRANT widening is introduced for source tables

## Admin surfaces

`/finance/ar-aging` provides:

- AR Aging summary and Current / 1–30 / 31–60 / 61–90 / 90+ buckets
- Customer-filtered open Invoice aging
- Customer Balance rollup
- Invoice-level paid/outstanding drill-down
- canonical Customer Payment History including receipt void/reversal state and Project bridge attribution
- server-side search/filter/pagination
- explicit unconverted FX warning instead of fabricated base totals

The Finance Overview and Finance sidebar link to the AR workspace under `finance.view`.

## TDD evidence

RED was captured before implementation on GitHub Actions run `34060993909`:

- Finance Core contract: PASS
- F5A Customer Receipts contract: PASS
- AP Aging contract: PASS
- F5B AR contract: FAIL because F5B implementation artifacts did not yet exist

GREEN final-head evidence is recorded below only after the draft PR CI passes.

## Pre-merge verification

- [ ] `Admin A6 Finance Core` final-head GREEN, including F5B AR contract
- [ ] `Admin UI Foundation` final-head GREEN, including strict UI, RBAC, typecheck, lint and production build
- [ ] Store migration mirror regression gate GREEN where triggered
- [ ] CI workflow architecture contract GREEN after extending the existing Finance workflow
- [ ] SQL/migration byte-identical contract GREEN
- [ ] draft PR remains unmerged and production migration remains unapplied

## Production acceptance matrix — run only after owner merge

Production migration must not be applied before the implementation PR is merged by the project owner.

Preferred acceptance is transaction-scoped with explicit `ROLLBACK`; where an existing source fixture cannot be safely exercised transactionally, use read-only verification or canonical Finance reversal/void and confirm zero residue.

| Scenario | Expected result | Status |
| --- | --- | --- |
| unpaid Invoice | full Invoice total remains outstanding in correct bucket | pending |
| partially paid Invoice | Finance/project reconciled paid amount reduces outstanding exactly once | pending |
| fully paid Invoice | excluded from open aging; visible as paid in Invoice history | pending |
| voided Customer Receipt | voided receipt contributes zero current settlement | pending |
| reversed Customer Receipt | reversal reopens Invoice outstanding | pending |
| Project-only posted payment | unbridged Project allocation remains compatibility settlement | pending |
| Project → Finance bridge | canonical Finance receipt is counted; Project side is excluded | pending |
| no double counting | bridged cash never appears in both Finance and Project settlement components | pending |
| aging boundaries | current, day 1, day 30, day 31, day 60, day 61, day 90 and day 91 map correctly | pending |
| Customer totals | Customer rollup equals the sum of its Invoice-level projection | pending |
| pagination/filter | total_count, limit/offset, Customer, bucket/state and search filters are stable | pending |
| Finance permission | finance-view role succeeds; unauthorized authenticated role fails closed | pending |
| cross-Customer isolation | Customer-scoped Invoice/history reads return only the requested Customer | pending |
| foreign-currency Invoice without Invoice FX snapshot | source-currency balance remains visible; base aggregate is unavailable/unconverted | pending |
| Payment History FX | posted Finance history reports stored transaction-time base amount/snapshot | pending |

## Production closeout — pending

After owner merge:

1. re-read execution-time `main` and open PRs;
2. apply only the merged canonical F5B migration to production;
3. run the acceptance matrix through the authenticated Finance boundary where applicable;
4. run fresh Supabase Security + Performance Advisors because the package adds SECURITY DEFINER read RPCs and reporting queries;
5. verify the current-main Vercel Admin deployment and authenticated `/finance/ar-aging` surface;
6. confirm acceptance creates no residual test Finance/Project/Invoice data;
7. only then mark F5B COMPLETE and advance the Finance plan to F5C.
