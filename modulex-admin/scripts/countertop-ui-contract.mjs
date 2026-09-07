import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const catalog = read("src/components/countertop/CountertopCatalogManager.tsx");
const setup = read("src/components/countertop/CountertopReferenceManager.tsx");
const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const thumbnail = read("src/components/common/ProductImageThumbnail.tsx");
const catalogPage = read("src/app/(admin)/pricing/countertop/catalog/page.tsx");
const setupPage = read("src/app/(admin)/pricing/countertop/settings/page.tsx");
const countertopSummary = read("src/lib/customers/countertop-summary.ts");
const lineDetails = read("src/components/customers/CountertopLineDetails.tsx");
const servicesPagePath = "src/app/(admin)/pricing/countertop/services/page.tsx";
const servicesPageExists = fs.existsSync(path.join(root, servicesPagePath));
const servicesPage = servicesPageExists ? read(servicesPagePath) : "";
const customerProvidedMigrationPath = "../modulex-store/supabase/migrations/20260907200000_countertop_customer_provided_sink_snapshot.sql";
const customerProvidedMigrationExists = fs.existsSync(path.join(root, customerProvidedMigrationPath));
const customerProvidedMigration = customerProvidedMigrationExists ? read(customerProvidedMigrationPath) : "";

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

assert(
  catalog.includes('.from("store_product_content")') &&
    catalog.includes('.in("base_product_code"') &&
    catalog.includes('.from("store_product_media")') &&
    catalog.includes('.in("product_content_id"') &&
    catalog.includes('.eq("media_type", "image")'),
  "Countertop Catalog thumbnails must batch-load canonical Store product media without per-row queries"
);
assert(
  catalog.includes("productImages") &&
    catalog.includes("previewImage") &&
    catalog.includes("ProductImageThumbnail") &&
    catalog.includes('actionLabel={`View ${product.name} image`}') &&
    catalog.includes('ariaLabel="Countertop product image preview"'),
  "Countertop Catalog must render shared clickable product thumbnails with an accessible lightbox preview"
);
assert(
  catalog.includes('const visibleProducts = activeCatalog === "stone" ? pagedStones : pagedSinks;') &&
    catalog.includes("loadCatalogProductImages(visibleProducts)") &&
    !catalog.includes("loadCatalogProductImages(products)"),
  "Countertop Catalog must load thumbnail metadata only for the visible page instead of the full Stone/Sink catalog"
);
assert(
  thumbnail.includes('className="h-12 w-12 shrink-0 p-0"') &&
    thumbnail.includes('className="h-12 w-12 object-contain"'),
  "Shared product thumbnail must own the compact 48px Product List scan pattern"
);

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

// Additional Services is a first-class Admin-managed Countertop pricing surface.
assert(servicesPageExists, "Countertop Additional Services page must exist");
assert(servicesPage.includes("PageBreadcrumb") && servicesPage.includes('pageTitle="Additional Services"'), "Additional Services must use the shared page heading convention");
assert(servicesPage.includes("CountertopReferenceManager") && servicesPage.includes('kinds={["service"]}'), "Additional Services must reuse canonical Countertop reference management for service-only CRUD");
assert(setup.includes("kinds?: readonly ReferenceKind[]") && setup.includes("visibleConfigs"), "Countertop reference manager must support focused reference surfaces");
assert(setupPage.includes('href="/pricing/countertop/services"') && setupPage.includes("Manage Additional Services"), "Countertop Setup must link admins to Additional Services management");
assert(setupPage.includes('kinds={["stone_type", "material_band", "edge"]}'), "Countertop Setup must leave service management to the dedicated Additional Services page");

// Customer-provided sinks are project information, not a priced/inventory Sink line.
assert(configurator.includes('const CUSTOMER_PROVIDED_SINK_VALUE = "__customer_provided__"'), "Countertop Sink selector must define the customer-provided sentinel");
assert(configurator.includes('label: "Customer Provides"'), "Countertop Sink selector must expose Customer Provides");
assert(configurator.includes("selectedSinkProductId"), "Customer-provided Sink selection must map to a null canonical Sink product id");
assert(configurator.includes('sink_source: sinkId === CUSTOMER_PROVIDED_SINK_VALUE ? "customer_provided"'), "Customer-provided Sink selection must persist as configuration semantics");
assert(configurator.includes("customerProvidedSinkCatalogId"), "Customer-provided Sink details must optionally reference an existing Sink catalog product");
assert(configurator.includes("customerProvidedSinkNote"), "Customer-provided Sink details must allow free-text product/model notes");
assert(configurator.includes("customer_provided_sink_product_id"), "Saved Countertop configuration must snapshot an optional known customer-provided Sink product id");
assert(configurator.includes("customer_provided_sink_name"), "Saved Countertop configuration must snapshot the known customer-provided Sink name");
assert(configurator.includes("customer_provided_sink_sku"), "Saved Countertop configuration must snapshot the known customer-provided Sink SKU");
assert(configurator.includes("customer_provided_sink_note"), "Saved Countertop configuration must persist free-text customer-provided Sink details");
assert(customerProvidedMigrationExists, "Customer-provided Sink snapshot enrichment migration must exist");
assert(customerProvidedMigration.includes("configuration->>'sink_source' = 'customer_provided'"), "Snapshot enrichment must recognize customer-provided Sink semantics");
assert(customerProvidedMigration.includes("customer_provided_sink_note"), "Snapshot enrichment must preserve customer-provided Sink free text");
assert(customerProvidedMigration.includes("'name', 'Customer Provides'"), "Snapshot enrichment must expose Customer Provides through the existing Sink summary contract");
assert(lineDetails.includes("summary.sinkName"), "Order line details must continue rendering enriched Sink snapshots");
assert(countertopSummary.includes("summary.sinkName"), "Commercial print detail must continue rendering enriched Sink snapshots");

console.log("Countertop shared UI contract: PASS");
