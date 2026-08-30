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

console.log("admin users contract: ok");
