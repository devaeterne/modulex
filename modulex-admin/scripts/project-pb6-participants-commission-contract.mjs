import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const migrationPath = "../modulex-store/supabase/migrations/20260904150000_customer_project_participants_commission_ledger.sql";
const sqlPath = "sql/project-pb6-participants-commission-ledger.sql";
const domainPath = "src/lib/customers/project-participants-commission-domain.ts";
const componentPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
const pagePath = "src/app/(admin)/projects/[id]/page.tsx";

assert.equal(exists(migrationPath), true, "PB-6 canonical migration must exist");
assert.equal(exists(sqlPath), true, "PB-6 Admin SQL mirror must exist");
assert.equal(exists(domainPath), true, "PB-6 client domain must exist");
assert.equal(exists(componentPath), true, "PB-6 Project Admin UI must exist");

const migration = read(migrationPath);
const sql = read(sqlPath);
const domain = read(domainPath);
const component = read(componentPath);
const page = read(pagePath);

assert.equal(migration, sql, "PB-6 Admin SQL mirror and Supabase migration must stay byte-identical");

for (const token of [
  "project_participant_roles",
  "project_participants",
  "project_commission_obligations",
  "project_commission_events",
  "sync_project_sales_rep_participant",
  "get_customer_project_participants",
  "get_customer_project_commissions",
  "create_customer_project_commission_obligation",
  "append_customer_project_commission_event",
]) assert.match(sql, new RegExp(token, "i"));

assert.match(sql, /project_sales_rep/i, "Sales Rep participant must be a system projection of canonical Project sales_rep_id");
assert.match(sql, /customer_projects[\s\S]*sales_rep_id/i, "PB-6 must keep customer_projects.sales_rep_id as Sales Rep truth");
assert.match(sql, /designer[\s\S]*contractor[\s\S]*installer[\s\S]*referral_partner[\s\S]*project_manager/i, "Built-in participant roles must be seeded");
assert.match(sql, /participant roles are configurable|is_system/i, "Participant role taxonomy must remain configurable");

assert.match(sql, /basis_type[\s\S]*fixed[\s\S]*percentage/i, "Commission obligations must support fixed and percentage basis");
assert.match(sql, /scope_type[\s\S]*project[\s\S]*category[\s\S]*product/i, "Commission scope must support Project/category/product");
assert.match(sql, /pending[\s\S]*earned[\s\S]*approved[\s\S]*cancelled/i, "Commission lifecycle must be explicit");
assert.match(sql, /adjustment[\s\S]*offset[\s\S]*reversal/i, "Append-safe correction event types must exist");
assert.match(sql, /immutable|append.only|raise exception/i, "Obligation/event history must reject destructive rewrites");
assert.doesNotMatch(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?project_commission_payments/i, "PB-6 must not create a duplicate commission payment ledger");
assert.match(sql, /finance_transaction_links/i, "PB-6 must attribute actual payout through canonical Finance transaction links");
assert.match(sql, /source_document_type\s*=\s*'project_commission_obligation'/i, "Finance attribution must target the obligation document id");

assert.match(sql, /super_admin[\s\S]*admin[\s\S]*finance/i, "Admin/Finance must have commission detail access");
assert.match(sql, /hr_employees[\s\S]*user_id/i, "Own-commission visibility must resolve through canonical employee user mapping");
assert.match(sql, /sales/i, "Sales own-commission access must be handled explicitly");
assert.match(sql, /revoke\s+all[\s\S]*from\s+public/i, "PB-6 RPC execution must be revoked from PUBLIC");
assert.doesNotMatch(sql, /grant\s+.*\s+to\s+anon/i, "PB-6 must not expose internal commission data to anon/Store");

for (const token of ["get_customer_project_participants", "get_customer_project_commissions", "create_customer_project_commission_obligation", "append_customer_project_commission_event"]) {
  assert.match(domain, new RegExp(token, "i"), `PB-6 client domain must call ${token}`);
}
assert.match(component, /Participants/i, "Project UI must expose Participants");
assert.match(component, /Commission/i, "Project UI must expose Commission");
assert.match(component, /ComponentCard/i, "PB-6 UI must use shared Admin primitives");
assert.match(page, /ProjectParticipantsCommissionPanel/, "Project detail must render the PB-6 Admin surface");

console.log("Project PB-6 participants + commission contract PASS");
