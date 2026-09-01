import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};

const migrationPath = path.join(root, "../modulex-store/supabase/migrations/20260901090000_order_product_pricing_v2.sql");
if (!fs.existsSync(migrationPath)) throw new Error("RED expected: additive order Product Type pricing migration is missing");
const sql = fs.readFileSync(migrationPath, "utf8");
for (const needle of [
  "resolve_customer_order_product_price",
  "pricing_model = 'price_group'",
  "countertop_material_band",
  "Countertop configurator",
  "pricing_model = 'none'",
  "get_product_price_for_group",
  "countertop_reservation_quantity",
  "price_source",
  "revoke all",
  "grant execute",
]) requireText(sql, needle, "order pricing migration");

const domain = read("src/lib/customers/order-domain.ts");
for (const needle of ["product_type_id", "product_type_name", "pricing_model", "uom_code", "pricing_route_reason", "loadOrderPriceQuotes"])
  requireText(domain, needle, "order domain");
if (/unitPrice:\s*item\.unitPrice/.test(domain)) throw new Error("order domain: caller unit price is still forwarded by generic order update");

const picker = read("src/components/customers/OrderProductPicker.tsx");
for (const needle of ["Product Type", "UOM", "Countertop", "pricing_route_reason"])
  requireText(picker, needle, "order product picker");

const detail = read("src/components/customers/CustomerOrderDetail.tsx");
for (const needle of ["Product Type", "UOM", "Countertop"])
  requireText(detail, needle, "order detail");

const list = read("src/components/customers/CustomerOrdersList.tsx");
requireText(list, "Pricing route", "order list");

const inventory = read("sql/customer-order-stock-reservations.sql");
requireText(inventory, "countertop_reservation_quantity", "inventory reservation regression");
requireText(inventory, "inventory_movements", "inventory movement regression");
const countertop = read("sql/countertop-stone-sink-domain.sql");
requireText(countertop, "calculate_countertop_price", "countertop pricing regression");
requireText(countertop, "attach_countertop_configuration", "countertop attach regression");

console.log("Order Product Type pricing v2 contract: PASS");
