# Dealer Login & Protected Portal Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-ready Dealer Portal login, SSR cookie sessions, protected routing, logout, and scanner-safe password recovery while preserving the P1.1 customer-isolation and P1.2 activation boundaries.

**Architecture:** `modulex-store` will use Supabase SSR browser/server clients plus a narrowly matched Next.js 16 `src/proxy.ts` to refresh Dealer auth cookies. Final Dealer authorization remains server-side and requires both trusted JWT `app_metadata.account_type = 'dealer_portal'` and the existing `public.get_store_dealer_portal_context()` RPC. Recovery uses a shared Supabase Auth token-hash template with the token in the URL fragment; Store accepts only active Dealer identities and Admin explicitly rejects Dealer identities.

**Tech Stack:** Next.js 16.1.6 App Router/Proxy, React 19.2.3, TypeScript 5, Supabase Auth/PostgREST, `@supabase/supabase-js` 2.109.0, `@supabase/ssr` 0.12.5, Node contract smoke scripts.

**Spec:** `docs/superpowers/specs/2026-08-28-dealer-login-protected-shell-design.md`

## Global Constraints

- No public Dealer signup.
- Store never receives `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` at runtime.
- A valid Supabase session alone never grants Dealer access.
- Require trusted `app_metadata.account_type = 'dealer_portal'` and `public.get_store_dealer_portal_context().ok = true`.
- `getSession()` must not be the server authorization decision; use `getClaims()` for validated token claims.
- Suspension or `customers.portal_enabled = false` must revoke protected access on the next protected render.
- No orders, pricing, account editing, or wider customer-private data in P1.3.
- All `/dealer/*` pages are `noindex, nofollow` and do not render marketing Navbar/Footer chrome.
- Recovery credentials stay in URL fragments, are cleared immediately, and are consumed only on explicit form submission.
- Forgot-password responses do not enumerate accounts or account types.
- `package.json` and `package-lock.json` must be updated together for Store dependency changes.
- No DB migration is expected. If implementation reveals a required DB change, stop and return to security/design review before writing DDL.
- Do not merge the PR and do not trigger Vercel production deployment.

---

## File Structure

### Store — new files

- `modulex-store/src/lib/supabase/browser.ts` — browser cookie-aware Supabase client factory.
- `modulex-store/src/lib/supabase/server.ts` — server cookie-aware Supabase client factory.
- `modulex-store/src/lib/supabase/proxy.ts` — request/response cookie refresh helper.
- `modulex-store/src/proxy.ts` — Next.js 16 Dealer-only proxy matcher.
- `modulex-store/src/lib/dealer/auth.ts` — Dealer claim/context types and server authorization helper.
- `modulex-store/src/components/StoreChrome.tsx` — route-aware marketing chrome boundary.
- `modulex-store/src/app/dealer/layout.tsx` — common Dealer metadata/noindex boundary.
- `modulex-store/src/app/dealer/session/clear/route.ts` — clears stale/cross-product Store auth cookie then redirects to Dealer login.
- `modulex-store/src/app/dealer/(auth)/login/page.tsx` — public Dealer login page.
- `modulex-store/src/app/dealer/(auth)/login/actions.ts` — server-side password login and Dealer authorization.
- `modulex-store/src/app/dealer/(auth)/login/DealerLoginForm.tsx` — login client form.
- `modulex-store/src/app/dealer/(auth)/forgot-password/page.tsx` — public reset request page.
- `modulex-store/src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx` — generic reset request client flow.
- `modulex-store/src/app/dealer/(auth)/reset-password/page.tsx` — public recovery-token landing page.
- `modulex-store/src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx` — scanner-safe explicit recovery verification and password update.
- `modulex-store/src/app/dealer/(portal)/layout.tsx` — final server-side Dealer authorization boundary.
- `modulex-store/src/app/dealer/(portal)/page.tsx` — minimal protected Dealer shell.
- `modulex-store/src/app/dealer/(portal)/actions.ts` — Dealer logout server action.
- `modulex-store/scripts/dealer-portal-auth-contract.mjs` — Store static/architecture contract.

### Store — modified files

- `modulex-store/package.json` — dependencies and `smoke:dealer-auth` script.
- `modulex-store/package-lock.json` — exact dependency lock.
- `modulex-store/src/app/layout.tsx` — move marketing chrome into `StoreChrome` while leaving analytics/structured data at root.

