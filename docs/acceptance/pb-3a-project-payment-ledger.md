# PB-3A — Project Payment Ledger Production Acceptance

Date: 2026-09-03
PR: #272 — `feat: add PB-3A Project payment ledger`
Branch: `feat/project-operations-hub-pb3`
Production Supabase project: `bzjoeernnmvuhzyvbowc`

## Accepted scope

PB-3A establishes Project-first customer receivables and payment tracking without replacing Orders or fabricating historical payment events.

The Admin Project Detail workspace is organized as:

- Overview
- Orders
- Finance
- Procurement
- Fulfillment
- Documents
- Activity

PB-3A implements the Finance customer-payment slice. Procurement, outgoing Project finance and deeper fulfillment rollups remain staged follow-up packages.

## Canonical payment model

```text
Project
  ├── Payment Requirement / Milestone
  ├── Actual Customer Payment Transaction
  └── Payment Allocation
       └── links transaction ↔ requirement
```

Accepted semantics:

- customer payment may be recorded before an Invoice exists;
- payment requirement and actual cash transaction are different records;
- one requirement may receive multiple transactions;
- one payment may be allocated across multiple requirements;
- unallocated Project customer credit is retained explicitly;
- requirement collection state is derived from effective allocations;
- reversal/refund/void uses append-safe correction semantics instead of destructive history edits;
- allocation requires the same Project and currency;
- PB-3A does not invent FX conversion.

## Invoice compatibility

`customer_invoices.ledger_managed` is an additive compatibility flag.

- Historical `paid_amount` values were not converted into fabricated payment transactions.
- Existing historical Invoices remain legacy-compatible until explicitly linked to ledger requirements.
- Ledger-managed Invoice `paid_amount` and payment-derived status are DB-maintained from effective allocations.
- New direct customer payment mutation is restricted to Finance/Admin.
- Sales may continue allowed Invoice lifecycle operations, but cannot record customer payment amount or directly force paid/partially-paid state.

At acceptance time production contains zero ledger requirements, zero ledger transactions, zero allocations, and zero ledger-managed Invoices; migration did not rewrite existing business rows.

## Production migrations

Applied successfully in production:

- `20260903124606_customer_project_payment_ledger`
- `20260903124630_customer_project_payment_ledger_hardening`
- `20260903124645_customer_project_payment_invoice_role_guard`
- `20260903125353_customer_project_payment_advisor_cleanup`

Repository migration mirrors:

- `20260903143000_customer_project_payment_ledger.sql`
- `20260903143500_customer_project_payment_ledger_hardening.sql`
- `20260903144000_customer_project_payment_invoice_role_guard.sql`
- `20260903144500_customer_project_payment_advisor_cleanup.sql`

## Authorization and Data API acceptance

Production catalog/ACL verification confirms:

- all three ledger tables have RLS enabled;
- anon/authenticated have no direct table read/write privilege;
- explicit restrictive deny-by-default RLS policies are present;
- public payment RPCs are SECURITY INVOKER;
- public RPC EXECUTE is denied to anon;
- authenticated callers may execute public RPCs;
- private implementation entrypoints are SECURITY DEFINER with pinned search paths and explicit role guards;
- internal helper/trigger functions are not exposed as browser mutation boundaries.

### Sales smoke

Using an active Sales identity under the authenticated application role:

- sanitized Project payment status RPC succeeded;
- returned projection contained milestone/status data only and no payment amounts;
- detailed Project ledger RPC failed with SQLSTATE `42501`;
- record-payment RPC failed with SQLSTATE `42501`.

### Finance smoke

Using an active Finance/Admin-capable identity inside one explicit transaction:

1. create a USD 100 payment requirement;
2. record a USD 60 customer payment;
3. allocate USD 40;
4. reverse USD 20;
5. read the canonical Project ledger.

Observed effective result:

- Expected: USD 100
- Received: USD 40
- Allocated: USD 40
- Unallocated Credit: USD 0
- Remaining: USD 60
- requirement state: partially paid

The transaction was rolled back. Follow-up counts confirmed zero acceptance rows remained.

### Void smoke

Rollback-only acceptance recorded a USD 10 payment and voided it through the authoritative RPC. DB-owner verification inside the same transaction confirmed:

- status = `voided`;
- `voided_at` present;
- `voided_by` present;
- `void_reason` present.

The transaction was rolled back and left no production residue.

## Advisor acceptance

Initial PB-3A advisor review identified only package-specific informational findings:

- RLS enabled with no explicit policy on the intentionally RPC-only ledger tables;
- missing covering indexes for new audit/payment-method foreign keys.

The advisor-cleanup migration added:

- explicit restrictive deny policies for all three ledger tables;
- covering indexes for `cancelled_by`, `created_by`, `updated_by`, `payment_method_id`, and `voided_by` references.

Fresh Security/Performance Advisor review confirms those PB-3A findings are gone. New ledger indexes can still appear as `unused_index` INFO until real ledger traffic exists; this is expected and not a blocking finding. Remaining advisor backlog belongs to unrelated Store/HR/vendor/support domains.

## Admin UI / RBAC acceptance

PB-3A adds:

- `project_payments.view`;
- `project_payments.manage`.

Sales receives view-only collection status. Finance/Admin receive detailed ledger and payment mutation access. PB-2 cost/margin remains a separate permission boundary.

The Finance tab provides:

- Expected / Received / Remaining / Overdue / Unallocated Credit summaries;
- Payment Plan table and requirement creation;
- Customer Payments table and payment recording;
- explicit allocation;
- append-safe reversal;
- PB-2 Project Financial Summary when cost/margin permission is present.

Ledger-managed Invoice detail routes operators to `?tab=Finance`; Project Detail supports the same tab deep-link contract.

## CI gate

Required final branch gate:

- Admin Project Base contract;
- PB-2 financial rollup regression;
- PB-3A payment ledger contract;
- Admin Customers UI contract;
- production surface regression;
- RBAC regression;
- Admin UI strict gate;
- TypeScript;
- lint;
- production build.

The PR must remain user-owned for merge. Production DB acceptance and code merge acceptance are separate gates.

## Store / Portal boundary

PB-3A does not add Store, Customer Portal or Dealer Portal payment/finance projections. Internal payment amounts, cost, margin, vendor finance and audit data remain Admin-only unless a later explicitly approved portal package introduces a narrow projection.

## Next Project packages

- PB-3B — Procurement canonical domain
- PB-4 — Project-linked outgoing Finance / expenses
- PB-5 — Delivery & Installation Project rollup
