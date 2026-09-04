# Modulex Finance Final — Living Implementation Plan

Status: **LIVING EXECUTION PLAN**  
Last updated: **2026-09-05**  
Scope: `modulex-admin` operational Finance and its domain integrations  
Execution order: **A6-F0 → A6-F1 → A6-F2 → A6-F3 → A6-F4 → A6-F5 → A6-F6 → A6-F7**

> This file is the day-to-day execution tracker for the remaining Modulex Finance work. Update it after every completed implementation package, migration, PR/merge/deploy, or material architecture decision.

---

## 0. Source-of-truth hierarchy

Use these sources together; do not silently replace one with another:

1. **`financefinal.md`** — living execution plan, package status, acceptance checklist, next work.
2. **`docs/FINANCE_DOMAIN_PLAN.md`** — locked Finance domain/ownership architecture. This file may not weaken or contradict that contract.
3. **`docs/FINANCE_F0_BASELINE.md`** — verified pre-Finance production/schema compatibility baseline.
4. **`AdminUICheck.md`** — mandatory Admin UI quality/acceptance reference for every Finance UI package.
5. Existing canonical migrations/RPCs/tests in the repository — implementation truth at execution time.
6. Production Supabase state — must be re-read immediately before destructive, backfill, constraint, or rollout work.

### Living-plan update protocol

Every implementation package must update this file with:

- package status: `NOT STARTED`, `ACTIVE`, `BLOCKED`, `SOURCE COMPLETE`, `MERGED`, `DEPLOYED`, `COMPLETE`;
- completion date;
- branch/PR/commit or migration identifiers when applicable;
- fresh verification evidence;
- production rollout state when applicable;
- unresolved risks/blockers;
- the next executable package.

Do not mark a package `COMPLETE` from source changes alone. Its stated exit criteria and required verification must be satisfied.

---

## 0A. Mandatory existing-system-first / no-duplication gate

This gate applies **before every A6 package and sub-package**. A roadmap item is a business requirement, not permission to create a new table, RPC, route, component, service, or source of truth.

### Core rule

**Never implement `NEW` first. Inspect the current system first.**

Before changing code or schema, inventory the current execution-time state across:

- current `main` and relevant open PRs;
- production tables, views, columns, constraints, indexes and triggers;
- public RPCs and private authorization/validation cores;
- RLS policies, grants and role/permission mappings;
- existing Admin routes, managers/components, actions and navigation;
- source-domain models such as Customer, Project, Order, HR, Vendor/Purchasing and Inventory;
- existing tests, regression contracts and CI workflows;
- production row counts/history when migration, backfill or constraint work is involved.

For every planned requirement, record a delta decision before implementation:

| Decision | Meaning | Required behavior |
| --- | --- | --- |
| `REUSE` | Existing canonical capability already satisfies the requirement | Use it as-is; do not duplicate it |
| `EXTEND` | Existing canonical capability is correct but incomplete | Add only the missing behavior/schema/UI/tests to that capability |
| `BRIDGE` | Another domain already owns the source truth | Link/project it into Finance without copying ownership |
| `MIGRATE` | Existing shape must evolve | Use additive/controlled migration, preserve history/IDs and reconcile |
| `DEPRECATE` | A legacy compatibility path can eventually be retired | Only through explicit reviewed migration with compatibility evidence |
| `NEW` | No canonical primitive currently satisfies the requirement | Create only after absence is demonstrated from current repo + DB evidence |

### Mandatory delta matrix per package

Before implementation starts, add a package-specific matrix to the work log or implementation notes:

| Requirement | Existing asset | Decision | Required delta | Compatibility/migration |
| --- | --- | --- | --- | --- |
| Example | existing RPC/table/UI | `REUSE` / `EXTEND` / `BRIDGE` / `MIGRATE` / `DEPRECATE` / `NEW` | exact missing behavior | how live behavior/history is preserved |

No package may move from planning to implementation until this matrix is grounded in current-state evidence.

### Hard rules

- `NEW` requires positive evidence that no canonical existing primitive satisfies the requirement.
- If an existing system partially satisfies the requirement, default to `EXTEND`, not a parallel replacement.
- If another domain owns the business truth, default to `BRIDGE`, not copied rows/manual totals.
- Do not create duplicate tables because the roadmap uses a different conceptual name.
- Do not create duplicate RPCs when an existing canonical mutation can be safely extended.
- Do not create a second page/manager when an existing route can be extended without breaking domain boundaries.
- Do not create a second permission vocabulary when existing Finance/source-domain permissions already model the authority.
- Preserve existing production IDs, source references, posted history and audit history unless an explicit reviewed migration proves replacement is required.
- Preserve supported public behavior/API compatibility until a deliberate deprecation/migration package retires it.
- Never turn a migration convenience field into a second manually editable source of financial truth.
- Historical/inactive dimension rows must remain resolvable for audit and reversal.
- A previous baseline finding of “not found” is not permanent evidence. Re-check current `main` and production immediately before creating a new primitive.

### Implementation sequence enforced for every package

`inventory current system → produce delta matrix → choose REUSE/EXTEND/BRIDGE/MIGRATE/DEPRECATE/NEW → lock compatibility plan → tests/implementation → fresh verification → rollout/reconciliation → update financefinal.md`

---

## 0B. Current existing-system map — verified direction as of 2026-09-05

This map prevents already-built Finance work from being accidentally rebuilt. It is a starting point, not a substitute for execution-time re-verification.

| Capability/domain | Existing state | Default decision for later work |
| --- | --- | --- |
| Finance Overview `/finance` | Existing route + Finance Overview component | `REUSE / EXTEND` |
| Financial Accounts `/finance/accounts` | Existing F1 UI and canonical Finance account RPC client | `REUSE / EXTEND / CLOSEOUT` |
| Transactions `/finance/transactions` | Existing F1 transaction UI and lifecycle RPC client | `REUSE / EXTEND / CLOSEOUT` |
| Finance Core transaction vocabulary | Existing draft/post/void/reverse model | `REUSE`; extend only for real missing semantics |
| Finance accounts/categories/FX | Existing client/RPC surface for accounts, categories, FX observations | `REUSE / EXTEND` |
| Finance transaction links | Existing link/allocation client surface including Employee/source-document context | `REUSE / EXTEND` |
| Employee payment linkage | Already supported in current Finance Transactions flow | `REUSE / EXTEND`; F4 must not rebuild basic employee-payment posting |
| `/finance/payroll` | Existing route renders HR `PayrollManager` | `BRIDGE`; do not create a second payroll calculation engine |
| `/finance/compensation` | Existing route renders HR `CompensationManager` | `BRIDGE`; HR remains compensation owner |
| `company_expenses` | Existing source table/domain from pre-F1 baseline | `BRIDGE / MIGRATE`; do not create parallel expense truth by default |
| `customer_invoices` | Existing live customer document model | `BRIDGE / EXTEND`; preserve IDs/history |
| Project payment requirements/transactions/allocations | Existing live specialized payment ledger/history | `BRIDGE / EXTEND`; preserve compatibility until explicit F5 migration |
| HR payroll periods/runs/items | Existing HR source model | `BRIDGE`; Finance records resulting money movement only |
| `hr_advances` | Existing HR source model | `BRIDGE`; no duplicate Finance advance master |
| `payment_methods` | Existing shared canonical configuration | `REUSE`; no free-text AP/Finance method duplicate |
| `payment_terms` | Existing commercial configuration | `REUSE` where applicable; do not confuse with payment movement |
| Canonical Vendor/Supplier master | F0 did not identify one | **RE-CHECK at F3A**; `NEW` only if still absent |
| General Vendor Bill/AP model | F0 did not identify one | **RE-CHECK at F3B**; `NEW` only if still absent |
| Cash/bank Finance Core | Implemented and production-verified by F1 | `REUSE / EXTEND`; never rebuild |

