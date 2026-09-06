import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(here, "..");
const repoRoot = path.resolve(adminRoot, "..");
const readAdmin = (relative) => readFile(path.join(adminRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");
const readRepoOptional = async (relative) => {
  try {
    return await readRepo(relative);
  } catch {
    return "";
  }
};

const [route, panel, customerPage, customerCard, mailer, migration, privacySql, privacyMigration] = await Promise.all([
  readAdmin("src/app/api/admin/dealer-portal/route.ts"),
  readAdmin("src/components/customers/CustomerPortalAccessCard.tsx"),
  readAdmin("src/app/(admin)/customers/[id]/page.tsx"),
  readAdmin("src/components/customers/CustomerCard.tsx"),
  readAdmin("src/lib/email/dealer-portal.ts"),
  readRepo("modulex-store/supabase/migrations/20260828200000_dealer_portal_activation_lifecycle.sql"),
  readRepoOptional("modulex-admin/sql/customer-portal-document-privacy-hardening.sql"),
  readRepoOptional("modulex-store/supabase/migrations/20260906230000_customer_portal_document_privacy_hardening.sql"),
]);

assert.match(route, /requireAdmin\(request\)/, "dealer portal API must use the Admin gate");
assert.match(route, /dealer_portal/, "dealer customers must still map to trusted dealer app metadata");
assert.match(route, /accountType/, "portal Auth metadata must be derived server-side");
assert.match(route, /auth\.admin\.createUser/, "portal Auth users must be created server-side");
assert.match(route, /auth\.admin\.generateLink/, "portal activation links must be generated server-side");
assert.match(route, /type:\s*["']recovery["']/, "activation must use an action token for the already-created trusted Auth user");
assert.doesNotMatch(route, /inviteUserByEmail/, "portal activation must not rely on user_metadata-only inviteUserByEmail");
assert.match(route, /portal_enabled/, "invite flow must guard disabled customers");
assert.match(route, /never_invited/, "new portal users must start never_invited");
assert.match(route, /suspended/, "lifecycle must support suspension");
assert.match(route, /activated_at/, "restore must account for prior activation");
assert.match(route, /auth_user_id/, "lifecycle must bind and validate the Auth user");
assert.match(route, /customer_activity/, "portal lifecycle must append customer activity");

assert.match(customerPage, /CustomerPortalAccessCard/, "customer page must surface the secure portal lifecycle panel");
assert.doesNotMatch(customerPage, /button:nth-child\(6\)|legacy-customer-card/, "customer page must not rely on CSS to hide a superseded portal surface");
assert.doesNotMatch(customerCard, /Web \/ Portal/, "core customer card must not expose a duplicate portal mutation tab");
assert.doesNotMatch(customerCard, /customer_portal_users/, "core customer card must not mutate portal lifecycle rows directly");
assert.match(panel, /\/api\/admin\/dealer-portal/, "Admin lifecycle UI must call the server API");
assert.match(panel, />Store Portal Access</, "Admin lifecycle UI must use the neutral Store portal heading");
assert.doesNotMatch(panel, /portalForm\.status/, "secure Admin lifecycle UI must not expose a mutable status field");
assert.match(panel, /Resend Invite/, "Admin UI must expose resend for pending invitations");
assert.match(panel, /Suspend/, "Admin UI must expose suspension");
assert.match(panel, /Restore/, "Admin UI must expose restore");
assert.match(panel, /Set Primary/, "Admin UI must expose primary-user management");
assert.match(panel, /Remove Draft/, "only never-invited drafts should be removable");

assert.match(migration, /revoke insert, update, delete on table public\.customer_portal_users from authenticated/i, "browser-authenticated users must not mutate portal lifecycle rows directly");
assert.match(mailer, /RESEND_API_KEY/, "portal activation mail must remain server-side");
assert.match(mailer, /token_hash/, "email must route through the controlled Store token-hash activation page");
assert.match(mailer, /activation/i, "portal mail must contain activation copy");

assert.ok(privacySql.length > 0, "CUST-6 customer document privacy hardening SQL must exist");
assert.equal(privacySql, privacyMigration, "CUST-6 Admin SQL and Store migration must stay byte-identical");
assert.match(privacySql, /create or replace function private\.guard_customer_document_portal_lifecycle\s*\(/i, "CUST-6 must guard sensitive customer-document lifecycle fields at the DB boundary");
assert.match(privacySql, /create trigger trg_guard_customer_document_portal_lifecycle/i, "CUST-6 must install the customer-document privacy guard trigger");
assert.match(privacySql, /split_part\(new\.storage_path\s*,\s*'\/'\s*,\s*1\)\s*<>\s*new\.customer_id::text/i, "CUST-6 must keep document storage paths scoped to their customer");
assert.match(privacySql, /new\.portal_visible\s+is\s+distinct\s+from\s+old\.portal_visible/i, "CUST-6 must guard direct portal visibility changes");
assert.match(privacySql, /new\.is_active\s+is\s+distinct\s+from\s+old\.is_active/i, "CUST-6 must guard direct document activation changes");
assert.match(privacySql, /tg_op\s*=\s*'DELETE'[\s\S]*append-safe/i, "CUST-6 must reject hard delete of Customer document metadata");
assert.match(privacySql, /current_setting\('modulex\.customer_document_lifecycle'\s*,\s*true\)/i, "CUST-6 sensitive lifecycle mutations must require the canonical RPC transaction guard");
assert.match(privacySql, /set_config\('modulex\.customer_document_lifecycle'\s*,\s*'on'\s*,\s*true\)/i, "CUST-6 lifecycle RPCs must set the transaction-local document guard");
assert.match(privacySql, /set_config\('modulex\.customer_document_lifecycle'\s*,\s*'off'\s*,\s*true\)/i, "CUST-6 lifecycle RPCs must close their transaction-local document guard after mutation");
assert.match(privacySql, /create or replace function private\.can_staff_mutate_customer_document_object\s*\(/i, "CUST-6 must protect registered private Storage objects from direct staff mutation");
assert.match(privacySql, /return not exists\s*\([\s\S]*from public\.customer_documents/i, "CUST-6 Storage mutation helper must allow only unregistered orphan objects");
assert.match(privacySql, /create policy customer_documents_staff_update[\s\S]*using \(private\.can_staff_mutate_customer_document_object\(bucket_id, name\)\)[\s\S]*with check \(private\.can_staff_mutate_customer_document_object\(bucket_id, name\)\)/i, "CUST-6 registered Storage objects must not be overwritten or renamed");
assert.match(privacySql, /create policy customer_documents_staff_delete[\s\S]*using \(private\.can_staff_mutate_customer_document_object\(bucket_id, name\)\)/i, "CUST-6 registered Storage objects must not be hard-deleted while orphan cleanup remains possible");
assert.match(privacySql, /create or replace function public\.register_customer_document\s*\(/i, "CUST-6 forward hardening must restore the merged document registration RPC when production drift skipped the earlier migration");
assert.match(privacySql, /create or replace function public\.set_customer_document_portal_visibility\s*\(/i, "CUST-6 forward hardening must own portal visibility mutation");
assert.match(privacySql, /create or replace function public\.deactivate_customer_document\s*\(/i, "CUST-6 forward hardening must own document deactivation");
assert.match(privacySql, /security\s+invoker/i, "CUST-6 document lifecycle RPCs must preserve caller RLS");
assert.match(privacySql, /v_role\s+not\s+in\s*\('super_admin'\s*,\s*'admin'\)/i, "Only Admin roles may promote customer documents to Portal visibility");
assert.match(privacySql, /revoke all on function public\.set_customer_document_portal_visibility\(uuid,uuid,boolean\) from public, anon, authenticated/i, "CUST-6 portal visibility RPC must keep PUBLIC/anon execute revoked before granting authenticated");
assert.match(privacySql, /grant execute on function public\.set_customer_document_portal_visibility\(uuid,uuid,boolean\) to authenticated/i, "CUST-6 portal visibility RPC must grant authenticated execute explicitly");

console.log("dealer portal admin contract: ok");
