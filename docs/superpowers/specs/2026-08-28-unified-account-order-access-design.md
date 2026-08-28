# Unified Store Account & Read-Only Order Access Design

## Status

Approved in chat on 2026-08-28. This document defines Phase 1.4 of the Modulex Store portal roadmap.

## Goal

Provide one Store account entry point for Dealer and non-Dealer Customer portal users, identify the authenticated portal kind only after successful authentication, route the user to the correct protected surface, and add customer-scoped read-only order visibility without exposing pricing.

## Scope

P1.4 includes:

- One account icon in the public Store navbar.
- One public account login surface using email and password.
- Trusted post-authentication routing to Dealer or Customer portal surfaces.
- A distinct trusted `customer_portal` Auth account type for non-Dealer external users while preserving the existing `dealer_portal` boundary.
- Generalized external portal activation/provisioning behavior in Admin.
- A shared authenticated Store portal-context contract that resolves the linked customer from `auth.uid()` and returns `portal_kind`.
- A protected Customer portal shell under `/account`.
- Dealer and Customer read-only order list/detail access scoped to the authenticated linked customer.
- Contract, database smoke, and production-safe authorization verification.

P1.4 does not include:

- Public self-signup.
- Dealer or Customer self-service user administration.
- Order creation or editing.
- Reordering.
- Pricing, discounts, taxes, totals, payment information, credit terms, profitability, or commissions.
- Customer/company profile editing.
- Shipment, invoice, installation, document, or support-ticket portals.
- MFA.
- A Store service-role/secret key.

Pricing authorization remains a later package and must not be accidentally introduced through order payloads in P1.4.

## Existing Security Contract

P1.1 established Dealer customer isolation through `customer_portal_users.auth_user_id`, active portal-user state, and `customers.portal_enabled`.

P1.2 established controlled Dealer Auth provisioning and activation with trusted `raw_app_meta_data.account_type = 'dealer_portal'`, prevented Dealer identities from inheriting internal `profiles` rows, and removed browser-authenticated direct lifecycle DML.

P1.3 added Dealer email/password login, cookie-backed Supabase SSR sessions, protected `/dealer` routing, password recovery, and server-side Dealer context validation.

P1.4 must preserve all of those guarantees while extending the same external identity model to non-Dealer customers.

## Account Classification

The business classification comes from the linked customer's `customer_types.system_key`.

- `dealer` -> external Auth identity must use trusted `app_metadata.account_type = 'dealer_portal'`.
- Any other active customer type -> external Auth identity must use trusted `app_metadata.account_type = 'customer_portal'`.

The current active customer types include `company`, `dealer`, `distributor`, `architect`, `interior_designer`, `retail_customer`, and `other`.

The Store must never trust an account type supplied by the browser or by `user_metadata`.

## Internal Auth Isolation

The existing `auth.users` creation trigger currently skips internal `profiles` provisioning only for `dealer_portal`. P1.4 must extend that guard to all trusted external portal account types.

Required behavior:

- `dealer_portal` Auth users receive no internal `profiles` row.
- `customer_portal` Auth users receive no internal `profiles` row.
- Existing internal account provisioning remains unchanged for unmarked internal Auth users.

This change is mandatory before Customer portal Auth users can be created safely.

## Unified Login Model

The public Store navbar receives one account/user icon linking to `/account`.

`/account` is the universal Store account entry route.

Behavior:

- No authenticated portal session -> redirect/render `/account/login`.
- Valid `dealer_portal` identity with authorized portal context -> redirect to `/dealer`.
- Valid `customer_portal` identity with authorized portal context -> render/redirect to the protected Customer portal shell under `/account`.
- Internal, stale, suspended, disabled, mismatched, or otherwise invalid sessions -> clear the local Store auth session and return the user to the generic account login surface.

`/account/login` accepts only email and password. It must not ask the user to choose Dealer vs Customer.

The Store must not query a public email directory before authentication. Account type is resolved only after `signInWithPassword` succeeds, preventing a public account-enumeration endpoint.

