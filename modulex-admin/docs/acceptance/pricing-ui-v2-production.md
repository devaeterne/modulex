# Pricing UI v2 Production Acceptance

Date: 2026-09-02
Status: COMPLETE

## Scope

Final production acceptance for Pricing UI v2 / Product Type routing across Product Prices and Countertop Material Bands.

Vendor Catalog behavior is intentionally excluded from this acceptance package and remains a separate workstream.

## Production baseline

- Pricing UI v2 implementation PR #206 is merged.
- Production migration history contains `pricing_product_type_routing` as version `20260831235918`.
- Current Admin production deployment `dpl_Pn56aQhDGKAXprs7K2bUXJdKwFNg` is `READY` from current `main` SHA `6bd39e6abcdd67aafb41d4ab6307f978479ffac7`.
- The current production deployment is a descendant of the Pricing UI v2 merge and includes the later compact Pricing workspace UI from PR #211.

## Pricing routing contract

The production database keeps the approved source-of-truth split:

- `price_group` products use canonical `product_prices + price_groups`.
- `countertop_material_band` products use the Stone profile → `countertop_material_price_bands` path.
- `none` exposes no editable commercial product price.
- UOM remains quantity/measurement semantics and does not own price amounts.

Production routing reconciliation at acceptance time returned:

- `price_group_products`: 1,029;
- `material_band_products`: 1;
- `no_pricing_products`: 0.

`get_product_prices_page_v2(...)` returned only `pricing_model = 'price_group'` rows and exposed Product Type/UOM filter metadata as expected.

## Authenticated application-role acceptance

Acceptance was executed against production inside explicit transactions with `SET LOCAL ROLE authenticated` and an active Admin identity; all mutation probes were rolled back.

Authenticated Product Prices read acceptance returned:

- authenticated context: true;
- exact Product Prices directory total: 1,029;
- all sampled rows routed through `price_group`;
- Product Type filters present;
- UOM filters present.

Function/grant inspection confirmed:

- `get_product_prices_page_v2` is `SECURITY INVOKER`, uses `search_path=pg_catalog, public`, is executable by `authenticated`, and is not executable by `anon`;
- `set_product_price` is `SECURITY INVOKER`, uses `search_path=pg_catalog, public`, is executable by `authenticated`, and is not executable by `anon`;
- public `upsert_countertop_reference` remains a `SECURITY INVOKER` wrapper with authenticated-only browser execution; its private mutation core is role-checked and uses a pinned safe search path.

## Fail-closed price mutation acceptance

Inside an authenticated rollback-only transaction:

1. A product whose Product Type uses `countertop_material_band` was intentionally passed to `set_product_price(...)` with the base/List Price group.
2. The mutation was correctly rejected with `This Product Type does not use Price Group pricing.`
3. The canonical Material Band write path was exercised through `upsert_countertop_reference(p_kind => 'material_band')` using the existing B1 band and its unchanged value.
4. The Material Band write returned the existing B1 identity successfully.
5. The transaction was rolled back.
6. Post-rollback B1 remained `$34.0000`.

No production business data persisted from this acceptance run.

## Production route/runtime verification

The current production Admin deployment returned HTTP 200 with the expected Modulex surfaces and deployed route bundles for:

- `/pricing/products` — `Product Prices | Modulex Admin`;
- `/pricing/material-bands` — `Material Bands | Modulex Admin`.

Vercel runtime inspection found no errors for either Pricing route in the inspected 24-hour window.

## CI evidence

Pricing implementation and UI regression coverage remain permanent in the repository:

- PR #206 Admin Products Pricing workflow run `33451480069` passed Product/Pricing UI, Product Type pricing, production-surface, RBAC, lint, and production build contracts.
- PR #211 compact Pricing workspace run `33453776288` passed the same Pricing/Product Type contract set plus production build after the final UI polish.
- Later full-route regression also retained `/pricing/material-bands` in the production route inventory.

The current `main` commit is a later descendant. Its only directly-triggered check for the latest unrelated change is Vendor-specific; the Pricing executable surface has not been replaced and was independently verified against production DB, route bundles, and runtime during this acceptance.

## Supabase Advisor closeout

Fresh Security and Performance Advisor scans were run after the production acceptance probes.

No finding is specific to Pricing UI v2, `get_product_prices_page_v2`, `set_product_price`, the Product Type pricing guard, or `countertop_material_price_bands`.

Existing project-level findings remain separate backlog, including Store/support SECURITY DEFINER warnings, leaked-password protection, unrelated unindexed foreign keys/unused indexes, and an existing Store permissive-policy warning. They are not introduced by Pricing UI v2 and do not block this closeout.

## Result

**Pricing UI v2 production acceptance: PASS / COMPLETE.**

The production migration, Product Type routing, authenticated Product Prices read boundary, fail-closed Stone Price Group guard, canonical Material Band mutation path, route deployment, runtime health, and post-DDL Advisor review are all verified. No production business-data mutation was retained.
