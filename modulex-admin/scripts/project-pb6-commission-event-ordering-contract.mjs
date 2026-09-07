import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const migrationPath = "../modulex-store/supabase/migrations/20260907140000_customer_project_commission_event_ordering.sql";
const sqlPath = "sql/project-pb6-commission-event-ordering.sql";
const acceptancePath = "docs/acceptance/pb-6-commission-event-ordering-hardening.md";

assert.equal(exists(migrationPath), true, "PB-6 event-ordering migration must exist");
assert.equal(exists(sqlPath), true, "PB-6 event-ordering Admin SQL mirror must exist");
assert.equal(exists(acceptancePath), true, "PB-6 event-ordering acceptance artifact must exist");

const migration = read(migrationPath);
const sql = read(sqlPath);

assert.equal(migration, sql, "PB-6 event-ordering migration and Admin SQL mirror must stay byte-identical");
assert.match(migration, /alter\s+table\s+public\.project_commission_events[\s\S]*add\s+column[\s\S]*event_sequence\s+bigint\s+generated\s+always\s+as\s+identity/i,
  "PB-6 must add a database-assigned append sequence");
assert.match(migration, /create\s+(?:unique\s+)?index[\s\S]*project_commission_events[\s\S]*obligation_id[\s\S]*event_sequence\s+desc/i,
  "PB-6 must index event lookup by obligation + descending append sequence");

const requiredFkIndexes = [
  "project_commission_events_created_by_idx",
  "project_commission_obligations_participant_project_idx",
  "project_commission_obligations_created_by_idx",
  "project_commission_obligations_order_idx",
  "project_commission_obligations_category_idx",
  "project_commission_obligations_product_idx",
  "project_participant_roles_created_by_idx",
  "project_participants_created_by_idx",
  "project_participants_contact_idx",
  "project_participants_employee_idx",
  "project_participants_profile_idx",
  "project_participants_role_idx",
  "project_participants_updated_by_idx",
];
for (const indexName of requiredFkIndexes) {
  assert.match(migration, new RegExp(`create\\s+index\\s+if\\s+not\\s+exists\\s+${indexName}\\b`, "i"),
    `PB-6 hardening must include ${indexName}`);
}
assert.match(migration, /project_commission_obligations_participant_project_idx[\s\S]*participant_id\s*,\s*project_id/i,
  "Composite participant/project FK must have a matching leading-column index");

assert.match(migration, /current_project_commission_status[\s\S]*order\s+by\s+e\.event_sequence\s+desc/i,
  "Current commission status must use deterministic append order");
assert.match(migration, /get_customer_project_commission_events[\s\S]*order\s+by\s+e\.event_sequence\s+desc/i,
  "Commission event history must expose deterministic append order");
assert.doesNotMatch(migration, /update\s+public\.project_commission_events/i,
  "Hardening must not UPDATE immutable commission history");
assert.doesNotMatch(migration, /delete\s+from\s+public\.project_commission_events/i,
  "Hardening must not DELETE immutable commission history");
assert.doesNotMatch(migration, /disable\s+trigger|drop\s+trigger\s+trg_project_commission_events_immutable/i,
  "Hardening must not bypass the append-only history guard");
assert.match(migration, /revoke\s+all\s+on\s+function\s+private\.current_project_commission_status\(uuid\)\s+from\s+public/i,
  "Private current-status helper must remain execute-locked from PUBLIC");
assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.get_customer_project_commission_events\(uuid\)\s+from\s+public/i,
  "Public event projection must keep PUBLIC execute revoked");
assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.get_customer_project_commission_events\(uuid\)\s+to\s+authenticated/i,
  "Authenticated callers must retain the guarded event projection");

console.log("Project PB-6 deterministic commission event ordering contract PASS");
