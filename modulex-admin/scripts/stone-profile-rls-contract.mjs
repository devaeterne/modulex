import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const migration = read(
  "../modulex-store/supabase/migrations/20260903160000_countertop_stone_profile_admin_write_policies.sql"
);
const stoneApproval = read("src/lib/vendor-catalog/stone-approve.ts");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");

assert.match(migration, /alter table public\.countertop_stone_product_profiles enable row level security/i);
assert.match(migration, /create policy countertop_profile_admin_insert[\s\S]*?for insert[\s\S]*?to authenticated[\s\S]*?with check/i);
assert.match(migration, /create policy countertop_profile_admin_update[\s\S]*?for update[\s\S]*?using[\s\S]*?with check/i);
assert.match(migration, /create policy countertop_profile_admin_delete[\s\S]*?for delete[\s\S]*?using/i);

for (const policy of ["countertop_profile_admin_insert", "countertop_profile_admin_update", "countertop_profile_admin_delete"]) {
  const start = migration.indexOf(`create policy ${policy}`);
  assert.notEqual(start, -1, `${policy} must exist`);
  const next = migration.indexOf("create policy ", start + 1);
  const block = migration.slice(start, next === -1 ? migration.length : next);
  assert.match(block, /current_user_has_any_role\(array\['super_admin','admin'\]\)/i, `${policy} must be admin-only`);
  assert.doesNotMatch(block, /\b(sales|warehouse|shipping|anon)\b/i, `${policy} must not broaden Stone profile writes`);
}

assert.doesNotMatch(migration, /disable row level security/i);
assert.doesNotMatch(migration, /security definer/i);

// Approved vendor Stone products remain Product Type STONE with an independent
// Stone Type profile (for example STONE -> Marble), which is what Countertop
// filters on when choosing a Stone Type.
assert.match(stoneApproval, /stone_type_id:\s*item\.stone_type_id/);
assert.match(configurator, /\.eq\("stone_type_id",\s*stoneTypeId\)/);

console.log("stone profile RLS contract: ok");
