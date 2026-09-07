# Customer Domain — Final Production Acceptance

Status: **COMPLETE / CLOSED**  
Date: **2026-09-07**

## Scope

This record closes the Modulex Admin Customer domain acceptance package covering **CUST-7 through CUST-11**, including VAL-3 Customers / Orders / Invoices validation, Customer lifecycle mutations, Customer read performance, Customer UI standardization/accessibility, and Customer-facing AR/Finance integration boundaries.

This closeout does not redefine Order, Invoice, Finance, Store, Customer Portal, or Dealer Portal business semantics. Existing domain ownership and portal-projection boundaries remain authoritative.

## Delivery lineage

- VAL-3 validation implementation PR **#348** is merged in the production lineage.
- Customer Contact/Address production schema-drift repair PR **#354** merged as `84bc31026409f4f85e6b5a6a11bfbbdfce902382`.
- PR #354 added the forward shared migration `modulex-store/supabase/migrations/20260907150000_customer_contact_address_lifecycle.sql`, permanent migration/security parity coverage, and explicit CUST-7 ownership in the existing Admin CI workflow.
- Customer production acceptance harness PR **#358** is merged to `main` as `ab23762e3558204a24b2400fb6603391f1322eb1`.
- PR #358 reuses the approved `Admin UI Foundation` workflow rather than adding a standalone workflow. Its final branch head `db87c9875a45815c532f685da62c290e436e68a4` passed the Customer production acceptance harness contract together with Customers UI, CUST-7 lifecycle migration, RBAC, TypeScript, lint, and production build verification.
- At closeout, execution-time `main` is `ab23762e3558204a24b2400fb6603391f1322eb1`.

## CUST-7 — Customer lifecycle / VAL-3

### Exact-decimal and validation contract

Production schema truth remains aligned with the VAL-3 client contract:

- Customer commercial `credit_limit` and `minimum_order_amount` are `numeric(18,4)`.
- Order quantity and money fields are `numeric(18,4)`.
- Order percentage fields are `numeric(7,3)`.
- Invoice total and paid amounts are `numeric(18,4)`; invoice percentage fields are `numeric(7,3)`.

The VAL-3 client contract uses normalized decimal-string mutation payloads rather than JavaScript floating-point mutation truth, typed field errors, first-invalid focus, canonical Customer/Order/Invoice RPC boundaries, and the invoice `paid <= total` early guard while keeping the database authoritative.

### Production Customer creation/lifecycle contract

Production contains the Customer creation boundary and Contact/Address lifecycle family used by Admin. The reviewed lifecycle includes:

- Customer creation with optional primary Contact and billing/shipping Addresses;
- `create_customer_contact`;
- `update_customer_contact`;
- `set_customer_contact_primary`;
- `deactivate_customer_contact`;
- `create_customer_address`;
- `update_customer_address`;
- `set_customer_address_default`;
- `deactivate_customer_address`.

The production migration history includes the Customer creation boundary and `customer_contact_address_lifecycle`; repository canonical migrations semantically match the installed production contracts. The closeout does not claim byte/checksum identity where execution timestamps differ from canonical repository filenames.

Reviewed mutation boundaries retain role-aware authorization, pinned search-path behavior, narrow browser grants, and Customer Activity/audit writes.

### Authenticated rollback-only lifecycle acceptance

Production acceptance under the real PostgreSQL `authenticated` role with an active production super-admin identity completed the Contact/Address lifecycle inside an explicit transaction:

1. create Contact;
2. update Contact;
3. set Contact primary;
4. create Address;
5. update Address;
6. set Address shipping default;
7. deactivate Contact;
8. deactivate Address.

Inside the transaction, one acceptance Contact, one acceptance Address, and eight Customer Activity audit rows were produced. The transaction was rolled back.

Post-rollback residue:

- Contact rows: **0**
- Address rows: **0**
- Customer Activity acceptance rows: **0**

A negative authenticated role test failed closed with SQLSTATE `42501` and wrote zero Contact rows.

**CUST-7 result: GREEN / CLOSED.**

## CUST-8 — Customer read performance

