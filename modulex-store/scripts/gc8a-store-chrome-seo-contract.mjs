import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const repoRoot = resolve(root, "..");
const pathFromRepo = (relative) => resolve(repoRoot, relative);
const read = (relative) => readFileSync(pathFromRepo(relative), "utf8");
const exists = (relative) => existsSync(pathFromRepo(relative));
const APPROVED_DESTINATION_KEYS = [
  "home",
  "about",
  "products",
  "showroom",
  "cabinet_process",
  "gallery",
  "contact",
  "dealer_apply",
].sort();

const migrationPath = "modulex-store/supabase/migrations/20260830110000_gc8a_store_chrome.sql";
const destinationsPath = "modulex-store/src/lib/store/chrome/destinations.ts";
const queriesPath = "modulex-store/src/lib/store/chrome/queries.ts";
const navbarPath = "modulex-store/src/components/Navbar.tsx";
const footerPath = "modulex-store/src/components/Footer.tsx";
const chromePath = "modulex-store/src/components/StoreChrome.tsx";
const layoutPath = "modulex-store/src/app/layout.tsx";
const structuredDataPath = "modulex-store/src/lib/seo/structured-data.ts";
const metadataHelperPath = "modulex-store/src/lib/seo/metadata.ts";
const sitemapPath = "modulex-store/src/app/sitemap.ts";
const robotsPath = "modulex-store/src/app/robots.ts";
const adminChromePath = "modulex-admin/src/components/store/StoreChromeSettings.tsx";
const adminChromeLibPath = "modulex-admin/src/lib/store/chrome.ts";
const adminContentPath = "modulex-admin/src/components/store/StoreContentSettings.tsx";

assert(exists(migrationPath), "GC-8A migration is missing");
assert(exists(destinationsPath), "Store chrome destination mapper is missing");
assert(exists(queriesPath), "Store chrome public query boundary is missing");

const migration = read(migrationPath);
assert.match(migration, /create table if not exists public\.store_chrome_items/i);
assert.match(migration, /placement\s+in\s*\(\s*'primary_nav'\s*,\s*'footer_products'\s*,\s*'footer_company'\s*\)/i);
assert.match(migration, /status\s+in\s*\(\s*'draft'\s*,\s*'published'\s*\)/i);
for (const key of APPROVED_DESTINATION_KEYS) {
  assert.match(migration, new RegExp(`'${key}'`), `Migration must allow destination key ${key}`);
}
assert.match(migration, /unique\s*\(\s*placement\s*,\s*destination_key\s*\)/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke\s+all\s+on\s+table\s+public\.store_chrome_items\s+from\s+anon/i);
assert.match(migration, /get_store_public_chrome_items/i);
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path\s*=\s*''/i);
assert.match(migration, /where\s+item\.status\s*=\s*'published'/i);
assert.doesNotMatch(migration, /returns table[\s\S]*status\s+text/i, "Public RPC must not expose status");
assert.doesNotMatch(migration, /returns table[\s\S]*created_by/i, "Public RPC must not expose audit identity");

function loadIsolatedTsModule(relative) {
  const filePath = pathFromRepo(relative);
  const source = readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require(specifier) {
    throw new Error(`Unexpected import in isolated GC-8A module: ${specifier}`);
  }});
  vm.runInContext(compiled, context, { filename: filePath });
  return module.exports;
}

const destinationsSource = read(destinationsPath);
const destinations = loadIsolatedTsModule(destinationsPath);
assert.equal(destinations.resolveStoreChromeDestination("products"), "/products");
assert.equal(destinations.resolveStoreChromeDestination("account"), null);
assert.equal(destinations.resolveStoreChromeDestination("https://example.com"), null);
assert.equal(destinations.resolveStoreChromeDestination("/dealer/orders"), null);
const resolved = destinations.resolveStoreChromeItems([
  { id: "1", placement: "primary_nav", destinationKey: "products", label: " Products ", sortOrder: 2 },
  { id: "2", placement: "primary_nav", destinationKey: "unknown", label: "Bad", sortOrder: 1 },
  { id: "3", placement: "primary_nav", destinationKey: "about", label: "   ", sortOrder: 0 },
]);
assert.deepEqual(JSON.parse(JSON.stringify(resolved)), [
  { id: "1", placement: "primary_nav", destinationKey: "products", label: "Products", sortOrder: 2, href: "/products" },
]);
assert.equal(destinations.SAFE_STORE_CHROME_FALLBACK.length, 11);

