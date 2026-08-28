import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [page, form, migration] = await Promise.all([
  read("src/app/dealer/activate/page.tsx"),
  read("src/app/dealer/activate/DealerActivationForm.tsx"),
  read("supabase/migrations/20260828200000_dealer_portal_activation_lifecycle.sql"),
]);

assert.match(page, /DealerActivationForm/, "activation route must render the activation form");
assert.match(form, /window\.location\.hash/, "activation must consume the implicit invite session from the URL fragment");
assert.match(form, /\/auth\/v1\/user/, "activation must update the authenticated dealer password");
assert.match(form, /activate_store_dealer_portal_user/, "activation must call the narrow lifecycle RPC");
assert.match(form, /\/auth\/v1\/logout/, "activation must invalidate the invite session after success");
assert.match(form, /history\.replaceState/, "activation must clear URL credentials");

assert.match(migration, /security definer/i, "activation boundary must be security definer behind a narrow wrapper");
assert.match(migration, /raw_app_meta_data\s*->>\s*'account_type'/, "activation must verify trusted dealer app metadata");
assert.match(migration, /cpu\.auth_user_id\s*=\s*v_user_id/, "activation must bind only the current Auth user");
assert.match(migration, /cpu\.status\s*=\s*'invited'/, "only invited accounts can activate");
assert.match(migration, /c\.portal_enabled\s*=\s*true/, "disabled customers must not activate");
assert.match(migration, /revoke execute .* from anon/i, "anon must not execute activation");
assert.match(migration, /grant execute .* to authenticated/i, "authenticated invite sessions may execute activation");

console.log("dealer portal activation contract: ok");
