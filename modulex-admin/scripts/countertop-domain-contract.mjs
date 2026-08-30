import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const sql = read("sql/countertop-stone-sink-domain.sql");
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
assert(sql.includes("calculate_countertop_price") && sql.includes("set search_path = pg_catalog, public"), "server-side pricing RPC must be pinned and present");
assert(sql.includes("attach_countertop_configuration") && sql.includes("security definer"), "snapshot mutation must use an explicit reviewed server boundary");
for (const name of ["Regular Removal", "Granite Removal", "Kitchen Sink Plumbing", "Bathroom Sink Plumbing", "Outlet Cutout", "Kitchen Sink Cutout", "Bathroom Sink Cutout"]) assert(sql.includes(name), `${name} reference service must be seeded`);
assert(configurator.includes("calculate_countertop_price") && configurator.includes("attach_countertop_configuration"), "Admin configurator must use server-side pricing and snapshot RPCs");
console.log("Countertop / Stone / Sink domain contract: PASS");
