import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(resolve(root, relative), "utf8");

const managedPages = [
  ["About", "src/app/about/page.tsx", "/about"],
  ["Gallery", "src/app/gallery/page.tsx", "/gallery"],
  ["Showroom", "src/app/showroom/page.tsx", "/showroom"],
  ["Cabinet Planning", "src/app/cabinet-process/page.tsx", "/cabinet-process"],
  ["Product detail", "src/app/products/[slug]/page.tsx", "/products/"],
];

for (const [label, file, canonicalFragment] of managedPages) {
  const source = read(file);
  assert.match(source, /resolveManagedSeoTitle\(/, `${label} must use the managed absolute-title helper`);
  assert.match(source, /canonical:/, `${label} must publish a canonical`);
  assert.ok(source.includes(canonicalFragment), `${label} canonical must target its Store route`);
}

const home = read("src/app/page.tsx");
assert.match(home, /title:\s*\{\s*absolute:\s*title\s*\}/, "Homepage managed SEO title must stay absolute");
assert.match(home, /canonical:\s*"\/"/, "Homepage must keep a root canonical");

const metadataHelper = read("src/lib/seo/metadata.ts");
assert.match(metadataHelper, /managed\s*\?\s*\{\s*absolute:\s*managed\s*\}\s*:\s*fallbackTitle/);

const structuredData = read("src/lib/seo/structured-data.ts");
assert.match(structuredData, /name:\s*brandName/, "Oakwell must be the public Organization name");
assert.match(structuredData, /parentOrganization:/, "Organization JSON-LD must model a parent relationship");
assert.match(structuredData, /name:\s*parentName/, "Distinct legal/parent identity must be emitted as the parent Organization");
assert.doesNotMatch(structuredData, /name:\s*organizationName/, "Parent legal identity must not replace the public Oakwell Organization name");

const layout = read("src/app/layout.tsx");
const siteConfig = read("src/config/site.ts");
assert.match(layout, /metadataBase:\s*new URL\(siteConfig\.url\)/, "Root metadata base must use code-owned siteConfig.url");
assert.match(siteConfig, /NEXT_PUBLIC_SITE_URL/);
assert.match(siteConfig, /VERCEL_PROJECT_PRODUCTION_URL/);
assert.doesNotMatch(layout, /company\?\.website|company\.website/, "Mutable company website must not replace canonical metadataBase");

const sitemap = read("src/app/sitemap.ts");
assert.match(sitemap, /getStoreGalleryReadiness/);
assert.match(sitemap, /getStoreCabinetJourneyReadiness/);
assert.match(sitemap, /getStorePublicPage\("showroom"\)/);
assert.match(sitemap, /locationType\s*===\s*"showroom"/);

const robots = read("src/app/robots.ts");
for (const blocked of ["/api/", "/account/", "/dealer/"]) {
  assert.ok(robots.includes(`"${blocked}"`), `robots.ts must block ${blocked}`);
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry) ? [path] : [];
  });
}

const hotlinks = sourceFiles(resolve(root, "src")).flatMap((file) => {
  const source = readFileSync(file, "utf8");
  return /https?:\/\/[^\s"')]*granitecenterva\.com/i.test(source) ? [file] : [];
});
assert.deepEqual(hotlinks, [], "Store runtime source must not contain GraniteCenterVA hotlinks");

console.log("GC-8A technical SEO detail contract: PASS");
