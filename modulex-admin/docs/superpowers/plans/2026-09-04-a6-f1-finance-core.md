# A6-F1 Finance Core + Cash/Bank — Implementation Plan

Date: 2026-09-04
Status: ACTIVE — IMPLEMENTATION COMPLETE / FRESH CI PENDING
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
- `modulex-admin/scripts/a6-finance-core-hardening-contract.mjs`
- `.github/workflows/admin-a6-finance-core.yml`

The base F1 contract was committed before implementation and established RED. A second hardening contract was added before the final edge-case fixes and is permanently chained into `smoke:a6-finance-core`.

## Task 2 — Canonical Finance SQL

Files:
- `modulex-admin/sql/a6-finance-core.sql`
- `modulex-store/supabase/migrations/20260904120000_a6_finance_core.sql`
- `modulex-admin/sql/a6-finance-core-hardening.sql`
- `modulex-store/supabase/migrations/20260904121000_a6_finance_core_hardening.sql`

Each Admin SQL file must remain byte-identical to its shared Supabase migration mirror.

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
- sensitive writes only through public `SECURITY DEFINER` RPC wrappers backed by private role-checked cores;
- the public wrapper exists only to cross the private-schema execution boundary and uses `set search_path = ''`;
- private cores continue to perform the canonical `auth.uid()`/role assertion and are not executable by app roles;
- anon receives no Finance Core access;
- authenticated table INSERT/UPDATE/DELETE/TRUNCATE is revoked for money/audit/idempotency tables;
- public wrappers are authenticated-only.

### Hardening decisions found during source review

- Draft transaction deletion is supported because the locked architecture explicitly permits deleting unposted drafts. The delete RPC locks and proves `status='draft'`, then atomically removes only the draft's attribution, audit and idempotency residue before deleting the draft transaction.
- The append-only audit/idempotency trigger remains strict for posted history. Draft cleanup is allowed only under an explicit transaction-local `modulex.finance_draft_delete` guard created inside the private delete core.
- A posted transaction may still be voided after its historical account/category has later been deactivated. A compensating reversal may also use those historical inactive dimensions. New ordinary Finance activity continues to reject inactive accounts/categories.
- Public mutation wrappers must be `SECURITY DEFINER`; leaving them as the default invoker while revoking private-core execution from authenticated would make the intended RPC boundary non-executable. Private-core grants are not widened to solve this.

## Task 3 — Finance read/write adapter

File:
- `modulex-admin/src/lib/finance/core.ts`

Provide typed reads and RPC calls for overview, accounts, categories, FX rates and transaction lifecycle, including guarded draft deletion. Do not place elevated credentials in the browser.

## Task 4 — Finance Admin surfaces

Routes:
- `/finance` — overview
- `/finance/transactions` — transaction list + draft/create/delete/post/void/reverse workflow
- `/finance/accounts` — Cash & Bank account management and operational categories/rates needed by F1

Use `ADMIN_UI_GUIDE.md` shared primitives only. Read routes require `finance.view`; mutation controls require `finance.manage`.

Update `AppSidebar.tsx` with Overview, Transactions and Cash & Bank before the existing Finance source-domain links.

## Task 5 — Roadmap + regression integration

- `smoke:a6-finance-core` is wired into `modulex-admin/package.json` and the main smoke chain.
- The focused Finance workflow watches Finance routes, components, adapter, SQL/migrations, RBAC/sidebar, contracts and roadmap changes.
- Update `ADMIN_ROADMAP.md`: F0 approved/complete, F1 active, Finance architecture docs authoritative, Payroll/Compensation remain HR-backed source surfaces.
- Update `docs/FINANCE_DOMAIN_PLAN.md` so it no longer reports F0 as review-pending.
- Preserve all unrelated current-main roadmap work.

## Task 6 — Verification before rollout

Required fresh evidence on branch/PR:
- A6-F1 base + hardening contract GREEN;
- RBAC GREEN;
- Admin UI strict GREEN for changed feature files;
- typecheck GREEN;
- lint GREEN;
- production build GREEN;
- PR diff contains no unrelated behavior.

The final Finance workflow run for the current head is the release gate. A queued GitHub runner is not treated as GREEN.

Do not apply the F1 migrations to production before source review/merge. After merge, rollout is a separate production step: apply both F1 migrations in order, run Security + Performance Advisors, deploy Admin, then perform signed-in acceptance and rollback-safe DB probes before marking F1 closed.