User-visible failure copy must stay generic and must not reveal whether an email belongs to a Dealer, Customer, internal Admin user, suspended portal user, or disabled customer.

The existing `/dealer/login` route may remain as a compatibility route, but it should converge on the same underlying authenticated routing/context logic rather than maintaining a second incompatible identity model.

## Shared Portal Context

P1.4 introduces a narrow authenticated portal-context RPC, conceptually `public.get_store_portal_context()`.

The function must derive identity only from `auth.uid()` and must not accept `customer_id`, email, portal-user ID, or account type as caller input.

The returned authorized context may contain only fields required by the protected shell and routing, for example:

- `ok`
- `reason`
- `portal_user_id`
- `customer_id`
- `customer_name`
- `customer_status`
- `customer_type`
- `portal_role`
- `portal_kind` (`dealer` or `customer`)

Authorization requirements:

1. `auth.uid()` is present.
2. Exactly one linked active `customer_portal_users` identity matches the Auth user.
3. The linked customer has `portal_enabled = true`.
4. The customer itself is in an allowed active state.
5. The customer's type resolves to the expected portal kind.
6. Trusted `auth.users.raw_app_meta_data.account_type` matches that expected portal kind.

A valid Supabase session alone is never sufficient.

The existing Dealer context RPC may remain for compatibility, but new common Store portal code should use the generalized context and preserve the old Dealer contract where existing P1.3 behavior depends on it.

## Admin Portal User Lifecycle

The Admin customer-detail portal access surface already manages `customer_portal_users`. P1.4 generalizes its Auth provisioning without creating a separate Customer portal table.

When Admin invites a portal user:

1. Load the customer and its `customer_types.system_key` on the server.
2. Derive the trusted external Auth account type server-side.
3. Create/link the Auth user with either `dealer_portal` or `customer_portal` app metadata.
4. Verify that no internal `profiles` row was created.
5. Continue the existing invite/activation lifecycle.

The browser cannot choose or override the Auth account type.

Invite, resend, suspend, restore, primary-user, enable-portal, and disable-portal behavior remains controlled from Admin.

Activity copy may be generalized from Dealer-specific wording to neutral Portal wording where necessary, but existing audit history must not be rewritten.

## Activation and Password Recovery Compatibility

P1.4 must not break existing Dealer activation or recovery URLs.

Preferred forward route model:

- `/account/activate` for newly generated generalized external portal invitations.
- `/account/forgot-password`
- `/account/reset-password`

Existing `/dealer/activate`, `/dealer/forgot-password`, and `/dealer/reset-password` remain compatibility paths unless removing them is proven safe and explicitly approved later.

Activation and reset flows must continue using trusted app metadata plus the authenticated portal-context boundary before writing lifecycle or password state.

Recovery responses remain non-enumerating.

## Protected Portal Surfaces

### Dealer

Existing `/dealer` remains the Dealer protected root.

P1.4 may add read-only order navigation and pages under the Dealer protected route tree, but must not remove P1.3's server-side authorization requirement.

### Customer

Protected Customer root: `/account`.

The Customer shell may display:

- Customer/company name.
- Portal role.
- Portal type/account state.
- Read-only order navigation.
- Sign-out.

Protected Customer pages must not render for Dealer identities; Dealer identities must be redirected to `/dealer`.

All account/dealer portal pages remain `noindex, nofollow`.

## Order Access Architecture

The browser must not receive broad direct SELECT access to `customer_orders` or `customer_order_items` merely because it has the Postgres `authenticated` role.

P1.4 uses narrow authenticated read RPCs that derive `customer_id` from the authenticated portal context. Caller-provided `customer_id` is forbidden.

Recommended API boundaries:

- `public.get_store_portal_orders(p_limit integer, p_offset integer)`
- `public.get_store_portal_order(p_order_id uuid)`

The implementation may choose equivalent names, but the security properties are mandatory.

### Order List Response

The list payload may include:

- order ID
- order number
- status
- order date
- expected delivery date
- customer reference
- item count
- fulfillment type

It must not include monetary fields.

