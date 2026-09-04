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

## 1. Current progress board

| Package | Scope | Status | Exit dependency |
| --- | --- | --- | --- |
| A6-F0 | Baseline & architecture contract | **COMPLETE / APPROVED 2026-09-04** | — |
| A6-F1 | Finance Core + Cash/Bank | **ACTIVE / SOURCE IMPLEMENTATION COMPLETE / FRESH CI PENDING** | Fresh CI + required verification + rollout gate |
| A6-F2 | Expenses | **NOT STARTED** | F1 closure |
| A6-F3A | Vendor/Supplier Master + Compliance | **NOT STARTED** | F2 + canonical counterparty decision |
| A6-F3B | Vendor Bills / AP Core | **NOT STARTED** | F3A |
| A6-F3C | Vendor Payments + Check Lifecycle | **NOT STARTED** | F3B |
| A6-F3D | Payment Schedule | **NOT STARTED** | F3B/F3C primitives |
| A6-F3E | Purchasing / AP Integration | **NOT STARTED** | F3B/F3C |
| A6-F3F | AP Aging & Vendor Financial Projection | **NOT STARTED** | F3B–F3E |
| A6-F4 | Payroll / Contractor Finance Integration | **NOT STARTED** | F3 stable |
| A6-F5 | Sales / AR Integration | **NOT STARTED** | F4 stable |
| A6-F6 | Reporting & Profitability Projection | **NOT STARTED** | F2–F5 integrated |
| A6-F7 | Hardening & Production Acceptance | **NOT STARTED** | F1–F6 complete |

### Next executable package

**A6-F1 closeout.** Do not begin F2 until fresh Finance contract/RBAC/UI/typecheck/lint/build verification is recorded and the F1 production rollout state is explicitly known.

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

- `issued`
- `cleared`
- `voided`
- `returned`

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

Do not reproduce separate `CHECKS 2024`, `CHECK 2025`, `CHECK 2026` structures. Use one canonical ledger/instrument model and filter/report by date/year.

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

Final sidebar naming may follow existing navigation conventions, but the functional surfaces below must exist by completion.

### Finance

- `/finance` — Overview
- `/finance/transactions` — Transactions
- `/finance/accounts` — Cash & Bank / Financial Accounts
- `/finance/expenses` — Expenses
- Accounts Payable
  - Vendor Bills
  - Vendor Payments
  - Payment Schedule
  - AP Aging
- Accounts Receivable
  - Customer Invoices
  - Customer Payments
  - AR Aging
- Finance-linked Payroll/Compensation entry points remain integration views, not duplicate HR data models.
- Settings/configuration entry points where appropriate:
  - Financial Accounts
  - Finance Categories
  - Payment Methods

### Vendor/Supplier detail target surfaces

The canonical Vendor/Supplier entity should be able to expose, either as tabs or equivalent sections:

- Overview
- Contacts
- Documents / Compliance
- Purchases
- Bills / Invoices
- Payments
- Balance / open AP summary

### Project / Order projections

Do not create a second Finance ledger inside Projects or Orders. Their detail pages may display:

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

Finance tables/forms/modals must respect the shared Admin shell and components rather than adding one-off layout fixes.

Required responsive verification matrix where applicable:

- 360
- 390
- 768
- 1024
- 1280
- 1366
- 1440
- 1536
- 1920
- 2560

Additional expectations:

- `lg = 1024px` remains the shared desktop/mobile shell boundary unless the central UI contract changes.
- Data-heavy Finance tables use the shared table viewport/overflow system.
- Loading/empty/populated states preserve table structure.
- Shared design tokens/components are used for buttons, inputs, dropdowns, modal, checkbox/switch, cards, focus and semantic status UI.
- Desktop expanded/collapsed sidebar and mobile open/closed navigation states must not break Finance pages.

A Finance package is not UI-complete until its relevant `AdminUICheck.md` acceptance items have fresh evidence.

---

# 7. Detailed delivery plan

## A6-F1 — Finance Core + Cash/Bank closeout

Current state: **ACTIVE / SOURCE IMPLEMENTATION COMPLETE / FRESH CI PENDING**.

Existing route surface on current `main` includes:

- `/finance`
- `/finance/accounts`
- `/finance/transactions`
- `/finance/payroll`
- `/finance/compensation`

### F1 closeout tasks

