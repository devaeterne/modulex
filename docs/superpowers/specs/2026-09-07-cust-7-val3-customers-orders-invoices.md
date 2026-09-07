# CUST-7 / VAL-3 Customers, Orders & Invoices Validation Design

## Goal
Close VAL-3 by aligning Admin customer, order, and invoice mutation UX with the production DB/RPC contracts while preserving canonical mutation boundaries, exact decimal semantics, authorization, audit/history, and Store/Portal privacy.

## Scope

### Customers
- New Customer, Customer Master, Contact, Address, and Commercial mutations keep their existing canonical RPC/lifecycle boundaries.
- Required fields, email, phone, ISO country/currency codes, URLs, and numeric commercial fields receive early client validation.
- Customer commercial `credit_limit` and `minimum_order_amount` preserve production `numeric(18,4)` semantics and never use JavaScript float parsing as mutation truth.
- Mutating forms expose field-level invalid state and focus the first invalid field.

### Orders
- Quantity follows `numeric(18,4)` and must be strictly positive.
- Money fields follow `numeric(18,4)` and must be non-negative.
- Percentage fields follow `numeric(7,3)` and remain within `0..100`.
- Create/edit order mutation payloads preserve validated decimal strings through `create_customer_order` and existing revision RPC boundaries; mutation serialization must not coerce them through `Number()`.
- JavaScript numbers remain acceptable for non-authoritative visual previews only.
- Existing fulfillment/address, product-pricing, revision/approval, idempotency, and order lifecycle contracts remain unchanged.

### Invoices
- Manual `paid_amount` uses exact `numeric(18,4)` validation and early `paid <= total` UX validation while DB/RPC remains authoritative.
- Ledger-managed invoices remain read-only for manual payment truth.
- Existing Finance/Project payment allocation semantics are unchanged.

## Testing / Acceptance
- Upgrade `val3-customers-orders-invoices-contract.mjs` from string-presence checks to executable exact-decimal behavior plus source contracts for field-level UX and canonical RPC boundaries.
- Wire VAL-3 into the normal Admin smoke chain; do not create a new workflow wrapper.
- Run existing Customer/Order/Invoice/A1/Admin UI strict regressions and Store/Portal boundary regressions for changed shared surfaces.
- No production DB migration is expected unless implementation uncovers a real schema/RPC mismatch.
- Roadmap stays `[~]` until exact-head CI and post-merge/deploy production acceptance; code completion alone does not close VAL-3.

## Non-goals
- Administrative Fee semantics.
- Finance F5 payment/AR redesign.
- New schema-driven form framework.
- Replacing canonical Customer/Order/Invoice RPCs or historical lifecycle rules.
