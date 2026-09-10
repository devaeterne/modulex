import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const workspacePath = "src/components/customers/ProjectDetailWorkspace.tsx";
const pagePath = "src/app/(admin)/projects/[id]/page.tsx";
const domainPath = "src/lib/customers/project-participants-commission-domain.ts";
const panelPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
const eventDomainPath = "src/lib/customers/project-commission-events.ts";
const roleManagerPath = "src/components/customers/project-detail/ProjectParticipantRoleManager.tsx";
const settingsOverviewPath = "src/components/settings/GeneralSettingsOverview.tsx";
const settingsRoutePath = "src/app/(admin)/settings/general/project-participant-roles/page.tsx";
const hardeningMigrationPath = "../modulex-store/supabase/migrations/20260904150500_customer_project_participants_commission_hardening.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260905004500_customer_project_commission_access_basis.sql";
const mirrorPath = "sql/project-pb6-commission-access-basis.sql";
const externalServiceMigrationPath = "../modulex-store/supabase/migrations/20260910220000_customer_project_external_service_commission_access.sql";
const externalServiceMirrorPath = "sql/project-pb6-external-service-commission-access.sql";

for (const [file, message] of [
  [workspacePath, "Project workspace must exist"],
  [pagePath, "Project detail page must exist"],
  [domainPath, "PB-6 client domain must exist"],
  [panelPath, "PB-6 panel must exist"],
  [eventDomainPath, "PB-6 event domain must exist"],
  [roleManagerPath, "PB-6 role manager must exist"],
  [settingsOverviewPath, "General Settings overview must exist"],
  [settingsRoutePath, "Project Participant Roles General Settings route must exist"],
  [hardeningMigrationPath, "PB-6 hardening migration must exist"],
  [migrationPath, "PB-6 access/basis migration must exist"],
  [mirrorPath, "PB-6 access/basis Admin SQL mirror must exist"],
  [externalServiceMigrationPath, "PB-6 Sales external-service access migration must exist"],
  [externalServiceMirrorPath, "PB-6 Sales external-service Admin SQL mirror must exist"],
]) assert.equal(exists(file), true, message);

const workspace = read(workspacePath);
const page = read(pagePath);
const domain = read(domainPath);
const panel = read(panelPath);
const eventDomain = read(eventDomainPath);
const roleManager = read(roleManagerPath);
const settingsOverview = read(settingsOverviewPath);
const settingsRoute = read(settingsRoutePath);
const hardeningMigration = read(hardeningMigrationPath);
const migration = read(migrationPath);
const mirror = read(mirrorPath);
const externalServiceMigration = read(externalServiceMigrationPath);
const externalServiceMirror = read(externalServiceMirrorPath);

assert.equal(migration, mirror, "PB-6 access/basis migration and Admin SQL mirror must stay byte-identical");
assert.equal(externalServiceMigration, externalServiceMirror, "PB-6 Sales external-service migration and Admin SQL mirror must stay byte-identical");

assert.match(workspace, /Participants & Commission/, "Project workspace must expose Participants & Commission as a tab");
assert.match(workspace, /ProjectParticipantsCommissionPanel/, "Project workspace must own the PB-6 commission panel");
assert.match(workspace, /super_admin[\s\S]*admin[\s\S]*finance[\s\S]*sales|sales[\s\S]*finance[\s\S]*admin[\s\S]*super_admin/, "PB-6 tab visibility must include limited Sales access plus Finance/Admin/Super Admin");
assert.doesNotMatch(page, /ProjectParticipantsCommissionPanel|ProjectParticipantRoleManager/, "PB-6 must not render outside the Project tab workspace");

assert.match(settingsOverview, /Project Participant Roles/, "General Settings overview must expose Project Participant Roles");
assert.match(settingsOverview, /\/settings\/general\/project-participant-roles/, "General Settings overview must link to Project Participant Roles");
assert.match(settingsRoute, /ProjectParticipantRoleManager/, "Project Participant Roles settings route must render the role manager");
assert.match(roleManager, /usePathname/, "Participant role manager must know which route is rendering it");
assert.match(roleManager, /\/settings\/general\/project-participant-roles/, "Participant role manager must render only on its General Settings route");
assert.match(roleManager, /Participant Roles[\s\S]*Save Participant Role/i, "General Settings must retain participant-role configuration behavior");

