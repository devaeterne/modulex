import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(here, "..");
const repoRoot = path.resolve(adminRoot, "..");
const readAdmin = (relative) => readFile(path.join(adminRoot, relative), "utf8");
const readRepo = (relative) => readFile(path.join(repoRoot, relative), "utf8");

const [route, panel, customerPage, customerCard, mailer, migration] = await Promise.all([
  readAdmin("src/app/api/admin/dealer-portal/route.ts"),
  readAdmin("src/components/customers/CustomerPortalAccessCard.tsx"),
  readAdmin("src/app/(admin)/customers/[id]/page.tsx"),
  readAdmin("src/components/customers/CustomerCard.tsx"),
  readAdmin("src/lib/email/dealer-portal.ts"),
  readRepo("modulex-store/supabase/migrations/20260828200000_dealer_portal_activation_lifecycle.sql"),
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

console.log("dealer portal admin contract: ok");
