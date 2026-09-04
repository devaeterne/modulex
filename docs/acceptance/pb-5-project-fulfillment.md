# PB-5 — Project Delivery & Installation Rollup Acceptance

Date: 2026-09-04
Branch: `feat/project-pb5-fulfillment-rollup`
Current main incorporated: `190da5745fe2b6972deabff0d11c16263cd5c0f5`
Final verified implementation head before this documentation-only closeout: `0d77c2c60acdbe53bc26b6613c0b886e66875d65`
Draft PR: #296
Production Supabase: `bzjoeernnmvuhzyvbowc`

## Scope

PB-5 adds a Project-level operational projection only. It does not create or take ownership of fulfillment records.

Canonical truth remains:

- `customer_orders`
- `customer_shipments`
- `customer_installations`
- `customer_project_procurement_requirements`
- `customer_project_procurement_commitments`
- `customer_project_procurement_delivery_events`

No Project fulfillment table, delivery ledger or installation ledger is introduced.

## Projection contract

`public.get_customer_project_fulfillment(p_project_id uuid)` delegates to a role-guarded private implementation and returns:

- active / ready / pending Order counts;
- Customer Pickup count;
- separate Project delivery state;
- separate Project installation state;
- sanitized procurement blocker count;
- per-Order fulfillment rows;
- multiple Shipment records per Order;
- multiple Installation records per Order;
- cancelled Order history, marked inactive and excluded from active summary math.

The projection does not include vendor identity, vendor cost, purchase cost, invoice cost, internal notes, Finance transactions or Store/Portal fields.

## State semantics

### Delivery

Delivery-required Orders are active Orders whose `fulfillment_type` is not `pickup`.

Project delivery state is derived from active Shipment records:

- `not_required` — no delivery-required active Orders;
- `pending` — delivery is required but no active Shipment has progressed;
- `in_progress` — picking / packed / shipped activity exists without a delivered split;
- `partial` — at least one delivery is complete while other delivery work remains;
- `delivered` — all active delivery-required Order shipment groups are delivered.

Customer Pickup remains `customer_pickup` at row level and is excluded from Project delivery-required counts.

### Installation

Installation truth is derived from canonical Installation records. `delivery_installation` declares installation intent, while an existing active Installation record remains authoritative even if legacy Order fulfillment metadata says `delivery`.

States:

- `not_required`
- `not_scheduled`
- `scheduled`
- `in_progress`
- `partial`
- `completed`

Multiple Installation records remain separate in the row projection.

### Procurement blockers

PB-5 uses the existing PB-3B procurement quantity semantics but exposes only Sales-safe blocker states:

- `quantity_required`
- `not_ordered`
- `partially_ordered`
- `not_delivered`
- `partially_delivered`

No vendor or cost information is projected.

## RBAC

The DB boundary preserves the existing operational visibility boundary:

- allowed: `super_admin`, `admin`, `sales`;
- not broadened to Finance, HR, Warehouse, Shipping or Portal roles through this Project RPC.

The Admin client also requires existing `projects.view`, `shipments.view` and `installations.view` permissions before calling the RPC.

Finance continues to retain Project/Finance visibility through its existing permissions without gaining Shipment/Installation access from PB-5.

## PB-3B workspace integration found during verification

PB-5 verification surfaced a pre-existing Project Detail integration gap: the approved PB-3B `ProjectProcurementTab` component and permission model were present, while `ProjectDetailWorkspace` still rendered the earlier Procurement placeholder.

The PB-5 PR restores the already-approved PB-3B workspace wiring without changing procurement business rules:

- `project_procurement.view` controls sanitized procurement visibility;
- `project_procurement.manage` controls procurement mutation UI;
- detailed vendor/cost visibility additionally requires `pricing.cost.view`;
- Vendor Invoice mutation UI remains allowed to Procurement managers or Finance managers under the existing PB-3B contract.

