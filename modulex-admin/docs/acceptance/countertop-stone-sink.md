# Countertop / Stone / Sink MVP Acceptance

Status: **PRODUCTION ACCEPTED — CLOSED**

Implemented on branch `feat/countertop-stone-sink-domain`:

- canonical `products` identity retained; no second product engine;
- quantity-based slab contract uses `unit = 'slab'`, existing inventory quantity/reserved semantics, and existing reservation/movement boundaries;
- manageable stone types, edge profiles, repeatable services, and additive configuration/snapshot schema;
- separate countertop material bands (`B1`–`R22`) and validated `countertop_stone_product_profiles` keep customer `price_groups` distinct;
- commercial job quantity remains `1` while `slab_quantity`/`countertop_reservation_quantity` reconciles additional slab reservations through existing inventory reservations;
- server snapshot stores DB-derived stone, band, service and override data; client configuration is limited to notes;
- server-side `calculate_countertop_price` and draft-order `attach_countertop_configuration` RPC boundaries;
- Admin `/pricing/countertop` preview and draft snapshot attachment surface.

## Production acceptance

Applied production migrations, in order: `countertop_stone_sink_mvp`, `customer_order_revision_identity`, `countertop_portal_safe_projection`, `countertop_security_fk_hardening`, and `countertop_runtime_acceptance_hardening`.

Authenticated Admin acceptance passed: reference audit INSERT/UPDATE identity, server-side calculation and attach, material `410`, edge `50`, services `100`, countertop subtotal `560`, parent order subtotal `839`, preserved order discount `93`, tax `74.6000`, total `820.6000`, commission `41.0300`, grand total `861.6300`, slab reservation quantity, and manual-override actor/reason/time.

Rollback-only acceptance passed for canonical reservation reconciliation (`1→2`, `2→3`, `3→1`, idempotent repeat, shortage rollback/no drift) and revision identity/configuration preservation. Historical pricing snapshots remained unchanged after master-data edits.

Customer and Dealer Portal safe historical projections passed with customer isolation. Security Advisor reported no new countertop finding; Performance Advisor reported no countertop unindexed-FK finding (new indexes appear only as expected `unused_index` information). Acceptance fixtures were cleaned up: no permanent countertop test rows or acceptance profiles remain, `ORD-000003` was restored, and the confirmed reservation fixture returned to its original state.

All acceptance mutations were rollback-only except the reviewed production migration application. No permanent test data was created.
