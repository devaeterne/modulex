import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const usersRoute = await readFile(
  path.join(root, "src/app/api/admin/users/route.ts"),
  "utf8"
);
const usersTable = await readFile(
  path.join(root, "src/components/users/UsersTable.tsx"),
  "utf8"
);
const authenticatedFetch = await readFile(
  path.join(root, "src/lib/auth/authenticated-fetch.ts"),
  "utf8"
);
const adminApi = await readFile(
  path.join(root, "src/lib/auth/admin-api.ts"),
  "utf8"
);
const permissions = await readFile(
  path.join(root, "src/lib/auth/permissions.ts"),
  "utf8"
);
const usrMigration = await readFile(
  path.join(
    root,
    "../modulex-store/supabase/migrations/20260910144000_usr_users_roles_closeout.sql"
  ),
  "utf8"
);

assert.match(
  usersRoute,
  /const users = data\.users\s*\.filter\(\(user\) => profileMap\.has\(user\.id\)\)\s*\.map/,
  "Admin user management must list only Auth identities backed by an Admin profile"
);
assert.doesNotMatch(
  usersRoute,
  /profile\?\.role\s*\?\?\s*["']warehouse["']/,
  "Profile-less Auth identities must never be presented as Warehouse users"
);
assert.doesNotMatch(
  usersRoute,
  /profile\?\.is_active\s*\?\?\s*true/,
  "Profile-less Auth identities must never be presented as active Admin users"
);
assert.match(
  usersRoute,
  /total:\s*users\.length/,
  "Admin user totals must be based on the filtered Admin user collection"
);

// USR-A1: API authorization must match the canonical permission matrix, not merely a staff/admin shell guard.
assert.match(
  usersRoute,
  /requirePermission\(request,\s*["']users\.view["']\)/,
  "User listing must enforce users.view at the API boundary"
);
assert.ok(
  (usersRoute.match(/requirePermission\(request,\s*["']users\.manage["']\)/g) ?? []).length >= 3,
  "Create/update/delete user mutations must enforce users.manage at the API boundary"
);
assert.doesNotMatch(
  usersRoute,
  /const auth = await requireAdmin\(request\)/,
  "Users API must not rely on the coarse Admin guard"
);
assert.match(
  permissions,
  /sales:\s*\[[\s\S]*?(?=\n\s*finance:)/,
  "RBAC matrix must keep Sales distinct from Admin/Super Admin"
);
assert.equal(
  /sales:\s*\[[\s\S]*?["']users\.manage["'][\s\S]*?(?=\n\s*finance:)/.test(permissions),
  false,
  "Negative-role contract: Sales must not gain users.manage"
);

// User-management mutations are intentionally available only to Admin and Super Admin.
assert.match(
  permissions,
  /export function isAdminRole\([\s\S]*role === ["']super_admin["'] \|\| role === ["']admin["']/,
  "Admin authorization must include both admin and super_admin roles"
);
assert.match(
  usersRoute,
  /if \(action === ["']set_password["']\)[\s\S]*updateUserById\(userId, \{[\s\S]*password/,
  "Admin users route must support setting a password through the server-side Auth admin client"
);
assert.match(
  usersRoute,
  /targetIsSuperAdmin && !actorIsSuperAdmin[\s\S]*403/,
  "Admin must remain blocked from modifying a protected Super Admin account"
);

// USR-A2/A4: DB owns the invariant and immutable role-change evidence.
assert.match(usrMigration, /pg_advisory_xact_lock/i, "Last Super Admin protection must serialize competing mutations");
assert.match(usrMigration, /last_effective_super_admin/i, "DB must expose a deterministic last-Super-Admin invariant error");
assert.match(usrMigration, /user_role_change_audit/i, "Role changes need a dedicated immutable audit trail");
for (const column of ["actor_user_id", "changed_at", "from_roles", "to_roles"]) {
  assert.ok(usrMigration.includes(column), `Role audit must capture ${column}`);
}
assert.match(
  usrMigration,
  /before update or delete[\s\S]*user_role_change_audit/i,
  "Role audit rows must be immutable at the database boundary"
);
assert.match(
  usrMigration,
  /admin_set_user_access/i,
  "Deactivation/reactivation and roles must share an atomic DB mutation boundary"
);
assert.match(
  usrMigration,
  /users_manage/i,
  "Role/access RPCs must independently authorize the actor in the database"
);
assert.match(
  usrMigration,
  /users_view/i,
  "RLS read policy must derive user visibility from the same role model"
);

// USR-A3: stale authenticated sessions must lose Admin access immediately after deactivation.
assert.match(
  adminApi,
  /if \(!typedProfile\.is_active\)[\s\S]*403/,
  "Every authenticated Admin API request must reject an inactive profile even with a still-valid Auth token"
);
assert.match(
  usersRoute,
  /action === ["']send_reset["'][\s\S]*resetPasswordForEmail[\s\S]*mode=recovery/,
  "Admin recovery must route through the canonical reset-password recovery flow"
);
assert.match(
  usersRoute,
  /inviteUserByEmail[\s\S]*mode=invite/,
  "Invitations must route through the canonical reset-password invite flow"
);

// A stale/revoked access token can surface as a transient 401 between valid Admin requests.
// Users must use the shared authenticated transport, and that transport may refresh/retry once.
assert.match(
  usersTable,
  /import \{ authenticatedFetch \} from ["']@\/lib\/auth\/authenticated-fetch["'];?/,
  "Users UI must use the shared authenticated fetch transport"
);
assert.doesNotMatch(
  usersTable,
  /async function authFetch\(/,
  "Users UI must not maintain a duplicate one-shot getSession bearer implementation"
);
assert.match(
  authenticatedFetch,
  /response\.status\s*===\s*401/,
  "Authenticated fetch must recognize an unauthorized response"
);
assert.match(
  authenticatedFetch,
  /supabase\.auth\.refreshSession\(\)/,
  "Authenticated fetch must refresh the browser session after a 401"
);
assert.match(
  authenticatedFetch,
  /refreshed[^\n]*access_token|refresh[^\n]*access_token/i,
  "Authenticated fetch must retry with the refreshed access token"
);

console.log("admin users contract: ok");
