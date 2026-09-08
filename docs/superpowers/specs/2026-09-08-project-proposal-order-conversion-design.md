# Project Proposal P6 — Proposal → Order Conversion Design

Date: 2026-09-08

## Goal

Add an explicit, authorized conversion workflow from an **accepted Proposal Revision** into one or more canonical Modulex Orders without weakening Order pricing/lifecycle invariants or duplicating Order truth.

Proposal acceptance remains a pure commercial lifecycle event. It never creates an Order by itself.

## Execution baseline

- Repository: `devaeterne/modulex`
- Branch baseline: execution-time `main` after P5 owner acceptance closeout
- Parallel PR #401 is RBAC/sidebar-only and does not overlap the Proposal/Order conversion files planned here.
- Production Supabase: `bzjoeernnmvuhzyvbowc`

## Canonical boundaries discovered

### Proposal

The accepted Proposal Revision is immutable and contains:

- Areas
- optional direct Area sell amount
- optional Pricing Group membership
- Pricing Group sell amount counted once
- customer-safe scope/material snapshots
- optional internal/measurement/readiness detail that must not become customer-facing Order copy by accident

### Order

Canonical Order creation is `create_project_customer_order(...)`.

Current Order product pricing routes are authoritative:

- `price_group` products use current Product Price truth
- `countertop_material_band` products must be configured through the Countertop workspace
- `none` products cannot be added to customer Orders
- `manual_service` accepts explicit price only for the canonical active `SERVICE` / `SERVICE` product, quantity exactly `1`, with required `line_note`

Therefore P6 must **not** reinterpret a Proposal material Product as a normal Order item. A Proposal material may be Stone/Countertop or another product whose Order pricing route is not compatible with automatic item creation.

## Conversion representation

P6 creates a canonical **draft** Order and represents converted Proposal commercial scope using canonical manual Service lines.

This is intentionally a commercial-scope snapshot, not an attempt to bypass the product-specific Order configurators.

### Direct-priced Area

One selected Area with `direct_sell_amount` becomes one canonical SERVICE/manual-service line:

- quantity: `1`
- unit price: exact Proposal `direct_sell_amount`
- discount: `0`
- line note: Proposal number/revision + Area name + customer-safe scope/material snapshot

### Pricing Group

A Pricing Group is an atomic commercial price unit.

Rules:

- selecting any Area in a Pricing Group requires selecting **all** Areas in that Pricing Group
- partial group conversion fails closed
- the Pricing Group becomes exactly **one** SERVICE/manual-service Order line
- unit price is exact Pricing Group `sell_amount`
- the group price is never allocated across member Areas
- line note contains group label and all member Area names plus customer-safe group/Area scope summary

### Unpriced Area

An accepted Area with neither direct price nor Pricing Group may still carry scope. When explicitly selected it becomes one SERVICE/manual-service line at `0` with a clear scope note.

This preserves scope without inventing a commercial amount. The resulting Order is draft and remains editable through canonical Order workflows.

## Customer-safe conversion snapshot

P6 line notes may include only information already suitable for commercial/customer-facing scope:

- Proposal number and revision
- Area Name
- Area Type label when present
- material description snapshot
- finish / thickness
- square feet / linear feet
- edge profile / edge linear feet
- sink source/quantity/cutout quantity
- backsplash / backsplash notes
- scope notes
- Pricing Group label/description

P6 must not copy:

- `internal_notes`
- `measurement_notes`
- readiness state or readiness/status operational note
- supplier-internal information unless a later explicit Order contract permits it

## Source-link / idempotency model

Create append-safe conversion provenance:

### `customer_project_proposal_order_conversions`

One row per explicit conversion action.

Core fields:

- `id`
- `project_id`
- `proposal_id`
- `proposal_revision_id`
- `order_id`
- `idempotency_key`
- `created_by`
- `created_at`

Constraints:

- `order_id` unique — one canonical Order belongs to at most one Proposal conversion action
- `idempotency_key` unique — retrying the same submit returns the existing conversion/Order
- accepted Revision / Project / Proposal / Order identity must match

### `customer_project_proposal_order_conversion_areas`

One row per selected Proposal Area.

Core fields:

- `conversion_id`
- `proposal_area_id`
- `order_item_id`
- `pricing_group_id` nullable
- `created_at`

Rules:

