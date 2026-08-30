# Countertop / Stone / Sink MVP Acceptance

Status: **IN PROGRESS — production migration and authenticated acceptance pending**

Implemented on branch `feat/countertop-stone-sink-domain`:

- canonical `products` identity retained; no second product engine;
- quantity-based slab contract uses `unit = 'slab'`, existing inventory quantity/reserved semantics, and existing reservation/movement boundaries;
- manageable stone types, edge profiles, repeatable services, and additive configuration/snapshot schema;
- server-side `calculate_countertop_price` and draft-order `attach_countertop_configuration` RPC boundaries;
- Admin `/pricing/countertop` preview and draft snapshot attachment surface.

Production data and schema were not mutated. Before merge/closeout, run production schema/data preflight, rollback-only RPC probes, Security/Performance Advisors, authenticated Admin acceptance, and final Admin/Store/Customer/Dealer regression verification.
