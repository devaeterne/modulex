# Countertop Faucet Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Faucet selection to Order Countertop create/edit flows with Modulex catalog pricing or Customer Provides manual model details.

**Architecture:** Extend the existing Sink pattern without changing existing public attach/create RPC signatures. Faucet identity is persisted in Countertop `configuration`; a new authoritative pricing RPC prices Modulex Faucets from active USD Price Group prices, while private attach recalculates the Faucet from configuration before persisting totals and immutable snapshot data. Customer-provided Faucets remain zero-price project history only.

**Tech Stack:** Next.js/React/TypeScript, Supabase JS, PostgreSQL/PLpgSQL, Node contract scripts.

**Spec:** Approved chat design: Faucet is optional; select a Modulex Faucet or Customer Provides; customer-provided may use a catalog match or free-text brand/model/finish; Modulex Faucet is automatically priced; customer-provided Faucet is $0 and not reserved.

## Global Constraints

- Preserve existing Countertop Sink, material, edge, service, manual-override, and order-total behavior.
- Preserve existing public attach/create RPC signatures for backward compatibility.
- Modulex Faucet pricing must be server-authoritative from the order Price Group and USD active product price.
- Customer-provided Faucet must never contribute price or reservation quantity.
- Existing Countertop rows without Faucet configuration must remain unchanged.
- Canonical database migration lives in `modulex-store/supabase/migrations`.

---

### Task 1: Define Faucet UI and persistence contract

**Files:**
- Modify: `modulex-admin/scripts/countertop-ui-contract.mjs`

**Interfaces:**
- Consumes: existing Countertop Configurator and summary contracts.
- Produces: failing assertions for Faucet selector, customer-provided details, pricing, snapshot, and summary behavior.

- [ ] Add assertions for `CUSTOMER_PROVIDED_FAUCET_VALUE`, Faucet catalog loading, Faucet configuration keys, customer-provided validation, authoritative pricing RPC parameters, `faucet_subtotal`, and Faucet detail rendering.
- [ ] Run the contract in CI and confirm RED because Faucet implementation/migration are absent.
- [ ] Commit the RED contract before production implementation.

### Task 2: Add authoritative Faucet pricing and immutable snapshot semantics

**Files:**
- Create: `modulex-store/supabase/migrations/20260908010000_countertop_faucet_selection.sql`

**Interfaces:**
- Produces: `public.calculate_countertop_price_with_faucet(...)` returning existing Countertop pricing plus `faucet_subtotal`, `faucet_price_source`, and adjusted `subtotal`.
- Consumes: Faucet identity from `configuration.faucet_product_id` / `configuration.faucet_source` during attach.

- [ ] Validate Modulex Faucet is an active `products` row tagged `metadata.product_kind = faucet`.
- [ ] Resolve its current active USD `product_prices` amount for the selected Price Group; fail closed when unavailable.
- [ ] Return zero Faucet subtotal for no Faucet or Customer Provides.
- [ ] Replace private attach implementation so save recalculates Faucet server-side from configuration while retaining its existing external signature.
- [ ] Enrich immutable pricing snapshots with Modulex or customer-provided Faucet identity and totals.
- [ ] Preserve grants/search_path/security behavior from current Countertop functions.

### Task 3: Add Faucet controls to Countertop Configurator

**Files:**
- Modify: `modulex-admin/src/components/countertop/CountertopConfigurator.tsx`

**Interfaces:**
- Consumes: `calculate_countertop_price_with_faucet`.
- Produces configuration keys `faucet_source`, `faucet_product_id`, `customer_provided_faucet_product_id`, `customer_provided_faucet_name`, `customer_provided_faucet_sku`, `customer_provided_faucet_note`.

- [ ] Load active Faucet catalog products alongside Sinks.
- [ ] Add Modulex / Customer Provides searchable Faucet selection immediately after Sink controls.
- [ ] Require either a customer-provided catalog match or free-text model details when Customer Provides is selected.
- [ ] Hydrate all Faucet fields during edit from existing configuration.
- [ ] Send Modulex Faucet id to quote RPC and persist Faucet configuration during attach/create.
- [ ] Render Faucet subtotal and Customer Provides badge in price summary.

### Task 4: Render Faucet in order/commercial details

**Files:**
- Modify: `modulex-admin/src/lib/customers/countertop-summary.ts`
- Modify: `modulex-admin/src/components/customers/CountertopLineDetails.tsx`
- Modify if required: `modulex-admin/src/lib/customers/types.ts`

**Interfaces:**
- Consumes: immutable `pricing_snapshot.faucet`.
- Produces: Faucet name/sku/source/subtotal in existing Countertop detail surfaces.

- [ ] Parse Faucet snapshot without changing old rows that lack it.
- [ ] Show Faucet in Order line detail only when present.
- [ ] Show Faucet in commercial/print detail only when present.

### Task 5: Verify and prepare PR

**Files:**
- Test: `modulex-admin/scripts/countertop-ui-contract.mjs`
- Test: existing repository CI workflows relevant to Admin/Countertop/migrations.

- [ ] Confirm the Countertop contract turns GREEN in CI.
- [ ] Confirm existing Admin checks remain GREEN.
- [ ] Review branch diff for accidental #369/#370 overlap.
- [ ] Open a draft PR describing migration, pricing semantics, backward compatibility, and verification evidence.
