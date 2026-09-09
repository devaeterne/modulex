import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const summary = read("src/lib/customers/countertop-summary.ts");
const migrationPath = "../modulex-store/supabase/migrations/20260909210000_countertop_backsplash_multi.sql";

assert(exists(migrationPath), "Countertop backsplash migration must exist");
const migration = exists(migrationPath) ? read(migrationPath) : "";

for (const token of [
  "create table if not exists public.countertop_configuration_backsplashes",
  "configuration_id uuid not null references public.countertop_configurations(id) on delete cascade",
  "height_mode text not null",
  "linear_ft numeric",
  "height_inches numeric",
  "sqft numeric",
  "top_edge boolean",
  "edge_profile_id uuid",
  "edge_linear_ft numeric",
  "sort_order integer",
]) assert(migration.includes(token), `Backsplash persistence contract missing: ${token}`);

for (const mode of ["'1'","'2'","'3'","'4'","'5'","'6'","'7'","'8'","'9'","'10'","'full_height'"])
  assert(migration.includes(mode), `Backsplash height mode missing: ${mode}`);

for (const token of [
  "p_backsplashes jsonb default '[]'::jsonb",
  "Backsplashes must be an array.",
  "Backsplash linear feet must be greater than zero.",
  "Full Height backsplash requires a height greater than zero.",
  "v_backsplash_sqft",
  "/ 12",
  "'backsplashes'",
  "'backsplash_subtotal'",
  "delete from public.countertop_configuration_backsplashes",
  "insert into public.countertop_configuration_backsplashes",
]) assert(migration.includes(token), `Backsplash pricing/save contract missing: ${token}`);

assert(migration.includes("new.pricing_snapshot->'backsplash_subtotal'"), "Snapshot restore totals must preserve backsplash subtotal");
assert(migration.includes("public.countertop_edge_profiles"), "Backsplash polished top edge must use managed edge profiles");

for (const token of [
  "type BacksplashRow",
  "const BACKSPLASH_HEIGHT_OPTIONS",
  "Full Height",
  "Add Backsplash",
  "Linear feet",
  "Full height (inches)",
  "Polished top edge",
  "countertop_configuration_backsplashes",
  "backsplashPayload",
  "p_backsplashes:backsplashPayload()",
  "backsplash_subtotal",
]) assert(configurator.includes(token), `Countertop backsplash UI contract missing: ${token}`);

for (let height = 1; height <= 10; height += 1)
  assert(configurator.includes(`label: \"${height}\\\"\"`), `Backsplash selector must expose ${height} inch height`);

assert(configurator.includes("setBacksplashes((rows)=>[...rows,newBacksplash()])"), "Configurator must support adding multiple backsplash rows");
assert(summary.includes("Backsplash:") && summary.includes("backsplashes"), "Order Countertop summary must show backsplash selections");

console.log("Countertop multi-backsplash contract: PASS");
