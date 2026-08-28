import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [
  proxyEntry,
  dealerAuth,
  loginAction,
  portalLayout,
  resetForm,
  forgotForm,
  rootLayout,
  chrome,
] = await Promise.all([
  read("src/proxy.ts"),
  read("src/lib/dealer/auth.ts"),
  read("src/app/dealer/(auth)/login/actions.ts"),
  read("src/app/dealer/(portal)/layout.tsx"),
  read("src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx"),
  read("src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx"),
  read("src/app/layout.tsx"),
  read("src/components/StoreChrome.tsx"),
]);

assert.match(proxyEntry, /matcher[\s\S]*\/dealer/, "proxy must be scoped to dealer routes");
assert.match(dealerAuth, /getClaims\(/, "server dealer authorization must validate claims");
assert.doesNotMatch(dealerAuth, /getSession\(\)/, "server dealer authorization must not trust getSession");
assert.match(dealerAuth, /account_type[\s\S]*dealer_portal/, "dealer authorization must require trusted account type");
assert.match(dealerAuth, /get_store_dealer_portal_context/, "dealer authorization must use the P1.1 portal context RPC");
assert.match(loginAction, /signInWithPassword/, "dealer login must use password authentication");
assert.match(loginAction, /signOut/, "denied authenticated dealer login states must be signed out");
assert.match(portalLayout, /dealer.*context|DealerPortalContext|requireDealer/i, "protected dealer layout must enforce dealer context");
assert.match(resetForm, /window\.location\.hash/, "dealer recovery token must arrive in the URL fragment");
assert.match(resetForm, /history\.replaceState/, "dealer recovery token must be cleared from the address bar");
assert.match(resetForm, /verifyOtp/, "dealer recovery token must be explicitly verified");
assert.match(resetForm, /get_store_dealer_portal_context/, "dealer recovery must re-check portal authorization");
assert.match(resetForm, /updateUser/, "dealer recovery must update the authenticated password only after checks");
assert.match(resetForm, /scope:\s*["']global["']/, "successful dealer recovery must globally sign out sessions");
assert.match(forgotForm, /resetPasswordForEmail/, "dealer forgot-password must use Supabase recovery");
assert.match(forgotForm, /If an eligible account exists/i, "dealer forgot-password copy must avoid account enumeration");
assert.match(rootLayout, /StoreChrome/, "root Store layout must delegate route-aware chrome");
assert.match(chrome, /usePathname/, "Store chrome must detect Dealer routes without restructuring marketing routes");
assert.doesNotMatch(
  `${dealerAuth}\n${loginAction}`,
  /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/,
  "Store Dealer auth must never depend on server admin credentials",
);

console.log("dealer portal auth contract: ok");
