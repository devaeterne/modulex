# PB-7 — Project Change Orders Acceptance

Status: implementation in progress

This document defines the production acceptance sequence for PB-7. It is intentionally present before implementation so the final merge/production gate has an explicit checklist.

1. Verify all four PB-7 tables exist, RLS is enabled, PUBLIC/anon have no direct access, and authenticated execute exists only on guarded public RPC wrappers.
2. Verify anon cannot call PB-7 read or mutation RPCs.
3. Verify a Sales-authenticated caller sees sell-side Change Order data while `expected_cost_delta`, `cost_currency_code`, `vendor_code`, and pending expected-cost summary fields are NULL/hidden.
4. Verify Admin/Super Admin and Finance read projections include privileged expected-cost/vendor detail according to role rules.
5. Create a Draft Change Order and replace its Draft lines through the canonical PB-7 RPCs.
6. Submit the Change Order and prove commercial header fields and lines reject destructive mutation afterward.
7. Verify Sales cannot approve/reject/cancel/link canonical revisions.
8. Verify Admin approval succeeds and appends lifecycle history.
9. Snapshot canonical Order totals/items/revision count before approval and prove approval alone changes none of them.
10. Attempt to link an unrelated Project/Order revision and verify deterministic rejection.
11. Create/use a valid post-approval canonical Order revision and link it successfully.
12. Verify application reconciliation moves `pending -> partial/applied` as appropriate and that PB-2 canonical Project totals are not double-counted by PB-7 pending impacts.
13. Verify negative customer/vendor credit deltas are accepted as approved business effects without creating Finance/AP/AR records.
14. Verify mixed-currency aggregate/reconciliation values fail closed and no FX conversion occurs.
15. Run rollback-only smoke where possible and leave zero PB-7 business-data residue from acceptance fixtures.
16. Check Supabase Security Advisor and Performance Advisor after production migration.
