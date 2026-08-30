# Countertop / Stone / Sink Domain Design

## Goal

Add a production-safe countertop thin slice by reusing canonical products, price groups, inventory quantities/reservations, customer orders, and portal projections.

## Architecture

Stone and sink identity remains in `products`; stone/sink attributes are validated metadata unless a later requirement proves relational integrity or indexed lookup necessary. MVP slab stock is quantity-based inventory with `unit = 'slab'`, preserving `quantity - reserved_quantity`, existing movement ledger, reservation RPCs, and idempotency. A dedicated countertop configuration row stores live references plus immutable order-time display/pricing snapshots.

Server-side RPCs validate dimensions, active products/options, price-group/manual overrides, calculate deterministic numeric totals, create the existing order item, persist the snapshot, and reserve stock through the existing reservation boundary. No public raw-table access or service-role browser credential is introduced.

## MVP boundaries

- Include manageable stone types, edge profiles, repeatable services, and price-group/manual per-square-foot pricing.
- Include square-foot, linear-foot, each, and flat charge methods.
- Include quantity-based slab reserve/release/consume integration.
- Exclude individual slab serials, remnant tracking, advanced fabrication optimization, supplier catalog imports, and faucet-specific rules.