### Current F1 evidence that must be preserved

The current Finance client already exposes canonical operations including:

- `get_finance_overview`;
- `get_finance_accounts`;
- `get_finance_categories`;
- `get_finance_fx_rates`;
- `get_finance_transactions_page`;
- `create_finance_account` / `update_finance_account`;
- `create_finance_category`;
- `upsert_finance_fx_rate`;
- `create_finance_transaction_draft` / `update_finance_transaction_draft` / `delete_finance_transaction_draft`;
- `set_finance_transaction_links`;
- `post_finance_transaction`;
- `void_finance_transaction`;
- `reverse_finance_transaction`;
- Finance Employee/Payroll lookup helpers used for Employee payment linkage.

F1 is **COMPLETE / VERIFIED 2026-09-05**. Later packages reuse or extend it; they do not reimplement it.

---

## 1. Current progress board

| Package | Scope | Status | Existing-system posture | Exit dependency |
| --- | --- | --- | --- | --- |
| A6-F0 | Baseline & architecture contract | **COMPLETE / APPROVED 2026-09-04** | Baseline/source inventory | — |
| A6-F1 | Finance Core + Cash/Bank | **COMPLETE / VERIFIED 2026-09-05** | **REUSE / EXTEND ONLY** | — |
| A6-F2 | Expenses | **NEXT / DELTA AUDIT REQUIRED** | `company_expenses` → **BRIDGE/MIGRATE first** | F1 satisfied |
| A6-F3A | Vendor/Supplier Master + Compliance | **NOT STARTED** | Re-check canonical entity before `NEW` | F2 + current-state audit |
| A6-F3B | Vendor Bills / AP Core | **NOT STARTED** | Re-check current AP primitives before `NEW` | F3A |
| A6-F3C | Vendor Payments + Check Lifecycle | **NOT STARTED** | Finance Core + `payment_methods` → **REUSE/EXTEND** | F3B |
| A6-F3D | Payment Schedule | **NOT STARTED** | Reuse bill/payment primitives | F3B/F3C primitives |
| A6-F3E | Purchasing / AP Integration | **NOT STARTED** | **BRIDGE** Purchasing ↔ AP | F3B/F3C |
| A6-F3F | AP Aging & Vendor Financial Projection | **NOT STARTED** | Projection over canonical AP/Finance truth | F3B–F3E |
| A6-F4 | Payroll / Contractor Finance Integration | **NOT STARTED** | HR + existing Employee Finance flow → **BRIDGE/EXTEND** | F3 stable |
| A6-F5 | Sales / AR Integration | **NOT STARTED** | Existing invoices/Project payments → **BRIDGE/EXTEND/MIGRATE** | F4 stable |
| A6-F6 | Reporting & Profitability Projection | **NOT STARTED** | Read models over existing canonical truth | F2–F5 integrated |
| A6-F7 | Hardening & Production Acceptance | **NOT STARTED** | Verify integrated system; no feature rewrite | F1–F6 complete |

### Next executable package

**A6-F2 Expenses — existing-system delta audit first.** Re-read current `company_expenses`, Finance Core, payment methods, expense UI/routes and production data; classify each requirement as `REUSE / EXTEND / BRIDGE / MIGRATE / NEW` before changing schema or code.

---

## 2. Non-negotiable architecture rules

These rules come from the locked Finance domain plan and apply to every package below.

### 2.1 Finance ownership

- Finance is a first-class domain.
- Project, Order, Customer, Vendor/Supplier, and Employee links are business context/attribution, not universal Finance ownership.
- A valid general Finance transaction must not require a Project or Order when the business event does not require one.
- Source domains remain authoritative for their own documents/calculations; Finance owns actual money movement and financial ledger effects.

### 2.2 Documents are not transactions

Never collapse these into one universal table:

- invoice;
- vendor bill;
- purchase order;
- expense source document;
- check/payment instrument;
- payroll source record;
- Finance transaction.

A source document can create/link one or more Finance transactions when money actually moves.

### 2.3 Posting lifecycle

- `draft` Finance records may be edited and guarded-deleted.
- `posted` money history is immutable.
- Safe void is allowed only through the canonical mutation boundary when dependencies permit it.
- Otherwise correction uses a linked compensating reversal.
- No silent in-place edit of posted amount, currency, or financial account.
- Actor, time, reason, source and reversal relationship must remain auditable.
- Retryable posting/payment operations must be idempotent.

### 2.4 Currency

- Every transaction stores transaction currency.
- Reporting normalizes to company main currency.
- Same-currency transactions need no FX conversion snapshot.
- Cross-currency transactions preserve the effective transaction-time FX snapshot.
- Manual/agreed FX overrides are allowed when required by business terms, but source/type must be preserved.
- Historical reports use the stored snapshot, not a later market rate.

### 2.5 Allocation

- Finance Core must support zero, one, or multiple Project/Order attributions.
- Multi-project costs/revenue use an allocation/link layer.
- Source transaction total remains authoritative.
- Allocation totals must be deterministic and validated; they must never exceed the authoritative source amount.

### 2.6 Authorization

Sensitive mutations follow:

`Admin permission → route/server boundary → public RPC → private authorization/validation core → grants/RLS → lifecycle constraints → audit`

- Frontend permission labels are not database authority.
- Do not copy legacy browser-direct HR writes into Finance Core.
- Do not widen HR/Project/Customer permissions merely because a user has `finance.manage`.

### 2.7 Canonical dimensions

- Reuse the canonical Modulex domain table for Customer, Employee, Project, Order and Vendor/Supplier.
- Do not create a duplicate Supplier master solely for Finance.
- `payment_methods` is canonical configuration; Finance/AP must not use free-text values such as `Check`, `Wire`, `Zelle`, etc. once the canonical relationship exists.
- Historical inactive accounts/categories/payment methods must remain resolvable for audit/reversal/history.

---

## 3. Excel-derived operational requirements accepted into this plan

The reviewed legacy payment workbook exposed operational needs that were not sufficiently explicit in the original high-level Finance roadmap. These requirements are accepted here without redesigning F1.

### 3.1 Check / payment instrument lifecycle — REQUIRED

A generic transaction date/reference is not sufficient for checks.

Required concepts:

- payment method;
- instrument type;
- check/instrument number;
- issued date;
- cleared/cashed date;
- voided date when applicable;
- bank account;
- lifecycle status;
- reference/notes.

Target lifecycle vocabulary for checks:

- `issued`;
- `cleared`;
- `voided`;
- `returned`.

Preferred model direction: a Finance transaction child such as `finance_payment_instruments` (final physical name decided during migration design), rather than adding check-specific columns to every Finance transaction.

**Important:** `posted` and `cleared` are not synonyms. A posted vendor payment can still represent an outstanding issued check until the bank clears it.

### 3.2 Scheduled payment date — REQUIRED

Keep separate meanings for:

- invoice/bill `due_date`;
- `scheduled_payment_date`;
- actual `paid_at` / transaction posting time;
- instrument `cleared_at`.

These dates must not be collapsed because they support different operational and reporting questions.

### 3.3 Vendor/contractor compliance documents — REQUIRED

W9, COI, license and similar compliance records do not belong in `finance_transactions`.

They belong to the canonical Vendor/Contractor domain and must support, as applicable:

- document type;
- file/document reference;
- issued date;
- expiry date;
- status;
- verification timestamp;
- verifier.

The UI may warn about missing/expired compliance. A hard payment block must **not** be invented unless an explicit company policy is approved.

### 3.4 Partial/installment payments — REQUIRED

Do not model installments as fixed columns such as `Payment 1`, `Payment 2`, `Payment 3`.

Use:

`Vendor Bill total → N payment allocations → outstanding balance`

The same principle later applies to AR/customer receipts.

### 3.5 Purchasing/AP boundary — REQUIRED