- each Proposal Area may be converted once from its accepted baseline in P6 V1
- multiple Areas in one Pricing Group may point to the same generated Order item
- direct/unpriced Areas point to their own generated Order item
- rows are append-safe; no browser update/delete lifecycle

The one-time Area rule partitions an accepted Proposal baseline safely across multiple Orders while preventing accidental duplicate commercial scope. A future explicit split/reuse workflow would require a separate design rather than weakening this invariant.

## RPC boundary

Add one authoritative mutation RPC:

`create_order_from_accepted_project_proposal(...)`

Input:

- Project id
- Proposal id
- accepted Revision id
- selected Area ids
- idempotency key
- Order commercial context already supported by canonical Order creation:
  - price group id
  - billing/shipping address ids nullable
  - expected delivery date nullable
  - customer reference/notes/internal notes nullable
  - tax rate
  - payment method id nullable
  - fulfillment type
  - administrative fee percent

Behavior:

1. Authenticate and require Proposal/Project manage role equivalent (`super_admin`, `admin`, `sales`).
2. Lock Proposal/Revision and validate exact accepted baseline.
3. Require a non-empty, duplicate-free Area selection belonging to that Revision.
4. Acquire transaction/advisory lock over the accepted Revision.
5. Return the already-created conversion for the same idempotency key.
6. Reject Areas already linked to a prior conversion.
7. Validate Pricing Group atomicity: all members selected, no partial group.
8. Resolve the canonical active SERVICE/manual-service product server-side.
9. Build canonical Order items server-side from immutable accepted Proposal data.
10. Call canonical `create_project_customer_order(...)` with `initial_status='draft'`.
11. Record conversion + selected Area → generated Order item provenance atomically.
12. Return conversion/order metadata.

The RPC must not directly recreate Order pricing calculations. Canonical Order creation remains responsible for Order totals, tax, administrative fee, payment method behavior, lifecycle history, customer activity and Order invariants.

## Read boundary

Add:

`get_project_proposal_order_conversions(project_id, proposal_id default null, revision_id default null)`

It returns conversion history sufficient for Proposal UI to show:

- Order id / number / status
- source Proposal number / Revision
- selected Area ids/names
- conversion timestamp/actor

Read roles align with `projects.view` (`super_admin`, `admin`, `sales`, `finance`).

## UI

Add a focused `ProjectProposalOrderConversion` surface inside the Proposal tab/lifecycle area for the accepted Revision.

Behavior:

- visible only when an accepted Revision exists
- manage action only for `projects.manage`
- lists Areas with clear price mode:
  - direct amount
  - Pricing Group amount/group membership
  - unpriced scope
- group Areas select atomically
- already-converted Areas are disabled and identify linked Order
- explicit `Create Draft Order` action
- duplicate submit disabled and backed by idempotency key
- success links directly to canonical Order detail
- loading / empty / error / retry / permission states use shared Modulex primitives

P6 does not add a top-level Proposal route.

## Order defaults / commercial context

The UI reuses current Order reference/default loaders rather than hard-coding business defaults where possible.

The created Order is always `draft`. The user may continue editing through canonical Order UI, including product-specific Countertop configuration, fulfillment, addresses and other Order-owned concerns.

## Security

- no service-role browser credential
- no anonymous access
- no direct browser insert/update/delete on conversion tables
- lifecycle tables guarded/append-safe
- RPC validates active authenticated role itself
- fixed `search_path`
- source Revision must be exact accepted baseline
- source rows locked during conversion
- canonical Order RPC remains the only Order creation boundary

## Non-goals

P6 does not:

- auto-create an Order when Proposal is accepted
- auto-create Procurement, Shipment, Installation, Invoice or Calendar state
- map Stone/Countertop material Product IDs into normal Order product lines
- allocate Pricing Group amount across Areas
- mutate accepted Proposal data
- convert post-acceptance Change Orders
- expose Proposal data to Store/Customer/Dealer Portal

## Acceptance

- acceptance alone creates zero Orders
- explicit authorized conversion creates a canonical draft Project Order
- exact Proposal direct/group amounts enter Order commercial snapshot without group allocation
- partial Pricing Group selection is rejected
- repeated same idempotency key returns the original Order
- previously converted Area cannot silently convert again
- multiple disjoint Area selections can create multiple Orders for one Project/accepted Proposal
- source links identify exact Proposal Revision and Areas
- customer-safe snapshot excludes internal/measurement/readiness fields
- Order pricing/lifecycle remains authoritative after conversion
