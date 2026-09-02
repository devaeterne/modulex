# Modulex Admin

> **Warehouse, Inventory & Operations Management Platform**

Modulex Admin is the operational control plane for Modulex. It manages products, pricing, inventory, warehouses, customers, orders, Store CMS, dealer operations, vendor catalog review, company settings, users, permissions and reporting against the shared Supabase production data model.

For active delivery status and acceptance requirements, read `ADMIN_ROADMAP.md` first.

## Core boundaries

- Product master data, commercial pricing and inventory are separate domains.
- Modulex warehouse stock is authoritative only through Modulex inventory and movement contracts.
- External vendor catalog status is reference data and does not become Modulex inventory.
- Vendor catalog products may be approved without confirmed vendor stock; staff confirms vendor stock with the supplier when required. Only products marked `MISSING` from authoritative vendor discovery are blocked from new/unfinished approval.
- Vendor status changes do not activate/deactivate canonical Modulex products.
- Vendor reference prices never become Modulex selling prices automatically.
- Store publication remains explicit and requires the Store publishing/price contracts.
- Privileged Supabase credentials stay server-only; browser code uses only browser-safe public configuration.

## Main operational domains

- Product Master — products, brands, categories, Product Types, UOM and QR identity
- Pricing — price groups, product prices, costs, margins and countertop material bands
- Warehouses — warehouses, zones, locations and scan-assisted operations
- Inventory — on-hand/reserved/available snapshots backed by append-safe movement history
- Customers — master records, addresses, portal lifecycle and documents
- Orders — product/service/countertop lines, revisions, pricing, fulfillment and documents
- Store Control Plane — product content, media, pages, projects, marketing, reviews and company content
- Vendor Catalog — controlled discovery, review, category mapping, family/variant import and bounded bulk approval
- Users & RBAC — authenticated role/permission enforcement across UI, API/RPC and database boundaries

## Vendor Catalog

Vendor Catalog adapters currently include Karran and Ruvati. Discovery stages vendor-owned catalog data under `vendor_catalog_*` and never auto-publishes Store content.

Karran public Shopify `variant.available` is retained in raw source payloads but is not treated as dealer/distributor stock. Presence in authoritative Karran discovery is catalog-available; exact vendor quantity is not tracked.

Ruvati `is_purchasable` / `is_in_stock` values may be shown as vendor-status reference signals, but they do not block approval and do not mutate canonical product status. `vendor_stock_quantity` is not populated by the current workflow.

Approval requires valid vendor-category mapping to active Modulex Category + Product Type + UOM. `AVAILABLE`, `OUT_OF_STOCK`, `UNAVAILABLE` and `UNKNOWN` rows may be imported while present in the vendor catalog. `MISSING` requires two successful authoritative full-vendor misses and blocks approval without deleting/deactivating an existing canonical product.

See `docs/VENDOR_CATALOG_SYNC.md` for the full contract.

## Architecture

```text
Modulex Admin (Next.js / React)
            │
            ▼
Supabase Cloud
├── PostgreSQL
├── Authentication
├── Storage
├── RLS / RPC / database guards
└── shared operational data
            │
            ▼
Modulex Store / Customer & Dealer Portal
```

## Technology stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- TailAdmin shared UI primitives
- Supabase PostgreSQL/Auth/Storage
- Vercel deployment

## Local setup

Requirements: Node.js 20+ and npm.

```bash
git clone <repository-url>
cd modulex-admin
npm install
cp .env.example .env.local
npm run dev
```

Browser-safe Supabase variables belong in `.env.local`. Never commit service-role/secret credentials or expose them through `NEXT_PUBLIC_*` variables.

## Verification

Use targeted contracts while developing, then the relevant final gates before claiming completion.

```bash
npm run typecheck
npm run lint
npm run build
```

General deterministic smoke chain:

```bash
npm run smoke
```

Changed Admin UI surfaces must also pass:

```bash
npm run smoke:admin-ui-strict
npm run smoke:admin-ui
```

Vendor Catalog changes must pass the dedicated workflow contracts:

```bash
node scripts/vendor-catalog-sync-contract.mjs
node scripts/vendor-approval-idempotency-contract.mjs
node scripts/vendor-availability-contract.mjs
```

Database/RLS/RPC changes require the appropriate database acceptance plus Supabase Security/Performance Advisor review. Do not run production business-data mutations merely for smoke testing when rollback/read-only acceptance is sufficient.

## Deployment

Admin is deployed on Vercel and uses Supabase Cloud as the shared system of record. Environment variables and domain aliases are deployment configuration, not source-code constants.

Before production acceptance:

1. verify current `main` and open parallel work;
2. review/apply required canonical migrations in order;
3. run relevant Supabase advisors for schema/RLS/RPC changes;
4. verify Admin CI including typecheck/lint/build and strict UI when applicable;
5. deploy the merged `main` revision;
6. run the package-specific signed-in acceptance documented in `ADMIN_ROADMAP.md` and related acceptance docs.

## Security principles

- Enable and maintain appropriate RLS on exposed data.
- Never expose service-role/secret keys to the browser.
- Protected actions must be authorized through the complete boundary: UI, server route/RPC, grants/RLS and DB lifecycle guards.
- Sensitive inventory/order/pricing writes use existing validated/idempotent mutation contracts rather than direct browser table writes.
- Preserve audit/history semantics; physical deletion is not the default for referenced business records.
- Public Store/Dealer projections must remain narrow and must not leak internal costs, inventory internals or operational metadata.

## Working agreement

`AGENTS.md` is the repository-wide execution contract. `ADMIN_ROADMAP.md` is the Admin operational source of truth. Material Admin work must keep roadmap status, verification evidence, rollout state and next action current in the same workstream.
