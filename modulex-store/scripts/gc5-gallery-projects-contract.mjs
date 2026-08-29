import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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

async function readGc5Migration() {
  const dir = path.join(root, "supabase", "migrations");
  const files = await readdir(dir);
  const filename = files.find((entry) => entry.endsWith("_gc5_gallery_projects_media_library.sql"));
  if (!filename) return { filename: "", content: "" };
  return { filename, content: await read(path.join("supabase", "migrations", filename)) };
}

const [{ filename: migrationFilename, content: migration }, queries, gallery, galleryPage] = await Promise.all([
  readGc5Migration(),
  read("src/lib/store/content/queries.ts"),
  read("src/components/gallery/StoreProjectsGallery.tsx"),
  read("src/app/gallery/page.tsx"),
]);

assert.ok(migrationFilename, "GC-5 must have a CLI-generated gc5_gallery_projects_media_library migration");
assert.match(migration, /cover_media_asset_id\s+uuid/i, "Projects must link their cover to a Media Library asset ID");
assert.match(migration, /media_asset_id\s+uuid/i, "Project image rows must link to Media Library asset IDs");
assert.match(migration, /attribution_classification/i, "Projects must store structured attribution classification");
assert.match(migration, /attribution_text/i, "Projects must store visible attribution text");
assert.match(migration, /source_page_url/i, "Parent-attributed projects must retain their source page URL");
assert.match(migration, /cabinet_relevance\s*=\s*'relevant'/i, "GC-5 project images must require relevant cabinet imagery");
assert.match(migration, /store-media/i, "GC-5 project images must resolve only published store-media objects");

assert.match(
  migration,
  /create\s+or\s+replace\s+function\s+private\.store_current_user_has_any_role\s*\(allowed_roles\s+text\[\]\)/i,
  "GC-5 must reconcile a Store-local effective-role helper for clean migration replay",
);
assert.match(migration, /to_regclass\s*\(\s*'public\.user_roles'\s*\)/i, "Store role reconciliation must detect optional multi-role storage safely");
assert.match(migration, /public\.profiles/i, "Store role reconciliation must retain legacy profile.role fallback");
assert.match(migration, /store_current_user_has_any_role\s*\(array\['super_admin',\s*'admin',\s*'sales'\]/i, "Store read policies must use the reconciled effective-role helper");
assert.match(migration, /store_current_user_has_any_role\s*\(array\['super_admin',\s*'admin'\]/i, "Store write policies must use the reconciled effective-role helper");

assert.match(
  migration,
  /create\s+or\s+replace\s+function\s+private\.store_project_requires_parent_attribution\s*\(p_project_id\s+uuid\)/i,
  "GC-5 must derive whether any linked project asset requires parent attribution",
);
assert.match(
  migration,
  /store_project_requires_parent_attribution[\s\S]*cover_media_asset_id[\s\S]*attribution_classification\s*=\s*'parent_attributed'/i,
  "Parent-attribution derivation must include the linked cover asset",
);
assert.match(
  migration,
  /store_project_requires_parent_attribution[\s\S]*store_project_media[\s\S]*media_asset_id[\s\S]*attribution_classification\s*=\s*'parent_attributed'/i,
  "Parent-attribution derivation must include linked project image assets",
);
assert.match(
  migration,
  /store_project_is_publishable[\s\S]*store_project_requires_parent_attribution\(p\.id\)[\s\S]*p\.attribution_classification\s*=\s*'parent_attributed'/i,
  "A project using parent-attributed assets must itself publish as parent-attributed",
);

for (const fn of ["get_store_public_projects", "get_store_public_project", "get_store_public_project_media"]) {
  const publicFunction = migration.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}[\\s\\S]*?(?=create\\s+or\\s+replace\\s+function|revoke|grant|$)`, "i"))?.[0] ?? "";
  assert.ok(publicFunction, `GC-5 migration must replace public.${fn}`);
  assert.match(publicFunction, /security\s+invoker/i, `public.${fn} must be SECURITY INVOKER`);
  assert.doesNotMatch(publicFunction, /security\s+definer/i, `public.${fn} must not remain SECURITY DEFINER`);
}

assert.match(migration, /(store_api_private|private)\.[a-z0-9_]*get_store_public_projects/i, "Privileged project projection implementation must live outside public schema");
assert.match(migration, /revoke\s+all\s+on\s+function[\s\S]*from\s+public/i, "Project RPC execution grants must be explicit");
assert.match(migration, /grant\s+execute\s+on\s+function[\s\S]*to\s+anon/i, "Public wrappers must explicitly grant anon execution");

assert.match(queries, /attributionClassification/, "Store public project type must expose attribution classification");
assert.match(queries, /attributionText/, "Store public project type must expose attribution text");
assert.match(queries, /sourcePageUrl/, "Store public project type must expose the source page URL");
assert.match(gallery, /attributionClassification/, "Gallery must branch on project attribution classification");
assert.match(gallery, /attributionText/, "Gallery must visibly render parent attribution text");
assert.match(galleryPage, /isReady/, "Gallery route must continue using the readiness gate");
assert.match(galleryPage, /notFound\(\)/, "Gallery route must remain fail-closed when readiness is false");
assert.match(galleryPage, /index:\s*false/, "Unavailable Gallery metadata must remain noindex");
assert.match(queries, /Boolean\(page\s*&&\s*projects\.length\s*>\s*0\)/, "Gallery readiness must still require both a published page and a published project");

console.log("GC-5 Store gallery/projects contract: PASS");
