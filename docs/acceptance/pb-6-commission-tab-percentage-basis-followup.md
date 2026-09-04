# PB-6 Follow-up — Project tab access & percentage basis

Date: 2026-09-05
Branch: `fix/pb6-project-tab-permissions-percentage-basis`

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

This follow-up removes manual percentage-basis entry and moves basis calculation to the authoritative database boundary.
