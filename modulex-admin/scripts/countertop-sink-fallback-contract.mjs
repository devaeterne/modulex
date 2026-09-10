import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const legacyMigrationPath = "../modulex-store/supabase/migrations/20260903030000_countertop_sink_manual_fallback.sql";
const zeroPriceFixMigrationPath = "../modulex-store/supabase/migrations/20260908164000_countertop_sink_zero_price_fallback.sql";
const multiFixtureMigrationPath = "../modulex-store/supabase/migrations/20260909193000_countertop_manual_services_material_cost.sql";
const backsplashMigrationPath = "../modulex-store/supabase/migrations/20260909210000_countertop_backsplash_multi.sql";

assert(configurator.includes('import SearchableSelect from "@/components/form/SearchableSelect"'), "Countertop Stone/fixture selection must use the shared searchable dropdown primitive");
assert((configurator.match(/<SearchableSelect/g) ?? []).length >= 2, "Countertop Stone and fixture fields must render searchable dropdowns");
assert(configurator.includes('searchPlaceholder="Search stone by name or SKU"'), "Stone search must be discoverable by name/SKU inside its dropdown");
const hasExplicitSinkSearch = configurator.includes('searchPlaceholder="Search sink by name or SKU"');
const hasFixtureTypeSearch = configurator.includes('searchPlaceholder={`Search ${row.fixture_type} by name or SKU`}');
assert(hasExplicitSinkSearch || hasFixtureTypeSearch, "Sink search must be discoverable by name/SKU inside its dropdown");

for (const token of [
  "type FixtureRow",
  "manual_unit_price",
  "fixturePayload",
  "MANUAL_SINK_PRICE_CONTRACT",
  "Manual fallback (optional)",
  "Used only when no positive group price exists.",
  "parseDbDecimal(fixture.manual_unit_price,MANUAL_SINK_PRICE_CONTRACT)",
  'rpc("calculate_countertop_price_multi_v2"',
  "p_fixtures:fixturePayload()",
  'rpc("attach_countertop_configuration_multi_v2"',
  'rpc("create_and_attach_countertop_order_item_multi_v2"',
]) assert(configurator.includes(token), `Current multi-fixture Sink fallback contract missing: ${token}`);
assert(configurator.includes("precision: 18") && configurator.includes("scale: 4"), "Manual Sink fallback must preserve numeric(18,4) precision");
assert(configurator.includes('row.fixture_type==="sink"&&row.source==="modulex"&&row.manual_unit_price'), "Only Modulex Sink rows may send a manual fallback price");

assert(fs.existsSync(path.join(root, legacyMigrationPath)), "Legacy Countertop Sink fallback migration is missing");
const legacyMigration = read(legacyMigrationPath);
assert(/manual_sink_price\s+numeric\(18,4\)/i.test(legacyMigration), "Legacy Sink fallback persistence must remain numeric(18,4)");
assert(legacyMigration.includes("calculate_countertop_price_with_sink_fallback"), "Legacy single-Sink pricing compatibility RPC must remain available");

assert(fs.existsSync(path.join(root, zeroPriceFixMigrationPath)), "Legacy zero-valued active Sink price hardening migration is missing");
const zeroPriceFixMigration = read(zeroPriceFixMigrationPath);
assert(/pp\.amount\s*>\s*0/i.test(zeroPriceFixMigration), "Legacy Sink pricing must treat only positive active prices as canonical priced values");
assert(zeroPriceFixMigration.includes("Sink has no positive active price for this price group. Enter a manual Sink fallback price."), "Legacy zero-priced Sinks without fallback must fail closed");

assert(fs.existsSync(path.join(root, multiFixtureMigrationPath)), "Current multi-fixture Countertop pricing migration is missing");
const multiFixtureMigration = read(multiFixtureMigrationPath);
for (const token of [
  "countertop_configuration_fixtures",
  "manual_unit_price numeric(18,4)",
  "calculate_countertop_price_multi",
  "p_fixtures jsonb",
  "pp.amount>0",
  "v_type='sink' and v_manual is not null and v_manual>0",
  "v_price_source := 'manual_fallback'",
  "Sink has no positive active price for this price group. Enter a manual Sink fallback price.",
  "'manual_unit_price',case when v_price_source='manual_fallback' then v_manual else null end",
  "'price_source',v_price_source",
]) assert(multiFixtureMigration.includes(token), `Multi-fixture Sink fallback persistence/pricing contract missing: ${token}`);
assert(multiFixtureMigration.includes("revoke all on table public.countertop_configuration_fixtures from public, anon"), "Fixture persistence must stay inaccessible to anon/PUBLIC mutation paths");

assert(fs.existsSync(path.join(root, backsplashMigrationPath)), "Current Countertop v2 wrapper migration is missing");
const backsplashMigration = read(backsplashMigrationPath);
assert(backsplashMigration.includes("create or replace function public.calculate_countertop_price_multi_v2"), "Current Countertop pricing wrapper must exist");
assert(backsplashMigration.includes("v_base := public.calculate_countertop_price_multi("), "Current v2 pricing must delegate fixture pricing to the authoritative multi-fixture RPC");
assert(/calculate_countertop_price_multi\([\s\S]*p_fixtures[\s\S]*\);/i.test(backsplashMigration), "Current v2 pricing must forward fixture payloads to multi-fixture pricing");
assert(backsplashMigration.includes("revoke all on function public.calculate_countertop_price_multi_v2") && backsplashMigration.includes("from public, anon"), "Current v2 pricing RPC must deny PUBLIC/anon execute");
assert(backsplashMigration.includes("grant execute on function public.calculate_countertop_price_multi_v2") && backsplashMigration.includes("to authenticated"), "Current v2 pricing RPC must remain authenticated-only");

console.log("Countertop multi-fixture Sink search + manual fallback contract: PASS");
