# Countertop Replace / Remove Workflow Design

**Date:** 2026-09-02
**Scope:** `modulex-admin` order revision + Countertop configuration lifecycle
**Base:** current `main` at `5b106d56eb9819db59cb8a8a26ddab4e045d14af`

## Problem

Configured Countertop order lines are intentionally protected from generic order revision mutations. Today the Admin edit screen still exposes the normal Remove action, so a user can remove a configured Countertop row from the client draft and then add a new Countertop. `update_customer_order` correctly rejects that payload because configured Countertop rows cannot be removed through the generic revision path and new Countertop Material Band products must already have a valid configuration snapshot.

The database guard is correct; the missing piece is a dedicated replace/remove workflow.

## Goals

- Keep generic order revision guards fail-closed.
- Add explicit **Replace Countertop** and **Remove Countertop** actions for configured Countertop rows.
- Preserve auditability, reservation release/re-reserve behavior, authoritative Countertop pricing, immutable pricing snapshots, and order total reconciliation.
- Keep Cabinet and Service revision behavior unchanged.
- Keep lifecycle rules unchanged: Countertop configuration mutation remains Draft-only. Confirmed and later order handling continues through the existing order revision/approval rules rather than widening Countertop mutation authority.

## Replace Countertop

Replace will reuse the existing configured `customer_order_items.id` instead of deleting/recreating the line. The edit screen will expose a **Replace Countertop** action for a configured Countertop row. That action opens the existing `CountertopConfigurator` against the current `orderItemId`.

The configurator already restores the saved configuration and calls `attach_countertop_configuration` for an existing line. A replacement therefore uses the existing authoritative path:

1. User opens Replace Countertop.
2. Existing Stone/Band/Area/Edge/Sink/Services values load from `countertop_configurations`.
3. User selects the replacement Stone and any new configuration values.
4. `calculate_countertop_price` produces the authoritative pricing snapshot.
5. `attach_countertop_configuration` updates the same order item and upserts its configuration snapshot.
6. Existing product/reservation triggers release and re-reserve as product/quantity changes require.
7. Order totals are reconciled by the existing Countertop attach function.
8. UI reloads the authoritative order context.

This keeps the same `order_item_id`, avoids a temporary unconfigured Countertop line, and preserves the generic revision guard.

## Remove Countertop

Remove needs a dedicated DB boundary because deleting a configured Countertop is intentionally forbidden inside `update_customer_order`.

Add a public authenticated RPC backed by a private SECURITY DEFINER implementation, e.g. `remove_countertop_order_item(p_order_item_id uuid, p_reason text default null)`.

The private function will:

1. Resolve active Admin profile and require an existing authorized Countertop-management role (`super_admin`, `admin`, `sales` as currently used by Countertop configuration functions).
2. Resolve the item's parent ID without taking a child lock, then lock the parent order before the target order item. This matches the normal order-update lock order and avoids a child → parent inversion.
3. Require the parent order to be `draft`; otherwise fail closed.
4. Require a matching `countertop_configurations` row for both the target item and parent order; ordinary order lines cannot use this RPC.
5. Capture safe audit metadata before deletion: order/customer IDs, order number, line number, SKU/name snapshot, Countertop pricing snapshot/configuration, and supplied reason.
6. Delete the `customer_order_items` row. The configuration row is removed by its existing `ON DELETE CASCADE` foreign key.
7. Allow the existing order-item reservation release trigger to release reserved inventory safely.
8. Preserve the remaining rows' `line_no` values. Production requires only positive, order-unique line numbers, so gaps are valid; updating retained rows merely to close a gap would fire the global order-item pricing trigger and could reprice unrelated Cabinet lines.
9. Allow the existing DEFERRABLE order-item totals trigger to recalculate item count/subtotal/tax/commission/grand total using the current canonical formulas; any reconciliation failure rolls the transaction back.
10. Write `customer_activity` describing the Countertop removal and referencing the removed line snapshot without exposing more data than existing internal activity/audit surfaces.
11. Return the order ID (or a simple success value) so the UI can reload authoritative state.

No direct browser DELETE against `customer_order_items` or `countertop_configurations` will be introduced.

## Admin UI

In `EditCustomerOrder`:

- A configured Countertop row will no longer show the generic **Remove** action.
- It will show **Replace Countertop** and **Remove Countertop**.
- Configured Countertop quantity/discount are not presented as generic editable inputs, avoiding another UI path into the fail-closed generic Countertop mutation guard.
- Replace opens `CountertopConfigurator` for that specific existing `orderItemId` and line context.
- Remove requires an explicit confirmation interaction and calls the dedicated RPC. After success the order-line context is reloaded from the server so items, summaries and totals cannot drift from the database; the confirmation warns that unsaved line edits are discarded by this immediate mutation.
- Non-Countertop lines keep the current generic Remove behavior.
- Existing shared UI primitives and Admin theme rules remain mandatory.

## Error Handling

- Non-Draft order: explicit lifecycle error; no mutation.
- Non-Countertop order item passed to remove RPC: explicit invalid-operation error.
- Missing/foreign item: neutral order-item-not-found style failure.
- Reservation release or total reconciliation failure: transaction rolls back completely.
- Replacement calculation/attach failure: old Countertop configuration remains intact because the attach call is transactional.
- UI always displays the actual Supabase/Postgres message where safe instead of only `400 Bad Request`.

## Database / Migration

One additive migration will create the dedicated remove RPC/private implementation and grants. No schema table changes are expected. Existing Countertop configuration tables, FKs, pricing gate, reservation triggers, and revision guard remain in place.

The migration will be source-controlled in the canonical Admin SQL area and mirrored into the shared Supabase migration directory following existing Modulex conventions. It will not be applied to production before the implementation PR is merged unless explicitly requested.

## Testing

TDD sequence:

1. Add a failing contract requiring:
   - configured Countertop rows use Replace/Remove UI rather than generic Remove,
   - Replace uses existing `order_item_id` + `CountertopConfigurator`,
   - dedicated `remove_countertop_order_item` SQL exists,
   - remove RPC is Draft-only and checks that a configuration exists,
   - existing reservation/totals triggers remain authoritative,
   - retained order lines are not UPDATEd merely to close a line-number gap,
   - activity/audit is included,
   - generic `update_customer_order` configured-Countertop guard remains present.
2. Implement DB and UI until the targeted contract passes.
3. Run Admin UI strict self-test + strict diff gate, typecheck, lint, and production build.
4. Run the relevant A1/Customers/Countertop workflows.
5. Before applying production DDL after merge, run transaction-scoped or read-only acceptance where possible, then apply the migration and run Supabase Security + Performance Advisors.

## Acceptance Scenarios

- Draft order + configured Countertop → Replace with a different Stone → same `order_item_id`, new authoritative configuration/snapshot, correct price/totals.
- Draft order + configured Countertop → Remove → configuration disappears by cascade, reservation is released, totals/item count reconcile, remaining line identities/prices stay untouched, activity is recorded.
- Draft order + ordinary Cabinet/Service → existing generic Remove still works through Save Revision.
- Confirmed or later order → direct Countertop Replace/Remove is denied; existing lifecycle/approval semantics stay authoritative.
- Generic `update_customer_order` still rejects attempts to remove configured Countertop rows from a raw revision payload.

## Non-Goals

- No weakening of configured-Countertop revision guards.
- No new Countertop archive/history table in this package; existing order revision/activity snapshots remain the audit boundary.
- No change to Invoice/Print behavior except that subsequent documents naturally consume the current saved Countertop snapshot.
- No Store/public projection change.
