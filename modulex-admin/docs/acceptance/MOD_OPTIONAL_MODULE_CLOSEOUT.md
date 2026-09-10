# MOD Optional Module Closeout

## MOD-A1 — Approvals

`/approvals` is a production shared workflow surface, not a Finance-owned module.

Supported request types are `order_exception`, `order_revision`, `order_status_change`, `customer_commercial_change`, `customer_price_group_change`, and `invoice_change`. Request creation stays with the owning Order, Customer, or Invoice domain. Queue visibility uses `approvals.view`; review execution is restricted by the production RPC to active Admin/Super Admin users. Only pending requests may transition to approved or rejected. `requested_by/requested_at`, `reviewed_by/reviewed_at`, `review_note`, `applied_at`, snapshots, risk data, and queued approval events form the audit trail. Order, Customer, and Invoice requests deep-link to their canonical records.

## MOD-A2 — Training

The removed `/training` route was a static browser-local help center. Its lesson catalog and completion state were not backed by the HR training schema and therefore did not qualify as a production business module.

Production `hr_training_courses` and `hr_employee_training` remain untouched and Personnel-owned. MOD does not drop or redefine those tables; any future operational HR training workflow belongs to the PER workstream.

## MOD-A3 — Exit gate

Approvals is promoted to first-class shared workflow navigation instead of Finance navigation. The standalone Training route, component, static content, and obsolete `training.view` route permission are removed. Existing approval infrastructure is preserved. `approvals-ui-contract.mjs` and `mod-optional-module-closeout-contract.mjs` lock the route/RBAC/deep-link decisions.
