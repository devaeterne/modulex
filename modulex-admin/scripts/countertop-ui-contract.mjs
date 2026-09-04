import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const catalog = read("src/components/countertop/CountertopCatalogManager.tsx");
const setup = read("src/components/countertop/CountertopReferenceManager.tsx");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const catalogPage = read("src/app/(admin)/pricing/countertop/catalog/page.tsx");
const setupPage = read("src/app/(admin)/pricing/countertop/settings/page.tsx");

for (const primitive of ["ComponentCard", "Label", "Input", "Select", "Alert", "Badge", "Button", "Modal", "TableViewport", "TableStateRow"]) {
  assert(catalog.includes(primitive), `Countertop Catalog must compose shared ${primitive}`);
  assert(setup.includes(primitive), `Countertop Setup must compose shared ${primitive}`);
}
for (const primitive of ["Dropdown", "DropdownItem"]) {
  assert(catalog.includes(primitive), `Countertop Catalog must compose shared ${primitive}`);
}
assert(catalog.includes('rpc("save_countertop_catalog_product"'), "Catalog must preserve atomic product save RPC");
assert(catalog.includes('rpc("set_product_status"'), "Catalog status changes must preserve canonical lifecycle RPC");
assert(setup.includes('rpc("upsert_countertop_reference"'), "Setup must preserve canonical reference RPC");
assert(!setup.includes("Stone Product Profiles"), "Setup must not duplicate Stone Product Profile management");
assert(!setup.includes("saveProfile") && !setup.includes("toggleProfile"), "Setup must not keep duplicate profile mutation handlers");
assert(!setup.includes('from("countertop_stone_product_profiles")'), "Setup must not load Stone Product Profiles after Catalog becomes canonical operator surface");
assert(catalogPage.includes("PageBreadcrumb") && setupPage.includes("PageBreadcrumb"), "Countertop routes must preserve shared page heading convention");
for (const text of ["Add Stone", "Add Sink", "Stone Type", "Material Price Band", "Sink prices"]) assert(catalog.includes(text), `Countertop Catalog capability missing: ${text}`);

assert(catalog.includes('role="tablist"'), "Catalog must expose Stones/Sinks as an accessible tab list");
assert(catalog.includes('role="tab"'), "Catalog tab triggers must expose tab semantics");
assert(catalog.includes('placeholder="Search catalog"'), "Catalog must provide active-catalog search");
assert(catalog.includes('placeholder="All statuses"'), "Catalog must provide status filtering");
assert(catalog.includes("PAGE_SIZE_OPTIONS"), "Catalog must provide page-size choices");
assert(catalog.includes("getPageNumbers"), "Catalog must provide bounded page navigation");
assert(catalog.includes("pagedStones") && catalog.includes("pagedSinks"), "Catalog must render paged Stone and Sink rows");
assert(catalog.includes('aria-label={`Actions for ${product.name}`}'), "Catalog row actions must use an accessible compact menu trigger");
assert(catalog.includes('["Stone", "Details", "Price Band", "Status", "Actions"]'), "Stone table must use the compact five-column scan model");
assert(catalog.includes('["Sink", "Brand", "Pricing", "Status", "Actions"]'), "Sink table must use the compact five-column scan model");
assert(!catalog.includes('priceGroups.map((group) => <TableCell key={group.id} isHeader'), "Sink table must not render one visible header per Price Group");
assert(catalog.includes("setCurrentPage(1)"), "Catalog filter and tab changes must be able to reset pagination");

assert(configurator.includes('import SectionTitle from "@/components/common/SectionTitle"'), "Countertop configurator section headings must use the shared SectionTitle tone");
assert(configurator.includes("<SectionTitle>Additional services</SectionTitle>"), "Additional services heading must use the shared dark-mode-safe SectionTitle");
assert(!configurator.includes('<h3 className="text-sm font-semibold">Additional services</h3>'), "Countertop configurator must not render a raw unthemed Additional services heading");
assert(!configurator.includes('<span>{orderContext.lineNo ? `Line ${orderContext.lineNo}` : "New countertop"}</span>'), "Countertop order context must not rely on inherited text color");
assert(!configurator.includes('<span className="text-sm font-semibold">{result.stone?.name ?? selectedStone?.name ?? "Selected stone"}</span>'), "Countertop price summary Stone label must not rely on inherited text color");
assert(configurator.includes('Badge color="light"'), "Countertop contextual labels must use semantic shared Badge tones");
assert(configurator.includes('import SearchableSelect from "@/components/form/SearchableSelect"'), "Countertop Stone/Sink selection must use the shared searchable dropdown primitive");
assert((configurator.match(/<SearchableSelect/g) ?? []).length >= 2, "Countertop Stone and Sink fields must both render searchable dropdowns");
assert(!configurator.includes('ariaLabel="Search stone by name or SKU"'), "Stone search must live inside its dropdown instead of as a separate field");
assert(!configurator.includes('ariaLabel="Search sink by name or SKU"'), "Sink search must live inside its dropdown instead of as a separate field");

console.log("Countertop shared UI contract: PASS");
