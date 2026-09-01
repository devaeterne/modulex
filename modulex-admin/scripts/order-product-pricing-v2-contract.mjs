import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migrationPath = "../modulex-store/supabase/migrations/20260901130000_order_product_pricing_v2.sql";
assert(fs.existsSync(path.join(root, migrationPath)), "Order pricing v2 additive migration must exist");

const migration = read(migrationPath);
const domain = read("src/lib/customers/order-domain.ts");
const picker = read("src/components/customers/OrderProductPicker.tsx");
const createOrder = read("src/components/customers/NewCustomerOrder.tsx");
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const detail = read("src/components/customers/CustomerOrderDetail.tsx");

for (const model of ["price_group", "countertop_material_band", "none"]) {
  assert(migration.includes(model), `DB routing must handle ${model}`);
}
assert(migration.includes("product_types") && migration.includes("pricing_model"), "DB routing must resolve Product Type pricing_model");
assert(migration.includes("product_prices") && migration.includes("valid_to is null"), "price_group lines must resolve the canonical current Product Price");
assert(!/v_unit_price\s*:=\s*coalesce\(\(v_item->>'unit_price'\)/.test(migration), "order pricing must not trust client unit_price");
assert(migration.includes("Countertop Material Band products must be configured in the Countertop workspace"), "Stone ordinary pricing must fail closed with a human-readable error");
assert(migration.includes("No Commercial Pricing products cannot be added to customer orders"), "pricing_model none must fail closed");
assert(migration.includes("Configured countertop lines must be changed in the countertop configurator"), "configured countertop history must retain the canonical edit guard");
assert(migration.includes("sku_snapshot") && migration.includes("product_name_snapshot"), "order item SKU/name snapshots must be preserved");
assert(migration.includes("line_total") && migration.includes("subtotal") && migration.includes("grand_total"), "order totals must remain server-authoritative");

for (const field of ["product_type_name", "pricing_model", "uom_code", "uom_name"]) {
  assert(domain.includes(field), `order product context must include ${field}`);
}
for (const label of ["Price Group", "Countertop Material Band", "No Commercial Pricing"]) {
  assert(domain.includes(label), `friendly pricing label missing: ${label}`);
}
assert(!domain.includes("unit_price: numeric(item.unitPrice)"), "update payload must not send a caller-controlled unit price");
assert(picker.includes("pricingModelLabel") && picker.includes("uom_name"), "product picker must show pricing route and UOM");
assert(createOrder.includes("countertop_material_band") && createOrder.includes("/pricing/countertop"), "create UI must guide Stone to the canonical Countertop workspace");
assert(editOrder.includes("pricing_model") && detail.includes("pricingModelLabel"), "edit/detail UI must expose pricing route metadata");

console.log("PASS: order product pricing v2 contract");