### Admin — new files

- `modulex-admin/scripts/auth-recovery-contract.mjs` — recovery fragment and Dealer-rejection contract.
- `modulex-admin/scripts/dealer-portal-auth-live-smoke.mjs` — operator-only production Auth smoke using server credentials; never part of Store runtime or default smoke.

### Admin — modified files

- `modulex-admin/package.json` — add recovery contract to default smoke and add an explicit non-default live smoke command.
- `modulex-admin/src/components/auth/ResetPasswordForm.tsx` — explicit fragment token verification and Dealer identity rejection.

### Production configuration

- Supabase Auth Recovery email template — use `{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=recovery`.
- Supabase Auth Redirect URLs — allow the exact Admin `/reset-password` production URL and Store `/dealer/reset-password` production URL.

---

### Task 1: Define the Dealer/Auth Recovery Contracts First

**Files:**
- Create: `modulex-store/scripts/dealer-portal-auth-contract.mjs`
- Modify: `modulex-store/package.json`
- Create: `modulex-admin/scripts/auth-recovery-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Consumes: approved P1.3 spec and existing P1.1/P1.2 filenames.
- Produces: `npm run smoke:dealer-auth` in Store and `npm run smoke:auth-recovery` in Admin; both become executable acceptance contracts for later tasks.

- [ ] **Step 1: Add the failing Store contract**

Create `modulex-store/scripts/dealer-portal-auth-contract.mjs` with focused file/content assertions. The contract should read the exact planned files and assert the security invariants rather than UI styling details:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [proxyEntry, dealerAuth, loginAction, portalLayout, resetForm, forgotForm, rootLayout, chrome] = await Promise.all([
  read("src/proxy.ts"),
  read("src/lib/dealer/auth.ts"),
  read("src/app/dealer/(auth)/login/actions.ts"),
  read("src/app/dealer/(portal)/layout.tsx"),
  read("src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx"),
  read("src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx"),
  read("src/app/layout.tsx"),
  read("src/components/StoreChrome.tsx"),
]);

assert.match(proxyEntry, /matcher[\s\S]*\/dealer/);
assert.match(dealerAuth, /getClaims\(/);
assert.doesNotMatch(dealerAuth, /getSession\(\)/);
assert.match(dealerAuth, /account_type[\s\S]*dealer_portal/);
assert.match(dealerAuth, /get_store_dealer_portal_context/);
assert.match(loginAction, /signInWithPassword/);
assert.match(loginAction, /signOut/);
assert.match(portalLayout, /dealer.*context|DealerPortalContext|requireDealer/i);
assert.match(resetForm, /window\.location\.hash/);
assert.match(resetForm, /history\.replaceState/);
assert.match(resetForm, /verifyOtp/);
assert.match(resetForm, /get_store_dealer_portal_context/);
assert.match(resetForm, /updateUser/);
assert.match(resetForm, /scope:\s*["']global["']/);
assert.match(forgotForm, /resetPasswordForEmail/);
assert.match(forgotForm, /If an eligible account exists/i);
assert.match(rootLayout, /StoreChrome/);
assert.match(chrome, /usePathname/);
assert.doesNotMatch(`${dealerAuth}\n${loginAction}`, /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/);

console.log("dealer portal auth contract: ok");
```

- [ ] **Step 2: Wire Store contract into smoke**

Change Store scripts to include:

```json
"smoke": "npm run smoke:client && npm run smoke:api && npm run smoke:dealer-activation && npm run smoke:dealer-auth",
"smoke:dealer-auth": "node scripts/dealer-portal-auth-contract.mjs"
```

- [ ] **Step 3: Add the failing Admin recovery contract**

Create `modulex-admin/scripts/auth-recovery-contract.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const form = await readFile(path.join(root, "src/components/auth/ResetPasswordForm.tsx"), "utf8");

assert.match(form, /window\.location\.hash/);
assert.match(form, /token_hash/);
assert.match(form, /history\.replaceState/);
assert.match(form, /verifyOtp/);
assert.match(form, /type:\s*["']recovery["']/);
assert.match(form, /account_type/);
assert.match(form, /dealer_portal/);
assert.match(form, /updateUser/);
assert.match(form, /scope:\s*["']global["']/);
assert.doesNotMatch(form, /window\.location\.search/);

console.log("auth recovery contract: ok");
```

