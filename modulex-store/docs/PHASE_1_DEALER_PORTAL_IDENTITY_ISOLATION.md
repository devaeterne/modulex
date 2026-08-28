# Phase 1.1 — Dealer Portal Identity & Customer Isolation Foundation

## Goal

Create the database-level identity boundary for the Oakwell dealer portal before adding login UI, invitations, order pages, or pricing.

## Approved access contract

A dealer portal request is authorized only when all of these conditions are true:

1. `auth.uid()` is linked to exactly one `public.customer_portal_users.auth_user_id`.
2. The linked portal user has `status = 'active'`.
3. The linked customer has `portal_enabled = true`.

If any condition fails, the caller receives a generic access-denied result. The resolver must not reveal whether the missing condition was an unknown user, suspended user, or disabled customer.

## Isolation rules

- One Auth user may map to at most one portal customer.
- The caller never supplies a customer ID to the identity resolver.
- Dealer-facing code derives customer scope from `auth.uid()` on the database side.
- No dealer SELECT policy is added to `customers` or `customer_portal_users` in this package.
- No direct dealer write access is added.
- Existing Admin/Sales/Finance policies remain unchanged.

## Data minimization

The public portal-context RPC returns only the fields required to establish portal identity:

- `portal_user_id`
- `customer_id`
- `customer_name`
- `customer_status`
- `portal_role`

It must not expose price group, tax/registration identifiers, internal notes, credit/commercial settings, or other customer fields.

## Database architecture

- `private.current_store_dealer_customer_id()` is a `SECURITY DEFINER`, `STABLE` helper with `search_path = ''` and fully qualified relations. It returns the caller's authorized customer ID or `NULL`.
- `private.get_store_dealer_portal_context()` is a `SECURITY DEFINER`, `STABLE` helper that returns the minimized JSON context or a generic `portal_access_denied` result.
- `public.get_store_dealer_portal_context()` is a `SECURITY INVOKER` wrapper exposed only to `authenticated`.
- Private helpers explicitly revoke `PUBLIC` execution and grant only the minimum required access.
- A partial unique index on `customer_portal_users(auth_user_id)` enforces one customer mapping per linked Auth user.

## Out of scope

- Dealer login UI / SSR session plumbing
- Portal invitations and activation email flows
- Customer/order table read policies
- Order listing/detail UI
- Dealer pricing authorization
- Portal writes

## Acceptance tests

A rollback-only database smoke test must prove:

1. An active portal user on an enabled customer resolves the correct customer context.
2. The returned JSON contains only the approved fields plus `ok`/`reason`.
3. A suspended portal user is denied.
4. An active portal user whose customer has `portal_enabled = false` is denied.
5. An authenticated Auth user with no portal mapping is denied.
6. A caller cannot create a second portal mapping for the same `auth_user_id`.
7. A portal caller cannot directly read `customers` or `customer_portal_users` through existing RLS.
8. Existing internal customer-read access remains intact.
