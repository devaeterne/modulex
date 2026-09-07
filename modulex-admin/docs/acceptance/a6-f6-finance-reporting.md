# A6-F6 — Finance Reporting & Project Financial Projection

Status: **IMPLEMENTATION / PRE-MERGE VERIFICATION**
Date: 2026-09-07

## Scope

A6-F6 adds a read-only reporting layer over canonical Finance Core history and exposes explicitly attributed Project/Order actuals without creating another ledger.

Canonical implementation:

- Admin SQL: `modulex-admin/sql/a6-finance-reporting.sql`
- Store migration mirror: `modulex-store/supabase/migrations/20260907114500_a6_finance_reporting.sql`
- Typed client: `modulex-admin/src/lib/finance/reports.ts`
- Finance Reports route: `modulex-admin/src/app/(admin)/finance/reports/page.tsx`
- Finance Reports workspace: `modulex-admin/src/components/finance/reports/FinanceReportsWorkspace.tsx`
- Project Finance actuals: `modulex-admin/src/components/customers/project-detail/ProjectFinanceActuals.tsx`
- Contract: `modulex-admin/scripts/a6-finance-reporting-contract.mjs`
- Implementation plan: `modulex-admin/docs/superpowers/plans/2026-09-07-a6-f6-finance-reporting-project-projection.md`
- Implementation PR: `#347 — feat(finance): add A6 F6 reporting and project actuals`

The Admin SQL and Store migration mirror are required to remain byte-identical by contract.

## Locked reporting behavior

- reporting reads canonical posted Finance Core transactions only;
- company cash direction is derived from canonical source/destination account sides;
- operational income recognizes canonical Customer Receipt events;
- operational expense recognizes canonical Expense, Vendor Payment and Employee Payment events;
- deposit, withdrawal, transfer and refund events remain visible as cash movement and are not silently reclassified as operating income/expense;
- reversal transactions preserve the original business kind and reverse its reporting effect deterministically;
- base-currency reporting uses stored transaction-time Finance base snapshots;
- missing historical base snapshots fail closed as unavailable instead of substituting a current FX rate;
- AR and AP cards reuse the existing canonical AR Aging and AP Aging summary RPCs rather than copying their logic;
- account movement reporting is derived from posted Finance transaction history and maintains no balance snapshot;
- Project/Order actuals include only explicit Finance allocation links;
- Project/Order attribution is never inferred from Customer, Invoice, Vendor or source-document references;
- Project allocation base value is derived proportionally from the posted Finance transaction base snapshot;
- the existing commercial/current-cost `ProjectFinancialSummary` remains a separate commercial profitability view and is not relabeled as Finance actuals;
- Finance reporting remains behind the existing `finance.view` authorization boundary.

## User surfaces

### Finance Reports

`/finance/reports` provides:

- reporting-period filters;
- operating income, operating expense and operating result;
- net cash change;
- canonical Open AR and Open AP summary reuse;
- monthly cash-flow series;
- Finance account movement history;
- Project Finance actuals with Project navigation.

### Project Finance

The Project Finance workspace keeps two independent permission domains:

- `finance.view` exposes canonical Finance actuals;
- existing Project payment permissions continue to control Customer collection/payment workflows.

No Project payment permission is broadened merely to expose Finance reporting, and no Finance permission is used to mutate the legacy Project payment ledger.

## Correction semantics

Finance Core reversal is the append-safe reporting correction path. The canonical reversal RPC swaps Finance account sides and copies the original transaction allocation links to the reversal transaction. Therefore Project/Order actuals can offset the original allocation on the same attribution deterministically.

Voided Finance transactions are excluded from actual reporting because reporting is posted-only.

## TDD / CI evidence

The F6 contract was wired before implementation. The initial RED run kept the existing F1–F5 Finance contracts GREEN and failed only because the new F6 implementation artifact was absent, proving the new gate was active without manufacturing a regression in earlier Finance packages.

During implementation, PR #347 exposed two additional pre-merge failures that are treated as contract feedback rather than bypassed:

- Finance Core verification required this acceptance artifact;
- Admin UI strict verification rejected raw feature-level appearance classes and native form controls in the new reporting UI, requiring shared Admin primitives/theme tokens.

Final GREEN run IDs and merge evidence must be recorded only after fresh PR verification succeeds. This document intentionally does not claim production verification before merge.

## Production boundary

No A6-F6 production migration is to be applied before PR #347 is merged by the owner.

Production migration, authenticated database acceptance, deployment smoke and advisor review remain post-merge closeout work. Pre-merge implementation must not mutate production schema merely to make reporting tests pass.

## Exit criteria

A6-F6 is ready to merge only when all of the following are GREEN on a fresh PR head:

- F1–F5 Finance contracts remain GREEN;
- F6 reporting contract is GREEN;
- Admin SQL and Store migration mirror are byte-identical;
- Admin strict UI contract is GREEN;
- Project/Finance permission boundaries remain intact;
- TypeScript, lint and production build are GREEN;
- Store Core CI and Project Base CI remain GREEN;
- no production F6 migration has been applied before merge.

Post-merge production migration and acceptance will update this document or a dedicated closeout record with actual production evidence.
