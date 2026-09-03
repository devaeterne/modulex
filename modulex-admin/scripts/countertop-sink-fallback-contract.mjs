import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const migrationPath = "../modulex-store/supabase/migrations/20260903030000_countertop_sink_manual_fallback.sql";

assert(configurator.includes('import SearchableSelect from "@/components/form/SearchableSelect"'), "Countertop Stone/Sink selection must use the shared searchable dropdown primitive");
assert((configurator.match(/<SearchableSelect/g) ?? []).length >= 2, "Countertop Stone and Sink fields must both render searchable dropdowns");
assert(configurator.includes('searchPlaceholder="Search stone by name or SKU"'), "Stone search must be discoverable by name/SKU inside its dropdown");
assert(configurator.includes('searchPlaceholder="Search sink by name or SKU"'), "Sink search must be discoverable by name/SKU inside its dropdown");
assert(configurator.includes("manualSinkPrice"), "Countertop configurator must keep manual Sink fallback price state");
assert(configurator.includes("Manual sink price fallback"), "Countertop configurator must label the manual Sink fallback clearly");
assert(configurator.includes('rpc("calculate_countertop_price_with_sink_fallback"'), "Countertop preview must use the server-authoritative Sink fallback pricing RPC");
assert(configurator.includes("p_manual_sink_price"), "Countertop preview must pass the normalized manual Sink fallback price");
assert(configurator.includes("parseDbDecimal"), "Manual Sink fallback must use the shared DB decimal validator");
assert(configurator.includes("precision: 18") && configurator.includes("scale: 4"), "Manual Sink fallback must preserve numeric(18,4) precision");

assert(fs.existsSync(path.join(root, migrationPath)), "Countertop Sink fallback migration is missing");
const migration = read(migrationPath);
assert(/manual_sink_price\s+numeric\(18,4\)/i.test(migration), "Manual Sink fallback must be persisted as numeric(18,4)");
assert(migration.includes("calculate_countertop_price_with_sink_fallback"), "Migration must define the dedicated Sink fallback pricing RPC");
assert(migration.includes("p_manual_sink_price numeric"), "Sink fallback pricing RPC must accept a typed numeric input");
assert(migration.includes("p_manual_sink_price <= 0"), "Manual Sink fallback must reject zero and negative prices");
assert(migration.includes("if v_sink is null and p_manual_sink_price is not null"), "Manual Sink fallback may only run when no canonical Sink price exists");
assert(migration.includes("'price_group'") && migration.includes("'manual_fallback'"), "Sink pricing snapshot must distinguish canonical and fallback price sources");
assert(migration.includes("manual_sink_price = case"), "Attach RPC must persist a manual Sink price only when the fallback was actually used");
assert(migration.includes("update of edge_profile_id, sink_product_id, price_group_id, sqft, edge_linear_ft, slab_quantity, manual_price_per_sqft, manual_sink_price"), "Snapshot trigger must refresh when manual Sink fallback changes");
assert(migration.includes("revoke all on function public.calculate_countertop_price_with_sink_fallback"), "New public pricing RPC must not inherit PUBLIC execute");
assert(migration.includes("grant execute on function public.calculate_countertop_price_with_sink_fallback") && migration.includes("to authenticated"), "New public pricing RPC must grant execute only to authenticated callers");

console.log("Countertop Sink search + manual fallback contract: PASS");
