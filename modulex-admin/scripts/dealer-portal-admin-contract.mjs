import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [route, customerCard, mailer] = await Promise.all([
  read("src/app/api/admin/dealer-portal/route.ts"),
  read("src/components/customers/CustomerCard.tsx"),
  read("src/lib/email/dealer-portal.ts"),
]);

assert.match(route, /requireAdmin\(request\)/, "dealer portal API must use the Admin gate");
assert.match(route, /account_type:\s*["']dealer_portal["']/, "dealer Auth users must get trusted dealer app metadata");
assert.match(route, /auth\.admin\.createUser/, "dealer Auth users must be created server-side");
assert.match(route, /auth\.admin\.generateLink/, "dealer invites must use a generated activation link");
assert.doesNotMatch(route, /inviteUserByEmail/, "dealer invite must not rely on user_metadata-only inviteUserByEmail");
assert.match(route, /portal_enabled/, "invite flow must guard disabled customers");
assert.match(route, /never_invited/, "new portal users must start never_invited");
assert.match(route, /suspended/, "lifecycle must support suspension");
assert.match(route, /activated_at/, "restore must account for prior activation");
assert.match(route, /auth_user_id/, "lifecycle must bind and validate the Auth user");
assert.match(route, /customer_activity/, "portal lifecycle must append customer activity");

assert.doesNotMatch(customerCard, /<option value=["']active["']>Active<\/option>/, "Admin UI must not manually set active status");
assert.doesNotMatch(customerCard, /portalForm\.status/, "Admin UI must not expose a mutable status field");
assert.match(customerCard, /\/api\/admin\/dealer-portal/, "Admin UI must call the server lifecycle API");
assert.match(customerCard, /Resend Invite/, "Admin UI must expose resend for invited users");
assert.match(customerCard, /Suspend/, "Admin UI must expose suspension");
assert.match(customerCard, /Restore/, "Admin UI must expose restore");
assert.match(customerCard, /Set Primary/, "Admin UI must expose primary-user management");

assert.match(mailer, /RESEND_API_KEY/, "dealer invite mail must remain server-side");
assert.match(mailer, /activation/i, "dealer invite mail must contain activation copy");

console.log("dealer portal admin contract: ok");
