# Commercial Documents Production Acceptance

Date: 2026-09-02

## Scope

Close the production acceptance gate for the shared Order/Invoice A4 Commercial Document renderer introduced by PR #247 and refined by PR #251.

The accepted contract is:

- Order and Invoice browser print use the shared Commercial Document renderer.
- Direct PDF uses the same document model.
- Configured Countertop detail is read from the immutable `countertop_configurations.pricing_snapshot` rather than current Product Master/pricing state.
- Invoice Countertop detail resolves through `customer_invoice_items.order_item_id`.
- Multiline detail supports Material/Area/Band, Edge, Sink, Services, manual override metadata when present, and the saved line note.
- Logo 2 uses the normalized larger secondary-logo presentation in HTML and PDF.

## Repository / CI evidence

- PR #247 (`fix: enrich commercial document countertop details`) is merged as `5b106d56eb9819db59cb8a8a26ddab4e045d14af`.
- PR #251 (`fix: enlarge secondary commercial document logo`) is merged as `2505832dd433c7b736d6cd3dcf2f70723080c741`.
- PR #251 head `f5f282a3e75cadd765c282418a6313189616926e` passed:
  - Admin Commercial Documents UI — run `33625342760`
  - Admin UI Foundation — run `33625342644`
  - Admin A1 Core Operations — run `33625342624`
  - GC-6 Cabinet Journey — run `33625342866`
  - GC-7 Attributed Social Proof — run `33625343093`
- PR #247 head `80e06a4bc3bb9f7745b2557b91fc724cf2ba7109` also passed Commercial Documents, A1 Core Operations, Customers UI, and Admin UI Foundation workflows.

## Production deployment evidence

- Acceptance baseline: `main` = `7af213729f8586a1cdc38d8baac1b47ba60ebee2`.
- Admin Vercel project `modulex` latest production deployment `dpl_GbsGW59xZ7QLVzLvwaB4nuTeTQrg` is `READY` from that current-main baseline.
- Production history contains READY deployments for both #247 and #251.
- `https://admin.oakwellcabinetry.com/customers/6bbfdbbf-c7be-40c3-b93e-72ceeb0f4bd2/orders/5c93479d-bc1b-457d-8603-c58ab6bf237d/print` returns HTTP 200 and resolves to `/customers/[id]/orders/[orderId]/print` on production.
- The print surface loads document data client-side under the signed-in Supabase session; this acceptance run did not fabricate or bypass an application login solely to obtain a visual screenshot.

## Production database evidence

- `20260902075546 commercial_document_branding` is applied in production.
- Production schema contains `countertop_configurations.pricing_snapshot`, `countertop_configurations.order_item_id`, and `customer_invoice_items.order_item_id`, matching the immutable Order → Invoice detail contract.
- Production Order `ORD-000028` contains a real Countertop snapshot on line 4 with Quartz / 5 sq ft / R12, Double O'gee edge / 2 linear ft, sink `TEST-SINK-001`, and Granite Removal service. This proves the production Order path has real multiline Countertop source data to render.
- Production currently has no Invoice item whose `order_item_id` points to a configured Countertop item. No artificial production Invoice was created for acceptance. The Invoice path is therefore accepted from the shared source contract, production schema linkage, and passing CI rather than an invented production fixture.

## Runtime / advisor review

- Current Vercel runtime error groups are Vendor Catalog sync/approval related; no Commercial Document, Order print, Invoice print, or PDF runtime error group was found in the inspected 24-hour window.
- Supabase Security Advisor has existing unrelated Store/support/auth warnings; no finding is specific to the Commercial Document or Countertop print read path.
- Supabase Performance Advisor has existing unrelated FK/index/policy debt. Countertop-related entries are unused-index informational findings, not regressions introduced by this print/PDF package.

## Result

**PASS / CLOSED.** The Commercial Document Countertop + dual-logo package is merged, deployed, CI-green, production-route reachable, backed by real production Countertop Order snapshot data, and introduces no package-specific advisor/runtime blocker.

The lack of a naturally occurring production Countertop Invoice is explicitly recorded rather than masking it with synthetic production data.