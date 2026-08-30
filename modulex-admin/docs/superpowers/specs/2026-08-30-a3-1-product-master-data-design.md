# A3.1 Product Master Data Design

## Goal

Make Admin the deterministic source of truth for product variants, product families, canonical taxonomy, lifecycle state, and full product-master export without weakening A1/A2 operational history.

## Canonical model

- One `products` row is one sellable/stockable variant.
- `base_product_code` identifies the product family.
- `color_code` identifies the color variant within the family; `color_name` is descriptive display metadata.
- `brand_id` and `category_id` are canonical taxonomy references. Legacy `brand` and `category` text columns remain compatibility mirrors while existing consumers are migrated, but writes must keep them aligned with the canonical foreign keys.
- SKU and barcode are normalized by trimming surrounding whitespace. Uniqueness must be case-insensitive.
- `(base_product_code, color_code)` must be unique case-insensitively after trimming.
- All variants in one `base_product_code` family must resolve to the same canonical brand and category.

## Required master fields

For A3.1-managed product variants, these are required:

- `sku`
- `name`
- `brand_id`
- `category_id`
- `base_product_code`
- `color_code`
- `unit`
- `status`

`barcode` remains optional at schema level for future non-barcoded product support, but current production data is complete and duplicate-safe.

## Lifecycle

Supported states remain `active`, `inactive`, and `archived`.

- `active -> inactive` and `active|inactive -> archived` are blocked while any inventory row has `quantity > 0` or `reserved_quantity > 0` for the product.
- `inactive -> active` is allowed when canonical master data is valid.
- `archived` is terminal; archived products cannot be reactivated through normal Admin flows.
- Products are not physically deleted through Admin product-master workflows. Historical orders, invoices, shipments, reservations, inventory movements, costs, and prices must retain their product identity/history.
- A1 order confirmation and A2 stock-operation rules that require an active product remain authoritative downstream consumers.

## Taxonomy integrity

- `products.brand_id -> product_brands.id` and `products.category_id -> product_categories.id` use restrictive delete behavior.
- A brand/category referenced by products cannot be deleted.
- An active brand/category referenced by at least one active product cannot be deactivated.
- Renames remain allowed and compatibility mirror text on linked products must stay synchronized.

## Bulk operations

A3.1 closes the requirement review as follows:

- Full canonical product-master CSV export is in scope and must export the complete filtered dataset rather than only the current page.
- Destructive bulk lifecycle changes are not introduced in A3.1.
- Bulk import is intentionally deferred until a validation-first dry-run importer exists. A future importer must validate taxonomy, family consistency, duplicate SKU/barcode, duplicate family/color, lifecycle rules, and produce row-level errors before any write.

## Store boundary

The Store public catalog continues consuming only published Store content joined to active product variants. The existing A3.1 Store migration `20260830120000_a3_1_canonical_product_taxonomy.sql` remains the approved public read boundary and must continue using canonical `brand_id` / `category_id` relations.

## Acceptance

A3.1 is closed only when:

1. Product create/edit exposes and persists canonical family/color fields.
2. Database constraints/triggers enforce normalization, family consistency, lifecycle stock guard, taxonomy restrict/deactivation rules, and terminal archive behavior.
3. Product list actions use the protected lifecycle mutation boundary rather than direct status updates.
4. Full canonical CSV export is available from the product list and is not current-page limited.
5. Production preflight/reconciliation remains clean for all 462 existing products.
6. A3.1 contract, A1/A2 regressions, RBAC, typecheck, lint, and production build pass.
7. Production migration acceptance and post-deploy Admin smoke pass before the roadmap item is marked closed.
