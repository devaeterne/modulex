import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const storeRoot = path.resolve(here, "..");
const repoRoot = path.resolve(storeRoot, "..");
const read = (relative) => readFile(path.join(repoRoot, relative), "utf8");

const [adminCms, adminPages, showroomPage, structuredData, rootLayout, sitemap] = await Promise.all([
  read("modulex-admin/src/lib/store/secondaryCms.ts"),
  read("modulex-admin/src/components/store/StorePagesManager.tsx"),
  read("modulex-store/src/app/showroom/page.tsx"),
  read("modulex-store/src/lib/seo/structured-data.ts"),
  read("modulex-store/src/app/layout.tsx"),
  read("modulex-store/src/app/sitemap.ts"),
]);

assert.match(
  adminCms,
  /CONTROLLED_PAGE_SLUGS\s*=\s*\[[^\]]*"about"[^\]]*"gallery"[^\]]*"showroom"[^\]]*\]/s,
  "Admin Secondary CMS must manage the Showroom page alongside About and Gallery",
);
assert.match(adminPages, /Showroom/i, "Admin Store pages UI should describe Showroom as a controlled page");

assert.match(showroomPage, /getStorePublicPage/, "Showroom must read its CMS page record");
assert.match(showroomPage, /getStorePublicPage\("showroom"\)/, "Showroom must load the showroom CMS slug");
assert.match(showroomPage, /generateMetadata/, "Showroom metadata must be generated from CMS data");
assert.match(showroomPage, /canonical:\s*"\/showroom"/, "Showroom metadata must keep a canonical URL");
assert.match(
  showroomPage,
  /robots:[\s\S]*index:\s*hasPublishedShowroom/s,
  "Showroom must noindex when no active showroom location is published",
);
assert.match(showroomPage, /resolveManagedSeoTitle\(page\.seoTitle,\s*page\.title\)/, "Showroom managed SEO title must be absolute");
assert.match(showroomPage, /page\.seoDescription/, "Showroom metadata must use the CMS SEO description");
assert.match(showroomPage, /page\.ogImageUrl/, "Showroom metadata must use the CMS OG image");
assert.match(showroomPage, /page\.eyebrow/, "Showroom visible copy must use the CMS eyebrow");
assert.match(showroomPage, /page\.intro/, "Showroom visible copy must use the CMS intro");
assert.match(showroomPage, /page\.body/, "Showroom visible copy must use the CMS body");

assert.match(structuredData, /name:\s*brandName/, "Organization JSON-LD must keep Oakwell as the public organization name");
assert.match(structuredData, /parentOrganization/, "Organization JSON-LD must support the parent-company relationship");
assert.match(structuredData, /parentName/, "Organization JSON-LD must derive the distinct parent identity from canonical company data");
assert.match(structuredData, /"@type":\s*"Brand"/, "Organization JSON-LD must identify Oakwell as a brand");
assert.match(structuredData, /createLocalBusinessJsonLd/, "SEO helpers must support showroom LocalBusiness JSON-LD");
assert.match(structuredData, /openingHoursSpecification/, "LocalBusiness JSON-LD must expose published opening hours");
assert.match(rootLayout, /createOrganizationJsonLd\(company\)/, "Root layout must build Organization JSON-LD from verified company data");
assert.match(showroomPage, /createLocalBusinessJsonLd/, "Showroom must render LocalBusiness JSON-LD for published locations");

assert.match(sitemap, /getStorePublicPage\("showroom"\)/, "Sitemap must read Showroom publication state from CMS");
assert.match(sitemap, /locationType\s*===\s*"showroom"/, "Sitemap must require a published showroom location");
assert.match(sitemap, /\/showroom/, "Sitemap must include the Showroom route conditionally");

console.log("Showroom CMS + technical SEO contract: PASS");
