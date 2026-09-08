# Project Proposal P6 — Proposal → Order Conversion Design

Date: 2026-09-08

## Goal

Add an explicit, auditable conversion path from an exact accepted Project Proposal Revision into a canonical Draft Customer Order without changing or restricting normal Order creation.

All three creation paths remain valid:

1. standalone Customer Order with no Project or Proposal;
2. Project Order created from scratch with no Proposal;
3. Project Order explicitly created from selected scope in an accepted Proposal Revision.

Proposal acceptance alone never creates an Order.

## Existing contracts preserved

- `customer_orders` remains authoritative after conversion.
- Existing `create_customer_order` / `create_project_customer_order` invariants remain authoritative.
- Normal Product pricing remains Product Type / Price Group driven.
- P6 does not open arbitrary manual price overrides for normal Products.
- The canonical active `SERVICE` product (`sku=SERVICE`, Product Type `SERVICE`, pricing model `manual_service`) is the existing safe Order route for an explicit commercial amount.
- Administrative Fee remains an internal revenue adjustment and never appears as a customer-facing fee line.
- Accepted Proposal Revision and acceptance evidence are immutable.
- Proposal Pricing Group sell amount is counted once, never allocated arbitrarily across member Areas.
- The authoritative Proposal total remains `sum(coalesce(ungrouped direct_sell_amount,0)) + sum(pricing_group.sell_amount)`.

## Conversion eligibility

The authoritative DB boundary requires:

- authenticated caller with Proposal-manage / Order-manage authority (`super_admin`, `admin`, `sales`);
- exact Proposal Revision exists and `state='accepted'`;
- an effective `customer_project_proposal_acceptances` row exists for that exact Revision;
- Proposal, Revision, Project and selected Areas belong to the same immutable baseline;
- non-empty, duplicate-free selected Area set;
- Proposal currency equals Project Customer / resulting Order currency;
- exactly one active canonical manual SERVICE product resolves.

There is no `customer_project_proposals.accepted_revision_id` column in the canonical schema. P6 must not invent one. Accepted truth is the exact Revision state plus its immutable acceptance row.

No FX conversion is invented in P6. Currency mismatch fails closed.

## Commercial-unit selection

### Ungrouped Areas

Every Area without a Pricing Group is an independent selectable commercial unit.

Accepted amount:

`coalesce(direct_sell_amount, 0)`

An explicitly selected accepted Area with no direct price therefore remains a `$0` accepted scope line rather than being silently dropped.

Ungrouped Areas may be converted into different Orders.

### Pricing Groups

All Areas sharing one Pricing Group form one atomic commercial unit.

- UI presents the group once and lists all member Areas.
- Selecting the group selects all member Areas.
- Direct RPC requests containing only part of a group fail closed.
- Group `sell_amount` is represented once in the resulting Order.
- Group amount is never divided across member Areas.

## Order creation model

Conversion always creates a **Draft Project Order**.

The user continues through the existing New Order experience for Order-owned context:

- Price Group;
- fulfillment type;
- payment method;
- Administrative Fee percent;
- billing / shipping address;
- expected delivery date;
- customer reference;
- customer notes / internal notes;
- tax rate.

Proposal conversion does not auto-confirm the Order. Order Discount is fixed to `0` during initial Proposal conversion so the accepted commercial baseline is not discounted a second time.

After creation, the Order is authoritative and normal Order edit/revision/lifecycle rules apply.

## Proposal commercial amount → canonical Order lines

P6 does not add a new Product pricing mode.

Each selected Proposal commercial unit becomes one initial canonical SERVICE/manual-service Order line:

- ungrouped Area → one SERVICE line;
- Pricing Group → one SERVICE line, with all group Areas linked to that same conversion line / initial Order item.

Customer-safe line note text may contain Proposal number/revision, Area names, material description, finish/thickness, group label/description and scope notes.

It must never copy `internal_notes`, `measurement_notes`, `readiness_status`, `status_note`, `supplier_snapshot`, cost or supplier-only context.

## Administrative Fee reconciliation

Accepted Proposal sell amounts are **customer-visible pre-tax amounts**.

