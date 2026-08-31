# Countertop / Stone / Sink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a focused, additive countertop configuration flow using the existing Product, Pricing, Inventory, Order, and Portal contracts.

**Architecture:** Keep `products` canonical and use validated metadata for subtype attributes. Add reference tables and one order-linked configuration/snapshot model; calculations and reservation entrypoints remain server-side and DB-authoritative.

**Tech Stack:** Next.js/TypeScript Admin and Store, Supabase PostgreSQL migrations/RPCs, existing smoke-contract scripts.

**Spec:** `modulex-admin/docs/superpowers/specs/2026-08-31-countertop-stone-sink-domain-design.md`

## Global Constraints

- No individual slab identity in MVP.
- No second product, pricing, inventory, or order engine.
- No production migration application or production data mutation before acceptance.
- No service-role/elevated credential in browser code.
- Existing non-countertop and portal boundaries must remain unchanged.

### Task 1: Schema and DB contract

**Files:**
- Create: `modulex-admin/sql/countertop-stone-sink-domain.sql`
- Test: `modulex-admin/scripts/countertop-domain-contract.mjs`

- [ ] Write RED contract for reference data, metadata validation, configuration snapshot columns, and RLS/grants.
- [ ] Add additive tables for stone types, edge profiles, and repeatable services with seeded reference rows.
- [ ] Add order-linked configuration/snapshot table and RPCs for deterministic calculation, snapshot creation, and quantity-based reservation.
- [ ] Add constraints, explicit grants, RLS, audit hooks, and idempotency checks following existing conventions.
- [ ] Run contract against source SQL and a transaction-scoped local/rollback probe where available.

### Task 2: Shared domain calculator and validation

**Files:**
- Create: `modulex-admin/src/lib/countertop/domain.ts`
- Test: `modulex-admin/scripts/countertop-domain-contract.mjs`

- [ ] Add behavioral tests for sqft, linear feet, each/flat charges, manual override, invalid dimensions, inactive references, and immutable snapshot values.
- [ ] Implement string/numeric contract-compatible calculation without browser-trusted totals.
- [ ] Map domain errors to existing Admin mutation error conventions.

### Task 3: Admin thin-slice UI

**Files:**
- Create or modify only the existing product/order/inventory surfaces required for countertop flow.
- Test: `modulex-admin/scripts/countertop-domain-contract.mjs`

- [ ] Add permission-gated stone/sink metadata and SLAB inventory controls using existing shared UI primitives.
- [ ] Add a minimal countertop order/configuration form that submits references and measurements, never a trusted final price.
- [ ] Display explicit loading, empty, error, retry, and permission-denied states.

### Task 4: Store and Portal projection

**Files:**
- Modify: existing Store product/order projection types and queries only where required.
- Test: `modulex-store/scripts/countertop-domain-contract.mjs`

- [ ] Add only approved public/product and portal order snapshot fields.
- [ ] Assert cost, margin, reserved stock, supplier data, and internal notes remain excluded.

### Task 5: Regression and acceptance

- [ ] Run Admin product, pricing, inventory, reservation, order, RBAC, UI, typecheck, lint, and build checks.
- [ ] Run Store public catalog, customer portal, dealer portal, typecheck, lint, and build checks.
- [ ] Run Supabase Security/Performance Advisors after schema/RPC changes and record unrelated findings separately.
- [ ] Update roadmap to `[x]` only after production acceptance; otherwise retain `[~]` with blockers.
