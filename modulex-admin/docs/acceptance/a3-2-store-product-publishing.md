# A3.2 Store Product Publishing Acceptance

Status: CLOSED — PRODUCTION ACCEPTED

## Scope

- Store product content remains the Admin control plane; public Store access remains the narrow catalog RPC projection.
- Publication is fail-closed on marketing copy, at least one active master variant, and a primary image with non-blank alt text.
- Published slugs are immutable. Unpublish before changing a public slug; the database unique constraint remains authoritative for draft slugs.
- Existing Store media and color-management sources of truth are reused. Primary image uniqueness, color-specific `color_code`, document assets, video records, alt text, and deterministic `sort_order` remain in `store_product_media`.

## Verification

- A3.2, A3.1, Media Library, RBAC, production-surface contracts: PASS.
- Admin typecheck, lint (existing warnings only), and production build: PASS.
- Store A3.1 and media-schema contracts: PASS.
- PR #183 merged to `main` as `755216c72948b9d54c236ed8443bf526909cc2cf`.

## Production database acceptance

- Migration applied as `20260830195639_a3_2_store_product_publishing`.
- Published content: 1; catalog RPC rows: 1; slug lookup: PASS.
- Published rows missing copy, active variant, or primary image alt text: 0.
- Existing Store RPC/public projection and RLS boundaries were preserved.
- Security Advisor retains pre-existing public catalog SECURITY DEFINER warnings; Performance Advisor reports only existing unused-index notices. No A3.2-specific blocker was introduced.

## Production deployment and smoke

- Admin deployment `dpl_HivmbX2TV2ny3NaomBUeLNY2nvvo` is `READY` on `755216c72948b9d54c236ed8443bf526909cc2cf`.
- Authenticated production smoke passed for `/store/products`, `/reports/inventory`, and `/reports/movements`; no console/runtime errors observed.
- Store products showed 154 total, 1 published, 153 draft, 1 ready, 1 incomplete. Inventory and movement report totals rendered successfully.

## Closeout

A3.2 Store Product Publishing is production-accepted and closed. A3.3 Pricing remains the next roadmap package; the broader Phase A3 exit gate remains open until pricing and dealer-boundary criteria are complete.
