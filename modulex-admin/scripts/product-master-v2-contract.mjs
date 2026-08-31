import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("../modulex-store/supabase/migrations/20260831140000_product_master_v2_dynamic_types_uom.sql", "utf8");
const advisorHardening = fs.readFileSync("../modulex-store/supabase/migrations/20260831143000_product_master_v2_advisor_hardening.sql", "utf8");
const form = fs.readFileSync("src/components/products/ProductForm.tsx", "utf8");
const manager = fs.readFileSync("src/components/products/ProductMasterReferenceManager.tsx", "utf8");
const list = fs.readFileSync("src/components/products/ProductsTable.tsx", "utf8");
const qrRoute = fs.readFileSync("src/app/api/admin/products/qr/route.ts", "utf8");
assert.match(migration, /create table if not exists public\.product_types/);
assert.match(migration, /create table if not exists public\.units_of_measure/);
assert.match(migration, /product_type_allowed_uoms/);
assert.match(migration, /countertop_stone_product_profiles/);
assert.match(migration, /product_type_id/);
assert.match(migration, /new\.unit := v_uom\.code/);
assert.match(form, /Product Type/);
assert.match(form, /Unit of Measure/);
assert.match(form, /Stone Type/);
assert.match(form, /Material Price Band/);
assert.match(manager, /Product Type/);
assert.match(manager, /Units of Measure/);
assert.match(manager, /Quantity Type/);
assert.match(manager, /Whole numbers/);
assert.match(manager, /Decimals allowed/);
for (const sharedPrimitive of [
  /ComponentCard/,
  /<Modal/,
  /<Input/,
  /<Select/,
  /<Checkbox/,
  /<Badge/,
  /<Table/,
]) {
  assert.match(manager, sharedPrimitive, "Product Type/UOM UI must compose shared Admin UI primitives");
}
assert.doesNotMatch(manager, /<input\b/, "Product Type/UOM UI must not create route-local native inputs");
assert.doesNotMatch(manager, /<select\b/, "Product Type/UOM UI must not create route-local native selects");
assert.doesNotMatch(manager, /<table\b/, "Product Type/UOM UI must use the shared Table primitive");
assert.doesNotMatch(form, /brand_id: current\.brand_id \|\| loadedBrands/);
assert.match(list, /get_products_page_v2/);
assert.match(list, /getLegacyRpcArgs/);
assert.match(list, /getV2RpcArgs/);
assert.match(list, /product-type-filter/);
assert.match(list, /product-uom-filter/);
assert.match(list, /product-qr-filter/);
assert.match(migration, /stone_type/);
assert.match(migration, /material_price_band/);
assert.match(migration, /Product type used by active products cannot be deactivated/);
assert.match(advisorHardening, /product_types_default_uom_idx/);
for (const legacyPolicy of [
  "product_master_uom_manage",
  "product_master_type_manage",
  "product_master_allowed_uom_manage",
]) {
  assert.match(advisorHardening, new RegExp(`drop policy if exists ${legacyPolicy}`));
}
for (const mutationPolicy of [
  "product_master_uom_insert",
  "product_master_uom_update",
  "product_master_type_insert",
  "product_master_type_update",
  "product_master_allowed_uom_insert",
  "product_master_allowed_uom_update",
  "product_master_allowed_uom_delete",
]) {
  assert.match(advisorHardening, new RegExp(`create policy ${mutationPolicy}`));
}
assert.doesNotMatch(advisorHardening, /create policy product_master_(?:uom|type|allowed_uom)_manage/);
assert.match(form, /getSession\(\)/);
assert.match(form, /Authorization: `Bearer \$\{session\.access_token\}`/);
assert.match(qrRoute, /requireAdmin\(request\)/);
assert.match(qrRoute, /const value = product\.sku/);
assert.match(qrRoute, /cleanupError/);
console.log("product-master-v2 contract: PASS");
