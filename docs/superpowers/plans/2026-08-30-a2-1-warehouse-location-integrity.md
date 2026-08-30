# A2.1 Warehouse / Location Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make warehouse, zone, location, and inventory structure changes fail closed so role boundaries, hierarchy, stock state, and history cannot be silently corrupted.

**Architecture:** Keep the existing Supabase-first Admin architecture. Put integrity and lifecycle rules in Postgres/RLS as the authoritative boundary, retain existing browser reads and mutations, and surface database guard failures through a shared Admin formatter. Avoid introducing a parallel API layer for warehouse structure.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres RLS and triggers, Node contract smoke scripts.

**Spec:** `modulex-admin/ADMIN_ROADMAP.md` Phase A2.1 and the approved A2.1 design in project conversation.

## Global Constraints

- Location master writes must match `warehouse.manage`: Admin/Super Admin only.
- Warehouse-role users remain read-only for warehouse structure.
- Active stock or reservations must not be orphaned by deactivation or deletion.
- Warehouse/location hierarchy must be validated in the database, not only in the UI.
- Existing audit triggers remain authoritative; no second audit system is introduced.
- Existing production data must remain unchanged by acceptance tests; mutation acceptance uses transaction rollback.

---

### Task 1: Add the A2.1 regression contract

**Files:**
- Create: `modulex-admin/scripts/a2-warehouse-location-integrity-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Consumes: repository SQL and Admin component source files.
- Produces: `npm run smoke:a2-warehouse-integrity` and a permanent assertion set for A2.1.

- [ ] **Step 1: Write the failing test**

Add assertions that require `sql/a2-warehouse-location-integrity.sql`, Admin-only location policies, RESTRICT-style operational foreign keys, hierarchy/deactivation guard triggers, and shared UI error formatting.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:a2-warehouse-integrity`
Expected: FAIL because `sql/a2-warehouse-location-integrity.sql` and shared error formatter do not exist.

- [ ] **Step 3: Commit RED evidence**

Commit only the contract and package script.

---

### Task 2: Implement database-authoritative structure integrity

**Files:**
- Create: `modulex-admin/sql/a2-warehouse-location-integrity.sql`

**Interfaces:**
- Consumes: existing `warehouses`, `zones`, `locations`, `inventory`, `inventory_movements`, RLS helpers, and audit triggers.
- Produces: Admin-only location policies; hierarchy guards; active-parent/active-stock lifecycle guards; history-safe foreign keys.

- [ ] **Step 1: Replace location write policies**

Drop `locations_insert_admin_or_warehouse` and `locations_update_admin_or_warehouse`; create Admin-only INSERT/UPDATE policies using the existing `is_admin()` helper.

- [ ] **Step 2: Add hierarchy validation functions/triggers**

Validate `locations.zone_id` belongs to `locations.warehouse_id`; validate `inventory.location_id` belongs to `inventory.warehouse_id`; reject zone warehouse changes that would strand locations and location warehouse changes that would strand inventory.

- [ ] **Step 3: Add lifecycle guards**

Reject activating zones under inactive warehouses, activating locations under inactive warehouse/zone parents, and deactivating locations/zones/warehouses while active stock or active children would be orphaned.

- [ ] **Step 4: Harden operational foreign keys**

Replace cascade/set-null warehouse/location/zone relationships that can erase stock or movement provenance with `ON DELETE RESTRICT` while preserving existing update behavior where needed.

- [ ] **Step 5: Run contract to verify GREEN**

Run: `npm run smoke:a2-warehouse-integrity`
Expected: SQL-side assertions pass; UI formatter assertions remain RED until Task 3.

---

### Task 3: Surface lifecycle failures consistently in Admin

**Files:**
- Create: `modulex-admin/src/lib/inventory/warehouse-structure-errors.ts`
- Modify: `modulex-admin/src/components/warehouses/WarehouseForm.tsx`
- Modify: `modulex-admin/src/components/warehouses/WarehousesTable.tsx`
- Modify: `modulex-admin/src/components/zones/ZoneForm.tsx`
- Modify: `modulex-admin/src/components/zones/ZonesTable.tsx`
- Modify: `modulex-admin/src/components/locations/LocationForm.tsx`
- Modify: `modulex-admin/src/components/locations/LocationsTable.tsx`

**Interfaces:**
- Produces: `formatWarehouseStructureError(error)` returning concise operator-facing messages without hiding unknown database errors.

- [ ] **Step 1: Implement the minimal formatter**

Map A2.1 guard messages/constraint codes to actionable text; fall back to the original Supabase message.

- [ ] **Step 2: Use the formatter at all structure mutation surfaces**

Replace direct `setErrorMessage(error.message)` calls for warehouse/zone/location writes and status toggles.

- [ ] **Step 3: Run the A2.1 contract**

Run: `npm run smoke:a2-warehouse-integrity`
Expected: PASS.

---

### Task 4: Apply and verify production schema safely

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Consumes: reviewed A2.1 SQL.
- Produces: production DB hardening plus documented acceptance evidence.

- [ ] **Step 1: Apply reviewed SQL to production**

Execute the exact committed A2.1 SQL through the connected Supabase project.

- [ ] **Step 2: Run catalog verification**

Confirm location write policies are Admin-only, the new guard triggers are enabled, and targeted foreign keys are `RESTRICT` rather than cascade/set-null.

- [ ] **Step 3: Run rollback acceptance**

Inside explicit transactions, verify representative invalid hierarchy/deactivation operations fail and valid unchanged operations remain possible; rollback all test mutations.

- [ ] **Step 4: Run security/performance advisors and deterministic application verification**

Run the A2.1 contract, main Admin smoke chain, lint, and production build. Review Supabase advisor output for A2.1-specific findings.

- [ ] **Step 5: Close A2.1 roadmap items**

Document role parity, hierarchy rules, lifecycle protections, production acceptance, and verification evidence in `ADMIN_ROADMAP.md`.