Target relationship:

`Purchase Order → Vendor Bill → Payment Allocation → Finance Transaction`

Domain ownership remains:

- Purchasing/Procurement: PO, SKU, quantity, procurement freight/fees and landed-cost inputs.
- Finance/AP: vendor bill/payable, payment allocation, actual cash/bank movement.
- Sales/Reporting: selling price, margin/profitability projection.

Do not create duplicate monetary truth just to simplify a report.

### 3.6 One ledger, not annual tables — REQUIRED

Do not reproduce separate annual check structures. Use one canonical ledger/instrument model and filter/report by date/year.

### 3.7 Counterparty normalization — REQUIRED

Legacy payee/vendor spelling variants must not become duplicate AP counterparties. Canonical Vendor/Supplier identity and safe deduplication/mapping are required before historical import/backfill.

---

## 4. Affected domains and ownership matrix

| Domain | Owns | Finance integration |
| --- | --- | --- |
| Finance Core | accounts, money transactions, FX snapshots, financial audit | canonical ledger |
| Expenses | expense source document/category/context | posts/links Finance transaction |
| Vendor/Supplier | counterparty master, contacts, compliance docs | AP bills/payments/balance projection |
| Purchasing | PO, procurement lines, receiving/cost inputs | links PO to vendor bill; no duplicate payment truth |
| Projects | operational/commercial project context | receives Finance attribution/allocation projection |
| Orders | commercial order context | optional bill/payment/cost attribution |
| Customers | customer master, customer commercial context | AR invoice/payment/balance projection |
| HR/Personnel | employee master, compensation, payroll calculation | Finance owns resulting money movement |
| Inventory/Product | inventory/product cost context | consumes approved procurement/landed-cost outputs where defined |
| Reports | projections/read models | reads canonical Finance + linked source-domain truth |

---

## 5. Target Admin information architecture

This is a functional target map, not a command to create duplicate routes. **Before adding any route, apply section 0A and extend an existing surface when that is the canonical home.**

### Finance

- `/finance` — Overview — **already exists; reuse/extend**.
- `/finance/transactions` — Transactions — **already exists; reuse/extend**.
- `/finance/accounts` — Cash & Bank / Financial Accounts — **already exists; reuse/extend**.
- `/finance/expenses` — Expenses — create only if current route inventory still lacks a canonical Expenses surface at F2.
- Accounts Payable functional surfaces:
  - Vendor Bills;
  - Vendor Payments;
  - Payment Schedule;
  - AP Aging.
- Accounts Receivable functional surfaces:
  - Customer Invoices — **existing customer invoice surface must be reused/extended**;
  - Customer Payments — integrate existing Project/customer payment surfaces where appropriate;
  - AR Aging.
- `/finance/payroll` and `/finance/compensation` — **existing HR-backed integration views; do not duplicate HR models**.
- Settings/configuration:
  - Financial Accounts — existing Finance surface;
  - Finance Categories — existing Finance surface;
  - Payment Methods — existing shared configuration.

### Vendor/Supplier detail target surfaces

After F3A current-state audit, extend the canonical Vendor/Supplier entity rather than building a parallel AP-only vendor unless no canonical entity exists:

- Overview;
- Contacts;
- Documents / Compliance;
- Purchases;
- Bills / Invoices;
- Payments;
- Balance / open AP summary.

### Project / Order projections

Do not create a second Finance ledger inside Projects or Orders. Their existing detail pages may be extended to display:

- linked Finance transactions;
- allocated expenses/payables/receipts;
- customer/vendor payment context;
- financial summary/profitability projection.

---

## 6. Mandatory UI acceptance contract — `AdminUICheck.md`

Every new or changed Finance/Admin surface must be audited against the current `AdminUICheck.md`, not just visually checked in one desktop state.

At minimum, each package must cover:

- [ ] Dark / light theme compatibility.
- [ ] Mobile and responsive layout.
- [ ] No hardcoded locale, demo/template copy, or stale placeholder content.
- [ ] No dead/empty/TailAdmin template links or controls.
- [ ] Correct RBAC visibility and action behavior.
- [ ] Loading, empty, error, retry and action states.
- [ ] Keyboard focus, labels, ARIA and accessibility basics.
- [ ] Existing lint warnings inside package scope addressed or explicitly recorded.
- [ ] Regression contract + production-surface/RBAC checks + production build.

### Resolution/UI-system requirements inherited from Admin UI Audit v2

Required responsive verification matrix where applicable:

- 360;
- 390;
- 768;
- 1024;
- 1280;
- 1366;
- 1440;
- 1536;
- 1920;
- 2560.

Additional expectations:

- `lg = 1024px` remains the shared desktop/mobile shell boundary unless the central UI contract changes.
- Data-heavy Finance tables use the shared table viewport/overflow system.
- Loading/empty/populated states preserve table structure.
- Shared design tokens/components are used for buttons, inputs, dropdowns, modal, checkbox/switch, cards, focus and semantic status UI.
- Desktop expanded/collapsed sidebar and mobile open/closed navigation states must not break Finance pages.
- Existing shared components are reused before adding Finance-only equivalents.

A Finance package is not UI-complete until its relevant `AdminUICheck.md` acceptance items have fresh evidence.

---

# 7. Detailed delivery plan

## A6-F1 — Finance Core + Cash/Bank closeout

Current state: **COMPLETE / VERIFIED 2026-09-05**.

Existing current route surface:

- `/finance`;
- `/finance/accounts`;
- `/finance/transactions`;
- `/finance/payroll`;
- `/finance/compensation`.

Existing F1 client/UI already covers Finance accounts, categories, FX observations, transaction drafts, links, posting, draft deletion, void and reversal. F1 was closed by verification and gap analysis; no replacement Finance Core was created.

### F1 delta matrix — verified 2026-09-05

| Requirement | Existing asset | Decision | Required delta | Compatibility/migration |
| --- | --- | --- | --- | --- |
| Finance accounts/categories/FX | Production F1 tables + canonical RPC/client/UI | `REUSE` | None for F1 closeout | Preserve current IDs/history |
| Finance transaction lifecycle | Existing draft/post/void/reverse RPCs + DB guards | `REUSE` | None | Posted/voided history remains immutable |
| Transaction links/allocation | Existing `finance_transaction_links` + validators | `REUSE` | None | Existing link semantics preserved |
| Audit/idempotency | Existing append-only audit + idempotency request model | `REUSE` | None | No new parallel audit/idempotency store |
| Employee payment linkage | Existing Finance Employee/Payroll flow + PRs #298/#302 | `REUSE / BRIDGE` | None | HR stays payroll truth; Finance stays money-movement truth |
| Finance UI | `/finance`, `/finance/accounts`, `/finance/transactions` + shared Admin components | `REUSE` | No F1 UI rewrite | Shared Admin UI contracts remain authoritative |
| Finance CI | `Admin A6 Finance Core` workflow + Admin UI Foundation | `REUSE / VERIFY` | Record current evidence | Finance runtime unchanged after last Finance GREEN |
| Production rollout | F1/hardening/employee/payroll-reconciliation migrations + Vercel production deployment | `REUSE / VERIFY` | None | Existing production lineage preserved |
| Security Advisor findings | Intended public SECURITY DEFINER wrappers + private cores; private RLS-only internal tables | `REUSE / REVIEW` | No F1 privilege rewrite | Final advisor disposition re-run in F7 |
| Performance Advisor INFO | New/small Finance schema has several unindexed actor/reference FKs and currently-unused indexes | `REUSE / REVIEW` | No speculative F1 index churn | Query/index tuning remains an explicit F7 gate |

### F1 closeout verification

