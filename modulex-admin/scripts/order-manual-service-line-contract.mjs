import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const resolve = (file) => path.join(root, file);
const read = (file) => fs.readFileSync(resolve(file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertExists = (file, message) => assert(fs.existsSync(resolve(file)), message);

const prerequisitePath = "../modulex-store/supabase/migrations/20260901235959_manual_service_category_prerequisite.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260902000000_order_manual_service_line.sql";
const modalPath = "src/components/customers/ManualServiceLineModal.tsx";
const detailsPath = "src/components/customers/ServiceLineDetails.tsx";

assertExists(prerequisitePath, "repo must contain the Service category prerequisite migration before the manual Service migration");
assertExists(migrationPath, "repo must contain the manual Service order-line migration");
const prerequisite = read(prerequisitePath);
const migration = read(migrationPath);

for (const token of [
  "manual_service",
  "customer_order_items",
  "customer_invoice_items",
  "line_note",
  "PIECE",
  "SERVICE",
  "notify pgrst, 'reload schema'",
]) assert(migration.includes(token), `manual Service migration contract missing: ${token}`);

assert(/insert\s+into\s+public\.product_categories\s*\([^)]*name[^)]*status[^)]*\)[\s\S]*values\s*\(\s*'Service'\s*,\s*'active'\s*\)[\s\S]*on\s+conflict\s*\(\s*name\s*\)\s+do\s+nothing/i.test(prerequisite), "Service prerequisite must create a missing active Service category by stable name without rewriting an existing category");
assert(/from\s+public\.product_categories[\s\S]*where\s+c\.name\s*=\s*'Service'/i.test(prerequisite), "Service prerequisite must resolve the Service category by stable name after bootstrap");
assert(/v_service_category\.status::text\s*<>\s*'active'/i.test(prerequisite), "Service prerequisite must fail closed when an existing Service category is not active");
assert(!/on\s+conflict\s*\(\s*name\s*\)\s+do\s+update[\s\S]{0,240}status/i.test(prerequisite), "Service prerequisite must not silently reactivate or redefine an existing Service category");
assert(!/insert\s+into\s+public\.product_categories/i.test(migration), "manual Service migration must consume the already-validated Service category prerequisite rather than redefine taxonomy");

assert(/pricing_model[\s\S]*manual_service/i.test(migration), "Product Type pricing-model domain must include manual_service");
assert(/units_of_measure[\s\S]*code\s*=\s*'PIECE'/i.test(migration), "Service migration must resolve the existing PIECE UOM by stable code");
assert(/units_of_measure[\s\S]*is_active\s*=\s*true/i.test(migration), "Service migration must require an active PIECE UOM");
assert(!/default_uom_id\s*=\s*'[0-9a-f]{8}-[0-9a-f-]{27,}'/i.test(migration), "Service migration must not hardcode a generated UOM UUID");
assert(/product_types[\s\S]*'SERVICE'[\s\S]*'manual_service'/i.test(migration), "Service Product Type must be seeded by stable SERVICE code");
assert(/products[\s\S]*'SERVICE'[\s\S]*'Service'/i.test(migration), "canonical Service product must be seeded by stable SERVICE SKU/name");
assert(!/insert\s+into\s+public\.product_prices/i.test(migration), "canonical Service product must not receive a Product Group price");

for (const token of [
  "private.enforce_customer_order_item_pricing_v2",
  "private.create_customer_order_core",
  "private.update_customer_order",
  "private.reserve_order_item_trigger",
  "private.release_order_item_reservation_trigger",
  "private.create_customer_invoice_from_order",
]) assert(migration.includes(token), `manual Service server route missing canonical function: ${token}`);

