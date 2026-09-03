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

function sinkAdapterSource() {
  return read("src/lib/vendor-catalog/adapters.ts").replace(
    /import type\s*\{[\s\S]*?\}\s*from\s*"@\/lib\/vendor-catalog\/domain";\s*/,
    ""
  );
}

function stoneAdapterSource() {
  return read("src/lib/vendor-catalog/stone-adapters.ts")
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*"@\/lib\/vendor-catalog\/stone-domain";\s*/,
      "const normalizeStoneTypeName = (value) => value;\n"
    )
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*"@\/lib\/vendor-catalog\/stone-adapters-msi-marble-systems";\s*/,
      "class MarbleSystemsStoneAdapter {}\nclass MsiStoneAdapter {}\n"
    );
}

function msiMarbleSystemsSource() {
  return read("src/lib/vendor-catalog/stone-adapters-msi-marble-systems.ts").replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"@\/lib\/vendor-catalog\/stone-domain";\s*/,
    "const normalizeStoneTypeName = (value) => value;\n"
  );
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const sinkAdapters = await importTranspiled(sinkAdapterSource());
const stoneAdapters = await importTranspiled(stoneAdapterSource());
const msiMarbleSystems = await importTranspiled(msiMarbleSystemsSource());

// Ruvati: Woo checkout purchasability is not catalog availability. Stock is
// authoritative for the normalized availability state.
{
  const adapter = new sinkAdapters.RuvatiAdapter({
    baseUrl: "https://ruvati.test",
    fetchImpl: async (input) => {
      const url = String(input);
      assert.match(url, /\/wp-json\/wc\/store\/v1\/products\?/);
      return json([
        {
          id: 1,
          name: "In-stock sink",
          permalink: "https://ruvati.test/product/in-stock-sink/",
          sku: "RV-1",
          categories: [{ name: "Kitchen Sinks", slug: "kitchen-sinks" }],
          is_in_stock: true,
          is_purchasable: false,
        },
        {
          id: 2,
          name: "Out-of-stock sink",
          permalink: "https://ruvati.test/product/out-of-stock-sink/",
          sku: "RV-2",
          categories: [{ name: "Kitchen Sinks", slug: "kitchen-sinks" }],
          is_in_stock: false,
          is_purchasable: false,
        },
      ]);
    },
  });

  const products = await adapter.discover({
    categoryKey: "kitchen-sinks",
    categoryLabel: "Kitchen Sinks",
  });
  assert.equal(products.length, 2);
  assert.deepEqual(products[0].availability, {
    status: "AVAILABLE",
    available: true,
    purchasable: false,
    stockQuantity: null,
  });
  assert.deepEqual(products[1].availability, {
    status: "OUT_OF_STOCK",
    available: false,
    purchasable: false,
    stockQuantity: null,
  });
}

// East West: current category and product paths are slug-based.
{
  const calls = [];
  const adapter = new stoneAdapters.EwMarbleStoneAdapter({
    baseUrl: "https://ew.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://ew.test/products/granite") {
        return html('<a href="/products/granite/product/view/4/130">African Rainbow</a>');
      }
      if (url === "https://ew.test/products/granite/product/view/4/130") {
        return html(
          "<h1>African Rainbow Granite</h1><div>Category: Granite Inventory data Lot Number: L-130 Size: 120 x 70 Availability: In stock</div>"
        );
      }
      throw new Error(`Unexpected East West URL: ${url}`);
    },
  });

  const products = await adapter.discover({ categoryKey: "granite", categoryLabel: "Granite" });
  assert.equal(products.length, 1);
  assert.equal(products[0].externalId, "4:130");
  assert.equal(products[0].stoneTypeName, "Granite");
  assert.ok(calls.includes("https://ew.test/products/granite"));
  assert.ok(calls.every((url) => !url.includes("/products/category/view/")));
}

