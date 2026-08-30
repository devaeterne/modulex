import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const migrationPath = "sql/a3-3-pricing-hardening.sql";
assert.ok(exists(migrationPath), "A3.3 pricing hardening migration is missing");
const migration = read(migrationPath);
const productPrices = read("src/components/pricing/ProductPricesServerTable.tsx");
const groups = read("src/components/pricing/PriceGroupsTable.tsx");
const costMargin = read("src/components/pricing/CostMarginServerTable.tsx");
const dealerPricing = read("../modulex-store/supabase/migrations/20260828223000_store_dealer_catalog_pricing.sql");
const roadmap = read("ADMIN_ROADMAP.md");

for (const token of [
  "audit_logs",
  "set_product_price",
  "set_product_prices_bulk",
  "product_prices_current_unique_idx",
  "set search_path = pg_catalog, public",
  "is_base_price",
  "product_margin_settings",
]) {
  assert.match(migration.toLowerCase(), new RegExp(token.replaceAll(" ", "\\s+")), `A3.3 migration must cover ${token}`);
}
assert.match(migration, /lower\(tg_op\)::public\.audit_action/, "Audit action must map trigger operation to audit enum");
assert.match(migration, /identity cannot be removed/i, "Base group identity must be immutable");
assert.match(migration, /cannot be deleted/i, "Base group deletion must be blocked");
assert.match(migration, /trg_product_margin_settings_audit/, "Product-specific margin changes must be audited");
assert.match(productPrices, /hasPermission\(profile\?\.roles,\s*["']pricing\.manage["']\)/, "Product pricing writes must use effective pricing.manage permission");
assert.match(groups, /hasPermission\(profile\?\.roles,\s*["']pricing\.manage["']\)/, "Price-group writes must use effective pricing.manage permission");
assert.match(costMargin, /hasPermission\(profile\?\.roles,\s*["']pricing\.(?:manage|cost\.view)["']\)/, "Cost/margin access must use effective pricing permission");
assert.match(dealerPricing, /priceAvailable/, "Dealer pricing must expose availability instead of fallback");
assert.match(dealerPricing, /price_group_id/, "Dealer pricing must be scoped to assigned price group");
assert.match(dealerPricing, /valid_from[\s\S]*now\(\)/, "Dealer pricing must enforce effective dates");
assert.doesNotMatch(dealerPricing, /coalesce\s*\(\s*pp\.?amount\s*,/i, "Dealer pricing must not silently fall back to public/list price");
assert.match(roadmap, /- \[(?:~|x)\] Add validation\/audit coverage for price changes\./, "A3.3 implementation status is missing");
const a33Section = roadmap.split("## A3.3 Pricing")[1]?.split("### Phase A3 Exit Gate")[0] ?? "";
assert.doesNotMatch(a33Section, /CLOSED/i, "A3.3 must not be marked CLOSED before production acceptance");

console.log("A3.3 Pricing contract: PASS");
