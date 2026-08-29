import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = async (relative) => {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};

const [sidebar, permissions, domain, pagesRoute, pageManager, pageEditor, projectsRoute, projectManager, projectEditor, projectMedia, projectPicker] = await Promise.all([
  read("src/layout/AppSidebar.tsx"),
  read("src/lib/auth/permissions.ts"),
  read("src/lib/store/secondaryCms.ts"),
  read("src/app/(admin)/store/pages/page.tsx"),
  read("src/components/store/StorePagesManager.tsx"),
  read("src/components/store/StorePageEditor.tsx"),
  read("src/app/(admin)/store/projects/page.tsx"),
  read("src/components/store/StoreProjectsManager.tsx"),
  read("src/components/store/StoreProjectEditor.tsx"),
  read("src/components/store/StoreProjectMediaManager.tsx"),
  read("src/components/store/StoreProjectMediaAssetPicker.tsx"),
]);

assert.match(sidebar, /name:\s*"Pages"[\s\S]*path:\s*"\/store\/pages"[\s\S]*permission:\s*"store\.manage"/, "Pages navigation must require store.manage");
assert.match(sidebar, /name:\s*"Projects"[\s\S]*path:\s*"\/store\/projects"[\s\S]*permission:\s*"store\.manage"/, "Projects navigation must require store.manage");
assert.match(permissions, /\/store\/pages[\s\S]*store\.manage/, "Pages route must require store.manage before the generic Store rule");
assert.match(permissions, /\/store\/projects[\s\S]*store\.manage/, "Projects route must require store.manage before the generic Store rule");

assert.match(domain, /CONTROLLED_PAGE_SLUGS\s*=\s*\["about",\s*"gallery"\]/, "Pages UI must manage only about and gallery");
assert.match(domain, /PROJECT_SLUG_PATTERN\s*=\s*\/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$\//, "Project slug validation must be deterministic");
assert.match(domain, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp[\s\S]*image\/avif/, "Image MIME allowlist must retain JPG/PNG/WebP/AVIF");
assert.match(domain, /20\s*\*\s*1024\s*\*\s*1024/, "Image size limit must remain 20 MB");
assert.match(domain, /validatePageForPublish/, "Page publish validation helper must exist");
assert.match(domain, /validateProjectForPublish/, "Project publish validation helper must exist");
assert.match(domain, /cover_media_asset_id/, "Project domain must carry its linked Media Library cover ID");
assert.match(domain, /media_asset_id/, "Project media domain must carry linked Media Library asset IDs");
assert.match(domain, /attribution_classification/, "Project domain must carry attribution classification");
assert.match(domain, /crypto\.randomUUID\(\)/, "Legacy secondary media helper must retain UUID object naming for non-GC-5 fields");

assert.match(pagesRoute, /StorePagesManager/, "Pages route must render StorePagesManager");
assert.match(pageManager, /CONTROLLED_PAGE_SLUGS/, "Pages manager must load only controlled slugs");
assert.match(pageEditor, /Save draft/, "Pages UI must expose explicit Save draft intent");
assert.match(pageEditor, /Publish/, "Pages UI must expose explicit Publish intent");
assert.match(pageEditor, /Unpublish/, "Pages UI must expose explicit Unpublish intent");
assert.match(pageEditor, /persist\("draft"\)/, "Save draft/unpublish must invoke the draft persistence path");
assert.match(pageEditor, /persist\("published"\)/, "Publish must invoke the published persistence path");
assert.match(pageEditor, /validatePageForPublish/, "Publishing a page must call publish validation");
assert.match(pageEditor, /storage[\s\S]*from\("store-media"\)/, "Page CMS media behavior must remain available outside the GC-5 project-image boundary");

assert.match(projectsRoute, /StoreProjectsManager/, "Projects route must render StoreProjectsManager");
assert.match(projectManager, /hasPermission\(profile\?\.roles,\s*"store\.manage"\)/, "Project mutation controls must honor effective multi-role store.manage permission");
assert.doesNotMatch(projectManager, /includes\(profile\?\.role/, "Project mutation controls must not use the stale single-role gate");
assert.match(projectManager, /title[\s\S]*slug|slug[\s\S]*title/, "Projects manager must support title/slug search");
assert.match(projectManager, /status\s*!==\s*"published"/, "Published projects must not expose delete action");
assert.match(projectManager, /window\.confirm/, "Project delete must require confirmation");

assert.match(projectEditor, /Save draft/, "Projects UI must expose explicit Save draft intent");
assert.match(projectEditor, /Publish/, "Projects UI must expose explicit Publish intent");
assert.match(projectEditor, /Unpublish/, "Projects UI must expose explicit Unpublish intent");
assert.match(projectEditor, /persist\("draft"\)/, "Project draft/unpublish must invoke the draft persistence path");
assert.match(projectEditor, /persist\("published"\)/, "Project publish must invoke the published persistence path");
assert.match(projectEditor, /validateProjectForPublish/, "Publishing a project must call publish validation");
assert.match(projectEditor, /StoreProjectMediaAssetPicker/, "Project cover must be selected from the Media Library");
assert.match(projectEditor, /cover_media_asset_id/, "Project cover selection must persist the Media Library asset ID");
assert.doesNotMatch(projectEditor, /Upload cover image/, "Project cover must not bypass Media Library with a direct upload");
assert.match(projectEditor, /attribution_classification[\s\S]*attribution_text[\s\S]*source_page_url/, "Project editor must manage public portfolio attribution");

assert.ok(projectPicker.trim(), "Project Media Library picker must exist");
assert.match(projectPicker, /status[\s\S]*published/, "Project picker must limit selection to published media");
assert.match(projectPicker, /cabinet_relevance[\s\S]*relevant/, "Project picker must limit selection to relevant cabinetry media");
assert.match(projectPicker, /store_media_asset_sources/, "Project picker must expose provenance context");

assert.match(projectMedia, /media_type:\s*"image"/, "Project media manager must persist image media type");
assert.match(projectMedia, /media_asset_id:\s*selectedAsset\.id/, "Project images must persist Media Library asset identity");
assert.match(projectMedia, /StoreProjectMediaAssetPicker/, "Project images must be selected from the Media Library");
assert.doesNotMatch(projectMedia, /storage\s*\.\s*from\(["']store-media["']\)[\s\S]*?\.upload\(/, "Project images must not upload directly to the public media bucket");
assert.match(projectMedia, /media_type:\s*"video"/, "Project media manager must persist video media type");
assert.match(projectMedia, /media_asset_id:\s*null/, "External videos must not masquerade as Media Library image assets");
assert.match(projectMedia, /isHttpUrl/, "Video entries must use http(s) URL validation");
assert.match(projectMedia, /window\.confirm/, "Project media delete must require confirmation");

const allClientCode = [pageManager, pageEditor, projectManager, projectEditor, projectMedia, projectPicker, domain].join("\n");
assert.doesNotMatch(allClientCode, /service[_-]?role|SUPABASE_SERVICE_ROLE/i, "Secondary CMS client code must never introduce a service-role credential");

console.log("secondary CMS admin contract: ok");
