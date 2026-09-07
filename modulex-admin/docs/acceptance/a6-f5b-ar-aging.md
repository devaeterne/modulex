# A6-F5B — AR Aging / Customer Balance / Customer Payment History

Status: **COMPLETE / PRODUCTION VERIFIED 2026-09-07**
Date: 2026-09-07

## Scope

A6-F5B adds read-only Accounts Receivable projections over existing Customer Invoice, Finance Customer Receipt and Project-payment compatibility truth. It does not create a parallel AR balance ledger.

Canonical implementation:

- Admin SQL: `modulex-admin/sql/a6-finance-ar-aging.sql`
- Store migration mirror: `modulex-store/supabase/migrations/20260906212500_a6_finance_ar_aging.sql`
- Contract: `modulex-admin/scripts/a6-finance-ar-aging-contract.mjs`
- Admin route: `/finance/ar-aging`
- Implementation PR: `#343 — feat(finance): add F5B AR aging and customer balances`
- Merge commit: `b85c4a1063233a6eaf0ede06095f007e4e9be84f`

The Admin SQL and Store migration mirror are byte-identical by contract.

## Read-model contract

### Invoice settlement

Invoice paid/outstanding projection uses the same reconciliation semantics accepted for F5A:

1. Posted Finance `customer_receipt` allocations to the Invoice add settlement.
2. Posted Finance reversals of Customer Receipts subtract settlement.
3. Posted Project payment allocations remain compatibility settlement only while they are not Finance-bridged.
4. A Project payment linked through `customer_project_payment_finance_links` is excluded from the Project component, preventing the same cash event from being counted twice.
5. Reconciled paid amount is clamped to `0..invoice.total_amount`.
6. Voided/draft Invoices are not receivables.

F5B does not create or maintain a second Invoice paid/status truth. F5A remains the canonical synchronization boundary for source-document convenience fields.

### Aging

Open receivables are bucketed as of the requested date:

- `current`: due date is null or due date >= as-of date
- `1_30`: 1–30 days past due
- `31_60`: 31–60 days past due
- `61_90`: 61–90 days past due
- `90_plus`: >90 days past due

Fully settled Invoices remain available in Customer Invoice balance history but are excluded from open AR aging.

### Currency

Payment History uses stored Finance transaction-time `base_currency_code`, `base_amount`, and Finance FX snapshot semantics.

Customer Invoices do not own a separate historical base amount / FX snapshot. Therefore an open Invoice denominated in a non-base currency is retained in source currency but its F5B base outstanding amount is `NULL` / `unconverted=true`; affected base-currency aggregates fail closed as unavailable instead of applying a current or invented FX rate.

### Security

- private F5B cores require the Finance view boundary;
- private cores are `SECURITY DEFINER` with pinned empty `search_path`;
- private cores remain revoked from browser roles;
- public wrappers are authenticated-only `SECURITY DEFINER` bridges with pinned empty `search_path`;
- no source-table RLS/GRANT widening was introduced.

## Admin surfaces

`/finance/ar-aging` provides:

- AR Aging summary and Current / 1–30 / 31–60 / 61–90 / 90+ buckets;
- Customer-filtered open Invoice aging;
- Customer Balance rollup;
- Invoice-level paid/outstanding drill-down;
- canonical Customer Payment History including receipt void/reversal state and Project bridge attribution;
- server-side search/filter/pagination;
- explicit unconverted FX warning instead of fabricated base totals.

The Finance Overview and Finance sidebar link to the AR workspace under `finance.view`.

## TDD / CI evidence

RED was captured before implementation on GitHub Actions run `34060993909`: existing Finance Core, F5A and AP Aging contracts passed while the new F5B contract failed because the F5B artifacts did not yet exist.

Before merge, the final implementation head passed the Finance domain contract and Admin UI gates, including F5B AR contract, workflow architecture, strict UI/RBAC, TypeScript, lint and production build. Store migration mirror regression coverage also remained GREEN where triggered.

## Production migration

Production Supabase project: `bzjoeernnmvuhzyvbowc`.

Applied production migration:

- `20260906214953 — a6_finance_ar_aging`

The production migration was applied only after PR #343 merged.

## Production acceptance

Acceptance was executed against the production schema through the authenticated Finance boundary and controlled transaction-scoped fixtures. Mutation coverage ended in explicit `ROLLBACK`.

| Scenario | Production result |
| --- | --- |
| unpaid Invoice | GREEN — full outstanding remains in the correct bucket |
| partially paid Invoice | GREEN — reconciled settlement reduces outstanding exactly once |
| fully paid Invoice | GREEN — excluded from open aging and retained in Invoice history |
| voided Customer Receipt | GREEN — voided receipt contributes no active settlement |
| reversed Customer Receipt | GREEN — reversal reopens outstanding balance |
| Project-only posted payment | GREEN — unbridged Project allocation remains compatibility settlement |
| Project → Finance bridge | GREEN — Finance receipt is authoritative and Project component is excluded |
| no double counting | GREEN — bridged cash is counted exactly once |
| aging boundaries | GREEN — current/day 1/30/31/60/61/90/91 boundaries map correctly |
| Customer totals | GREEN — Customer rollup equals its Invoice-level projection |
| pagination/filter | GREEN — count, limit/offset, Customer/bucket/state/search behavior is stable |
| Finance permission | GREEN — Finance view succeeds; unauthorized authenticated role fails closed |
| cross-Customer isolation | GREEN — scoped reads do not leak another Customer |
| foreign-currency Invoice without Invoice FX snapshot | GREEN — source balance remains visible and base aggregate fails closed as unconverted |
| Payment History FX | GREEN — stored transaction-time Finance base amount/snapshot is used |

Acceptance residue after rollback:

- Finance receipt residue: `0`
- Project payment residue: `0`
- Project payment requirement residue: `0`
- bridge residue: `0`
- temporary Invoice fixture restored to original `draft`, `paid_amount=0` state

## Production deployment smoke

The current Admin production deployment is `READY` on `main` commit `4a785c37e5e6384545d9f12b79a200402f54899f` and owns the `admin.oakwellcabinetry.com` alias.

`https://admin.oakwellcabinetry.com/finance/ar-aging` resolves HTTP `200`, matches the `/finance/ar-aging` route, serves the `AR Aging | Modulex Admin` bundle, and unauthenticated fetch correctly stops at the `Checking session...` authentication boundary.

## Advisors

Fresh Supabase Security and Performance Advisors were reviewed after the production work. No F5B-specific blocking finding was identified. The project still has pre-existing advisor debt outside the F5B scope; that baseline is not represented as clean and remains part of F7 hardening.

## Exit

F5B is COMPLETE: Finance can answer what each Customer owes, how old the receivable is, and which canonical receipts/corrections explain the balance without introducing a parallel AR truth.