- [ ] **Step 4: Wire Admin recovery contract into smoke**

Append:

```json
"smoke:auth-recovery": "node scripts/auth-recovery-contract.mjs"
```

and append `&& npm run smoke:auth-recovery` to the existing Admin `smoke` chain.

- [ ] **Step 5: Run the new contracts and verify RED**

Run:

```bash
cd modulex-store && npm run smoke:dealer-auth
cd ../modulex-admin && npm run smoke:auth-recovery
```

Expected: Store fails because the P1.3 files do not exist; Admin fails because `ResetPasswordForm` does not yet use fragment token verification.

- [ ] **Step 6: Commit the RED contracts**

```bash
git add modulex-store/package.json modulex-store/scripts/dealer-portal-auth-contract.mjs \
  modulex-admin/package.json modulex-admin/scripts/auth-recovery-contract.mjs
git commit -m "test: define dealer login and recovery contract"
```

---

### Task 2: Add Supabase SSR Client and Proxy Primitives

**Files:**
- Modify: `modulex-store/package.json`
- Modify: `modulex-store/package-lock.json`
- Create: `modulex-store/src/lib/supabase/browser.ts`
- Create: `modulex-store/src/lib/supabase/server.ts`
- Create: `modulex-store/src/lib/supabase/proxy.ts`
- Create: `modulex-store/src/proxy.ts`

**Interfaces:**
- Produces: `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, `updateDealerSession(request)`, and Next.js `proxy(request)`.
- Consumers: login/reset flows and Dealer authorization helper in Tasks 3–5.

- [ ] **Step 1: Install pinned SSR dependencies and update lockfile atomically**

Use versions that support the required SSR APIs while retaining Node 20 compatibility for `supabase-js`:

```bash
cd modulex-store
npm install --save-exact @supabase/supabase-js@2.109.0 @supabase/ssr@0.12.5
```

Verify both `package.json` and `package-lock.json` changed.

- [ ] **Step 2: Create the browser client factory**

`src/lib/supabase/browser.ts`:

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createBrowserClient(url, key);
}
```

- [ ] **Step 3: Create the server client factory**

`src/lib/supabase/server.ts` must use `cookies()` and tolerate cookie writes from Server Components while allowing them in Server Actions/Route Handlers:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot mutate cookies; proxy refresh handles that path.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Create the proxy cookie-refresh helper**

`src/lib/supabase/proxy.ts` should follow Supabase's request/response cookie-copy pattern and call `supabase.auth.getClaims()` once to refresh/validate the session token. It must not call the Dealer context RPC; final authorization stays in the protected layout.

Core shape:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateDealerSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  // createServerClient(... request.cookies.getAll(), setAll -> request cookies + replacement response)
  // await supabase.auth.getClaims();
  return response;
}
```

When replacing `response` inside `setAll`, copy every refreshed cookie to the new response before returning it.

- [ ] **Step 5: Create Dealer-only Next.js 16 proxy entry**

`src/proxy.ts`:

```ts
import type { NextRequest } from "next/server";
import { updateDealerSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateDealerSession(request);
}

export const config = {
  matcher: ["/dealer/:path*"],
};
```

Do not match public marketing routes.

- [ ] **Step 6: Run dependency and partial contract checks**

```bash
npm ls @supabase/supabase-js @supabase/ssr
npm run smoke:dealer-auth
```

Expected: dependency tree is clean; contract remains RED because Dealer auth/login/reset files are still missing.

- [ ] **Step 7: Commit SSR foundation**

```bash
git add modulex-store/package.json modulex-store/package-lock.json \
  modulex-store/src/lib/supabase modulex-store/src/proxy.ts
