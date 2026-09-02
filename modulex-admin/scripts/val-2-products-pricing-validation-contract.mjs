import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

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

const validationModuleSource = ts.transpileModule(read("src/lib/validation.ts"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const { parseDbDecimal, formatDbDecimal, canonicalizeDbDecimal, calculateDbDecimalBulk } = await import(`data:text/javascript,${encodeURIComponent(validationModuleSource)}`);

const expectValid = (value, contract, expected, label) => {
  const result = parseDbDecimal(value, contract);
  assert(result.error === null && result.value === expected, `${label} should be valid and exact`);
};
const expectInvalid = (value, contract, label) => {
  const result = parseDbDecimal(value, contract);
  assert(result.error !== null && result.value === null, `${label} should be rejected`);
};
const stockContract = { precision: 12, scale: 2, min: 0, allowNull: false };
const moneyContract = { precision: 18, scale: 4, min: 0, allowNull: true };
const marginContract = { precision: 7, scale: 3, min: 0, max: 100, allowNull: false };

expectValid(0, stockContract, "0", "zero minimum stock");
expectValid("12.34", stockContract, "12.34", "minimum stock scale");
expectValid("9999999999.99", stockContract, "9999999999.99", "maximum minimum stock");
for (const value of ["10000000000", "1.234", "-1", "", Number.NaN, Number.POSITIVE_INFINITY]) expectInvalid(value, stockContract, `minimum stock ${String(value)}`);

expectValid("10.1234", moneyContract, "10.1234", "price/cost four-decimal value");
expectValid("99999999999999.9999", moneyContract, "99999999999999.9999", "price/cost precision boundary");
expectValid("10,1234", moneyContract, "10.1234", "comma decimal input");
for (const value of ["100000000000000", "1.23456", "-1"]) expectInvalid(value, moneyContract, `price/cost ${value}`);
assert(parseDbDecimal("", moneyContract).error === null && parseDbDecimal("", moneyContract).value === null, "nullable price/cost empty input must become null");

for (const value of ["0", "12.345", "100.000"]) expectValid(value, marginContract, value === "100.000" ? "100.000" : value.replace(/\.0+$/, ""), `margin ${value}`);
for (const value of ["100.001", "12.3456", "-1"]) expectInvalid(value, marginContract, `margin ${value}`);
assert(formatDbDecimal("10.1234", moneyContract) === "10.1234", "four-decimal formatting must remain exact");
assert(formatDbDecimal("12.345", marginContract) === "12.345", "three-decimal formatting must remain exact");
assert(formatDbDecimal("100000000000000", moneyContract) === "", "invalid overflow must not format as valid");
assert(formatDbDecimal("1.23456", marginContract) === "", "invalid scale must not format as valid");

const bulk = (current, adjustment, mode = "current_amount") => calculateDbDecimalBulk(current, adjustment, mode, moneyContract);
assert(bulk("10.0000", "0.00005").value === "10.0001", "exact amount adjustment must round half-up at four decimals");
assert(bulk("10.0000", "0.00005", "current_amount").error === null, "exact amount adjustment should be accepted");
assert(bulk("10.0000", "0.00005", "current_percent").error === null, "exact percent adjustment should be accepted");
assert(calculateDbDecimalBulk("10.0000", "0.001", "current_percent", moneyContract).value === "10.0001", "percentage result must round deterministically to four decimals");
assert(bulk("10.0000", "-0.00005").value === "10.0000", "exact subtraction must use DB-compatible half-up rounding at four decimals");
assert(bulk("99999999999999.9999", "0.0001").error !== null, "bulk overflow must be rejected");
assert(bulk("0.0000", "-0.0001").error !== null, "negative final amount must be rejected");
for (const [left, right] of [["1.2", "1.20"], ["1.2000", "1.2"], ["0", "0.0000"], ["-0.000", "0"]]) {
  assert(canonicalizeDbDecimal(left, moneyContract) === canonicalizeDbDecimal(right, moneyContract), `${left} and ${right} must compare equal`);
}
assert(canonicalizeDbDecimal("1.2000", moneyContract) !== canonicalizeDbDecimal("1.2001", moneyContract), "different decimals must compare different");

assert(/parseDbDecimal[\s\S]*precision[\s\S]*scale/.test(validation), "Shared decimal parser must enforce precision and scale");
assert(/Number\.isFinite\(numericValue\)/.test(validation), "Decimal parser must reject non-finite values");
assert(/function canonicalizeDbDecimal/.test(validation), "Decimal comparison must expose canonical numeric representation");
assert(/function calculateDbDecimalBulk/.test(validation) && /BigInt/.test(validation), "Bulk decimal arithmetic must use exact integer-scaled arithmetic");
assert(/contract\.min[\s\S]*contract\.max/.test(validation), "Decimal parser must enforce configured ranges");
assert(/return contract\.allowNull === false/.test(validation), "Decimal parser must distinguish nullable and required inputs");
assert(/parseDbDecimal\(values\.min_stock_level,[\s\S]*precision: 12,[\s\S]*scale: 2,[\s\S]*min: 0/.test(productForm), "Product minimum stock must use numeric(12,2) non-negative validation");
assert(/min_stock_level: minStock\.value/.test(productForm), "Product mutation must send the normalized minimum stock value");

assert(/precision: 18, scale: 4, min: 0/.test(productPrices), "Product prices must use numeric(18,4) validation");
assert(/formatDbDecimal[\s\S]*scale: 4/.test(productPrices), "Product price hydration must preserve four decimal places");
assert(!/next\[targetKey\] = result\.toFixed\(2\)/.test(productPrices), "Bulk price preview must not truncate to two decimals");
assert(/parseDbDecimal\(value, PRICE_DECIMAL\)/.test(productPrices), "Invalid price precision/range must be rejected before RPC mutation");
assert(/calculateDbDecimalBulk/.test(productPrices) && !/currentValue\s*\+\s*parsedValue/.test(productPrices), "Server price bulk arithmetic must use exact decimal helper");
assert(/set_product_prices_bulk/.test(productPrices), "Product prices must retain the existing RPC mutation boundary");
assert(!/result\.toFixed\(\s*2\s*\)/.test(legacyProductPrices), "Legacy product price preview must not truncate to two decimals");
assert(/parseDbDecimal\(raw, \{ precision: 18, scale: 4/.test(legacyProductPrices), "Legacy product price save must enforce numeric(18,4)");
assert(/calculateDbDecimalBulk/.test(legacyProductPrices) && !/result\.toFixed\(\s*4\s*\)/.test(legacyProductPrices), "Legacy price bulk arithmetic must use exact decimal helper");

assert(/COST_DECIMAL = \{ precision: 18, scale: 4, min: 0/.test(costMargin), "Product costs must use numeric(18,4) validation");
assert(/MARGIN_DECIMAL = \{ precision: 7, scale: 3, min: 0, max: 100/.test(costMargin), "Margins must use numeric(7,3) with a 0..100 range");
assert(/function normalizeCost[\s\S]*COST_DECIMAL/.test(costMargin) && /function formatCostInput[\s\S]*COST_DECIMAL/.test(costMargin), "Cost paths must use explicit cost helpers");
assert(/function normalizeMargin[\s\S]*MARGIN_DECIMAL/.test(costMargin) && /function formatMarginInput[\s\S]*MARGIN_DECIMAL/.test(costMargin), "Margin paths must use explicit margin helpers");
assert(/costDirtyIds[\s\S]*normalizeCost/.test(costMargin) && /marginDirtyIds[\s\S]*normalizeMargin/.test(costMargin), "Dirty comparisons must use semantic cost/margin contracts");
assert(/settingsDirty[\s\S]*normalizeMargin/.test(costMargin), "Pricing settings dirty comparison must use the margin contract");
assert(/nextCosts[\s\S]*formatCostInput[\s\S]*nextMargins[\s\S]*formatMarginInput/.test(costMargin), "Cost and margin hydration must use distinct formatters");
assert(/default_min_margin_percent[\s\S]*formatMarginInput/.test(costMargin), "Pricing settings hydration must use the margin formatter");
assert(!/next\[id\] = result\.toFixed\(2\)/.test(costMargin), "Bulk cost preview must not truncate to two decimals");
assert(/parseDbDecimal\(raw, COST_DECIMAL\)/.test(costMargin), "Cost mutations must validate before the existing RPC");
assert(/calculateDbDecimalBulk/.test(costMargin) && !/current \* \(1 \+ adjustment \/ 100\)/.test(costMargin), "Cost bulk arithmetic must use exact decimal helper");
assert(/parseDbDecimal\(raw, MARGIN_DECIMAL\)/.test(costMargin), "Product margin mutations must validate numeric(7,3) and range");
assert(/set_product_costs_bulk/.test(costMargin), "Product costs must retain the existing RPC mutation boundary");
assert(/product_margin_settings/.test(costMargin), "Product-specific margin settings boundary must remain covered");
assert(/pricing\.manage/.test(costMargin), "Cost/margin mutation surface must require pricing.manage");
assert(/pricing\.cost\.view/.test(accessView) && /pricing\.manage/.test(accessView), "Cost/margin view and mutation permissions must remain distinct");

assert(!/::uuid/.test(productForm + productPrices + costMargin), "Product/pricing inputs must not coerce identifiers to UUID");
assert(/- \[x\] VAL-2 — Products & Pricing/.test(roadmap), "VAL-2 production acceptance must remain closed in the roadmap");

console.log("VAL-2 Products & Pricing validation contract: PASS");
