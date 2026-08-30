import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260830120000_a3_1_canonical_product_taxonomy.sql"),
  "utf8",
);
const acceptance = fs.readFileSync(
  path.join(root, "docs/acceptance/a3-1-product-master.md"),
  "utf8",
);

for (const functionName of ["get_store_catalog_products", "get_store_product_by_slug"]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, "i"));
}

assert.match(migration, /join public\.product_brands pb[\s\S]*join public\.product_categories pc/i);
assert.doesNotMatch(migration, /min\(p\.brand\)|min\(p\.category\)/i);
assert.match(migration, /grant execute on function public\.get_store_catalog_products/i);
assert.match(migration, /grant execute on function public\.get_store_product_by_slug/i);
assert.match(acceptance, /SECURITY DEFINER/i);
assert.match(acceptance, /published.*active|active.*published/i);

console.log("A3.1 canonical product taxonomy contract: PASS");
