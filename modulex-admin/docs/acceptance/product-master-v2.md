# Product Master UX v2 acceptance

Status: implementation complete and rollback-based PostgreSQL runtime acceptance passed; production migration, merge/deploy, and authenticated production UI acceptance remain pending.

This package adds dynamic Product Types and Units of Measure without replacing the canonical `products` identity, legacy `products.unit` compatibility mirror, inventory/reservation engine, pricing engine, Countertop values, order snapshots, or Store publication workflow.

## Migrations

All Product Master v2 migrations are additive and remain unapplied to production:

- `20260831140000_product_master_v2_dynamic_types_uom.sql`
- `20260831141000_product_master_v2_runtime_hardening.sql`
- `20260831142000_product_master_v2_json_runtime_fix.sql`

## Implemented surface

- Dynamic Product Types with controlled capabilities, pricing model, Allowed UOMs, and Default UOM.
- Dynamic Units of Measure with legacy `products.unit` compatibility.
- Product Create/Edit v2 with server-authoritative transactional Product + optional Stone profile mutation.
- Product Type transition guards for stock, reservations, order history, and Countertop dependencies.
- Product List v2 with Product Type/UOM/QR filters, stock projection, Stone summary, server paging, filtered CSV export, and full-width responsive table behavior.
- Low Stock v2 with server-side Type/UOM/search/view paging and UOM-safe server summary aggregation.
- Brand/Category usage counts and filtered `View Products` navigation.
- Automatic SVG product QR lifecycle using the current SKU, explicit regeneration/retry, and post-success old-object cleanup.

## Production-schema rollback acceptance

Runtime PostgreSQL acceptance was executed against the current production schema inside explicit database transactions and ended with `ROLLBACK`. The Product Master migrations were not registered in migration history and no persistent Product Master schema or test fixture was left behind.

Verified runtime behavior:

- migration compile/apply against the current production dependency graph;
- legacy Product Type/UOM backfill;
- Allowed/Default UOM enforcement and exactly-one-default behavior;
- referenced UOM lifecycle rejection;
- transactional Stone product + Stone profile creation;
- failed Stone profile creation leaves no partial product/profile;
- unrelated existing product metadata is preserved on edit;
- on-hand/reserved stock blocks unsafe Product Type transition;
- customer order history blocks unsafe Product Type transition;
- safe Stone to non-countertop transition deactivates the active Stone profile;
- Sink compatibility sets `metadata.product_kind = 'sink'` and later removes only that compatibility key when leaving Sink behavior;
- Low Stock summary is independent of page number and shortfall remains grouped by UOM.

Post-rollback production verification:

- `products`: 463 rows;
- `public.product_types`: absent;
- `public.units_of_measure`: absent;
- Product Master v2 production migration-history entries: 0;
- permanent acceptance fixtures: 0.

## Current CI verification

Current Product Master branch verifies successfully across the relevant Admin surfaces, including Product List, A3.1 Product Master, Low Stock UI/A2.4 reporting, A1 Core Operations, A2.3 stock operations/scanning, Inventory/warehouse QR, Products/Pricing UI, Admin UI Foundation, dashboard shell, users/store, general settings, and personnel checks.

GC-6, GC-7, and GC-8A Store regressions also pass. `GC-8B Accessibility Performance` remains red only for the pre-existing Store performance contract that detects literal `Playfair Display` usage in `portal-dealer.css` and `portal-fulfillment.css`; its accessibility and Lighthouse baseline checks pass, and this Product Master package does not modify those CSS files.

## Scope boundary

This package does not redesign Pricing. Ramazan Bey's Countertop material bands B1-R22, Edge prices, Countertop Service prices, and Countertop calculation formulas remain unchanged. The canonical inventory/reservation engine, historical order snapshots, and Store publishing workflow also remain unchanged.

## Remaining acceptance

1. Merge PR #190 after final review.
2. Apply the three Product Master migrations to production in order.
3. Re-run Supabase Security/Performance advisors against the persisted Product Master objects.
4. Verify the deployed Admin Product List/Create/Edit/Product Types/UOM/Low Stock/Brands/Categories/QR surfaces with authenticated production UI acceptance.
5. Only after those production gates pass, mark Product Master UX v2 `[x]` in `ADMIN_ROADMAP.md` and move to the separate Pricing UX package.
