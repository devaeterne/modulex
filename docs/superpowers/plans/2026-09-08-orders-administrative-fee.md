# Orders Administrative Fee Implementation Plan

**Goal:** Add a company-internal Administrative Fee revenue adjustment to Orders without reinterpreting the existing payment-method commission fields, while keeping customer-visible line totals, invoice totals and AR balances reconciled.

## Fixed business contract

- Administrative Fee is an internal sell/revenue adjustment, not employee commission, cost or expense.
- Company default is 3.000%, stored in General Settings.
- New Orders snapshot the current default; authorized Order editors may override the percentage.
- Existing Orders remain 0.000% after migration unless explicitly revised through the normal Order revision flow.
- Legacy `payment_commission_percent` / `payment_commission_amount` remain separate historical payment-method surcharge fields and are never renamed or backfilled into Administrative Fee.
- Calculation order: line prices → line discounts → order discount → Administrative Fee → tax → final total. Existing legacy payment surcharge, when present historically, remains after the normal Order total.
- Administrative Fee must never appear as a customer-facing line or label.
- Customer-visible line amounts absorb the Administrative Fee proportionally. Cent allocation is deterministic and any remainder is assigned to the final eligible line in stable line order.
- Invoice/AR truth uses the fee-inclusive customer amount.
- Confirmed/pre-fulfillment changes continue through existing Order revision/approval rules; fulfillment-started Orders remain locked.

## Production audit boundary

- Current production has 34 Orders and 3 Orders with non-zero legacy payment commission.
- Current payment-method defaults are 0%.
- One historical invoiced Order (`ORD-000001`) contains a 5% legacy payment commission. Its stored invoice/accounting snapshot must not be mutated or reinterpreted.

## Implementation tasks

### 1. Contract-first regression coverage

Files:
- `modulex-admin/scripts/order-administrative-fee-contract.mjs`
- `modulex-admin/scripts/order-domain-contract.mjs`

Lock the following before runtime implementation:
- separate Administrative Fee schema/settings fields;
- General Settings default 3.000%;
- existing Order rows default to 0.000%;
- no rename/drop/reinterpretation of `payment_commission_*`;
- authoritative fee-before-tax math;
- deterministic visible-line allocation helper/projection;
- create/update Order RPC accepts Administrative Fee separately;
- invoice creation copies customer-visible pricing rather than exposing a fee line;
- customer-facing Order/Invoice output does not expose Administrative Fee/Applied Commission/Commission labels;
- Admin New/Edit uses `Administrative Fee (%)`.

### 2. Canonical database migration

File:
- `modulex-store/supabase/migrations/20260908150000_customer_order_administrative_fee.sql`

Add:
- `general_settings.administrative_fee_default_percent`, default 3.000;
- Order snapshot fields for base sell, fee percent, fee amount and customer-visible sell;
- deterministic SQL helper/projection for customer-visible line pricing;
- authoritative Order totals calculation with fee before tax;
- revised create/update RPC signatures/implementations using separate Administrative Fee percentage;
- invoice creation logic that snapshots fee-inclusive visible line pricing and fee-inclusive receivable totals without a customer-facing fee line;
- internal invoice fee snapshot columns only if needed for reporting/audit.

Historical migration rule:
- schema-level Order fee default is 0.000 so all existing Orders remain unchanged;
- create RPC snapshots 3.000 or current General Settings value for new Orders when the caller supplies the UI snapshot;
- legacy payment commission columns and values remain untouched.

### 3. Admin Settings + Orders UI

Files:
- `modulex-admin/src/lib/settings/types.ts`
- `modulex-admin/src/components/settings/GeneralSettingsManager.tsx`
- `modulex-admin/src/lib/customers/types.ts`
- `modulex-admin/src/lib/customers/order-domain.ts`
- `modulex-admin/src/components/customers/NewCustomerOrder.tsx`
- `modulex-admin/src/components/customers/EditCustomerOrder.tsx`
- `modulex-admin/src/components/customers/CustomerOrderDetail.tsx`

Behavior:
- General Settings exposes Administrative Fee default percentage.
- New Order loads the default and snapshots it.
- Edit Order edits the Order snapshot through existing revision rules.
- Normal commercial UI no longer presents legacy `Applied Commission (%)` as the Administrative Fee control.
- Admin totals show internal Base Sell / Administrative Fee / customer total breakdown where useful.
- Historical non-zero legacy payment surcharge remains visible internally with explicit legacy wording if needed.

### 4. Customer-facing reconciliation

Files:
- `modulex-admin/src/components/customers/CustomerOrderPrint.tsx`
- `modulex-admin/src/components/customers/CustomerInvoiceDetail.tsx`
- `modulex-admin/src/components/customers/CustomerInvoicePrint.tsx`
- Store portal projection/render files discovered by contract/audit.

Rules:
- never render Administrative Fee/Admin Fee/Applied Commission as a customer-facing label;
- use customer-visible line values so visible subtotal reconciles to fee-inclusive invoice subtotal;
- historical legacy payment surcharge may be represented only through neutral historical adjustment presentation when required to reconcile an immutable old invoice, never as Administrative Fee.

### 5. Verification

Run exact-head gates:
- Admin A1 Core Operations;
- Admin UI Foundation (strict UI, theme/resolution, typecheck, lint, build);
- Admin A6 Finance Core;
- Store Core CI if portal contracts/files are touched.

Before review-ready PR:
- compare branch against current `main` and resolve only genuine overlap;
- verify no production migration was applied before merge;
- record production audit evidence and historical legacy boundary in PR notes.

## Production gate after owner merge

Only after merge:
1. fetch exact merged migration from `main`;
2. recheck production migration history;
3. apply that exact migration once;
4. verify settings/order/invoice catalog fields and function definitions;
5. run Security + Performance Advisors;
6. signed-in smoke: new Order default 3%, override, revision, invoice creation/print, AR/customer receipt reconciliation, and customer-facing no-fee-label checks.