Administrative Fee must not be added on top of the accepted Proposal amount.

For each conversion, the RPC derives internal base SERVICE line amounts so that after the selected Administrative Fee snapshot and existing canonical visible-line allocation are applied:

`customer-visible converted line amount == accepted Proposal commercial-unit amount`

and:

`customer_orders.customer_visible_sell_amount == selected accepted Proposal scope total`

at cent precision.

Example: selected accepted scope `$10,300`, Administrative Fee `3%`. The RPC must derive the internal base sell required so the customer-visible pre-tax Order remains exactly `$10,300`; it must not create `$10,609`.

### Deterministic cents algorithm

- Convert accepted commercial-unit targets to integer cents.
- Find a total base-cent amount whose current Administrative Fee calculation produces exactly the selected target cents.
- Allocate that fixed base-cent total deterministically across commercial units using stable Proposal order.
- Reconcile the allocation against the same proportional fee allocation semantics used by `private.customer_order_visible_line_pricing`.
- Adjust base cents deterministically while keeping the fixed total base amount until every unit reconciles, or fail closed when exact reconciliation is impossible.
- Create the canonical Draft Order.
- Re-read `private.customer_order_visible_line_pricing` and `customer_visible_sell_amount` inside the same transaction.
- If any unit or total differs from the immutable accepted target by a cent, raise `PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED` and roll back everything.

No `$0.01` drift is accepted.

## Append-safe source model

### `customer_project_proposal_order_conversions`

One immutable conversion header per created Order.

Required identity/snapshot fields include:

- Project, Proposal, exact Proposal Revision and acceptance ids;
- canonical Order id (unique);
- idempotency key (unique);
- canonical request fingerprint;
- Proposal number / Revision number snapshots;
- currency;
- selected accepted scope sell amount;
- Administrative Fee percent snapshot;
- created actor/time.

### `customer_project_proposal_order_conversion_lines`

One immutable record per selected Proposal commercial unit:

- conversion id;
- initial Order item id (`ON DELETE SET NULL` so history survives later Order editing);
- `direct_area` or `pricing_group` kind;
- source direct Area or Pricing Group id;
- customer-safe label/description snapshots;
- accepted target amount;
- derived base sell snapshot;
- stable sort order.

### `customer_project_proposal_order_conversion_areas`

One immutable source Area link per selected accepted Area:

- conversion id;
- conversion line id;
- Proposal Area id (globally unique in this P6 conversion model);
- Area/material/scope customer-safe snapshots;
- stable sort order.

The unique Proposal Area link prevents silently converting the same accepted scope twice. Group member Areas point to the same conversion line.

## Idempotency and duplicate prevention

The mutation RPC accepts `p_idempotency_key uuid`.

A canonical request identity/fingerprint includes at least:

- exact Revision id;
- sorted selected Area ids;
- canonicalized Order header values that affect the created Draft;
- selected Administrative Fee percent.

Rules:

- same key + same request fingerprint returns the already-created Order;
- same key + different request fingerprint fails with `PROPOSAL_ORDER_IDEMPOTENCY_MISMATCH`;
- an Area already linked to a successful conversion cannot be converted again;
- any already-converted member makes a Pricing Group unavailable for another conversion;
- normal non-Proposal Orders have no conversion row and remain unaffected.

## RPC boundary

### Preview

`get_project_proposal_order_conversion_preview(p_revision_id uuid)`

Returns only selection/New-Order-prefill data:

- Project / Customer identity;
- Proposal / Revision identity and accepted state;
- currency;
- ungrouped commercial units;
- Pricing Groups as atomic units with member Areas;
- accepted target amount per commercial unit;
- already-converted state and linked Order where applicable.

No cost, supplier/internal notes or Administrative Fee implementation details are exposed.

### Mutation

`create_order_from_accepted_project_proposal(...)`

Inputs include exact Revision, selected Area ids, idempotency key and normal Order header context listed above.

The RPC must atomically:

