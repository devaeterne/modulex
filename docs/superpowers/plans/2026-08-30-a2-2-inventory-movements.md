# A2.2 Inventory & Movements Implementation Plan

Date: 2026-08-30
PR: #173
Branch: `feat/a2-2-inventory-movements`

## Goal

Make Admin inventory state and stock-movement writes deterministic, retry-safe, and auditable without replacing the existing mutable inventory snapshot with full event sourcing.

## Approved contract

1. **Inventory discovery**
   - Add server-side search, warehouse/zone/location/status filtering, exact total count, and stable pagination.
   - Sort deterministically by SKU, location code, then inventory ID.

2. **Quantity semantics**
   - `inventory.quantity` means physical **On Hand**.
   - `reserved_quantity` is allocated stock that remains physically on hand.
   - `available_quantity = quantity - reserved_quantity`.
   - Low-stock state is based on available quantity versus `products.min_stock_level`.
   - A2.2 does not introduce separate damaged/hold quantity buckets: operational holds use reserved quantity with an explicit reason/reference; damaged stock must be removed from available inventory through an explicit audited stock mutation rather than remaining silently available.

3. **Retry-safe movement writes**
   - Add idempotent variants of stock in/out/transfer/reserve/release.
   - Browser callers generate an idempotency UUID and reuse it only when retrying the same logical payload.
   - The database generates/stores a canonical JSONB request fingerprint.
   - Same key + same payload returns the existing movement ID; same key + changed payload fails closed.
   - Existing row locking remains authoritative for availability/reservation concurrency.

4. **Append-safe audit**
   - Posted inventory movements cannot be updated or deleted through application roles.
   - Corrections are compensating movement rows linked to the original movement.
   - Automatic reversal is limited to movement types with unambiguous snapshot semantics: in, out, transfer, reservation, and release. Ambiguous legacy adjustment/return/damage movements fail closed instead of being guessed.

5. **Compatibility and rollout**
   - Keep legacy `search_stock` available while Admin inventory moves to `search_stock_page`.
   - Historical movement rows remain valid with nullable idempotency/reversal metadata.
   - Production Supabase migration is a separate explicit release step and is not applied while preparing the PR.

## TDD / verification order

1. RED contract proves A2.2 migration/implementation is absent.
2. Add inventory search/filter/pagination and On Hand labeling.
3. Add DB quantity/idempotency/append-only/reversal contracts.
4. Migrate desktop and guided-scan stock operations to idempotent RPCs.
5. Run A2.2 contract plus A2.1 regression, production-surface, RBAC, full lint, and Next.js production build.
6. Refresh branch onto current `main` and update Admin roadmap before ready-for-review.

## Evidence

- Initial RED: `smoke:a2-inventory-movements` failed with `A2.2 migration must exist`.
- GREEN implementation run: GitHub Actions `33312699819` passed A2.2, A2.1, production-surface, RBAC, lint, and Next.js production build.
- Parallel Admin A1 and Store regression workflows triggered for the implementation head also passed.
