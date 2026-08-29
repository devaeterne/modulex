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

const [projectsManager, editor, mediaManager, picker, mediaRoute, intake, importRoute, mediaLibraryManager] = await Promise.all([
  read("src/components/store/StoreProjectsManager.tsx"),
  read("src/components/store/StoreProjectEditor.tsx"),
  read("src/components/store/StoreProjectMediaManager.tsx"),
  read("src/components/store/StoreProjectMediaAssetPicker.tsx"),
  read("src/app/api/admin/store-media/route.ts"),
  read("src/lib/store/gc2MediaIntake.ts"),
  read("src/app/api/admin/store-media/import/route.ts"),
  read("src/components/store/StoreMediaLibraryManager.tsx"),
]);

assert.match(projectsManager, /hasPermission\(profile\?\.roles,\s*["']store\.manage["']\)/, "Projects manager must use effective multi-role store.manage authorization");
assert.doesNotMatch(projectsManager, /includes\(profile\?\.role/, "Projects manager must not use the legacy single-role edit gate");
assert.match(projectsManager, /cover_media_asset_id/, "Projects manager must load the linked cover asset ID");
assert.match(projectsManager, /attribution_classification/, "Projects manager must load project attribution");

assert.ok(picker.trim(), "GC-5 must provide a focused project Media Library picker");
assert.match(picker, /published/, "Project media picker must filter to published assets");
assert.match(picker, /relevant/, "Project media picker must filter to cabinet-relevant assets");
assert.match(picker, /store_media_asset_sources/, "Project media picker must expose provenance context");
assert.doesNotMatch(picker, /source[_-]?url\s*[:=]\s*(body|payload|request)/i, "Project media picker must not accept arbitrary source URLs");

assert.match(editor, /cover_media_asset_id/, "Project cover must persist a Media Library asset ID");
assert.match(editor, /StoreProjectMediaAssetPicker/, "Project cover must be selected from Media Library");
assert.doesNotMatch(editor, /Upload cover image/, "Canonical project cover must no longer be uploaded directly from the project editor");
assert.match(editor, /attribution_classification/, "Project editor must manage attribution classification");
assert.match(editor, /attribution_text/, "Project editor must manage attribution text");
assert.match(editor, /source_page_url/, "Project editor must manage source page URL");

assert.match(mediaManager, /media_asset_id/, "Project image rows must persist Media Library asset IDs");
assert.match(mediaManager, /StoreProjectMediaAssetPicker/, "Project images must be selected from Media Library");
assert.doesNotMatch(mediaManager, /storage\s*\.\s*from\(["']store-media["']\)[\s\S]*?\.upload\(/, "Project image manager must not upload project images directly to public storage");
assert.match(mediaManager, /media_type[\s\S]*video/, "External video compatibility must remain explicit");

assert.match(mediaRoute, /cover_media_asset_id/, "Media lifecycle must detect structural project cover references");
assert.match(mediaRoute, /media_asset_id/, "Media lifecycle must detect structural project media references");
assert.match(mediaRoute, /409/, "Referenced assets must remain fail-closed on lifecycle operations");

assert.match(intake, /media-showroom-01/, "Existing GC-2D showroom candidate must remain supported");
assert.match(intake, /media-kitchen-0[1-9]|media-kitchen-10/, "Controlled intake must include manifest-backed GC-5 kitchen candidates");
assert.match(intake, /user_roles/, "Controlled intake must evaluate effective multi-role assignments");
assert.doesNotMatch(intake, /new Set\(\[["']super_admin["'],\s*["']admin["']\]\)\.has\(profile\.role\)/, "Controlled intake must not authorize only from profiles.role");
assert.doesNotMatch(importRoute, /source[_-]?url/i, "Controlled intake route must not accept arbitrary source URLs");
assert.match(mediaLibraryManager, /private staging/i, "Media Library must continue explaining that controlled intake does not publish automatically");

console.log("GC-5 Admin gallery/projects contract: PASS");