// Venezia: stale category links returning 404 are ignored while valid catalog
// categories continue to sync.
{
  const calls = [];
  const adapter = new stoneAdapters.VeneziaStoneAdapter({
    baseUrl: "https://venezia.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://venezia.test/catalog") {
        return html(
          '<a href="/catalog/granite">Granite</a><a href="/catalog/labradorite">Labradorite</a>'
        );
      }
      if (url === "https://venezia.test/catalog/granite") {
        return html('<a href="/catalog/granite/test-granite">Test Granite</a>');
      }
      if (url === "https://venezia.test/catalog/labradorite") return html("Not found", 404);
      if (url === "https://venezia.test/catalog/granite/test-granite") {
        return html(
          "<h1>Test Granite</h1><div>Location: Miami, FL Color: White Category: Granite Thickness: 3cm Country: Brazil ✓ In stock Contact Us:</div>"
        );
      }
      throw new Error(`Unexpected Venezia URL: ${url}`);
    },
  });

  const products = await adapter.discover();
  assert.equal(products.length, 1);
  assert.equal(products[0].externalId, "test-granite");
  assert.ok(calls.includes("https://venezia.test/catalog/labradorite"));
}

// MSI: page 2 may be valid while the terminal page 3 returns a server error.
// A terminal pagination error must stop paging without discarding pages 1-2.
{
  const calls = [];
  const adapter = new msiMarbleSystems.MsiStoneAdapter({
    baseUrl: "https://msi.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://msi.test/granite-countertops/") {
        return html('<a href="/granite/foo/">Foo Granite</a>');
      }
      if (url === "https://msi.test/granite-countertops/?page=2") {
        return html('<a href="/granite/bar/">Bar Granite</a>');
      }
      if (url === "https://msi.test/granite-countertops/?page=3") return html("Upstream error", 500);
      if (url === "https://msi.test/granite/foo/") {
        return html("<h1>Foo Granite</h1><div>Material Type: Granite ID#: SL-FOO</div>");
      }
      if (url === "https://msi.test/granite/bar/") {
        return html("<h1>Bar Granite</h1><div>Material Type: Granite ID#: SL-BAR</div>");
      }
      throw new Error(`Unexpected MSI URL: ${url}`);
    },
  });

  const products = await adapter.discover({ categoryKey: "granite", categoryLabel: "Granite" });
  assert.equal(products.length, 2);
  assert.ok(calls.includes("https://msi.test/granite-countertops/?page=3"));
}

// Marble Systems: a terminal 404 is the end of pagination, not a vendor-wide
// failure. Previously discovered slab pages remain valid.
{
  const calls = [];
  const adapter = new msiMarbleSystems.MarbleSystemsStoneAdapter({
    baseUrl: "https://marble.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://marble.test/slabs/limestone-slabs/") {
        return html('<a href="/product/foo/">Foo Limestone</a>');
      }
      if (url === "https://marble.test/slabs/limestone-slabs/page/2/") {
        return html('<a href="/product/bar/">Bar Limestone</a>');
      }
      if (url === "https://marble.test/slabs/limestone-slabs/page/3/") return html("Not found", 404);
      if (url === "https://marble.test/product/foo/") {
        return html(
          "<h1>Foo Limestone</h1><div>Item Code: SL-FOO Material: Limestone Available Quantity: 3 Location: Miami, FL</div>"
        );
      }
      if (url === "https://marble.test/product/bar/") {
        return html(
          "<h1>Bar Limestone</h1><div>Item Code: SL-BAR Material: Limestone Available Quantity: 2 Location: Miami, FL</div>"
        );
      }
      throw new Error(`Unexpected Marble Systems URL: ${url}`);
    },
  });

  const products = await adapter.discover({
    categoryKey: "limestone-slabs",
    categoryLabel: "Limestone",
  });
  assert.equal(products.length, 2);
  assert.ok(calls.includes("https://marble.test/slabs/limestone-slabs/page/3/"));
}

console.log("vendor catalog adapter behavior contract: ok");
