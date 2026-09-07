# A6-F6 — Finance Reporting & Project Financial Projection

Status: **COMPLETE / PRODUCTION VERIFIED 2026-09-07**
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

The Admin SQL and Store migration mirror remain byte-identical by contract.

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

Finance Core reversal is the append-safe reporting correction path. The canonical reversal RPC swaps Finance account sides and copies the original transaction allocation links to the reversal transaction. Therefore Project/Order actuals offset the original allocation on the same attribution deterministically.

Voided Finance transactions are excluded from actual reporting because reporting is posted-only.

## TDD / CI evidence

The F6 contract was wired before implementation. The initial RED run kept the existing F1–F5 Finance contracts GREEN and failed only because the new F6 implementation artifact was absent.

During implementation, PR #347 also exposed and corrected two contract failures instead of bypassing them:

- Finance Core verification required this acceptance artifact;
- Admin UI strict verification required shared Admin primitives/theme tokens instead of raw feature-level appearance classes/native form controls.

Final exact-head verification on `4de1c4ab27ad843cdba989251bcf99e5f702c1e2` was GREEN:

- Admin A6 Finance Core run `#317`;
- Admin UI Foundation run `#2237`, including strict UI, route regression, RBAC, TypeScript, lint and production build;
- Admin Project Base run `#417`;
- Store Core CI run `#777`, including production build;
- Admin Vendor Catalog Sync run `#531`.

PR #347 was merged as `cab2dfd4fb5e7f4d38d90325d75c7706881c5864`.

## Production verification

- Production migration history contains `20260907102913 — a6_finance_reporting`, applied from the canonical F6 SQL after owner merge.
- Production catalog verification found all 12 F6 reporting functions installed with the reviewed `SECURITY DEFINER` / pinned empty `search_path` boundary.
- Public reporting wrappers are authenticated-executable while private Finance reporting cores remain non-executable by browser roles and retain `finance.view` authorization.
- Production Performance Advisor produced no F6-specific blocking performance finding.
- Security Advisor continues to flag reviewed public `SECURITY DEFINER` wrappers generically; this is intentional in the locked authenticated-wrapper/private-role-check architecture and is not treated as permission to weaken Finance authorization.
- Vercel production subsequently advanced to current `main` `bd0f2afe765681415c6e34fe0c342457819c8bf6` and is `READY`, preserving the F6 application bundle.
- Live `https://admin.oakwellcabinetry.com/finance/reports` returns HTTP `200`, matches `/finance/reports`, exposes the expected `Finance Reports | Modulex Admin` metadata/bundle and stops at the normal `Checking session...` authentication boundary for an unsigned request.

No additional Finance business-data mutation was required for this F6 closeout.

## Exit

A6-F6 is COMPLETE / PRODUCTION VERIFIED: Finance reporting consumes canonical posted Finance history, AR/AP summary truth and explicit Project/Order allocations without introducing a parallel ledger or current-FX historical rewrite. Project financial reporting consumes Finance attribution while commercial/current-cost profitability remains a separate source-derived view.
