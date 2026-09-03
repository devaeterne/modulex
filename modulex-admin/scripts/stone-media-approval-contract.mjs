import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

async function importTranspiled(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const encoded = Buffer.from(compiled).toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
}

const stoneApproval = read("src/lib/vendor-catalog/stone-approve.ts");
const stoneMedia = read("src/lib/vendor-catalog/stone-media.ts");
const stoneContentSource = read("src/lib/vendor-catalog/stone-content.ts");
const approvalDispatcher = read("src/lib/vendor-catalog/approval.ts");
const backfillRoute = read("src/app/api/vendor-catalog/stone/backfill-approved/route.ts");
const panel = read("src/app/(admin)/products/vendor-imports/StoneVendorImportsPanel.tsx");

assert.match(stoneApproval, /archiveStoneProductContent/);
assert.match(stoneApproval, /buildStoneProductDescription/);
assert.match(stoneApproval, /Stone SKU collision detected/);
assert.doesNotMatch(stoneApproval, /storeProductContentId:\s*null/);
assert.doesNotMatch(stoneApproval, /archivedImageCount:\s*0/);

assert.match(stoneMedia, /store-media/);
assert.match(stoneMedia, /sharp/);
assert.match(stoneMedia, /webp/);
assert.match(stoneMedia, /1400/);
assert.match(stoneMedia, /12\s*\*\s*1024\s*\*\s*1024/);
assert.match(stoneMedia, /vendor_catalog_assets/);
assert.match(stoneMedia, /archived_at/);
assert.match(stoneMedia, /store_product_content/);
assert.match(stoneMedia, /store_product_media/);
assert.match(stoneMedia, /og_image_url/);
assert.match(stoneMedia, /isTrustedStoneImageUrl/);
assert.doesNotMatch(stoneMedia, /is_published:\s*true/);

assert.match(approvalDispatcher, /catalog_domain\s*===\s*"stone"/);
assert.match(approvalDispatcher, /store_product_content/);
assert.match(backfillRoute, /authorizeVendorCatalogAdmin/);
assert.match(backfillRoute, /review_status/);
assert.match(backfillRoute, /APPROVED/);
assert.match(backfillRoute, /approveStoneVendorCatalogItem/);
assert.match(panel, /backfill-approved/);
assert.match(panel, /Backfill Approved Content/);

const stoneContent = await importTranspiled(stoneContentSource);

const vendorDescription = stoneContent.buildStoneProductDescription({
  title: "Test Marble",
  description: "Vendor supplied description.",
  stone_data: { stoneTypeName: "Marble" },
});
assert.equal(vendorDescription, "Vendor supplied description.");

const fallback = stoneContent.buildStoneProductDescription({
  title: "ARABESCATO OROBICO",
  description: null,
  stone_data: {
    stoneTypeName: "Marble",
    collection: null,
    colors: ["White", "Gray"],
    variant: { thickness: "3cm", finish: "Polished", dimensions: "123x75" },
    vendorInventory: [{ lotNumber: "B473", location: "Chantilly, VA" }],
  },
});
assert.match(fallback, /Marble/);
assert.match(fallback, /3cm/);
assert.match(fallback, /123x75/);
assert.match(fallback, /B473/);
assert.match(fallback, /Chantilly, VA/);
assert.match(fallback, /White, Gray/);

assert.equal(
  stoneContent.isTrustedStoneImageUrl(
    "https://www.ewmarble.com/products/marble/product/view/6/340",
    "https://www.ewmarble.com/images/product.webp"
  ),
  true
);
assert.equal(
  stoneContent.isTrustedStoneImageUrl(
    "https://www.veneziasurfaces.com/catalog/example",
    "https://mc.yandex.ru/watch/123"
  ),
  false
);
assert.equal(
  stoneContent.isTrustedStoneImageUrl(
    "https://www.msisurfaces.com/granite/example/",
    "https://cdn.msisurfaces.com/images/example.jpg"
  ),
  true
);
assert.equal(
  stoneContent.isTrustedStoneImageUrl(
    "https://www.ewmarble.com/products/example",
    "http://www.ewmarble.com/insecure.jpg"
  ),
  false
);

console.log("stone media approval contract: ok");
