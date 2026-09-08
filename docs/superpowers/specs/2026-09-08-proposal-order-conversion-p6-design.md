# P6 — Proposal → Order Conversion Design

Date: 2026-09-08

## 1. Goal

Add an explicit, auditable conversion path from an accepted Project Proposal Revision into a canonical Customer Order without changing the normal Order creation paths.

The system must continue to support all three creation modes:

1. standalone Customer Order with no Project and no Proposal;
2. Project Order created from scratch with no Proposal;
3. Project Order created explicitly from an accepted Proposal Revision.

Proposal acceptance alone never creates an Order.

## 2. Existing contracts preserved

- `customer_orders` remains the authoritative operational/commercial Order record after conversion.
- Existing `create_customer_order` and `create_project_customer_order` RPC invariants remain authoritative.
- Normal Product pricing remains Price Group driven.
- Arbitrary manual price override is not opened for normal Products.
- The canonical active `SERVICE` product with `product_type=SERVICE` and `pricing_model=manual_service` is the existing Order route that accepts an explicit commercial amount.
- Administrative Fee remains an internal revenue adjustment and is never a customer-facing line.
- Proposal acceptance is immutable and belongs to an exact Proposal Revision.
- Proposal grouped pricing is charged once per Pricing Group.
- Accepted Proposal customer-facing commercial scope excludes internal notes, supplier-only context, and other internal-only metadata.
- The authoritative Proposal total remains the existing DB rule: sum of ungrouped `direct_sell_amount` values plus each Pricing Group `sell_amount`, with null ungrouped direct amounts contributing zero.

## 3. Conversion eligibility

Conversion is allowed only when all of the following are true at the authoritative DB boundary:

- Proposal belongs to the selected Project.
- Revision belongs to that Proposal and Project.
- Revision state is `accepted`.
- An effective acceptance record exists for that exact Revision.
- Caller has both Proposal-management and Order-management authority.
- Selected Areas all belong to that exact accepted Revision.
- At least one Area is selected.
- Proposal currency equals the Project Customer / resulting Order currency.
- Exactly one canonical active manual `SERVICE` product resolves by `sku=SERVICE`, Product Type `SERVICE`, and pricing model `manual_service`.

No FX conversion is invented in P6. Currency mismatch fails closed.

## 4. Commercial-unit selection

### 4.1 Ungrouped Areas

Every Area with no Pricing Group is an independent selectable commercial unit.

Its accepted sell amount is:

`coalesce(direct_sell_amount, 0)`

This matches the current authoritative Proposal total rule. Therefore an accepted ungrouped Area with no explicit direct price can still be converted as a `$0` accepted scope line rather than being silently dropped.

Ungrouped Areas can be split across different Orders.

### 4.2 Pricing Groups

Areas sharing one Proposal Pricing Group share one accepted sell amount. That amount cannot be decomposed safely after acceptance.

Therefore a Pricing Group is atomic for conversion:

- UI presents the group as one selectable commercial unit and lists its member Areas.
- Selecting the group selects all member Areas.
- A partial group selection sent directly to the RPC is rejected.
- The Pricing Group sell amount is represented once in the resulting Order.

This preserves Proposal grouped-pricing semantics and prevents double counting or arbitrary post-acceptance allocation.

## 5. Order creation model

The conversion creates a **Draft Project Order** only.

The user still chooses normal Order context in the existing New Order experience:

- Price Group
- fulfillment type
- payment method
- Administrative Fee percent
- billing/shipping address
- expected delivery date
- customer reference
- customer/internal notes
- tax rate

Proposal conversion does not auto-confirm the Order.

Operational Product detail may be refined after conversion using the normal Order editing/revision rules. The source Proposal link remains historical evidence of the initial accepted commercial scope.

## 6. Proposal commercial amounts → canonical Order lines

P6 does not add a new arbitrary Product pricing mode.

Each selected Proposal commercial unit becomes an initial manual `SERVICE` Order line:

- ungrouped Area → one SERVICE line;
- selected Pricing Group → one SERVICE line for the group, with all group Areas linked to that line.

Customer-safe line note text is derived from immutable Proposal snapshot fields. It may include:

