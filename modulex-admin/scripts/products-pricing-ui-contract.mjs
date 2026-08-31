import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const routes = [
  "src/app/(admin)/brands/page.tsx",
  "src/app/(admin)/categories/page.tsx",
  "src/app/(admin)/pricing/dashboard/page.tsx",
  "src/app/(admin)/pricing/products/page.tsx",
  "src/app/(admin)/pricing/groups/page.tsx",
];
for (const route of routes) expect(fs.existsSync(path.join(root, route)), `Missing audited route: ${route}`);

const brands = read(routes[0]);
const categories = read(routes[1]);
const taxonomy = read("src/components/products/TaxonomyManager.tsx");
const tablePrimitives = read("src/components/ui/table/index.tsx");
const dashboard = read("src/components/pricing/PricingDashboard.tsx");
const productPrices = read("src/components/pricing/ProductPricesServerTable.tsx");
const groups = read("src/components/pricing/PriceGroupsTable.tsx");
const storeProducts = read("src/components/store/StoreProductsTable.tsx");
const storeProductEditor = read("src/components/store/StoreProductEditor.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");

expect(brands.includes("TaxonomyManager") && categories.includes("TaxonomyManager"), "Brands/Categories must use the audited taxonomy manager");
expect(!taxonomy.includes("error.message") && !taxonomy.includes("window.confirm"), "Taxonomy UI must not expose raw errors or native confirm dialogs");
expect(taxonomy.includes("toLocaleDateString()"), "Taxonomy dates must use runtime locale");
expect(taxonomy.includes("TableViewport") && taxonomy.includes("min-w-[680px]") && tablePrimitives.includes("overflow-x-auto"), "Taxonomy tables need mobile-safe horizontal overflow");
expect(taxonomy.includes('role="dialog"') && taxonomy.includes('aria-live="polite"'), "Taxonomy destructive/error states need accessible UI");
expect(taxonomy.includes("focus-visible:ring-2") && taxonomy.includes("htmlFor"), "Taxonomy controls need labels and visible keyboard focus");

expect(dashboard.includes("filtersOpen") && dashboard.includes("getCurrentProfile"), "Pricing Dashboard must keep responsive filters and access loading");
expect(productPrices.includes("get_product_prices_page") && productPrices.includes("totalPages") && productPrices.includes("selectedIds"), "Product Prices must retain server pagination and bulk selection");
expect(groups.includes("getCurrentProfile") && groups.includes("isCreating") && groups.includes("reorderingId"), "Price Groups must retain access, action, and reorder states");
expect(storeProducts.includes("brand_name:product_brands(name)") && storeProducts.includes("category_name:product_categories(name)"), "Store product list must read canonical brand/category relations");
expect(storeProductEditor.includes("brand_name:product_brands(name)") && storeProductEditor.includes("category_name:product_categories(name)"), "Store product editor must read canonical brand/category relations");

for (const route of ["/brands", "/categories"]) {
  expect(sidebar.includes(`path: "${route}"`) && sidebar.includes('permission: "products.manage"'), `${route} must remain products.manage-only`);
}
for (const route of ["/pricing/dashboard", "/pricing/products", "/pricing/groups"]) {
  expect(sidebar.includes(`path: "${route}"`), `Sidebar must expose ${route}`);
}

for (const source of [taxonomy, dashboard, productPrices, groups]) {
  expect(!source.includes('href="#"'), "Audited Products/Pricing surfaces must not ship placeholder hash links");
  expect(!source.includes("TailAdmin"), "Audited Products/Pricing surfaces must not expose template copy");
}

console.log("products + pricing UI contract: ok");
