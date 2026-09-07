# PB-7 — Project Change Orders Acceptance

Status: **COMPLETE / PRODUCTION VERIFIED**

PB-7 is closed as an auditable Project business-authorization layer. It does not replace canonical Order revisions, Finance, Procurement, AP or AR truth.

## Delivery

- implementation PR #318 introduced PB-7 Change Orders;
- security hardening PR #319 closed Sales hidden-cost write/erase and canonical revision-lock gaps;
- performance hardening PR #374 merged as `4663365e4360d292e09fa054fb54639151c5fbde`;
- production migrations:
  - `20260905212307 — customer_project_change_orders`;
  - `20260905213004 — customer_project_change_orders_security_hardening`;
  - `20260907225340 — customer_project_change_order_performance_hardening`.

## Production acceptance

The final rollback-only matrix passed **22/22** checks.

1. All four PB-7 tables exist with RLS enabled and no PUBLIC/anon/authenticated direct DML grants.
2. PUBLIC and anon cannot execute PB-7 RPCs; authenticated execution remains limited to guarded public wrappers.
3. Sales read projection exposes sell-side Change Order truth while `expected_cost_delta`, cost currency, vendor detail and privileged pending-cost fields remain hidden/NULL.
4. Admin/Super Admin and Finance privileged reads retain expected-cost/vendor visibility according to PB-7 role rules.
5. Draft Change Order creation and canonical Draft line replacement succeeded.
6. Submission locked commercial header/line history against destructive mutation.
7. Sales review/cancel/application-link mutations were denied.
8. Admin approval succeeded and appended lifecycle history.
9. Approval alone left canonical Order totals/items/revision history unchanged.
10. Unrelated Project/Order revision linkage failed closed.
11. A valid post-approval canonical Order revision linked successfully.
12. Application reconciliation advanced through the canonical `pending` / `partial` / `applied` model without double-counting Project commercial totals.
13. Negative sell/customer-credit effects were accepted without manufacturing Finance/AP/AR rows.
14. Mixed-currency reconciliation failed closed; PB-7 invented no FX conversion.
15. Sales could neither inject hidden cost/vendor fields nor erase pre-existing hidden cost data through full-line replacement.
16. Canonical revision application locks the revision row before global uniqueness checks.
17. Finance remains read-capable but does not gain PB-7 business mutation ownership.
18. PB-7 application/events history remains append-safe.
19. No acceptance-side Finance/AP/AR mutation was observed.
20. Rollback-only fixtures left zero PB-7 application residue; post-closeout production counts remained one real Change Order, one line, three lifecycle events and zero applications.
21. Performance hardening was preflighted transactionally before merge, then applied from the merged canonical migration after owner merge.
22. Post-migration Security/Performance Advisor and direct catalog/ACL checks passed the PB-7 closeout classification below.

## Performance closeout

Fresh direct `pg_constraint` / `pg_index` inspection before hardening found 13 genuinely uncovered PB-7 foreign-key columns. PR #374 added only `CREATE INDEX IF NOT EXISTS` statements.

After production migration:

- PB-7 unindexed foreign-key count: **0**;
- all 13 intended FK relationships have leading index coverage;
- PostgreSQL's 63-byte identifier limit truncates the long correction index physical name to `customer_project_change_orders_correction_of_change_order_id_id`; the index still leads on `correction_of_change_order_id`;
- the new indexes may initially appear as `unused_index` INFO because PB-7 production traffic is low. This is expected and is not a closeout blocker.

## Security closeout

Fresh direct ACL/catalog inspection confirmed:

- all four PB-7 tables have RLS enabled;
- PUBLIC, anon and authenticated have no direct SELECT/INSERT/UPDATE/DELETE table privileges;
- all ten reviewed public PB-7 wrappers are `SECURITY DEFINER`, authenticated-executable, and denied to PUBLIC/anon;
- wrapper configuration pins `search_path=pg_catalog, public, private` and the PB-7 functions retain their internal role guards;
- Security Advisor therefore reports the PB-7 RLS-no-policy INFO and authenticated SECURITY DEFINER WARN entries as expected for this deliberate RPC-only architecture, not as newly introduced privilege regressions.

Unrelated Store/Finance/Calendar/Proposal/security advisor findings remain owned by their respective workstreams and are not PB-7 closeout blockers.

## Scope boundary

PB-7 adds no Store, Customer Portal or Dealer Portal projection. Approval is business authorization only; canonical Order revision linkage is explicit, and Finance/Procurement remain authoritative for their own domains.

**PB-7 is COMPLETE / PRODUCTION VERIFIED. Future Change Order work requires a new explicitly scoped package.**
