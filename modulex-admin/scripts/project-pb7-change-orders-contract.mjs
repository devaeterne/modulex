import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const migrationPath = "../modulex-store/supabase/migrations/20260905100000_customer_project_change_orders.sql";
const sqlPath = "sql/project-pb7-change-orders.sql";
const hardeningMigrationPath = "../modulex-store/supabase/migrations/20260905213000_customer_project_change_orders_security_hardening.sql";
const hardeningSqlPath = "sql/project-pb7-change-orders-security-hardening.sql";
const domainPath = "src/lib/customers/project-change-orders-domain.ts";
const componentPath = "src/components/customers/project-detail/ProjectChangeOrdersTab.tsx";
const workspacePath = "src/components/customers/ProjectDetailWorkspace.tsx";

for (const [file, message] of [
  [migrationPath, "PB-7 canonical migration must exist"],
  [sqlPath, "PB-7 Admin SQL mirror must exist"],
  [hardeningMigrationPath, "PB-7 security hardening migration must exist"],
  [hardeningSqlPath, "PB-7 security hardening Admin SQL mirror must exist"],
  [domainPath, "PB-7 client domain must exist"],
  [componentPath, "PB-7 Project tab must exist"],
  [workspacePath, "Project workspace must exist"],
]) assert.equal(exists(file), true, message);

const migration = read(migrationPath);
const sql = read(sqlPath);
const hardeningMigration = read(hardeningMigrationPath);
const hardeningSql = read(hardeningSqlPath);
const domain = read(domainPath);
const component = read(componentPath);
const workspace = read(workspacePath);
const dbSql = `${migration}\n${sql}\n${hardeningMigration}\n${hardeningSql}`;

assert.equal(migration, sql, "PB-7 Admin SQL mirror and Supabase migration must stay byte-identical");
assert.equal(hardeningMigration, hardeningSql, "PB-7 hardening Admin SQL mirror and Supabase migration must stay byte-identical");

for (const token of [
  "customer_project_change_orders",
  "customer_project_change_order_lines",
  "customer_project_change_order_events",
  "customer_project_change_order_applications",
  "get_customer_project_change_orders",
  "get_customer_project_change_order",
  "create_customer_project_change_order",
  "update_customer_project_change_order_draft",
  "set_customer_project_change_order_lines",
  "submit_customer_project_change_order",
  "review_customer_project_change_order",
  "cancel_customer_project_change_order",
  "link_customer_project_change_order_revision",
  "get_customer_project_change_order_summary",
]) assert.match(dbSql, new RegExp(token, "i"), `PB-7 DB boundary must contain ${token}`);

assert.match(dbSql, /draft[\s\S]*submitted[\s\S]*approved[\s\S]*rejected[\s\S]*cancelled/i, "PB-7 lifecycle states must be explicit");
assert.match(dbSql, /add_scope[\s\S]*remove_scope[\s\S]*quantity_change[\s\S]*price_adjustment[\s\S]*customer_credit[\s\S]*vendor_credit[\s\S]*other/i, "PB-7 effect types must be explicit");
assert.match(dbSql, /PROJECT_CHANGE_ORDER_IMMUTABLE/i, "Submitted commercial content must be immutable");
assert.match(dbSql, /PROJECT_CHANGE_ORDER_LINE_IMMUTABLE/i, "Submitted lines must be immutable");
assert.match(dbSql, /PROJECT_CHANGE_ORDER_EVENT_APPEND_ONLY/i, "Lifecycle events must be append-only");
assert.match(dbSql, /PROJECT_CHANGE_ORDER_APPLICATION_APPEND_ONLY/i, "Application linkage must be append-only");
assert.match(dbSql, /pg_advisory_xact_lock/i, "Per-Project Change Order numbering must be serialized");
assert.match(dbSql, /for\s+update/i, "Lifecycle transitions must lock the Change Order row");
assert.match(dbSql, /order_revision_id[\s\S]*unique|unique[\s\S]*order_revision_id/i, "A canonical Order revision may only be linked once");
assert.match(dbSql, /customer_order_revisions/i, "Application must link canonical Order revision history");
assert.match(dbSql, /canonical_sell_delta/i, "Application links must snapshot canonical pre-tax sell delta");
assert.match(dbSql, /mixed_currency/i, "PB-7 reconciliation/summary must fail closed on mixed currency");
assert.match(dbSql, /0\.01|0\.0100|<=\s*0\.01/i, "Application reconciliation must use explicit rounding tolerance");

