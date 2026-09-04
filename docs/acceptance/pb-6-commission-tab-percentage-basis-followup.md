# PB-6 Follow-up — Project tab access & percentage basis

Date: 2026-09-05
Branch: `fix/pb6-project-tab-permissions-percentage-basis`
PR: #310

## Requested behavior

- Move Participants & Commission into the Project Detail tab workspace.
- Show the internal participant/commission detail surface only to Finance, Admin, and Super Admin.
- Do not expose internal commission detail to Sales. A later, separate personal projection may show only the individual's final receivable after Project completion.
- Percentage commission must derive its basis from canonical Project Order totals instead of a manually entered basis amount.
- Whole-Project percentage uses active Order grand totals.
- Category/product percentage uses matching active Order line totals.
- Mixed-currency scope fails closed rather than silently producing a partial basis.
- The percentage basis is snapshotted into the immutable commission obligation at creation time.

## Regression observed

Production obligation `P-2026-000003` was created with a 2% rate and `basis_amount = 0.00` even though the Project had three active Orders totaling USD 6,635.0020. The client converted an empty basis field with `Number("")`, producing zero, and the database accepted zero as a valid percentage basis.

At that snapshot the expected whole-Project 2% commission is approximately USD 132.70.

## Implementation

- `Participants & Commission` is part of the existing Project Detail tab workspace instead of rendering below the workspace.
- UI visibility, client guards, table RLS and commission read helper are restricted to `super_admin`, `admin`, and `finance`.
- Admin/Super Admin retain participant and role management; Finance retains commission management.
- Sales receives no internal PB-6 detail. The future personal final-result surface remains a separate scope.
- Percentage creation requests an authoritative basis preview from PostgreSQL and sends no client-entered basis amount.
- PostgreSQL recalculates the authoritative basis again at create time and stores that value as the immutable obligation snapshot.
- Whole-Project basis uses active Order `grand_total`; category/product basis uses matching active Order item `line_total`.
- Empty/zero and mixed-currency scopes fail closed.
- The original PB-6 migration and Admin SQL mirror also include the `display_name` alias replay fix, so this branch does not depend on PR #309 for fresh database bootstrap.

## TDD

The new contract `project-pb6-tab-access-percentage-basis-contract.mjs` was added before implementation. Admin Project Base run `33927312918` demonstrated RED: all preceding Project contracts passed and only the new PB-6 follow-up contract failed. Final-head CI is required before merge.

The existing zero-basis obligation is historical immutable data and is not silently rewritten by this change. It should be cancelled/replaced through the commission lifecycle if the business record is to be corrected after deployment.
