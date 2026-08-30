# Countertop / Stone / Sink MVP Acceptance

Status: **IN PROGRESS — production migration and authenticated acceptance pending**

Implemented on branch `feat/countertop-stone-sink-domain`:

- canonical `products` identity retained; no second product engine;
- quantity-based slab contract uses `unit = 'slab'`, existing inventory quantity/reserved semantics, and existing reservation/movement boundaries;
- manageable stone types, edge profiles, repeatable services, and additive configuration/snapshot schema;
- separate countertop material bands (`B1`–`R22`) and validated `countertop_stone_product_profiles` keep customer `price_groups` distinct;
- commercial job quantity remains `1` while `slab_quantity`/`countertop_reservation_quantity` reconciles additional slab reservations through existing inventory reservations;
- server snapshot stores DB-derived stone, band, service and override data; client configuration is limited to notes;
- server-side `calculate_countertop_price` and draft-order `attach_countertop_configuration` RPC boundaries;
- Admin `/pricing/countertop` preview and draft snapshot attachment surface.

Production data and schema were not mutated. Read-only preflight confirmed the countertop tables/migration are not yet present in production and the existing reservation table is present. Before merge/closeout, run migration validation/rollback-only RPC probes, Security/Performance Advisors, authenticated Admin acceptance, and final Admin/Store/Customer/Dealer regression verification.