const lineWriteStart = hardeningMigration.toLowerCase().indexOf("set_customer_project_change_order_lines");
const lineWriteEnd = lineWriteStart >= 0 ? hardeningMigration.toLowerCase().indexOf("link_customer_project_change_order_revision", lineWriteStart) : -1;
const lineWriteFunction = lineWriteStart >= 0 ? hardeningMigration.slice(lineWriteStart, lineWriteEnd > lineWriteStart ? lineWriteEnd : lineWriteStart + 18000) : "";
assert.ok(lineWriteFunction.length > 0, "PB-7 line mutation RPC must be present in the hardening migration");
assert.match(lineWriteFunction, /PROJECT_CHANGE_ORDER_COST_WRITE_FORBIDDEN/i, "Sales must be blocked from writing hidden cost/vendor data");
assert.match(lineWriteFunction, /can_view_customer_project_change_order_cost/i, "PB-7 line mutation must enforce the internal-cost role boundary at the DB RPC");
assert.match(lineWriteFunction, /expected_cost_delta[\s\S]*cost_currency_code[\s\S]*vendor_code/i, "PB-7 line mutation guard must cover all hidden internal fields");
assert.match(lineWriteFunction, /exists[\s\S]*customer_project_change_order_lines[\s\S]*expected_cost_delta[\s\S]*vendor_code/i, "Sales line replacement must fail closed instead of erasing existing hidden cost/vendor detail");

const reviewStart = migration.toLowerCase().indexOf("review_customer_project_change_order");
const reviewEnd = reviewStart >= 0 ? migration.toLowerCase().indexOf("cancel_customer_project_change_order", reviewStart) : -1;
const reviewFunction = reviewStart >= 0 ? migration.slice(reviewStart, reviewEnd > reviewStart ? reviewEnd : reviewStart + 12000) : "";
assert.ok(reviewFunction.length > 0, "PB-7 review RPC must be present");
assert.doesNotMatch(reviewFunction, /update_customer_order|insert\s+into\s+public\.customer_order_items|update\s+public\.customer_orders|finance_transactions|procurement_commitments/i, "Approving a PB-7 Change Order must not mutate canonical Order/Finance/Procurement truth");

const linkStart = hardeningMigration.toLowerCase().indexOf("link_customer_project_change_order_revision");
const linkFunction = linkStart >= 0 ? hardeningMigration.slice(linkStart, linkStart + 20000) : "";
assert.ok(linkFunction.length > 0, "PB-7 canonical revision link RPC must be present in the hardening migration");
assert.match(linkFunction, /customer_order_revisions[\s\S]*for\s+update/i, "Canonical revision linking must lock the revision row before testing global uniqueness");

assert.match(dbSql, /super_admin[\s\S]*admin[\s\S]*sales[\s\S]*finance/i, "PB-7 read authorization must explicitly cover supported roles");
assert.match(dbSql, /expected_cost_delta[\s\S]*(?:null|can_view_customer_project_change_order_cost)/i, "Sales projection must sanitize internal cost");
assert.match(dbSql, /vendor_code[\s\S]*(?:null|can_view_customer_project_change_order_cost)/i, "Sales projection must sanitize vendor detail");
assert.match(dbSql, /revoke\s+all[\s\S]*from\s+public/i, "PB-7 execution/direct table access must be revoked from PUBLIC");
assert.doesNotMatch(dbSql, /grant\s+.*\s+to\s+anon/i, "PB-7 must not expose Change Orders to anon/Store");
assert.doesNotMatch(dbSql, /create\s+table[\s\S]*(project_change_order_payments|project_change_order_finance|project_change_order_procurement)/i, "PB-7 must not invent duplicate Finance/Procurement ledgers");

for (const token of [
  "get_customer_project_change_orders",
  "get_customer_project_change_order",
  "get_customer_project_change_order_summary",
  "create_customer_project_change_order",
  "update_customer_project_change_order_draft",
  "set_customer_project_change_order_lines",
  "submit_customer_project_change_order",
  "review_customer_project_change_order",
  "cancel_customer_project_change_order",
  "link_customer_project_change_order_revision",
]) assert.match(domain, new RegExp(token, "i"), `PB-7 client domain must call ${token}`);

assert.match(component, /Approved pending application/i, "PB-7 UI must separate approved pending impact from canonical Project totals");
assert.match(component, /Current canonical Project/i, "PB-7 UI must label canonical Project truth separately");
assert.match(component, /Approve/i, "Admin review UI must expose approval");
assert.match(component, /approval does not update the Order|does not update the Order/i, "PB-7 UI must explain approval/application separation");
assert.match(component, /Link canonical Order revision/i, "PB-7 UI must expose explicit application linkage");
assert.match(component, /ComponentCard/i, "PB-7 UI must reuse shared Admin primitives");
assert.match(workspace, /Change Orders/i, "Project workspace must expose the PB-7 tab");
assert.doesNotMatch(workspace, /<ProjectParticipantRoleManager/i, "Participant Role Manager must remain General Settings-only");
assert.doesNotMatch(`${domain}\n${component}\n${workspace}`, /modulex-store\/src|portal\/|dealer portal/i, "PB-7 Admin implementation must not widen Store/Portal surface");

console.log("Project PB-7 Change Orders contract PASS");