- Area name;
- customer-safe material description;
- finish / thickness where useful;
- Pricing Group label and customer-safe description;
- member Area names for grouped pricing.

It must not include:

- `internal_notes`;
- `supplier_snapshot`;
- `measurement_notes`;
- internal readiness/status notes that are not part of customer commercial scope;
- Administrative Fee labels or values.

The conversion source tables preserve richer internal source snapshots separately from customer-facing Order line text.

## 7. Administrative Fee reconciliation

Accepted Proposal sell amounts are customer-visible, pre-tax commercial amounts.

Administrative Fee must not be added on top of the accepted Proposal amount. Instead, the conversion RPC derives canonical base SERVICE line amounts so that after the selected Administrative Fee snapshot is applied:

`customer_visible_sell_amount == selected accepted Proposal scope amount`

at cent precision.

Tax is then applied by the existing Order tax contract.

For example, if the selected accepted Proposal scope is `$10,300` and the Order Administrative Fee is `3%`, the RPC derives the internal base sell necessary for the current Administrative Fee calculation so the customer-visible pre-tax sell remains exactly `$10,300`.

### 7.1 Deterministic allocation

For multiple selected commercial units:

- accepted target amounts are converted to integer cents;
- a deterministic base-cent allocation is derived using stable commercial-unit ordering;
- current Order Administrative Fee rules are applied;
- the resulting `private.customer_order_visible_line_pricing` projection is verified against the accepted target line amounts;
- deterministic remainder adjustment is applied only as necessary;
- if exact cent reconciliation cannot be produced, conversion fails and the transaction rolls back.

The final transaction must verify:

- visible converted line total for every commercial unit equals its accepted Proposal target amount;
- sum of visible converted lines equals selected accepted Proposal scope total;
- `customer_visible_sell_amount` equals the same selected scope total before tax;
- no `$0.01` drift remains.

## 8. Canonical persistence model

Use append-safe source-link records rather than nullable Proposal columns on all Orders.

### 8.1 `customer_project_proposal_order_conversions`

One immutable conversion header per created Order.

Required semantics/fields:

- `id uuid primary key`
- `project_id uuid not null`
- `proposal_id uuid not null`
- `revision_id uuid not null`
- `acceptance_id uuid not null`
- `order_id uuid not null unique`
- `idempotency_key uuid not null unique`
- `request_fingerprint text not null`
- `proposal_number_snapshot text not null`
- `revision_no_snapshot integer not null`
- `currency_code varchar(3) not null`
- `accepted_scope_sell_amount numeric not null`
- `administrative_fee_percent_snapshot numeric not null`
- standard created metadata

Rows are append-safe: browser update/delete is not allowed.

### 8.2 `customer_project_proposal_order_conversion_lines`

One immutable record for each Proposal commercial unit represented by an initial Order line.

Required semantics/fields:

- `id uuid primary key`
- `conversion_id uuid not null`
- `initial_order_item_id uuid null` with `ON DELETE SET NULL`
- `commercial_unit_kind text` constrained to `ungrouped_area` or `pricing_group`
- `proposal_pricing_group_id uuid null`
- `direct_proposal_area_id uuid null`
- `label_snapshot text not null`
- `description_snapshot text null`
- `accepted_sell_amount numeric not null`
- `base_sell_amount_snapshot numeric not null`
- `sort_order integer not null`

The historical conversion record survives later Order item replacement/deletion.

### 8.3 `customer_project_proposal_order_conversion_areas`

One immutable source-area link per selected accepted Area.

Required semantics/fields:

- `conversion_id uuid not null`
- `conversion_line_id uuid not null`
- `proposal_area_id uuid not null unique`
- `area_name_snapshot text not null`
- `material_description_snapshot text null`
- `scope_notes_snapshot text null`
- `sort_order integer not null`

The unique `proposal_area_id` constraint prevents silently converting the same accepted Area scope twice.

Grouped Areas point to the same conversion line, so group pricing remains represented once.

## 9. Idempotency and duplicate prevention

The conversion RPC accepts `p_idempotency_key uuid`.

The server derives a canonical SHA-256 request fingerprint from every immutable creation input that can affect the resulting Order, including:

