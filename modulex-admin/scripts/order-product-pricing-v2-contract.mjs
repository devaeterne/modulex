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
assert(migration.includes("countertop_order_pricing_gate") && migration.includes("return new"), "configured countertop pricing must retain the canonical configurator boundary");
assert(migration.includes("sku_snapshot") && migration.includes("product_name_snapshot"), "order item SKU/name snapshots must be preserved");
assert(migration.includes("line_total") && migration.includes("subtotal") && migration.includes("grand_total"), "order totals must remain server-authoritative");

for (const field of ["product_type_name", "pricing_model", "uom_code", "uom_name"]) {
  assert(domain.includes(field), `order product context must include ${field}`);
}
for (const label of ["Price Group", "Countertop Material Band", "No Commercial Pricing"]) {
  assert(domain.includes(label), `friendly pricing label missing: ${label}`);
}
assert(migration.includes("new.unit_price:=round(v_price,4)"), "DB trigger must overwrite caller-controlled Price Group unit prices");
assert(picker.includes("pricingModelLabel") && picker.includes("uom_name"), "product picker must show pricing route and UOM");
assert(createOrder.includes("countertop_material_band") && createOrder.includes("startCountertop") && createOrder.includes('"Countertop"'), "create UI must guide Stone into the Countertop action rather than ordinary product pricing");
assert(createOrder.includes('hasPermission(role, "orders.manage")'), "New Order Countertop action must be permission-aware");
assert(createOrder.includes('createOrder(validItems, "draft")') && createOrder.includes("<CountertopConfigurator"), "New Order Countertop action must save a Draft shell before opening the canonical configurator");
assert(!createOrder.includes('href="/pricing/countertop"'), "New Order must not route Countertop initiation through the Pricing workspace");
assert(editOrder.includes("pricing_model") && detail.includes("pricingModelLabel"), "edit/detail UI must expose pricing route metadata");

// UI boundary: Price Group money is server-authoritative; configured Stone preserves its stored canonical price.
assert(editOrder.includes("Server Price"), "Edit Order must label canonical Price Group money as Server Price");
assert(!/<input[^>]+value=\{item\.unit_price\}[^>]+onChange=/s.test(editOrder), "Edit Order must not expose an editable unit_price input");
assert(!editOrder.includes("useGroupPrice("), "Edit Order must not expose a manual Group Price copy action");
assert(editOrder.includes("resolveOrderLineUnitPrice"), "Edit Order must resolve line money through one pricing-model-aware helper");
assert(/model\s*===\s*"price_group"[\s\S]{0,180}priceMap\.get\(item\.product_id\)/.test(editOrder), "Price Group edit lines must resolve canonical priceMap money");
assert(/model\s*===\s*"countertop_material_band"[\s\S]{0,300}item\.unit_price/.test(editOrder), "Existing Stone edit lines must preserve configured stored money");
assert(/unitPrice:\s*String\([\s\S]{0,140}resolveOrderLineUnitPrice/.test(editOrder), "Edit Order submit payload must use pricing-model-aware canonical money");
assert(/price\s*=\s*Math\.max\(0,\s*resolveOrderLineUnitPrice/.test(editOrder), "Edit Order preview totals must use pricing-model-aware canonical money");

// Hardening: semantic identity is immutable unless product identity actually changes.
for (const snapshot of ["product_type_code_snapshot", "product_type_name_snapshot", "uom_code_snapshot", "uom_name_snapshot", "pricing_model_snapshot"]) {
  assert(migration.includes(snapshot), `immutable semantic snapshot missing: ${snapshot}`);
}
assert(/tg_op\s*=\s*'INSERT'\s+or\s+new\.product_id\s+is\s+distinct\s+from\s+old\.product_id/i.test(migration), "live Product Type/UOM metadata must only snapshot on INSERT or product identity change");
assert(/new\.product_type_code_snapshot\s*:=\s*old\.product_type_code_snapshot/i.test(migration), "same-product updates must reject semantic snapshot tampering");
assert(/update public\.customer_order_items[\s\S]*coalesce\(oi\.product_type_code_snapshot/i.test(migration), "backfill must fill only missing semantic snapshots");

// Hardening: a configured row is not authorization; only the canonical private attach function may open the gate.
assert(migration.includes("countertop_order_pricing_gate"), "canonical Countertop transaction gate is missing");
assert(/create or replace function private\.attach_countertop_configuration\(/i.test(migration), "canonical private Countertop attach must own the gate");
assert(/insert into private\.countertop_order_pricing_gate/i.test(migration) && /delete from private\.countertop_order_pricing_gate/i.test(migration), "canonical attach must open and close its transaction gate");
assert(/exists\s*\(select 1 from private\.countertop_order_pricing_gate/i.test(migration), "Stone pricing trigger must verify the canonical gate");
assert(!/exists\s*\(select 1 from public\.countertop_configurations where order_item_id/i.test(migration), "configured history alone must not authorize Stone commercial mutation");
assert(!/create\s+(?:or replace\s+)?function\s+private\.countertop_order_pricing_gate/i.test(migration), "Countertop gate must not create a browser-callable private API");
assert(/revoke all on table private\.countertop_order_pricing_gate from public, anon, authenticated/i.test(migration), "Countertop gate table must deny browser roles");

// Hardening: stored line totals drive the header projection after every line mutation.
assert(/create constraint trigger[\s\S]*after insert or update or delete[\s\S]*deferrable initially deferred/i.test(migration), "item INSERT/UPDATE/DELETE must defer parent total reconciliation to transaction end");
assert(migration.includes("old.order_id") && migration.includes("new.order_id") && /is distinct from/i.test(migration), "line moves must reconcile both OLD and NEW parent orders");
assert(/sum\(i\.line_total\)/i.test(migration), "stored line_total must be the authoritative subtotal source");
assert(!/create trigger trg_customer_orders_totals_v2/i.test(migration), "header-only total reconciliation trigger must be removed");

console.log("PASS: order product pricing v2 contract");
