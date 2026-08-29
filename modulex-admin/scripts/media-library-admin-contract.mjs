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
  page,
  manager,
  editor,
  browserApi,
  route,
] = await Promise.all([
  read("src/layout/AppSidebar.tsx"),
  read("src/lib/auth/permissions.ts"),
  read("src/lib/store/mediaLibrary.ts"),
  read("src/app/(admin)/store/media/page.tsx"),
  read("src/components/store/StoreMediaLibraryManager.tsx"),
  read("src/components/store/StoreMediaAssetEditor.tsx"),
  read("src/lib/store/mediaApi.ts"),
  read("src/app/api/admin/store-media/route.ts"),
]);

assert.match(sidebar, /name:\s*"Media Library"[\s\S]*path:\s*"\/store\/media"[\s\S]*permission:\s*"store\.manage"/, "Media Library navigation must require store.manage");
assert.match(permissions, /\/store\/media[\s\S]*store\.manage/, "Media Library route must require store.manage before the generic Store rule");
assert.match(page, /StoreMediaLibraryManager/, "Media Library page must render StoreMediaLibraryManager");
assert.match(page, /Store Media Library \| Modulex Admin/, "Media Library page must define the approved metadata title");

assert.match(domain, /StoreMediaStatus\s*=\s*"draft"\s*\|\s*"review"\s*\|\s*"approved"\s*\|\s*"published"\s*\|\s*"rejected"/, "Media lifecycle type must be explicit");
assert.match(domain, /StoreMediaAttribution\s*=\s*"oakwell_owned"\s*\|\s*"parent_attributed"\s*\|\s*"unverified_hold"/, "Attribution lifecycle type must be explicit");
assert.match(domain, /StoreMediaCabinetRelevance\s*=\s*"unreviewed"\s*\|\s*"relevant"\s*\|\s*"mixed"\s*\|\s*"irrelevant"/, "Cabinet relevance type must be explicit");
assert.match(domain, /validateMediaReviewUpdate/, "Media review validation helper must exist");
assert.match(domain, /approved[\s\S]*default[_A-Za-z]*alt|default[_A-Za-z]*alt[\s\S]*approved/i, "Approval validation must require default alt text");
assert.match(domain, /unverified_hold/, "Approval validation must account for unverified-hold attribution");
assert.match(domain, /relevant[\s\S]*mixed|mixed[\s\S]*relevant/, "Approval validation must constrain cabinet relevance");
assert.doesNotMatch(domain, /public_url/i, "Media domain must store bucket/path locators rather than a canonical absolute public URL");

assert.match(manager, /from\("store_media_assets"\)/, "Media manager must load media assets");
assert.match(manager, /from\("store_media_asset_sources"\)/, "Media manager must load provenance rows");
assert.match(manager, /status/i, "Media manager must expose status filtering");
assert.match(manager, /attribution/i, "Media manager must expose attribution filtering");
assert.match(manager, /relevance/i, "Media manager must expose cabinet-relevance filtering");
assert.match(manager, /source_candidate_id|source_label/, "Media manager search must include provenance context");
assert.match(manager, /createSignedUrl/, "Private staging assets must use short-lived authenticated signed previews");
assert.match(manager, /store-media-staging|staging_bucket/, "Signed preview generation must be tied to private staging locators");
assert.match(manager, /previewUrl|preview_url|previewUrls/i, "Media list/detail must maintain preview state");
assert.doesNotMatch(manager, /createPublicUrl[\s\S]*store-media-staging|store-media-staging[\s\S]*createPublicUrl/, "Private staging must never be exposed as a public browser URL");

assert.match(editor, /default alt/i, "Editor must explain/edit default alt text");
assert.match(editor, /review notes/i, "Editor must expose review notes");
assert.match(editor, /original_sha256|Original SHA-256/, "Editor must show verified original checksum");
assert.match(editor, /optimized_sha256|Optimized SHA-256/, "Editor must show verified optimized checksum");
assert.match(editor, /Publish/, "Approved assets must expose explicit Publish intent");
assert.match(editor, /Unpublish/, "Published assets must expose explicit Unpublish intent");
assert.match(editor, /Delete/, "Non-published assets must expose explicit Delete intent");

assert.match(browserApi, /auth\.getSession\(\)/, "Browser lifecycle helper must read the current Supabase session");
assert.match(browserApi, /Authorization[\s\S]*Bearer/i, "Browser lifecycle helper must send bearer authorization");
assert.match(browserApi, /publish|unpublish/, "Browser lifecycle helper must support publish and unpublish actions");
assert.match(browserApi, /DELETE/, "Browser lifecycle helper must support hard delete");

assert.match(route, /requireAdmin/, "Lifecycle API must authorize through requireAdmin");
assert.match(route, /supabaseAdmin/, "Lifecycle API must use the server-only elevated Supabase client after authorization");
assert.match(route, /createHash\("sha256"\)/, "Publish verification must calculate SHA-256 from actual bytes");
assert.match(route, /optimized_bytes/, "Publish verification must compare optimized byte length");
assert.match(route, /optimized_sha256/, "Publish verification must compare optimized checksum");
assert.match(route, /status\s*!==\s*"approved"|eq\("status",\s*"approved"\)/, "Publish must be restricted to approved assets");
assert.match(route, /media\/\$\{asset\.id\}\/\$\{asset\.optimized_sha256\}\.webp/, "Published object path must be immutable and content-addressed");
assert.match(route, /upsert:\s*false/, "Publish must never overwrite a public object");
assert.match(route, /store-media-staging/, "Publish must read the approved derivative from private staging");
assert.match(route, /store-media/, "Publish must write only to the approved public media bucket");
assert.match(route, /createdPublicObject[\s\S]*remove/, "Publish must clean up a newly-created public object if DB finalization fails");
assert.match(route, /store_pages[\s\S]*hero_image_url[\s\S]*og_image_url/, "Unpublish/delete reference guard must check page image fields");
assert.match(route, /store_projects[\s\S]*cover_image_url[\s\S]*og_image_url/, "Unpublish/delete reference guard must check project image fields");
assert.match(route, /store_project_media[\s\S]*media_url/, "Unpublish/delete reference guard must check project media URLs");
assert.match(route, /store_site_settings[\s\S]*(hero_poster_url|hero_panorama_url|homepage_og_image_url)/, "Unpublish/delete reference guard must check current site-setting image URLs");
assert.match(route, /409/, "Referenced assets must fail closed with conflict status");
assert.match(route, /status:\s*"approved"[\s\S]*public_bucket:\s*null[\s\S]*public_path:\s*null/, "Unpublish must clear public locators and return the asset to approved state");
assert.match(route, /status\s*===\s*"published"[\s\S]*unpublished before deletion/i, "Hard delete must reject published assets");
assert.match(route, /staging_original_path[\s\S]*staging_optimized_path[\s\S]*remove/, "Hard delete must remove controlled private staging objects");

const browserCode = [domain, manager, editor, browserApi].join("\n");
assert.doesNotMatch(browserCode, /server-admin|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i, "Browser Media Library code must never import or reference elevated credentials");

console.log("GC-2 Media Library Admin contract: PASS");