The permanent Project Procurement contract passes after this restoration.

## TDD / CI verification

RED contract:

`modulex-admin/scripts/project-pb5-fulfillment-contract.mjs`

Initial expected failure occurred before implementation because `sql/project-pb5-fulfillment-rollup.sql` did not exist.

PB-5 intentionally does not own a separate GitHub Actions workflow. After CI consolidation, the PB-5 contract is executed inside the existing `.github/workflows/admin-project-base.yml` workflow.

Fresh implementation-head verification on `0d77c2c60acdbe53bc26b6613c0b886e66875d65`:

- **Admin Project Base #223 — GREEN**
  - Project Base contract
  - Project Progress contract
  - Project Financial/Payment contracts
  - Project Procurement contract
  - PB-5 Fulfillment contract
  - Countertop fallback regression
- **Admin UI Foundation #1244 — GREEN**
  - Admin UI checks
  - production-surface contract
  - RBAC contract
  - TypeScript typecheck
  - Mobile Shell UI contract
  - ESLint
  - Admin consistency checks
  - production build
  - final diff check

The CI consolidation had removed the old `admin-mobile-shell-ui.yml` wrapper while the Mobile Shell contract still referenced it. That current-main CI regression was repaired by aligning the contract with the consolidated `admin-ui-foundation.yml` owner; no application runtime behavior changed.

Any documentation-only commit after the implementation-head evidence must still receive the normal PR workflow run before merge.

## Production read-only validation

Production schema inspection confirmed:

- Order statuses and `fulfillment_type` constraints are canonical and include `pickup`, `delivery`, `delivery_installation`;
- Shipment lifecycle is `draft → picking → packed → shipped → delivered` with cancellation support;
- Installation lifecycle is `scheduled → confirmed → in_progress → completed` with cancellation support;
- current Project data contains multiple Shipments on one Order;
- cancelled Project Orders exist and are identifiable for inactive-history treatment;
- canonical Installation data can exist on an Order whose current `fulfillment_type` is `delivery`, so PB-5 honors the actual Installation record rather than suppressing it;
- PB-3B Sales-safe procurement status already uses requirement / commitment / delivery-event quantities and PB-5 follows that quantity model without exposing detailed procurement fields.

All production queries used for this validation were read-only.

## Supabase Advisor review

Fresh Security and Performance Advisor scans were run on 2026-09-04 after final implementation verification.

Because the PB-5 SQL/RPC has intentionally **not** been installed in production, there is no PB-5 production function for the Advisors to flag and no PB-5-specific Advisor finding was observed.

Existing unrelated project-wide findings remain, including Store/Finance/support/auth SECURITY DEFINER or policy warnings and existing unindexed-FK / unused-index / permissive-policy performance backlog. PB-5 does not broaden scope to remediate those findings.

## Production mutation status

No PB-5 DDL, RPC, migration, data mutation or deployment was applied to production during implementation.

`modulex-admin/sql/project-pb5-fulfillment-rollup.sql` is repository-only until the Project owner merges the PR and explicitly starts the separate production DB acceptance stage.

## Post-merge DB acceptance plan

After explicit owner approval:

1. apply `project-pb5-fulfillment-rollup.sql` through the normal migration path;
2. verify function ownership/search path and EXECUTE grants;
3. run role acceptance for Admin, Sales and a denied non-fulfillment Project viewer;
4. run rollback-only scenario coverage for multiple Shipments, partial delivery, Customer Pickup, multiple Installations and cancelled Order exclusion;
5. rerun Security and Performance Advisors;
6. deploy Admin only after DB acceptance passes;
7. complete signed-in Project Fulfillment UI acceptance against the installed RPC.

## Package boundary

PB-5 does not modify Store/Portal projections and does not introduce Project-owned Finance tables, migrations or money-movement behavior.

Next Project package after owner merge, DB acceptance and Admin deployment: **PB-6 — Participants & Commission Ledger**.
