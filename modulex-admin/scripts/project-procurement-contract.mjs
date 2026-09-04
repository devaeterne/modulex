import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const coreMigration = "modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql";
const syncMigration = "modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql";
const operationsMigration = "modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql";
const executeHardeningMigration = "modulex-store/supabase/migrations/20260904114000_customer_project_procurement_rpc_execute_hardening.sql";
const adapter = "modulex-admin/src/lib/customers/project-procurement.ts";
const component = "modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx";
const workspacePath = "modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx";
const permissions = "modulex-admin/src/lib/auth/permissions.ts";

assert.equal(exists(coreMigration), true, "PB-3B core migration must exist");
const core = read(coreMigration);
for (const token of [
  "customer_project_procurement_requirements",
  "customer_project_procurement_commitments",
  "customer_project_procurement_delivery_events",
  "vendor_invoices",
  "customer_project_procurement_invoice_allocations",
  "customer_project_procurement_events",
  "get_customer_order_procurement_components",
  "resolve_customer_project_procurement_vendor",
  "get_customer_project_procurement_cost",
  "sync_customer_order_procurement",
  "countertop_stone",
  "countertop_sink",
]) assert.match(core, new RegExp(token));
assert.match(core, /slab_quantity/);
assert.match(core, /source_kind/);
assert.match(core, /is_current/);

assert.equal(exists(syncMigration), true, "PB-3B order-sync migration must exist");
const sync = read(syncMigration);
assert.match(sync, /customer_orders/);
assert.match(sync, /project_id/);
assert.match(sync, /confirmed/);
assert.match(sync, /cancelled/);
assert.match(sync, /customer_activity/);
assert.match(sync, /order_revised/);
assert.match(sync, /sync_customer_order_procurement/);
assert.doesNotMatch(sync, /insert\s+into\s+public\.inventory_movements/i);

assert.equal(exists(operationsMigration), true, "PB-3B operations migration must exist");
const ops = read(operationsMigration);
for (const token of [
  "get_customer_project_procurement",
  "get_customer_project_procurement_status",
  "set_customer_project_procurement_vendor",
  "create_customer_project_procurement_commitment",
  "confirm_customer_project_procurement_commitment",
  "cancel_customer_project_procurement_commitment",
  "record_customer_project_procurement_delivery",
  "correct_customer_project_procurement_delivery",
  "record_customer_project_procurement_invoice",
  "reverse_customer_project_procurement_invoice_allocation",
  "42501",
  "security definer",
  "revoke",
  "authenticated",
]) assert.match(ops.toLowerCase(), new RegExp(token.toLowerCase()));
assert.doesNotMatch(ops, /insert\s+into\s+public\.inventory_movements/i);

assert.equal(
  exists(executeHardeningMigration),
  true,
  "PB-3B authenticated private RPC execute hardening migration must exist",
);
const executeHardening = read(executeHardeningMigration);
for (const signature of [
  "private.get_customer_project_procurement(uuid)",
  "private.get_customer_project_procurement_status(uuid)",
  "private.set_customer_project_procurement_vendor(uuid,text,text)",
  "private.create_customer_project_procurement_commitment(uuid,numeric,numeric,text,text)",
  "private.confirm_customer_project_procurement_commitment(uuid)",
  "private.cancel_customer_project_procurement_commitment(uuid,text)",
  "private.record_customer_project_procurement_delivery(uuid,numeric,date,text)",
  "private.correct_customer_project_procurement_delivery(uuid,numeric,text)",
  "private.record_customer_project_procurement_invoice(uuid,text,date,numeric,text,numeric,numeric)",
  "private.reverse_customer_project_procurement_invoice_allocation(uuid,text)",
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    executeHardening,
    new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escaped}\\s+to\\s+authenticated`, "i"),
    `${signature} must be callable by the authenticated public wrapper`,
  );
}
assert.doesNotMatch(
  executeHardening,
  /grant\s+execute\s+on\s+function\s+private\.[\s\S]*?\s+to\s+anon\b/i,
  "PB-3B private RPC cores must not be executable by anon",
);

assert.equal(exists(adapter), true, "Project Procurement adapter must exist");
const adapterSource = read(adapter);
for (const token of [
  "loadProjectProcurement",
  "loadProjectProcurementStatus",
  "resolveProjectProcurementVendor",
  "createProjectProcurementCommitment",
  "confirmProjectProcurementCommitment",
  "cancelProjectProcurementCommitment",
  "recordProjectProcurementDelivery",
  "correctProjectProcurementDelivery",
  "recordProjectProcurementInvoice",
  "reverseProjectProcurementInvoiceAllocation",
]) assert.match(adapterSource, new RegExp(token));

assert.equal(exists(component), true, "Project Procurement tab must exist");
const procurementUi = read(component);
const workspace = read(workspacePath);
assert.match(workspace, /ProjectProcurementTab/);
for (const label of ["Vendor", "Product", "Vendor Cost", "Delivery", "Invoiced", "Invoice No", "Invoice Cost", "PO No"]) {
  assert.match(procurementUi, new RegExp(label));
}
assert.match(procurementUi, /Vendor Required/);
assert.match(procurementUi, /Open to Purchase/);
assert.match(procurementUi, /Excess Ordered/);
assert.match(procurementUi, /No confirmed Project purchases yet/);

const permissionSource = read(permissions);
assert.match(permissionSource, /project_procurement\.view/);
assert.match(permissionSource, /project_procurement\.manage/);

console.log("Project Procurement contract passed.");
