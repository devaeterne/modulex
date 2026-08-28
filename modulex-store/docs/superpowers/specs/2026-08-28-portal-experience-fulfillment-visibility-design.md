# P1.5 — Portal Experience & Fulfillment Visibility

Date: 2026-08-28
Status: Design for review
Branch: `phase-1/portal-experience-fulfillment`

## 1. Purpose

P1.5 turns the first functional Store portal shell into a production-facing Oakwell experience while expanding read-only operational visibility for Customer and Dealer accounts.

The release has three goals:

1. Make every Store portal/auth screen visually consistent with the existing Oakwell public Store, including the existing light/dark theme behavior.
2. Give Customer accounts safe read-only visibility into Orders, Shipments, and Installations.
3. Give Dealer accounts a broader operational workspace, including the same fulfillment visibility plus protected Catalog/Pricing, Documents, and Account/Address information.

P1.5 does **not** introduce official invoices, e-invoicing, payments, credit management, or financial statements.

## 2. Existing foundations that remain authoritative

P1.5 builds on the current production model rather than creating a parallel portal system.

- Authentication continues to use trusted Supabase Auth `app_metadata.account_type` values:
  - `customer_portal`
  - `dealer_portal`
- Portal identity and customer ownership continue to be derived from `auth.uid()` through the existing Store portal context boundary.
- Browser requests never choose or submit a `customer_id` to gain access to portal data.
- Customer portal access remains controlled by `customers.portal_enabled`, active customer state, active portal user state, and the trusted account-type/customer-type match.
- Dealer/customer authorization continues to fail closed when the Auth identity and portal context disagree.
- Store remains free of Supabase service-role/secret credentials.

## 3. Oakwell portal design system

### 3.1 One theme system

P1.5 removes the temporary split between the public Store theme and the Account-login-only theme implementation.

The single source of truth will be the existing Store theme behavior:

- `body.dark`
- Store `ThemeToggle`
- `localStorage["theme"]`
- system color-scheme preference as the first-visit fallback
- existing Store dark-mode variables

The temporary `oakwell-theme` preference introduced by the Account login hotfix will be treated as a legacy key. On first use, it may be read only to preserve a user's existing preference, then the application will persist to `theme` only.

### 3.2 Visual language

Portal/auth UI will reuse the public Store's existing visual language rather than introducing a new dashboard theme:

- Outfit for UI/body text
- Playfair Display for selected display headings
- Oakwell cream backgrounds
- dark brown/charcoal surfaces
- gold/orange brand accent
- existing Store radius, spacing, button and transition language
- Store light/dark CSS variables

A scoped portal stylesheet will provide portal-specific layout primitives without changing public marketing-page layout behavior.

Portal components will not rely on raw Bootstrap `bg-light`, `bg-white`, `text-secondary`, and generic card styling as their primary visual system.

### 3.3 Shared shells

Two shared presentation shells will be introduced.

**PortalAuthShell**

Used by all account/dealer authentication flows:

- Account login
- Account forgot password
- Account reset password
- Account activation
- legacy Dealer login
- legacy Dealer forgot/reset/activation routes retained for compatibility

It provides Oakwell branding, responsive auth-card layout, one shared theme toggle, consistent alerts/forms/buttons, and a route back to the Store where appropriate.

**PortalShell**

Used by protected Customer and Dealer workspaces. It does not reinsert the full marketing Navbar/Footer. It provides:

- Oakwell logo/brand header
- account company name and portal role
- shared theme toggle
- sign out
- responsive portal navigation
- desktop navigation rail/header treatment and compact mobile navigation
- consistent page heading, card, status badge, table/list, empty-state and timeline patterns

This preserves an application-like workspace while remaining visually Oakwell.

## 4. Customer information architecture

Customer portal navigation:

- Overview
- Orders
- Shipments
- Installations

### 4.1 Customer Overview

Overview summarizes only the authenticated customer's data:

- recent orders
- active/recent shipments
- upcoming/current installation
- compact status counts

No monetary data is added to the Customer portal in P1.5.

### 4.2 Customer Orders

Existing P1.4 read-only order access remains the base behavior.

Customer order list/detail continues to exclude:

- unit price
- discounts
- subtotal/tax/totals
- payment/payment commission
- cost/margin/profit
- internal notes