- [ ] Re-read current `main` and open PRs before any follow-up implementation.
- [ ] Run fresh Finance contract tests.
- [ ] Run fresh Finance RBAC/production-surface tests.
- [ ] Run typecheck.
- [ ] Run package/repo lint required by current CI contract.
- [ ] Run production build.
- [ ] Verify Finance Overview, Transactions and Accounts/Cash & Bank UI against `AdminUICheck.md`.
- [ ] Verify create/post/void/reverse/draft-delete lifecycle boundaries.
- [ ] Verify idempotency behavior for retryable mutations.
- [ ] Verify inactive historical account/category records do not prevent audit/void/reversal history.
- [ ] Verify FX snapshot behavior for same-currency, market-FX and manual/agreed-FX scenarios.
- [ ] Record migration/production rollout state explicitly.
- [ ] Update this file with CI/PR/deploy evidence.

### F1 exit

A generic expense-like transaction, deposit/withdrawal and account transfer can exist without Project/Order ownership, preserve Finance audit/lifecycle rules, pass fresh CI/UI verification, and have an explicitly recorded production rollout state.

---

## A6-F2 — Expenses

Goal: make operational company/project-attributable expenses use Finance Core without losing the existing `company_expenses` compatibility/history.

### F2 data/domain work

- [ ] Re-audit current production `company_expenses` immediately before migration design.
- [ ] Define bridge/backfill strategy; do not destructively replace historical rows.
- [ ] Finalize controlled expense category relationship.
- [ ] Require/resolve financial account at posting time.
- [ ] Use canonical `payment_methods` relationship where a payment method applies.
- [ ] Add document/reference/attachment relationship without mixing binary/document state into the ledger.
- [ ] Define expense statuses and their mapping to Finance draft/posted/void/reversal behavior.
- [ ] Support optional Vendor, Employee, Project, Order and Customer context only when relevant.
- [ ] Support multi-project/order allocation through the Finance link/allocation model.
- [ ] Preserve transaction currency and FX snapshot semantics.
- [ ] Add/extend audit and idempotent mutation contracts.

### F2 UI

- [ ] `/finance/expenses` list.
- [ ] Expense create flow.
- [ ] Expense detail.
- [ ] Draft edit/delete.
- [ ] Post/pay action as appropriate.
- [ ] Void/reversal flow.
- [ ] Filters: status, date, category, account, vendor, project/order, employee, currency as supported.
- [ ] Clear allocation UI when one expense is split across projects/orders.
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

### F2 exit

Office rent, utilities, fuel, employee reimbursement and project-attributable expenses use one audited Finance money-movement boundary with no required Project ownership and no lost legacy history.

---

## A6-F3A — Canonical Vendor/Supplier Master + Compliance

Goal: establish the AP counterparty identity before building bills/payments on top of ambiguous free-text vendors.

### F3A domain/data

- [ ] Re-audit existing Vendor Catalog/integration identities and any business counterparty candidates.
- [ ] Select/reuse the canonical Vendor/Supplier master; do not accidentally treat Vendor Catalog codes as AP identity.
- [ ] Define vendor status/activation rules without breaking historical AP references.
- [ ] Define duplicate detection/mapping strategy for imported legacy payee/vendor names.
- [ ] Define contacts/remittance/business details required by AP.
- [ ] Add vendor compliance document model or reuse an existing canonical document framework.
- [ ] Supported compliance types initially: W9, COI, LICENSE, OTHER unless current domain conventions dictate different canonical values.
- [ ] Compliance metadata supports issued/expiry/status/verification information as applicable.
- [ ] Compliance warning behavior defined.
- [ ] Do **not** create a hard payment block for expired/missing compliance without explicit approved policy.

### F3A UI

- [ ] Vendor list supports canonical identity/status/search.
- [ ] Vendor detail Overview.
- [ ] Vendor Contacts.
- [ ] Vendor Documents / Compliance.
- [ ] Compliance missing/expired warning states.
- [ ] Finance/AP summary placeholders only when backed by real data; no dead tabs/actions.
- [ ] Admin UI audit per section 6.

### F3A tests

- [ ] Canonical vendor identity cannot be bypassed with arbitrary AP free text when FK is required.
- [ ] Duplicate/import mapping tests.
- [ ] Historical inactive vendor references remain readable.
- [ ] Document expiry/status/permission tests.
- [ ] Finance permission does not silently grant unrelated vendor-master mutation authority unless explicitly intended.