1. authenticate and authorize;
2. lock/re-read Proposal, exact Revision, acceptance, selected Areas and groups;
3. reject non-accepted, empty, foreign, duplicate or already-converted scope;
4. enforce full Pricing Group membership;
5. validate Proposal/customer currency equality;
6. resolve canonical SERVICE server-side;
7. regenerate accepted target prices entirely from immutable DB rows, ignoring browser-provided Proposal prices;
8. solve deterministic Administrative Fee-safe base line amounts;
9. call existing canonical `create_project_customer_order(...)` with `initial_status='draft'`, zero legacy payment commission and zero Order Discount;
10. verify canonical customer-visible line/Order amounts against accepted targets;
11. persist immutable header/line/Area source links;
12. return the canonical Order id.

Any failure rolls back Order creation and provenance together.

### Conversion history / Order origin

Provide authenticated fixed-projection reads:

- `get_project_proposal_order_conversions(...)` for Proposal/Project history;
- `get_customer_order_proposal_origin(p_order_id uuid)` for internal Order origin context.

## Admin UI

### Proposal tab selection

For an accepted Revision and authorized user, render `Create Order from Proposal`.

A focused selection surface:

- shows direct/ungrouped Areas individually;
- shows Pricing Groups once as atomic units with member Areas;
- disables already-converted scope and links the existing Order;
- displays selected accepted pre-tax total;
- on Continue navigates to the existing Customer New Order route with explicit `projectId`, `proposalRevisionId` and selected Proposal Area ids.

The selector does **not** create the Order directly.

### Existing New Order reuse

Extend the existing New Order page/component; do not create a second Order editor.

In Proposal conversion mode:

- show a prominent accepted Proposal source banner;
- load the authoritative preview again and validate selected Areas;
- render selected commercial units as locked Proposal source lines;
- do not accept browser-editable Proposal source prices;
- disable normal initial Product/Countertop/Service additions until the Draft is created;
- keep normal Order-owned header context editable;
- force initial Order Discount to zero;
- keep Administrative Fee visible internally;
- preview accepted customer-visible pre-tax sell, internal Base Sell / Administrative Fee relationship, tax and final total without inventing browser arithmetic as authority;
- Save calls `create_order_from_accepted_project_proposal`, not generic item-price creation;
- success redirects to canonical Order Detail.

The ordinary New Order route behavior is unchanged when no Proposal conversion source is present.

## Internal Order origin

Order Detail shows a read-only internal source card when conversion provenance exists:

- Proposal number;
- accepted Revision number;
- selected Areas / Pricing Groups;
- accepted source amount;
- conversion timestamp.

Later Order revisions never rewrite Proposal or conversion provenance.

## Security

- no service-role browser credential;
- no anonymous conversion/read access;
- conversion tables are not directly browser writable;
- RLS enabled and append-safe lifecycle enforced;
- PUBLIC execute revoked;
- SECURITY DEFINER functions use explicit safe `search_path`;
- exact accepted Revision + acceptance row revalidated at mutation time;
- browser never supplies authoritative Proposal prices;
- no accepted Proposal internal/cost/supplier data leaks into customer/dealer surfaces.

## Non-goals

P6 does not:

- require a Proposal to create an Order;
- create an Order automatically on acceptance;
- perform FX conversion;
- create a new normal Product pricing route;
- derive procurement/reservation from Proposal material text;
- auto-create Procurement, Shipment, Installation, Invoice or Calendar state;
- auto-confirm converted Orders;
- mutate accepted Proposal content;
- convert post-acceptance Change Orders;
- rewrite employee commission semantics.

## Acceptance

- standalone and normal Project Order creation continue without Proposal source;
- Proposal acceptance alone creates zero Orders;
- exact accepted Revision + acceptance is required;
- ungrouped Areas can feed separate Orders;
- Pricing Groups are atomic and their sell amount appears once;
- selected Areas cannot silently convert twice;
- same idempotency request retries safely; mismatched reuse fails;
- currency mismatch fails closed;
- converted Order is Draft and belongs to the same Project/Customer;
- accepted customer-visible pre-tax amount is preserved exactly despite Administrative Fee;
- tax uses the existing Order contract after the accepted pre-tax sell;
- no arbitrary Product price override is introduced;
- immutable Proposal source evidence survives later Order item edits;
- normal New Order behavior is unchanged without Proposal conversion parameters.