### Order Detail Response

The detail payload may include:

- order ID
- order number
- status
- order date
- expected delivery date
- customer reference
- customer notes only if explicitly verified safe for customer visibility
- fulfillment type
- shipping address snapshot only if implementation review confirms it is intended customer-visible data
- order lines containing line number, SKU snapshot, product name snapshot, and quantity

The detail payload must not include:

- `unit_price`
- `discount_percent`
- `discount_amount`
- `line_subtotal`
- `line_total`
- order `subtotal`
- order `discount_amount`
- `tax_rate`
- `tax_amount`
- `total_amount`
- `payment_method_id`
- `payment_method_name_snapshot`
- `payment_commission_percent`
- `payment_commission_amount`
- `grand_total`
- profitability/cost data
- internal notes

No later UI layer should need to filter these fields out; they should not exist in the portal RPC response in the first place.

## Order Authorization Rules

For every order read:

1. Resolve the authenticated portal context from `auth.uid()`.
2. Require an authorized Dealer or Customer portal context.
3. Restrict orders to `customer_orders.customer_id = resolved_context.customer_id`.
4. For order detail, require the requested order ID to belong to that customer before returning any line data.
5. Return a neutral denied/not-found result that does not confirm another customer's order exists.

Suspending the portal user or setting `customers.portal_enabled = false` must revoke order access immediately on the next protected request without waiting for token expiry.

## Navbar Account Icon

The public Store `Navbar` receives one account icon near the existing Contact action, responsive on desktop and mobile.

Requirements:

- Use an inline SVG or existing project-native icon approach; do not add an icon dependency solely for this button.
- Accessible label: `Account`.
- Link target: `/account`.
- Preserve the existing navbar layout, logo behavior, burger menu, and Contact analytics.
- Do not expose whether a session is Dealer or Customer in the public navbar.

The icon is only an entry point. Protected routing decides the final destination.

## Session and Routing Behavior

After successful password authentication:

1. Validate the authenticated token/claims server-side.
2. Read trusted `app_metadata.account_type`.
3. Call the shared portal-context RPC with the authenticated cookie session.
4. Require the app metadata account type and database-derived portal kind to match.
5. Redirect Dealer -> `/dealer`.
6. Redirect Customer -> `/account`.

If any validation fails, clear the local Store session and show a generic account-access error.

Protected layouts repeat authorization on server render; successful login is not a permanent authorization grant.

## Error Model

Login failures use generic copy.

Examples of states that must not be distinguishable from public-facing error text:

- Unknown email.
- Wrong password.
- Internal Admin identity.
- Suspended portal user.
- `portal_enabled = false`.
- Customer disabled/ineligible.
- Dealer account with Customer metadata mismatch.
- Customer account with Dealer metadata mismatch.

Order detail for a foreign customer order must behave like unavailable/not found and must not reveal ownership.

## Database and RLS Strategy

Existing internal RLS policies on `customer_orders` and `customer_order_items` remain internal-role oriented and must not be broadened to `TO authenticated` with a weak condition.

Portal reads should use narrowly scoped privileged database functions only where necessary, with:

- explicit `auth.uid()` checks
- fixed `search_path = ''`
- revoked default `PUBLIC` execute
- execute granted only to `authenticated`
- no caller-controlled customer identity
- minimized return shape

Any private `SECURITY DEFINER` implementation must be wrapped by a deliberately exposed public function and reviewed against Supabase advisors.

## Expected File Boundaries

Exact names may be refined during implementation planning after a fresh repository inspection.

Database / migrations:

- Generalized external Auth trigger guard.
- Generalized Store portal-context RPC.
- Read-only Store portal order list/detail RPCs.
- Rollback-capable database smoke coverage.

Admin:

- Existing portal access API generalized from Dealer-only Auth provisioning to server-derived Dealer/Customer external account types.
- Existing portal access card copy adjusted only where needed.
- Portal lifecycle contract tests expanded for both account kinds.

Store auth:

