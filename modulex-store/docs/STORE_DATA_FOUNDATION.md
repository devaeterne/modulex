# Store Data Foundation

## Product identity

The operational `products` table currently contains 462 active SKU rows representing 154 base products across three color codes (`NB`, `NT`, `WH`). The Store therefore uses `base_product_code` as the public product-page identity and exposes SKU rows as color variants.

This avoids generating near-duplicate public/SEO pages for every color SKU.

## Master data vs Store presentation data

Operational product data stays in `products`. Store-specific content is managed separately:

- `store_product_content` — slug, display copy, publish/featured state, ordering and SEO fields
- `store_product_media` — images, documents and video, optionally scoped to a color
- `store_color_options` — public color labels/swatches/media metadata

The initial migration creates one unpublished `store_product_content` row for every active `base_product_code`. Nothing is automatically published.

## Public security boundary

Anonymous clients do not receive direct table access to the Store presentation tables. Public website reads go through three deliberately narrow RPCs:

- `get_store_catalog_products`
- `get_store_product_by_slug`
- `get_store_public_profile`

The catalog/product RPCs return only approved presentation fields and safe variant identifiers (`id`, `sku`, color code/name). They do **not** return:

- product prices or price groups
- product cost/margin data
- inventory quantities or reservations
- internal product metadata
- customer/order data

`product_prices` remains outside the public Store boundary.

The public RPCs intentionally use `SECURITY DEFINER` so master tables can stay protected by their existing internal RLS policies. Their return shapes are explicit and their `search_path` is pinned. Supabase's security advisor therefore reports the expected warning that anonymous callers can execute these three functions; this is intentional for these public read-only RPCs.

## Application data access

`src/lib/supabase/public-rest.ts` is the public REST/RPC transport. It uses only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No service-role or secret key is accepted by the public Store layer.

Domain queries live under `src/lib/store/*` so React components do not query Supabase directly.

## Publication rule

A master product being `active` does not make it public. A base product must also have `store_product_content.is_published = true` before the public catalog RPC can return it.

This is the separation between operational availability and website publication.
