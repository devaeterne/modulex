# Dealer Portal Admin Access Implementation Plan

**Goal:** Turn the existing customer Web / Portal metadata UI into a controlled dealer account lifecycle with server-only Auth administration and a minimal Store activation flow.

**Architecture:** Keep `customer_portal_users` as the source of portal membership. Admin mutations go through an authenticated Admin API backed by `supabaseAdmin`; dealer Auth users are created with trusted `app_metadata.account_type = dealer_portal`, then receive a generated recovery token through server-side transactional email. The email points to the Store activation page with the token hash in the URL fragment, so request logs and email-link scanners do not consume the Supabase action URL. Store activation verifies that token only after explicit form submission and then calls a narrowly granted authenticated RPC. Login and protected dealer pages remain P1.3.

**Constraints:** No new npm dependencies. No public signup. No direct browser access to Supabase Auth Admin. No manual portal status editing. No pricing/order/customer-private-data exposure. Do not merge or deploy from this branch.

## Task 1 — Contract tests first

- Add Admin lifecycle contract smoke covering server-only auth, trusted account type, invite link generation, disabled-customer guard, lifecycle actions, and removal of manual status control.
- Add Store activation contract smoke covering `/dealer/activate`, token verification, authenticated password update, activation RPC, logout, and RPC grant hardening.
- Run the contracts before implementation and confirm they fail for missing P1.2 files/behavior.

## Task 2 — Database activation boundary

- Add `public.activate_store_dealer_portal_user()` behind a narrow `SECURITY DEFINER` private implementation and an invoker wrapper.
- Require `auth.uid()`, `auth.users.raw_app_meta_data.account_type = dealer_portal`, a matching `customer_portal_users.auth_user_id`, `status = invited`, and `customers.portal_enabled = true`.
- Update only that row to `active`, set `activated_at`, and append a customer activity entry without an internal profile actor.
- Revoke from `PUBLIC` and `anon`; grant only to `authenticated`.

## Task 3 — Admin server lifecycle API

- Add `/api/admin/dealer-portal` using the existing `requireAdmin` gate.
- Support create metadata, portal enable/disable, invite/resend, suspend/restore, set primary, and draft removal.
- New metadata always starts `never_invited`.
- Invite requires an enabled customer, creates Auth user with trusted dealer `app_metadata`, generates a recovery token, sends the controlled Store activation link server-side, binds `auth_user_id`, and moves status to `invited` only through the server lifecycle.
- Resend accepts only an already linked dealer Auth user.
- Suspend preserves the Auth relationship and audit history; restore derives `active`, `invited`, or `never_invited` from lifecycle history.
- Refuse cross-customer IDs and unsafe email/Auth reuse.

## Task 4 — Admin customer UI

- Supersede the legacy Web / Portal lifecycle controls with the secure panel and revoke authenticated direct portal-table DML.
- Call the server Admin API with the current access token.
- Show lifecycle actions by state: Invite, Resend Invite, Suspend, Restore, Set Primary, and Remove Draft only before Auth linkage.
- Route portal enabled/disabled through the server API.

## Task 5 — Store activation page

- Add `/dealer/activate` with a minimal password setup form.
- Read the token hash from the URL fragment and clear it from the browser address immediately.
- Consume the token only when the dealer explicitly submits the form using `POST /auth/v1/verify`, validate trusted dealer app metadata, update the password, call the activation RPC with the resulting bearer token, and sign out.
- Do not add dealer dashboard, login shell, orders, pricing, or new auth dependencies.

## Task 6 — Verify and ship PR

- Apply the migration to production.
- Run rollback-safe DB smoke for valid activation plus disabled/suspended/cross-account denial.
- Run Security Advisor and Performance Advisor and distinguish pre-existing findings from new findings.
- Run contract tests; run builds only if a full local checkout is available.
- Review branch diff/security surface and open a PR against `main` for user merge/deploy.
