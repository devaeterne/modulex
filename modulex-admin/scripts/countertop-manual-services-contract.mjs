import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const migrationPath = "../modulex-store/supabase/migrations/20260909203000_countertop_manual_services_material_cost.sql";
const migrationExists = fs.existsSync(path.join(root, migrationPath));
const migration = migrationExists ? read(migrationPath) : "";
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const references = read("src/components/countertop/CountertopReferenceManager.tsx");

assert(migrationExists, "Manual Countertop services/material cost migration must exist");
for (const token of [
  "pricing_mode",
  "service_role",
  "manual_per_order",
  "manual_unit_price",
  "material_cost_subtotal",
  "New Garbage Disposal Install",
  "New Cooktop Install",
  "New Dishwasher Install",
]) {
  assert(migration.includes(token), `Countertop migration contract missing: ${token}`);
}
assert(migration.includes("upsert_countertop_service"), "Manual service admin mutation must use a dedicated authorized RPC");
assert(migration.includes("current_user_has_any_role"), "Manual service admin mutation must preserve admin authorization");
assert(migration.includes("service_role = 'material_cost'") || migration.includes("'material_cost'"), "Material Cost must have an explicit hidden pricing-component role");

assert(configurator.includes('select("id,name,pricing_method,unit_price,pricing_mode,service_role")'), "Configurator must load service pricing mode and role");
assert(configurator.includes("materialCost"), "Configurator must keep a dedicated Material Cost state");
assert(configurator.includes('label="Material Cost (optional)"'), "Configurator must expose Material Cost next to material pricing inputs");
assert(configurator.includes("manual_unit_price"), "Configurator must send per-order manual service prices to server pricing");
assert(configurator.includes("pricing_mode === \"manual_per_order\""), "Configurator must render manual-per-order service pricing semantics");
assert(configurator.includes("service_role === \"material_cost\""), "Configurator must keep Material Cost out of Additional Services while pricing it authoritatively");
assert(configurator.includes("material_cost_subtotal"), "Price Summary must expose Material Cost separately from services");

assert(references.includes("pricing_mode"), "Additional Services admin must expose pricing mode");
assert(references.includes('value: "manual_per_order"'), "Additional Services admin must offer Manual per order pricing");
assert(references.includes('rpc("upsert_countertop_service"'), "Additional Services admin must use the manual-service-aware RPC");
assert(references.includes("Manual per order"), "Manual services must not be presented as a $0 standard price");

console.log("Countertop manual services/material cost contract: PASS");
