import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migrationPath = "../modulex-store/supabase/migrations/20260901140000_countertop_order_item_initiation.sql";
assert(fs.existsSync(path.join(root, migrationPath)), "Countertop order-item initiation migration must exist");

const migration = read(migrationPath);
const pricingV2 = read("../modulex-store/supabase/migrations/20260901130000_order_product_pricing_v2.sql");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const picker = read("src/components/customers/OrderProductPicker.tsx");

// Secure create + attach boundary.
assert(/create or replace function private\.create_and_attach_countertop_order_item\(/i.test(migration), "private create+attach core is missing");
assert(/create or replace function public\.create_and_attach_countertop_order_item\(/i.test(migration), "public create+attach wrapper is missing");
assert(/function public\.create_and_attach_countertop_order_item\([\s\S]*?language sql security invoker/i.test(migration), "public create+attach wrapper must be SECURITY INVOKER");
assert(!/function public\.create_and_attach_countertop_order_item\([\s\S]*?security definer/i.test(migration), "public create+attach RPC must never be SECURITY DEFINER");
assert(/function private\.create_and_attach_countertop_order_item\([\s\S]*?security definer[\s\S]*?set search_path\s*=\s*pg_catalog\s*,\s*public/i.test(migration), "private create+attach core must pin search_path");
assert(migration.includes("current_user_has_any_role") && migration.includes("'super_admin','admin','sales'"), "create+attach must enforce the canonical order editor roles server-side");
assert(/o\.status\s*=\s*'draft'/i.test(migration) || /status\s*<>\s*'draft'/i.test(migration), "create+attach must reject non-draft orders");
assert(/for update/i.test(migration), "create+attach must lock the draft order before allocating line_no");
assert(/max\(.*line_no.*\).*\+\s*1/is.test(migration), "next line_no must be allocated server-side");
assert(migration.includes("private.countertop_order_pricing_gate"), "Stone item creation must use the private transaction pricing gate");
assert(/insert into private\.countertop_order_pricing_gate[\s\S]*insert into public\.customer_order_items/i.test(migration), "Stone gate must be opened before the controlled order-item insert");
assert(/private\.attach_countertop_configuration\(/i.test(migration), "new initiation must reuse the canonical private countertop attach core");
assert(/revoke all on function public\.create_and_attach_countertop_order_item[^;]*from public, anon/i.test(migration), "public/anon execute must be revoked");
assert(/grant execute on function public\.create_and_attach_countertop_order_item[^;]*to authenticated/i.test(migration), "only authenticated callers may reach the wrapper before server-side role checks");

// Existing Pricing V2 fail-closed boundary remains authoritative.
assert(pricingV2.includes("Countertop Material Band products must be configured in the Countertop workspace."), "Stone ordinary mutation fail-closed guard must remain intact");
assert(pricingV2.includes("new.unit_price:=round(v_price,4)"), "Price Group unit price must remain server-authoritative");
assert(!/unit_price\s+numeric/i.test(migration), "create+attach RPC must not accept a caller-controlled arbitrary unit_price");

// Edit Order create mode plus existing configure mode.
assert(editOrder.includes("Add Countertop"), "Edit Order must expose an Add Countertop CTA");
assert(editOrder.includes("CountertopConfigurator"), "Edit Order must open the canonical CountertopConfigurator");
assert(/orderId=\{order\.id\}/.test(editOrder), "Edit Order must pass canonical order id to CountertopConfigurator create mode");
assert(configurator.includes("orderId?: string"), "CountertopConfigurator must support canonical draft-order create mode");
assert(configurator.includes("create_and_attach_countertop_order_item"), "CountertopConfigurator create mode must call the secure create+attach RPC");
assert(configurator.includes("attach_countertop_configuration"), "existing configured-line attach RPC must remain available");
assert(configurator.includes("orderItemId") && configurator.includes("p_order_item_id: orderItemId"), "existing Configure Countertop flow must retain item identity");

// Product Picker and Sink behavior.
assert(picker.includes('product.pricing_model !== "price_group"'), "Stone/none products must remain disabled in ordinary Product Picker Add");
assert(picker.includes("Use Countertop workspace"), "Stone Product Picker guidance must remain visible");
assert(configurator.includes('.contains("metadata", { product_kind: "sink" })'), "Countertop Sink dropdown must continue using canonical sink metadata");
assert(picker.includes("priceMap.has(product.id)"), "Price Group products must resolve picker availability from authoritative price data");

console.log("PASS: order countertop initiation contract");