- Revision id;
- sorted selected Area ids;
- Price Group id;
- billing/shipping address ids;
- expected delivery date;
- customer reference/notes/internal notes after canonical normalization;
- tax rate;
- payment method id;
- fulfillment type;
- Administrative Fee percent.

Rules:

- same idempotency key + same fingerprint returns the already-created Order;
- same idempotency key + different fingerprint fails closed;
- a source Area already linked by an earlier successful conversion cannot be converted again;
- a Pricing Group with any already-converted member cannot be converted again;
- normal manually-created Orders remain unaffected and have no conversion record.

## 10. RPC boundary

### 10.1 Read preview

Add:

`get_project_proposal_order_conversion_preview(p_revision_id uuid)`

It returns only the data necessary for selection and New Order prefill:

- Project / Customer identity;
- Proposal / Revision identity and accepted status;
- currency;
- selectable ungrouped Areas;
- selectable Pricing Groups with member Areas;
- accepted sell amount per commercial unit;
- already-converted status and linked Order number where applicable.

No internal supplier or cost data is exposed by this preview.

### 10.2 Conversion write

Add:

`convert_project_proposal_to_order(...)`

Selection input is `p_area_ids uuid[]`. The server canonicalizes/sorts the ids and validates complete Pricing Group membership.

Other inputs are the normal Order header inputs already required by the Project Order flow plus `p_revision_id`, `p_idempotency_key`, and `p_administrative_fee_percent`.

The RPC must:

1. lock and re-read accepted Proposal/Revision/Areas/Pricing Groups;
2. validate eligibility and atomic Pricing Group selection;
3. canonicalize the full request and derive `request_fingerprint`;
4. return the prior Order only for a matching idempotent retry;
5. reject already-converted source scope;
6. regenerate all Proposal source prices from accepted DB data, ignoring browser-supplied Proposal prices;
7. resolve the canonical SERVICE product unambiguously;
8. derive Administrative Fee-safe base line amounts;
9. call the existing Project Order creation boundary rather than inserting a parallel Order model;
10. verify customer-visible line and selected Proposal scope reconciliation;
11. insert immutable conversion header/line/Area links;
12. return the canonical Order id;
13. complete everything in one transaction or roll back everything.

## 11. Admin UI flow

### 11.1 Proposal tab

For an accepted Revision and authorized user, show:

`Create Order from Proposal`

Opening the action displays a selection modal/card:

- ungrouped Areas are individually selectable;
- Pricing Groups are selectable as one grouped unit and show their member Areas;
- already-converted Areas/groups are disabled and show the linked Order where available;
- selected accepted pre-tax total is shown.

### 11.2 Existing New Order reuse

After selection, navigate into the existing New Order route with an explicit Proposal conversion source.

Extend the New Order page/component rather than create a second Order editor.

In conversion mode:

- show a prominent accepted Proposal source banner;
- render selected Proposal commercial units as locked source lines;
- normal Product add/remove controls are not available before the initial conversion save;
- normal Order header fields remain editable;
- Administrative Fee remains visible to authorized Admin users as the internal Order setting;
- Order preview shows accepted customer-visible pre-tax sell, internal Base Sell / Administrative Fee breakdown, tax, and final total;
- save uses `convert_project_proposal_to_order`, not generic browser-supplied item pricing.

The browser may carry Revision/Area identity between screens, but never carries authoritative Proposal prices. The conversion preview and write RPC both re-read source prices from DB.

After creation, redirect to normal Order Detail/Edit. From that point the Order is authoritative and follows normal revision/lifecycle rules.

## 12. Order origin visibility

Add:

`get_customer_order_proposal_origin(p_order_id uuid)`

Order Detail shows an internal banner/card when a conversion exists:

- Proposal number;
- accepted Revision number;
- selected Areas / Pricing Groups;
- accepted source amount;
- conversion timestamp.

This is internal Admin context and must not create a new customer-facing Proposal/Administrative Fee disclosure.

## 13. Security / RLS

