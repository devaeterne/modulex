import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const migrationPath = path.join(root, "modulex-store/supabase/migrations/20260901130000_order_product_pricing_routing.sql");
const pickerPath = path.join(root, "modulex-admin/src/components/customers/OrderProductPicker.tsx");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, "utf8");
}

function expect(text, pattern, reason) {
  if (!pattern.test(text)) throw new Error(reason);
}

const migration = read(migrationPath);
const picker = read(pickerPath);

expect(migration, /product_type_code_snapshot/i, "Order items must snapshot Product Type semantics.");
expect(migration, /uom_code_snapshot/i, "Order items must snapshot UOM semantics.");
expect(migration, /pricing_model_snapshot/i, "Order items must snapshot the pricing route.");
expect(migration, /pricing_model\s*<>\s*'price_group'/i, "All non-Price-Group routes must fail closed after explicit supported branches.");
expect(migration, /countertop_material_band/i, "Ordinary Orders must explicitly fail closed for Countertop Material Band pricing.");
expect(migration, /No Commercial Pricing/i, "Ordinary Orders must explicitly fail closed for pricing_model=none.");
expect(migration, /product_prices/i, "Price Group products must resolve through canonical product_prices pricing.");
expect(migration, /calculate_countertop_price/i, "Migration must preserve/document the canonical countertop pricing route.");
expect(migration, /attach_countertop_configuration/i, "Migration must preserve/document the canonical countertop attach route.");
expect(migration, /countertop_reservation_quantity/i, "Countertop reservation semantics must remain canonical.");
expect(migration, /Client-provided unit_price is ignored/i, "Client-provided unit price must not be authoritative.");
expect(migration, /reconcile_customer_order_totals_from_lines/i, "Order header totals must be derived from authoritative line snapshots.");
expect(migration, /modulex\.countertop_attach/i, "Only canonical Countertop attach may write Stone commercial pricing.");

expect(picker, /product_types!inner/i, "Order picker must load Product Type pricing semantics.");
expect(picker, /units_of_measure!inner/i, "Order picker must load UOM semantics.");
expect(picker, /Product Type/, "Order product picker must show Product Type.");
expect(picker, /UOM/, "Order product picker must show UOM.");
expect(picker, /Pricing Route/, "Order product picker must show Pricing Route.");
expect(picker, /Price Group/, "Order picker must use a friendly Price Group label.");
expect(picker, /Countertop Material Band/, "Order picker must use a friendly Countertop route label.");
expect(picker, /No Commercial Pricing/, "Order picker must use a friendly none-pricing label.");
expect(picker, /canonical Countertop workspace/, "Stone selection must explain the safe route.");
expect(picker, /@\/components\/ui\/button\/Button/, "Order picker must use shared Button.");
expect(picker, /@\/components\/form\/Select/, "Order picker must use shared Select.");
expect(picker, /TableViewport/, "Order picker must use shared Table/TableViewport primitives.");

console.log("Order Product Type/UOM/pricing routing contract: PASS");
