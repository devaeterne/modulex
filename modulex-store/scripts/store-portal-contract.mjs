import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = async (relative) => {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};

const [
  navbar,
  storeChrome,
  proxy,
  portalAuth,
  accountLogin,
  accountLayout,
  dealerAuth,
  ordersHelper,
  orderList,
  orderDetail,
  migration,
] = await Promise.all([
  read("src/components/Navbar.tsx"),
  read("src/components/StoreChrome.tsx"),
  read("src/proxy.ts"),
  read("src/lib/portal/auth.ts"),
  read("src/app/account/(auth)/login/actions.ts"),
  read("src/app/account/(portal)/layout.tsx"),
  read("src/lib/dealer/auth.ts"),
  read("src/lib/portal/orders.ts"),
  read("src/components/portal/PortalOrderList.tsx"),
  read("src/components/portal/PortalOrderDetail.tsx"),
  read("supabase/migrations/20260828213000_store_unified_portal_order_access.sql"),
]);

assert.match(navbar, /href=["']\/account["']/, "public navbar must expose one account entry");
assert.match(navbar, /aria-label=["']Account["']/, "account entry must be accessible");
assert.match(navbar, /<svg/, "account entry must use the project-native inline icon approach");
assert.match(proxy, /\/account\/:path\*/, "Supabase SSR refresh must cover account routes");
assert.match(storeChrome, /account/i, "Store chrome must be account-route aware");

assert.match(portalAuth, /getClaims\(/, "shared portal authorization must validate claims");
assert.doesNotMatch(portalAuth, /getSession\(\)/, "shared portal authorization must not trust getSession");
assert.match(portalAuth, /get_store_portal_context/, "shared portal authorization must use the database context boundary");
assert.match(portalAuth, /dealer_portal/, "shared portal auth must support trusted dealer identities");
assert.match(portalAuth, /customer_portal/, "shared portal auth must support trusted customer identities");
assert.match(accountLogin, /signInWithPassword/, "unified account login must use password authentication");
assert.doesNotMatch(accountLogin, /\.from\(["'][^"']*(?:customer|portal)/i, "login must not pre-query email ownership");
assert.match(accountLogin, /dealer[\s\S]*\/dealer/i, "dealer identities must route to the Dealer portal");
assert.match(accountLogin, /customer[\s\S]*\/account/i, "customer identities must route to the Customer portal");
assert.match(accountLogin, /signOut/, "denied authenticated identities must be signed out");
assert.match(accountLayout, /requireCustomerPortalContext|requireStorePortalContext/, "Customer protected layout must enforce portal context");
assert.match(dealerAuth, /portal/i, "Dealer authorization must converge on the shared portal boundary");

assert.match(ordersHelper, /get_store_portal_orders/, "Store orders helper must use scoped list RPC");
assert.match(ordersHelper, /get_store_portal_order/, "Store order detail helper must use scoped detail RPC");
assert.match(orderList, /order_number|orderNumber/, "order list must display order identity");
assert.match(orderDetail, /sku|SKU/, "order detail must display SKU");
assert.match(orderDetail, /quantity/i, "order detail must display quantity");

assert.match(migration, /customer_portal/, "migration must isolate Customer Portal Auth from internal profiles");
assert.match(migration, /get_store_portal_context/, "migration must define shared portal context RPC");
assert.match(migration, /get_store_portal_orders/, "migration must define scoped order list RPC");
assert.match(migration, /get_store_portal_order/, "migration must define scoped order detail RPC");
assert.match(migration, /revoke execute[\s\S]*from public/i, "portal RPCs must revoke default PUBLIC execute");
assert.match(migration, /revoke execute[\s\S]*from anon/i, "portal RPCs must deny anon execute");
assert.match(migration, /grant execute[\s\S]*to authenticated/i, "portal RPCs must explicitly grant authenticated execute");
assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]{0,1200}'(?:unit_price|subtotal|tax_amount|total_amount|grand_total|payment_commission_amount|internal_notes)'/i, "portal RPC payloads must not emit monetary/internal fields");

for (const source of [portalAuth, accountLogin, ordersHelper]) {
  assert.doesNotMatch(source, /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/, "Store portal code must not use server admin credentials");
}

console.log("store portal contract: ok");
