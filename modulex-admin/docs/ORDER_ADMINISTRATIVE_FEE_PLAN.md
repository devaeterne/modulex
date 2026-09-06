# Order Administrative Fee Plan

Status: Planned
Owner domain: Admin / Orders
Customer-facing behavior: Hidden as a named fee
Default rate: 3.00%

## Business decision

Replace the Order UI field currently presented as **Applied Commission (%)** with **Administrative Fee (%)**.

The Administrative Fee is an Order-level commercial adjustment:

- New Orders default to `3.00%`.
- Authorized Admin users may edit the rate while the Order is in an editable Draft/revision state.
- `0%` is valid.
- The selected rate and calculated amount are snapshotted on the Order/revision so later default changes cannot rewrite history.
- The fee is internal commercial pricing data. Customer-facing Quote / Order Confirmation / Invoice / Receipt / Portal / PDF / print output must not display a separate `Administrative Fee` line or label.
- Customer-facing document arithmetic must still reconcile exactly. The presentation layer must proportionally distribute the fee into visible sell-side line amounts, with deterministic cent rounding and a residual-cent rule, instead of showing a hidden unexplained difference between visible lines and Grand Total.
- Internal Admin/Finance views may show Base Subtotal, Administrative Fee %, Administrative Fee amount and Adjusted Subtotal separately.

## Calculation contract

Target calculation order:

1. Canonical sell-side line subtotal
2. Existing Order-level discount rules
3. Administrative Fee on the post-discount / pre-tax commercial subtotal
4. Tax calculation on the adjusted taxable basis according to the existing canonical tax rules
5. Existing shipping/other explicitly approved totals according to current Order contract
6. Grand Total

The implementation must audit the current calculation order before changing production behavior. Existing canonical tax, discount, shipping, revision and rounding semantics must be reused rather than reimplemented independently.

## Data and migration rules

- Add canonical Order/revision fields for Administrative Fee rate and calculated amount, using the existing Order pricing/revision ownership model.
- Default new editable Orders to `3.00%` at the authoritative DB/RPC boundary, not only in the browser.
- Historical Orders must remain immutable/reproducible.
- Do **not** blindly reinterpret historical `Applied Commission` values as Administrative Fee. Audit the existing field/schema/usage first. Preserve or migrate historical values only when semantic equivalence is proven.
- Do not create a second commission ledger. Project participant/sales commission continues to belong to the existing PB-6 Commission Ledger / Finance payout architecture.
- Confirmed/non-editable Orders must use the existing Order Revision / Change Order lifecycle for fee changes rather than direct mutation.

## Admin UX

Order create/edit/detail pricing area:

- Remove/replace the visible `Applied Commission (%)` control.
- Add `Administrative Fee (%)`.
- Initial value: `3.00` for a new Order.
- Editable according to the existing Order edit/revision permissions.
- Show the calculated Administrative Fee amount internally.
- Show a clear pricing breakdown internally:
  - Base/discounted subtotal
  - Administrative Fee rate
  - Administrative Fee amount
  - Adjusted subtotal
  - Tax
  - Grand Total
- Validate numeric range and precision at both UI and DB/RPC boundaries.

## Customer-facing output contract

Administrative Fee must not appear as a named line or disclosure on:

- Quote / estimate print
- Order Confirmation
- Invoice
- Receipt/payment print
- Customer Portal / Dealer Portal customer-facing pricing surfaces
- PDF/email document projections

Visible customer line amounts must reconcile to the displayed subtotal/total. Use a shared deterministic allocation/projection helper so Order print, Invoice print and portal/PDF output cannot drift from each other.

Canonical internal pricing must retain enough information to audit the original sell-side amount and the Administrative Fee separately; presentation allocation must not destroy cost/margin truth.

## Invoice / Finance contract

- Invoice/AR total must include the Administrative Fee economically even though the fee is not shown as a named customer line.
- Finance reporting must not treat the Administrative Fee as salesperson commission.
- Gross sales / AR / payment allocation / balance calculations must reconcile to the final invoiced amount.
- Cost and margin reporting must remain internally auditable; the fee is sell-side revenue adjustment, not product cost.
- Existing FX snapshot rules remain authoritative for cross-currency Orders/Invoices.

## Security and audit

- Reuse existing Order pricing/revision permissions; do not widen roles just to edit this field.
- Rate changes must be attributable through the existing Order audit/revision trail.
- DB/RPC must reject unauthorized or invalid direct writes.
- Customer/Dealer public projections must not expose the internal Administrative Fee rate/amount fields.

## Implementation sequence

- [ ] AF-0 — Current-state audit: locate Applied Commission schema/UI/RPC/print/invoice/report usage and classify historical data.
- [ ] AF-1 — Contract tests (RED): pricing math, default 3%, authorization, revision behavior, hidden customer projection and rounding reconciliation.
- [ ] AF-2 — DB/RPC migration: canonical Administrative Fee snapshot fields, defaults, validation and backward-safe migration.
- [ ] AF-3 — Admin Order UX: replace Applied Commission with Administrative Fee and internal breakdown.
- [ ] AF-4 — Order pricing engine: integrate fee into canonical totals without duplicating discount/tax logic.
- [ ] AF-5 — Customer-facing projection: shared proportional allocation + deterministic cent rounding; no named fee.
- [ ] AF-6 — Invoice / AR / Finance reconciliation: invoice totals, allocations, balances, FX and reporting.
- [ ] AF-7 — Print/PDF/Portal regression: Quote, Order Confirmation, Invoice, Receipt and portal-visible totals.
- [ ] AF-8 — Production migration + rollback-only arithmetic acceptance + Security/Performance Advisor review.
- [ ] AF-9 — Signed-in production acceptance and roadmap closeout.

## Acceptance examples

Example before tax:

- Post-discount commercial subtotal: `$10,000.00`
- Administrative Fee: `3.00%`
- Administrative Fee amount: `$300.00`
- Adjusted taxable subtotal: `$10,300.00`

Internal Admin may display all four values.

Customer-facing output must not display `Administrative Fee $300.00`. Instead, the shared presentation projection distributes the `$300.00` across visible sell-side lines so the visible line arithmetic reconciles exactly to `$10,300.00` before tax.

## Done definition

This package is complete only when DB, Admin Order UX, Order revision behavior, Invoice/AR, customer-facing print/PDF/portal projections, security boundaries, deterministic rounding, migrations, CI/smoke tests and signed-in production acceptance all pass. Code-only completion is not sufficient.
