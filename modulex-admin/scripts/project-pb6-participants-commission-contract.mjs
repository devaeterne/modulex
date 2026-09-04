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
const integrityMigrationPath = "../modulex-store/supabase/migrations/20260904151500_customer_project_participant_commission_integrity.sql";
const integritySqlPath = "sql/project-pb6-participant-commission-integrity.sql";
const eventProjectionMigrationPath = "../modulex-store/supabase/migrations/20260904152000_customer_project_commission_event_projection.sql";
const eventProjectionSqlPath = "sql/project-pb6-commission-event-projection.sql";
const roleClassificationMigrationPath = "../modulex-store/supabase/migrations/20260904152500_customer_project_participant_role_classification.sql";
const roleClassificationSqlPath = "sql/project-pb6-participant-role-classification.sql";
const domainPath = "src/lib/customers/project-participants-commission-domain.ts";
const eventDomainPath = "src/lib/customers/project-commission-events.ts";
const roleAdminDomainPath = "src/lib/customers/project-participant-role-admin.ts";
const componentPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
const roleManagerPath = "src/components/customers/project-detail/ProjectParticipantRoleManager.tsx";
const pagePath = "src/app/(admin)/projects/[id]/page.tsx";

for (const [file, message] of [
  [migrationPath, "PB-6 canonical migration must exist"],
  [sqlPath, "PB-6 Admin SQL mirror must exist"],
  [hardeningMigrationPath, "PB-6 hardening migration must exist"],
  [hardeningSqlPath, "PB-6 hardening SQL mirror must exist"],
  [systemRoleGuardMigrationPath, "PB-6 system role guard migration must exist"],
  [systemRoleGuardSqlPath, "PB-6 system role guard SQL mirror must exist"],
  [integrityMigrationPath, "PB-6 participant/commission integrity migration must exist"],
  [integritySqlPath, "PB-6 participant/commission integrity SQL mirror must exist"],
  [eventProjectionMigrationPath, "PB-6 event projection migration must exist"],
  [eventProjectionSqlPath, "PB-6 event projection SQL mirror must exist"],
  [roleClassificationMigrationPath, "PB-6 role classification migration must exist"],
  [roleClassificationSqlPath, "PB-6 role classification SQL mirror must exist"],
  [domainPath, "PB-6 client domain must exist"],
  [eventDomainPath, "PB-6 commission event client domain must exist"],
  [roleAdminDomainPath, "PB-6 participant role Admin domain must exist"],
  [componentPath, "PB-6 Project Admin UI must exist"],
  [roleManagerPath, "PB-6 participant role manager UI must exist"],
]) assert.equal(exists(file), true, message);

const migration = read(migrationPath);
const sql = read(sqlPath);
const hardening = read(hardeningMigrationPath);
const hardeningSql = read(hardeningSqlPath);
const systemRoleGuard = read(systemRoleGuardMigrationPath);
const systemRoleGuardSql = read(systemRoleGuardSqlPath);
const integrity = read(integrityMigrationPath);
const integritySql = read(integritySqlPath);
const eventProjection = read(eventProjectionMigrationPath);
const eventProjectionSql = read(eventProjectionSqlPath);
const roleClassification = read(roleClassificationMigrationPath);
const roleClassificationSql = read(roleClassificationSqlPath);
const domain = read(domainPath);
const eventDomain = read(eventDomainPath);
const roleAdminDomain = read(roleAdminDomainPath);
const component = read(componentPath);
const roleManager = read(roleManagerPath);
const page = read(pagePath);
const dbSql = `${sql}\n${hardening}\n${systemRoleGuard}\n${integrity}\n${eventProjection}\n${roleClassification}`;

assert.equal(migration, sql, "PB-6 Admin SQL mirror and Supabase migration must stay byte-identical");
assert.equal(hardening, hardeningSql, "PB-6 hardening Admin SQL mirror and Supabase migration must stay byte-identical");
assert.equal(systemRoleGuard, systemRoleGuardSql, "PB-6 system role guard Admin SQL mirror and migration must stay byte-identical");
assert.equal(integrity, integritySql, "PB-6 participant/commission integrity Admin SQL mirror and migration must stay byte-identical");
assert.equal(eventProjection, eventProjectionSql, "PB-6 event projection Admin SQL mirror and migration must stay byte-identical");
assert.equal(roleClassification, roleClassificationSql, "PB-6 role classification Admin SQL mirror and migration must stay byte-identical");