- [x] Re-read current `main` and open PR state before closeout.
- [x] Inventory F1 migrations/tables/constraints/indexes/triggers in production.
- [x] Inventory Finance RPC/private-core/RLS/grant surface.
- [x] Inventory Finance Overview/Accounts/Transactions and existing HR-backed Finance routes.
- [x] Produce the F1 delta matrix above.
- [x] Confirm no Finance runtime files changed between merged payroll reconciliation `6e0b9619...` and closeout baseline `9d0d3b401...`; later changes in that compare are non-Finance runtime work plus this planning document.
- [x] Finance-specific workflow evidence: `Admin A6 Finance Core` run `33879439467` GREEN on the latest Finance runtime head, including `smoke:a6-finance-core` and `finance-reports-ui-contract`.
- [x] Current-main Admin UI Foundation run `33927578897` GREEN, including shared table/theme/full-route/resolution contracts, Admin regression, production-surface/RBAC, typecheck, lint and production build.
- [x] Verify Finance Overview, Transactions and Accounts/Cash & Bank against the shared `AdminUICheck.md` automated contract stack.
- [x] Production migration history includes `a6_finance_core`, `a6_finance_core_hardening`, `a6_finance_employee_payments` and `a6_payroll_finance_reconciliation`.
- [x] Production Finance tables/RPC/private cores are present and RLS is enabled on the Finance tables.
- [x] Public Finance RPC wrappers are authenticated callable, anonymous execute is revoked, and private Finance cores are not exposed to authenticated callers.
- [x] Posted Finance history immutability guard is active; audit/idempotency append-only guards are active.
- [x] Employee-payment posting/link and payroll-reconciliation validators/triggers are active.
- [x] Production invariant audit returned zero for orphan audit rows, orphan links, orphan idempotency results, malformed reversals, draft rows carrying posted snapshots, posted/voided rows missing snapshots, overallocated transactions and posted employee payments missing Employee links.
- [x] FX posting function verifies same-currency identity behavior, manual/agreed rate + source requirements, and latest eligible transaction-time FX observation at or before transaction time; no later-rate revaluation is used for posting.
- [x] Production state observed during closeout: 1 Finance account, 13 Finance categories, 0 saved FX observations, 3 Finance transactions, 2 transaction links, 9 audit rows and 7 idempotency rows. These counts are evidence only, not permanent assumptions.
- [x] Vercel production deployment for merged payroll-reconciliation/F1 lineage (`6e0b9619...`) is `READY`; F1 runtime has been deployed.
- [x] Security Advisor reviewed: SECURITY DEFINER wrapper warnings are intentional under the locked public-wrapper/private-core architecture; internal idempotency tables remain non-public application state. No F1 authorization widening was made.
- [x] Performance Advisor reviewed: Finance-specific findings are INFO-level index/unused-index observations on a tiny/new dataset; no speculative schema churn was introduced. Re-evaluate with realistic data in F7.
- [x] No code, DDL or production mutation was required for F1 closeout because no proven F1 gap remained.

### F1 exit

**SATISFIED 2026-09-05.** The existing F1 Finance Core is production-deployed and verified. Generic money movement remains independent of Project/Order ownership; lifecycle, audit, idempotency, allocation, Employee linkage, FX semantics, RLS/RPC boundaries and Admin CI/UI contracts have current evidence. Later packages must reuse/extend this Core rather than rebuild it.

---

## A6-F2 — Expenses

Goal: make operational company/project-attributable expenses use Finance Core without losing or duplicating the existing `company_expenses` model/history.

### F2 existing-system delta audit — REQUIRED FIRST

- [ ] Re-audit current `company_expenses` schema, data, RLS, UI and mutation paths.
- [ ] Re-audit current Finance categories/accounts/transactions/links/payment methods for reusable primitives.
- [ ] Check whether an Expenses Admin route or component has been added since F0.
- [ ] Produce F2 delta matrix.
- [ ] Default `company_expenses` to `BRIDGE/MIGRATE`; a parallel expense source table requires explicit proof.

### F2 data/domain work

- [ ] Define bridge/backfill strategy; do not destructively replace historical rows.
- [ ] Reuse/extend controlled Finance category relationship.
- [ ] Reuse existing financial accounts at posting time.
- [ ] Reuse canonical `payment_methods` where applicable.
- [ ] Add/reuse document/reference/attachment relationship without mixing binary state into the ledger.
- [ ] Map expense status to Finance draft/posted/void/reversal without parallel money truth.
- [ ] Support optional Vendor, Employee, Project, Order and Customer context only when relevant.
- [ ] Reuse/extend Finance link/allocation model for multi-project/order attribution.
- [ ] Preserve existing currency/FX semantics.
- [ ] Extend existing audit/idempotent mutation boundaries where possible.

### F2 UI

- [ ] Extend an existing canonical Expenses surface if one exists; otherwise add `/finance/expenses`.
- [ ] Expense list/create/detail.
- [ ] Draft edit/delete.
- [ ] Post/pay action as appropriate.
- [ ] Void/reversal flow.
- [ ] Filters: status, date, category, account, vendor, project/order, employee, currency as supported.
- [ ] Allocation UI when one expense is split across projects/orders.
- [ ] Attachment/reference presentation.
- [ ] Admin UI audit per section 6.

### F2 tests

- [ ] General expense without Project/Order.
- [ ] Project-attributed expense.
- [ ] Multi-project allocated expense.
- [ ] Allocation total cannot exceed authoritative expense amount.
- [ ] Same-currency and FX expense.
- [ ] Unauthorized create/post/void denied.
- [ ] Retry/idempotency regression.
- [ ] Posted mutation immutability regression.
- [ ] Legacy `company_expenses` bridge/backfill reconciliation.
- [ ] No duplicate expense source-of-truth regression.

### F2 exit

Existing expense history is preserved; operational expenses use the canonical Finance money-movement boundary; no duplicate expense ledger/source has been introduced.

---

## A6-F3A — Canonical Vendor/Supplier Master + Compliance

Goal: establish/reuse the AP counterparty identity before building bills/payments on ambiguous free-text vendors.

### F3A existing-system delta audit — REQUIRED FIRST

- [ ] Re-audit current Vendor Catalog/integration identities.
- [ ] Re-audit any Vendor/Supplier/Contractor master added since F0.
- [ ] Re-audit shared document/media/compliance frameworks before adding vendor-specific document storage.
- [ ] Produce F3A delta matrix.
- [ ] `NEW` Vendor/Supplier master is allowed only if a canonical business counterparty still does not exist.

### F3A domain/data

- [ ] Select/reuse/extend the canonical Vendor/Supplier master.
- [ ] Do not treat Vendor Catalog integration codes as AP identity by accident.
- [ ] Define vendor status/activation rules while preserving historical references.
- [ ] Define duplicate detection/mapping strategy for legacy names.
- [ ] Define contacts/remittance/business details required by AP.
- [ ] Reuse an existing canonical document framework where appropriate; otherwise add vendor compliance records.
- [ ] Initial compliance concepts: W9, COI, LICENSE, OTHER unless existing conventions provide canonical values.
- [ ] Support issued/expiry/status/verification metadata.
- [ ] Define warning behavior.
- [ ] Do **not** invent a hard payment block for expired/missing compliance without approved policy.

### F3A UI

- [ ] Extend the canonical Vendor list/detail rather than create a duplicate AP vendor UI.
- [ ] Vendor Overview, Contacts, Documents/Compliance.
- [ ] Missing/expired compliance warning states.
- [ ] Finance/AP summaries only when backed by real data; no dead tabs/actions.
- [ ] Admin UI audit per section 6.

### F3A tests

- [ ] Canonical vendor identity cannot be bypassed with arbitrary AP free text when FK is required.
- [ ] Duplicate/import mapping tests.
- [ ] Historical inactive vendor references remain readable.
- [ ] Document expiry/status/permission tests.
- [ ] Finance permission does not silently grant unrelated vendor-master mutation authority.

### F3A exit

