import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const source = readFileSync(
  resolve(root, "src/lib/vendor-catalog/stone-adapters-msi-marble-systems.ts"),
  "utf8"
).replace(
  /import\s*\{[\s\S]*?\}\s*from\s*"@\/lib\/vendor-catalog\/stone-domain";\s*/,
  "const normalizeStoneTypeName = (value) => value;\n"
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const encoded = Buffer.from(compiled).toString("base64");
const adapters = await import(`data:text/javascript;base64,${encoded}#${Date.now()}`);

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Production regression: Marble Systems category pages can retain stale
// product links after the detail page has been removed. One stale 404 must not
// abort discovery of the other valid slab products in the category.
{
  const calls = [];
  const adapter = new adapters.MarbleSystemsStoneAdapter({
    baseUrl: "https://marble.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://marble.test/slabs/limestone-slabs/") {
        return html(
          '<a href="/product/good-limestone-slab/">Good Limestone</a>' +
            '<a href="/product/britannia-honed-limestone-slab-random-3-4/">Britannia Honed Limestone</a>'
        );
      }
      if (url === "https://marble.test/slabs/limestone-slabs/page/2/") {
        return html("Not found", 404);
      }
      if (url === "https://marble.test/product/good-limestone-slab/") {
        return html(
          '<h1>Good Honed Limestone Slab</h1><div>Item Code: SL-GOOD Material: Limestone Available Quantity: 3 Location: Miami, FL</div>'
        );
      }
      if (url === "https://marble.test/product/britannia-honed-limestone-slab-random-3-4/") {
        return html("Not found", 404);
      }

      throw new Error(`Unexpected Marble Systems URL: ${url}`);
    },
  });

  const products = await adapter.discover({
    categoryKey: "limestone-slabs",
    categoryLabel: "Limestone",
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].sku, "SL-GOOD");
  assert.ok(calls.includes("https://marble.test/product/britannia-honed-limestone-slab-random-3-4/"));
}

console.log("Marble Systems stale product contract: ok");
