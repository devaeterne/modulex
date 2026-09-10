# SET / General Settings Final Closeout Implementation Plan

> Scope: SET-A1 through SET-A5 only. Base commit: `c65a999e2ed07f2b8b9cc813dd72d26e9f1ab241`.

## Goal

Close the General Settings workstream without introducing duplicate configuration. Keep `general_settings` as the singleton owner for company identity, locale/timezone/main currency, document branding/defaults, and document-number formatting; keep structured Store contact/location/hours in their existing canonical tables; preserve Finance transaction-time FX snapshots and Order→Invoice tax snapshots.

## Task 1 — RED contract

Files:
- Create `modulex-admin/scripts/set-general-settings-closeout-contract.mjs`
- Modify `.github/workflows/admin-ui-foundation.yml`

The contract must fail on current main because numbering settings, tax actor audit, canonical currency fallback hardening, private Store helper revokes, and final roadmap states are absent. The Admin UI workflow runs the contract before typecheck/lint/build.

## Task 2 — Canonical DB ownership and security hardening

Files:
- Create `modulex-store/supabase/migrations/20260910160000_set_general_settings_final_closeout.sql`

Implement additive/backward-compatible changes:
1. Add `order_number_prefix`, `order_number_padding`, `invoice_number_prefix`, `invoice_number_padding` to `general_settings`, seeded to current behavior (`ORD-`, `6`, `INV-`, `6`) with validation constraints.
2. Make Order/Invoice default triggers resolve numbering and missing currency from row `general_settings`; fail closed if singleton settings are unavailable/invalid. Existing explicit document numbers/currency remain unchanged.
3. Remove the static `customers.currency_code = 'USD'` default and install a BEFORE INSERT canonical currency trigger so omitted customer currency resolves from current `general_settings.default_currency`. Existing customer currency values are untouched.
4. Update Order creation core currency resolution so it does not contain a hard-coded USD fallback and fails closed when a customer currency cannot be resolved.
5. Add `created_by`/`updated_by` actor columns to `order_tax_rules`; make the existing touch trigger stamp actor metadata on insert/update while preserving `updated_at`.
6. Revoke unnecessary anon DML on `order_tax_rules`.
7. Revoke anon/authenticated direct EXECUTE on wrapper-backed `store_api_private.get_store_public_profile()` and `store_api_private.get_store_public_company_locations()`; public wrapper functions remain the Store contract.

Production application must use `Supabase.apply_migration`, followed by read-only acceptance queries and Security/Performance Advisors.

## Task 3 — Admin consumer alignment

Files:
- Modify `modulex-admin/src/lib/settings/types.ts`
- Modify `modulex-admin/src/components/settings/OrderDocumentSettings.tsx`
- Modify `modulex-admin/src/components/settings/InvoiceDocumentSettings.tsx`
- Modify `modulex-admin/src/components/customers/CustomerOrderPrint.tsx`
- Modify `modulex-admin/src/components/customers/CustomerInvoicePrint.tsx`
- Modify `modulex-admin/src/lib/customers/order-domain.ts`
- Modify `modulex-admin/src/components/customers/NewCustomerOrder.tsx`

Requirements:
1. Add numbering fields to the typed singleton settings contract and align the fallback timezone with the DB (`UTC`).
2. Expose document number prefix/padding in existing Order/Invoice Document Defaults forms; do not create another document settings table.
3. Require canonical settings to load before rendering Order/Invoice documents; use transaction currency snapshots (`order.currency_code`, `invoice.currency_code`) instead of silently substituting USD.
4. Load the main currency in Order context and use it only as the fallback when a customer currency is unavailable; remove UI hard-coded USD fallbacks in the create-order flow.
5. Do not change Finance FX snapshot tables/functions or Order→Invoice tax snapshot behavior.

## Task 4 — Acceptance and roadmap

Files:
- Modify `modulex-admin/ADMIN_ROADMAP.md`

Verify:
- Store public consumers still call only `public.get_store_public_profile` / `public.get_store_public_company_locations` through `callPublicRpc`.
- Active Tax Rules remain enforced server-side at confirmation; invoices continue copying Order tax snapshots.
- General Settings RLS and Tax Rules RLS remain enabled and role-scoped.
- New numbering defaults reproduce legacy output when settings remain `ORD-/6` and `INV-/6`.
- Finance base currency still comes from `general_settings.default_currency`; FX snapshot semantics are unchanged.

Then mark SET-A1, SET-A2, SET-A3, SET-A4, SET-A5 complete and the General Settings parent complete.

## Verification

CI / executable gates:
- `node scripts/set-general-settings-closeout-contract.mjs`
- `node scripts/general-settings-ui-contract.mjs`
- `node scripts/val5-store-users-settings-contract.mjs`
- `node scripts/commercial-document-contract.mjs`
- `npm run smoke:order-domain`
- `npm run smoke:a6-finance-core`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

DB acceptance:
- inspect migration-preserved RLS/grants/function definitions
- inspect `general_settings` numbering fields and singleton values
- inspect Tax Rules actor audit columns/trigger
- inspect Store public/private EXECUTE grants
- run Supabase Security Advisor
- run Supabase Performance Advisor

## Exit

Leave one PR from `feat/set-general-settings-final-closeout` to `main`, with production migration status, TDD RED→GREEN evidence, CI results, Advisor findings, and no manual SQL requirement.