### F3A exit

There is one deliberate canonical AP Vendor/Supplier identity usable by future bills/payments, with compliance documents modeled outside Finance transactions.

---

## A6-F3B — Vendor Bills / AP Core

Goal: create the payable source-document layer while keeping actual money movement in Finance Core.

### F3B schema/domain

- [ ] Vendor bill header model.
- [ ] Vendor bill line model where line-level detail is required.
- [ ] Canonical vendor FK.
- [ ] Bill number/reference and duplicate protection rules.
- [ ] Bill date.
- [ ] `due_date`.
- [ ] Transaction/document currency.
- [ ] Main-currency projection/snapshot rules consistent with Finance architecture.
- [ ] Status model: draft/open/partially paid/paid/void or equivalent canonical vocabulary.
- [ ] Optional Project/Order/PO attribution without universal ownership.
- [ ] Payment allocation model: one bill can receive N payments.
- [ ] Outstanding balance derived from authoritative bill total minus valid payment allocations; no independent manually editable running balance.
- [ ] Overpayment rules fail closed unless an explicit supported use case exists.
- [ ] Bill attachment/source-document relationship.
- [ ] Audit and idempotency rules.

### F3B UI

- [ ] Vendor Bills list.
- [ ] Bill create/edit draft flow.
- [ ] Bill detail.
- [ ] Bill lines.
- [ ] Due/status/outstanding presentation.
- [ ] Linked Vendor, PO, Project/Order context.
- [ ] Payment allocation history section.
- [ ] Filters: vendor, status, due range, project/order, PO, currency.
- [ ] Admin UI audit per section 6.

### F3B tests

- [ ] Bill can exist without Project/Order.
- [ ] Bill can link to one Project/Order.
- [ ] Bill can support allocation across Projects/Orders where business allocation is required.
- [ ] Partial payment leaves correct outstanding.
- [ ] Full payment closes bill.
- [ ] Duplicate bill protection works according to canonical rules.
- [ ] Unauthorized AP mutations denied.
- [ ] FX/history semantics preserved.

### F3B exit

A vendor bill can exist independently of a Project, optionally carry Project/Order/PO attribution, accept partial payments through allocations, and derive a reconciled outstanding balance.

---

## A6-F3C — Vendor Payments + Check / Payment Instrument Lifecycle

Goal: connect AP settlement to real Finance money movement and explicitly support checks.

### F3C payment model

- [ ] Vendor payment creates or links the canonical `vendor_payment` Finance transaction.
- [ ] Payment links to canonical Vendor/Supplier.
- [ ] Payment uses canonical `payment_methods` FK; no new free-text method field.
- [ ] One payment may allocate across one or more vendor bills when supported.
- [ ] One bill may receive multiple payments.
- [ ] Unapplied vendor payment behavior must be explicitly supported or fail closed; do not invent silent balance behavior.
- [ ] Account/source of funds is explicit.
- [ ] Currency/FX handling follows Finance Core.
- [ ] Posting and idempotency follow Finance Core.

### F3C payment instrument model

Preferred child model direction: `finance_payment_instruments` or equivalent.

Required semantics:

- [ ] `transaction_id` / canonical Finance transaction link.
- [ ] `payment_method_id` where required by model.
- [ ] instrument type.
- [ ] check/instrument number.
- [ ] `issued_at`.
- [ ] `cleared_at`.
- [ ] `voided_at` when applicable.
- [ ] bank/financial account reference.
- [ ] status (`issued`, `cleared`, `voided`, `returned` initially).
- [ ] reference/notes.
- [ ] check number uniqueness rule scoped appropriately to financial account/instrument type.
- [ ] state-transition validation and audit.

### F3C lifecycle rules

- [ ] Posting a check payment does not falsely mark the bank instrument `cleared`.
- [ ] Clearing is a separate auditable action/state transition.
- [ ] Void before clearing follows safe lifecycle rules.
- [ ] Returned check behavior restores/reverses financial/AP effect according to approved transaction semantics; no silent status-only correction.
- [ ] Already-cleared instruments cannot be casually edited/renumbered.
- [ ] Historical check data remains queryable by year/account/vendor without annual tables.

### F3C UI

