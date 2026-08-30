import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sqlPath = "sql/a3-product-master-data.sql";
expect(exists(sqlPath), "A3.1 product-master SQL bundle is missing");

const sql = read(sqlPath);
const form = read("src/components/products/ProductForm.tsx");
const table = read("src/components/products/ProductsTable.tsx");
const taxonomy = read("src/components/products/TaxonomyManager.tsx");
const roadmap = read("ADMIN_ROADMAP.md");
const storeMigration = read("../modulex-store/supabase/migrations/20260830120000_a3_1_canonical_product_taxonomy.sql");
const acceptancePath = "docs/acceptance/a3-1-product-master-data.md";

for (const token of [
  "base_product_code",
  "color_code",
  "color_name",
  "set_product_status",
  "products_family_taxonomy_guard",
  "products_lifecycle_guard",
  "product_taxonomy_status_guard",
  "on delete restrict",
]) {
  expect(sql.toLowerCase().includes(token.toLowerCase()), `A3.1 SQL must contain ${token}`);
}

expect(
  sql.includes("lower(btrim(sku))") && sql.includes("lower(btrim(base_product_code))") && sql.includes("lower(btrim(color_code))"),
  "A3.1 SQL must enforce normalized case-insensitive product identifiers"
);
expect(
  sql.includes("reserved_quantity") && sql.includes("quantity"),
  "A3.1 lifecycle guard must inspect on-hand and reserved stock"
);
expect(
  sql.toLowerCase().includes("archived") && sql.toLowerCase().includes("terminal"),
  "A3.1 lifecycle SQL must document/enforce archived as terminal"
);
expect(
  sql.toLowerCase().includes("revoke all on function public.set_product_status"),
  "A3.1 lifecycle RPC must revoke default PUBLIC execute"
);

for (const field of ["base_product_code", "color_code", "color_name"]) {
  expect(form.includes(field), `ProductForm must manage ${field}`);
}
expect(
  form.includes("Brand is required.") && form.includes("Category is required."),
  "ProductForm must require canonical brand/category"
);
expect(
  form.includes("Base product code is required.") && form.includes("Color code is required."),
  "ProductForm must require family/color identifiers"
);

expect(
  table.includes('supabase.rpc("set_product_status"'),
  "Product list lifecycle actions must use set_product_status RPC"
);
expect(
  !table.includes('.update({ status: nextStatus })') && !table.includes('.update({ status: "archived" })'),
  "Product list must not bypass protected lifecycle RPC with direct status updates"
);
expect(
  table.includes("Export CSV") && table.includes("exportProductsCsv"),
  "Product list must expose complete CSV export"
);
expect(
  table.includes("while") && table.includes("total_count"),
  "Product CSV export must exhaust deterministic pages to the exact total"
);
for (const column of ["Base Product Code", "Color Code", "Color Name"]) {
  expect(table.includes(column), `Product CSV/list contract must include ${column}`);
}

expect(
  taxonomy.includes("referenced") && taxonomy.includes("cannot be deleted"),
  "Taxonomy UI must explain restrictive delete behavior"
);
expect(
  taxonomy.includes("active products") && taxonomy.includes("cannot be deactivated"),
  "Taxonomy UI must explain active-product deactivation guard"
);

expect(
  storeMigration.includes("left join public.product_brands pb on pb.id = p.brand_id") &&
    storeMigration.includes("left join public.product_categories pc on pc.id = p.category_id"),
  "Store A3.1 public catalog must preserve canonical taxonomy FK joins"
);

expect(exists(acceptancePath), "A3.1 acceptance artifact is missing");
expect(
  roadmap.includes("- [x] Review product create/edit flows and SKU/base-product/color relationships.") &&
    roadmap.includes("- [x] Verify category/brand management and referential integrity.") &&
    roadmap.includes("- [x] Define activation/deactivation rules for variants already referenced by orders/inventory.") &&
    roadmap.includes("- [x] Review bulk operations/import/export requirements."),
  "ADMIN_ROADMAP.md must close all A3.1 checklist items after acceptance"
);

console.log("A3.1 product master contract: ok");