One canonical AP Vendor/Supplier identity exists or is deliberately extended, with compliance modeled outside Finance transactions and no duplicate vendor master.

---

## A6-F3B — Vendor Bills / AP Core

Goal: create or extend the payable source-document layer while keeping actual money movement in the existing Finance Core.

### F3B existing-system delta audit — REQUIRED FIRST

- [ ] Re-audit production/current-main for purchase/vendor invoice, payable, receiving or bill primitives added after F0.
- [ ] Re-audit Purchasing PO/receiving/cost models for reusable source-document relations.
- [ ] Re-audit Finance transactions/links/payment methods/FX for reusable settlement primitives.
- [ ] Produce F3B delta matrix.
- [ ] Build new bill/AP tables only for capabilities still absent after this audit.

### F3B schema/domain

- [ ] Reuse/extend existing payable document if present; otherwise add vendor bill header.
- [ ] Add/extend bill lines only where line-level detail is needed.
- [ ] Canonical vendor FK.
- [ ] Bill number/reference + duplicate protection.
- [ ] Bill date and `due_date`.
- [ ] Document currency + main-currency projection/snapshot consistent with Finance architecture.
- [ ] Status model: draft/open/partially paid/paid/void or canonical equivalent.
- [ ] Optional Project/Order/PO attribution without universal ownership.
- [ ] Payment allocation model: one bill can receive N payments.
- [ ] Outstanding balance derived from authoritative bill total minus valid allocations.
- [ ] No independent manually editable running balance.
- [ ] Overpayment fails closed unless explicitly supported.
- [ ] Reuse/extend attachment/source-document framework.
- [ ] Audit/idempotency rules.

### F3B UI/tests/exit

- [ ] Extend an existing AP/purchasing document surface if canonical; otherwise add Vendor Bills UI.
- [ ] List/create/edit/detail/lines/due/status/outstanding/links/allocation history.
- [ ] Filters: vendor/status/due/project/order/PO/currency.
- [ ] Admin UI audit.
- [ ] Bill without Project/Order.
- [ ] Project/Order/PO-linked bill.
- [ ] Partial/full payment reconciliation.
- [ ] Duplicate bill protection.
- [ ] Unauthorized mutation denial.
- [ ] FX/history semantics.

**Exit:** vendor bills/payables use one canonical source model, optionally link Project/Order/PO, reconcile partial payments, and do not duplicate Finance money movement.

---

## A6-F3C — Vendor Payments + Check / Payment Instrument Lifecycle

Goal: settle AP through the **existing** Finance transaction engine and explicitly add only the missing payment/check semantics.

### F3C existing-system delta audit — REQUIRED FIRST

- [ ] Re-audit existing `vendor_payment` Finance transaction behavior.
- [ ] Re-audit `payment_methods` fields/relations and current payment UI.
- [ ] Re-audit whether any check/payment-instrument model was added after this plan.
- [ ] Produce F3C delta matrix.
- [ ] Default Finance transaction posting/FX/idempotency/account behavior to `REUSE/EXTEND`, not replacement.

### F3C payment model

- [ ] Vendor payment creates/links canonical `vendor_payment` Finance transaction.
- [ ] Canonical Vendor/Supplier link.
- [ ] Canonical `payment_methods` FK; no duplicate free-text method.
- [ ] One payment may allocate across bills when supported; one bill may receive multiple payments.
- [ ] Unapplied payment explicitly supported or fails closed.
- [ ] Existing Finance account/source-of-funds, currency/FX, posting and idempotency reused.

### F3C payment instrument model

Only add a child such as `finance_payment_instruments` if current-state audit confirms no canonical instrument model exists.

Required semantics:

- [ ] Finance transaction link;
- [ ] payment method link where required;
- [ ] instrument type;
- [ ] check/instrument number;
- [ ] `issued_at`;
- [ ] `cleared_at`;
- [ ] `voided_at` when applicable;
- [ ] bank/financial account reference;
- [ ] status `issued` / `cleared` / `voided` / `returned` initially;
- [ ] reference/notes;
- [ ] scoped check-number uniqueness;
- [ ] validated/audited transitions.

### F3C lifecycle/UI/tests

- [ ] Posting a check payment does not mark it cleared automatically.
- [ ] Clearing is a separate audited action.
- [ ] Void before clearing follows safe lifecycle rules.
- [ ] Returned check causes approved Finance/AP reversal behavior, not status-only correction.
- [ ] Cleared instruments cannot be casually edited/renumbered.
- [ ] Vendor Payments list/detail/allocate flow.
- [ ] Conditional check fields by payment method.
- [ ] Outstanding/Cleared Checks filters and check-number search.
- [ ] Cash/wire does not require check fields.
- [ ] Issued→cleared and safe issued→voided transitions.
- [ ] Invalid transitions fail closed.
- [ ] Retry does not double-pay.
- [ ] Unauthorized clearing/void/reversal denied.
- [ ] Admin UI audit.

**Exit:** AP payments reuse Finance Core and `payment_methods`; only missing instrument lifecycle is added/extended, with posting distinct from clearing.

---

## A6-F3D — Payment Schedule

Goal: model intent to pay without pretending scheduled payment is money movement.

### Existing-system gate

- [ ] Re-audit payment terms, bill due-date fields, reminder/schedule primitives and existing calendars/approvals.
- [ ] Produce F3D delta matrix and reuse/extend available scheduling primitives where their semantics match.

### Domain/UI/tests

- [ ] `scheduled_payment_date` distinct from `due_date`, posting/paid time and `cleared_at`.
- [ ] Schedule references bill/payable.
- [ ] Multiple planned installments without fixed numbered columns.
- [ ] Validation prevents impossible plans where applicable.
- [ ] Schedule has no account-balance effect.
- [ ] Actual payment can satisfy/link a schedule deterministically.
- [ ] Reschedule/cancel audited.
- [ ] List/calendar/table with due soon, overdue, scheduled, paid/completed.
- [ ] `Pay now` hands off to canonical F3C payment flow.
- [ ] Scheduling/rescheduling/cancel and actual-payment reconciliation tests.
- [ ] Admin UI audit.

**Exit:** Modulex distinguishes due, planned-to-pay, actually paid and bank-cleared dates/states.

---

## A6-F3E — Purchasing / AP Integration

Goal: bridge existing procurement source documents to AP without merging or copying ownership.

### Existing-system gate

- [ ] Inventory current PO, receiving, vendor-catalog, freight/additional-cost and landed-cost models.
- [ ] Inventory existing links from orders/projects/products to procurement.
- [ ] Produce F3E delta matrix.
- [ ] Prefer `BRIDGE/EXTEND`; do not rebuild purchasing inside Finance.

### Integration/UI/tests

- [ ] PO links canonical Vendor/Supplier.
- [ ] Vendor bill references purchasing source records according to existing PO model.
- [ ] PO/SKU/quantity remain Purchasing truth.
- [ ] Freight/additional cost stays in correct procurement/cost model.
- [ ] Vendor payable stays AP truth.
- [ ] Actual payment stays Finance transaction truth.
- [ ] Selling price/margin stays Sales/Pricing/Reporting truth.
- [ ] No manually duplicated payable/payment totals on PO rows.
- [ ] Define bill vs PO/receipt variance behavior explicitly.
- [ ] Extend existing PO detail with AP state where useful; extend bill detail with PO context.
- [ ] Permission-safe cross-domain navigation.
- [ ] PO remains optional for general vendor bill.
- [ ] PO edits/deletes cannot corrupt posted AP/Finance history.
- [ ] Cross-domain RBAC tests + Admin UI audit.

**Exit:** `PO → Vendor Bill → Payment Allocation → Finance Transaction` is linked, while each existing domain retains one authoritative truth.

---

## A6-F3F — AP Aging & Vendor Financial Projection

Goal: project AP from canonical bills/payments/schedules rather than create a separate balance ledger.

