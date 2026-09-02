# Vendor Availability + Bulk Approval Design

Date: 2026-09-02
Branch: `feat/vendor-availability-bulk-approval`
Base: latest `main` at design start (`5b106d56eb9819db59cb8a8a26ddab4e045d14af`)

## Goal

Extend Vendor Catalog so Modulex continuously tracks vendor availability/sale eligibility, prevents unavailable products from being approved, automatically disables already-approved canonical SKUs when the vendor makes them unavailable, safely re-enables only vendor-managed deactivations, and supports filtered bulk approval with select/select-all.

This design keeps vendor availability separate from Modulex inventory quantity. Vendor feeds do not provide a reliable common exact stock-count contract, so Modulex will treat vendor data as external sale eligibility, not as local on-hand inventory.

## Existing Behavior and Constraints

- Vendor discovery/sync already stages Karran and Ruvati products in `vendor_catalog_items`.
- Approval creates/links canonical `products` rows and Store family content.
- `products.status` already supports `active`, `inactive`, `archived`.
- Store catalog RPCs already join only `products.status = 'active'` variants. Therefore an inactive color/SKU disappears from Store while other active variants in the same family remain visible. If a published family has zero active variants, the family naturally disappears from public catalog results without changing editorial `store_product_content.is_published`.
- Vendor category/product-type/UOM mapping remains a required approval gate.
- Vendor approval must remain server-side and idempotent.
- Admin UI must use existing shared TailAdmin primitives and strict UI contract.

## Vendor Source Semantics

### Karran

Karran discovery is Shopify-style JSON. Variant availability is treated as vendor sale eligibility:

- `available = true` -> `AVAILABLE`
- `available = false` -> `UNAVAILABLE`
- field absent/unusable -> `UNKNOWN`

Karran public discovery is not treated as a reliable source of exact stock quantity.

### Ruvati

Ruvati uses WooCommerce Store API JSON. Normalize:

- `is_purchasable = false` -> `UNAVAILABLE`
- otherwise `is_in_stock = false` -> `OUT_OF_STOCK`
- `is_purchasable = true` and `is_in_stock = true` -> `AVAILABLE`
- required availability fields absent -> `UNKNOWN`

Any exposed quantity-like value is reference-only. We do not map it into Modulex inventory on-hand.

## Availability Model

Add normalized availability to `NormalizedVendorProduct` and persist it on `vendor_catalog_items`.

Required staging fields:

- `availability_status`: `AVAILABLE | OUT_OF_STOCK | UNAVAILABLE | UNKNOWN | MISSING`
- `vendor_available`: nullable boolean
- `vendor_purchasable`: nullable boolean
- `vendor_stock_quantity`: nullable numeric; only populated when the source genuinely exposes a reliable quantity
- `availability_hash`: stable hash over availability-only fields
- `availability_changed_at`: timestamp when normalized availability changes
- `missing_success_count`: integer used only by successful full-vendor discovery runs
- `canonical_inactivated_by_vendor_at`: nullable timestamp
- `canonical_status_version_at`: nullable timestamp of the canonical product row immediately after Modulex applied vendor-driven inactivity

Availability is deliberately excluded from the existing content/discovery hash. A stock/availability change must not reset review status to `PENDING` or make the item look like a content `UPDATED` change.

Existing sync snapshots will include the normalized availability payload so historical runs remain inspectable without introducing a second audit subsystem.

## Approval Eligibility

A vendor item is approval-eligible only when all of the following are true:

1. `availability_status = AVAILABLE`
2. required category/product-type/UOM mapping exists
3. existing canonical approval guards pass
4. the item is not ignored and is otherwise review-eligible

`OUT_OF_STOCK`, `UNAVAILABLE`, `UNKNOWN`, and `MISSING` are fail-closed for both single and bulk approval.

Single `Approve SKU` must be disabled in the UI for an unavailable item and the server endpoint must independently reject the request if a stale client still calls it.

Family approval must approve only selected AVAILABLE variants. It must not silently approve unavailable siblings.

## Availability Sync Behavior

Each successful vendor discovery compares both:

