import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const catalog = read("src/components/countertop/CountertopCatalogManager.tsx");
const setup = read("src/components/countertop/CountertopReferenceManager.tsx");
const catalogPage = read("src/app/(admin)/pricing/countertop/catalog/page.tsx");
const setupPage = read("src/app/(admin)/pricing/countertop/settings/page.tsx");

for (const primitive of ["ComponentCard", "Label", "Input", "Select", "Alert", "Badge", "Button", "Modal", "TableViewport", "TableStateRow"]) {
  assert(catalog.includes(primitive), `Countertop Catalog must compose shared ${primitive}`);
  assert(setup.includes(primitive), `Countertop Setup must compose shared ${primitive}`);
}
assert(catalog.includes('rpc("save_countertop_catalog_product"'), "Catalog must preserve atomic product save RPC");
assert(catalog.includes('rpc("set_product_status"'), "Catalog status changes must preserve canonical lifecycle RPC");
assert(setup.includes('rpc("upsert_countertop_reference"'), "Setup must preserve canonical reference RPC");
assert(!setup.includes("Stone Product Profiles"), "Setup must not duplicate Stone Product Profile management");
assert(!setup.includes("saveProfile") && !setup.includes("toggleProfile"), "Setup must not keep duplicate profile mutation handlers");
assert(!setup.includes('from("countertop_stone_product_profiles")'), "Setup must not load Stone Product Profiles after Catalog becomes canonical operator surface");
assert(catalogPage.includes("PageBreadcrumb") && setupPage.includes("PageBreadcrumb"), "Countertop routes must preserve shared page heading convention");
for (const text of ["Add Stone", "Add Sink", "Stone Type", "Material Price Band", "Sink prices"]) assert(catalog.includes(text), `Countertop Catalog capability missing: ${text}`);

console.log("Countertop shared UI contract: PASS");
