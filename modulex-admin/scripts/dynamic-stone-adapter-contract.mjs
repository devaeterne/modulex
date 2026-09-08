import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const source = readFileSync(
  resolve(root, "src/lib/vendor-catalog/dynamic-stone-adapter.ts"),
  "utf8"
).replace(
  /import type\s*\{[\s\S]*?\}\s*from\s*"@\/lib\/vendor-catalog\/domain";\s*/,
  ""
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const encoded = Buffer.from(compiled).toString("base64");
const { DynamicStoneAdapter } = await import(
  `data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`
);

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

const calls = [];
const adapter = new DynamicStoneAdapter({
  baseUrl: "https://dynamic.test",
  locale: "tr",
  email: "buyer@example.com",
  password: "secret-password",
  fetchImpl: async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    calls.push({ url, method, cookie: headers.get("cookie"), body: init.body?.toString?.() ?? null });

    if (url === "https://dynamic.test/web/login" && method === "GET") {
      return html(
        '<form action="/web/login" method="post"><input type="hidden" name="csrf_token" value="csrf-123"><input name="login"><input name="password"></form>',
        200,
        { "set-cookie": "session_id=guest-session; Path=/; HttpOnly" }
      );
    }

    if (url === "https://dynamic.test/web/login" && method === "POST") {
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get("csrf_token"), "csrf-123");
      assert.equal(body.get("login"), "buyer@example.com");
      assert.equal(body.get("password"), "secret-password");
      assert.equal(init.redirect, "manual");
      return html("", 303, {
        location: "/my",
        "set-cookie": "session_id=auth-session; Path=/; HttpOnly",
      });
    }

    if (url === "https://dynamic.test/tr/shop" && method === "GET") {
      assert.match(headers.get("cookie") ?? "", /session_id=auth-session/);
      return html(`
        <a href="/tr/shop/category/sinks-ada-sinks-8169">ADA Sinks</a>
        <a href="/tr/shop/category/sinks-kitchen-sinks-standard-8270">Kitchen Sinks - Standard</a>
        <a href="/tr/shop/category/blades-100">Blades</a>
      `);
    }

    if (
      url === "https://dynamic.test/tr/shop/category/sinks-ada-sinks-8169" &&
      method === "GET"
    ) {
      assert.match(headers.get("cookie") ?? "", /session_id=auth-session/);
      return html(`
        <article class="oe_product">
          <a href="/tr/shop/sinks-ada-sinks-8169/hm-3018ada-primasink-hm-3018ada-17070">HM-3018ADA</a>
        </article>
      `);
    }

    if (
      url ===
        "https://dynamic.test/tr/shop/sinks-ada-sinks-8169/hm-3018ada-primasink-hm-3018ada-17070" &&
      method === "GET"
    ) {
      assert.match(headers.get("cookie") ?? "", /session_id=auth-session/);
      return html(`
        <main id="product_detail">
          <h1>PrimaSink HM-3018ADA 30 x 18 Single bowl Handmade Kitchen Sink</h1>
          <meta name="description" content="ADA single bowl handmade kitchen sink" />
          <span class="oe_currency_value">129.50</span>
          <table>
            <tr><td>Model</td><td>HM-3018ADA</td></tr>
            <tr><td>Brand</td><td>PrimaSink</td></tr>
          </table>
          <img src="/web/image/product.template/17070/image_1024" alt="HM-3018ADA" />
          <a href="/web/content/1001?download=true">HM-3018ADA - Cutout Template.dxf</a>
          <a href="/web/content/1002?download=true">HM-3018ADA - Spec Sheet.pdf</a>
          <button>Add to cart</button>
        </main>
      `);
    }

    throw new Error(`Unexpected Dynamic Stone URL: ${method} ${url}`);
  },
});

const categories = await adapter.listCategories();
assert.deepEqual(categories, [
  { key: "sinks-ada-sinks-8169", label: "ADA Sinks", productCount: null },
  {
    key: "sinks-kitchen-sinks-standard-8270",
    label: "Kitchen Sinks - Standard",
    productCount: null,
  },
]);

const products = await adapter.discover({
  categoryKey: "sinks-ada-sinks-8169",
  categoryLabel: "ADA Sinks",
});
assert.equal(products.length, 1);
assert.equal(products[0].vendorCode, "dynamicstone");
assert.equal(products[0].externalId, "17070");
assert.equal(products[0].sku, "HM-3018ADA");
assert.equal(products[0].vendorPriceReference, 129.5);
assert.equal(products[0].vendorCurrency, "USD");
assert.equal(products[0].vendorCategoryKey, "sinks-ada-sinks-8169");
assert.equal(products[0].vendorCategoryLabel, "ADA Sinks");
assert.equal(products[0].familyKey, "HM-3018ADA");
assert.equal(products[0].availability.status, "AVAILABLE");
assert.equal(products[0].assets.filter((asset) => asset.kind === "image").length, 1);
assert.equal(products[0].assets.filter((asset) => asset.kind === "cad").length, 1);
assert.equal(products[0].assets.filter((asset) => asset.kind === "specification").length, 1);
assert.doesNotMatch(JSON.stringify(products[0].sourcePayload), /secret-password|auth-session/);

await assert.rejects(
  () =>
    adapter.discover({
      categoryKey: "blades-100",
      categoryLabel: "Blades",
    }),
  /sink category/i
);

assert.equal(calls.filter((call) => call.url.endsWith("/web/login") && call.method === "POST").length, 1);

console.log("dynamic stone adapter contract: ok");
