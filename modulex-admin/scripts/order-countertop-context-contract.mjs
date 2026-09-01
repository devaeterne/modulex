import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");
const migrationDir = path.join(root, "../modulex-store/supabase/migrations");
const guardFile = fs.readdirSync(migrationDir).find((name) => name.endsWith("_countertop_order_price_group_guard.sql"));
const catalogMigration = fs.readdirSync(migrationDir).find((name) => name.endsWith("_countertop_catalog_product.sql"));
const catalogRoutePath = "src/app/(admin)/pricing/countertop/catalog/page.tsx";
const catalogManagerPath = "src/components/countertop/CountertopCatalogManager.tsx";

assert(guardFile, "countertop order price-group guard migration must exist");
assert(configurator.includes('.from("customer_orders")'), "Add Countertop must load the saved Order price group");
assert(configurator.includes('select("price_group_id")'), "Countertop pricing context must use the Order price_group_id");
assert(configurator.includes("canCalculate"), "CountertopConfigurator must track required-field readiness");
assert(/disabled=\{!canCalculate\}/.test(configurator), "Calculate price must be disabled until required fields are complete");
assert(configurator.includes("Inherited from the saved order"), "Countertop price group must be explained as inherited from the saved order");
assert(configurator.includes("dark:text-gray-300"), "Countertop field labels must be readable in dark mode");
assert(configurator.includes("products(id,name,sku,status)"), "Stone discovery must read Product lifecycle status");
assert(configurator.includes('x.products?.status === "active"'), "Inactive Stone products must not appear in Order configuration");
assert(configurator.includes('.eq("available_for_orders", true).eq("internal_only", false)'), "Countertop pricing context must only expose order-eligible commercial price groups");

assert(fs.existsSync(path.join(root, catalogRoutePath)), "Countertop Catalog route must exist");
assert(fs.existsSync(path.join(root, catalogManagerPath)), "Countertop Catalog manager must exist");
assert(sidebar.includes('name: "Countertop Catalog"') && sidebar.includes('path: "/pricing/countertop/catalog"'), "Pricing navigation must expose Countertop Catalog");
assert(sidebar.includes('name: "Countertop Setup"') && sidebar.includes('path: "/pricing/countertop/settings"'), "Pricing navigation must expose Countertop Setup");
assert(catalogMigration, "countertop catalog product migration must exist");

const catalogRoute = read(catalogRoutePath);
const catalogManager = read(catalogManagerPath);
const catalogSql = catalogMigration ? read(path.join("../modulex-store/supabase/migrations", catalogMigration)) : "";

assert(catalogRoute.includes("CountertopCatalogManager"), "Countertop Catalog route must render the catalog manager");
assert(catalogManager.includes("Add Stone"), "Countertop Catalog must expose Add Stone");
assert(catalogManager.includes("Add Sink"), "Countertop Catalog must expose Add Sink");
assert(catalogManager.includes('rpc("save_countertop_catalog_product"'), "Countertop Catalog must use the atomic catalog RPC");
assert(catalogManager.includes('available_for_orders'), "Sink pricing must load order-eligible commercial price groups");
assert(catalogManager.includes('internal_only'), "Sink pricing must exclude internal-only price groups");
assert(catalogManager.includes("Material Price Band"), "Stone catalog must expose Material Price Band");
assert(catalogManager.includes("Stone Type"), "Stone catalog must expose Stone Type");
assert(catalogManager.includes("Sink prices"), "Sink catalog must expose per-price-group prices");
assert(catalogManager.includes('rpc("set_product_status"'), "Catalog activate/deactivate must use the canonical product status RPC");
assert(catalogSql.includes("create or replace function private.save_countertop_catalog_product"), "Catalog migration must define the private atomic implementation");
assert(catalogSql.includes("create or replace function public.save_countertop_catalog_product"), "Catalog migration must expose a public wrapper");
assert(catalogSql.includes("public.save_product_master_v2"), "Catalog RPC must reuse Product Master v2 validation");
assert(catalogSql.includes("public.set_product_prices_bulk"), "Catalog RPC must reuse canonical append-safe product pricing");
assert(catalogSql.includes("Countertop catalog management requires admin permission"), "Catalog RPC must fail closed for non-admin callers");
assert(catalogSql.includes("each active order price group exactly once"), "Sink pricing must fail closed unless every commercial order price group is priced exactly once");

console.log("Order countertop context contract: PASS");