The UI is redesigned to the shared portal patterns and may add fulfillment links/status context when related shipments/installations exist.

### 4.3 Customer Shipments

Customer receives list and detail views for shipments belonging to its derived customer identity.

Allowed shipment fields:

- shipment id/number
- related order id/number
- status
- customer reference
- shipping address snapshot
- carrier
- service level
- tracking number
- picking/packed/shipped/delivered/cancelled timestamps
- shipment item line number
- SKU snapshot
- product name snapshot
- ordered quantity snapshot
- shipment quantity

Explicitly excluded:

- `internal_notes`
- source warehouse/location IDs
- stock deduction internals
- created/updated internal actor IDs

Shipment statuses are presented using the existing lifecycle:

`draft -> picking -> packed -> shipped -> delivered`

`cancelled` is represented as a terminal exception state.

### 4.4 Customer Installations

Customer receives list and detail views for installations belonging to its derived customer identity.

Allowed installation fields:

- installation id/number
- related order id/number
- related shipment number when available
- status
- scheduled start/end
- installation address snapshot
- team name
- customer-facing contact name/phone
- customer-facing notes
- completion notes
- confirmed/started/completed/cancelled timestamps

Explicitly excluded:

- `assigned_to`
- `internal_notes`
- internal actor IDs

Installation lifecycle:

`scheduled -> confirmed -> in_progress -> completed`

`cancelled` is represented as a terminal exception state.

## 5. Dealer information architecture

Dealer portal navigation:

- Overview
- Catalog
- Orders
- Shipments
- Installations
- Documents
- Account

Dealer inherits the same customer-isolated fulfillment behavior but receives additional commercial/catalog information where specifically authorized.

### 5.1 Dealer Overview

Dealer Overview includes:

- recent orders
- active shipments
- upcoming/current installations
- catalog/pricing availability state
- quick links to Catalog, Orders, Documents and Account

It does not present invoice/payment/credit widgets.

### 5.2 Dealer Catalog and pricing

Dealer Catalog is protected and uses published Store products as the product visibility boundary. It does not expose internal/unpublished/archived products, internal stock controls, cost or margin data.

#### Verified pricing authority

Current `main` and production do not contain a separate persisted `dealer_pricing_enabled` / `show_prices` customer boolean.

The existing persisted Admin-controlled pricing gates are:

- `customers.price_group_id`
- `price_groups.is_active`
- `price_groups.available_for_orders`
- `price_groups.internal_only`

Admin already controls customer price-group assignment, and price groups have an Active on/off state. Customer assignment UI filters to order-eligible, non-internal groups.

Therefore P1.5 defines Dealer pricing as enabled only when all of the following are true:

1. the authenticated portal kind is `dealer`;
2. the customer has a `price_group_id`;
3. the assigned price group exists and is active;
4. `available_for_orders = true`;
5. `internal_only = false`.

`requires_approval` remains an Admin assignment/change-control property; it does not by itself hide an already approved assigned price group.

P1.5 will **not silently invent a second per-customer pricing boolean**. The above existing Admin controls are the pricing authority for this release.

#### Price lookup

When pricing is enabled, protected Dealer catalog price resolution uses the Dealer customer's assigned price group and customer currency. Only current active `product_prices` rows for that exact product/group/currency combination are eligible.

There is no automatic fallback to List Price when the assigned Dealer group has no current product price. A missing price is represented as unavailable/contact-sales rather than silently showing a different tier.

When the pricing gate is closed, protected RPC payloads do not emit price fields. Pricing is not merely hidden with CSS.

### 5.3 Dealer order pricing

The existing non-priced Store order RPC remains safe for Customer access.

Dealer receives a separate Dealer-authorized order-detail boundary. Only when the pricing gate is open may it include customer commercial order snapshots:

- currency
- line unit price
- line discount percent/amount
- line subtotal/line total
- order subtotal
- order discount
- tax rate/amount
- order total

The Dealer response never includes:

- cost/current cost
- margin/profitability
- payment commission percentage/amount
- internal notes
- internal approval/risk metadata

These amounts are labeled as **order amounts**, not invoices or tax/legal documents.

If the Dealer pricing gate is closed, the response uses the same non-monetary shape/boundary as the Customer portal.

## 6. Dealer Documents

`customer_documents` currently contains metadata, but production does not currently have a dedicated `customer-documents` Storage bucket and existing rows must not automatically become externally visible.

