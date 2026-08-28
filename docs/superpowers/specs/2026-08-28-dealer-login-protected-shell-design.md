# Dealer Login & Protected Portal Shell Design

## Status

Approved in chat on 2026-08-28. This document defines Phase 1.3 of the Modulex dealer portal roadmap.

## Goal

Add production-ready dealer sign-in, cookie-backed SSR sessions, protected Dealer Portal routing, sign-out, and password recovery without weakening the customer-isolation boundary established in P1.1 or the controlled activation lifecycle established in P1.2.

## Scope

P1.3 includes:

- Dealer email/password sign-in.
- SSR cookie session support in `modulex-store` using Supabase's current Next.js SSR model.
- A protected `/dealer` shell.
- Dealer sign-out.
- Dealer forgot-password and reset-password flows.
- Shared recovery-template compatibility hardening for the Admin reset surface because Admin and Dealer use the same Supabase Auth project.
- Contract and smoke coverage for authorized and denied flows.

P1.3 does not include:

- Dealer self-signup.
- Orders.
- Pricing.
- Account/company profile editing.
- Dealer user administration.
- MFA.
- A Store service-role or secret key.
- A new customer-isolation model.

Those remain later roadmap packages unless a security dependency requires a narrowly scoped change.

## Existing Security Contract

P1.3 must preserve the existing authorization boundary rather than recreate it in application code.

P1.1 provides `public.get_store_dealer_portal_context()`, which only returns authorized context when the current authenticated Auth user maps to exactly one active `customer_portal_users.auth_user_id` row and the linked customer has `portal_enabled = true`. The returned context is intentionally minimal: portal user ID, customer ID/name/status, and portal role.

P1.2 creates Dealer Auth users with immutable trusted `raw_app_meta_data.account_type = 'dealer_portal'`, binds them to `customer_portal_users`, activates only invited users through the controlled activation RPC, and revokes browser-authenticated direct portal lifecycle DML.

P1.3 treats both checks as required:

1. The authenticated Auth identity must have trusted `app_metadata.account_type = 'dealer_portal'`.
2. `public.get_store_dealer_portal_context()` must return `ok = true`.

Neither check alone is sufficient.

## Chosen Architecture

Use Supabase SSR cookie sessions in `modulex-store` with `@supabase/supabase-js` and `@supabase/ssr`.

The Store will have separate browser and server Supabase client helpers. Next.js `proxy.ts` will refresh auth cookies for Dealer routes and perform only lightweight session handling. It is not the final authorization boundary.

Protected Dealer pages will perform server-side identity and dealer-context validation on each protected render. This means an already-issued session stops granting portal access as soon as the linked portal user becomes suspended or the customer has `portal_enabled = false`.

No Store service-role/secret key is introduced. Dealer authorization remains enforced through the existing authenticated RPC and database policies.

## Route Model

Public Dealer routes:

- `/dealer/login`
- `/dealer/forgot-password`
- `/dealer/reset-password`
- `/dealer/activate` (existing P1.2 route)

Protected Dealer root:

- `/dealer`

Route groups may be used internally to separate public auth pages from the protected shell without changing public URLs.

All `/dealer/*` pages must be `noindex, nofollow`.

## Dealer Shell

The protected `/dealer` route is intentionally minimal in P1.3.

It may display only information already present in the authorized P1.1 context:

- Customer/company name.
- Portal role.
- A neutral Dealer Portal landing state.
- Sign-out control.

It must not query or expose orders, pricing, company profile details beyond the approved context, or customer-private data reserved for later phases.

The Dealer shell must not render the public marketing Navbar/Footer. The Store root chrome should be made route-aware with the smallest targeted change rather than restructuring the whole marketing route tree.

## Session and Authorization Flow

### Login

`/dealer/login` accepts only email and password. There is no signup path.

On submit:

1. Authenticate with `signInWithPassword` using the Store's publishable Supabase key.
2. Validate the returned/current authenticated identity server-side.
3. Require trusted `app_metadata.account_type = 'dealer_portal'`.
4. Call `public.get_store_dealer_portal_context()` with the authenticated cookie session.
5. Continue only when the RPC returns `ok = true`.
6. Redirect to `/dealer`.

If authentication succeeds but either dealer check fails, immediately sign the session out and return a generic access error. The UI must not reveal whether the email belongs to an internal Admin user, a suspended dealer, a disabled customer, or another denied account state.

An already-authorized Dealer visiting `/dealer/login` should be redirected to `/dealer`.