- content/discovery hash
- availability hash

Availability changes persist even when content is `UNCHANGED`.

### Explicit vendor unavailability

For an already-approved item linked to a canonical product:

- `AVAILABLE -> OUT_OF_STOCK/UNAVAILABLE`
  - if canonical `products.status = active`, change it to `inactive`
  - set `canonical_inactivated_by_vendor_at`
  - record the canonical row's resulting `updated_at` as `canonical_status_version_at`
  - do not delete product, Store content, media, pricing, orders, or history
  - do not change `store_product_content.is_published`

Because the public Store queries already include only active canonical variants, one unavailable color disappears while the rest of its family remains available.

### Recovery

For `OUT_OF_STOCK/UNAVAILABLE -> AVAILABLE`:

Automatically reactivate only when:

- this vendor item previously caused the canonical inactivity, and
- canonical status is still `inactive`, and
- canonical `updated_at` still matches `canonical_status_version_at`

If the product changed after the vendor applied inactivity, do not auto-reactivate. This is a safe manual-override signal. Clear or retain the vendor marker in a state that surfaces “available again; manual review required” rather than overriding an administrator.

Never auto-reactivate an `archived` canonical product.

### Missing products

A product disappearing from a category-scoped manual sync is not enough to mark it unavailable; products can move between vendor categories.

`missing_success_count` increments only from successful full-vendor discovery runs. After two consecutive successful full-vendor runs where the previously-known item is absent:

- set `availability_status = MISSING`
- apply the same canonical inactivity behavior as explicit vendor unavailability

Any later successful discovery resets the missing count.

Failed/partial vendor runs never increment missing counters.

## Check Updates / Sync Counts

Extend Check Updates and sync run summaries with availability-specific counts without changing the meaning of content counts:

- `availabilityChanged`
- `available`
- `outOfStock`
- `unavailable`
- `unknown`
- `missing`
- `canonicalDeactivated`
- `canonicalReactivated`

`willSync` continues to represent content NEW/UPDATED work. Availability-only changes are shown separately and are always persisted by sync.

## Admin Vendor Imports UI

Add a `Stock / Availability` filter alongside existing Vendor / Category / Review / Change / Linked filters:

- All
- Available
- Out of Stock
- Unavailable
- Unknown
- Missing

Add an Availability badge/column to the table.

Unavailable rows remain visible for tracking but cannot be approved.

### Selection

Add a shared Checkbox column.

- Row checkbox is enabled only for approval-eligible rows.
- Header checkbox selects all eligible rows on the current loaded page.
- When filtered results extend beyond one page, show a secondary action such as `Select all N eligible filtered products` so “Select All” can mean the complete filtered eligible result set, not just the visible page.
- Changing search/filter/review scope clears selection to avoid stale accidental approval.
- Selected count is always visible.

### Bulk approval

Show `Approve Selected (N)` only when there are selected eligible items.

The bulk workflow must never send unavailable IDs merely because they were selected before a stock refresh. Server-side eligibility is re-checked immediately before each approval.

For large selections, do not execute the entire set inside one long Next.js request. Use a bulk orchestration endpoint/client loop with bounded chunks and progress reporting so image downloads and canonical creation do not hit the 300-second request limit.

Recommended behavior:

- resolve/filter explicit eligible IDs server-side
- process bounded batches with low concurrency
- reuse the existing idempotent single-item approval pipeline rather than duplicate approval logic
- return per-item success/skip/failure results
- UI shows progress `Approved X of N`
- unavailable/stale items are skipped with a reason, not inserted
- mapping-required items are skipped and surfaced for mapping; bulk processing may continue for independent eligible items

No browser-side direct canonical writes.

## Select-All Safety

Bulk approval is intentionally constrained:

- only current filter result set
- only `AVAILABLE`
- only server-revalidated eligibility
- no automatic approval for `UNKNOWN`
- no automatic category/type/UOM creation during bulk action
- no Store auto-publish
- no Modulex selling price creation

If a selected product becomes unavailable between selection and execution, it is skipped.

## Store and Canonical Status Rules

Do not use `store_product_content.is_published` as a stock switch.

