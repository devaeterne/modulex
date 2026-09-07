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
const permissions = await readFile(
  path.join(root, "src/lib/auth/permissions.ts"),
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

// User-management mutations are intentionally available to Admin and Super Admin.
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
