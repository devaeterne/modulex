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
assert.match(migration, /tg_table_name in \('product_prices', 'product_costs', 'price_groups'\)[\s\S]*?\)::uuid/i, "UUID pricing tables must use explicit UUID mapping");
assert.match(migration, /tg_table_name = 'product_margin_settings'[\s\S]*?product_id[\s\S]*?\)::uuid/i, "Margin settings must use product_id as audit identity");
assert.match(migration, /tg_table_name = 'product_margin_settings'[\s\S]*?end if;[\s\S]*?insert into public\.audit_logs[\s\S]*?v_record_id/i, "Pricing settings must retain nullable audit record_id");
assert.doesNotMatch(migration, /pricing_settings[\s\S]{0,180}::uuid/i, "pricing_settings smallint id must never be cast to UUID");
const lifecycle = migration.match(/create or replace function public\.guard_price_group_lifecycle\([\s\S]*?\$\$;/i)?.[0] ?? "";
assert.match(lifecycle, /if tg_op = 'DELETE'[\s\S]*?old\.is_base_price[\s\S]*?raise exception/i, "Base-group delete must fail closed");
assert.match(lifecycle, /if tg_op = 'DELETE'[\s\S]*?return old;/i, "Non-base group delete must return OLD");
assert.match(lifecycle, /old\.is_base_price[\s\S]*?not new\.is_base_price[\s\S]*?raise exception/i, "Base identity demotion must fail closed");
assert.match(lifecycle, /old\.is_base_price[\s\S]*?not new\.is_active[\s\S]*?raise exception/i, "Base deactivation must fail closed");
assert.match(productPrices, /hasPermission\(profile\?\.roles,\s*["']pricing\.manage["']\)/, "Product pricing writes must use effective pricing.manage permission");
assert.match(groups, /hasPermission\(profile\?\.roles,\s*["']pricing\.manage["']\)/, "Price-group writes must use effective pricing.manage permission");
assert.match(costMargin, /hasPermission\(profile\?\.roles,\s*["']pricing\.(?:manage|cost\.view)["']\)/, "Cost/margin access must use effective pricing permission");
assert.match(dealerPricing, /priceAvailable/, "Dealer pricing must expose availability instead of fallback");
assert.match(dealerPricing, /price_group_id/, "Dealer pricing must be scoped to assigned price group");
assert.match(dealerPricing, /valid_from[\s\S]*now\(\)/, "Dealer pricing must enforce effective dates");
assert.doesNotMatch(dealerPricing, /coalesce\s*\(\s*pp\.?amount\s*,/i, "Dealer pricing must not silently fall back to public/list price");
assert.match(roadmap, /- \[(?:~|x)\] Add validation\/audit coverage for price changes\./, "A3.3 implementation status is missing");
const a33Section = roadmap.split("## A3.3 Pricing")[1]?.split("### Phase A3 Exit Gate")[0] ?? "";
assert.match(a33Section, /CLOSED/i, "A3.3 production acceptance closeout must remain recorded");

console.log("A3.3 Pricing contract: PASS");