Reason: Store content is family-level while availability is SKU/variant-level. Unpublishing a family when one color becomes unavailable would hide valid sibling variants and would destroy editorial publish intent.

Canonical `products.status` is the correct sale-eligibility switch because current Store catalog RPCs already filter inactive variants. This also allows automatic Store recovery when a vendor-managed SKU becomes active again without republishing content.

## Security / Data Ownership

- Vendor discovery and availability reconciliation remain service-side.
- Browser does not receive elevated keys.
- Availability-triggered canonical status changes use server/service access and are auditable through sync snapshots/run counts.
- Approval routes enforce availability independently of UI state.
- New/changed public-schema tables/columns follow existing RLS and Data API exposure rules.
- No `SECURITY DEFINER` is added merely to bypass permissions.
- Production migration is not applied until PR code/schema is merged and user confirms deployment workflow.

## Migration / Backfill

The migration adds availability columns and indexes needed by server-side filtering.

Existing vendor items start as `UNKNOWN` rather than assumed available. This intentionally prevents legacy records from being bulk-approved until a fresh successful vendor sync has observed their actual availability.

A fresh Karran/Ruvati sync backfills availability for existing staging records even when their content hash remains `UNCHANGED`.

Existing already-approved products are not deactivated merely because the migration initializes staging availability to UNKNOWN. Canonical status reconciliation only happens after a fresh vendor observation supplies explicit availability or the full-run missing threshold is reached.

## Testing / Acceptance

Required automated coverage:

- Karran `available=true/false/absent` normalization
- Ruvati `is_in_stock` + `is_purchasable` normalization
- availability hash separate from content hash
- availability-only sync persists while content remains `UNCHANGED`
- availability change does not reset review to PENDING
- single approval rejects OUT_OF_STOCK / UNAVAILABLE / UNKNOWN / MISSING
- bulk selection excludes unavailable rows
- server bulk route revalidates stale selections
- bulk processing reuses idempotent approval path and reports per-item results
- category mapping requirement still fail-closed
- available -> unavailable sets linked canonical active product inactive
- one inactive family variant is removed from Store results while active sibling remains
- all inactive variants remove family from Store results without mutating editorial `is_published`
- vendor-managed inactive product reactivates after availability recovery when canonical row was untouched
- manually changed/updated inactive product is not auto-reactivated
- archived product is never auto-reactivated
- category-scoped absence does not increment missing count
- two successful full-vendor absences produce MISSING and canonical inactivity
- failed full-vendor runs do not advance missing count
- legacy UNKNOWN rows cannot bulk approve before fresh availability sync
- server-side availability filtering/pagination works
- strict Admin UI contract
- typecheck
- lint
- Vendor Catalog contract
- Admin UI regression suite
- production build
- Supabase security/performance advisors after migration

## Alternatives Considered

### 1. Unpublish Store family when any vendor SKU is unavailable — rejected

Store content is family-level; this would incorrectly hide available sibling colors and overwrite editorial publish intent.

### 2. Import vendor availability into Modulex inventory on-hand — rejected

Karran/Ruvati do not provide one reliable, common exact quantity contract. External sale eligibility must not masquerade as warehouse inventory.

### 3. Treat availability as normal product UPDATED state — rejected

Stock changes can happen frequently and should not force content review or reset approved records to PENDING. Availability therefore has its own hash/state path.

## Final User-Facing Behavior

Example:

1. Vendor Imports filter: `Karran / Bathroom Sinks / Available`.
2. User clicks `Select All` and then `Select all 84 eligible filtered products`.
3. `Approve Selected (84)` processes only currently AVAILABLE, correctly-mapped items and reports progress/results.
4. Tomorrow vendor changes SQS200GR to unavailable.
5. Daily sync records the availability change and changes only canonical SQS200GR to inactive.
6. Store family SQS200 remains visible if BL/WH are active; Grey disappears from variants.
7. Vendor later restores SQS200GR. If no administrator changed the product after vendor deactivation, Modulex reactivates it automatically. If an administrator touched/overrode it, Modulex leaves it inactive and requires review.
