# A6-F1 Finance Core + Cash/Bank — Implementation Plan

Date: 2026-09-04
Status: ACTIVE
Base: current `main` after approved A6-F0
Architecture: `docs/FINANCE_DOMAIN_PLAN.md`
Baseline: `docs/FINANCE_F0_BASELINE.md`

## Goal

Introduce the neutral Modulex Finance Core without making Project, Order, Customer, Vendor or Employee the parent of financial transactions.

F1 is limited to Finance Core, Cash/Bank accounts, FX snapshots and the first Finance Admin surfaces. Expenses/AP/Payroll/AR source-domain integration remains F2-F5.

## Locked compatibility decisions

- Reuse `general_settings.default_currency` as company base currency.
- Do not create a second Supplier/Vendor master.
- Do not create a second vendor invoice/AP document model. Current `main` contains the PB-3B `vendor_invoices` source document migration; F3 will integrate that source deliberately.
- Do not rewrite Project payment or HR payroll tables/RPCs in F1.
- Do not copy Project-payment posted edit/hard-delete compatibility into Finance Core.
- Do not copy Payroll direct browser table writes into Finance Core.
- Finance Core posted money history is immutable; corrections use safe void or reversal.
- Cross-currency account transfers between accounts denominated in different currencies fail closed in F1. FX conversion between bank accounts is not silently represented as one amount.

## Task 1 — RED contract

Files:
- `modulex-admin/scripts/a6-finance-core-contract.mjs`
- `.github/workflows/admin-a6-finance-core.yml`

Contract must fail until all F1 schema, RPC, route and navigation requirements exist.

## Task 2 — Canonical Finance SQL

Files:
- `modulex-admin/sql/a6-finance-core.sql`
- `modulex-store/supabase/migrations/20260904120000_a6_finance_core.sql`

The two files must remain byte-identical.

Schema:
- `finance_accounts`
- `finance_categories`
- `finance_fx_rates`
- `finance_transactions`
- `finance_transaction_links`
- `finance_transaction_audit`
- `finance_idempotency_requests`

Core rules:
- account types: bank/cash/clearing;
- transaction states: draft/posted/voided;
- transaction kinds: expense, customer_receipt, vendor_payment, employee_payment, deposit, withdrawal, transfer, refund, reversal;
- source account decreases balance; destination account increases balance;
- transaction account currency must match transaction currency;
- transfer requires distinct source + destination accounts;
- expense/vendor/employee payment/withdrawal require source only;
- customer receipt/deposit require destination only;
- refund permits exactly one side;
- reversal is RPC-generated and reverses the original account direction;
- transaction base currency derives from `general_settings.default_currency` at posting;
- same-currency posting stores base amount without requiring an FX snapshot;
- cross-currency posting requires either an explicit audited rate or the latest eligible `finance_fx_rates` observation;
- historical base amount/rate snapshot never revalues automatically;
- transaction links are optional and can allocate one transaction across multiple Projects/Orders;
- allocation total must not exceed transaction amount;
- posted transaction/link history is immutable;
- money mutation retries use operation + UUID idempotency key + request fingerprint.

Authorization:
- authenticated Finance/Admin/Super Admin may read Finance Core;
- sensitive writes only through public RPC wrappers backed by private role-checked cores;
- anon receives no Finance Core access;
- authenticated table INSERT/UPDATE/DELETE/TRUNCATE is revoked for money/audit/idempotency tables;
- private cores are not executable by app roles;
- public wrappers are authenticated-only.

## Task 3 — Finance read/write adapter

File:
- `modulex-admin/src/lib/finance/core.ts`

Provide typed reads and RPC calls for overview, accounts, categories, FX rates and transaction lifecycle. Do not place elevated credentials in the browser.

## Task 4 — Finance Admin surfaces

Routes:
- `/finance` — overview
- `/finance/transactions` — transaction list + draft/create/post/void/reverse workflow
- `/finance/accounts` — Cash & Bank account management and operational categories/rates needed by F1

Use `ADMIN_UI_GUIDE.md` shared primitives only. Read routes require `finance.view`; mutation controls require `finance.manage`.

Update `AppSidebar.tsx` with Overview, Transactions and Cash & Bank before the existing Finance source-domain links.

## Task 5 — Roadmap + regression integration

- Add `smoke:a6-finance-core` to `modulex-admin/package.json` and the main smoke chain.
- Update `ADMIN_ROADMAP.md`: F0 approved/complete, F1 active, Finance architecture docs authoritative, Payroll/Compensation remain HR-backed source surfaces.
- Preserve all unrelated current-main roadmap work.

## Task 6 — Verification before rollout

Required fresh evidence on branch/PR:
- A6-F1 contract GREEN;
- RBAC GREEN;
- Admin UI strict GREEN for changed feature files;
- typecheck GREEN;
- lint GREEN;
- production build GREEN;
- PR diff contains no unrelated behavior.

Do not apply the F1 migration to production before source review/merge. After merge, rollout is a separate production step: apply migration, run Security + Performance Advisors, deploy Admin, then perform signed-in acceptance and rollback-safe DB probes before marking F1 closed.