### Existing-system gate

- [ ] Re-audit current reporting/read-model infrastructure and Vendor detail surfaces.
- [ ] Produce F3F delta matrix.
- [ ] Reuse existing pagination/filter/report patterns.

### Read models/UI/exit

- [ ] Open AP total.
- [ ] Vendor outstanding balance.
- [ ] Bill status/outstanding.
- [ ] Due soon/overdue/AP aging buckets.
- [ ] Vendor payment history.
- [ ] Scheduled payments projection.
- [ ] Outstanding/cleared check views.
- [ ] Main-currency totals use stored Finance FX snapshots.
- [ ] AP Aging page/view and Vendor detail summary.
- [ ] Drill-down to canonical source documents/transactions.
- [ ] Admin UI audit.

**Exit:** AP totals reconcile directly to canonical bills, allocations, schedules and Finance transactions with no manually maintained duplicate balance.

---

## A6-F4 — Payroll & Contractor Finance Integration

Goal: extend the **existing HR-backed Finance integration** so actual employee/contractor money movement is complete while HR remains payroll/compensation truth.

### F4 existing-system delta audit — REQUIRED FIRST

- [ ] Re-audit current HR payroll/advance flows and current Finance Employee payment flow.
- [ ] Re-audit `/finance/payroll` → HR `PayrollManager` and `/finance/compensation` → HR `CompensationManager` behavior.
- [ ] Re-audit current Finance Employee/Payroll lookup/link/posting behavior.
- [ ] Produce F4 delta matrix.
- [ ] Do not rebuild payroll period/run/item calculation or basic Employee Finance payment linkage already present.

### F4 tasks/UI/tests

- [ ] Keep payroll period/run/item calculations in HR.
- [ ] Extend approved/paid transitions to create/link Finance obligations/payments where not already complete.
- [ ] Reuse canonical Finance accounts/transactions for salary payments.
- [ ] Bridge advances, deductions/reimbursements where they cause money movement.
- [ ] Employer costs only from explicit HR truth.
- [ ] Employee required for employee-level payments; Project/Order attribution optional.
- [ ] Contractor identity uses canonical entity/mapping; no duplicate vendor/employee identities.
- [ ] Contractor W9/COI remains vendor/contractor compliance, not Finance transaction data.
- [ ] Extend existing Finance/HR screens instead of cloning calculation UI.
- [ ] HR screens expose resulting Finance references where useful.
- [ ] Retry cannot double-post payroll payment.
- [ ] Finance permission cannot mutate unrelated HR master data.
- [ ] Reversal preserves append-safe Finance history.
- [ ] Optional allocations reconcile.
- [ ] Admin UI audit on modified surfaces.

**Exit:** paid payroll/employee/contractor money events reconcile to Finance while existing HR models remain the sole calculation source.

---

## A6-F5 — Sales / Accounts Receivable Integration

Goal: bridge and extend **existing** customer invoices and Project payment history into Finance Core without destructive rewrite.

### F5 existing-system delta audit — REQUIRED FIRST

- [ ] Re-audit production `customer_invoices` and current invoice UI/RPCs.
- [ ] Re-audit Project payment requirements/transactions/allocations/RPCs and current compatibility exception.
- [ ] Re-audit whether customer receipt Finance linking already exists.
- [ ] Produce F5 delta matrix.
- [ ] Existing IDs/history are preservation constraints, not migration conveniences.

### F5 tasks/UI/tests

- [ ] Preserve customer invoice IDs/history.
- [ ] Preserve Project payment requirements/transactions/allocations during transition.
- [ ] Reuse/extend canonical `customer_receipt` Finance transactions.
- [ ] Customer required; Invoice/Order/Project links according to business context.
- [ ] Partial/full payment allocation.
- [ ] Derive paid/outstanding/status from authoritative allocations/postings; no parallel manual truth.
- [ ] Link/reconcile existing Project payment records to Finance without double-posting money.
- [ ] Retire/narrow legacy Project-payment posted-edit/hard-delete only through separate reviewed migration.
- [ ] Preserve currency/FX snapshots.
- [ ] Refund/reversal reconciles AR.
- [ ] Extend existing invoice/Project payment pages before creating duplicate screens.
- [ ] Customer payment history/balance and AR Aging.
- [ ] Standalone and Project-linked receipt tests.
- [ ] Partial/full/refund/reversal reconciliation.
- [ ] Legacy IDs/history preservation.
- [ ] Retry cannot double-receive payment.
- [ ] Cross-domain RBAC + Admin UI audit.

**Exit:** existing customer/Project payment systems reconcile to Finance, AR derives from authoritative allocations/postings, and live history is preserved.

---

## A6-F6 — Reporting & Profitability Projection

Goal: extend existing reporting infrastructure to project canonical Finance/source-domain truth; do not create report-only editable totals.

### F6 existing-system delta audit — REQUIRED FIRST

- [ ] Inventory current `/reports`, Finance Overview, Project financial rollups, pricing/cost-margin and vendor/customer summary read models.
- [ ] Inventory existing query/pagination/export patterns.
- [ ] Produce F6 delta matrix.
- [ ] Reuse/extend existing reports where semantics match instead of creating duplicate reports with new names.

### F6 required Finance reporting coverage

- [ ] Finance Overview KPIs.
- [ ] Cash Flow.
- [ ] Income vs Expense.
- [ ] Financial Account Balances/Movements.
- [ ] Expense by Category/Vendor/Project/Order.
- [ ] AP Aging, Vendor Balance, Vendor Payment History.
- [ ] Scheduled Payments.
- [ ] Outstanding/Cleared Checks.
- [ ] AR Aging, Customer Balance, Customer Payment History.
- [ ] Project Financial Summary and profitability inputs/projection.
- [ ] Order profitability inputs/projection where supported.

### F6 reporting/UI rules

- [ ] Posted Finance state drives actual money movement reporting.
- [ ] Scheduled entries are forecasts, not actual cash.
- [ ] Outstanding checks remain distinguishable from cleared bank movement.
- [ ] Historical cross-currency totals use stored snapshots.
- [ ] Totals drill down to canonical records.
- [ ] Project/Order reports consume allocations rather than own duplicate transactions.
- [ ] Procurement landed cost and Sales/Pricing values join from source domains.
- [ ] Date/timezone/main-currency rules deterministic/tested.
- [ ] Shared filters, server-side pagination/aggregation and permission-safe drilldowns.
- [ ] Export, if present, uses same authoritative semantics.
- [ ] Admin UI audit.

**Exit:** Finance/AP/AR/account/Project/Order reports reconcile to existing canonical records with no report-only source of truth.

---

## A6-F7 — Hardening & Production Acceptance

Goal: prove the integrated Finance domain is safe, reconcilable and operable. F7 is not a rewrite package.

### F7 existing-system completeness audit — REQUIRED FIRST

- [ ] Re-run section 0A across F1–F6 and flag any accidental duplicate sources/routes/RPCs.
- [ ] Confirm every `NEW` primitive has documented absence evidence and ownership.
- [ ] Confirm every legacy path has an explicit keep/bridge/deprecate disposition.
- [ ] Remove/deprecate redundant paths only when migration evidence proves safety.

### F7 security / authorization

- [ ] Full Finance RLS/RPC/grants review.
- [ ] Public mutation RPC/private-core authorization review.
- [ ] No unexpected authenticated direct-table write path to protected Finance history.
- [ ] RBAC matrix for Finance and source-domain permissions.
- [ ] Cross-domain escalation tests.
- [ ] Security Advisor review/disposition.

### F7 data integrity

- [ ] Idempotency/concurrency tests.
- [ ] Draft/post/void/reversal tests.
- [ ] Check transition tests.
- [ ] AP/AR payment allocation reconciliation.
- [ ] Multi-project allocation reconciliation.
- [ ] FX snapshot/manual-rate tests.
- [ ] Inactive historical dimension references.
- [ ] Vendor mapping review.
- [ ] Migration/backfill counts/sums reconciled before/after.

