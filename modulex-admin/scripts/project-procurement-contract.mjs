import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const coreMigration = "modulex-store/supabase/migrations/20260904102000_customer_project_procurement_core.sql";
const syncMigration = "modulex-store/supabase/migrations/20260904102500_customer_project_procurement_order_sync.sql";
const operationsMigration = "modulex-store/supabase/migrations/20260904103000_customer_project_procurement_operations.sql";
const adapter = "modulex-admin/src/lib/customers/project-procurement.ts";
const component = "modulex-admin/src/components/customers/project-detail/ProjectProcurementTab.tsx";
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
assert.equal(exists(operationsMigration), true, "PB-3B operations migration must exist");
assert.equal(exists(adapter), true, "Project Procurement adapter must exist");
assert.equal(exists(component), true, "Project Procurement tab must exist");

const permissionSource = read(permissions);
assert.match(permissionSource, /project_procurement\.view/);
assert.match(permissionSource, /project_procurement\.manage/);

console.log("Project Procurement contract passed.");
