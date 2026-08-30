import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const validation = read("src/lib/validation.ts");
const productForm = read("src/components/products/ProductForm.tsx");
const productPrices = read("src/components/pricing/ProductPricesServerTable.tsx");
const legacyProductPrices = read("src/components/pricing/ProductPricesTable.tsx");
const costMargin = read("src/components/pricing/CostMarginServerTable.tsx");
const accessView = read("src/components/pricing/CostMarginAccessView.tsx");
const roadmap = read("ADMIN_ROADMAP.md");

assert(/parseDbDecimal[\s\S]*precision[\s\S]*scale/.test(validation), "Shared decimal parser must enforce precision and scale");
assert(/Number\.isFinite\(numericValue\)/.test(validation), "Decimal parser must reject non-finite values");
assert(/contract\.min[\s\S]*contract\.max/.test(validation), "Decimal parser must enforce configured ranges");
assert(/return contract\.allowNull === false/.test(validation), "Decimal parser must distinguish nullable and required inputs");
assert(/parseDbDecimal\(values\.min_stock_level,[\s\S]*precision: 12,[\s\S]*scale: 2,[\s\S]*min: 0/.test(productForm), "Product minimum stock must use numeric(12,2) non-negative validation");
assert(/min_stock_level: minStock\.value/.test(productForm), "Product mutation must send the normalized minimum stock value");

assert(/precision: 18, scale: 4, min: 0/.test(productPrices), "Product prices must use numeric(18,4) validation");
assert(/formatDbDecimal[\s\S]*scale: 4/.test(productPrices), "Product price hydration must preserve four decimal places");
assert(!/next\[targetKey\] = result\.toFixed\(2\)/.test(productPrices), "Bulk price preview must not truncate to two decimals");
assert(/parseDbDecimal\(value, PRICE_DECIMAL\)/.test(productPrices), "Invalid price precision/range must be rejected before RPC mutation");
assert(/set_product_prices_bulk/.test(productPrices), "Product prices must retain the existing RPC mutation boundary");
assert(!/result\.toFixed\(\s*2\s*\)/.test(legacyProductPrices), "Legacy product price preview must not truncate to two decimals");
assert(/parseDbDecimal\(raw, \{ precision: 18, scale: 4/.test(legacyProductPrices), "Legacy product price save must enforce numeric(18,4)");

assert(/COST_DECIMAL = \{ precision: 18, scale: 4, min: 0/.test(costMargin), "Product costs must use numeric(18,4) validation");
assert(/MARGIN_DECIMAL = \{ precision: 7, scale: 3, min: 0, max: 100/.test(costMargin), "Margins must use numeric(7,3) with a 0..100 range");
assert(!/next\[id\] = result\.toFixed\(2\)/.test(costMargin), "Bulk cost preview must not truncate to two decimals");
assert(/parseDbDecimal\(raw, COST_DECIMAL\)/.test(costMargin), "Cost mutations must validate before the existing RPC");
assert(/parseDbDecimal\(raw, MARGIN_DECIMAL\)/.test(costMargin), "Product margin mutations must validate numeric(7,3) and range");
assert(/set_product_costs_bulk/.test(costMargin), "Product costs must retain the existing RPC mutation boundary");
assert(/product_margin_settings/.test(costMargin), "Product-specific margin settings boundary must remain covered");
assert(/pricing\.manage/.test(costMargin), "Cost/margin mutation surface must require pricing.manage");
assert(/pricing\.cost\.view/.test(accessView) && /pricing\.manage/.test(accessView), "Cost/margin view and mutation permissions must remain distinct");

assert(!/::uuid/.test(productForm + productPrices + costMargin), "Product/pricing inputs must not coerce identifiers to UUID");
assert(/- \[~\] VAL-2 — Products & Pricing/.test(roadmap), "VAL-2 must remain in progress until production acceptance");

console.log("VAL-2 Products & Pricing validation contract: PASS");
