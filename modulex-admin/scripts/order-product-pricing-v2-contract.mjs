import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};

const migration = read("../modulex-store/supabase/migrations/20260901090000_order_product_pricing_v2.sql");
for (const needle of [
  "resolve_customer_order_product_price",
  "v_model = 'countertop_material_band'",
  "Countertop configurator",
  "v_model = 'none'",
  "public.product_prices",
  "create_customer_order_v2",
  "update_customer_order_v2",
  "get_customer_order_product_quotes",
  "revoke all",
  "grant execute",
]) requireText(migration, needle, "order pricing migration");

const snapshots = read("../modulex-store/supabase/migrations/20260901090100_order_product_pricing_snapshots.sql");
for (const needle of ["product_type_name_snapshot", "uom_code_snapshot", "pricing_model_snapshot", "update of product_id"])
  requireText(snapshots, needle, "order route snapshots");

const quotes = read("../modulex-store/supabase/migrations/20260901090200_order_product_pricing_quotes_all.sql");
requireText(quotes, "p_product_ids is null", "order quote directory");

const domain = read("src/lib/customers/order-domain.ts");
for (const needle of ["product_type_id", "product_type_name", "pricing_model", "uom_code", "pricing_route_reason", "loadOrderPriceQuotes", "create_customer_order_v2", "update_customer_order_v2"])
  requireText(domain, needle, "order domain");
if (/unit_price:\s*numeric\(item\.unitPrice\)/.test(domain)) throw new Error("order domain: caller unit price is still forwarded by generic order update");

const picker = read("src/components/customers/OrderProductPicker.tsx");
for (const needle of ["Product Type", "UOM", "Pricing route", "Countertop", "pricing_route_reason"])
  requireText(picker, needle, "order product picker");

const inventory = read("sql/customer-order-stock-reservations.sql");
requireText(inventory, "countertop_reservation_quantity", "inventory reservation regression");
requireText(inventory, "inventory_movements", "inventory movement regression");
const countertop = read("sql/countertop-stone-sink-domain.sql");
requireText(countertop, "calculate_countertop_price", "countertop pricing regression");
requireText(countertop, "attach_countertop_configuration", "countertop attach regression");
const pricing = read("sql/a3-3-pricing-hardening.sql");
requireText(pricing, "product_prices_current_unique_idx", "Price Group regression");

console.log("Order Product Type pricing v2 contract: PASS");
