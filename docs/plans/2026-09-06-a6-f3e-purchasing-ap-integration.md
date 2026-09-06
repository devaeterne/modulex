# A6-F3E Purchasing / AP Integration — Implementation Plan

Date: 2026-09-06  
Base: `main@e38dd432f70a58b54d8ec525c1dda990bd995532`

## Current-state evidence

Production and current `main` were re-audited before implementation.

- No separate `purchase_orders`, `purchase_order_items`, `purchase_receipts` or `purchase_receipt_items` tables exist in production.
- Project Procurement already owns purchasing source truth through `customer_project_procurement_commitments`, delivery events and procurement event history.
- `customer_project_procurement_invoice_allocations` already owns Project cost attribution from Vendor Bills to procurement commitments.
- F3B `vendor_invoices` is the canonical AP Vendor Bill header and already owns Vendor identity, due date, payment terms, FX/open lifecycle and bill audit.
- F3C Finance transactions/payment allocations remain the actual payment truth.
- Production at audit time: 1 procurement commitment, 0 Vendor Bills, 0 procurement invoice allocations. The existing commitment has no canonical `vendor_id` yet.

## Delta matrix

| Requirement | Existing asset | Decision | F3E delta | Compatibility |
| --- | --- | --- | --- | --- |
| Procurement/PO source truth | `customer_project_procurement_commitments` | REUSE | No new Purchasing schema | Existing IDs/history unchanged |
| Procurement → bill project allocation | `customer_project_procurement_invoice_allocations` | REUSE | Keep append/reversal ledger | No migration/backfill |
| Vendor Bill creation/open | F3B private Vendor Bill core | BRIDGE | Route legacy procurement invoice recorder through `create_vendor_invoice_draft` + `open_vendor_invoice` | Public legacy RPC signature unchanged |
| Vendor identity | commitment `vendor_id` + canonical `vendors` | EXTEND | Fail closed when commitment is not mapped to canonical Vendor | Source `vendor_code` snapshot preserved |
| Bill retry identity | F3B `vendor_id + invoice_number_key` | EXTEND | Replace historical `vendor_code` retry lookup with canonical identity | Prevents source-code/canonical-code duplicate retry bug |
| Project invoice quantity/amount ceilings | existing legacy procurement recorder | REUSE | Preserve existing ceilings exactly | No behavioral widening |
| Procurement allocation reversal | existing append-only reversal | EXTEND | Reuse Finance manage auth and mirror reversal into Vendor Bill audit | Existing reversal rows/events preserved |
| Payment truth | F3C Finance transactions + bill payment allocations | REUSE | No payment engine added | No duplicate payable/payment totals |
| UI | existing Project Procurement + Finance Bills surfaces | REUSE | No new UI in F3E | Existing navigation/API unchanged |

## Implementation

1. Add a RED static contract proving F3E cannot introduce a duplicate Purchasing/AP universe.
2. Replace only the private legacy procurement invoice recorder and allocation reversal core.
3. Require canonical Vendor mapping before crossing the Project Procurement → AP boundary.
4. Normalize and lock Vendor Bill identity exactly as F3B does.
5. Create/open new bills only through F3B private cores; never direct-insert the AP header.
6. Reuse the existing Project procurement allocation ledger and event log.
7. Add Vendor Bill audit entries for procurement allocation and reversal linkage.
8. Keep existing public RPC signatures/grants intact; private cores remain non-app-callable.
9. Extend the existing Admin A6 Finance workflow to run the F3E contract; do not add a workflow.

## Rollout

- Source/CI first; production remains untouched until PR merge.
- Immediately before production rollout re-read migration history and the two function definitions.
- Apply `20260906114500_a6_finance_purchasing_ap_integration.sql` only after merge.
- Verify function definitions, private grants, unchanged public wrapper signatures and zero unexpected data mutations.
- No data backfill is required. Existing unmapped commitments remain unchanged and must be mapped through canonical Vendor identity before AP invoicing.

## Next

After F3E source + production verification, continue with **A6-F3F — AP Aging & Vendor Financial Projection** over canonical bills, allocations, schedules and Finance transactions.
