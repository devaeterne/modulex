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

const [
  sidebar,
  permissions,
  domain,
  pagesRoute,
  pageManager,
  pageEditor,
  projectsRoute,
  projectManager,
  projectEditor,
  projectMedia,
] = await Promise.all([
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
assert.match(domain, /crypto\.randomUUID\(\)/, "Store media object keys must include a UUID segment");

assert.match(pagesRoute, /StorePagesManager/, "Pages route must render StorePagesManager");
assert.match(pageManager, /CONTROLLED_PAGE_SLUGS/, "Pages manager must load only controlled slugs");
assert.match(pageManager, /\["super_admin",\s*"admin"\]/, "Only Admin roles may receive mutation controls");
assert.match(pageEditor, />Save draft</, "Pages UI must expose explicit Save draft intent");
assert.match(pageEditor, />Publish</, "Pages UI must expose explicit Publish intent");
assert.match(pageEditor, />Unpublish</, "Pages UI must expose explicit Unpublish intent");
assert.match(pageEditor, /validatePageForPublish/, "Publishing a page must call publish validation");
assert.match(pageEditor, /status:\s*"draft"/, "Save draft/unpublish must explicitly persist draft status");
assert.match(pageEditor, /status:\s*"published"/, "Publish must explicitly persist published status");
assert.match(pageEditor, /storage[\s\S]*from\("store-media"\)/, "Page images must upload to store-media");

assert.match(projectsRoute, /StoreProjectsManager/, "Projects route must render StoreProjectsManager");
assert.match(projectManager, /title[\s\S]*slug|slug[\s\S]*title/, "Projects manager must support title/slug search");
assert.match(projectManager, /status\s*!==\s*"published"/, "Published projects must not expose delete action");
assert.match(projectManager, /window\.confirm/, "Project delete must require confirmation");
assert.match(projectEditor, />Save draft</, "Projects UI must expose explicit Save draft intent");
assert.match(projectEditor, />Publish</, "Projects UI must expose explicit Publish intent");
assert.match(projectEditor, />Unpublish</, "Projects UI must expose explicit Unpublish intent");
assert.match(projectEditor, /validateProjectForPublish/, "Publishing a project must call publish validation");
assert.match(projectEditor, /status:\s*"draft"/, "Project draft/unpublish must explicitly persist draft status");
assert.match(projectEditor, /status:\s*"published"/, "Project publish must explicitly persist published status");
assert.match(projectEditor, /storage[\s\S]*from\("store-media"\)/, "Project cover/OG images must upload to store-media");

assert.match(projectMedia, /media_type:\s*"image"/, "Project media manager must persist image media type");
assert.match(projectMedia, /media_type:\s*"video"/, "Project media manager must persist video media type");
assert.match(projectMedia, /isHttpUrl/, "Video entries must use http(s) URL validation");
assert.match(projectMedia, /storage[\s\S]*from\("store-media"\)/, "Project images must upload to store-media");
assert.match(projectMedia, /window\.confirm/, "Project media delete must require confirmation");

const allClientCode = [pageManager, pageEditor, projectManager, projectEditor, projectMedia, domain].join("\n");
assert.doesNotMatch(allClientCode, /service[_-]?role|SUPABASE_SERVICE_ROLE/i, "Secondary CMS client code must never introduce a service-role credential");

console.log("secondary CMS admin contract: ok");
