import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];

const blockedRouteFiles = [
  "src/app/services/page.tsx",
  "src/app/services/residential/page.tsx",
  "src/app/blog/page.tsx",
  "src/app/blog/[slug]/page.tsx",
  "src/app/gallery/detail/page.tsx",
  "src/app/index-premium/page.tsx",
  "src/app/index-slider/page.tsx",
];

for (const relativePath of blockedRouteFiles) {
  try {
    await access(path.join(root, relativePath));
    failures.push(`Demo route must not be published: ${relativePath}`);
  } catch {
    // Expected: route file does not exist.
  }
}

const productionSurfaceFiles = [
  "src/app/about/page.tsx",
  "src/app/gallery/page.tsx",
  "src/app/page.tsx",
  "src/app/sitemap.ts",
  "src/app/robots.ts",
  "src/components/Navbar.tsx",
  "src/components/Footer.tsx",
  "src/components/gallery/StoreProjectsGallery.tsx",
];

const blockedPatterns = [
  { label: "fake 555 phone number", pattern: /\+?1?555\d{7,}/i },
  { label: "placeholder hash link", pattern: /href\s*=\s*["']#["']/i },
  { label: "legacy .html link", pattern: /(?:href|src|openLightbox)\s*[=(][^\n]*\.html/i },
  { label: "demo person Sarah Mitchell", pattern: /Sarah Mitchell/i },
  { label: "demo person David Chen", pattern: /David Chen/i },
  { label: "demo person Emma Rodriguez", pattern: /Emma Rodriguez/i },
  { label: "demo person Michael Park", pattern: /Michael Park/i },
  { label: "unsupported award claim", pattern: /Awards?\s*&\s*Achievements|award-winning design firm/i },
];

for (const relativePath of productionSurfaceFiles) {
  const absolutePath = path.join(root, relativePath);
  let source;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch {
    failures.push(`Expected production surface file is missing: ${relativePath}`);
    continue;
  }

  for (const { label, pattern } of blockedPatterns) {
    if (pattern.test(source)) {
      failures.push(`${relativePath}: blocked ${label}`);
    }
  }
}

const gallerySource = await readFile(path.join(root, "src/app/gallery/page.tsx"), "utf8").catch(() => "");
if (gallerySource) {
  if (!gallerySource.includes("getStoreGalleryReadiness")) {
    failures.push("Gallery must use the shared published readiness helper");
  }
  if (!gallerySource.includes("notFound()")) {
    failures.push("Gallery must fail closed when published content is not ready");
  }
}

const galleryClientSource = await readFile(path.join(root, "src/components/gallery/StoreProjectsGallery.tsx"), "utf8").catch(() => "");
if (galleryClientSource && /supabase/i.test(galleryClientSource)) {
  failures.push("Gallery client must not establish a direct Supabase data boundary");
}

const sitemapSource = await readFile(path.join(root, "src/app/sitemap.ts"), "utf8");
for (const blockedRoute of ["/gallery", "/services", "/blog", "/index-premium", "/index-slider", "/account", "/dealer"]) {
  if (sitemapSource.includes(`"${blockedRoute}"`) || sitemapSource.includes(`'${blockedRoute}'`)) {
    failures.push(`Sitemap exposes non-production route: ${blockedRoute}`);
  }
}

const robotsSource = await readFile(path.join(root, "src/app/robots.ts"), "utf8");
for (const requiredDisallow of ["/api/", "/account/", "/dealer/"]) {
  if (!robotsSource.includes(`"${requiredDisallow}"`) && !robotsSource.includes(`'${requiredDisallow}'`)) {
    failures.push(`robots.ts must disallow ${requiredDisallow}`);
  }
}

for (const layoutPath of ["src/app/account/layout.tsx", "src/app/dealer/layout.tsx"]) {
  let layoutSource;
  try {
    layoutSource = await readFile(path.join(root, layoutPath), "utf8");
  } catch {
    failures.push(`Portal namespace must define route-level robots metadata: ${layoutPath}`);
    continue;
  }

  if (!/robots\s*:\s*\{[^}]*index\s*:\s*false[^}]*follow\s*:\s*false/s.test(layoutSource)) {
    failures.push(`${layoutPath}: portal namespace must be noindex, nofollow`);
  }
}

if (failures.length > 0) {
  console.error("Public production contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public production contract passed.");