for (const token of [
  "project_participant_roles",
  "project_participants",
  "project_commission_obligations",
  "project_commission_events",
  "sync_project_sales_rep_participant",
  "get_customer_project_participants",
  "get_customer_project_commissions",
  "get_customer_project_commission_events",
  "create_customer_project_commission_obligation",
  "append_customer_project_commission_event",
]) assert.match(dbSql, new RegExp(token, "i"));

assert.match(dbSql, /project_sales_rep/i, "Sales Rep participant must be a system projection of canonical Project sales_rep_id");
assert.match(dbSql, /customer_projects[\s\S]*sales_rep_id/i, "PB-6 must keep customer_projects.sales_rep_id as Sales Rep truth");
assert.match(dbSql, /designer[\s\S]*contractor[\s\S]*installer[\s\S]*referral_partner[\s\S]*project_manager/i, "Built-in participant roles must be seeded");
assert.match(hardening, /upsert_customer_project_participant_role/i, "Participant role taxonomy must be configurable through an Admin-guarded RPC");
assert.match(systemRoleGuard, /PROJECT_PARTICIPANT_SYSTEM_ROLE_REQUIRED/i, "Structural PB-6 roles must not be deactivatable");
assert.match(roleClassification, /is_system\s*=\s*\(role_key\s*=\s*'sales_rep'\)/i, "Only canonical Sales Rep must remain a structural role; other defaults must stay configurable");
assert.match(integrity, /PROJECT_PARTICIPANT_EMPLOYEE_INACTIVE_OR_MISSING[\s\S]*PROJECT_PARTICIPANT_CONTACT_CUSTOMER_MISMATCH_OR_INACTIVE[\s\S]*PROJECT_PARTICIPANT_PROFILE_INACTIVE_OR_MISSING/i, "Participant assignment must validate active canonical subjects at the DB boundary");

assert.match(dbSql, /basis_type[\s\S]*fixed[\s\S]*percentage/i, "Commission obligations must support fixed and percentage basis");
assert.match(dbSql, /scope_type[\s\S]*project[\s\S]*category[\s\S]*product/i, "Commission scope must support Project/category/product");
assert.match(hardening, /PROJECT_COMMISSION_CATEGORY_NOT_IN_PROJECT[\s\S]*PROJECT_COMMISSION_PRODUCT_NOT_IN_PROJECT/i, "Category/product scope must fail closed unless it belongs to the Project's active Orders");
assert.match(dbSql, /pending[\s\S]*earned[\s\S]*approved[\s\S]*cancelled/i, "Commission lifecycle must be explicit");
assert.match(dbSql, /adjustment[\s\S]*offset[\s\S]*reversal/i, "Append-safe correction event types must exist");
assert.match(integrity, /PROJECT_COMMISSION_NEGATIVE_ENTITLEMENT/i, "Commission corrections must not produce negative entitlement");
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
assert.match(eventDomain, /get_customer_project_commission_events/i, "PB-6 event domain must use the bounded event projection RPC");
assert.match(roleAdminDomain, /upsert_customer_project_participant_role/i, "PB-6 role Admin domain must use the guarded role RPC");
assert.match(domain, /hr_employees[\s\S]*customer_contacts[\s\S]*profiles/i, "Participant candidates must reuse canonical person records instead of creating a second party truth");
assert.match(component, /Participants/i, "Project UI must expose Participants");
assert.match(component, /Commission/i, "Project UI must expose Commission");
assert.match(component, /Commission event history/i, "Project UI must expose append-only commission event history");
assert.match(component, /Adjustment \/ offset to reverse/i, "Reversal UI must select from bounded event history rather than require a raw UUID");
assert.match(component, /ComponentCard/i, "PB-6 UI must use shared Admin primitives");
assert.match(component, /ADMIN_SURFACE_CARD[\s\S]*ADMIN_TEXT_STYLES/i, "PB-6 UI must use shared Admin appearance tokens");
assert.match(component, /Project status does not auto-earn commission/i, "UI must not imply an invented automatic earning rule");
assert.match(roleManager, /Participant Roles[\s\S]*Save Participant Role/i, "Admin UI must expose configurable participant roles");
assert.match(page, /ProjectParticipantsCommissionPanel[\s\S]*ProjectParticipantRoleManager/i, "Project detail must render PB-6 participant/commission and role-management surfaces");

console.log("Project PB-6 participants + commission contract PASS");
