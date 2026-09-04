# PB-3B — Project Procurement Acceptance

Date: 2026-09-04

## Scope

PB-3B makes Project procurement first-class while keeping Customer Orders as demand truth, Vendor Catalog as discovery/import truth, and Inventory out of this workflow.

Implemented behavior:

- confirmed Project Orders synchronize durable procurement requirements at the DB boundary;
- Draft Orders do not create procurement demand;
- Order cancellation/revision/Project assignment resynchronizes procurement without browser coupling;
- ordinary physical Order items are purchasable components;
- configured Countertop Stone uses `slab_quantity`, not sold sqft, and configured Sink is a separate procurement component;
- vendor resolution uses approved Vendor Catalog identity first, Product metadata fallback second, and fails unresolved on conflicting approved vendors;
- current canonical `product_costs` is captured as expected cost without converting missing cost to zero;
- vendor commitments record quantity, agreed unit cost/currency, required PO/vendor-order number, confirmation/cancellation state;
- delivery receipts and corrections are append-safe and never write `inventory_movements`;
- vendor invoices are canonical by vendor + normalized invoice number and may be shared across Projects;
- invoice allocations carry Project/product quantity and cost so a shared invoice is not counted once per Project;
- vendor payment state remains PB-4 / Finance scope.

## Canonical migrations

Repository migrations:

- `20260904102000_customer_project_procurement_core.sql`
- `20260904102500_customer_project_procurement_order_sync.sql`
- `20260904103000_customer_project_procurement_operations.sql`
- `20260904114000_customer_project_procurement_rpc_execute_hardening.sql`

Production migration history recorded the corresponding post-merge applications as:

- `20260904093345 customer_project_procurement_core`
- `20260904093400 customer_project_procurement_order_sync`
- `20260904093522 customer_project_procurement_operations`
- `20260904094301 customer_project_procurement_rpc_execute_hardening`

No historical procurement business rows were fabricated or backfilled.

## RBAC

| Capability | Sales | Finance | Admin / Super Admin |
| --- | --- | --- | --- |
| Procurement status | Allowed | Allowed | Allowed |
| Detailed vendor / cost / invoice view | Denied | Allowed | Allowed |
| Resolve vendor | Denied | Denied | Allowed |
| Create / confirm / cancel vendor commitment | Denied | Denied | Allowed |
| Record / correct delivery | Denied | Denied | Allowed |
| Record / reverse vendor invoice allocation | Denied | Allowed | Allowed |

Public RPC wrappers remain SECURITY INVOKER. Private cores remain SECURITY DEFINER with pinned search paths and role guards. Direct `anon`/`authenticated` table access is denied.

## Post-merge RPC hardening

Initial production smoke after PR #285 exposed an ACL regression: the public SECURITY INVOKER wrappers were executable by `authenticated`, while the private role-guarded cores had `authenticated` EXECUTE revoked. A Sales status request therefore failed before its role guard with `permission denied for function get_customer_project_procurement_status`.

The forward-only hardening migration restores `authenticated` EXECUTE on the ten private PB-3B cores while keeping `anon` denied. Fresh ACL verification confirms all ten private functions have `authenticated_execute=true` and `anon_execute=false`.

## Production acceptance

Fresh production verification after hardening:

- all six PB-3B tables exist;
- RLS is enabled on every table;
- each table has explicit anon/authenticated restrictive deny policies;
- anon/authenticated have no direct SELECT/INSERT/UPDATE/DELETE table privileges;
- Sales status RPC succeeds;
- Sales detailed procurement RPC returns SQLSTATE `42501`;
- Sales vendor mutation returns SQLSTATE `42501`;
- Sales vendor-invoice mutation returns SQLSTATE `42501`;
- Finance detailed/status reads succeed;
- Finance operational vendor mutation returns SQLSTATE `42501`;
- Finance is allowed through the invoice role boundary;
- Admin rollback-only flow succeeds through vendor resolution → commitment → confirmation → partial delivery → delivery correction → vendor invoice allocation → allocation reversal;
- Finance rollback-only flow succeeds for vendor invoice allocation + reversal on an Admin-created commitment;
- every acceptance mutation transaction was rolled back;
- final production residue is exactly 0 requirements / 0 commitments / 0 delivery events / 0 vendor invoices / 0 invoice allocations / 0 procurement audit events.

## Advisor acceptance

Fresh Security Advisor output contains no PB-3B-specific finding. Existing Store/support/Auth warnings remain unrelated backlog.

Fresh Performance Advisor output contains no PB-3B unindexed-FK finding. New PB-3B indexes appear only as expected `unused_index` INFO while production contains no procurement traffic yet.

Reference remediation pages for unrelated Advisor classes observed during the same scan:

- RLS no-policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security Definer execute exposure: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Authenticated Security Definer execute exposure: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Unindexed foreign keys: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Unused indexes: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Git / UI gates

- PB-3B implementation PR #285 is merged.
- Post-merge runtime hardening PR #288 contains the forward migration and regression contract.
- GitHub Actions for the hardening head are still queued at the time this acceptance note is written; PB-3B code closeout must not be called fully complete until the relevant final-head checks finish green and PR #288 is merged by the project owner.
- Admin production deploy / signed-in visual acceptance remains owner-controlled and is not claimed by this document.

## Boundaries preserved

- No Store / Customer Portal / Dealer Portal procurement projection was added.
- No `inventory_movements` write is performed by PB-3B.
- No vendor payment / paid-date / payment-method truth is stored in PB-3B.
- PB-2 profitability semantics are not silently rewritten by vendor invoice allocations.
