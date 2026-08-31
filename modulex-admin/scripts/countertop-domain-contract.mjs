import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const sql = read("sql/countertop-stone-sink-domain.sql");
const migration = read("../modulex-store/supabase/migrations/20260831130000_countertop_stone_sink_mvp.sql");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const source = ts.transpileModule(read("src/lib/countertop/domain.ts"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, baseUrl: "." } }).outputText;
const validation = ts.transpileModule(read("src/lib/validation.ts"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const combined = source.replace('from "@/lib/validation"', `from "data:text/javascript,${encodeURIComponent(validation)}"`);
const { calculateCountertopPrice } = await import(`data:text/javascript,${encodeURIComponent(combined)}`);

const result = calculateCountertopPrice({ materialUnitPrice: "34.0000", sqft: "10.0000", edgeUnitPrice: "10.0000", edgeLinearFt: "8.0000", sinkPrice: "400.0000", services: [{ id: "removal", name: "Regular Removal", pricing_method: "flat", unit_price: "250.0000", quantity: "1" }] });
assert(result.material_subtotal === "340.0000", "square-foot material pricing must be exact");
assert(result.edge_subtotal === "80.0000", "linear-foot edge pricing must be exact");
assert(result.services_subtotal === "250.0000" && result.subtotal === "1070.0000", "pricing breakdown must reconcile");
for (const bad of [{ sqft: "0" }, { sqft: "-1" }, { sqft: "1.23456" }]) {
  let rejected = false;
  try { calculateCountertopPrice({ materialUnitPrice: "34", sqft: bad.sqft }); } catch { rejected = true; }
  assert(rejected, `invalid sqft ${bad.sqft} must reject`);
}
assert(sql.includes("unit = 'slab'") || sql.includes("SLAB"), "SLAB inventory contract must be documented");
assert(sql.includes("inventory") && sql.includes("reserved_quantity"), "existing quantity reservation semantics must remain the inventory boundary");
assert(sql.includes("countertop_configurations") && sql.includes("pricing_snapshot"), "immutable countertop snapshot table must exist");
assert(sql.includes("countertop_material_price_bands") && sql.includes("countertop_stone_product_profiles"), "stone material bands and product profiles must be relational");
for (const key of ["manual_override", "edge_profile_id", "commercial_price_group_id", "service_id", "applicable_measure", "totals"]) assert(sql.includes(key), `snapshot field ${key} missing`);
assert(sql.includes("edge_profile_id=excluded.edge_profile_id") && sql.includes("p_edge_profile_id,p_sqft"), "attach RPC must persist the authoritative edge reference");
assert(sql.includes("service_selection") && configurator.includes("service_selection"), "selected service references must be persisted for snapshot enrichment");
for (const [code, price] of [["B1",34],["R1",45],["R22",150]]) assert(sql.includes(`'${code}',${price}`), `${code} material band seed missing`);
assert(sql.includes("slab_quantity") && sql.includes("countertop_reservation_quantity"), "commercial quantity and slab reservation quantity must be distinct");
assert(!sql.includes("reserve_countertop_slab_delta") && !sql.includes("countertop_slab_reservation"), "countertop must not create a second reservation engine");
assert(migration.includes("coalesce(v_item.countertop_reservation_quantity, v_item.quantity)") && migration.includes("reserve_customer_order_item_stock"), "canonical reservation target must include slab quantity");
assert(sql.includes("product_kind","sink") || sql.includes("product_kind"), "sink domain identity must be validated");
assert(migration.includes("countertop_material_price_bands") && migration.includes("attach_countertop_configuration"), "canonical timestamped migration must contain the domain");
assert(sql.includes("calculate_countertop_price") && /set search_path\s*=\s*pg_catalog\s*,\s*public/.test(sql), "server-side pricing RPC must be pinned and present");
assert(sql.includes("attach_countertop_configuration") && sql.includes("security definer"), "snapshot mutation must use an explicit reviewed server boundary");
for (const name of ["Regular Removal", "Granite Removal", "Kitchen Sink Plumbing", "Bathroom Sink Plumbing", "Outlet Cutout", "Kitchen Sink Cutout", "Bathroom Sink Cutout"]) assert(sql.includes(name), `${name} reference service must be seeded`);
assert(configurator.includes("calculate_countertop_price") && configurator.includes("attach_countertop_configuration"), "Admin configurator must use server-side pricing and snapshot RPCs");
assert(configurator.includes("Stone type") && configurator.includes("Material price band") && configurator.includes("Additional services"), "configurator must use managed reference selectors");
assert(sql.includes("upsert_countertop_reference") && sql.includes("Countertop reference management requires admin permission"), "reference CRUD must use an authorized server boundary");
for (const text of ["Stone type name is required", "Material band code already exists", "valid pricing method", "Product, stone type and material band are required", "on conflict(id) do update", "is_active"]) assert(sql.includes(text), `reference validation/soft lifecycle missing: ${text}`);
assert(fs.existsSync(path.join(root, "src/app/(admin)/pricing/countertop/settings/page.tsx")) && configurator.includes("Material price band"), "reference management route/configurator integration missing");
const refs = read("src/components/countertop/CountertopReferenceManager.tsx");
for (const field of ["Stone Product Profiles", "Product", "Stone type", "Material band", "Vendor", "Source", "Save mapping"]) assert(refs.includes(field), `stone profile management field missing: ${field}`);
assert(!/<label>Material price band<Select/.test(configurator) && configurator.includes("price_per_sqft"), "configurator material band must be profile-derived and read-only");
assert(!configurator.includes("bandId") && !configurator.includes("setBandId"), "configurator must not keep editable material band state");
assert(!configurator.includes('from("countertop_material_price_bands")'), "configurator must not independently query material price bands");
assert(configurator.includes("material_price_band_code") && configurator.includes("countertop_material_price_bands(code,price_per_sqft)"), "selected stone profile must supply material band code and price");
assert(configurator.includes("Select a stone to view its material price band."), "configurator must explain missing profile-derived material band");
assert(sql.includes("audit_countertop_reference_change") && sql.includes("countertop_profiles_audit") && sql.includes("changed_by"), "countertop reference mutations must use audit_logs actor mechanism");
assert(refs.includes("toggleProfile(row)") && refs.includes("p_product_id: row.product_id") && refs.includes("p_is_active: !row.is_active"), "profile toggle must pass row values directly without stale state");
assert(refs.includes("value={drafts.profile?.product_id") && refs.includes("value={drafts.profile?.stone_type_id") && refs.includes("value={drafts.profile?.material_price_band_id"), "profile edit selectors must hydrate selected values");
assert(/countertop_stone_types.*eq\("is_active",true\)/.test(refs) && /countertop_material_price_bands.*eq\("is_active",true\)/.test(refs), "new profile selectors must use active references");
assert(sql.includes("audit_logs(table_name,record_id,action,old_data,new_data,changed_by)") && sql.includes("created_at"), "audit contract must preserve audit_logs created_at timestamp");
const serviceInput = { materialUnitPrice: "34", sqft: "10", edgeUnitPrice: "10", edgeLinearFt: "8", services: [{ id: "sq", name: "Sq", pricing_method: "sq_ft", unit_price: "2", quantity: "3" }, { id: "lf", name: "Lf", pricing_method: "linear_ft", unit_price: "3", quantity: "2" }, { id: "flat", name: "Flat", pricing_method: "flat", unit_price: "5", quantity: "9" }] };
assert(calculateCountertopPrice(serviceInput).services_subtotal === "49.0000", "service pricing methods must use sqft/linear-ft/flat semantics");
console.log("Countertop / Stone / Sink domain contract: PASS");
