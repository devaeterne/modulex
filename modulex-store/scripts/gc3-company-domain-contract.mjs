import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");
const migrationNames = fs.readdirSync(migrationsDir).filter((name) => name.endsWith("_gc3_company_domain.sql"));

assert.equal(migrationNames.length, 1, "exactly one GC-3 migration must exist");
const sql = fs.readFileSync(path.join(migrationsDir, migrationNames[0]), "utf8");

for (const table of ["company_contact_channels", "company_locations", "company_location_hours"]) {
  assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`, "i"));
}

assert.match(sql, /create or replace function store_api_private\.get_store_public_company_locations\(\)/i);
assert.match(sql, /security definer/i);
assert.match(sql, /create or replace function public\.get_store_public_company_locations\(\)/i);
assert.match(sql, /revoke all on function public\.get_store_public_company_locations\(\) from public/i);
assert.match(sql, /grant execute on function public\.get_store_public_company_locations\(\) to anon, authenticated/i);
assert.doesNotMatch(sql, /insert\s+into\s+public\.company_locations/i, "migration must not seed a location/showroom");
assert.doesNotMatch(sql, /insert\s+into\s+public\.company_location_hours/i, "migration must not seed business hours");

console.log("GC-3 company domain contract passed");