git commit -m "feat: add store supabase ssr session foundation"
```

---

### Task 3: Add Dealer Authorization Core, Protected Shell, and Dealer-Specific Chrome

**Files:**
- Create: `modulex-store/src/lib/dealer/auth.ts`
- Create: `modulex-store/src/components/StoreChrome.tsx`
- Modify: `modulex-store/src/app/layout.tsx`
- Create: `modulex-store/src/app/dealer/layout.tsx`
- Create: `modulex-store/src/app/dealer/session/clear/route.ts`
- Create: `modulex-store/src/app/dealer/(portal)/layout.tsx`
- Create: `modulex-store/src/app/dealer/(portal)/page.tsx`
- Create: `modulex-store/src/app/dealer/(portal)/actions.ts`

**Interfaces:**
- Produces: `DealerPortalContext`, `readDealerPortalSession()`, `requireDealerPortalContext()`, and `dealerLogoutAction()`.
- Consumers: login page/action and protected Dealer shell.

- [ ] **Step 1: Implement Dealer context types and authorization helper**

`src/lib/dealer/auth.ts` must expose a narrow context only:

```ts
export type DealerPortalContext = {
  ok: true;
  reason: "authorized";
  portal_user_id: string;
  customer_id: string;
  customer_name: string;
  customer_status: string;
  portal_role: "admin" | "buyer" | "viewer";
};

export type DealerPortalSession = {
  hasAuthenticatedClaims: boolean;
  context: DealerPortalContext | null;
};
```

Implement `readDealerPortalSession()` with this sequence:

```ts
const supabase = await createServerSupabaseClient();
const { data: claimData, error: claimError } = await supabase.auth.getClaims();
if (claimError || !claimData?.claims) return { hasAuthenticatedClaims: false, context: null };

if (claimData.claims.app_metadata?.account_type !== "dealer_portal") {
  return { hasAuthenticatedClaims: true, context: null };
}

const { data, error } = await supabase.rpc("get_store_dealer_portal_context");
if (error || !isDealerPortalContext(data)) {
  return { hasAuthenticatedClaims: true, context: null };
}

return { hasAuthenticatedClaims: true, context: data };
```

Do not use `getSession()` in this helper.

`requireDealerPortalContext()` returns the context when authorized; otherwise it redirects to `/dealer/session/clear` so stale/suspended/cross-product Store cookies are removed server-side.

- [ ] **Step 2: Add common Dealer noindex metadata**

`src/app/dealer/layout.tsx` should export:

```ts
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
```

and render children without adding marketing chrome.

- [ ] **Step 3: Add route-aware Store chrome**

Create `src/components/StoreChrome.tsx` as a small Client Component using `usePathname()`:

```tsx
"use client";

const isDealerRoute = pathname === "/dealer" || pathname.startsWith("/dealer/");

if (isDealerRoute) return <main>{children}</main>;

return (
  <>
    <Navbar companyName={companyName} logoUrl={logoUrl} />
    <main>{children}</main>
    <Footer />
    <BackToTop />
    <GalleryLightbox />
    <ThemeToggle />
  </>
);
```

Keep `AnalyticsProvider` and root JSON-LD in the server root layout. Modify `src/app/layout.tsx` so it passes `companyName`, `logoUrl`, and `children` into `StoreChrome` instead of rendering Navbar/Footer directly.

- [ ] **Step 4: Add deterministic stale-session clear route**

`src/app/dealer/session/clear/route.ts` must create the server client, call local sign-out, and redirect with a generic status only:

```ts
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/dealer/login?status=access-unavailable", request.url), 303);
}
```

Do not encode suspension/account-type/customer state into the URL.

- [ ] **Step 5: Add protected Dealer layout and minimal page**

`src/app/dealer/(portal)/layout.tsx`:

```tsx
export default async function DealerPortalLayout({ children }: { children: React.ReactNode }) {
  const context = await requireDealerPortalContext();
  return <DealerPortalFrame context={context}>{children}</DealerPortalFrame>;
}
```

Keep the frame local/simple; it may show only `customer_name`, `portal_role`, Dealer Portal label, and sign-out. If a dedicated frame component is not needed, render this directly in the layout rather than adding another file.

`src/app/dealer/(portal)/page.tsx` must contain only a neutral landing state such as "Dealer Portal" / "Your account is ready" and no orders/pricing/profile queries.

- [ ] **Step 6: Add server-side logout action**

`src/app/dealer/(portal)/actions.ts`:

```ts
"use server";

