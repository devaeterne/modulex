import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const domain = fs.readFileSync(path.join(root, "src/lib/customers/order-domain.ts"), "utf8");
const editOrder = fs.readFileSync(path.join(root, "src/components/customers/EditCustomerOrder.tsx"), "utf8");
const editActions = fs.readFileSync(path.join(root, "src/components/customers/CustomerOrderEditActions.tsx"), "utf8");
const sqlPath = path.join(root, "sql/customer-order-lifecycle-editability.sql");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(
  /export\s+function\s+getCustomerOrderRevisionPolicy\b/.test(domain),
  "A1.2C must expose a typed customer-order revision policy"
);

for (const status of ["draft", "confirmed", "in_preparation", "ready_for_shipment"]) {
  assert(domain.includes(`\"${status}\"`), `revision policy must account for editable status ${status}`);
}
for (const status of ["shipped", "delivered", "installation_scheduled", "installation_in_progress", "completed", "cancelled"]) {
  assert(domain.includes(`\"${status}\"`), `revision policy must account for locked status ${status}`);
}

assert(domain.includes('mode: "approval"'), "Sales non-Draft editable orders must have an approval revision mode");
assert(domain.includes('mode: "locked"'), "Fulfillment-started/finalized orders must have a locked revision mode");
assert(domain.includes("immutableFields"), "revision policy must explicitly publish immutable fields");
assert(domain.includes("editableFields"), "revision policy must explicitly publish editable fields");

for (const field of [
  "items.product_id",
  "items.quantity",
  "items.unit_price",
  "items.discount_percent",
  "price_group_id",
  "fulfillment_type",
  "payment_method_id",
  "payment_commission_percent",
  "billing_address_id",
  "shipping_address_id",
  "expected_delivery_date",
  "customer_reference",
  "customer_notes",
  "internal_notes",
  "tax_rate",
  "discount_amount",
  "revision_reason",
]) {
  assert(domain.includes(`\"${field}\"`), `editable field contract must include ${field}`);
}

for (const field of [
  "id",
  "order_number",
  "customer_id",
  "status",
  "order_date",
  "currency_code",
  "price_group_name_snapshot",
  "payment_method_name_snapshot",
  "payment_commission_default_percent",
  "payment_commission_amount",
  "billing_address_snapshot",
  "shipping_address_snapshot",
  "item_count",
  "subtotal",
  "tax_amount",
  "total_amount",
  "grand_total",
  "items.id",
  "items.order_id",
  "items.line_no",
  "items.sku_snapshot",
  "items.product_name_snapshot",
  "items.discount_amount",
  "items.line_subtotal",
  "items.line_total",
  "items.price_source",
]) {
  assert(domain.includes(`\"${field}\"`), `immutable field contract must include ${field}`);
}

assert(editOrder.includes("getCustomerOrderRevisionPolicy"), "EditCustomerOrder must consume the shared lifecycle policy");
assert(editOrder.includes("revisionPolicy.canEdit"), "EditCustomerOrder must block revision submission when policy is locked");
assert(editActions.includes("loadCustomerOrderRevisionPolicy"), "detail edit action must resolve revision policy before rendering Edit Order");

assert(fs.existsSync(sqlPath), "A1.2C must define sql/customer-order-lifecycle-editability.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
assert(sql.includes("customer_order_revision_mode"), "DB contract must centralize order revision mode");
assert(sql.includes("v_revision_mode = 'locked'"), "DB update wrapper must reject locked lifecycle revisions");
assert(sql.includes("v_revision_mode = 'approval'"), "DB update wrapper must preserve Sales approval behavior before fulfillment starts");
assert(sql.includes("p_role is null or p_role not in"), "DB revision mode must lock profiles-less/null roles explicitly");
assert(sql.includes("v_role is null or v_role not in"), "DB update wrapper must deny profiles-less/null roles explicitly");
for (const status of ["shipped", "delivered", "installation_scheduled", "installation_in_progress", "completed", "cancelled"]) {
  assert(sql.includes(`'${status}'`), `DB lock contract must include ${status}`);
}

assert(pkg.scripts?.["smoke:order-lifecycle"] === "node scripts/order-lifecycle-editability-contract.mjs", "package.json must expose smoke:order-lifecycle");
assert(pkg.scripts?.smoke?.includes("smoke:order-lifecycle"), "main Admin smoke chain must include smoke:order-lifecycle");

console.log("PASS: order lifecycle editability contract");