### F7 performance/UI/release

- [ ] Query/index review for transactions, bills, allocations, schedules, instruments and reports.
- [ ] Pagination/filter contracts; no obvious N+1/unbounded fetches.
- [ ] Performance Advisor review/disposition.
- [ ] Full Finance route audit against `AdminUICheck.md`.
- [ ] Modified Vendor/Purchasing/Personnel/Customer/Project/Order surfaces re-audited.
- [ ] Resolution matrix/light-dark/loading-empty-error-retry/accessibility/RBAC.
- [ ] Signed-in production acceptance.
- [ ] Unit/contract/integration/E2E tests as applicable.
- [ ] Typecheck, lint, production build.
- [ ] Migration order and production rollout verified.
- [ ] Production smoke + reporting reconciliation.
- [ ] Recovery notes for risky rollout steps.
- [ ] Final docs updated.

**Exit:** integrated Finance passes no-duplication, security, integrity, UI, CI, migration, production smoke and reconciliation gates.

---

## 8. Cross-package test matrix

Every package extends the applicable existing tests before adding isolated parallel suites.

| Concern | Required evidence |
| --- | --- |
| Existing-system delta | current asset inventory + REUSE/EXTEND/BRIDGE/MIGRATE/DEPRECATE/NEW decision |
| No duplication | no parallel source of truth/RPC/route/component for equivalent canonical behavior |
| Authentication | anonymous/non-authenticated mutation rejected |
| Authorization | view/manage/source-domain permission boundaries |
| Lifecycle | draft/post/void/reverse allowed/denied transitions |
| Idempotency | retried mutation does not duplicate financial effect |
| Concurrency | competing mutations do not over-allocate/double-settle |
| Currency | same currency, FX snapshot, manual/agreed rate |
| Allocation | zero/one/multi attribution and amount reconciliation |
| Historical integrity | posted history remains readable with inactive dimensions |
| AP | partial/full payment, outstanding, due/aging |
| Checks | issued/cleared/voided/returned transition correctness |
| Schedule | planned payment has no actual cash effect |
| AR | partial/full receipt, outstanding, refund/reversal |
| Cross-domain | Finance cannot silently widen HR/Project/Customer/Vendor permissions |
| UI | AdminUICheck theme/responsive/states/accessibility/RBAC |
| Regression | source-domain legacy paths remain compatible until deliberately migrated |
| Build | fresh typecheck/lint/production build according to repo contract |

---

## 9. Data migration and backfill rules

- Re-read production immediately before each migration/backfill; F0 row counts are historical evidence, not permanent assumptions.
- Inventory current schema before creating a new table/column/RPC; previous absence is not permanent proof.
- Prefer extending canonical structures over parallel replacements.
- Prefer additive schema + deterministic backfill + verification + later cleanup over destructive replacement.
- Never map free-text vendor names automatically when identity is ambiguous; create explicit mapping/review.
- Preserve legacy source IDs/references where needed for traceability and rollback.
- Backfills must be idempotent or safely rerunnable.
- Record pre/post counts, sums and unresolved rows.
- Do not convert historical document rows into posted Finance money movement unless the event can be proven/reconciled.
- Do not create artificial Project/Order links.
- Historical currency values must not be recomputed from a current FX rate.
- Constraint tightening occurs only after data verification proves compatibility.
- Do not delete a legacy source immediately after bridging; deprecation/removal requires explicit migration acceptance.

---

## 10. Reconciliation rules

### Finance account reconciliation

`opening balance + posted inflows - posted outflows ± valid reversals = closing operational balance`

Instrument clearing is tracked separately where an issued check has not yet cleared.

### AP reconciliation

`bill authoritative total - valid payment allocations ± valid reversals/refunds = outstanding balance`

Aggregate vendor open balance equals open bill balances subject only to explicitly supported unapplied credits/payments.

### AR reconciliation

`invoice authoritative total - valid receipt allocations ± refunds/reversals = outstanding balance`

### Project/Order allocation reconciliation

- Allocation totals cannot exceed authoritative Finance transaction/document amount.
- Project/Order summaries are projections of links/allocations, not manually editable totals.

### Existing-source reconciliation

For every bridge/migration:

- [ ] source IDs/counts identified;
- [ ] canonical destination/link counts identified;
- [ ] monetary totals reconcile;
- [ ] unresolved/ambiguous records explicitly listed;
- [ ] no duplicate posting caused by bridge/backfill;
- [ ] old supported read path remains correct until deliberate deprecation.

---

## 11. Definition of Done for every implementation package

A package is `COMPLETE` only when all applicable items are true:

- [ ] Existing-system inventory completed immediately before implementation.
- [ ] Package delta matrix recorded.
- [ ] Every new primitive justified; reusable canonical assets reused/extended/bridged instead.
- [ ] Scope implemented without violating `FINANCE_DOMAIN_PLAN.md`.
- [ ] No parallel source of truth introduced.
- [ ] Existing production IDs/history/behavior preserved or explicitly migrated with reconciliation.
- [ ] Schema/migration reviewed against current production state.
- [ ] RLS/RPC/RBAC boundary verified.
- [ ] Audit/lifecycle/idempotency behavior verified.
- [ ] Domain reconciliation tests pass.
- [ ] Existing compatibility/regression tests pass.
- [ ] UI meets `AdminUICheck.md` for changed surfaces.
- [ ] Fresh typecheck/lint/build gates required by repo pass.
- [ ] PR/merge state recorded if a PR is used.
- [ ] Production migration/deployment state recorded if applicable.
- [ ] Production smoke/reconciliation recorded when production changed.
- [ ] This `financefinal.md` progress board/package checklist/work log updated.
- [ ] Next executable package named.

---

## 12. Rollout strategy

Use small vertical packages instead of one Finance mega-PR.

Recommended sequence:

1. A6-F1 Finance Core/Cash & Bank — **COMPLETE / VERIFIED 2026-09-05**.
2. A6-F2 Expenses — bridge existing `company_expenses`.
3. A6-F3A Vendor/Supplier + Compliance — re-check canonical entity first.
4. A6-F3B Vendor Bills — re-check AP primitives first.
5. A6-F3C Vendor Payments + Check Lifecycle — reuse Finance Core + `payment_methods`.
6. A6-F3D Payment Schedule.
7. A6-F3E Purchasing/AP linkage — bridge existing Purchasing.
8. A6-F3F AP Aging/Vendor projection.
9. A6-F4 Payroll/Contractor — extend existing HR/Finance integration.
10. A6-F5 Customer AR — bridge existing invoices/Project payments.
11. A6-F6 Reporting/profitability — extend existing report/read models.
12. A6-F7 hardening/no-duplication/production acceptance.

For each package:

`read current main + production → inventory existing assets → delta matrix → lock compatibility plan → tests/implementation → fresh CI → review/PR → merge → production rollout if needed → smoke/reconcile → update financefinal.md`

Do not start the next package merely because code exists; use the prior package exit gate.

---

## 13. Explicit decisions recorded by this plan