### Protected Render

The protected Dealer layout/root must validate the current server-side identity and Dealer Portal context for every protected render.

Server-side authorization must use a validated Auth identity (`getClaims()` where appropriate for token validation, with `getUser()` only when an actual current Auth user record is required). `getSession()` must not be treated as the authorization decision on the server.

If there is no valid Dealer identity or the Dealer context is denied, redirect to `/dealer/login`. If a stale or cross-product Auth session exists, clear it rather than allowing it to persist inside the Dealer surface.

### Sign-out

Sign-out clears the Store's Supabase Auth session and redirects to `/dealer/login`.

For a password-reset completion, use global sign-out semantics so other refresh-token-backed sessions are invalidated where supported. A normal interactive Dealer logout may use the standard current-session sign-out unless implementation testing shows a reason to use global sign-out consistently.

## Forgot Password

`/dealer/forgot-password` accepts an email address and initiates Supabase password recovery.

The response must always use a generic success message such as "If an eligible account exists for this email, a password reset link has been sent." It must not disclose whether the email exists, whether it belongs to a Dealer, whether the Dealer is suspended, or whether the customer portal is disabled.

The public Store must not receive a service-role key merely to pre-check the account type.

## Shared Recovery Email Constraint

Admin and Dealer use the same Supabase Auth project, therefore Supabase's recovery email template is shared.

P1.3 will standardize the hosted recovery template on a controlled token-hash link that preserves the caller-provided `RedirectTo` and places the credential in the URL fragment:

`{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=recovery`

This preserves the P1.2 scanner/log hardening principle:

- The token hash is not sent in the HTTP request URL.
- It is not written to ordinary server access logs.
- It is not sent as a referrer.
- The application can remove the fragment immediately.
- The recovery token is consumed only after explicit user submission.

The Supabase Auth redirect allowlist must include the production Admin reset URL and production Store Dealer reset URL. Local development entries may remain for development only.

## Dealer Reset Password Flow

`/dealer/reset-password` is public only as a token landing surface; changing the password requires a valid recovery token and Dealer authorization.

Flow:

1. Read `token_hash` and `type` from `window.location.hash`.
2. Immediately remove the fragment from the address bar with `history.replaceState`.
3. Require `type = recovery`.
4. Do not consume the token on page load.
5. On explicit form submission, verify the token using Supabase Auth `verifyOtp`/equivalent token-hash recovery verification.
6. Validate trusted `app_metadata.account_type = 'dealer_portal'`.
7. Validate `public.get_store_dealer_portal_context()` with the recovery session.
8. Only then allow the new password to be written.
9. Globally sign out after a successful password update.
10. Redirect to `/dealer/login` with a neutral success state.

If the token is invalid/expired, the identity is not a Dealer, the portal user is suspended, or the customer portal is disabled, do not update the password. Clear any session created during verification and show a generic recovery failure message.

## Admin Recovery Compatibility Hardening

The existing Admin forgot-password flow already calls `resetPasswordForEmail`, and the Admin reset page currently relies on the Supabase client automatically creating a recovery session.

Because P1.3 changes the shared hosted recovery template to the controlled fragment token-hash model, the Admin reset surface must be made compatible in the same package.

The Admin reset page will:

1. Read and immediately clear the recovery token fragment.
2. Consume the token only on explicit password-reset submission.
3. Reject Dealer Portal identities using trusted `app_metadata.account_type` and clear the resulting session.
4. Preserve the existing Admin reset destination and sign-in flow.

This is compatibility/security hardening only. P1.3 must not redesign Admin authentication or authorization.

## Error Model

User-visible messages should avoid account enumeration and cross-product identity disclosure.

Dealer login:

- Wrong credentials: generic sign-in failure.
- Correct credentials but wrong account type: generic Dealer Portal access unavailable.
- Suspended dealer: same generic Dealer Portal access unavailable.
- Customer portal disabled: same generic Dealer Portal access unavailable.

Forgot password:

- Always generic completion copy after a syntactically valid request attempt unless the system itself is unavailable.

Reset password:

- Invalid/expired token: generic reset-link failure.
- Wrong account type: same generic reset-link/access failure.
- Suspended/disabled Dealer: same generic reset-link/access failure.

Detailed causes may be logged server-side where available, but logs must not contain recovery credentials or passwords.

## Dependency and Environment Changes

`modulex-store` will add:

- `@supabase/supabase-js`
- `@supabase/ssr`

`package.json` and the active lockfile must remain consistent in the same change.

