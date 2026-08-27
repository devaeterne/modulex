# Modulex Admin Smoke Tests

This folder contains the repeatable smoke-test baseline for Modulex Admin.

## Test layers

### 1. Authenticated API / RLS smoke

```bash
npm run smoke:api
```

Uses the normal Supabase publishable key and a real Modulex Admin login. This suite is read-only and validates:

- Supabase Auth login and `getUser`
- current profile / role
- Data API + RLS reads for products, customers, inventory, warehouses, pricing, payment methods, settings, orders, invoices, shipments and installations
- important read RPCs such as product paging, price paging, stock totals, low stock, stock search and recent movements

Required local environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SMOKE_TEST_EMAIL=...
SMOKE_TEST_PASSWORD=...
```

`SMOKE_TEST_EMAIL` must belong to an active `admin` or `super_admin` profile. Do not use a service-role/secret key for this test: the purpose is to exercise the same Auth + Data API + RLS path used by the application.

### 2. Transactional database / business-flow smoke

```bash
npm run smoke:db
```

Requires the PostgreSQL `psql` client and a Supabase direct or Session Pooler connection string:

```env
SUPABASE_DB_URL=postgresql://...
```

This suite creates realistic smoke fixtures and runs all writes inside one Postgres transaction. It always ends with `ROLLBACK` when successful; `ON_ERROR_STOP` aborts the transaction when a check fails.

Coverage includes:

- Authenticated admin role context
- RLS enabled on core tables and critical RPC existence
- General Settings read/update
- Payment Method create/read/update/delete
- Brand and Category create/read/update
- Price Group create/read/update/delete
- Product create/read/update and Product Price create/read/update
- Customer create/read/update
- Customer commercial-settings auto initialization
- Customer Contact create/read/update/delete
- Customer Address create/read/update/delete
- Warehouse / Zone / Location create/read/update and location QR generation
- Stock In
- Stock Reserve / Release
- Stock Out
- Stock Transfer
- Stock Adjustment
- Inventory movement history
- Product / Pricing / Inventory read RPCs
- Order create/read/update
- Order confirmation and automatic stock reservation
- Invoice create/read, issue, partial payment, paid and void lifecycle
- Shipment create, allocation, picking, packed, shipped and delivered lifecycle
- Exact reservation consumption and physical stock deduction
- Installation create/read/update, confirmation, in-progress and completion lifecycle
- Order completion through installation
- Lifecycle rules for entities that intentionally do not allow physical DELETE
- Order status history, customer activity and inventory audit consistency

The database functions were checked for direct outbound `net.http`, webhook or Resend calls before this test was introduced, so transactional writes do not intentionally perform non-rollbackable external delivery.

### 3. Full smoke

```bash
npm run smoke
```

Runs the read-only API/RLS suite first and then the transactional database suite.

## Admin UI

Modulex Admin also has **Management → System → API Test** (`/api-test`). The page intentionally runs only read-only checks through the currently logged-in browser session. Destructive/full CRUD smoke tests remain terminal-only so a user cannot accidentally generate test business data from the production UI.

## Safety rules

- Never put `SUPABASE_DB_URL`, `SMOKE_TEST_PASSWORD`, a Supabase secret key or service-role key in `NEXT_PUBLIC_*` variables.
- Keep `.env.local` out of source control.
- Prefer an `admin`/`super_admin` account dedicated to smoke checks for `SMOKE_TEST_EMAIL`.
- The DB suite is designed to rollback, but it should still be treated as an operational test: run it deliberately, not on every page request.
- If a future database trigger performs an outbound HTTP/webhook call directly, re-review the transaction-isolation assumption before running the DB suite against production.
