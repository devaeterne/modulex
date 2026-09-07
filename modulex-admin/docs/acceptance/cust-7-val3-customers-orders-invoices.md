# CUST-7 / VAL-3 Customers, Orders & Invoices — Production Acceptance

Status: **IN PROGRESS — signed-in browser gate pending**  
Date: **2026-09-07**

## Scope

This closeout covers **CUST-7 / VAL-3 — Customers / Orders / Invoices** validation and mutation-boundary acceptance. It does not redesign Customer, Order, Invoice, Finance, Store, Customer Portal, or Dealer Portal business semantics.

## Delivery lineage

- VAL-3 validation implementation PR **#348** is merged in the production lineage.
- Customer Contact/Address production schema-drift repair PR **#354** merged as `84bc31026409f4f85e6b5a6a11bfbbdfce902382`.
- PR #354 added the forward shared migration `modulex-store/supabase/migrations/20260907150000_customer_contact_address_lifecycle.sql`, a permanent migration/security parity contract, and explicit CUST-7 ownership in the existing Admin UI CI workflow.
- PR #354 exact head `951983e00c9d0b7169a4e57503198073d8a0076a` passed the CUST-7 lifecycle migration contract, Customers UI, RBAC, TypeScript, lint, production build, and Store core verification.
- Production Admin deployment `dpl_DijdhyDxFzoYSvHw1Kwe42zHUsJ5` is `READY` on commit `ed7ea35bfc53547aa86b9918a732ed8de8478902`.
- The deployed commit is a descendant of the CUST-7 repair merge `84bc31026409f4f85e6b5a6a11bfbbdfce902382`.
- Execution-time `main` is `6a8ddc642924b0c0ea9a7ca2146886360ec8cf53`. Its Git tree SHA is `b60f1563b82f5a3dc4043955fe46755f4fc7295a`, exactly the same tree as the deployed Admin commit; the intervening two commits add and revert a docs-only date-format design and therefore do not change the deployed runtime source tree.

## Production database contract

The VAL-3 exact-decimal contracts match production schema truth:

- Customer commercial `credit_limit` and `minimum_order_amount` are `numeric(18,4)`.
- Order quantity and money fields are `numeric(18,4)`.
- Order percentage fields are `numeric(7,3)`.
- Invoice total and paid amounts are `numeric(18,4)`; invoice percentage fields are `numeric(7,3)`.

The existing VAL-3 contract enforces normalized decimal-string mutation payloads rather than JavaScript floating-point mutation truth, typed field errors, first-invalid focus, canonical Customer/Order/Invoice RPC boundaries, and the invoice `paid <= total` early guard while keeping the database authoritative.

## Production schema-drift repair

Production inspection found that the Admin canonical Contact/Address lifecycle SQL had not been mirrored into the shared migration history. Before repair, only `create_customer_address` and `set_customer_address_default` existed from that lifecycle family.

Migration `20260907144511 — customer_contact_address_lifecycle` was applied to production after PR #354 merged. Production now contains:

- `create_customer_contact`
- `update_customer_contact`
- `set_customer_contact_primary`
- `deactivate_customer_contact`
- `create_customer_address`
- `update_customer_address`
- `set_customer_address_default`
- `deactivate_customer_address`

For all reviewed lifecycle RPCs:

- `SECURITY INVOKER` is preserved.
- `search_path` is pinned to the empty path contract used by the canonical SQL.
- `authenticated` has `EXECUTE`.
- `anon` / PUBLIC do not receive browser mutation access.

No Customer table rewrite or persistent acceptance data migration was introduced.

## Authenticated rollback-only lifecycle acceptance

Production acceptance ran under the real PostgreSQL `authenticated` role with an active production super-admin identity inside an explicit transaction.

The following sequence completed successfully against an existing production Customer:

1. create Contact;
2. update Contact;
3. set Contact primary;
4. create Address;
5. update Address;
6. set Address shipping default;
7. deactivate Contact;
8. deactivate Address.

Inside the transaction:

- one acceptance Contact existed;
- one acceptance Address existed;
- eight Customer Activity audit rows were emitted across the lifecycle.

The transaction was rolled back. Post-rollback residue was:

- Contact rows: **0**
- Address rows: **0**
- Customer Activity acceptance rows: **0**

This proves create/update/default/primary/deactivate mutation behavior and soft/audited lifecycle semantics without leaving production business-data residue.

## Negative authorization acceptance

An `authenticated` request context without any of `super_admin`, `admin`, or `sales` was used against `create_customer_contact`.

- `current_user_has_any_role(...)` returned false.
- The RPC failed closed with SQLSTATE `42501`.
- Zero Contact rows were written.
- The transaction was rolled back.

No authorization widening was introduced by the repair.

## Supabase Advisors

Fresh production Security and Performance Advisor scans were reviewed after the lifecycle migration.

- No CUST-7 lifecycle migration-specific Security blocker was found.
- No CUST-7 lifecycle migration-specific Performance blocker was found.
- Existing unrelated project-wide Advisor backlog remains separate and is not represented as clean by this acceptance record.

## Runtime verification

Vercel reported no production runtime error clusters in the inspected six-hour window after CUST-7 repair/deployment lineage verification.

## Remaining signed-in browser gate

The original CUST-7 acceptance contract requires a real signed-in production browser pass; database/RPC acceptance is not substituted for that requirement.

Still required before this document can be marked COMPLETE and the roadmap can move VAL-3 to `[x]`:

- signed-in production Customer create/edit validation;
- field-level invalid state / first-invalid focus and accessibility behavior on the changed Customer forms;
- duplicate-submit protection on representative Customer/Order/Invoice mutations;
- representative Order and Invoice validation/lifecycle checks in the deployed Admin UI;
- confirmation that the production browser surface uses the already-verified canonical RPC boundaries without console/runtime regressions.

This execution environment has Chromium/Playwright locally, but its container has no external DNS access and no existing Admin browser session. An available local-browser connector has been surfaced so the final signed-in gate can be executed without fabricating credentials or changing production user passwords.

## Current result

- **VAL-3 implementation:** GREEN
- **PR #354 schema-drift repair:** GREEN / merged
- **Production migration:** GREEN / applied
- **Authenticated DB/RPC lifecycle acceptance:** GREEN
- **Negative RBAC:** GREEN
- **Zero acceptance residue:** GREEN
- **Security/Performance Advisor CUST-7-specific review:** GREEN
- **Production runtime error review:** GREEN
- **Signed-in production browser acceptance:** PENDING

Therefore **CUST-7 / VAL-3 remains `[~]` until the signed-in browser gate is completed.**