- [ ] Vendor Payments list.
- [ ] Record/pay vendor bill flow.
- [ ] Allocate payment across bills.
- [ ] Payment detail.
- [ ] Check/instrument fields appear conditionally for relevant payment methods.
- [ ] Mark/record cleared action.
- [ ] Void/returned workflow with reason.
- [ ] Outstanding Checks filter/view.
- [ ] Cleared Checks filter/view.
- [ ] Search by check number/vendor/reference.
- [ ] Admin UI audit per section 6.

### F3C tests

- [ ] Cash/wire/non-check payment does not require check fields.
- [ ] Check payment requires relevant instrument fields.
- [ ] Issued → cleared valid transition.
- [ ] Issued → voided valid transition when safe.
- [ ] Invalid cleared/voided/returned transitions fail closed.
- [ ] Partial payment allocation reconciliation.
- [ ] Multi-bill payment allocation reconciliation if supported.
- [ ] Duplicate/retried posting does not double-pay.
- [ ] Unauthorized clearing/void/reversal denied.

### F3C exit

Vendor payments settle AP through canonical Finance transactions, use canonical payment methods, and checks have a real issued/cleared/voided/returned lifecycle distinct from posting status.

---

## A6-F3D — Payment Schedule

Goal: model the operational intent to pay without pretending a scheduled payment is already money movement.

### F3D domain

- [ ] `scheduled_payment_date` is separate from bill `due_date`, Finance `paid_at`/posting time and instrument `cleared_at`.
- [ ] Schedule can reference a vendor bill/payable.
- [ ] Support one or multiple planned installments without fixed numbered columns.
- [ ] Scheduled total/outstanding validation prevents impossible plans when applicable.
- [ ] A schedule entry does not affect cash/account balance before actual posting.
- [ ] Actual payment can satisfy/link a scheduled entry deterministically.
- [ ] Reschedule/cancel actions are auditable.

### F3D UI

- [ ] Payment Schedule list/calendar/table presentation as appropriate.
- [ ] Due soon.
- [ ] Overdue.
- [ ] Scheduled.
- [ ] Paid/completed.
- [ ] Vendor, bill, amount, due date, scheduled date and status visible without conflating meanings.
- [ ] Create/edit/cancel schedule action permissions.
- [ ] `Pay now`/record payment handoff uses F3C canonical payment flow.
- [ ] Admin UI audit per section 6.

### F3D tests

- [ ] Scheduling does not change financial account balance.
- [ ] Schedule can be moved/cancelled without altering posted history.
- [ ] Actual payment links/reconciles correctly.
- [ ] Multiple planned installments reconcile to bill outstanding according to policy.
- [ ] Past due vs scheduled-later semantics are represented correctly.

### F3D exit

Modulex can answer “what is due?”, “what do we plan to pay?”, “what did we actually pay?” and “what cleared the bank?” as four distinct questions.

---

## A6-F3E — Purchasing / AP Integration

Goal: connect procurement source documents to AP without merging domain ownership.

### F3E integration contract

- [ ] PO can link to its Vendor/Supplier.
- [ ] Vendor bill can reference one/more purchasing source records according to canonical PO model.
- [ ] PO/SKU/quantity remain Purchasing truth.
- [ ] Procurement freight/additional cost inputs remain in the appropriate purchasing/costing model.
- [ ] Vendor payable/bill remains AP truth.
- [ ] Actual payment remains Finance transaction truth.
- [ ] Selling price/margin remains Sales/Pricing/Reporting truth.
- [ ] No report depends on duplicating payable/payment totals into PO rows as manually editable truth.
- [ ] Define behavior for bill amount vs PO/receipt mismatch: warning/approval/fail-closed according to explicit business rule; do not silently accept unexplained mismatch.

### F3E UI

- [ ] PO detail shows linked vendor bill/payment state where useful.
- [ ] Vendor bill detail shows linked PO/purchasing context.
- [ ] Navigation between purchasing source and AP document is permission-safe.
- [ ] Procurement cost vs Finance payable labels are unambiguous.
- [ ] Admin UI audit per section 6 for changed Purchasing surfaces.

### F3E tests

- [ ] PO link does not become mandatory for general vendor bill.
- [ ] Deleting/editing source PO cannot silently corrupt posted AP/Finance history.
- [ ] Linked values reconcile according to defined relationship.
- [ ] Cross-domain RBAC is preserved.

### F3E exit

A purchase can flow `PO → Vendor Bill → Payment Allocation → Finance Transaction` while each domain keeps one authoritative truth.

---

## A6-F3F — AP Aging & Vendor Financial Projection

