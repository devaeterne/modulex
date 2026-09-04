import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const sqlPath = "sql/project-pb5-fulfillment-rollup.sql";
const componentPath = "src/components/customers/project-detail/ProjectFulfillmentTab.tsx";
const workspacePath = "src/components/customers/ProjectDetailWorkspace.tsx";
const domainPath = "src/lib/customers/project-fulfillment-domain.ts";

assert.equal(exists(sqlPath), true, "PB-5 fulfillment projection SQL must exist");
assert.equal(exists(componentPath), true, "PB-5 Project Fulfillment tab must exist");
assert.equal(exists(domainPath), true, "PB-5 fulfillment client domain must exist");

const sql = read(sqlPath);
const component = read(componentPath);
const workspace = read(workspacePath);
const domain = read(domainPath);

// Canonical truth only: Project rollup reads Orders, Shipments, Installations and Procurement.
assert.match(sql, /customer_orders/i, "PB-5 must derive from canonical Orders");
assert.match(sql, /customer_shipments/i, "PB-5 must derive from canonical Shipments");
assert.match(sql, /customer_installations/i, "PB-5 must derive from canonical Installations");
assert.match(sql, /customer_project_procurement_requirements/i, "PB-5 must project procurement blockers from canonical requirements");
assert.match(sql, /customer_project_procurement_commitments/i, "PB-5 blocker projection must use canonical commitments");
assert.match(sql, /customer_project_procurement_delivery_events/i, "PB-5 blocker projection must use canonical procurement delivery events");
assert.doesNotMatch(sql, /create\s+table/i, "PB-5 must not create a duplicate Project fulfillment ledger/table");

// Active rollup semantics.
assert.match(sql, /status\s*<>\s*'cancelled'/i, "cancelled Orders must be excluded from active fulfillment summary");
assert.match(sql, /fulfillment_type\s*=\s*'pickup'/i, "Customer Pickup must remain a distinct fulfillment mode");
assert.match(sql, /delivery_installation/i, "delivery + installation orders must derive both dimensions");
assert.match(sql, /'partial'/i, "multiple deliveries/installations must support partial state");
assert.match(sql, /blocker_states/i, "Project fulfillment rows must expose sanitized blocker states");
assert.doesNotMatch(sql, /vendor_name|vendor_code|agreed_unit_cost|expected_unit_cost|invoice_cost|internal_notes/i, "Sales-safe fulfillment projection must not expose vendor/cost/internal fields");

// DB authorization: no role broadening beyond existing fulfillment visibility.
assert.match(sql, /super_admin[^\]]*admin[^\]]*sales/i, "PB-5 read boundary must allow existing Sales/Admin operational roles");
assert.doesNotMatch(sql, /current_user_has_any_role\([^;]*finance/i, "PB-5 must not broaden Finance into Shipment/Installation visibility");
assert.match(sql, /revoke\s+all[\s\S]*from\s+public/i, "PB-5 RPC must revoke PUBLIC execution");
assert.match(sql, /grant\s+execute[\s\S]*to\s+authenticated/i, "PB-5 RPC must grant authenticated execution explicitly");

// Admin UI uses the narrow Project RPC and shared primitives.
assert.match(domain, /get_customer_project_fulfillment/i, "Project fulfillment domain must call the PB-5 narrow RPC");
assert.match(domain, /shipments\.view/i, "client boundary must preserve Shipment visibility");
assert.match(domain, /installations\.view/i, "client boundary must preserve Installation visibility");
assert.match(component, /ComponentCard/, "Fulfillment tab must use shared ComponentCard");
assert.match(component, /TableViewport/, "Fulfillment rows must use shared Admin table primitives");
assert.match(component, /Orders Ready/i, "Fulfillment summary must show Orders Ready");
assert.match(component, /Delivery status/i, "Fulfillment summary must show delivery status");
assert.match(component, /Installation status/i, "Fulfillment summary must show installation status");
assert.match(component, /Procurement blockers/i, "Fulfillment summary must show procurement blockers");
assert.match(component, /Customer Pickup/i, "Fulfillment UI must distinguish Customer Pickup");
assert.match(component, /Cancelled history/i, "Fulfillment UI must preserve cancelled Order history without counting it active");
assert.match(workspace, /ProjectFulfillmentTab/, "Project Detail Fulfillment tab must use the real PB-5 component");
assert.doesNotMatch(workspace, /Detailed procurement blockers and fulfillment rollups will be added in PB-5/i, "PB-5 placeholder must be removed");

console.log("Project PB-5 fulfillment contract PASS");
