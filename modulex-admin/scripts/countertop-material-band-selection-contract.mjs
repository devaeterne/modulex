import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const migrationPath = "../modulex-store/supabase/migrations/20260901203000_countertop_material_band_selection.sql";
assert(fs.existsSync(path.join(root, migrationPath)), "material-band selection migration must exist");

const migration = read(migrationPath);
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");

assert(configurator.includes('from("countertop_material_price_bands")'), "configurator must load all active material price bands");
assert(configurator.includes("materialBandId") && configurator.includes("setMaterialBandId"), "configurator must keep an editable selected material band");
assert(configurator.includes("material_price_band_id") && configurator.includes("p_material_price_band_id: materialBandId"), "selected material band must flow to server pricing and attach RPCs");
assert(configurator.includes("Default for this stone") || configurator.includes("Stone default"), "configurator must explain the stone profile band as a default, not a lock");
assert(!configurator.includes("Select a stone to view its material price band."), "configurator must not present material band as read-only stone data");

for (const token of [
  "add column if not exists material_price_band_id",
  "p_material_price_band_id uuid",
  "countertop_material_price_bands",
  "mb.id = p_material_price_band_id",
  "material_price_band_id",
  "price_per_sqft",
  "public.calculate_countertop_price",
  "private.attach_countertop_configuration",
  "public.attach_countertop_configuration",
  "private.create_and_attach_countertop_order_item",
  "public.create_and_attach_countertop_order_item",
]) {
  assert(migration.includes(token), `material-band selection migration missing: ${token}`);
}

assert(migration.includes("sp.material_price_band_id"), "existing configurations must be backfilled from the stone profile default band");
assert(migration.includes("mb.is_active"), "server pricing must reject inactive material bands");
assert(migration.includes("'material_price_band_id'"), "pricing snapshot must retain selected material band identity");
assert(migration.includes("'material_price_band'"), "pricing snapshot must retain selected material band code");

console.log("Countertop material band selection contract: PASS");
