import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const migrationPath = "../modulex-store/supabase/migrations/20260901140000_countertop_order_item_initiation.sql";
assert(fs.existsSync(path.join(root, migrationPath)), "Countertop order-item initiation migration must exist");
const migration = read(migrationPath);
const pricingV2 = read("../modulex-store/supabase/migrations/20260901130000_order_product_pricing_v2.sql");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const addCountertop = read("src/components/customers/AddCountertopToOrder.tsx");
const editPage = read("src/app/(admin)/customers/[id]/orders/[orderId]/edit/page.tsx");
const picker = read("src/components/customers/OrderProductPicker.tsx");

assert(/create or replace function private\.create_and_attach_countertop_order_item\(/i.test(migration), "private create+attach core is missing");
assert(/create or replace function public\.create_and_attach_countertop_order_item\(/i.test(migration), "public create+attach wrapper is missing");
assert(/function public\.create_and_attach_countertop_order_item\([\s\S]*?language sql[\s\S]*?security invoker/i.test(migration), "public create+attach wrapper must be SECURITY INVOKER");
assert(!/function public\.create_and_attach_countertop_order_item\([\s\S]*?security definer/i.test(migration), "public create+attach RPC must never be SECURITY DEFINER");
assert(/function private\.create_and_attach_countertop_order_item\([\s\S]*?security definer[\s\S]*?set search_path\s*=\s*pg_catalog\s*,\s*public/i.test(migration), "private create+attach core must pin search_path");
assert(migration.includes("current_user_has_any_role") && migration.includes("'super_admin','admin','sales'"), "create+attach must enforce canonical order editor roles");
assert(/status\s*<>\s*'draft'/i.test(migration), "create+attach must reject non-draft orders");
assert(/for update/i.test(migration), "create+attach must lock the order before allocating line_no");
assert(/max\(oi\.line_no\)[\s\S]*\+ 1/i.test(migration), "next line_no must be server allocated");
assert(migration.includes("private.countertop_order_pricing_gate"), "Stone creation must use the private transaction pricing gate");
assert(/insert into private\.countertop_order_pricing_gate[\s\S]*insert into public\.customer_order_items/i.test(migration), "gate must open before controlled Stone insert");
assert(/perform private\.attach_countertop_configuration\(/i.test(migration), "new initiation must reuse canonical private attach");
assert(migration.includes("countertop_order_item_initiations") && migration.includes("pg_advisory_xact_lock"), "create+attach must be retry-idempotent");
assert(/revoke all on function public\.create_and_attach_countertop_order_item[^;]*from public, anon/i.test(migration), "public/anon execute must be revoked");
assert(/grant execute on function public\.create_and_attach_countertop_order_item[^;]*to authenticated/i.test(migration), "wrapper must be authenticated-only before role checks");

assert(pricingV2.includes("Countertop Material Band products must be configured in the Countertop workspace."), "Stone ordinary mutation fail-closed guard must remain intact");
assert(pricingV2.includes("new.unit_price:=round(v_price,4)"), "Price Group price must remain server authoritative");
assert(!/p_unit_price/i.test(migration), "create+attach must not accept caller-controlled arbitrary price");

assert(editPage.includes("AddCountertopToOrder"), "Edit Order route must expose Countertop initiation");
assert(addCountertop.includes("Add Countertop") && addCountertop.includes("CountertopConfigurator"), "Edit Order must expose Add Countertop CTA using canonical configurator");
assert(addCountertop.includes("orderId={params.orderId}"), "CTA must pass canonical route order id");
assert(addCountertop.includes("window.location.reload()"), "successful create+attach must reload canonical editor state");
assert(configurator.includes("orderId?: string"), "CountertopConfigurator must support draft-order create mode");
assert(configurator.includes("create_and_attach_countertop_order_item"), "create mode must call secure create+attach RPC");
assert(configurator.includes("attach_countertop_configuration"), "existing configured-line attach RPC must remain available");
assert(configurator.includes("p_order_item_id: orderItemId"), "existing Configure Countertop identity path must remain intact");

assert(picker.includes('product.pricing_model !== "price_group"'), "Stone/none products must remain disabled in ordinary Product Picker Add");
assert(picker.includes("Use Countertop workspace"), "Stone picker guidance must remain visible");
assert(configurator.includes('.contains("metadata", { product_kind: "sink" })'), "Countertop Sink dropdown must keep canonical metadata lookup");
assert(picker.includes("priceMap.has(product.id)"), "Price Group picker availability must use authoritative price data");

console.log("PASS: order countertop initiation contract");
