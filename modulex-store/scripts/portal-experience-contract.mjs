import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

assert.equal(exists("src/components/portal/PortalAuthShell.tsx"), true);
assert.equal(exists("src/components/portal/PortalShell.tsx"), true);
assert.equal(exists("src/components/portal/PortalNavigation.tsx"), true);
assert.equal(exists("src/app/portal.css"), true);

const themeToggle = read("src/components/ThemeToggle.tsx");
assert.match(themeToggle, /localStorage\.getItem\(["']oakwell-theme["']/);
assert.match(themeToggle, /localStorage\.setItem\(["']theme["']/);
assert.doesNotMatch(themeToggle, /localStorage\.setItem\(["']oakwell-theme["']/);

for (const file of [
  "src/app/account/(auth)/login/page.tsx","src/app/account/(auth)/forgot-password/page.tsx","src/app/account/(auth)/reset-password/page.tsx","src/app/account/activate/page.tsx",
  "src/app/dealer/(auth)/login/page.tsx","src/app/dealer/(auth)/forgot-password/page.tsx","src/app/dealer/(auth)/reset-password/page.tsx","src/app/dealer/activate/page.tsx",
]) assert.match(read(file), /PortalAuthShell/);

for (const file of [
  "src/app/account/(auth)/login/AccountLoginForm.tsx","src/app/account/(auth)/forgot-password/AccountForgotPasswordForm.tsx","src/app/account/(auth)/reset-password/AccountResetPasswordForm.tsx","src/app/account/activate/AccountActivationForm.tsx",
  "src/app/dealer/(auth)/login/DealerLoginForm.tsx","src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx","src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx","src/app/dealer/activate/DealerActivationForm.tsx",
]) {
  const source = read(file);
  assert.match(source, /portal-input/);
  assert.match(source, /portal-button--primary/);
  assert.doesNotMatch(source, /className=["'][^"']*\bform-control\b/);
}

const storeChrome = read("src/components/StoreChrome.tsx");
assert.match(storeChrome, /pathname\.startsWith\(["']\/account\/["']\)/);
assert.match(storeChrome, /pathname\.startsWith\(["']\/dealer\/["']\)/);
for (const file of ["src/app/account/(portal)/layout.tsx", "src/app/dealer/(portal)/layout.tsx"]) {
  const source = read(file); assert.match(source, /PortalShell/); assert.doesNotMatch(source, /bg-light|bg-white/);
}
for (const file of ["src/components/portal/PortalOrderList.tsx", "src/components/portal/PortalOrderDetail.tsx"]) assert.match(read(file), /portal-/);

const fulfillmentMigrationPath = "supabase/migrations/20260828222000_store_portal_fulfillment_visibility.sql";
assert.equal(exists(fulfillmentMigrationPath), true);
const fulfillmentMigration = read(fulfillmentMigrationPath);
for (const fn of ["get_store_portal_dashboard_summary","get_store_portal_shipments","get_store_portal_shipment","get_store_portal_installations","get_store_portal_installation"]) assert.match(fulfillmentMigration, new RegExp(fn));
for (const forbidden of ["source_warehouse_id", "source_location_id", "stock_deducted_at", "assigned_to"]) assert.doesNotMatch(fulfillmentMigration, new RegExp(`'${forbidden}'`));
assert.doesNotMatch(fulfillmentMigration, /'internal_notes'/);

const fulfillmentHelper = read("src/lib/portal/fulfillment.ts");
for (const fn of ["getPortalShipments", "getPortalShipment", "getPortalInstallations", "getPortalInstallation", "getPortalDashboardSummary"]) assert.match(fulfillmentHelper, new RegExp(fn));
for (const forbidden of ["internal_notes", "source_warehouse_id", "source_location_id", "stock_deducted_at", "assigned_to"]) assert.doesNotMatch(fulfillmentHelper, new RegExp(forbidden));
for (const file of [
  "src/app/account/(portal)/shipments/page.tsx","src/app/account/(portal)/shipments/[id]/page.tsx","src/app/account/(portal)/installations/page.tsx","src/app/account/(portal)/installations/[id]/page.tsx",
  "src/app/dealer/(portal)/shipments/page.tsx","src/app/dealer/(portal)/shipments/[id]/page.tsx","src/app/dealer/(portal)/installations/page.tsx","src/app/dealer/(portal)/installations/[id]/page.tsx",
]) assert.equal(exists(file), true);
for (const file of ["src/app/account/(portal)/page.tsx", "src/app/dealer/(portal)/page.tsx"]) assert.match(read(file), /getPortalDashboardSummary/);

const pricingMigrationPath = "supabase/migrations/20260828223000_store_dealer_catalog_pricing.sql";
assert.equal(exists(pricingMigrationPath), true);
const pricingMigration = read(pricingMigrationPath);
for (const fn of ["get_store_dealer_catalog_products", "get_store_dealer_product_by_slug", "get_store_dealer_order", "get_store_dealer_pricing_context"]) assert.match(pricingMigration, new RegExp(fn));
for (const forbidden of ["current_cost", "margin", "profit", "payment_commission", "internal_notes"]) assert.doesNotMatch(pricingMigration, new RegExp(`'${forbidden}'`, "i"));

assert.equal(exists("src/lib/portal/dealer.ts"), true);
assert.equal(exists("src/components/portal/DealerCatalog.tsx"), true);
assert.equal(exists("src/app/dealer/(portal)/catalog/page.tsx"), true);
const dealerHelper = read("src/lib/portal/dealer.ts");
for (const fn of ["getDealerPricingContext", "getDealerCatalogProducts", "getDealerProductBySlug", "getDealerOrder"]) assert.match(dealerHelper, new RegExp(fn));
assert.doesNotMatch(dealerHelper, /customer_id|price_group_id/);
for (const forbidden of ["current_cost", "margin", "profit", "payment_commission", "internal_notes"]) assert.doesNotMatch(dealerHelper, new RegExp(forbidden, "i"));
assert.match(read("src/components/portal/DealerCatalog.tsx"), /Contact sales for pricing/);
assert.match(read("src/app/dealer/(portal)/orders/[id]/page.tsx"), /getDealerOrder/);
assert.match(read("src/components/portal/PortalOrderDetail.tsx"), /kind:\s*["']dealer["']/);

const documentsMigrationPath = "supabase/migrations/20260828224000_store_dealer_documents_account.sql";
assert.equal(exists(documentsMigrationPath), true, "P1.5C Dealer documents/account migration must exist");
const documentsMigration = read(documentsMigrationPath);
assert.match(documentsMigration, /portal_visible\s+boolean\s+not\s+null\s+default\s+false/i);
assert.match(documentsMigration, /customer-documents/);
assert.match(documentsMigration, /get_store_dealer_documents/);
assert.match(documentsMigration, /get_store_dealer_document/);
assert.match(documentsMigration, /get_store_dealer_account/);
assert.match(documentsMigration, /portal_visible/);
assert.match(documentsMigration, /is_active/);
assert.doesNotMatch(documentsMigration, /'sales_rep_id'|'credit_hold'|'internal_notes'/i);

for (const file of [
  "src/app/dealer/(portal)/documents/page.tsx",
  "src/app/dealer/(portal)/documents/[id]/download/route.ts",
  "src/app/dealer/(portal)/account/page.tsx",
]) assert.equal(exists(file), true, `${file} must exist`);
for (const fn of ["getDealerDocuments", "getDealerDocumentDownload", "getDealerAccount"]) assert.match(dealerHelper, new RegExp(fn));
const documentsPage = read("src/app/dealer/(portal)/documents/page.tsx");
assert.match(documentsPage, /getDealerDocuments/);
assert.doesNotMatch(documentsPage, /storage_bucket|storage_path/);
const downloadRoute = read("src/app/dealer/(portal)/documents/[id]/download/route.ts");
assert.match(downloadRoute, /readDealerPortalSession/);
assert.match(downloadRoute, /getDealerDocumentDownload/);
assert.match(downloadRoute, /createSignedUrl\([^,]+,\s*60\)/);
assert.doesNotMatch(downloadRoute, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
const accountPage = read("src/app/dealer/(portal)/account/page.tsx");
assert.match(accountPage, /getDealerAccount/);
assert.doesNotMatch(accountPage, /sales_rep|credit_hold|internal_notes/i);

console.log("P1.5 portal experience contract PASS");
