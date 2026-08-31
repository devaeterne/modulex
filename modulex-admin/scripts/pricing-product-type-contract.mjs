import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migrationPath = "../modulex-store/supabase/migrations/20260901010000_pricing_product_type_routing.sql";
const productPricesPath = "src/components/pricing/ProductPricesServerTable.tsx";
const materialBandsPath = "src/components/pricing/MaterialBandPricingTable.tsx";
const materialBandsPagePath = "src/app/(admin)/pricing/material-bands/page.tsx";

assert.ok(fs.existsSync(path.join(root, migrationPath)), "Pricing Product Type routing migration is required");
assert.ok(fs.existsSync(path.join(root, materialBandsPath)), "Material Bands pricing workspace is required");
assert.ok(fs.existsSync(path.join(root, materialBandsPagePath)), "Material Bands pricing route is required");

const migration = read(migrationPath);
const productPrices = read(productPricesPath);
const materialBands = read(materialBandsPath);
const materialBandsPage = read(materialBandsPagePath);
const sidebar = read("src/layout/AppSidebar.tsx");

assert.match(migration, /get_product_prices_page_v2/i, "Pricing directory must expose a v2 RPC");
assert.match(migration, /product_type_id/i, "Pricing v2 RPC must expose Product Type identity");
assert.match(migration, /uom_id/i, "Pricing v2 RPC must expose UOM identity");
assert.match(migration, /pricing_model/i, "Pricing v2 RPC must expose pricing_model");
assert.match(migration, /pricing_model\s*=\s*'price_group'/i, "Price Group directory must be DB-filtered by pricing_model");
assert.match(migration, /page_order/i, "Pricing v2 RPC must preserve the selected server sort in its JSON item order");
assert.match(migration, /This Product Type does not use Price Group pricing\./, "set_product_price must fail closed for non-price_group Product Types");
assert.match(migration, /create or replace function public\.set_product_price/i, "Existing price mutation boundary must be hardened in-place");

assert.match(productPrices, /get_product_prices_page_v2/, "Product Prices must use the v2 server paging contract");
assert.match(productPrices, /productTypeFilter/, "Product Prices must support Product Type filtering");
assert.match(productPrices, /uomFilter/, "Product Prices must support UOM filtering");
assert.match(productPrices, /Product Type/, "Product Prices must show Product Type");
assert.match(productPrices, /Unit of Measure/, "Product Prices must show UOM semantics");
assert.match(productPrices, /\/pricing\/material-bands/, "Product Prices must route Stone pricing to Material Bands");
assert.match(productPrices, /set_product_prices_bulk/, "Existing audited bulk price mutation must remain canonical");

for (const sharedPrimitive of [/ComponentCard/, /<Select/, /<Badge/, /<TableViewport/, /<Table/]) {
  assert.match(productPrices, sharedPrimitive, "Product Prices must compose shared Admin UI primitives");
}

assert.match(materialBandsPage, /MaterialBandPricingTable/, "Material Bands route must render the focused pricing workspace");
assert.match(materialBands, /countertop_material_price_bands/, "Material Bands workspace must read the canonical band table");
assert.match(materialBands, /upsert_countertop_reference/, "Material Bands mutations must use the canonical countertop RPC");
assert.match(materialBands, /p_kind:\s*["']material_band["']/, "Material Bands RPC must use the material_band kind");
assert.doesNotMatch(materialBands, /\.from\(["']countertop_material_price_bands["']\)\.update\(/, "Material Bands must not bypass the canonical mutation RPC");
for (const sharedPrimitive of [/ComponentCard/, /<Modal/, /<Input/, /<Badge/, /<Alert/, /<TableViewport/, /<Table/, /<Button/]) {
  assert.match(materialBands, sharedPrimitive, "Material Bands must compose shared Admin UI primitives");
}

assert.match(sidebar, /path:\s*["']\/pricing\/material-bands["']/, "Sidebar must expose Material Bands under Pricing");
assert.match(sidebar, /Material Bands/, "Sidebar must label the dedicated material pricing route");

console.log("pricing product type contract: PASS");