| Decision | Status | Reason |
| --- | --- | --- |
| Existing-system-first before every package | **LOCKED** | Prevent duplicate tables/RPCs/routes/sources and repeated work |
| `NEW` only after current-state absence evidence | **LOCKED** | Prior plans/baselines can become stale |
| Preserve/extend existing F1 Finance Core | **LOCKED / F1 VERIFIED** | F1 is deployed and closed; later work builds on it |
| Existing HR payroll/compensation remains canonical | **LOCKED** | Finance routes already project HR managers; no second payroll model |
| Existing `company_expenses` is bridged/migrated, not casually replaced | **LOCKED** | Existing source model must not become duplicate history |
| Existing customer invoices/Project payments are preserved and integrated | **LOCKED** | Live IDs/history and compatibility exist |
| Existing `payment_methods` is canonical | **LOCKED** | No AP/Finance free-text duplicate |
| Finance remains first-class; Project is attribution | **LOCKED** | Required by Finance domain contract |
| Source documents stay separate from money movement | **LOCKED** | Prevent invoice/PO/check/payment truth collapse |
| Check lifecycle child/instrument direction | **ACCEPTED, SUBJECT TO CURRENT-STATE RECHECK** | Add only if no canonical instrument model exists at F3C |
| `scheduled_payment_date` distinct from due/paid/cleared | **ACCEPTED** | Required for payment planning/cash forecast semantics |
| W9/COI belongs to Vendor/Contractor compliance | **ACCEPTED** | Compliance is counterparty/document state |
| Vendor bills support partial payments via allocations | **ACCEPTED** | Real operational installment requirement |
| PO → Bill → Payment → Finance without domain collapse | **ACCEPTED** | Preserves procurement/AP/ledger ownership |
| One ledger/instrument model across years | **ACCEPTED** | Annual spreadsheet tabs are presentation only |
| No compliance hard-block without approved policy | **LOCKED SAFE DEFAULT** | Do not invent payment-stopping business rules |
| No full statutory GL in this roadmap | **DEFERRED / NON-GOAL** | Operational Finance first |
| Bank feeds/tax filing/external accounting integrations | **DEFERRED** | Require explicit future requirements |

---

## 14. Risk register

| Risk | Control |
| --- | --- |
| Rebuilding an existing Finance feature | Mandatory section 0A inventory + delta matrix |
| Parallel source of truth | `NEW` evidence gate + Definition of Done no-duplication check |
| Stale baseline causes duplicate schema | Re-read current `main` + production before every package |
| Duplicate Vendor/Supplier identities | Canonical master + explicit mapping/dedupe review |
| Double-posting from legacy Project/customer payment flows | Bridge/reconciliation + idempotency + staged F5 integration |
| Payroll duplicated into Finance | HR remains source; existing HR-backed Finance routes are extended only |
| Posted history silently edited | Private mutation core + lifecycle constraints + reversal model |
| Outstanding checks mistaken for cleared cash | Separate instrument lifecycle and clearing state |
| Payment schedule mistaken for actual cash | Schedule has no ledger effect until payment posts |
| Incorrect historical FX | Stored transaction-time snapshot |
| Multi-project allocation drift | Authoritative source total + deterministic validation |
| Procurement and AP duplicate truth | Explicit domain ownership + links, no copied editable totals |
| Expired W9/COI unexpectedly blocks operations | Warning default; hard block requires approved policy |
| Permission regression | Cross-domain RBAC tests + RPC/RLS review |
| Large reporting queries degrade Admin | Indexed server-side filtering/pagination + performance review |
| Backfill changes historical meaning | Additive migrations + before/after reconciliation + fail closed on ambiguity |

---

## 15. Deferred decisions — resolve only when their package starts

Resolve these from **current execution-time evidence**, not from assumptions in this document:

- Final physical Vendor/Supplier table choice/name.
- Exact Vendor entity reuse vs extension.
- Final payment-instrument table/model name or whether a suitable current model already exists.
- Whether one vendor payment may be intentionally unapplied/on-account.
- Exact AP aging bucket ranges.
- Exact bill approval workflow beyond canonical lifecycle.
- Exact PO-vs-bill variance approval thresholds.
- Whether missing/expired compliance ever hard-blocks payment.
- External accounting export/integration requirements.
- Full statutory chart-of-accounts/double-entry scope.

---

## 16. Work log

### 2026-09-05 — A6-F1 closeout completed

- Verified merged F1 lineage: PR #287 Finance Core/Cash & Bank, PR #298 Employee payment linkage, PR #302 Payroll settlement reconciliation.
- Verified current `main` baseline `9d0d3b401381a86774c7d70c4416a2318c26efd0` and confirmed no Finance runtime file changed after merged payroll reconciliation `6e0b9619b3df05e8e8ae2588a4a9f4fda95f2386`; subsequent compared changes were other domains plus this Finance plan.
- Verified production migrations `a6_finance_core`, `a6_finance_core_hardening`, `a6_finance_employee_payments`, `a6_payroll_finance_reconciliation` are applied.
- Verified production Finance tables, public RPCs, private authorization/validation cores, RLS/grants and lifecycle triggers are present.
- Verified public Finance RPCs use the intended authenticated SECURITY DEFINER wrapper pattern with anonymous execute revoked; private mutation cores are not authenticated-executable.
- Verified production invariants with zero failures for orphan links/audit/idempotency, malformed reversals, snapshot-state errors, over-allocation and Employee payment linkage.
- Verified posted/voided immutability, append-only audit/idempotency, link validation and payroll reconciliation guards from production function/trigger definitions.
- Verified transaction-time FX behavior from production posting core: same-currency identity, explicit manual-rate source, or latest eligible saved observation at/before transaction time.
- Verified Finance-specific CI GREEN on run `33879439467` and current-main Admin UI/typecheck/lint/build GREEN on run `33927578897`.
- Verified merged F1/payroll reconciliation production deployment `6e0b9619...` is Vercel `READY` and therefore F1 runtime is in the production deployment lineage.
- Reviewed Supabase Security and Performance Advisor results. No F1-blocking defect was found; intentional wrapper/internal-table warnings are documented and performance INFO findings remain subject to the F7 realistic-data index review.
- F1 required no new code, DDL or production mutation during closeout. The correct action was verification, not reimplementation.
- Marked A6-F1 **COMPLETE / VERIFIED 2026-09-05** and advanced the plan to A6-F2 existing-system delta audit.

### 2026-09-05 — Existing-system-first rule added

- Rechecked the prior F0 baseline and current Finance source surfaces before refining this plan.
- Confirmed current F1 source already includes Finance Overview, Accounts and Transactions routes/components plus canonical client operations for accounts, categories, FX, transaction draft/update/delete, links, posting, void and reversal.
- Confirmed current Finance Transactions flow already contains Employee/Payroll lookup/link support; F4 must extend/bridge it rather than rebuild the basic capability.
- Confirmed `/finance/payroll` renders the existing HR `PayrollManager` and `/finance/compensation` renders the existing HR `CompensationManager`; no duplicate Finance payroll/compensation engine will be created.
- Preserved F0 decisions that `company_expenses`, customer invoices, Project payment history, HR payroll/advances and shared `payment_methods` are existing systems to bridge/reuse/extend.
- Added the mandatory `REUSE / EXTEND / BRIDGE / MIGRATE / DEPRECATE / NEW` delta classification gate for every remaining package.
- Locked `NEW` behind current-main + production absence evidence.
- Changed F1 wording to explicit **closeout/gap-fix only**, not reimplementation.
- No Finance schema, application behavior, production data or UI behavior was changed by this documentation update.

### 2026-09-05 — Final implementation plan created

- Created `modulex-admin/financefinal.md` as the living Finance execution tracker.
- Preserved the locked `FINANCE_DOMAIN_PLAN.md` ownership/lifecycle/currency/allocation/security rules.
- Adopted `AdminUICheck.md` as the mandatory UI acceptance contract.
- Added Excel-derived requirements: check clearing lifecycle, scheduled payments, vendor compliance documents, canonical payment methods, partial payments, counterparty normalization and Procurement → AP linkage.
- Expanded A6-F3 into executable AP sub-packages without changing the required F0→F7 architecture order.
- No Finance schema, application code, production data or UI behavior was changed by that planning package.

### Next

**A6-F2 Expenses — inventory the existing `company_expenses` domain and all reusable Finance/payment/UI primitives, produce the F2 delta matrix, then implement only proven gaps.**