Existing Store public environment variables remain the client boundary:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No service-role, secret key, or Admin Supabase credential is added to the Store.

The implementation must use the currently supported Next.js 16 `proxy.ts` convention rather than introducing deprecated middleware naming.

## Expected File Boundaries

Exact file names may be adjusted during implementation planning to match the repository after a fresh `main` inspection, but responsibilities should remain separated as follows:

Store:

- Browser Supabase client helper.
- Server Supabase client helper.
- Proxy/session-refresh helper.
- Dealer authorization/context helper.
- Public Dealer auth pages and focused forms/actions.
- Protected Dealer layout/root shell.
- Route-aware Store chrome boundary.
- Dealer auth contract smoke script.

Admin:

- Existing reset-password form or a narrowly extracted recovery-token helper, only as needed for shared-template compatibility.
- Existing auth contract coverage extended for the new explicit token-hash behavior.

No database migration is expected for the core P1.3 design because the required Dealer authorization RPC already exists. If implementation reveals that a DB change is genuinely required, work must stop for a security/design review before adding it.

## Testing Strategy

Implementation follows TDD/contract-first development.

### Static/Contract Coverage

Dealer auth contract coverage must verify at minimum:

- Supabase SSR browser/server client setup exists.
- `proxy.ts` is scoped to Dealer auth/session needs rather than the whole public Store unnecessarily.
- Server authorization does not trust `getSession()` as its final decision.
- Login uses password auth and validates both trusted dealer app metadata and the Dealer context RPC.
- Denied cross-product/portal states sign out.
- Protected `/dealer` uses server-side authorization.
- Logout is present.
- Forgot password uses generic response copy.
- Dealer reset consumes a fragment token only on explicit submit and validates Dealer context before password update.
- Successful reset signs out.
- Admin reset is compatible with the shared fragment token-hash recovery template.
- Neither Admin nor Store places the recovery token in a normal query-string URL.
- No Store service-role/secret is introduced.

### Production/Integration Smoke

Where production Auth behavior must be exercised, use disposable Dealer test identities and rollback/cleanup procedures.

At minimum validate:

- Active Dealer can sign in and receive authorized Dealer context.
- Internal Admin Auth identity is denied from Dealer Portal even with valid credentials.
- Suspended Dealer is denied.
- Dealer linked to a portal-disabled customer is denied.
- Sign-out removes Dealer access.
- Valid Dealer recovery allows a password update.
- Non-Dealer recovery cannot update through the Dealer surface.
- Suspended/disabled Dealer recovery cannot update through the Dealer surface.
- Disposable Auth users and `customer_portal_users` fixtures are removed after the smoke.

### Repository Verification Before PR

Before P1.3 can be called PR-ready, run and record fresh evidence for all applicable checks available in the environment:

- `modulex-store` contract/smoke tests.
- `modulex-admin` auth/reset contract tests affected by the shared recovery change.
- Relevant lint checks.
- `next build` for both packages when affected and runnable.
- Lockfile consistency.
- Final branch diff/security review.

Do not claim a build or test passed unless it was actually run successfully.

## Security Invariants

P1.3 is complete only if all of these remain true:

- No public Dealer signup exists.
- A valid Supabase session alone does not grant Dealer access.
- `app_metadata.account_type = 'dealer_portal'` is required.
- The P1.1 Dealer context RPC remains the final customer/portal membership authorization boundary.
- Suspension and `portal_enabled = false` revoke protected access without waiting for password/session expiry.
- Internal Admin identities cannot use the Dealer Portal or Dealer reset surface.
- Dealer identities cannot use the Admin reset surface after recovery-template hardening.
- Password reset responses do not enumerate accounts.
- Recovery credentials are not placed in normal request query strings.
- Recovery credentials are removed from the browser URL immediately after client-side receipt.
- Recovery tokens are consumed only after explicit user action.
- Store has no service-role/secret credential.
- No orders, pricing, or broader customer-private data are exposed in this phase.

## Delivery Workflow

1. Branch from the current merged `main`.
2. Commit this approved design spec.
3. User reviews the written spec.
4. After written-spec approval, create a detailed TDD implementation plan using the Superpowers writing-plans workflow.
5. Implement on the feature branch.
6. Apply any explicitly approved production configuration changes, including the recovery email template/redirect settings.
7. Run production-safe smoke/cleanup where needed.
8. Run verification and security review.
9. Open a PR for user review/merge.
10. Do not merge the PR and do not trigger Vercel production deployment.