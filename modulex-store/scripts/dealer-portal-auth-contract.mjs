import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [proxyEntry, dealerAuth, sharedAuth, loginAction, portalLayout, resetForm, forgotForm, rootLayout, chrome] = await Promise.all([
  read("src/proxy.ts"),
  read("src/lib/dealer/auth.ts"),
  read("src/lib/portal/auth.ts"),
  read("src/app/dealer/(auth)/login/actions.ts"),
  read("src/app/dealer/(portal)/layout.tsx"),
  read("src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx"),
  read("src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx"),
  read("src/app/layout.tsx"),
  read("src/components/StoreChrome.tsx"),
]);

assert.match(proxyEntry, /matcher[\s\S]*\/dealer/, "proxy must remain scoped to dealer routes");
assert.match(sharedAuth, /getClaims\(/, "server portal authorization must validate claims");
assert.doesNotMatch(sharedAuth, /getSession\(\)/, "server portal authorization must not trust getSession");
assert.match(sharedAuth, /dealer_portal/, "shared authorization must preserve trusted dealer account type");
assert.match(sharedAuth, /get_store_portal_context/, "dealer authorization must use the shared customer-isolation context RPC");
assert.match(dealerAuth, /readStorePortalSession/, "dealer protected routes must consume the shared portal authorization boundary");
assert.match(loginAction, /signInWithPassword/, "dealer login must use password authentication");
assert.match(loginAction, /dealer_portal/, "dealer login must require trusted dealer account metadata");
assert.match(loginAction, /get_store_portal_context/, "dealer login must use shared portal context");
assert.match(loginAction, /portal_kind[\s\S]*dealer/, "dealer login must require dealer portal kind");
assert.match(loginAction, /signOut/, "denied authenticated dealer login states must be signed out");
assert.match(portalLayout, /requireDealer/i, "protected dealer layout must enforce dealer context");
assert.match(resetForm, /window\.location\.hash/, "dealer recovery token must arrive in the URL fragment");
assert.match(resetForm, /history\.replaceState/, "dealer recovery token must be cleared from the address bar");
assert.match(resetForm, /verifyOtp/, "dealer recovery token must be explicitly verified");
assert.match(resetForm, /get_store_portal_context/, "dealer recovery must re-check shared portal authorization");
assert.match(resetForm, /portal_kind[\s\S]*dealer/, "dealer recovery must require dealer portal kind");
assert.match(resetForm, /updateUser/, "dealer recovery must update the authenticated password only after checks");
assert.match(resetForm, /scope:\s*["']global["']/, "successful dealer recovery must globally sign out sessions");
assert.match(forgotForm, /resetPasswordForEmail/, "dealer forgot-password must use Supabase recovery");
assert.match(forgotForm, /If an eligible account exists/i, "dealer forgot-password copy must avoid account enumeration");
assert.match(rootLayout, /StoreChrome/, "root Store layout must delegate route-aware chrome");
assert.match(chrome, /usePathname/, "Store chrome must detect portal routes without restructuring marketing routes");
assert.doesNotMatch(`${dealerAuth}\n${sharedAuth}\n${loginAction}`, /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/, "Store Dealer auth must never depend on server admin credentials");

console.log("dealer portal auth contract: ok");
