# VAL-2 + VAL-4 Production Acceptance

Status: **COMPLETE**  
Date: **2026-09-02**

## Scope

This closeout covers only:

- **VAL-2 — Products & Pricing**
- **VAL-4 — Inventory + Warehouses + Stock Operations**

Vendor Catalog behavior is explicitly excluded from this acceptance package and remains owned by its parallel workstream.

## Delivery lineage

- VAL-2 implementation PR **#188** is merged as `fa22a40f4e8976474f4f5b7587b3a66a13539854`.
- VAL-4 implementation PR **#224** is merged as `10fbbc9a9f4c7729fb320ae24b5682e33128ea1e`.
- Production Admin deployment `dpl_Pn56aQhDGKAXprs7K2bUXJdKwFNg` is `READY` on commit `6bd39e6abcdd67aafb41d4ab6307f978479ffac7`.
- That deployed commit is a descendant of both implementation merge commits, so both validation packages are present in the running Admin application.
- This documentation closeout branch was created from execution-time `main` `2789ffebf147e701682ea97f4f1a09481fa29e45` after PR #258 advanced the repository during acceptance.

## Production database contract

The live production schema matches the validation contracts exercised by the Admin UI:

### VAL-2

- `products.min_stock_level` → `numeric(12,2)`
- `product_prices.amount` → `numeric(18,4)`
- `product_costs.amount` → `numeric(18,4)`
- `product_margin_settings.min_margin_percent` → `numeric(7,3)`
- `pricing_settings.default_min_margin_percent` → `numeric(7,3)`
- `pricing_settings.warning_margin_buffer_percent` → `numeric(7,3)`

### VAL-4

- `inventory.quantity` → `numeric(12,2)`
- `inventory.reserved_quantity` → `numeric(12,2)`
- Warehouse code and name non-empty constraints are present.
- Warehouse type remains constrained to the canonical `sellable` / `non_sellable` values.

These definitions match the precision, scale, minimum/range, and required-field rules enforced by the shared Admin validation helpers and the VAL-2 / VAL-4 contracts.

## Authenticated production acceptance

Acceptance mutations were executed under the real `authenticated` PostgreSQL role with an active production super-admin profile inside explicit transactions and were rolled back. No acceptance business data persisted.

### VAL-2 exact decimal mutation

The canonical `set_product_price` RPC was called with an exact amount of `0.0001` for an existing Price Group product.

- The active row read inside the transaction preserved the exact value `0.0001`.
- The transaction was rolled back.
- The original production value `0.0000` was restored after rollback.

This confirms the production mutation boundary preserves the four-decimal `numeric(18,4)` contract rather than truncating the client value.

### VAL-4 exact stock quantity + idempotency

The canonical `stock_in_idempotent` RPC was called with quantity `0.01` for an existing inventory row.

- Inventory quantity increased by exactly `0.01` inside the transaction.
- Exactly one movement existed for the acceptance idempotency key inside the transaction.
- The transaction was rolled back.
- Inventory returned to its original quantity and reserved quantity.
- Zero movement rows remained for the acceptance idempotency key after rollback.

This confirms the production stock boundary accepts the validated minimum positive `numeric(12,2)` quantity, preserves idempotent movement behavior, and leaves no acceptance residue.

## Authorization boundary

The relevant production RPCs remain `SECURITY INVOKER` and narrowly granted:

### VAL-2

- `set_product_price`
- `set_product_prices_bulk`
- `set_product_costs_bulk`

### VAL-4

- `stock_in_idempotent`
- `stock_out_idempotent`
- `stock_transfer_idempotent`
- `reserve_stock_idempotent`
- `release_stock_idempotent`

For these functions:

- `authenticated` has `EXECUTE`.
- `anon` does not have `EXECUTE`.
- `PUBLIC` does not have `EXECUTE`.

No authorization widening was introduced by this closeout.

## Live Admin route and runtime verification

The following production routes returned HTTP 200 and served their expected Modulex Admin page bundles/titles:

### VAL-2

- `/products`
- `/pricing/products`
- `/pricing/cost-margin`

### VAL-4

- `/warehouses`
- `/stock-operations`
- `/inventory`

No runtime errors were found for these six routes in the inspected 24-hour Vercel runtime window.

## Supabase Advisors

Fresh production Security and Performance Advisor scans were reviewed during closeout.

- No finding was identified that is specific to the VAL-2 validation changes.
- No finding was identified that is specific to the VAL-4 validation changes.
- Existing unrelated project-wide security/performance backlog remains separate and is not represented as clean by this acceptance record.

VAL-2 and VAL-4 introduce no new production schema migration as part of this closeout.

## Result

- **VAL-2 — Products & Pricing: COMPLETE**
- **VAL-4 — Inventory + Warehouses + Stock Operations: COMPLETE**

Roadmap status is now `[x]` for both packages. The permanent contracts are updated to require the closed state so the roadmap cannot silently regress to `[~]` while the validation implementation remains present.

No persistent production business-data mutation was made during acceptance. Store public/Dealer projections and Vendor Catalog behavior are unchanged by this package.
