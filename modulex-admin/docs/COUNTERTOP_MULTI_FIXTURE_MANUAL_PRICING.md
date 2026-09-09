# Countertop Multi-Fixture and Manual Pricing

This document records the Countertop order-pricing contract introduced by PR #416. It extends the existing Countertop domain without removing the legacy single-Sink/Faucet RPCs or `countertop_configurations.sink_product_id` compatibility projection.

## Fixture model

Countertop configurations persist Modulex and customer-provided Sinks/Faucets in `public.countertop_configuration_fixtures`.

- `fixture_type`: `sink` or `faucet`
- `source`: `modulex` or `customer_provided`
- `product_id`: required for Modulex fixtures; optional for customer-provided history
- `quantity`: positive quantity; use one row plus quantity instead of duplicate Modulex product rows
- `manual_unit_price`: optional Sink fallback only
- `customer_description`: optional/required history text according to source shape
- `sort_order`: stable display order

Existing `countertop_configurations.sink_product_id` values are backfilled idempotently as quantity `1` Sink fixture rows. The legacy column is retained and new multi-fixture saves project the first Modulex Sink back into it.

## Pricing snapshot

`calculate_countertop_price_multi` remains server-authoritative and returns:

- Material/Stone subtotal
- optional one-time Material Cost
- Edge subtotal
- aggregate Sink subtotal
- aggregate Faucet subtotal
- Additional Services subtotal
- normalized `fixtures`, `sinks`, `faucets`, and `services` lines
- final subtotal

Each Modulex fixture line snapshots product identity, quantity, resolved unit price, price source, and line subtotal. Sink pricing preserves the existing positive-price/manual-fallback contract. Faucet pricing preserves the legacy behavior where any current active price row is authoritative, including an active zero-valued price. Customer-provided fixtures contribute zero to sell pricing.

The legacy Countertop snapshot enrichment trigger remains in place for old RPCs. `trg_countertop_multi_snapshot_restore` runs after multi-fixture saves so manual-service lines and fixture arrays remain authoritative while the first Sink/Faucet is projected into legacy singular snapshot keys.

## Material Cost and Additional Services

`Material Cost` is an optional one-time additive amount. It does not change the selected Material Price Band or the existing Manual $/sq-ft override.

Additional Services support two price entry modes:

- `fixed`: the managed service `unit_price` is authoritative.
- `manual`: the order must supply a positive `manual_unit_price` when the service is selected.

The initial Manual Per Order services are:

- New Garbage Disposal Install
- New Cooktop Install
- New Dishwasher Install

Manual service price is multiplied by quantity according to the existing service pricing-method rules.

## Manual Stone lifecycle

A Stone is usable by Countertop pricing when:

- the Product is active,
- it has an active `countertop_stone_product_profiles` row,
- the referenced Stone Type is active and the Product Type is canonical `STONE`.

A default Material Price Band is not a lifecycle prerequisite. A Stone whose profile has no default band can appear in the Configurator; the order must then either select an active Material Price Band or use the existing Manual $/sq-ft override. Server pricing fails closed if neither is supplied.

Manual-import review metadata such as `review_required` or `brand_pending_review` is treated as data-quality workflow state rather than a Countertop lifecycle blocker. Product-master relational requirements remain unchanged; the import path may use its existing review/placeholder Brand relation while the unresolved Brand is reviewed.

## Product Type validation

Modulex fixtures are validated through canonical Product Type relations, not metadata alone:

- Sink: `SINK`
- Faucet: `FUCST`
- Stone: `STONE`

Inactive or wrong-type Modulex products fail closed.

## RPC compatibility

New canonical entry points:

- `public.calculate_countertop_price_multi`
- `public.attach_countertop_configuration_multi`
- `public.create_and_attach_countertop_order_item_multi`
- `public.upsert_countertop_service_reference`

The pre-existing single-fixture Countertop RPC signatures remain installed for compatibility. Existing orders and snapshots are not rewritten beyond the idempotent legacy Sink child-row backfill.

## Security

Mutation functions keep the established admin/sales authorization boundary and private `SECURITY DEFINER` / public `SECURITY INVOKER` split. Search paths are pinned. Browser code does not use service-role credentials. The fixture child table enables RLS and exposes authenticated read access only through the established Countertop role predicate; writes are performed through authorized server RPCs.

## Canonical migrations

Apply in timestamp order after merge:

1. `20260909193000_countertop_manual_services_material_cost.sql`
2. `20260909200500_countertop_faucet_zero_price_compat.sql`
3. `20260909201000_countertop_multi_snapshot_compat.sql`

Production rollout should be followed by schema/function/policy read-back and verification that the requested Manual Per Order services exist exactly once.