Goal: make AP operationally usable after bills/payments exist.

### F3F read models/reports

- [ ] Open AP total.
- [ ] Vendor outstanding balance.
- [ ] Bill status/outstanding.
- [ ] Due soon/overdue.
- [ ] AP aging buckets based on agreed due-date semantics.
- [ ] Vendor payment history.
- [ ] Scheduled payments projection.
- [ ] Outstanding/cleared check views where relevant.
- [ ] Main-currency normalized totals use stored historical FX snapshots where applicable.

### F3F UI

- [ ] AP Aging page/view.
- [ ] Vendor detail open AP summary.
- [ ] Vendor Bills/Payments links.
- [ ] Clear drill-down from aggregate totals to source documents/transactions.
- [ ] Admin UI audit per section 6.

### F3F exit

AP totals, aging, vendor balance, payments and schedules reconcile back to canonical bills/payment allocations/Finance transactions.

---

## A6-F4 — Payroll & Contractor Finance Integration

Goal: Finance records actual employee/contractor money movement while HR remains payroll/compensation source of truth.

### F4 tasks

- [ ] Re-audit current HR payroll/advance flows at execution time.
- [ ] Keep payroll period/run/item calculations in HR.
- [ ] Define approved/paid transition that creates/links Finance obligations/payments.
- [ ] Post salary payments to canonical Finance accounts/transactions.
- [ ] Integrate advances.
- [ ] Integrate deductions/reimbursements where they cause Finance movement.
- [ ] Handle employer costs only from explicit HR source truth.
- [ ] Employee is required for employee-level payment records.
- [ ] Project/Order attribution remains optional unless an explicit allocation is made.
- [ ] Contractor payment identity must use the correct canonical business entity; do not duplicate a contractor as vendor/employee without an explicit mapping rule.
- [ ] Contractor W9/COI compliance stays in the canonical contractor/vendor document domain, not Finance transaction rows.

### F4 UI

- [ ] Finance payroll/payment projection shows financial state without copying HR calculation screens.
- [ ] From HR payroll, authorized users can inspect resulting Finance posting/payment reference.
- [ ] Advances/reimbursements show financial status and linked account/transaction where applicable.
- [ ] Admin UI audit on every modified Finance and Personnel surface.

### F4 tests

- [ ] Payroll calculation does not duplicate into a second Finance calculation truth.
- [ ] Retry does not double-post payroll payment.
- [ ] Finance role cannot mutate unrelated HR employee master by implication.
- [ ] Payroll reversal/correction preserves append-safe Finance history.
- [ ] Optional Project/Order allocation reconciles.

### F4 exit

Paid payroll/employee financial events appear in Finance/cash flow while HR remains the source of payroll calculation truth.

---

## A6-F5 — Sales / Accounts Receivable Integration

Goal: reconcile customer invoices and receipts into Finance Core without breaking existing Project payment history.

### F5 tasks

- [ ] Re-audit production customer invoices/project payment tables and compatibility behavior immediately before migration work.
- [ ] Preserve current customer invoice IDs/history.
- [ ] Preserve Project payment requirements/allocations during transition.
- [ ] Introduce/complete canonical customer receipt through Finance Core.
- [ ] Customer required for customer receipt.
- [ ] Invoice/Order/Project links optional according to actual business context.
- [ ] Customer payment allocation supports partial/full payment.
- [ ] Derive invoice paid/outstanding/status from authoritative allocations/postings; no parallel manual truth.
- [ ] Add Finance linkage/reconciliation to existing Project payment records without duplicating money movement.
- [ ] Retire/narrow the legacy Project-payment posted-edit/hard-delete exception only through a separate reviewed migration after compatibility evidence.
- [ ] Preserve currency/FX snapshots.
- [ ] Ensure refund/reversal behavior reconciles AR.

### F5 UI

- [ ] Customer Payments/Receipts list.
- [ ] Invoice detail payment history/outstanding.
- [ ] Record/allocate payment flow.
- [ ] Customer balance/payment history.
- [ ] Project payment screens show reconciled Finance linkage without becoming Finance ownership screens.
- [ ] AR Aging surface.
- [ ] Admin UI audit per section 6.

### F5 tests

- [ ] Standalone customer receipt not tied to Project when not required.
- [ ] Project-linked customer payment still works.
- [ ] Partial/full allocation reconciliation.
- [ ] Refund/reversal reconciliation.
- [ ] Legacy Project payment IDs/history preserved.
- [ ] Retry does not double-receive payment.
- [ ] Cross-domain RBAC preserved.

