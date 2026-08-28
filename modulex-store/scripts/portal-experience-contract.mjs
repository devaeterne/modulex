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
  "src/app/account/(auth)/login/page.tsx",
  "src/app/account/(auth)/forgot-password/page.tsx",
  "src/app/account/(auth)/reset-password/page.tsx",
  "src/app/account/activate/page.tsx",
  "src/app/dealer/(auth)/login/page.tsx",
  "src/app/dealer/(auth)/forgot-password/page.tsx",
  "src/app/dealer/(auth)/reset-password/page.tsx",
  "src/app/dealer/activate/page.tsx",
]) assert.match(read(file), /PortalAuthShell/);

for (const file of [
  "src/app/account/(auth)/login/AccountLoginForm.tsx",
  "src/app/account/(auth)/forgot-password/AccountForgotPasswordForm.tsx",
  "src/app/account/(auth)/reset-password/AccountResetPasswordForm.tsx",
  "src/app/account/activate/AccountActivationForm.tsx",
  "src/app/dealer/(auth)/login/DealerLoginForm.tsx",
  "src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx",
  "src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx",
  "src/app/dealer/activate/DealerActivationForm.tsx",
]) {
  const source = read(file);
  assert.match(source, /portal-input/, `${file} must use Oakwell portal inputs`);
  assert.match(source, /portal-button--primary/, `${file} must use Oakwell portal buttons`);
  assert.doesNotMatch(source, /className=["'][^"']*\bform-control\b/, `${file} must not rely on Bootstrap form-control`);
}

const storeChrome = read("src/components/StoreChrome.tsx");
assert.match(storeChrome, /pathname\.startsWith\(["']\/account\/["']\)/, "all account routes must use standalone portal chrome");
assert.match(storeChrome, /pathname\.startsWith\(["']\/dealer\/["']\)/, "all dealer routes must use standalone portal chrome");

for (const file of ["src/app/account/(portal)/layout.tsx", "src/app/dealer/(portal)/layout.tsx"]) {
  const source = read(file);
  assert.match(source, /PortalShell/);
  assert.doesNotMatch(source, /bg-light|bg-white/);
}

for (const file of ["src/components/portal/PortalOrderList.tsx", "src/components/portal/PortalOrderDetail.tsx"]) {
  assert.match(read(file), /portal-/);
}

const fulfillmentMigrationPath = "supabase/migrations/20260828222000_store_portal_fulfillment_visibility.sql";
assert.equal(exists(fulfillmentMigrationPath), true, "P1.5B fulfillment migration must exist");
const fulfillmentMigration = read(fulfillmentMigrationPath);
for (const fn of [
  "get_store_portal_dashboard_summary",
  "get_store_portal_shipments",
  "get_store_portal_shipment",
  "get_store_portal_installations",
  "get_store_portal_installation",
]) assert.match(fulfillmentMigration, new RegExp(fn), `fulfillment migration must define ${fn}`);
for (const forbidden of ["source_warehouse_id", "source_location_id", "stock_deducted_at", "assigned_to"]) {
  assert.doesNotMatch(fulfillmentMigration, new RegExp(`'${forbidden}'`), `portal payload must not emit ${forbidden}`);
}
assert.doesNotMatch(fulfillmentMigration, /'internal_notes'/, "portal fulfillment payload must not emit internal notes");

const fulfillmentHelper = read("src/lib/portal/fulfillment.ts");
for (const fn of ["getPortalShipments", "getPortalShipment", "getPortalInstallations", "getPortalInstallation", "getPortalDashboardSummary"]) {
  assert.match(fulfillmentHelper, new RegExp(fn), `Store helper must define ${fn}`);
}
for (const forbidden of ["internal_notes", "source_warehouse_id", "source_location_id", "stock_deducted_at", "assigned_to"]) {
  assert.doesNotMatch(fulfillmentHelper, new RegExp(forbidden), `Store fulfillment types must not expose ${forbidden}`);
}

for (const file of [
  "src/app/account/(portal)/shipments/page.tsx",
  "src/app/account/(portal)/shipments/[id]/page.tsx",
  "src/app/account/(portal)/installations/page.tsx",
  "src/app/account/(portal)/installations/[id]/page.tsx",
  "src/app/dealer/(portal)/shipments/page.tsx",
  "src/app/dealer/(portal)/shipments/[id]/page.tsx",
  "src/app/dealer/(portal)/installations/page.tsx",
  "src/app/dealer/(portal)/installations/[id]/page.tsx",
]) assert.equal(exists(file), true, `${file} must exist`);

for (const file of ["src/app/account/(portal)/page.tsx", "src/app/dealer/(portal)/page.tsx"]) {
  assert.match(read(file), /getPortalDashboardSummary/, `${file} must use the scoped dashboard summary`);
}

console.log("P1.5 portal experience contract PASS");