export async function dealerLogoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/dealer/login");
}
```

Wire a POST form/button in the protected layout to this action.

- [ ] **Step 7: Run Store contract and smoke subset**

```bash
cd modulex-store
npm run smoke:dealer-auth
npm run smoke:dealer-activation
```

Expected: Dealer auth contract still RED only for login/forgot/reset files; P1.2 activation contract remains PASS.

- [ ] **Step 8: Commit protected shell foundation**

```bash
git add modulex-store/src/lib/dealer modulex-store/src/components/StoreChrome.tsx \
  modulex-store/src/app/layout.tsx modulex-store/src/app/dealer
git commit -m "feat: add protected dealer portal shell"
```

---

### Task 4: Implement Server-Side Dealer Login and Logout UX

**Files:**
- Create: `modulex-store/src/app/dealer/(auth)/login/actions.ts`
- Create: `modulex-store/src/app/dealer/(auth)/login/DealerLoginForm.tsx`
- Create: `modulex-store/src/app/dealer/(auth)/login/page.tsx`
- Modify if needed: `modulex-store/src/lib/dealer/auth.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` and `readDealerPortalSession()`.
- Produces: `dealerLoginAction(previousState, formData)` returning `{ error: string | null }` or redirecting to `/dealer`.

- [ ] **Step 1: Implement the login server action**

Use a stable action state:

```ts
export type DealerLoginState = { error: string | null };
export const initialDealerLoginState: DealerLoginState = { error: null };
```

Action sequence:

```ts
const email = String(formData.get("email") || "").trim().toLowerCase();
const password = String(formData.get("password") || "");

const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) return { error: "Unable to sign in with those credentials." };

const { data: claimData, error: claimError } = await supabase.auth.getClaims();
if (claimError || claimData?.claims?.app_metadata?.account_type !== "dealer_portal") {
  await supabase.auth.signOut({ scope: "local" });
  return { error: "Dealer portal access is unavailable." };
}

const { data: context, error: contextError } = await supabase.rpc("get_store_dealer_portal_context");
if (contextError || !isDealerPortalContext(context)) {
  await supabase.auth.signOut({ scope: "local" });
  return { error: "Dealer portal access is unavailable." };
}

redirect("/dealer");
```

Export `isDealerPortalContext` from `src/lib/dealer/auth.ts` if the action needs to share the same validator; do not duplicate permissive parsing.

- [ ] **Step 2: Implement the login form with `useActionState`**

`DealerLoginForm.tsx` should provide email/password fields, `autoComplete="email"` / `autoComplete="current-password"`, submit pending state, a link to `/dealer/forgot-password`, and display only the generic action error.

Do not add signup/register links.

- [ ] **Step 3: Implement the login page server redirect behavior**

Before rendering the form:

```ts
const session = await readDealerPortalSession();
if (session.context) redirect("/dealer");
if (session.hasAuthenticatedClaims) redirect("/dealer/session/clear");
```

Then render the minimal Dealer Portal login card. If `searchParams.status === "access-unavailable"`, show the same generic access-unavailable copy; do not display a reason.

- [ ] **Step 4: Run login contract**

```bash
cd modulex-store
npm run smoke:dealer-auth
```

Expected: contract remains RED only for forgot/reset recovery assertions.

- [ ] **Step 5: Commit login**

```bash
git add modulex-store/src/app/dealer/'(auth)'/login modulex-store/src/lib/dealer/auth.ts
git commit -m "feat: add controlled dealer portal login"
```

---

### Task 5: Implement Dealer Forgot Password and Scanner-Safe Reset

**Files:**
- Create: `modulex-store/src/app/dealer/(auth)/forgot-password/page.tsx`
- Create: `modulex-store/src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx`
- Create: `modulex-store/src/app/dealer/(auth)/reset-password/page.tsx`
- Create: `modulex-store/src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabaseClient()` and existing `get_store_dealer_portal_context` RPC.
- Produces: public generic reset request and controlled Dealer recovery completion.

- [ ] **Step 1: Implement generic Dealer forgot-password request**

Use the browser client and always set the same success copy after a syntactically valid request attempt unless the Supabase request itself is unavailable:

```ts
const redirectTo = `${window.location.origin}/dealer/reset-password`;
const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });

if (error) {
  setError("Password reset is temporarily unavailable. Please try again.");
  return;
}

