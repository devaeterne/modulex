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
const migrationPath = "../modulex-store/supabase/migrations/20260905004500_customer_project_commission_access_basis.sql";
const mirrorPath = "sql/project-pb6-commission-access-basis.sql";

for (const [file, message] of [
  [workspacePath, "Project workspace must exist"],
  [pagePath, "Project detail page must exist"],
  [domainPath, "PB-6 client domain must exist"],
  [panelPath, "PB-6 panel must exist"],
  [eventDomainPath, "PB-6 event domain must exist"],
  [roleManagerPath, "PB-6 role manager must exist"],
  [settingsOverviewPath, "General Settings overview must exist"],
  [settingsRoutePath, "Project Participant Roles General Settings route must exist"],
  [migrationPath, "PB-6 access/basis migration must exist"],
  [mirrorPath, "PB-6 access/basis Admin SQL mirror must exist"],
]) assert.equal(exists(file), true, message);

const workspace = read(workspacePath);
const page = read(pagePath);
const domain = read(domainPath);
const panel = read(panelPath);
const eventDomain = read(eventDomainPath);
const roleManager = read(roleManagerPath);
const settingsOverview = read(settingsOverviewPath);
const settingsRoute = read(settingsRoutePath);
const migration = read(migrationPath);
const mirror = read(mirrorPath);

assert.equal(migration, mirror, "PB-6 access/basis migration and Admin SQL mirror must stay byte-identical");

assert.match(workspace, /Participants & Commission/, "Project workspace must expose Participants & Commission as a tab");
assert.match(workspace, /ProjectParticipantsCommissionPanel/, "Project workspace must own the PB-6 commission panel");
assert.doesNotMatch(workspace, /ProjectParticipantRoleManager/, "Project workspace must not render global participant-role configuration");
assert.match(workspace, /super_admin[\s\S]*admin[\s\S]*finance|finance[\s\S]*admin[\s\S]*super_admin/, "PB-6 tab visibility must be restricted to Finance/Admin/Super Admin");
assert.doesNotMatch(page, /ProjectParticipantsCommissionPanel|ProjectParticipantRoleManager/, "PB-6 must not render outside the Project tab workspace");

assert.match(settingsOverview, /Project Participant Roles/, "General Settings overview must expose Project Participant Roles");
assert.match(settingsOverview, /\/settings\/general\/project-participant-roles/, "General Settings overview must link to Project Participant Roles");
assert.match(settingsRoute, /ProjectParticipantRoleManager/, "Project Participant Roles settings route must render the role manager");
assert.match(roleManager, /Participant Roles[\s\S]*Save Participant Role/i, "General Settings must retain participant-role configuration behavior");

assert.match(domain, /const PB6_INTERNAL_ROLES = \["super_admin", "admin", "finance"\]/, "PB-6 client access must use one internal role boundary");
assert.doesNotMatch(domain, /PB6_INTERNAL_ROLES[^\n]*sales/, "Sales must not be part of PB-6 internal detail access");
assert.doesNotMatch(domain, /super_admin", "admin", "finance", "sales/, "Legacy Sales detail access must be removed from the PB-6 client domain");
assert.doesNotMatch(eventDomain, /super_admin", "admin", "finance", "sales/, "Sales must not pass the commission-event client guard");
assert.match(domain, /get_customer_project_commission_basis_preview/i, "Percentage creation must request the authoritative DB basis preview");
assert.match(domain, /p_basis_amount:\s*null/, "Client must not send a user-entered percentage basis amount");

assert.doesNotMatch(panel, /commissionBasisAmount|Basis amount snapshot/, "Percentage basis must not be manually entered in the UI");
assert.match(panel, /Commission basis/i, "Percentage UI must show the canonical basis preview");
assert.match(panel, /Estimated commission/i, "Percentage UI must show the calculated commission preview");

assert.match(migration, /private\.project_commission_scope_basis/i, "DB must own canonical percentage basis calculation");
assert.match(migration, /sum\(co\.grand_total\)/i, "Whole-Project percentage basis must use active Order grand totals");
assert.match(migration, /sum\(oi\.line_total\)/i, "Category/product percentage basis must use scoped Order line totals");
assert.match(migration, /PROJECT_COMMISSION_SCOPE_MIXED_CURRENCY/i, "Mixed-currency scopes must fail closed");
assert.match(migration, /PROJECT_COMMISSION_BASIS_EMPTY/i, "Zero/empty percentage basis must fail closed");
assert.match(migration, /get_customer_project_commission_basis_preview/i, "DB must expose a bounded basis preview RPC");
assert.match(migration, /create_customer_project_commission_obligation[\s\S]*project_commission_scope_basis/i, "Commission creation must calculate percentage basis server-side");
assert.match(migration, /current_user_has_any_role\(array\['super_admin','admin','finance'\]\)/i, "PB-6 DB read boundary must be Finance/Admin/Super Admin");
assert.doesNotMatch(migration, /current_user_has_any_role\(array\[[^\]]*'sales'[^\]]*\]\)/i, "PB-6 internal DB visibility must not include Sales");

console.log("Project PB-6 tab access + percentage basis contract PASS");