assert(/pricing_model[^\n]*manual_service|manual_service[^\n]*pricing_model/i.test(migration), "order-item pricing must branch explicitly on manual_service");
assert(/btrim\s*\(\s*coalesce\s*\(\s*new\.line_note/i.test(migration), "manual Service pricing must reject blank line_note server-side");
assert(/new\.quantity\s*(?:<>|!=)\s*1/i.test(migration), "manual Service quantity must be exactly 1 server-side");
assert(/new\.unit_price\s+is\s+null/i.test(migration) && /new\.unit_price\s*<\s*0/i.test(migration), "manual Service price must be explicit and nonnegative server-side");
assert(/new\.price_source\s*:?=\s*'manual'/i.test(migration), "manual Service price source must be forced to manual");
assert(/pricing_model_snapshot\s*=\s*'manual_service'|pricing_model_snapshot\s*<>\s*'manual_service'/i.test(migration), "inventory functions must identify manual_service from the saved pricing snapshot");
assert(/customer_invoice_items[\s\S]*line_note/i.test(migration) && /customer_order_items[\s\S]*line_note/i.test(migration), "invoice creation must copy the historical Service line_note from order to invoice");
assert(/item\s*->>\s*'line_note'/i.test(migration), "canonical order JSON parsing must preserve Service line_note");
assert(/Manual unit price is only accepted for the canonical SERVICE manual_service product\./i.test(migration), "create/update RPCs must explicitly reject caller-supplied manual prices outside canonical SERVICE manual_service lines");

assertExists(modalPath, "manual Service entry must use one shared modal component");
assertExists(detailsPath, "manual Service detail must use one shared historical line-detail component");

const modal = read(modalPath);
const serviceDetails = read(detailsPath);
const newOrder = read("src/components/customers/NewCustomerOrder.tsx");
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const picker = read("src/components/customers/OrderProductPicker.tsx");
const orderDetail = read("src/components/customers/CustomerOrderDetail.tsx");
const orderPrint = read("src/components/customers/CustomerOrderPrint.tsx");
const invoiceDetail = read("src/components/customers/CustomerInvoiceDetail.tsx");
const invoicePrint = read("src/components/customers/CustomerInvoicePrint.tsx");
const orderDomain = read("src/lib/customers/order-domain.ts");
const types = read("src/lib/customers/types.ts");

for (const source of [newOrder, editOrder]) {
  assert(source.includes("PlusIcon"), "New/Edit Order actions must use the shared PlusIcon SVG");
  for (const label of ["Countertop", "Cabinet", "Service"]) {
    assert(source.includes(label), `New/Edit Order Products actions missing visible label: ${label}`);
  }
  assert(!source.includes("Add Countertop"), "Products actions must omit the word Add from Countertop");
  assert(!source.includes("Add Products"), "Products actions must replace Add Products with Cabinet");
  assert(!/["'`]\+\s*(Countertop|Cabinet|Service)/.test(source), "Products actions must not use a literal + glyph");
  assert(source.includes("ManualServiceLineModal"), "New/Edit Order must reuse the shared Service modal");
  assert(source.includes("ServiceLineDetails"), "New/Edit Order must render the saved Service line note");
}

assert(picker.includes("excludedProductTypeCodes"), "Cabinet picker must expose an explicit Product Type exclusion contract");
for (const code of ["STONE", "SINK", "SERVICE"]) {
  assert(newOrder.includes(`\"${code}\"`) || newOrder.includes(`'${code}'`), `New Order Cabinet picker must exclude ${code}`);
  assert(editOrder.includes(`\"${code}\"`) || editOrder.includes(`'${code}'`), `Edit Order Cabinet picker must exclude ${code}`);
}

for (const token of ["Modal", "Label", "TextArea", "Input", "Button", "lineNote", "unitPrice"]) {
  assert(modal.includes(token), `ManualServiceLineModal missing shared primitive/field contract: ${token}`);
}
assert(modal.includes("trim()"), "ManualServiceLineModal must reject whitespace-only Service detail");
assert(/unitPrice[\s\S]*(?:Number\.isFinite|isFinite)/.test(modal), "ManualServiceLineModal must reject non-finite Service prices");
assert(/unitPrice[\s\S]*<\s*0/.test(modal), "ManualServiceLineModal must reject negative Service prices");
assert(!/quantity/i.test(modal), "ManualServiceLineModal must not expose Service quantity");
assert(serviceDetails.includes("lineNote"), "ServiceLineDetails must render the saved historical lineNote");

assert(orderDomain.includes("manual_service"), "client order domain must represent manual_service explicitly");
assert(orderDomain.includes("line_note"), "client order serialization/hydration must preserve line_note");
assert(types.includes("line_note"), "order/invoice item types must expose historical line_note");

for (const [name, source] of [
  ["Order Detail", orderDetail],
  ["Order Print", orderPrint],
  ["Invoice Detail", invoiceDetail],
  ["Invoice Print", invoicePrint],
]) {
  assert(source.includes("line_note") || source.includes("ServiceLineDetails"), `${name} must render the saved Service line note snapshot`);
}

console.log("Order manual Service line contract: PASS");
