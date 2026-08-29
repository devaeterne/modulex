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

const [route, intake, browserApi, manager, packageJson] = await Promise.all([
  read("src/app/api/admin/store-media/import/route.ts"),
  read("src/lib/store/gc2MediaIntake.ts"),
  read("src/lib/store/mediaApi.ts"),
  read("src/components/store/StoreMediaLibraryManager.tsx"),
  read("package.json"),
]);

assert.match(route, /runtime\s*=\s*["']nodejs["']/, "Controlled intake must run in the Node.js runtime");
assert.match(route, /Authorization|authorization/, "Controlled intake must require the current Admin bearer session");
assert.match(route, /candidate_id/, "Controlled intake route must accept only a candidate identifier");
assert.match(route, /importGc2dRepresentativeCandidate\(accessToken,\s*payload\.candidate_id\)/, "Controlled intake route must delegate candidate validation to the server-side allowlist");
assert.doesNotMatch(route, /source[_-]?url\s*[:=]\s*(body|payload|request)/i, "Controlled intake must not accept an arbitrary source URL from the browser");

assert.match(intake, /CONTROLLED_CANDIDATES/, "Controlled intake must define a server-owned candidate allowlist");
for (const candidateId of ["media-showroom-01", "media-kitchen-01", "media-kitchen-02", "media-kitchen-03"]) {
  assert.match(intake, new RegExp(candidateId), `${candidateId} must remain in the controlled server candidate allowlist`);
  assert.match(browserApi, new RegExp(candidateId), `${candidateId} must remain in the browser candidate ID union`);
}
assert.match(intake, /function getCandidate\(candidateId:\s*string\)/, "Controlled intake must resolve browser identifiers through the server-owned allowlist");
assert.match(intake, /Unknown controlled media candidate/, "Unknown candidate identifiers must fail closed");

assert.match(intake, /createClient/, "Controlled intake must create a Supabase client scoped to the caller JWT");
assert.match(intake, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/, "Controlled intake must use the browser-safe project key with caller JWT + RLS");
assert.match(intake, /Authorization[\s\S]*Bearer/, "Caller JWT must be propagated to Supabase for RLS enforcement");
assert.doesNotMatch(intake, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin/, "Controlled staging intake must not require elevated Supabase credentials");
assert.match(intake, /auth\.getUser/, "Controlled intake must validate the caller token server-side");
assert.match(intake, /from\(["']profiles["']\)/, "Controlled intake must verify the active Admin profile");
assert.match(intake, /from\(["']user_roles["']\)/, "Controlled intake must include effective multi-role assignments");
assert.match(intake, /super_admin[\s\S]*admin|admin[\s\S]*super_admin/, "Controlled intake must restrict execution to Admin roles");

assert.match(intake, /from\(["']store_media_assets["']\)/, "Controlled intake must register the review asset");
assert.match(intake, /from\(["']store_media_asset_sources["']\)/, "Controlled intake must register provenance");
assert.match(intake, /store-media-staging/, "Controlled intake must write only to private staging");
assert.doesNotMatch(intake, /storage\.from\(["']store-media["']\)/, "Controlled intake must never publish public media");
assert.match(intake, /original_sha256/, "Controlled intake must dedupe by the exact original SHA-256");
assert.match(intake, /select\(["']id,status,staging_original_path,staging_optimized_path["']\)/, "Duplicate lookup must retain current lifecycle status");
assert.match(intake, /duplicate\.status\s*===\s*["']published["']/, "Duplicate intake must report the existing published state without mutating it");
assert.match(intake, /async function ensureDuplicateStagingObjects/, "Duplicate intake must verify and repair its private staging objects");
assert.match(intake, /ensureDuplicateStagingObjects\(client, duplicate, source, processed\)/, "Duplicate intake must self-heal staging before returning the existing asset");
assert.match(intake, /createHash\(["']sha256["']\)/, "Controlled intake must hash source and optimized bytes");
assert.match(intake, /\.rotate\(\)/, "Controlled optimization must auto-orient source images");
assert.match(intake, /webp\(\{[\s\S]*quality:\s*80[\s\S]*smartSubsample:\s*true/, "Controlled optimization must retain the approved WebP settings");
assert.match(intake, /withoutEnlargement:\s*true/, "Controlled optimization must never upscale media");
assert.match(intake, /20\s*\*\s*1024\s*\*\s*1024/, "Controlled downloads must retain the 20 MB hard limit");
assert.match(intake, /granitecenterva\.com/, "Controlled source download must retain the Granite host allowlist");
assert.match(intake, /remove\(/, "Controlled registration must roll back staged objects after a failed registration");
assert.match(intake, /status:\s*["']review["']/, "Fresh imports must enter review rather than publish");
assert.match(intake, /cabinet_relevance:\s*["']unreviewed["']/, "Cabinet relevance must remain a human review decision");
assert.match(intake, /default_alt_text:\s*null/, "Approval alt text must remain a human review decision");

const pkg = JSON.parse(packageJson || "{}");
assert.equal(pkg.dependencies?.sharp, "0.35.4", "Admin must pin the exact approved sharp@0.35.4 pipeline version");
assert.match(pkg.scripts?.build || "", /next build\s+--webpack\b/, "Admin production build must use Webpack so Vercel traces sharp/libvips into the function runtime");

assert.match(browserApi, /CONTROLLED_STORE_MEDIA_CANDIDATES/, "Media browser API must expose the controlled candidate set");
assert.match(browserApi, /importStoreMediaCandidate/, "Media browser API must expose controlled intake");
assert.match(browserApi, /\/api\/admin\/store-media\/import/, "Media browser API must call the server-side intake route");
assert.match(manager, /CONTROLLED_STORE_MEDIA_CANDIDATES\.map/, "Media Library must render candidate options from the controlled browser set");
assert.match(manager, /private staging/i, "Media Library must explain that intake does not publish the asset");

console.log("Controlled server-side media intake contract: PASS");