### F5 exit

Customer receipt can reference invoice/order/project when applicable, AR derives from authoritative allocations/postings, and existing Project payment workflows reconcile to Finance without losing live history.

---

## A6-F6 — Reporting & Profitability Projection

Goal: build reports from canonical Finance/source-domain truth after operational posting flows are stable.

### F6 required Finance reports

- [ ] Finance Overview KPIs.
- [ ] Cash Flow.
- [ ] Income vs Expense operational report.
- [ ] Financial Account Balances.
- [ ] Account Movements.
- [ ] Expense by Category.
- [ ] Expense by Vendor.
- [ ] Expense by Project/Order.
- [ ] AP Aging.
- [ ] Vendor Balance.
- [ ] Vendor Payment History.
- [ ] Scheduled Payments.
- [ ] Outstanding Checks.
- [ ] Cleared Checks.
- [ ] AR Aging.
- [ ] Customer Balance.
- [ ] Customer Payment History.
- [ ] Project Financial Summary.
- [ ] Project profitability inputs/projection.
- [ ] Order profitability inputs/projection where source data supports it.

### F6 reporting rules

- [ ] Posted authoritative Finance state drives actual money movement reporting.
- [ ] Scheduled entries are forecasts, never silently included as actual cash.
- [ ] Outstanding checks are distinguishable from cleared bank movement.
- [ ] Historical cross-currency totals use stored transaction FX snapshots.
- [ ] Report totals drill down to source transactions/documents.
- [ ] Project/Order reports consume Finance allocations; they do not own duplicate transaction rows.
- [ ] Procurement landed-cost inputs and Sales/Pricing values are joined/projected from their source domains rather than manually copied into Finance.
- [ ] Date/timezone/main-currency rules are deterministic and tested.

### F6 UI

- [ ] Shared filters/date range patterns.
- [ ] Main-currency vs transaction-currency display is explicit.
- [ ] Drill-down links respect RBAC.
- [ ] Large tables are paginated/virtualized/aggregated as appropriate rather than unbounded client loads.
- [ ] Export, if implemented, must use the same authoritative filter/report semantics as the UI.
- [ ] Admin UI audit per section 6.

### F6 exit

Operational Finance/AP/AR/account/Project reports reconcile to their canonical source records with no duplicate manually maintained totals.

---

## A6-F7 — Hardening & Production Acceptance

Goal: prove the integrated Finance domain is safe, reconcilable and operable in production.

### F7 security / authorization

- [ ] Full Finance RLS/RPC/grants review.
- [ ] Public mutation RPC/private-core authorization review.
- [ ] No unexpected authenticated direct table write path to protected Finance history.
- [ ] RBAC matrix for `finance.view`, `finance.manage` and source-domain permissions.
- [ ] Cross-domain escalation tests.
- [ ] Security Advisor review and disposition.

### F7 data integrity

- [ ] Idempotency/concurrency tests.
- [ ] Draft/post/void/reversal lifecycle tests.
- [ ] Check lifecycle transition tests.
- [ ] Payment allocation reconciliation tests.
- [ ] AP/AR outstanding reconciliation.
- [ ] Multi-project allocation reconciliation.
- [ ] FX snapshot/manual-rate tests.
- [ ] Historical inactive dimension reference tests.
- [ ] Duplicate vendor/counterparty mapping review.
- [ ] Migration/backfill counts and sums reconciled before/after.

### F7 performance

- [ ] Query/index review for transactions, bills, allocations, schedules, instruments, reports.
- [ ] Pagination/filter query contracts.
- [ ] Performance Advisor review and disposition.
- [ ] No obvious N+1 or unbounded report/table fetches on production data paths.

### F7 UI / browser acceptance

- [ ] Full Finance route audit against `AdminUICheck.md`.
- [ ] Relevant Vendor/Purchasing/Personnel/Customer/Project/Order modified surfaces re-audited.
- [ ] Resolution matrix verified where applicable.
- [ ] Light/dark themes.
- [ ] Loading/empty/error/retry/action states.
- [ ] Keyboard/accessibility basics.
- [ ] Signed-in production acceptance with correct roles.
- [ ] No dead navigation/actions/placeholders.

### F7 CI / release

