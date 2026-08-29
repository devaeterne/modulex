import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const pagePath = path.join(root, "src/app/(admin)/customers/[id]/page.tsx");
const cardPath = path.join(root, "src/components/customers/CustomerCard.tsx");
const portalCardPath = path.join(root, "src/components/customers/CustomerPortalAccessCard.tsx");
const sqlPath = path.join(root, "sql/customer-address-integrity.sql");
const packagePath = path.join(root, "package.json");

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function requireNoMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const page = read(pagePath);
const card = read(cardPath);
const portalCard = read(portalCardPath);
const sql = read(sqlPath);
const pkg = JSON.parse(read(packagePath));

requireNoMatch(page, /legacy-customer-card|<style>/, "Customer detail must not hide legacy actions with route-level CSS.");
requireMatch(page, /<CustomerOrderActions\s*\/>[\s\S]*<CustomerCard\s*\/>[\s\S]*<CustomerPortalAccessCard\s+customerId=\{id\}\s*\/>[\s\S]*<CustomerDocumentsPanel\s+customerId=\{id\}\s*\/>/, "Customer detail hierarchy must keep global order actions first, core customer data second, then secure portal and document management.");

requireNoMatch(card, /["']Web \/ Portal["']/, "Legacy Web / Portal tab must be removed from CustomerCard.");
requireNoMatch(card, /\.from\(["']customer_portal_users["']\)\.(insert|update|delete)/, "CustomerCard must not mutate portal users directly from the browser.");
requireNoMatch(card, /saveCustomer\s*\(\s*\{\s*portal_enabled/, "CustomerCard must not toggle portal_enabled through a generic customer update.");
requireMatch(portalCard, /\/api\/admin\/dealer-portal/, "The dedicated portal card must use the secure Admin lifecycle API.");
requireMatch(portalCard, />Store Portal Access</, "The secure lifecycle surface must use customer-type-neutral portal wording.");

requireMatch(card, /supabase\.rpc\(\s*["']create_customer_address["']/, "Address creation must use the atomic create_customer_address RPC.");
requireMatch(card, /supabase\.rpc\(\s*["']set_customer_address_default["']/, "Existing addresses must support atomic default assignment through set_customer_address_default.");
requireNoMatch(card, /customer_addresses["']\)\.update\(\s*\{\s*is_default_(billing|shipping):\s*false/, "CustomerCard must not clear address defaults in a separate browser update.");

requireMatch(sql, /create or replace function public\.create_customer_address\s*\(/i, "A1.1C SQL must define create_customer_address.");
requireMatch(sql, /create or replace function public\.set_customer_address_default\s*\(/i, "A1.1C SQL must define set_customer_address_default.");
requireNoMatch(sql, /security\s+definer/i, "A1.1C address RPCs must not use SECURITY DEFINER.");
requireMatch(sql, /security\s+invoker/i, "A1.1C address RPCs must be SECURITY INVOKER.");
requireMatch(sql, /current_user_has_any_role\s*\(\s*array\s*\[\s*['"]super_admin['"]\s*,\s*['"]admin['"]\s*,\s*['"]sales['"]/i, "Address mutations must authorize the approved Admin roles.");
requireMatch(sql, /from public\.customers[\s\S]{0,220}for update/i, "Address default mutations must serialize on the customer row.");
requireMatch(sql, /is_default_billing\s*=\s*false/i, "Atomic address creation must clear the previous billing default inside the RPC.");
requireMatch(sql, /is_default_shipping\s*=\s*false/i, "Atomic address creation must clear the previous shipping default inside the RPC.");
requireMatch(sql, /insert into public\.customer_addresses/i, "Atomic address creation must insert the address inside the same RPC transaction.");
requireMatch(sql, /insert into public\.customer_activity/i, "Address/default mutations must write customer activity in the same transaction.");
requireMatch(sql, /revoke all on function public\.create_customer_address[\s\S]{0,400}from public/i, "create_customer_address must revoke PUBLIC execute.");
requireMatch(sql, /grant execute on function public\.create_customer_address[\s\S]{0,400}to authenticated/i, "create_customer_address must grant execute to authenticated only.");
requireMatch(sql, /revoke all on function public\.set_customer_address_default[\s\S]{0,300}from public/i, "set_customer_address_default must revoke PUBLIC execute.");
requireMatch(sql, /grant execute on function public\.set_customer_address_default[\s\S]{0,300}to authenticated/i, "set_customer_address_default must grant execute to authenticated only.");

if (pkg.scripts?.["smoke:customer-detail"] !== "node scripts/customer-detail-integrity-contract.mjs") {
  throw new Error("package.json must expose smoke:customer-detail.");
}
if (!pkg.scripts?.smoke?.includes("smoke:customer-detail")) {
  throw new Error("Main Admin smoke chain must include smoke:customer-detail.");
}

console.log("Customer detail integrity contract passed.");
