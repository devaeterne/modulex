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
const hardeningMigrationPath = "../modulex-store/supabase/migrations/20260904150500_customer_project_participants_commission_hardening.sql";
const hardeningSqlPath = "sql/project-pb6-participants-commission-hardening.sql";
const systemRoleGuardMigrationPath = "../modulex-store/supabase/migrations/20260904151000_customer_project_participant_system_role_guard.sql";
const systemRoleGuardSqlPath = "sql/project-pb6-participant-system-role-guard.sql";
const domainPath = "src/lib/customers/project-participants-commission-domain.ts";
const componentPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
const pagePath = "src/app/(admin)/projects/[id]/page.tsx";

for (const [file, message] of [
  [migrationPath, "PB-6 canonical migration must exist"],
  [sqlPath, "PB-6 Admin SQL mirror must exist"],
  [hardeningMigrationPath, "PB-6 hardening migration must exist"],
  [hardeningSqlPath, "PB-6 hardening SQL mirror must exist"],
  [systemRoleGuardMigrationPath, "PB-6 system role guard migration must exist"],
  [systemRoleGuardSqlPath, "PB-6 system role guard SQL mirror must exist"],
  [domainPath, "PB-6 client domain must exist"],
  [componentPath, "PB-6 Project Admin UI must exist"],
]) assert.equal(exists(file), true, message);

const migration = read(migrationPath);
const sql = read(sqlPath);
const hardening = read(hardeningMigrationPath);
const hardeningSql = read(hardeningSqlPath);
const systemRoleGuard = read(systemRoleGuardMigrationPath);
const systemRoleGuardSql = read(systemRoleGuardSqlPath);
const domain = read(domainPath);
const component = read(componentPath);
const page = read(pagePath);
const dbSql = `${sql}\n${hardening}\n${systemRoleGuard}`;

assert.equal(migration, sql, "PB-6 Admin SQL mirror and Supabase migration must stay byte-identical");
assert.equal(hardening, hardeningSql, "PB-6 hardening Admin SQL mirror and Supabase migration must stay byte-identical");
assert.equal(systemRoleGuard, systemRoleGuardSql, "PB-6 system role guard Admin SQL mirror and migration must stay byte-identical");

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
]) assert.match(dbSql, new RegExp(token, "i"));

assert.match(dbSql, /project_sales_rep/i, "Sales Rep participant must be a system projection of canonical Project sales_rep_id");
assert.match(dbSql, /customer_projects[\s\S]*sales_rep_id/i, "PB-6 must keep customer_projects.sales_rep_id as Sales Rep truth");
assert.match(dbSql, /designer[\s\S]*contractor[\s\S]*installer[\s\S]*referral_partner[\s\S]*project_manager/i, "Built-in participant roles must be seeded");
assert.match(hardening, /upsert_customer_project_participant_role/i, "Participant role taxonomy must be configurable through an Admin-guarded RPC");
assert.match(systemRoleGuard, /PROJECT_PARTICIPANT_SYSTEM_ROLE_REQUIRED/i, "Structural PB-6 roles must not be deactivatable");

assert.match(dbSql, /basis_type[\s\S]*fixed[\s\S]*percentage/i, "Commission obligations must support fixed and percentage basis");
assert.match(dbSql, /scope_type[\s\S]*project[\s\S]*category[\s\S]*product/i, "Commission scope must support Project/category/product");
assert.match(hardening, /PROJECT_COMMISSION_CATEGORY_NOT_IN_PROJECT[\s\S]*PROJECT_COMMISSION_PRODUCT_NOT_IN_PROJECT/i, "Category/product scope must fail closed unless it belongs to the Project's active Orders");
assert.match(dbSql, /pending[\s\S]*earned[\s\S]*approved[\s\S]*cancelled/i, "Commission lifecycle must be explicit");
assert.match(dbSql, /adjustment[\s\S]*offset[\s\S]*reversal/i, "Append-safe correction event types must exist");
assert.match(dbSql, /immutable|append.only|raise exception/i, "Obligation/event history must reject destructive rewrites");
assert.doesNotMatch(dbSql, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?project_commission_payments/i, "PB-6 must not create a duplicate commission payment ledger");
assert.match(dbSql, /finance_transaction_links/i, "PB-6 must attribute actual payout through canonical Finance transaction links");
assert.match(dbSql, /source_document_type\s*=\s*'project_commission_obligation'/i, "Finance attribution must target the obligation document id");
assert.match(hardening, /payout_currency_state[\s\S]*mixed_currency/i, "Payout rollup must fail closed instead of silently mixing Finance transaction currencies");

assert.match(dbSql, /super_admin[\s\S]*admin[\s\S]*finance/i, "Admin/Finance must have commission detail access");
assert.match(dbSql, /hr_employees[\s\S]*user_id/i, "Own-commission visibility must resolve through canonical employee user mapping");
assert.match(dbSql, /sales/i, "Sales own-commission access must be handled explicitly");
assert.match(dbSql, /revoke\s+all[\s\S]*from\s+public/i, "PB-6 RPC execution must be revoked from PUBLIC");
assert.match(hardening, /revoke\s+all\s+on\s+function\s+private\.can_view_project_commission/i, "PB-6 private helper execution must be locked down");
assert.doesNotMatch(dbSql, /grant\s+.*\s+to\s+anon/i, "PB-6 must not expose internal commission data to anon/Store");

for (const token of ["get_customer_project_participants", "get_customer_project_commissions", "create_customer_project_commission_obligation", "append_customer_project_commission_event"]) {
  assert.match(domain, new RegExp(token, "i"), `PB-6 client domain must call ${token}`);
}
assert.match(domain, /hr_employees[\s\S]*customer_contacts[\s\S]*profiles/i, "Participant candidates must reuse canonical person records instead of creating a second party truth");
assert.match(component, /Participants/i, "Project UI must expose Participants");
assert.match(component, /Commission/i, "Project UI must expose Commission");
assert.match(component, /ComponentCard/i, "PB-6 UI must use shared Admin primitives");
assert.match(component, /ADMIN_SURFACE_CARD[\s\S]*ADMIN_TEXT_STYLES/i, "PB-6 UI must use shared Admin appearance tokens");
assert.match(component, /Project status does not auto-earn commission/i, "UI must not imply an invented automatic earning rule");
assert.match(page, /ProjectParticipantsCommissionPanel/, "Project detail must render the PB-6 Admin surface");

console.log("Project PB-6 participants + commission contract PASS");
