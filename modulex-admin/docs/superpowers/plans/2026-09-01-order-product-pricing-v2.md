# Order Product Pricing V2 Implementation Plan

> **For agentic workers:** Execute inline with strict RED → GREEN checkpoints.

**Goal:** Route canonical customer order lines by dynamic Product Type pricing model while preserving existing pricing, inventory, countertop, and history engines.

**Architecture:** Add an additive DB trigger boundary that resolves Price Group prices server-side, rejects unsupported ordinary routes, snapshots Product Type/UOM semantics, and recomputes parent totals. Enrich the existing Admin order adapter and picker/detail UI; do not introduce another calculator, reservation ledger, or pricing source.

**Tech Stack:** PostgreSQL/Supabase migrations, Next.js/React/TypeScript, Node contract tests.

**Spec:** User-provided acceptance contract and `docs/acceptance/pricing-product-type-routing.md`.

## Global Constraints

- Applied migrations are immutable; production migration/deploy/business-data mutation are forbidden.
- Stone pricing remains `calculate_countertop_price` → `attach_countertop_configuration`.
- UOM is measurement semantics only.

### Task 1: RED contract

- [x] Add the order pricing routing contract.
- [x] Run it and record the expected missing-migration failure.
- [x] Commit the RED test independently.

### Task 2: DB-authoritative routing

- [x] Add the migration with snapshot columns and pinned private trigger functions.
- [x] Override Price Group unit prices and totals at the DB boundary.
- [x] Reject ordinary Countertop Material Band and No Commercial Pricing lines.
- [x] Validate the migration in an explicit transaction and prove rollback.

### Task 2B: DB-boundary hardening

- [x] Record a fresh RED contract for missing immutable code snapshots, canonical-only Stone mutation, and item-level totals reconciliation.
- [x] Preserve all five semantic snapshots unless `product_id` changes, including rejecting caller snapshot tampering.
- [x] Gate Stone commercial writes inside the existing private canonical attach function without widening grants.
- [x] Reconcile both OLD and NEW parents from stored line totals with an initially-deferred item constraint trigger.

### Task 3: Admin integration

- [x] Load Product Type/UOM/pricing route through the shared order adapter.
- [x] Show friendly route metadata and disable unsupported picker actions.
- [x] Preserve the canonical Countertop CTA/attachment flow.
- [x] Run targeted contracts, typecheck, lint, UI regression, and production build.

### Task 4: Delivery

- [ ] Commit implementation, push final HEAD, and open the required draft PR.
- [ ] Follow fresh final-HEAD GitHub checks and record exact results.