setMessage("If an eligible account exists for this email, a password reset link has been sent.");
```

Do not pre-query `auth.users`, `profiles`, `customer_portal_users`, or Dealer context from this anonymous page.

- [ ] **Step 2: Implement reset token capture without consumption**

On `DealerResetPasswordForm` mount:

```ts
const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const token = params.get("token_hash") || "";
const type = params.get("type") || "";
window.history.replaceState({}, "", window.location.pathname);

if (!token || type !== "recovery") {
  setState("error");
  setMessage("This password reset link is invalid or expired.");
  return;
}

setTokenHash(token);
setState("ready");
```

Do not call `verifyOtp` in `useEffect`.

- [ ] **Step 3: Verify recovery only on explicit form submit and enforce Dealer boundary**

Submission order must be exactly:

```ts
const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: "recovery",
});
if (verifyError || !verified.user) throw new Error("This password reset link is invalid or expired.");

if (verified.user.app_metadata?.account_type !== "dealer_portal") {
  await supabase.auth.signOut({ scope: "local" });
  throw new Error("This password reset link cannot be used here.");
}

const { data: context, error: contextError } = await supabase.rpc("get_store_dealer_portal_context");
if (contextError || !context?.ok) {
  await supabase.auth.signOut({ scope: "local" });
  throw new Error("This password reset link cannot be used here.");
}

const { error: updateError } = await supabase.auth.updateUser({ password });
if (updateError) throw updateError;

await supabase.auth.signOut({ scope: "global" });
window.location.assign("/dealer/login?status=password-reset");
```

Validate minimum eight characters and matching confirmation before token verification. On any error after verification, clear the local session before returning to the form.

- [ ] **Step 4: Add reset/login neutral success copy**

Dealer login may recognize only `status=password-reset` and show "Password updated. Sign in with your new password." It must not accept arbitrary error reason strings from the URL.

- [ ] **Step 5: Run Store contract GREEN**

```bash
cd modulex-store
npm run smoke:dealer-auth
npm run smoke:dealer-activation
```

Expected: both PASS.

- [ ] **Step 6: Commit Dealer recovery**

```bash
git add modulex-store/src/app/dealer/'(auth)'/forgot-password \
  modulex-store/src/app/dealer/'(auth)'/reset-password \
  modulex-store/src/app/dealer/'(auth)'/login/page.tsx
git commit -m "feat: add dealer password recovery"
```

---

### Task 6: Harden Admin Reset for the Shared Recovery Template

**Files:**
- Modify: `modulex-admin/src/components/auth/ResetPasswordForm.tsx`
- Test: `modulex-admin/scripts/auth-recovery-contract.mjs`

**Interfaces:**
- Consumes: existing Admin browser Supabase client.
- Produces: explicit token-hash recovery consumption that allows non-Dealer Admin identities and rejects Dealer identities.

- [ ] **Step 1: Replace automatic session-on-load logic with fragment capture**

Remove the current `getSession()` / `onAuthStateChange(PASSWORD_RECOVERY)` readiness mechanism. Capture only:

```ts
const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const token = params.get("token_hash") || "";
const type = params.get("type") || "";
window.history.replaceState({}, "", window.location.pathname);
setTokenHash(type === "recovery" ? token : "");
setReady(Boolean(token && type === "recovery"));
```

Do not verify on mount.

- [ ] **Step 2: Verify on submit, reject Dealer account type, then update password**

Before `updateUser`:

```ts
const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: "recovery",
});

if (verifyError || !verified.user) {
  setError("This password reset link is invalid or expired.");
  return;
}

if (verified.user.app_metadata?.account_type === "dealer_portal") {
  await supabase.auth.signOut({ scope: "local" });
  setError("This password reset link cannot be used here.");
  return;
}

const { error: updateError } = await supabase.auth.updateUser({ password });
```

After successful update:

```ts
await supabase.auth.signOut({ scope: "global" });
router.replace("/signin");
```

- [ ] **Step 3: Run Admin recovery contract GREEN**

```bash
cd modulex-admin
npm run smoke:auth-recovery
```

Expected: PASS.

- [ ] **Step 4: Run existing Admin portal contract to catch P1.2 regressions**

```bash
npm run smoke:dealer-portal-admin
```

Expected: PASS.

- [ ] **Step 5: Commit Admin compatibility hardening**

```bash
git add modulex-admin/src/components/auth/ResetPasswordForm.tsx \
  modulex-admin/scripts/auth-recovery-contract.mjs modulex-admin/package.json
