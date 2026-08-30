import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const editor = read("src/components/store/StoreProductEditor.tsx");
const table = read("src/components/store/StoreProductsTable.tsx");
const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");
const roadmap = read("ADMIN_ROADMAP.md");
const migrationPath = "../modulex-store/supabase/migrations/20260830200000_a3_2_store_product_publishing.sql";

assert.ok(exists(migrationPath), "A3.2 publishing migration is missing");
const migration = read(migrationPath);

for (const token of [
  "active product variant",
  "alt_text",
  "slug cannot change",
  "set search_path = pg_catalog, public",
  "trg_store_product_media_published_guard",
]) {
  assert.match(migration.toLowerCase(), new RegExp(token.toLowerCase().replaceAll(" ", "\\s+")), `A3.2 migration must enforce ${token}`);
}

assert.match(editor, /active variant/i, "Editor must show active-variant publish readiness");
assert.match(editor, /alt[_ -]?text/i, "Editor must show primary-image alt-text readiness");
assert.match(editor, /handleUpdateMedia/, "Editor must persist media metadata updates");
assert.match(editor, /sort_order/, "Editor must expose deterministic media sort order");
assert.match(editor, /published slug/i, "Editor must explain published slug behavior");
assert.match(editor, /duplicate|unique|unpublish/i, "Editor must expose actionable slug/publish errors");
assert.match(table, /active variant/i, "Product list must include active-variant readiness");
assert.match(table, /alt[_ -]?text/i, "Product list must include image alt-text readiness");
assert.doesNotMatch(table, /window\.confirm\(/, "Publishing workflow must not use a native confirmation dialog");
assert.match(sidebar, /path:\s*"\/store\/products"[\s\S]*permission:\s*"store\.view"/, "Store product list must remain viewable");
assert.match(permissions, /\/store\/products\/[\s\S]*store\.manage/, "Store product editor must require store.manage");
assert.match(roadmap, /- \[x\] Review `\/store\/products` publish\/unpublish workflow\./, "A3.2 implementation review must be complete");

console.log("A3.2 Store Product Publishing contract: PASS");
