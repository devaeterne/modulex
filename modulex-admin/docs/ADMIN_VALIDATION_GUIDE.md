# Modulex Admin Validation & Data Contract Guide

This guide is the source of truth for validation and data behavior across the Admin UI, mutation boundary, Supabase RPCs, and database. It complements `ADMIN_UI_GUIDE.md`: the UI guide owns appearance; this guide owns input, mutation, authorization, and data contracts.

## Database contract first

Before adding or changing a form, input, or mutation, inspect the authoritative contract:

- column type, nullability, check and unique constraints, foreign keys, enums, and numeric precision/scale;
- RPC argument/return types, lifecycle triggers, grants, and RLS policies.

TypeScript interfaces and UI labels are not substitutes for the database contract. Frontend checks improve UX but never replace DB/RPC validation.

## Normalize before mutation

Make these conversions explicit in the shared validation/form layer:

- `""`, `null`, and `undefined`; trim whitespace and normalize case where the contract requires it;
- `NaN`, integer versus decimal, numeric precision/scale, and optional numeric fields;
- UUID versus non-UUID identifiers (never cast a non-UUID ID to UUID);
- canonical enum/FK values, boolean values, and `date`/`timestamp`/`timestamptz` values.

An empty numeric field must not become `0` or `NaN` accidentally. Invalid or ambiguous browser date parsing must not become an implicit timezone conversion.

## Numbers, money, and dates

Preserve DB `numeric` precision/scale. JavaScript floating-point arithmetic is not authoritative for financial calculations; use the DB/RPC boundary where possible. Align early min/max/negative guards with the DB business rule. Keep stored timezone semantics distinct from display timezone, and enforce relational rules such as `valid_from < valid_to` in both UI feedback and the DB contract.

## Enums, foreign keys, and stale options

Use canonical selectable enum/FK values rather than free text. Deactivated or stale referenced options must remain readable for historical records while new mutations reject invalid values. Option lists must never manufacture a value that the DB cannot accept.

## Errors and mutation safety

Map DB/RPC constraint errors to understandable business messages. Unknown errors remain failures. A failed mutation must not show success or leave stale local state. Disable duplicate submits; use an existing idempotency key boundary for sensitive stock/order/pricing writes. Prefer the existing RPC when it owns lifecycle/business guards; do not bypass it with a direct browser/table write. Keep audit/history tables append-safe and do not physically delete referenced or audited entities by default.

## Authorization and data-fetching UX

Verify protected reads and writes end to end: UI visibility/action → route/server boundary → RPC/function → grants → RLS → DB lifecycle guard. `authenticated` alone is not business authorization, and elevated/service-role credentials never reach browser code. `SECURITY DEFINER` is acceptable only as an intentional, reviewed boundary with pinned search path and explicit grants.

Data-heavy screens must make loading, empty, populated, error/retry, and permission-denied states explicit. Honor server-side pagination, filtering, and search; do not fetch an unbounded dataset into the browser to recreate a server contract. Rapid filter/search changes must not let stale responses overwrite newer state.

## Cross-surface and production discipline

When a shared schema/RPC changes, identify and run the affected Admin, Store public catalog, Customer Portal, and Dealer Portal regressions. Before schema, trigger, RPC, RLS, or grant changes: inspect current production schema/data, compare the migration, run a rollback-only behavioral probe where possible, review Security/Performance Advisors, and defer permanent production migration until after merge. Do not add unrelated data rewrites, indexes, or refactors to make a migration pass.

## Legacy remediation audit

VAL-2 through VAL-5 remediate domains incrementally. For each field trace:

`UI input → shared control → frontend validation → normalization → mutation payload → RPC/table boundary → DB type/nullability/constraints/FK/enum → RLS/authorization → error mapping → audit/history`.

Record mismatches before changing them. Prioritize UUID/non-UUID casts, string/numeric and precision loss, negative/min/max and integer range gaps, empty-string/NULL ambiguity, free-text enum/FK values, stale FKs, invalid date/timezones, relational date errors, `NaN`, duplicate submits, RPC bypasses, frontend-only or DB-only guards, incorrect failed-mutation state, and missing loading/error/retry states.

## Contract method

New or changed validation starts with a targeted RED contract and a minimal GREEN implementation. Prefer behavioral DB/RPC probes for critical behavior over string-presence assertions. Keep reusable normalization and validation in the shared validation/form layer; route-local workarounds require explicit review.