- No service-role credential in browser code.
- New conversion tables are not directly browser-writable.
- Public write RPC checks caller permission explicitly and delegates Order creation to existing canonical boundaries.
- Preview/read RPC returns a fixed projection only.
- `PUBLIC EXECUTE` is revoked according to current Modulex RPC conventions.
- SECURITY DEFINER functions use an explicit safe `search_path`.
- No draft/sent/rejected Proposal Revision can be converted.
- No accepted Proposal internal notes/cost/supplier metadata leaks to customer/dealer surfaces.

## 14. Audit semantics

Conversion records are immutable historical evidence of how the Draft Order was initially created.

Later Order revisions do not rewrite the Proposal or conversion records.

The system can therefore answer both questions independently:

- “What exact accepted Proposal scope created this Order?”
- “What does the Order contain now?”

## 15. Stable errors

The RPC boundary exposes stable errors for at least:

- `PROPOSAL_ORDER_REVISION_NOT_ACCEPTED`
- `PROPOSAL_ORDER_ACCEPTANCE_MISSING`
- `PROPOSAL_ORDER_PROJECT_MISMATCH`
- `PROPOSAL_ORDER_FORBIDDEN`
- `PROPOSAL_ORDER_EMPTY_SELECTION`
- `PROPOSAL_ORDER_AREA_REVISION_MISMATCH`
- `PROPOSAL_ORDER_PARTIAL_PRICING_GROUP`
- `PROPOSAL_ORDER_SCOPE_ALREADY_CONVERTED`
- `PROPOSAL_ORDER_IDEMPOTENCY_MISMATCH`
- `PROPOSAL_ORDER_CURRENCY_MISMATCH`
- `PROPOSAL_ORDER_SERVICE_PRODUCT_INVALID`
- `PROPOSAL_ORDER_FEE_RECONCILIATION_FAILED`

Client domain maps these to actionable Admin messages.

## 16. Testing / acceptance

### DB / migration contract

Tests must prove:

- standalone Order creation remains valid with no Proposal source;
- Project Order creation remains valid with no Proposal source;
- Proposal acceptance does not create an Order;
- only an accepted exact Revision can convert;
- ungrouped Areas may be split into multiple Orders;
- ungrouped null direct price converts as accepted `$0` rather than being dropped;
- grouped Areas cannot be partially converted;
- group sell amount appears once;
- selected source Areas cannot silently convert twice;
- retry with the same idempotency key/fingerprint is safe;
- reuse of an idempotency key with changed input fails closed;
- Proposal/Order currency mismatch fails closed;
- conversion produces a Draft Project Order;
- resulting Order Project/Customer match the Proposal Project;
- customer-visible pre-tax converted lines equal accepted source amounts exactly at cent precision;
- Administrative Fee remains internal while accepted customer-visible sell is preserved;
- tax is calculated by the existing Order contract after accepted pre-tax sell;
- no new arbitrary Product price override is introduced;
- source records remain after later Order item changes.

### UI contract

Tests must prove:

- Create Order action is visible only for accepted Proposal + authorized user;
- grouped Areas are visibly atomic;
- already-converted scope is disabled;
- New Order conversion mode reuses canonical Order header UI;
- Proposal source pricing is locked before initial conversion save;
- normal New Order path is unchanged when no Proposal source exists;
- successful conversion redirects to canonical Order Detail.

### Final gates

Run current relevant suites including:

- Proposal / Project Base domain smoke;
- Order A1/domain smoke;
- Admin UI strict regression;
- RBAC/security contracts;
- TypeScript typecheck;
- lint;
- production build;
- Supabase security/performance advisors after DDL in a safe environment / production closeout after merge.

## 17. Explicit non-goals

P6 does not:

- require a Proposal to create an Order;
- auto-create an Order when a Proposal is accepted;
- perform FX conversion;
- create a new Product pricing mode;
- reinterpret normal Product prices as Proposal prices;
- automatically derive procurement/reservation from Proposal material text;
- automatically confirm converted Orders;
- rewrite accepted Proposal content after conversion;
- rewrite employee commission semantics.

## 18. Success criteria

P6 is complete when an authorized user can choose eligible scope from an exact accepted Proposal Revision, create a canonical Draft Project Order through the existing Order architecture, preserve accepted customer-visible commercial value exactly, retain immutable Proposal source evidence, and safely create additional Orders from other unconverted accepted Areas while ordinary non-Proposal Order creation continues unchanged.