- [ ] Unit tests.
- [ ] Contract tests.
- [ ] Integration tests.
- [ ] Relevant E2E/browser tests.
- [ ] Typecheck.
- [ ] Lint.
- [ ] Production build.
- [ ] Migration order verified.
- [ ] Production migrations applied deliberately.
- [ ] Production smoke tests.
- [ ] Report/reconciliation spot checks.
- [ ] Rollback/operational recovery notes documented for risky rollout steps.
- [ ] Final Finance docs updated.

### F7 exit

Finance is production-accepted only after the integrated ledger/AP/AR/payroll/reporting surfaces pass security, integrity, UI, CI, migration and production smoke/reconciliation gates.

---

## 8. Cross-package test matrix

Every package should select and extend the applicable cases below rather than creating isolated happy-path tests only.

| Concern | Required evidence |
| --- | --- |
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
- Prefer additive schema + deterministic backfill + verification + later cleanup over destructive replacement.
- Never map free-text vendor names automatically when identity is ambiguous; create an explicit mapping/review path.
- Preserve legacy source IDs/references where needed for traceability and rollback.
- Backfills must be idempotent or safely rerunnable.
- Record pre/post counts, sums and unresolved rows.
- Do not convert historical document rows into posted Finance money movement unless the historical event can be proven and reconciled.
- Do not create artificial Project/Order links for general Finance records.
- Historical currency values must not be recomputed from a current FX rate.
- Production constraint tightening happens only after data verification proves compatibility.

---

## 10. Reconciliation rules

Use reconciliation as an explicit acceptance step, not an afterthought.

### Finance account reconciliation

For a defined date range/account:

`opening balance + posted inflows - posted outflows ± valid reversals = closing operational balance`

Instrument clearing is tracked separately where an issued check has not yet cleared.

### AP reconciliation

For each vendor bill:

`bill authoritative total - valid payment allocations ± valid reversals/refunds = outstanding balance`

Aggregate vendor open balance must equal the sum of its open bill balances, subject only to explicitly supported unapplied credits/payments.

### AR reconciliation

For each customer invoice:

`invoice authoritative total - valid receipt allocations ± refunds/reversals = outstanding balance`

### Project/Order allocation reconciliation

- Allocation totals cannot exceed their authoritative Finance transaction/document amount.
- Project/Order financial summaries are projections of links/allocations, not manually editable totals.

---

## 11. Definition of Done for every implementation package

A package is `COMPLETE` only when all applicable items are true:

- [ ] Scope implemented without violating `FINANCE_DOMAIN_PLAN.md`.
- [ ] Schema/migration reviewed against current production state.
- [ ] RLS/RPC/RBAC boundary verified.
- [ ] Audit/lifecycle/idempotency behavior verified.
- [ ] Domain reconciliation tests pass.
- [ ] Existing compatibility/regression tests pass.
- [ ] UI meets `AdminUICheck.md` for changed surfaces.
- [ ] Fresh typecheck/lint/build gates required by the repo pass.
- [ ] PR/merge state recorded if a PR is used.
- [ ] Production migration/deployment state recorded if applicable.
- [ ] Production smoke/reconciliation recorded when production changed.
- [ ] This `financefinal.md` progress board and package checklist are updated.
- [ ] Next executable package is named.

---

## 12. Rollout strategy

Use small vertical packages instead of one Finance mega-PR.

Recommended delivery sequence:

1. Close A6-F1 with fresh verification.
2. A6-F2 Expenses.
3. A6-F3A Vendor/Supplier + Compliance.
4. A6-F3B Vendor Bills.
5. A6-F3C Vendor Payments + Check Lifecycle.
6. A6-F3D Payment Schedule.
7. A6-F3E Purchasing/AP linkage.
8. A6-F3F AP Aging/Vendor financial projection.
9. A6-F4 Payroll/Contractor Finance integration.
10. A6-F5 Customer AR integration.
11. A6-F6 Reporting/profitability projections.
12. A6-F7 hardening/production acceptance.

For each package:

`read current main + production → lock package contract → tests/implementation → fresh CI → review/PR → merge → production rollout if needed → smoke/reconcile → update financefinal.md`

Do not start the next package merely because code exists; use the prior package exit gate.

---

## 13. Explicit decisions recorded by this plan

