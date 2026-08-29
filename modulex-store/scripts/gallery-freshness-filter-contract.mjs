import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [queries, galleryPage, gallery] = await Promise.all([
  read("src/lib/store/content/queries.ts"),
  read("src/app/gallery/page.tsx"),
  read("src/components/gallery/StoreProjectsGallery.tsx"),
]);

assert.match(
  queries,
  /const\s+GALLERY_REVALIDATE_SECONDS\s*=\s*60/,
  "Gallery CMS data should refresh within about one minute",
);
assert.match(
  queries,
  /getStoreGalleryPage[\s\S]*revalidate:\s*GALLERY_REVALIDATE_SECONDS/,
  "Gallery page content should use the shorter Gallery cache window",
);
assert.match(
  queries,
  /get_store_public_projects[\s\S]*revalidate:\s*GALLERY_REVALIDATE_SECONDS/,
  "Published project lists should use the shorter Gallery cache window",
);
assert.match(
  queries,
  /get_store_public_project_media[\s\S]*revalidate:\s*GALLERY_REVALIDATE_SECONDS/,
  "Published project media should use the shorter Gallery cache window",
);
assert.match(
  galleryPage,
  /export\s+const\s+revalidate\s*=\s*60/,
  "The Gallery route should revalidate within about one minute",
);

assert.match(gallery, /activeCategory/, "Gallery should expose a category filter state");
assert.match(gallery, /aria-pressed=/, "Gallery category filters should expose pressed state accessibly");
assert.match(
  gallery,
  /entry\.project\.category\s*===\s*activeCategory/,
  "Gallery category filtering should use each project's CMS category",
);
assert.match(gallery, />All</, "Gallery should offer an All filter");

console.log("Gallery freshness/filter contract: PASS");
