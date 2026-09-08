# PB-8 / PB-9 — Project Production Closeout

Status: **PB-8 BLOCKED ON STORE PRODUCTION DEPLOYMENT / PB-9 DB CLOSEOUT GREEN**

Execution-time baseline: `5edf6c2fa1bae6512d9a7e3661ac844402c9fb4b` (`fix(project): harden PB-9 import FK indexes (#391)`).

This artifact records the execution-time production state after PR #391 merged. It intentionally does **not** advance PB-8 or the overall Project Base workstream to complete while the live Store deployment is stale.

## Git delivery

### PB-8

- PR #382 — `feat(project): add PB-8 Portal Project projection` — merged as `7535b9b9a41387043a20ee6d5c925aa1f126b7e7`.
- PR #385 — `fix(project): paginate PB-8 portal Projects` — merged after the base projection.
- Canonical migrations are present on `main` and applied in production:
  - `20260908024500_customer_project_portal_projection.sql`;
  - `20260908032000_customer_project_portal_pagination.sql`.
- PB-8 TDD evidence from #382: RED workflow run `34171403774`; exact-head GREEN Admin Project Base `34171989845`, Store Core CI `34171989801`, Admin UI Foundation `34171989792`.
- Pagination exact-head GREEN evidence from #385: Admin Project Base `34199627106`, Store Core CI `34199627203`, Admin UI Foundation `34199627115`.

### PB-9

- PR #387 — `feat(project): add PB-9 historical Excel import` — merged.
- PR #390 — `fix(project): preserve PB-9 historical address snapshots` — merged.
- PR #391 — `fix(project): harden PB-9 import FK indexes` — merged as execution-time `main` `5edf6c2fa1bae6512d9a7e3661ac844402c9fb4b`.
- Canonical migrations on `main`:
  - `20260908043000_customer_project_historical_import.sql`;
  - `20260908093000_customer_project_historical_address_snapshot.sql`;
  - `20260908103000_customer_project_import_fk_hardening.sql`.
- PB-9 implementation exact-head GREEN evidence from #387: Admin Project Base `34197544087`, Admin A6 Finance Core `34197544072`, Store Core CI `34197544079`, Admin UI Foundation `34197544084`.
- PB-9 FK hardening TDD from #391: RED Admin Project Base `34203545064`; exact-head GREEN Admin Project Base `34203634075`, Store Core CI `34203634047`, Admin UI Foundation `34203634087`.

## PB-8 production DB acceptance

Execution-time production inspection confirms the merged projection is live and still uses `private.get_store_portal_context()` as the identity boundary.

The projection remains customer-scoped at every canonical relationship:

- Project: `customer_projects.customer_id = portal customer_id`;
- Orders: canonical `customer_orders.project_id` plus matching `customer_id`;
- Shipments: canonical Shipment → Order relation plus matching `customer_id`;
- Installations: canonical Installation → Order relation plus matching `customer_id`.

A fresh production runtime probe using the existing active Customer Portal identity passed without business-data mutation:

1. scoped Project list returned `ok=true`;
2. every returned Project belonged to the portal Customer;
3. own Project detail returned authorized;
4. a Project owned by another Customer returned `project_unavailable`;
5. list/detail JSON exposed none of `cost`, `margin`, `commission`, `vendor`, `payment_detail`, `audit`, `internal_notes`, or `sales_rep_id`.

Fresh ACL inspection:

- PUBLIC list/detail execute: **false**;
- anon list/detail execute: **false**;
- authenticated public list/detail execute: **true**;
- anon private scoped-read execute: **false**;
- authenticated private scoped-read execute: **true**, matching the established Portal pattern.

Production currently has one active Customer Portal identity with Project data and **zero active Dealer Portal identities**. Therefore a fresh execution-time Dealer-identity runtime probe cannot be performed without manufacturing an auth/account fixture. The shared canonical portal-context branch and PB-8 static contract cover the Dealer code path, but final PB-8 closeout still requires a live Dealer smoke when an approved Dealer identity/fixture is available.

