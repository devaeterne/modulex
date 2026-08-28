import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(here, "..");
const repoRoot = path.resolve(adminRoot, "..");
const readAdmin = (relative) => readFile(path.join(adminRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

const [route, panel, customerPage, mailer, migration] = await Promise.all([
  readAdmin("src/app/api/admin/dealer-portal/route.ts"),
  readAdmin("src/components/customers/DealerPortalAccessCard.tsx"),
  readAdmin("src/app/(admin)/customers/[id]/page.tsx"),
  readAdmin("src/lib/email/dealer-portal.ts"),
  readRepo("modulex-store/supabase/migrations/20260828200000_dealer_portal_activation_lifecycle.sql"),
]);

assert.match(route, /requireAdmin\(request\)/, "dealer portal API must use the Admin gate");
assert.match(route, /account_type:\s*["']dealer_portal["']/, "dealer Auth users must get trusted dealer app metadata");
assert.match(route, /auth\.admin\.createUser/, "dealer Auth users must be created server-side");
assert.match(route, /auth\.admin\.generateLink/, "dealer activation links must be generated server-side");
assert.match(route, /type:\s*["']recovery["']/, "activation must use an action link for the already-created trusted Auth user");
assert.doesNotMatch(route, /inviteUserByEmail/, "dealer activation must not rely on user_metadata-only inviteUserByEmail");
assert.match(route, /portal_enabled/, "invite flow must guard disabled customers");
assert.match(route, /never_invited/, "new portal users must start never_invited");
assert.match(route, /suspended/, "lifecycle must support suspension");
assert.match(route, /activated_at/, "restore must account for prior activation");
assert.match(route, /auth_user_id/, "lifecycle must bind and validate the Auth user");
assert.match(route, /customer_activity/, "portal lifecycle must append customer activity");

assert.match(customerPage, /DealerPortalAccessCard/, "customer page must surface the secure dealer lifecycle panel");
assert.match(panel, /\/api\/admin\/dealer-portal/, "Admin lifecycle UI must call the server API");
assert.doesNotMatch(panel, /portalForm\.status/, "secure Admin lifecycle UI must not expose a mutable status field");
assert.match(panel, /Resend Invite/, "Admin UI must expose resend for pending invitations");
assert.match(panel, /Suspend/, "Admin UI must expose suspension");
assert.match(panel, /Restore/, "Admin UI must expose restore");
assert.match(panel, /Set Primary/, "Admin UI must expose primary-user management");
assert.match(panel, /Remove Draft/, "only never-invited drafts should be removable");

assert.match(migration, /revoke insert, update, delete on table public\.customer_portal_users from authenticated/i, "browser-authenticated users must not mutate portal lifecycle rows directly");
assert.match(mailer, /RESEND_API_KEY/, "dealer activation mail must remain server-side");
assert.match(mailer, /activation/i, "dealer mail must contain activation copy");

console.log("dealer portal admin contract: ok");