| Decision | Status | Reason |
| --- | --- | --- |
| Keep current F1 Finance Core architecture | **LOCKED** | Spreadsheet requirements extend operations; they do not require redesigning the neutral ledger |
| Finance remains first-class; Project is attribution | **LOCKED** | Required by Finance domain contract |
| Source documents stay separate from money movement | **LOCKED** | Prevent invoice/PO/check/payment truth from collapsing into one table |
| Check lifecycle uses a child/instrument model direction | **ACCEPTED** | Check issued vs cleared is operationally distinct from Finance posting |
| `scheduled_payment_date` remains distinct from due/paid/cleared | **ACCEPTED** | Required for payment planning and cash forecast semantics |
| W9/COI belongs to Vendor/Contractor compliance, not Finance transaction | **ACCEPTED** | Compliance is counterparty/document state, not money movement |
| Canonical `payment_methods` relationship; no AP free text | **ACCEPTED** | Prevent spelling variants and reporting fragmentation |
| Vendor bills support partial payments through allocations | **ACCEPTED** | Real operational installment requirement |
| PO → Bill → Payment → Finance relationship without domain collapse | **ACCEPTED** | Preserves procurement/AP/ledger ownership |
| One ledger/instrument model across years | **ACCEPTED** | Annual spreadsheet tabs are a presentation artifact, not a data model |
| No compliance hard-block without approved policy | **LOCKED SAFE DEFAULT** | Do not invent a business rule that can stop payments |
| No full statutory GL in this roadmap | **DEFERRED / NON-GOAL** | Existing Finance plan intentionally targets operational Finance first |
| Bank-feed reconciliation/tax filing/external accounting integrations | **DEFERRED** | Require explicit future requirements after operational Finance stabilizes |

---

## 14. Risk register

| Risk | Control |
| --- | --- |
| Duplicate Vendor/Supplier identities from legacy names | Canonical master + explicit import mapping/dedupe review |
| Double-posting from legacy Project/customer payment flows | Reconciliation links + idempotency + staged F5 integration |
| Posted history silently edited | Private mutation core + lifecycle constraints + reversal model |
| Outstanding checks mistaken for cleared cash | Separate payment instrument lifecycle and cleared timestamp/status |
| Payment schedule mistaken for actual cash | Schedule has no ledger effect until canonical payment posting |
| Incorrect historical FX | Stored transaction-time snapshot; no later-rate recomputation |
| Multi-project allocation drift | Authoritative source total + deterministic allocation validation |
| Procurement and AP duplicate truth | Explicit domain ownership and links, no copied editable totals |
| Expired W9/COI unexpectedly blocking operations | Warning by default; hard block requires approved policy |
| Permission regression across Finance/HR/Project/Vendor | Cross-domain RBAC tests + RPC/RLS review |
| Large reporting queries degrade Admin | Indexed server-side filtering/pagination + F7 performance review |
| Backfill changes live historical meaning | Additive migrations + before/after reconciliation + fail closed on ambiguity |

---

## 15. Deferred decisions — resolve only when their package starts

These are intentionally not blockers for the current plan. Resolve them from current repo/business evidence when their package begins; do not invent them early.

- Final physical table names for Vendor/Supplier and payment instruments.
- Exact Vendor entity reuse vs extension after current domain inventory.
- Whether one vendor payment may be intentionally unapplied/on-account.
- Exact AP aging bucket ranges.
- Exact bill approval workflow, if one is required beyond draft/open/posting semantics.
- Exact PO-vs-bill variance approval thresholds.
- Whether missing/expired compliance ever hard-blocks a payment.
- Exact external accounting export/integration requirements.
- Full statutory chart-of-accounts/double-entry scope.

---

## 16. Work log

### 2026-09-05 — Final implementation plan created

- Created `modulex-admin/financefinal.md` as the living Finance execution tracker.
- Preserved the locked `FINANCE_DOMAIN_PLAN.md` ownership/lifecycle/currency/allocation/security rules.
- Adopted `AdminUICheck.md` as the mandatory UI acceptance contract.
- Added Excel-derived requirements: check clearing lifecycle, scheduled payments, vendor compliance documents, canonical payment methods, partial payments, counterparty normalization and Procurement → AP linkage.
- Expanded A6-F3 into executable AP sub-packages without changing the required F0→F7 architecture order.
- No Finance schema, application code, production data or UI behavior was changed by this planning package.

### Next

**A6-F1 closeout — fresh CI/UI/contract/build verification and explicit rollout-state recording.**
