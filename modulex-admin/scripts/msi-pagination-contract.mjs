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

// Production regression: MSI Quartzite currently renders all 40 products on
// the first page and returns HTTP 500 for the unnecessary ?page=2 request.
{
  const calls = [];
  const adapter = new adapters.MsiStoneAdapter({
    baseUrl: "https://msi.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://msi.test/quartzite-countertops/") {
        return html(
          '<div>Showing 40 of 40</div><a href="/quartzite/foo/">Foo Quartzite</a>'
        );
      }
      if (url === "https://msi.test/quartzite-countertops/?page=2") {
        return html("Upstream error", 500);
      }
      if (url === "https://msi.test/quartzite/foo/") {
        return html("<h1>Foo Quartzite</h1><div>Material Type: Quartzite ID#: SL-QTZ-FOO</div>");
      }
      throw new Error(`Unexpected MSI Quartzite URL: ${url}`);
    },
  });

  const products = await adapter.discover({
    categoryKey: "quartzite",
    categoryLabel: "Quartzite",
  });
  assert.equal(products.length, 1);
  assert.ok(!calls.includes("https://msi.test/quartzite-countertops/?page=2"));
}

// Multi-page categories must keep paging until the reported total is reached.
{
  const calls = [];
  const adapter = new adapters.MsiStoneAdapter({
    baseUrl: "https://msi.test",
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://msi.test/granite-countertops/") {
        return html(
          '<div>Showing 48 of 83</div><a href="/granite/foo/">Foo Granite</a>'
        );
      }
      if (url === "https://msi.test/granite-countertops/?page=2") {
        return html(
          '<div>Showing 83 of 83</div><a href="/granite/bar/">Bar Granite</a>'
        );
      }
      if (url === "https://msi.test/granite-countertops/?page=3") {
        return html("Upstream error", 500);
      }
      if (url === "https://msi.test/granite/foo/") {
        return html("<h1>Foo Granite</h1><div>Material Type: Granite ID#: SL-GR-FOO</div>");
      }
      if (url === "https://msi.test/granite/bar/") {
        return html("<h1>Bar Granite</h1><div>Material Type: Granite ID#: SL-GR-BAR</div>");
      }
      throw new Error(`Unexpected MSI Granite URL: ${url}`);
    },
  });

  const products = await adapter.discover({
    categoryKey: "granite",
    categoryLabel: "Granite",
  });
  assert.equal(products.length, 2);
  assert.ok(calls.includes("https://msi.test/granite-countertops/?page=2"));
  assert.ok(!calls.includes("https://msi.test/granite-countertops/?page=3"));
}

console.log("MSI pagination contract: ok");
