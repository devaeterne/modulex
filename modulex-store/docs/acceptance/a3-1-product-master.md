# A3.1.1 Canonical Product Read Path

## Security decision

`get_store_catalog_products` and `get_store_product_by_slug` intentionally remain public `SECURITY DEFINER` RPCs. The public Store catalog must read published content and active product variants, while the underlying tables are protected by RLS and do not grant anonymous table reads. A `SECURITY INVOKER` public function would therefore return no catalog rows unless table policies were weakened; a private-definer wrapper would preserve the same effective trust boundary without reducing exposure.

The boundary is accepted because both functions:

- revoke `PUBLIC` execute and grant only `anon`, `authenticated` (and inherited `service_role` visibility);
- pin `search_path` to `pg_catalog, public`;
- use static SQL with no dynamic SQL;
- return only a fixed public projection;
- filter to `store_product_content.is_published` and `products.status = 'active'`;
- never expose inventory, costs, internal pricing, metadata, or audit columns;
- do not accept caller-controlled identifiers, SQL fragments, or privilege-bearing arguments.

Supabase Security Advisor warnings for public `SECURITY DEFINER` execution are therefore intentional for this public catalog boundary. They should remain monitored; any future change must preserve the fixed projection and published/active filters.

## Current production evidence

- `PUBLIC EXECUTE`: revoked for both RPCs.
- `anon` / `authenticated` execution: granted for public catalog access.
- Production function definitions match the canonical taxonomy migration.
- Published product detail returns canonical `brand` and `category` values from foreign-key relations.
- No production data was changed by A3.1.1.
