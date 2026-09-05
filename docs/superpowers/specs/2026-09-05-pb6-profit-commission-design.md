# PB-6 Follow-up — Gross Profit Commission + UI Cleanup

Date: 2026-09-05
Branch: `feat/pb6-profit-commission-ui`

## Goal

Extend PB-6 commission calculation with a gross-profit percentage basis while preserving existing fixed and revenue-percentage behavior, keep the commission ledger Finance/Admin/Super Admin only, improve the Project commission UI, and expose Project Participant Roles in the General Settings sidebar.

## Confirmed business rule

Gross Profit = scoped Project line revenue - scoped product cost

Commission = Gross Profit × commission percentage

Gross-profit commission excludes tax and payment-fee amounts. Revenue for gross-profit calculation comes from `customer_order_items.line_total`, not `customer_orders.grand_total`.

If any included order line does not have a canonical active product cost in the requested currency, gross-profit commission is unavailable and creation must fail closed. Missing cost is never treated as zero.

## Existing behavior that remains unchanged

- Fixed commission remains a direct amount.
- Revenue percentage commission remains percentage × canonical Project/category/product sales basis.
- Whole-Project revenue-percentage basis continues to use non-cancelled `customer_orders.grand_total` to avoid silently changing existing PB-6 semantics.
- Category/product revenue-percentage basis continues to use scoped `customer_order_items.line_total`.
- Commission obligations are immutable commercial snapshots after creation.
- Actual payouts remain canonical Finance transactions attributed to the commission obligation.
- Internal Participants & Commission detail remains visible only to Finance/Admin/Super Admin.
- Sales/commission recipients will later receive a separate summary-only personal projection; this change does not expose internal commission detail to them.

## Canonical cost source

Use the existing `public.product_costs` truth:

- `is_active = true`
- `valid_to is null`
- matching `product_id`
- matching commission currency

The existing partial unique index guarantees at most one current active cost per product/currency.

Line cost = `customer_order_items.quantity × product_costs.amount`.

Only non-cancelled Project Orders participate.

## Data model

Keep `scope_type` unchanged:

- `project`
- `category`
- `product`

Extend `basis_type` with a third value:

- `fixed`
- `percentage` — percentage of sales/revenue
- `gross_profit_percentage` — percentage of gross profit

For `gross_profit_percentage`:

- `basis_amount` snapshots gross profit.
- `rate` snapshots the commission percentage.
- generated `base_amount` remains `basis_amount × rate / 100` and therefore requires no semantic change beyond constraints supporting the new basis type.
- add nullable audit snapshot columns `basis_revenue_amount` and `basis_cost_amount`.

For existing/future `percentage` rows:

- `basis_amount` remains revenue basis.
- `basis_revenue_amount` / `basis_cost_amount` remain null unless explicitly needed by a future migration.

No historical obligation is rewritten.

## DB calculation boundary

Add a private canonical helper that calculates scoped gross profit and returns at least:

- revenue amount
- cost amount
- gross profit amount
- missing-cost line count
- detected currency

Project scope:

- revenue = sum of all non-cancelled Project order-item `line_total` values.
- cost = sum of `quantity × current active product cost` for those same lines.

Category scope:

- same calculation, restricted to products in the selected category.

Product scope:

- same calculation, restricted to the selected product.

Fail closed when:

- no scoped revenue exists;
- mixed Order currencies exist;
- requested currency differs from scoped currency;
- any scoped line has no product id or no current active product cost in the requested currency;
- gross profit is zero or negative.

The create RPC must recalculate server-side at creation time and snapshot the result. Client preview is advisory only.

## Preview contract

Introduce a richer internal preview RPC for commission calculation details instead of replacing the existing numeric revenue preview contract.

The richer preview returns enough data for UI cards:

- calculation mode (`revenue` or `gross_profit`)
- revenue
- cost when applicable
- commission basis
- missing cost line count
- currency

Access remains Finance/Admin/Super Admin only and `anon` receives no execute permission.

## Project UI cleanup

Keep `Participants & Commission` as the Project Detail tab, but clean up the Commission Ledger creation area.

Recommended layout:

1. Existing commission obligations table remains first.
2. New commission form becomes a clearer two-stage card:
   - top row: Participant, Commission method, Scope
   - scope selector appears only when category/product is selected
   - second row: conditional amount/rate input + currency + description
3. Replace the cramped inline calculation cards with a dedicated `Commission Preview` summary block.

Commission method options:

- Fixed amount
- Sales %
- Gross profit %

For Sales % preview show:

- Sales basis
- Rate
- Estimated commission

For Gross profit % preview show:

- Scoped sales
- Product cost
- Gross profit
- Rate
- Estimated commission

If cost is incomplete, show an explicit `Incomplete cost data` state with the missing-line count and disable creation.

Do not show `Unavailable` without explanation.

The UI must use existing Admin shared tokens/components and continue passing strict Admin UI contracts.

## General Settings sidebar

Add:

`General Settings → Project Participant Roles`

Path:

`/settings/general/project-participant-roles`

Use the existing `settings.view` navigation permission. The page continues to enforce Admin/Super Admin mutation guards in the existing role manager; no duplicate settings model is introduced.

## Smoke-test design

Do not persist demo financial data.

Run a rollback-only database smoke test against the existing sample Project used during PB-6 verification.

Current observed scope:

- order-line sales total: `$6,540.70`
- known product cost total: `$524.00`
- two lines currently lack cost (`Service` and `TEST Countertop Quartz`)

Inside one transaction:

1. Insert temporary current USD costs for only the missing demo products so total scoped product cost becomes exactly `$4,000.00`.
2. Call the canonical gross-profit helper/preview.
3. Verify:
   - sales = `$6,540.70`
   - cost = `$4,000.00`
   - gross profit = `$2,540.70`
   - 2% commission = `$50.81`
4. Roll back the transaction.
5. Re-query to prove no demo product-cost rows remain.

Also run a negative smoke path before temporary costs are supplied and assert that gross-profit preview fails closed for incomplete cost data.

## TDD / regression coverage

Add RED-first contracts for:

- sidebar contains Project Participant Roles under General Settings;
- `gross_profit_percentage` is accepted by domain types and DB constraints;
- gross-profit preview uses line revenue minus canonical active product costs;
- missing cost blocks preview/create;
- mixed currency blocks preview/create;
- server-side create recalculates and snapshots gross profit rather than trusting client amounts;
- Project UI exposes Fixed / Sales % / Gross profit % methods;
- gross-profit preview renders sales, cost, gross profit and estimated commission;
- existing fixed and sales-percentage paths remain unchanged;
- migration and Admin SQL mirror remain byte-identical.

Final gates:

- Project Base contracts
- Admin UI strict gate
- General Settings contract
- RBAC regression
- TypeScript
- lint
- production build
- rollback-only DB smoke evidence

## Production boundary

No production DDL or persistent demo-data mutation is performed until implementation, migration review, CI GREEN and explicit merge/deploy flow. The smoke test may use transactional demo writes only when they are rolled back in the same SQL execution and followed by a no-residue verification.