git commit -m "fix: harden shared auth recovery flow"
```

---

### Task 7: Add Production-Safe Live Auth Smoke and Configure Hosted Recovery

**Files:**
- Create: `modulex-admin/scripts/dealer-portal-auth-live-smoke.mjs`
- Modify: `modulex-admin/package.json`
- Production config: Supabase Auth recovery template and redirect allowlist.

**Interfaces:**
- Consumes: operator-only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `npm run smoke:dealer-portal-auth-live`; it creates disposable real Auth users, validates live Auth + Dealer context behavior, and deletes all fixtures in `finally`.

- [ ] **Step 1: Add a non-default live smoke script**

Add to Admin package scripts, but do not append it to the default `smoke` chain:

```json
"smoke:dealer-portal-auth-live": "node scripts/dealer-portal-auth-live-smoke.mjs"
```

This keeps production credentials out of normal developer test runs.

- [ ] **Step 2: Implement fixture creation through the Auth Admin API**

The script must create unique emails/passwords and use a server-only Admin client:

```js
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(adminKey, "server-only Supabase admin key is required for live smoke");

const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
```

Create four Auth users with `auth.admin.createUser({ email, password, email_confirm: true, app_metadata })`:

- active Dealer: `account_type: "dealer_portal"`
- suspended Dealer: `account_type: "dealer_portal"`
- disabled-customer Dealer: `account_type: "dealer_portal"`
- internal user: no Dealer account type

Create three customers using the same minimal columns as the existing DB smoke (`customer_code`, `name`, `status`, `portal_enabled`) and matching `customer_portal_users` rows for the three Dealers.

- [ ] **Step 3: Validate real password sign-in + P1.1 authorization**

For each fixture, call `signInWithPassword` with a fresh public client and then:

```js
const { data: claims } = await client.auth.getClaims();
const { data: context } = await client.rpc("get_store_dealer_portal_context");
```

Assert:

- active Dealer claim has `account_type = dealer_portal` and context `ok = true` with the expected customer ID.
- suspended Dealer context equals `{ ok: false, reason: "portal_access_denied" }`.
- disabled-customer Dealer context equals the same generic denial.
- internal user does not have Dealer account type and its Dealer context is denied.

Sign each public client out before moving to the next fixture.

- [ ] **Step 4: Validate real recovery token verification without sending email**

For the active Dealer and internal user, generate a recovery link server-side:

```js
const { data: linkData } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
  options: { redirectTo: "https://oakwell-phi.vercel.app/dealer/reset-password" },
});
const action = new URL(linkData.properties.action_link);
const tokenHash = action.searchParams.get("token");
assert.ok(tokenHash);
```

Use a fresh public client to call `verifyOtp({ token_hash: tokenHash, type: "recovery" })` and assert:

- Dealer recovery yields a user with Dealer app metadata and authorized context.
- internal recovery yields a user without Dealer app metadata and must therefore be rejected by the Store-side contract.

Do not update a real user's password; these are disposable fixtures only.

- [ ] **Step 5: Guarantee fixture cleanup**

Put all cleanup in `finally` and delete in this order:

1. `customer_portal_users` fixture rows.
2. fixture customers.
3. all four Auth users with `admin.auth.admin.deleteUser(id)`.

After cleanup, query by fixture email/customer code and assert zero rows/users remain. Never log passwords, access tokens, refresh tokens, admin keys, or recovery token hashes.

- [ ] **Step 6: Configure the hosted Supabase Recovery template**

In Supabase project `bzjoeernnmvuhzyvbowc`, set the Recovery email link to:

```html
<a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

Preserve the project's existing branding/body copy around this link if desired, but the href must use exactly `RedirectTo`, fragment `token_hash`, and `type=recovery`.

The available Supabase connector cannot mutate hosted Auth email-template settings. Therefore this is an explicit manual Dashboard configuration gate: Auth → Email Templates → Reset Password.

- [ ] **Step 7: Configure exact production redirect URLs**

Before editing the allowlist, resolve the deployed origins rather than guessing:

- Store origin from `modulex-store` production (`NEXT_PUBLIC_SITE_URL` / production domain).
- Admin origin from the production `modulex` Vercel project (`NEXT_PUBLIC_SITE_URL` / assigned Admin domain).

