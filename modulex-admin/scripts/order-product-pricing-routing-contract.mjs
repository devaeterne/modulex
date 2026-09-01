import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const migrationPath = path.join(root, "modulex-store/supabase/migrations/20260901130000_order_product_pricing_routing.sql");
const domainPath = path.join(root, "modulex-admin/src/lib/customers/order-domain.ts");
const pickerPath = path.join(root, "modulex-admin/src/components/customers/OrderProductPicker.tsx");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, "utf8");
}

function expect(text, pattern, reason) {
  if (!pattern.test(text)) throw new Error(reason);
}

const migration = read(migrationPath);
const domain = read(domainPath);
const picker = read(pickerPath);

expect(migration, /product_type_code_snapshot/i, "Order items must snapshot Product Type semantics.");
expect(migration, /uom_code_snapshot/i, "Order items must snapshot UOM semantics.");
expect(migration, /pricing_model_snapshot/i, "Order items must snapshot the pricing route.");
expect(migration, /countertop_material_band/i, "Ordinary Orders must explicitly fail closed for Countertop Material Band pricing.");
expect(migration, /No Commercial Pricing/i, "Ordinary Orders must explicitly fail closed for pricing_model=none.");
expect(migration, /product_prices/i, "Price Group products must resolve through canonical product_prices pricing.");
expect(migration, /calculate_countertop_price/i, "Migration must preserve/document the canonical countertop pricing route.");
expect(migration, /attach_countertop_configuration/i, "Migration must preserve/document the canonical countertop attach route.");
expect(migration, /countertop_reservation_quantity/i, "Countertop reservation semantics must remain canonical.");
expect(migration, /unit_price/i, "Server-authoritative unit-price behavior must be explicit at the Order RPC boundary.");

expect(domain, /pricingModel/i, "Order product projection must expose pricing model semantics.");
expect(domain, /productTypeName/i, "Order product projection must expose a friendly Product Type label.");
expect(domain, /uomName/i, "Order product projection must expose a friendly UOM label.");
expect(domain, /Price Group/, "Order UI domain must provide a friendly Price Group label.");
expect(domain, /Countertop Material Band/, "Order UI domain must provide a friendly Countertop Material Band label.");
expect(domain, /No Commercial Pricing/, "Order UI domain must provide a friendly No Commercial Pricing label.");
expect(domain, /items\.unit_price/.test(domain) ? /$a/ : /.*/, "Generic order revision policy must not advertise unit price as client-editable.");

expect(picker, /Product Type/, "Order product picker must show Product Type.");
expect(picker, /UOM/, "Order product picker must show UOM.");
expect(picker, /Pricing Route/, "Order product picker must show Pricing Route.");
expect(picker, /Countertop/, "Order picker must provide a human-readable Countertop routing reason.");

console.log("Order Product Type/UOM/pricing routing contract: PASS");