P1.5 therefore adds an explicit external-visibility boundary:

- `customer_documents.portal_visible boolean not null default false`
- existing documents remain hidden by default
- Admin explicitly marks a document Dealer-visible
- only Dealer portal accounts receive the Documents feature in P1.5

A private `customer-documents` bucket will be used for portal-downloadable customer documents. New Admin upload/visibility controls must write metadata that maps the object to the correct customer.

Dealer downloads use short-lived signed access through an authenticated Store server flow and Storage policies. The Store receives no service-role key.

A Dealer may access an object only when:

- its derived customer owns the `customer_documents` row;
- the document is active;
- `portal_visible = true`;
- bucket/path matches the permitted document metadata.

No Customer portal document access is added in P1.5.

## 7. Dealer Account and Addresses

Dealer Account is read-only in P1.5.

It may show:

- customer/company name
- email
- phone
- website
- country
- currency
- customer-since date
- assigned public price-group name only when Dealer pricing is enabled
- active billing/shipping addresses
- default billing/shipping indicators

It does not expose internal sales-rep IDs, internal notes, credit-hold reasons, discount notes, tax/admin controls, or internal activity.

Self-service edits are intentionally deferred. This avoids creating address/profile mutation and approval rules as part of the visibility release.

## 8. Invoice and financial boundary

P1.5 does not expose `customer_invoices` to Customer or Dealer portals.

The current database invoice model is operational data only and must not be presented as an official invoice, e-invoice, tax invoice, or legally authoritative accounting document.

The following are out of scope until the US accounting/e-invoice integration is decided:

- Invoices menu/pages
- e-invoice generation
- payment status/payment collection
- credit limits/credit statements
- account statements
- official billing documents

Future accounting integration may map or replace current operational invoice records without requiring the portal UI to have made a legal-document promise.

## 9. Database/API security architecture

### 9.1 Shared ownership rule

Every new portal read function starts from the existing authenticated portal context and derives `customer_id` internally.

No public Store RPC accepts a customer ID as an authorization selector.

### 9.2 New read boundaries

P1.5 will add narrow authenticated wrappers over private functions for:

- portal dashboard summary
- shipment list
- shipment detail
- installation list
- installation detail
- Dealer catalog with conditional pricing
- Dealer order detail with conditional pricing
- Dealer account/addresses
- Dealer document metadata/download authorization

Public wrappers follow the existing P1.4 model:

- least privilege
- explicit `authenticated` execute grant
- no `anon` execute
- no default `PUBLIC` execute
- privileged logic lives in private functions
- explicit search path hardening where SECURITY DEFINER is required

### 9.3 Neutral not-found behavior

Owned/unowned resource distinctions must not allow cross-customer enumeration.

Foreign shipment, installation, order or document IDs return a neutral unavailable/not-found result rather than revealing that another customer owns the record.

### 9.4 Pricing payload enforcement

Pricing visibility is evaluated server-side for every Dealer price-bearing response. UI state is never the authorization source.

Contract tests must prove that when pricing is unavailable, monetary keys are absent from the returned Dealer JSON payload, not merely visually hidden.

## 10. Store route structure

Protected Customer routes:

- `/account`
- `/account/orders`
- `/account/orders/[id]`
- `/account/shipments`
- `/account/shipments/[id]`
- `/account/installations`
- `/account/installations/[id]`

Protected Dealer routes:

- `/dealer`
- `/dealer/catalog`
- `/dealer/orders`
- `/dealer/orders/[id]`
- `/dealer/shipments`
- `/dealer/shipments/[id]`
- `/dealer/installations`
- `/dealer/installations/[id]`
- `/dealer/documents`
- `/dealer/account`

All protected routes remain covered by Supabase SSR session refresh and portal authorization.

## 11. Shared UI components

The portal implementation should favor shared components rather than Customer/Dealer duplication:

- PortalAuthShell
- PortalShell
- PortalNavigation
- PortalPageHeader
- PortalSummaryCard
- PortalStatusBadge
- PortalEmptyState
- PortalTimeline
- PortalOrderList/Detail
- PortalShipmentList/Detail
- PortalInstallationList/Detail

Dealer-only components should be limited to genuinely Dealer-specific behavior such as protected Catalog pricing, Documents and Account.

## 12. Responsive and accessibility requirements