Customer list/search/filter/pagination uses server-side bounded reads and exact counts rather than downloading the full Customer table and slicing in the browser. Customer detail consumers share only concurrent in-flight reads; settled requests are removed immediately so mutation-driven reloads do not reuse stale data.

Representative production database timing captured during closeout was low on the current small dataset:

- active Customer list / deterministic page window: approximately **0.17 ms**;
- wildcard Customer name/code search: approximately **4.63 ms**;
- representative Customer detail with related-count aggregation: approximately **9.46 ms**.

Production browser evidence showed the signed-in `/customers` surface rendering successfully with 12 Customers and a representative Customer request completing in approximately **243.6 ms** total, almost entirely server-wait time. No browser error/warning was visible in the captured Console state.

The current production dataset is small, so this record does not pretend that the above timings are a synthetic large-dataset benchmark. The server-side pagination/query contract and permanent regression coverage remain the scale-safety boundary.

**CUST-8 result: GREEN / CLOSED.**

## CUST-9 — Customer UI standardization / accessibility

The Customer feature components are aligned with the shared Admin UI foundation and the final #358 closeout includes the Customer production acceptance harness contract plus accessibility-gap fixes. The merged contract checks authenticated Customer route visibility, 390px horizontal overflow, keyboard focus reachability, dark preference behavior, and unnamed interactive controls when run against an already-authenticated browser session.

Captured production evidence during closeout confirmed:

- real signed-in `/customers` route/UI visibility;
- dark-themed Customer surface rendering;
- Customer summary/table content visible at production;
- Console state with no visible errors or warnings.

The project owner explicitly accepted the remaining manual signed-in UI acceptance for Customer and authorized final domain closure on 2026-09-07. This record therefore treats the product-owner acceptance as the final manual gate; it does **not** claim that every individual DevTools/manual artifact was persisted into the repository.

**CUST-9 result: GREEN / CLOSED.**

## CUST-10 — Customer AR / Finance integration

Customer AR remains Finance-owned canonical truth rather than a duplicate Customer ledger.

Reviewed production contracts include:

- `get_ar_aging_page`;
- `get_customer_balances_page`;
- `get_customer_invoice_balance_page`;
- `get_customer_receipts_page`;
- `record_customer_receipt`;
- private AR aging/customer-receipt projection and authorization helpers.

The AR projection excludes Draft/Void invoices, derives outstanding as `greatest(total_amount - paid_amount, 0)`, uses deterministic aging buckets, and preserves base-currency/unconverted handling. Receipt mutation validates amount/allocation equality, locks invoices, prevents overpayment, preserves idempotency, and appends Finance transaction/link/audit state.

Money/FX contracts remain decimal (`numeric`) rather than binary floating-point mutation truth. Negative Sales-role AR access failed closed; super-admin access succeeded. Production currently contains only Draft invoices in the inspected set, so the AR projection correctly returned no active aging rows.

**CUST-10 result: GREEN / CLOSED.**

## Supabase Advisors

Security and Performance Advisor output is **not represented as globally clean**.

- No Customer lifecycle-specific blocking Security or Performance finding was identified during closeout.
- Existing project-wide advisor backlog remains separate, including unrelated SECURITY DEFINER/policy/index warnings and low-signal unused-index findings on the current small dataset.

## CUST-11 — Final closeout decision

The implementation, production DB/RPC lifecycle checks, RBAC/zero-residue checks, permanent Customer CI contracts, production Customer route evidence, Finance/AR boundary review, and explicit project-owner production acceptance are sufficient to close the Customer domain.

The project owner explicitly authorized Customer closeout on **2026-09-07**. No further Customer feature package is required by this acceptance record. Future Customer changes should be opened as new scoped work rather than implicitly reopening CUST-7 through CUST-11.

## Final result

- **CUST-7 / VAL-3 Customer lifecycle:** GREEN / CLOSED
- **CUST-8 Customer performance:** GREEN / CLOSED
- **CUST-9 Customer UI standardization/accessibility:** GREEN / CLOSED
- **CUST-10 Customer AR/Finance boundary:** GREEN / CLOSED
- **CUST-11 final Customer acceptance:** GREEN / CLOSED
- **Production acceptance residue:** zero from rollback-only lifecycle probes
- **Customer domain:** **COMPLETE**