assert.match(domain, /const PB6_INTERNAL_ROLES = \["super_admin", "admin", "finance"\]/, "PB-6 client access must retain one full-detail internal role boundary");
assert.doesNotMatch(domain, /PB6_INTERNAL_ROLES[^\n]*sales/, "Sales must not become an internal full-detail role");
assert.match(domain, /PB6_EXTERNAL_SERVICE_ROLES[\s\S]*designer[\s\S]*installer[\s\S]*contractor[\s\S]*referral_partner/i, "Sales participant creation must be constrained to the approved external-service role whitelist");
assert.doesNotMatch(eventDomain, /super_admin", "admin", "finance", "sales/, "Sales must not pass the commission-event client guard");
assert.match(domain, /get_customer_project_commission_basis_preview/i, "Percentage creation must retain the authoritative DB basis preview contract");
assert.match(domain, /p_basis_amount:\s*null/, "Client must not send a user-entered percentage basis amount");
assert.match(domain, /replace_customer_project_commission_obligation/i, "Finance/Admin correction must use an explicit immutable replacement RPC");

assert.doesNotMatch(panel, /commissionBasisAmount|Basis amount snapshot/, "Percentage basis must not be manually entered in the UI");
assert.match(panel, /Sales basis/i, "Sales-percentage UI must show the canonical basis preview");
assert.match(panel, /Estimated commission/i, "Percentage UI must show the calculated commission preview");
assert.match(panel, /My External Services/i, "Limited Sales UI must clearly identify its own-only external-service scope");
assert.match(panel, /Correct commission/i, "Finance/Admin UI must expose pending commission correction without rewriting history");

assert.match(migration, /private\.project_commission_scope_basis/i, "DB must own canonical percentage basis calculation");
assert.match(migration, /sum\(co\.grand_total\)/i, "Whole-Project percentage basis must use active Order grand totals");
assert.match(migration, /sum\(oi\.line_total\)/i, "Category/product percentage basis must use scoped Order line totals");
assert.match(migration, /PROJECT_COMMISSION_SCOPE_MIXED_CURRENCY/i, "Mixed-currency scopes must fail closed");
assert.match(migration, /PROJECT_COMMISSION_BASIS_EMPTY/i, "Zero/empty percentage basis must fail closed");
assert.match(migration, /get_customer_project_commission_basis_preview/i, "DB must expose a bounded basis preview RPC");
assert.match(migration, /create_customer_project_commission_obligation[\s\S]*project_commission_scope_basis/i, "Commission creation must calculate percentage basis server-side");
assert.match(migration, /current_user_has_any_role\(array\['super_admin','admin','finance'\]\)/i, "Historical PB-6 migration must retain its internal boundary; the new migration supersedes it narrowly");
assert.match(hardeningMigration, /paid_amount[\s\S]*when not public\.current_user_has_any_role\(array\['super_admin','admin','finance'\]\) then null/i, "Existing commission projection must keep Finance payout amounts hidden from non-internal viewers");
assert.match(hardeningMigration, /payout_currency_state[\s\S]*when not public\.current_user_has_any_role\(array\['super_admin','admin','finance'\]\) then 'restricted'/i, "Existing commission projection must keep payout currency state restricted for non-internal viewers");

assert.match(externalServiceMigration, /designer[\s\S]*installer[\s\S]*contractor[\s\S]*referral_partner/i, "DB must use the approved Sales external-service role whitelist");
assert.match(externalServiceMigration, /created_by\s*=\s*auth\.uid\(\)/i, "Sales reads must be row-bounded to participant ownership");
assert.match(externalServiceMigration, /PROJECT_PARTICIPANT_SALES_ROLE_FORBIDDEN/i, "Sales must fail closed when assigning Sales Rep, Project Manager, or any unapproved role");
assert.match(externalServiceMigration, /PROJECT_COMMISSION_SALES_GROSS_PROFIT_FORBIDDEN/i, "Sales must not access gross-profit commission calculations");
assert.match(externalServiceMigration, /replace_customer_project_commission_obligation/i, "DB must expose an atomic commission replacement path for Finance/Admin corrections");
assert.match(externalServiceMigration, /PROJECT_COMMISSION_REPLACE_PENDING_ONLY/i, "Only pending commission obligations may be replaced directly");
assert.match(externalServiceMigration, /PROJECT_COMMISSION_REPLACEMENT_REASON_REQUIRED/i, "Commission replacement must require an audit reason");
assert.match(externalServiceMigration, /current_user_has_any_role\(array\['super_admin','admin','finance'\]\)/i, "Finance/Admin/Super Admin must retain full participant and commission management");
assert.doesNotMatch(externalServiceMigration, /append_customer_project_commission_event[\s\S]*current_user_has_any_role\(array\[[^\]]*'sales'[^\]]*\]\)/i, "Sales must not gain commission lifecycle event authority");

console.log("Project PB-6 tab access + percentage basis contract PASS");
