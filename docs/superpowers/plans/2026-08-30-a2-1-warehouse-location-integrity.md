# A2.1 Warehouse / Location Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make warehouse, zone, location, and inventory structure changes fail closed so role boundaries, hierarchy, stock state, and history cannot be silently corrupted.

**Architecture:** Keep the existing Supabase-first Admin architecture. Postgres RLS, constraints, and triggers are authoritative for integrity and lifecycle rules; existing browser mutation surfaces continue to display database `error.message` directly. No parallel warehouse API or duplicate UI error layer is introduced. Location creation/master-data changes remain Admin/Super Admin responsibilities, while the warehouse role keeps the narrow location UPDATE capability required by existing SECURITY INVOKER QR RPCs through a field-level database guard.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres RLS and triggers, Node contract smoke scripts.

**Spec:** `modulex-admin/ADMIN_ROADMAP.md` Phase A2.1 and the approved A2.1 design in project conversation.

## Global Constraints

- Location creation and master-data changes must match `warehouse.manage`: Admin/Super Admin only.
- Warehouse-role users remain read-only for warehouse structure but retain approved QR operational updates.
- Active stock or reservations must not be orphaned by deactivation or deletion.
- Warehouse/location hierarchy must be validated in the database, not only in the UI.
- Existing audit triggers remain authoritative; no second audit system is introduced.
- Existing production data must remain unchanged by acceptance tests; mutation acceptance uses transaction rollback.

---

### Task 1: Add the A2.1 regression contract

**Files:**
- Create: `modulex-admin/scripts/a2-warehouse-location-integrity-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `.github/workflows/admin-inventory-warehouse-qr-ui.yml`

**Interfaces:**
- Consumes: repository SQL and existing Admin mutation surfaces.
- Produces: `npm run smoke:a2-warehouse-integrity` and permanent A2.1 assertions.

- [x] **Step 1: Write the failing contract**
  - Initial RED required the missing A2.1 SQL contract and failed in Actions run `33306590705`.

- [x] **Step 2: Cover QR-role compatibility before hardening UPDATE access**
  - A second RED explicitly required the warehouse role's existing QR mutation path to survive the hardening; Actions run `33306811410` failed until the field-level role guard was implemented.

- [x] **Step 3: Wire the contract permanently**
  - `smoke:a2-warehouse-integrity` is part of the Admin `smoke` chain and the inventory/warehouse/QR workflow.

---

### Task 2: Implement database-authoritative structure integrity

**Files:**
- Create: `modulex-admin/sql/a2-warehouse-location-integrity.sql`

**Interfaces:**
- Consumes: existing `warehouses`, `zones`, `locations`, `inventory`, `inventory_movements`, RLS helpers, QR RPCs, and audit triggers.
- Produces: master-data role guards, hierarchy guards, active-parent/active-stock lifecycle guards, and history-safe foreign keys.

- [x] **Step 1: Align location roles without breaking QR operations**
  - Removed warehouse-role location INSERT and replaced it with `locations_insert_admin_only`.
  - UPDATE remains RLS-visible to Admin/Super Admin/Warehouse only because existing SECURITY INVOKER QR RPCs update location QR fields.
  - `private.guard_location_master_role()` allows Admin/Super Admin full master-data changes and limits warehouse-role UPDATEs to QR operational fields; warehouse users cannot change warehouse/zone assignment, name/code/type, aisle/rack/shelf/bin, capacity, or active state.

- [x] **Step 2: Add hierarchy validation functions/triggers**
  - Location zone must belong to the same warehouse.
  - Inventory location must belong to the same warehouse as its inventory row.
  - Zone warehouse changes are rejected while locations remain assigned.
  - Location warehouse changes are rejected while inventory rows remain assigned.

- [x] **Step 3: Add parent-state and deactivation guards**
  - Active zones require an active warehouse.
  - Active locations require an active warehouse and, when assigned, an active zone.
  - Stock/reservations block location deactivation.
  - Active child locations/stock block zone deactivation.
  - Active child zones/locations or stock block warehouse deactivation.

- [x] **Step 4: Harden operational foreign keys**
  - Inventory, zone/location structure, and inventory movement warehouse/location references use `ON DELETE RESTRICT` so physical deletion cannot silently cascade stock away or null historical provenance.

- [x] **Step 5: Verify targeted GREEN**
  - Actions run `33306913730` passed the existing inventory/warehouse/QR contract, A2.1 contract, production-surface, RBAC, lint, and Next.js production build.

---

### Task 3: Keep operator-facing errors database-authoritative

**Files:**
- Existing warehouse/zone/location forms and tables remain unchanged.

**Interfaces:**
- Existing mutation surfaces already render Supabase `error.message` directly.

- [x] **Step 1: Put actionable failure messages in the database guards**
  - Stock-blocked operations instruct operators to move stock first.
  - Parent/child lifecycle errors state the required deactivation order.
  - Hierarchy errors explain the same-warehouse requirement.
  - Warehouse-role violations explain that only QR operational fields are allowed.

- [x] **Step 2: Avoid duplicate UI error translation**
  - A temporary formatter was intentionally removed after verification showed the existing mutation surfaces already propagate the authoritative guard messages. This keeps one source of truth for operational failures.

---

### Task 4: Apply and verify production schema safely

**Files:**
- `modulex-admin/ADMIN_ROADMAP.md` Phase A2.1 closeout is the remaining project-status update.

**Interfaces:**
- Consumes: committed A2.1 SQL.
- Produces: production DB hardening plus acceptance evidence.

- [x] **Step 1: Preflight exact DDL in production with rollback**
  - The reviewed DDL executed successfully inside an explicit `BEGIN ... ROLLBACK` transaction before permanent application.

- [x] **Step 2: Apply reviewed SQL to production**
  - Supabase migration `20260830103947_a2_warehouse_location_integrity` applied successfully.

- [x] **Step 3: Verify the live catalog**
  - All eight A2 trigger families are enabled.
  - Location INSERT is Admin-only and warehouse-role UPDATE is field-guarded to preserve QR operations.
  - All nine targeted warehouse/location/history foreign keys report `ON DELETE RESTRICT`.

- [x] **Step 4: Run rollback acceptance**
  - Transaction-scoped acceptance proved a temporary warehouse-role subject can perform a QR-only location update but receives `42501` for master-data changes.
  - Stocked location deactivation and active warehouse deactivation were rejected by the new guards.
  - The transaction rolled back; post-acceptance production counts and hierarchy mismatch counts were unchanged.

- [x] **Step 5: Run advisors and deterministic application verification**
  - Post-DDL Security/Performance Advisor review found no A2.1-specific new finding; existing Store/support/HR/security and unused-index backlog remains separate.
  - Actions run `33306913730` passed A2.1 + inventory/warehouse/QR + production-surface + RBAC + lint + production build.
  - Actions run `33306913738` additionally passed Admin A1 regressions, Store portal boundary checks, lint, and production builds on the same branch head.
