# A3.2 Store Product Publishing Acceptance

Status: IMPLEMENTATION COMPLETE — PRODUCTION ACCEPTANCE PENDING

## Scope

- Store product content remains the Admin control plane; public Store access remains the narrow catalog RPC projection.
- Publication is fail-closed on marketing copy, at least one active master variant, and a primary image with non-blank alt text.
- Published slugs are immutable. Unpublish before changing a public slug; the database unique constraint remains authoritative for draft slugs.
- Existing Store media and color-management sources of truth are reused. Primary image uniqueness, color-specific `color_code`, document assets, video records, alt text, and deterministic `sort_order` remain in `store_product_media`.

## Implementation verification

- A3.2 contract: pending final CI run.
- A3.1, Store catalog, Media Library, RBAC, typecheck, lint, build: pending final CI run.
- Production migration/data acceptance: intentionally pending; no production data was changed in this implementation package.
