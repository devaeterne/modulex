import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readOptional = (path) => {
  try {
    return read(path);
  } catch {
    return "";
  }
};

const domain = read("src/lib/vendor-catalog/stone-domain.ts");
const sinkAdapters = read("src/lib/vendor-catalog/adapters.ts");
const adapters = read("src/lib/vendor-catalog/stone-adapters.ts");
const msiMarbleSystemsAdapters = read(
  "src/lib/vendor-catalog/stone-adapters-msi-marble-systems.ts"
);
const sync = read("src/lib/vendor-catalog/stone-sync.ts");
const approval = read("src/lib/vendor-catalog/approval.ts");
const stoneApproval = read("src/lib/vendor-catalog/stone-approve.ts");
const syncRoute = read("src/app/api/vendor-catalog/stone/sync/route.ts");
const vendorsRoute = read("src/app/api/vendor-catalog/stone/vendors/route.ts");
const page = read("src/app/(admin)/products/vendor-imports/page.tsx");
const stonePanel = readOptional(
  "src/app/(admin)/products/vendor-imports/StoneVendorImportsPanel.tsx"
);
const bulkEligibleRoute = read("src/app/api/vendor-catalog/bulk/eligible/route.ts");
const sql = read("sql/stone-vendor-catalog-foundation.sql");
const migration = read("../modulex-store/supabase/migrations/20260902213000_stone_vendor_catalog_foundation.sql");

assert.match(domain, /StoneVendorCode/);
assert.match(domain, /vendorInventory/);
assert.match(domain, /StoneVendorVariant/);
assert.match(domain, /normalizeStoneTypeName/);
assert.match(domain, /"Semiprecious"/);
assert.match(domain, /"msi"/);
assert.match(domain, /"marble_systems"/);
assert.doesNotMatch(domain, /vendorPriceReference/);