const storeDestinationKeys = [...destinationsSource.matchAll(/^\s{2}([a-z_]+):\s*"\//gm)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(storeDestinationKeys, APPROVED_DESTINATION_KEYS, "Store destination allowlist must contain exactly the approved keys");

const queries = read(queriesPath);
assert.match(queries, /get_store_public_chrome_items/);
assert.match(queries, /callPublicRpc/);
assert.match(queries, /revalidate:\s*60/);
assert.doesNotMatch(queries, /status\s*:/, "Store public chrome type must not expose status");
console.log("GC-8A schema + typed chrome domain assertions: PASS");

const navbar = read(navbarPath);
assert.match(navbar, /navigationItems/);
assert.match(navbar, /destinationKey\s*!==\s*"gallery"\s*\|\|\s*galleryReady/);
assert.doesNotMatch(navbar, />Home<\/Link>/);
assert.doesNotMatch(navbar, />About<\/Link>/);
assert.doesNotMatch(navbar, />Products<\/Link>/);
assert.doesNotMatch(navbar, />Showroom<\/Link>/);
assert.doesNotMatch(navbar, />Dealers<\/Link>/);
assert.match(navbar, /href="\/account"/);
assert.match(navbar, /href="\/contact"/);

const footer = read(footerPath);
assert.match(footer, /productLinks/);
assert.match(footer, /companyLinks/);
assert.doesNotMatch(footer, />Product Catalog<\/Link>/);
assert.doesNotMatch(footer, />About Us<\/Link>/);
assert.match(footer, /company\?\.email/);
assert.match(footer, /company\?\.phone/);
assert.match(footer, /settings\?\.facebookUrl/);

const chrome = read(chromePath);
assert.match(chrome, /chromeItems/);
assert.match(chrome, /pathname === "\/dealer"/);
assert.match(chrome, /pathname\.startsWith\("\/dealer\/"\)/);
assert.match(chrome, /pathname === "\/account"/);
assert.match(chrome, /pathname\.startsWith\("\/account\/"\)/);
assert.match(chrome, /if \(isDealerRoute \|\| isAccountRoute\)/);

const layout = read(layoutPath);
assert.match(layout, /getStorePublicChromeItems/);
assert.match(layout, /SAFE_STORE_CHROME_FALLBACK/);
assert.match(layout, /chromeItems=/);
console.log("GC-8A Store shell assertions: PASS");

assert(exists(adminChromePath), "Store chrome Admin editor is missing");
assert(exists(adminChromeLibPath), "Store chrome Admin data module is missing");
const adminLib = read(adminChromeLibPath);
assert.match(adminLib, /STORE_CHROME_DESTINATIONS/);
assert.match(adminLib, /store_chrome_items/);
assert.doesNotMatch(adminLib, /href\s*:\s*input/i, "Admin chrome persistence must use destination keys, not arbitrary href inputs");
const adminDestinationKeys = [...adminLib.matchAll(/\{\s*key:\s*"([a-z_]+)"\s*,/g)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(adminDestinationKeys, APPROVED_DESTINATION_KEYS, "Admin and Store destination allowlists must match exactly");
assert.doesNotMatch(adminLib, /key:\s*"account"/);
assert.doesNotMatch(adminLib, /href:\s*"\/dealer\//, "Admin chrome must not expose private Dealer portal destinations");

const adminChrome = read(adminChromePath);
assert.match(adminChrome, /destinationKey/);
assert.match(adminChrome, /sortOrder/);
assert.match(adminChrome, /draft/i);
assert.match(adminChrome, /published/i);
assert.doesNotMatch(adminChrome, /type="url"/, "Internal chrome editor must not accept arbitrary URLs");

const adminContent = read(adminContentPath);
assert.match(adminContent, /StoreChromeSettings/);
console.log("GC-8A Admin Store CMS assertions: PASS");

assert(exists(metadataHelperPath), "Store SEO metadata helper is missing");
const structuredData = read(structuredDataPath);
assert.match(structuredData, /parentOrganization/);
assert.match(structuredData, /brandName/);
assert.match(structuredData, /name:\s*brandName/);

const metadataHelper = read(metadataHelperPath);
assert.match(metadataHelper, /resolveManagedSeoTitle/);
assert.match(metadataHelper, /absolute/);

const sitemap = read(sitemapPath);
assert.match(sitemap, /getStoreGalleryReadiness/);
assert.match(sitemap, /getStoreCabinetJourneyReadiness/);
const robots = read(robotsPath);
assert.match(robots, /"\/account\/"/);
assert.match(robots, /"\/dealer\/"/);
assert.match(robots, /"\/api\/"/);

const runtimeFiles = [navbar, footer, chrome, layout, structuredData, metadataHelper, sitemap];
const runtimeGraniteUrls = runtimeFiles.flatMap((source, index) =>
  [...source.matchAll(/https?:\/\/[^\s"')]+granitecenterva\.com[^\s"')]*?/gi)].map((match) => ({ index, value: match[0] }))
);
assert.deepEqual(runtimeGraniteUrls, [], "GC-8A runtime shell/SEO must not hotlink GraniteCenterVA");
console.log("GC-8A technical SEO assertions: PASS");

console.log("GC-8A Store Chrome + Technical SEO contract: PASS");