- Full functionality at desktop, tablet and mobile widths.
- Navigation remains usable without horizontal page overflow.
- Theme toggle has an accessible label/state.
- Current page is identifiable in portal navigation.
- Status is communicated by text as well as color.
- Keyboard focus remains visible in light and dark themes.
- Tables collapse or transform into readable card/list layouts on narrow screens.
- Form/auth errors use accessible status/alert semantics.

## 13. Failure behavior

- Missing/expired auth -> unified login flow.
- Authenticated but suspended/disabled/mismatched account -> session-clear/access-unavailable flow.
- Missing shipment/installation/document ownership -> neutral unavailable state.
- Dealer pricing gate closed -> Catalog remains usable without prices and order UI remains non-priced.
- Assigned price group has no current product price -> show price unavailable/contact-sales for that product; do not fall back silently.
- Document file missing while metadata exists -> user-facing unavailable state; do not expose raw storage errors/paths.

## 14. Testing and verification

Implementation must extend Store/Admin contracts and add database rollback smoke coverage.

Required verification includes:

### Theme/UI contracts

- every Account and Dealer auth route uses the shared auth shell/theme system
- protected Customer and Dealer layouts use shared PortalShell
- only one Store theme storage key is written
- public Store theme behavior remains intact

### Customer isolation

With two independent customers:

- Customer A cannot list/detail Customer B orders, shipments or installations
- neutral foreign-ID behavior is preserved
- Customer cannot access Dealer-only RPCs/pages

### Dealer isolation and pricing

- Dealer A cannot see Dealer B data
- non-dealer portal user cannot invoke Dealer price-bearing functions
- active assigned eligible Dealer price group -> exact group/current currency price can appear
- inactive/no/internal/non-order-eligible group -> no monetary keys emitted
- missing assigned-tier product price -> no List Price fallback
- order pricing never emits cost, margin, profit, payment commission or internal notes

### Documents

- existing documents default hidden
- only `portal_visible` Dealer-owned documents are listable/download-authorized
- foreign customer document denied neutrally
- anon denied
- Customer portal denied
- private Storage bucket cannot be read directly without the authorized portal path

### Build/regression

- Store full smoke suite
- new P1.5 contracts
- Store scoped/full lint as appropriate
- Store production build
- Admin portal/customer regression contracts
- Admin lint/build for changed customer/document/pricing surfaces
- production rollback smoke before leaving any production fixture data

## 15. Delivery strategy

P1.5 is one architectural phase but should be implemented in three ordered slices on the same phase design, so each boundary can be verified before the next expands it:

1. **P1.5A — Oakwell Portal UI foundation**
   - shared theme
   - auth shell
   - protected portal shell/navigation
   - existing Orders restyle

2. **P1.5B — Fulfillment visibility**
   - Customer + Dealer Shipments
   - Customer + Dealer Installations
   - dashboard fulfillment summaries

3. **P1.5C — Dealer expansion**
   - protected Catalog and pricing gate
   - Dealer-priced order detail boundary
   - Documents with explicit visibility/private Storage
   - read-only Account/Addresses

Each slice must preserve all previous security contracts. The final PR strategy may use separate ready PRs if that gives safer review/deployment boundaries; no PR is merged automatically.

## 16. Explicit non-goals

P1.5 does not add:

- customer/dealer order creation or editing
- shipment/installation editing
- self-service profile/address editing
- official invoices/e-invoices
- payment collection
- credit/account statements
- cost/margin/profit data
- Store service-role credentials
- public/anonymous portal data access
- automatic exposure of existing customer documents

## 17. Acceptance criteria

P1.5 is complete when:

1. All Account/Dealer auth and protected portal pages visibly use the Oakwell Store design language in both light and dark themes.
2. Customer users can safely view their own Orders, Shipments and Installations only.
3. Dealer users can safely view their own operational data plus Catalog, Documents and Account/Addresses.
4. Dealer prices are returned only through the verified Admin-controlled assigned-price-group gates and are enforced server-side.
5. Customer users receive no new pricing exposure.
6. No official invoice/e-invoice feature is presented.
7. Cross-customer, cross-portal-kind, anonymous, internal-field and disabled-pricing regression tests pass.
8. No production test residue remains.
9. Store/Admin production builds and the relevant regression suites pass before the implementation is presented for merge.
