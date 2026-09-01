import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const initiationMigrationPath = "../modulex-store/supabase/migrations/20260901123501_countertop_order_item_initiation.sql";
assert(fs.existsSync(path.join(root, initiationMigrationPath)), "repo must contain the production countertop order item initiation migration");

const initiationMigration = read(initiationMigrationPath);
const pricingV2 = read("../modulex-store/supabase/migrations/20260901130000_order_product_pricing_v2.sql");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const picker = read("src/components/customers/OrderProductPicker.tsx");
const orderDomain = read("src/lib/customers/order-domain.ts");

for (const token of [
  "private.create_and_attach_countertop_order_item",
  "public.create_and_attach_countertop_order_item",
  "p_request_id uuid",
  "pg_advisory_xact_lock",
  "o.status <> 'draft'",
  "current_user_has_any_role(array['super_admin','admin','sales'])",
  "private.countertop_order_pricing_gate",
  "perform private.attach_countertop_configuration",
  "coalesce(max(oi.line_no),0)+1",
  "private.countertop_order_item_initiations",
]) assert(initiationMigration.includes(token), `secure countertop initiation contract missing: ${token}`);

assert(/security definer\s+set search_path\s*=\s*pg_catalog\s*,\s*public/i.test(initiationMigration), "private countertop initiation must pin a safe search_path");
assert(initiationMigration.includes("revoke all on function public.create_and_attach_countertop_order_item") && initiationMigration.includes("from public, anon"), "public/anon execute must be revoked from countertop initiation");
assert(initiationMigration.includes("grant execute on function public.create_and_attach_countertop_order_item") && initiationMigration.includes("to authenticated"), "authenticated browser access must go through the reviewed public wrapper");
assert(!/insert into public\.customer_order_items[\s\S]*p_unit_price/i.test(initiationMigration), "countertop initiation must not accept caller-controlled order pricing");

assert(editOrder.includes("Add Countertop"), "Edit Order must expose an Add Countertop CTA");
assert(editOrder.includes("CountertopConfigurator"), "Edit Order must use the canonical CountertopConfigurator");
assert(configurator.includes("create_and_attach_countertop_order_item"), "new countertop attachment must use the secure create+attach RPC");
assert(configurator.includes("crypto.randomUUID()") || configurator.includes("randomUUID"), "new countertop initiation must send an idempotency request id");
assert(configurator.includes("attach_countertop_configuration"), "existing Configure Countertop path must remain intact");

assert(picker.includes('product.pricing_model !== "price_group"'), "ordinary Order Product Picker must keep non-price-group products disabled");
assert(picker.includes("Use Countertop workspace"), "Stone picker guidance must remain explicit");
assert(configurator.includes('contains("metadata", { product_kind: "sink" })'), "Countertop sink dropdown must keep metadata-based sink discovery");
assert(orderDomain.includes("pricing_model") && picker.includes("priceMap"), "normal Order picker must retain canonical Product Type pricing routing");

assert(pricingV2.includes("if v_type.pricing_model='countertop_material_band'"), "Stone ordinary mutation must remain fail-closed");
assert(pricingV2.includes("new.unit_price:=round(v_price,4)"), "Price Group products must remain server-authoritative");
assert(pricingV2.includes("new.price_source:='price_group'"), "Price Group products must retain canonical price source");
assert(pricingV2.includes("new.pricing_model_snapshot:=v_type.pricing_model"), "semantic pricing-model snapshots must remain server-derived");

console.log("Order countertop initiation contract: PASS");