- Shared account auth/context helper.
- `/account/login` and protected `/account` layout/root.
- Generalized activation/recovery compatibility where required.
- Existing Dealer auth converged on shared logic without weakening Dealer-specific routing.

Store orders:

- Focused order query/types helper consuming only the narrow RPCs.
- Shared or portal-specific order list/detail components.
- Dealer and Customer routes using the same customer-scoped order data contract.

Store chrome:

- `Navbar.tsx` account icon.
- Route-aware chrome updated so protected `/account` pages do not accidentally render public marketing chrome where the protected design calls for portal chrome.

Tests:

- Static/contract tests for routing, metadata boundaries, forbidden order fields, and navbar entry.
- SQL smoke for cross-customer isolation and immediate revocation.
- Live Auth smoke where needed using disposable identities with cleanup.

## Testing Strategy

Implementation follows TDD/contract-first development.

### Auth/Identity Contracts

Verify at minimum:

- `dealer_portal` and `customer_portal` both bypass internal profile creation.
- Unmarked internal Auth users preserve current internal provisioning.
- Admin derives account type from customer type server-side.
- Browser input cannot choose account type.
- Shared login does not pre-query email ownership.
- Dealer login routes to Dealer surface.
- Customer login routes to Customer surface.
- Internal identities are denied.
- Metadata/context mismatch is denied and signed out.
- Suspended and disabled states are denied.

### Order Contracts

Verify at minimum:

- An authorized portal user can list only its linked customer's orders.
- Customer A cannot read Customer B order list or detail.
- Dealer and non-Dealer Customer use the same scoped order contract.
- Suspended portal user loses order access.
- Portal-disabled customer loses order access.
- Anon cannot execute order RPCs.
- Authenticated internal users without a valid portal context cannot use portal order RPCs.
- Response JSON does not contain any forbidden monetary/internal fields.
- Direct browser DML/write paths remain unavailable.

### UI Contracts

Verify at minimum:

- Public navbar has one accessible Account icon linking to `/account`.
- Login form has no Dealer/Customer selector.
- Protected Customer shell redirects Dealer identities away.
- Protected Dealer shell still rejects Customer identities.
- Order list/detail pages render only approved non-monetary fields.

### Repository Verification Before PR

Before P1.4 can be called PR-ready, run and record fresh evidence for all applicable checks available in the environment:

- `modulex-store` portal/auth/order contract tests.
- `modulex-admin` portal lifecycle contract tests.
- Relevant database smoke tests with rollback/fixture cleanup.
- Relevant lint checks.
- `next build` for affected packages when runnable.
- Lockfile consistency.
- Supabase Security Advisor.
- Supabase Performance Advisor.
- Final branch diff/security review.

Do not claim a test, build, advisor, or live smoke passed unless it was actually run successfully.

## Security Invariants

P1.4 is complete only if all of these remain true:

- No public portal signup exists.
- No Store service-role/secret key exists.
- Email ownership is not publicly enumerable before authentication.
- `user_metadata` is never an authorization source.
- Dealer Auth remains distinct from Customer Auth through trusted app metadata.
- Dealer and Customer external Auth users do not inherit internal profiles.
- A valid Supabase session alone does not grant portal access.
- Portal customer identity is derived from `auth.uid()`, never caller-provided customer IDs.
- A portal user can access only the linked customer's orders.
- Suspension and portal disablement revoke protected/order access immediately.
- Portal order payloads contain no pricing, tax, totals, commissions, profitability, or internal notes.
- Existing Dealer activation/login/recovery compatibility is preserved.
- Internal Admin identities cannot use Store portal protected surfaces.

## Delivery Workflow

1. Branch from the current merged `main` after P1.3.
2. Commit this approved design spec.
3. User reviews the written spec.
4. Create a detailed TDD implementation plan using the Superpowers writing-plans workflow.
5. Implement on the P1.4 feature branch.
6. Apply and verify required production database migrations.
7. Run rollback/live smokes with complete fixture cleanup.
8. Run Supabase advisors and repository verification.
9. Open a PR for user review/merge.
10. Do not merge the PR and do not trigger Vercel production deployment.