// Ruvati is a catalog source, not a Woo checkout. Woo purchasability must not
// classify an otherwise in-stock catalog item as unavailable.
assert.match(sinkAdapters, /product\.is_in_stock\s*===\s*false/);
assert.match(sinkAdapters, /product\.is_in_stock\s*===\s*true/);
assert.doesNotMatch(
  sinkAdapters,
  /if\s*\(product\.is_purchasable\s*===\s*false\)\s*\{[\s\S]{0,180}?status:\s*"UNAVAILABLE"/
);

assert.match(adapters, /class EwMarbleStoneAdapter/);
assert.match(adapters, /class VeneziaStoneAdapter/);
assert.match(adapters, /parseEwMarbleDetail/);
assert.match(adapters, /parseVeneziaDetail/);
assert.match(adapters, /Lot Number/);
assert.match(adapters, /Thickness/);
assert.match(adapters, /MsiStoneAdapter/);
assert.match(adapters, /MarbleSystemsStoneAdapter/);
assert.match(adapters, /msi:\s*\(\)\s*=>\s*new MsiStoneAdapter/);
assert.match(adapters, /marble_systems:\s*\(\)\s*=>\s*new MarbleSystemsStoneAdapter/);
assert.match(adapters, /stoneVendorCatalogRegistry/);
assert.doesNotMatch(adapters, /0\.00 EUR/);
assert.doesNotMatch(adapters, /vendorPriceReference/);

// East West moved from numeric category routes to /products/<stone-type>, and
// the runtime behavior contract verifies current nested product detail URLs.
assert.match(adapters, /\/products\/\$\{encodeURIComponent\(category\.key\)\}/);
assert.match(adapters, /product\/view/);
assert.doesNotMatch(adapters, /\/products\/category\/view\//);

// Venezia has stale/dead catalog links in secondary navigation. A 404 category
// must be skipped instead of aborting the complete vendor run.
assert.match(adapters, /status\s*===\s*404/);
assert.match(adapters, /html\s*===\s*null/);
assert.match(adapters, /continue/);

assert.match(msiMarbleSystemsAdapters, /class MsiStoneAdapter/);
assert.match(msiMarbleSystemsAdapters, /parseMsiDetailVariants/);
assert.match(msiMarbleSystemsAdapters, /ID#:/);
assert.match(msiMarbleSystemsAdapters, /\^PSL-/);
assert.match(msiMarbleSystemsAdapters, /variant\.form === "SLAB"/);
assert.match(msiMarbleSystemsAdapters, /Material Type/);
assert.match(msiMarbleSystemsAdapters, /Book Match/);
assert.match(msiMarbleSystemsAdapters, /Dimensions/);
assert.match(msiMarbleSystemsAdapters, /unknownAvailability\(\)/);
assert.match(msiMarbleSystemsAdapters, /class MarbleSystemsStoneAdapter/);
assert.match(msiMarbleSystemsAdapters, /parseMarbleSystemsDetail/);
assert.match(msiMarbleSystemsAdapters, /Item Code/);
assert.match(msiMarbleSystemsAdapters, /Available Quantity/);
assert.match(msiMarbleSystemsAdapters, /Location/);
assert.match(msiMarbleSystemsAdapters, /stockQuantity:\s*quantity/);
// MSI page 2 and Marble Systems page 2 are valid, while later terminal pages
// can return 5xx/404. After at least one successful page, terminal pagination
// responses must stop discovery rather than failing the complete vendor run.
assert.match(msiMarbleSystemsAdapters, /fetchPaginationHtml/);
assert.match(msiMarbleSystemsAdapters, /page\s*>\s*1/);
assert.match(msiMarbleSystemsAdapters, /response\.status\s*===\s*404/);
assert.match(msiMarbleSystemsAdapters, /response\.status\s*>=\s*500/);
assert.match(msiMarbleSystemsAdapters, /\?page=\$\{page\}/);
assert.match(msiMarbleSystemsAdapters, /page\/\$\{page\}/);
assert.doesNotMatch(msiMarbleSystemsAdapters, /vendorPriceReference/);
assert.doesNotMatch(msiMarbleSystemsAdapters, /\.from\(["']inventory["']\)/);

assert.match(sync, /catalog_domain:\s*"stone"/);
assert.match(sync, /stone_type_id/);
assert.match(sync, /stone_data/);
assert.match(sync, /resolve_vendor_stone_type/);
assert.match(sync, /vendor_price_reference:\s*null/);
assert.match(sync, /missingReconciliation:\s*false/);
assert.match(sync, /products\.length\s*===\s*0/);
assert.match(sync, /zero products|no products/i);
assert.doesNotMatch(sync, /\.from\("inventory"\)/);
assert.doesNotMatch(sync, /store.*publish/i);

assert.match(stoneApproval, /product_type.*STONE|eq\("code",\s*"STONE"\)/s);
assert.match(stoneApproval, /eq\("code",\s*"SLAB"\)/);
assert.match(stoneApproval, /material_price_band_id:\s*null/);
assert.match(stoneApproval, /review_status:\s*"APPROVED"/);
assert.match(stoneApproval, /storeProductContentId:\s*null/);
assert.match(approval, /catalog_domain/);
assert.match(approval, /approveStoneVendorCatalogItem/);

assert.match(syncRoute, /allowCron:\s*true/);
assert.match(syncRoute, /runStoneVendorCatalogSync/);
assert.match(syncRoute, /autoPublished:\s*false/);
assert.match(vendorsRoute, /listCategories/);
assert.match(vendorsRoute, /searchParams\.get\("vendor"\)/);
assert.match(vendorsRoute, /requestedVendor/);
assert.match(vendorsRoute, /Unknown Stone vendor/);

// Admin Vendor Imports must expose Stone as a first-class review domain without
// changing the existing Sink workflow.
assert.match(page, /CatalogDomain/);
assert.match(page, /StoneVendorImportsPanel/);
assert.match(page, />Sink</);
assert.match(page, />Stone</);
assert.match(stonePanel, /\/api\/vendor-catalog\/stone\/vendors/);
assert.match(stonePanel, /\/api\/vendor-catalog\/stone\/sync/);
assert.match(stonePanel, /ensureCategories/);
assert.match(stonePanel, /vendor=\$\{encodeURIComponent\(vendorCode\)\}/);
assert.match(stonePanel, /catalog_domain/);
assert.match(stonePanel, /stone_type_id/);
assert.match(stonePanel, /stone_data/);
assert.match(stonePanel, /Stone Type/);
assert.match(stonePanel, /Thickness/);
assert.match(stonePanel, /Finish/);
assert.match(stonePanel, /Location/);
assert.match(stonePanel, /Select one Stone vendor/);

// Generic bulk approval remains shared, but Stone eligibility must not depend
// on Sink category mappings. A resolved Stone Type is the fail-closed gate.
assert.match(bulkEligibleRoute, /catalog_domain/);
assert.match(bulkEligibleRoute, /stone_type_id/);
assert.match(bulkEligibleRoute, /candidate\.catalog_domain === "stone"/);
assert.match(bulkEligibleRoute, /Boolean\(candidate\.stone_type_id\)/);

assert.match(sql, /alter column material_price_band_id drop not null/i);
assert.match(sql, /vendor_stone_type_mappings/);
assert.match(sql, /pending_review/);
assert.match(sql, /resolve_vendor_stone_type/);
assert.match(sql, /catalog_domain/);
assert.match(sql, /stone_data jsonb/);
assert.match(sql, /vendor inventory is reference-only/i);
assert.match(sql, /v_material_price_band_id is not null/i);
assert.equal(migration.trim(), sql.trim(), "Deployable Stone vendor migration must mirror canonical SQL");

await import("./vendor-catalog-adapter-behavior-contract.mjs");

console.log("stone vendor catalog contract: ok");
