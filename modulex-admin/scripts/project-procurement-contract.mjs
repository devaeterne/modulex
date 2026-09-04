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
const reservationAlignmentMigration = "modulex-store/supabase/migrations/20260904133500_customer_order_procurement_reservation_alignment.sql";
const reservationAlignmentSql = "modulex-admin/sql/project-order-procurement-reservation-alignment.sql";
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

assert.equal(
  exists(reservationAlignmentMigration),
  true,
  "Order reservation / Project Procurement alignment migration must exist",
);
assert.equal(
  exists(reservationAlignmentSql),
  true,
  "Admin SQL mirror for reservation / procurement alignment must exist",
);
const reservationAlignment = read(reservationAlignmentMigration);
assert.equal(
  reservationAlignment,
  read(reservationAlignmentSql),
  "Admin SQL mirror and Supabase migration must stay byte-identical",
);
for (const token of [
  "reserve_customer_order_item_stock",
  "inventory_tracking",
  "reservable",
  "customer_order_reservations",
  "get_customer_order_procurement_components",
  "sync_customer_order_procurement",
  "trg_customer_order_project_procurement_sync",
  "trg_customer_order_z_project_procurement_sync",
  "customer_project_procurement_requirements",
]) assert.match(reservationAlignment, new RegExp(token));
assert.match(
  reservationAlignment,
  /if\s+not\s+coalesce\(v_item\.inventory_tracking,\s*false\)\s+or\s+not\s+coalesce\(v_item\.reservable,\s*false\)/i,
  "Non-reservable or non-inventory-tracked products must bypass stock reservation",
);
assert.match(
  reservationAlignment,
  /if\s+v_needed\s*>\s*0\s+and\s+v_item\.project_id\s+is\s+null[\s\S]*raise\s+exception\s+'STANDALONE_STOCK_SHORTAGE/i,
  "Standalone Orders must remain fail-closed when sellable stock is short",
);
assert.match(
  reservationAlignment,
  /Project-linked shortage is intentionally non-fatal/i,
  "Project-linked stock shortage must fall through to Procurement instead of aborting confirmation",
);
assert.match(
  reservationAlignment,
  /greatest\([\s\S]*oi\.quantity[\s\S]*consumed_quantity[\s\S]*reserved_quantity[\s\S]*0[\s\S]*\)/i,
  "Reservable procurement demand must be the unfulfilled quantity after stock consumption/reservation",
);
assert.match(
  reservationAlignment,
  /drop\s+trigger\s+if\s+exists\s+trg_customer_order_project_procurement_sync/i,
  "Legacy procurement status trigger must be replaced",
);
assert.match(
  reservationAlignment,
  /create\s+trigger\s+trg_customer_order_z_project_procurement_sync/i,
  "Procurement sync trigger must run after stock reservation by trigger name ordering",
);
assert.match(
  reservationAlignment,
  /for\s+v_order_id\s+in[\s\S]*customer_orders[\s\S]*project_id\s+is\s+not\s+null[\s\S]*status\s+<>\s+'draft'[\s\S]*status\s+<>\s+'cancelled'[\s\S]*sync_customer_order_procurement/i,
  "Existing active non-Draft Project Orders must be backfilled idempotently",
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