Add exactly:

```text
<resolved-admin-origin>/reset-password
<resolved-store-origin>/dealer/reset-password
```

Keep required localhost development entries; do not add wildcard preview domains.

- [ ] **Step 8: Run the live smoke with operator-only environment**

```bash
cd modulex-admin
npm run smoke:dealer-portal-auth-live
```

Expected final line: `dealer portal live auth smoke: ok` and cleanup assertions PASS.

- [ ] **Step 9: Commit only the live smoke code, never credentials**

```bash
git add modulex-admin/scripts/dealer-portal-auth-live-smoke.mjs modulex-admin/package.json
git commit -m "test: add dealer portal live auth smoke"
```

---

### Task 8: Full Verification, Security Review, and PR Preparation

**Files:**
- Review all P1.3 branch changes.
- No new feature code unless a verification failure identifies a concrete defect.

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: fresh evidence that the branch is PR-ready, or a concrete failing check that must be fixed before PR creation.

- [ ] **Step 1: Run Store smoke suite**

```bash
cd modulex-store
npm test
```

Expected: all Store smoke commands PASS, including P1.2 activation and new P1.3 Dealer auth contract.

- [ ] **Step 2: Run Store lint and production build**

```bash
npm run lint
npm run build
```

Expected: both exit 0. Record actual output; do not infer success from compilation starting.

- [ ] **Step 3: Verify Store dependency lock consistency**

```bash
npm ci --ignore-scripts
npm ls @supabase/supabase-js @supabase/ssr
```

Expected: `npm ci` succeeds with no package/lock mismatch and the pinned versions resolve without invalid peer dependencies.

- [ ] **Step 4: Run Admin smoke suite**

```bash
cd ../modulex-admin
npm test
```

Expected: all existing Admin smoke tests plus `smoke:auth-recovery` PASS.

- [ ] **Step 5: Run Admin lint and production build**

```bash
npm run lint
npm run build
```

Expected: both exit 0.

- [ ] **Step 6: Re-run production live Auth smoke after hosted recovery configuration**

With operator-only credentials loaded locally:

```bash
npm run smoke:dealer-portal-auth-live
```

Expected: PASS and zero remaining fixtures.

- [ ] **Step 7: Perform final security diff review**

Review branch against `main` and explicitly check:

```text
- No Store service-role/secret env reference.
- No signUp/invite route added to Store.
- Protected layout checks getClaims + Dealer context RPC.
- Proxy matcher is limited to /dealer/:path*.
- No server authorization based on getSession().
- Login signs out denied authenticated identities.
- Suspended/disabled context is checked on protected render, not only login.
- Recovery token exists only in fragment parsing/template; no token_hash query-string links.
- Dealer reset checks account_type + context before updateUser.
- Admin reset rejects dealer_portal before updateUser.
- Forgot-password copy is enumeration-safe.
- Dealer shell exposes no orders/pricing/profile data.
- No wildcard preview redirect URLs were added.
```

- [ ] **Step 8: Check database-change invariant**

Run:

```bash
git diff --name-only main...HEAD -- 'modulex-store/supabase/migrations/**' 'modulex-admin/supabase/migrations/**'
```

Expected: no P1.3 migration files. If a migration exists, stop: the approved design requires a security/design review and, after approval, Security Advisor + Performance Advisor before PR readiness.

- [ ] **Step 9: Commit any verification-only test correction if needed**

Only if verification exposed a real test defect, fix it with the smallest change, rerun the failed command, and commit separately. Do not weaken assertions to make a failure disappear.

- [ ] **Step 10: Open PR only after every applicable check above has fresh evidence**

PR title:

```text
feat: add dealer login and protected portal shell
```

PR body must summarize:

- SSR cookie session architecture.
- `app_metadata` + P1.1 context double gate.
- protected `/dealer` shell scope.
- scanner-safe Dealer/Admin recovery compatibility.
- hosted Supabase Recovery template/redirect configuration performed.
- exact tests/lint/build/live smoke commands and outcomes.
- explicit statement that no DB migration, Store service-role secret, orders, pricing, or profile editing were added.

Do not merge the PR and do not trigger Vercel deployment.
