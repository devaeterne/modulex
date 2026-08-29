import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const domain = fs.readFileSync(path.join(root, "src/lib/customers/order-domain.ts"), "utf8");
const editOrder = fs.readFileSync(path.join(root, "src/components/customers/EditCustomerOrder.tsx"), "utf8");
const editActions = fs.readFileSync(path.join(root, "src/components/customers/CustomerOrderEditActions.tsx"), "utf8");
const sqlPath = path.join(root, "sql/customer-order-lifecycle-editability.sql");

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

assert(editOrder.includes("getCustomerOrderRevisionPolicy"), "EditCustomerOrder must consume the shared lifecycle policy");
assert(editOrder.includes("revisionPolicy.canEdit"), "EditCustomerOrder must block revision submission when policy is locked");
assert(editActions.includes("loadCustomerOrderRevisionPolicy"), "detail edit action must resolve revision policy before rendering Edit Order");

assert(fs.existsSync(sqlPath), "A1.2C must define sql/customer-order-lifecycle-editability.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
assert(sql.includes("customer_order_revision_mode"), "DB contract must centralize order revision mode");
assert(sql.includes("v_revision_mode = 'locked'"), "DB update wrapper must reject locked lifecycle revisions");
assert(sql.includes("v_revision_mode = 'approval'"), "DB update wrapper must preserve Sales approval behavior before fulfillment starts");
for (const status of ["shipped", "delivered", "installation_scheduled", "installation_in_progress", "completed", "cancelled"]) {
  assert(sql.includes(`'${status}'`), `DB lock contract must include ${status}`);
}

console.log("PASS: order lifecycle editability contract");
