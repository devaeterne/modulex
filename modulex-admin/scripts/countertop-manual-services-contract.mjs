import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const migrationPath = "../modulex-store/supabase/migrations/20260909193000_countertop_manual_services_material_cost.sql";
const migrationExists = fs.existsSync(path.join(root, migrationPath));
const migration = migrationExists ? read(migrationPath) : "";
const faucetCompatPath = "../modulex-store/supabase/migrations/20260909200500_countertop_faucet_zero_price_compat.sql";
const faucetCompatExists = fs.existsSync(path.join(root, faucetCompatPath));
const faucetCompat = faucetCompatExists ? read(faucetCompatPath) : "";
const snapshotCompatPath = "../modulex-store/supabase/migrations/20260909201000_countertop_multi_snapshot_compat.sql";
const snapshotCompatExists = fs.existsSync(path.join(root, snapshotCompatPath));
const snapshotCompat = snapshotCompatExists ? read(snapshotCompatPath) : "";
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const references = read("src/components/countertop/CountertopReferenceManager.tsx");
const summary = read("src/lib/customers/countertop-summary.ts");

assert(migrationExists, "Countertop multi-fixture/manual pricing migration must exist");
for (const token of [
  "countertop_configuration_fixtures",
  "fixture_type",
  "quantity > 0",
  "manual_unit_price",
  "price_entry_mode",
  "material_cost",
  "calculate_countertop_price_multi",
  "attach_countertop_configuration_multi",
  "create_and_attach_countertop_order_item_multi",
  "v_product.code<>'SINK'",
  "v_product.code<>'FUCST'",
  "on conflict do nothing",
  "New Garbage Disposal Install",
  "New Cooktop Install",
  "New Dishwasher Install",
]) assert(migration.includes(token), `Countertop migration contract missing: ${token}`);

assert(migration.includes("alter column material_price_band_id drop not null"), "Manual Stone profile/configuration must permit a pending default band");
assert(migration.includes("join public.countertop_stone_types st") && migration.includes("st.is_active"), "Manual Stone pricing must fail closed on an invalid/inactive Stone Type");
assert(migration.includes("current_user_has_any_role"), "Countertop mutations must preserve role authorization");
assert(migration.includes("security definer") && migration.includes("security invoker"), "Countertop security boundary must remain explicit");
assert(faucetCompatExists, "Faucet zero-price legacy compatibility migration must exist");
assert(faucetCompat.includes("v_type <> 'sink' or pp.amount > 0"), "Only Sink must require a positive Product Price; Faucet must preserve legacy active zero-price behavior");
assert(snapshotCompatExists, "Multi-fixture snapshot compatibility migration must exist");
for (const token of ["trg_countertop_multi_snapshot_restore", "pricing_snapshot->'fixtures'", "manual_per_order", "Service already exists."]) {
  assert(snapshotCompat.includes(token), `Multi-fixture snapshot compatibility contract missing: ${token}`);
}

for (const token of [
  "Material Cost (optional)", "materialCost", "manual_unit_price", "price_entry_mode",
  "Add Sink", "Add Faucet", "fixturePayload", "countertop_configuration_fixtures",
  "calculate_countertop_price_multi", "attach_countertop_configuration_multi",
]) assert(configurator.includes(token), `Configurator contract missing: ${token}`);
assert(configurator.includes("materialBandId||manualPrice"), "A Stone without a default band must remain priceable through the existing manual $/sq-ft override");
assert(configurator.includes("Use quantity instead of adding the same"), "Duplicate Modulex fixture rows must be prevented in favor of quantity");

for (const token of ["Fixed Price", "Manual Per Order", "price_entry_mode", "upsert_countertop_service_reference"]) {
  assert(references.includes(token), `Additional Services admin contract missing: ${token}`);
}
assert(summary.includes("aggregateFixtures"), "Commercial/order summaries must aggregate normalized fixture snapshots");

console.log("Countertop multi-fixture/manual services/material cost contract: PASS");
