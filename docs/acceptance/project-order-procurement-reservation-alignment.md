# Project Order Reservation ↔ Procurement Alignment

Date: 2026-09-04
PR: #300
Status: implementation / owner-merge gate

## Production reproduction

Project `P-2026-000003` exposed two coupled defects and one valid confirmation requirement.

### ORD-000001 — Project cabinet shortage

- status: Draft
- Project-linked: yes
- two `NB-3DB33` lines require 2 units total
- current sellable stock: 1 unit
- pre-fix result: confirmation aborts with `ORDER_STOCK_SHORTAGE`
- intended result: reserve the 1 available unit, allow Project Order confirmation, and create Procurement demand for the remaining 1 unit

### ORD-000030 — configured Stone + Sink

- status: Draft
- fulfillment: Delivery
- shipping address is currently unset; this remains a valid confirmation blocker until an active customer address is selected
- configured Stone: `WHITE HORIZON`, 10 slabs
- configured Sink: `E-312`, quantity 1
- both STONE and SINK product types are `inventory_tracking=false` and `reservable=false`
- pre-fix result after a rollback-only temporary valid address assignment: confirmation incorrectly attempts to reserve 10 Stone units and aborts with stock shortage
- intended result after a real shipping address is selected: Stone and Sink bypass stock reservation and become Procurement demand directly

### ORD-000004 — historical confirmed Project Order

- status: Confirmed before PB-3B was installed
- three cabinet lines are each fully covered by active stock reservations
- current Procurement requirements: none
- old PB-3B trigger had no historical confirmed-order backfill
- intended result under the aligned semantics: backfill evaluates the Order idempotently; because all three physical lines are already fully reserved, current open purchase demand remains zero

## Root causes

1. `private.reserve_customer_order_item_stock` did not check canonical Product Type `inventory_tracking` / `reservable` flags, so non-reservable Stone/Sink could block Order confirmation.
2. The same function raised on every sellable-stock shortage, including Project-linked Orders that should route the remaining quantity to Project Procurement.
3. PB-3B Procurement synchronization ran before the stock-status reservation trigger, so a shortage-based Procurement projection could not see post-reservation truth.
4. PB-3B shipped without an idempotent backfill for Project Orders that were already Confirmed.

## Fixed semantics

- Non-inventory-tracked or non-reservable products never enter warehouse reservation.
- Project-linked reservable lines reserve whatever sellable stock is available.
- Remaining unfulfilled Project quantity becomes the Procurement Requirement quantity.
- Standalone Orders remain fail-closed on sellable-stock shortage because they have no Project Procurement destination.
- Configured Countertop Stone remains based on canonical `slab_quantity`.
- Configured Countertop Sink remains a separate quantity-1 requirement.
- SERVICE lines remain excluded.
- Status-change Procurement sync runs after stock reservation by replacing the legacy trigger with `trg_customer_order_z_project_procurement_sync`.
- Historical active non-Draft Project Orders are backfilled only when they have no current Procurement requirements, avoiding silent rewrites of existing commitment history.

## TDD evidence

RED head `79fd5f37dce8a799631958060addb461b88c2bc5`:

- Admin Project Base #240 failed exactly at `Order reservation / Project Procurement alignment migration must exist`.

Implementation files:

- `modulex-store/supabase/migrations/20260904133500_customer_order_procurement_reservation_alignment.sql`
- `modulex-admin/sql/project-order-procurement-reservation-alignment.sql`
- `modulex-admin/scripts/project-procurement-contract.mjs`

The Admin SQL mirror and Supabase migration are contract-locked byte-identical.

## Rollout boundary

No production DDL/data mutation is applied by PR #300 before owner merge.

After merge, production acceptance must:

1. apply the additive alignment migration;
2. verify trigger ordering and function definitions;
3. rollback-test `ORD-000001` confirmation and assert only the remaining stock shortage becomes Procurement demand;
4. rollback-test `ORD-000030` with a temporary valid shipping address and assert Stone 10 + Sink 1 Procurement requirements with zero Stone/Sink inventory reservations;
5. verify historical backfill produces no fake purchase demand for fully reserved `ORD-000004`;
6. verify standalone stock-shortage confirmation still fails closed;
7. rerun Supabase Security and Performance Advisors;
8. verify relevant final-head CI before owner merge/deploy.