## PB-8 Store production gate — RED

The production Store Vercel project is `oakwell` (`modulex-store`). Its current production deployment is stale relative to PB-8/PB-9: the latest observed production artifact is based on commit `0c5e3feec4f213002b7268b70d6d483e789acefb` (`perf(admin): dedupe customer and order reads (#269)`).

Live smoke against the production Store alias returned:

- `/account/projects` → **HTTP 404**.

The repository explicitly sets `modulex-store/vercel.json` → `git.deploymentEnabled=false`, and no repository-owned Store production deployment workflow or deterministic `vercel --prod` runbook is present. The connected deployment write surface does not expose a project/production selector while the Vercel account contains both Admin and Store projects. A target-ambiguous deployment was intentionally not executed.

**PB-8 must remain in progress until the exact current `modulex-store` artifact is deployed to the `oakwell` production project and live Customer + Dealer Project list/detail smoke passes.**

## PB-9 production migration closeout

After #391 owner merge, the exact merged canonical SQL from `20260908103000_customer_project_import_fk_hardening.sql` was applied to production.

Supabase migration history records the execution as:

- `20260908091546 — customer_project_import_fk_hardening`.

The execution-time migration-history version is generated by the production migration runner; the SQL content applied was the exact merged canonical migration from `main`.

Post-apply catalog inspection confirms all seven PB-9 import foreign keys have a valid leading index, including the three actor FKs added by #391:

- `customer_project_import_batches_committed_by_idx`;
- `customer_project_import_batches_created_by_idx`;
- `customer_project_import_batches_updated_by_idx`.

## PB-9 security / idempotency boundary

Fresh production checks confirm:

- `customer_project_import_batches` and `customer_project_import_rows` both have RLS enabled;
- PUBLIC/anon/authenticated have no direct browser SELECT/INSERT access to the staging tables;
- anon cannot execute stage or commit RPCs;
- authenticated may execute the public wrappers, which retain the internal Admin/Super Admin role guard;
- source SHA-256 + deterministic row SHA-256 staging, unresolved Customer/Sales Rep fail-closed behavior, dry-run fingerprint and stale-fingerprint rejection remain the canonical contract;
- legacy financial fields remain import/reconciliation evidence and are not promoted into canonical Project/Finance truth.

No productive historical workbook was imported during closeout.

Production import residue after #391 hardening:

- batches: **0**;
- rows: **0**;
- rows linked to canonical Projects: **0**.

## Advisor closeout

Fresh Security Advisor findings for PB-9 are consistent with the deliberate RPC-only pattern:

- RLS-enabled/no-policy INFO is expected because direct browser table privileges are revoked;
- authenticated SECURITY DEFINER warnings correspond to guarded RPC wrappers and are not anonymous mutation exposure;
- unrelated project-wide security findings remain owned by their respective workstreams.

Fresh Performance Advisor no longer reports PB-9 import foreign keys as unindexed. The new PB-9 indexes appear only as `unused_index` INFO while import tables are empty, which is expected before productive import traffic.

## Current decision

- PB-8 DB implementation/authorization/isolation/leakage checks: **GREEN for available Customer identity**.
- PB-8 Dealer runtime identity check: **PENDING — no active production Dealer Portal identity**.
- PB-8 live Store deployment: **RED — `/account/projects` is 404 on stale production artifact**.
- PB-9 implementation, production migrations, ACL/index closeout and zero-residue checks: **GREEN**.
- PB-9 productive Excel import: **NOT RUN**; the importer is ready, but no business workbook should be committed until its dry-run reconciliation is reviewed and its exact fingerprint is explicitly used for commit.

The Project Base tracker must not claim full PB-8/PB-9 completion until the Store production deployment blocker and live portal smoke are resolved.