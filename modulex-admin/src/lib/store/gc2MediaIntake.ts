import "server-only";

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STAGING_BUCKET = "store-media-staging";
const SOURCE_SITE = "granitecenterva.com";
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TARGET_LONG_EDGE = 2560;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_SOURCE_HOSTS = new Set(["granitecenterva.com", "www.granitecenterva.com"]);

type ControlledCandidate = Readonly<{
  id: string;
  sourcePageId: string;
  sourcePageUrl: string;
  sourceUrl: string;
  sourceBrand: "Granite & Cabinet Center";
  sourceLabel: string;
  title: string;
  migrationDisposition: "parent_attributed";
  attributionClassification: "parent_attributed";
  attributionRequired: true;
  notes: string;
}>;

const CONTROLLED_CANDIDATES: Record<string, ControlledCandidate> = Object.freeze({
  "media-showroom-01": Object.freeze({
    id: "media-showroom-01",
    sourcePageId: "page-showroom",
    sourcePageUrl: "https://granitecenterva.com/about-us/showroom/",
    sourceUrl: "https://granitecenterva.com/wp-content/uploads/2016/11/Showroom1.jpg",
    sourceBrand: "Granite & Cabinet Center",
    sourceLabel: "SHOWROOM",
    title: "Granite & Cabinet Center showroom source",
    migrationDisposition: "parent_attributed",
    attributionClassification: "parent_attributed",
    attributionRequired: true,
    notes: "Source showroom asset imported for controlled review; publication requires explicit Admin approval.",
  }),
  "media-kitchen-01": Object.freeze({
    id: "media-kitchen-01",
    sourcePageId: "page-residential",
    sourcePageUrl: "https://granitecenterva.com/residential/",
    sourceUrl: "https://granitecenterva.com/wp-content/uploads/2016/11/Kitchen-1.jpeg",
    sourceBrand: "Granite & Cabinet Center",
    sourceLabel: "KITCHEN",
    title: "Granite & Cabinet Center kitchen project source 01",
    migrationDisposition: "parent_attributed",
    attributionClassification: "parent_attributed",
    attributionRequired: true,
    notes: "GC-1 residential kitchen candidate. Human review must confirm cabinetry relevance before approval or project use.",
  }),
  "media-kitchen-02": Object.freeze({
    id: "media-kitchen-02",
    sourcePageId: "page-residential",
    sourcePageUrl: "https://granitecenterva.com/residential/",
    sourceUrl: "https://granitecenterva.com/wp-content/uploads/2016/11/Kitchen-2-683x1024.jpeg",
    sourceBrand: "Granite & Cabinet Center",
    sourceLabel: "KITCHEN",
    title: "Granite & Cabinet Center kitchen project source 02",
    migrationDisposition: "parent_attributed",
    attributionClassification: "parent_attributed",
    attributionRequired: true,
    notes: "GC-1 residential kitchen candidate. Human review must confirm cabinetry relevance before approval or project use.",
  }),
  "media-kitchen-03": Object.freeze({
    id: "media-kitchen-03",
    sourcePageId: "page-residential",
    sourcePageUrl: "https://granitecenterva.com/residential/",
    sourceUrl: "https://granitecenterva.com/wp-content/uploads/2016/11/Kitchen-3.jpeg",
    sourceBrand: "Granite & Cabinet Center",
    sourceLabel: "KITCHEN",
    title: "Granite & Cabinet Center kitchen project source 03",
    migrationDisposition: "parent_attributed",
    attributionClassification: "parent_attributed",
    attributionRequired: true,
    notes: "GC-1 residential kitchen candidate. Human review must confirm cabinetry relevance before approval or project use.",
  }),
});

export type Gc2dIntakeResult = {
  status: "created" | "duplicate";
  candidateId: string;
  assetId: string;
  source: { url: string; finalUrl: string };
  original: { mimeType: string; width: number; height: number; bytes: number; sha256: string };
  optimized: { mimeType: "image/webp"; width: number; height: number; bytes: number; sha256: string };
  staging: { bucket: typeof STAGING_BUCKET; originalPath: string | null; optimizedPath: string | null };
  published: boolean;
};

export class Gc2dIntakeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "Gc2dIntakeError";
  }
}

type UserScopedContext = { client: SupabaseClient; userId: string };
type SourceDownload = { bytes: Buffer; finalUrl: string; filename: string };
type ProcessedImage = {
  original: { format: string; mimeType: string; width: number; height: number; bytes: number; sha256: string };
  optimized: { mimeType: "image/webp"; width: number; height: number; bytes: number; sha256: string };
  optimizedBytes: Buffer;
};
type DuplicateAsset = { id: string; status: string; staging_original_path: string | null; staging_optimized_path: string | null };
type StorageErrorLike = { message?: string; status?: number; statusCode?: number | string };

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isMissingStorageObject(error: unknown) {
  const candidate = error as StorageErrorLike | null;
  const status = candidate?.statusCode ?? candidate?.status;
  return status === 404 || status === "404" || /not found|does not exist/i.test(candidate?.message ?? "");
}

function requireSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Gc2dIntakeError("Supabase public runtime configuration is unavailable.", 503);
  return { url, publishableKey };
}

async function requireUserScopedAdmin(accessToken: string): Promise<UserScopedContext> {
  const { url, publishableKey } = requireSupabasePublicConfig();
  const client = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) throw new Gc2dIntakeError("Authentication required.", 401);

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile || !profile.is_active) throw new Gc2dIntakeError("Active Admin access is required.", 403);

  const { data: roleRows, error: rolesError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (rolesError) throw new Gc2dIntakeError("Unable to verify effective Admin roles.", 403);

  const effectiveRoles = new Set<string>([profile.role, ...(roleRows ?? []).map((row) => String(row.role))]);
  if (![...effectiveRoles].some((role) => role === "super_admin" || role === "admin")) {
    throw new Gc2dIntakeError("Admin access is required.", 403);
  }
  return { client, userId: userData.user.id };
}

function getCandidate(candidateId: string) {
  const candidate = CONTROLLED_CANDIDATES[candidateId];
  if (!candidate) throw new Gc2dIntakeError("Unknown controlled media candidate.", 400);
  return candidate;
}

function validateSourceUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Gc2dIntakeError("Controlled media source URL is invalid.", 500); }
  if (parsed.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Gc2dIntakeError("Controlled media source is outside the approved host allowlist.", 500);
  }
  return parsed;
}

async function readBoundedBody(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_SOURCE_BYTES) throw new Gc2dIntakeError("Controlled media source exceeds the 20 MB limit.", 502);
  }
  if (!response.body) throw new Gc2dIntakeError("Controlled media source returned no body.", 502);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel("Controlled source exceeded 20 MB limit");
        throw new Gc2dIntakeError("Controlled media source exceeds the 20 MB limit.", 502);
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

async function downloadControlledSource(candidate: ControlledCandidate): Promise<SourceDownload> {
  let currentUrl = validateSourceUrl(candidate.sourceUrl).toString();
  let redirects = 0;
  while (true) {
    const response = await fetch(currentUrl, {
      method: "GET", redirect: "manual", cache: "no-store",
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.1", "user-agent": "Oakwell-Controlled-Media-Intake/1.0" },
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Gc2dIntakeError(`Controlled media source exceeded ${MAX_REDIRECTS} redirects.`, 502);
      const location = response.headers.get("location");
      if (!location) throw new Gc2dIntakeError("Controlled media redirect is missing Location.", 502);
      currentUrl = validateSourceUrl(new URL(location, currentUrl).toString()).toString();
      redirects += 1;
      continue;
    }
    if (!response.ok) throw new Gc2dIntakeError(`Controlled media source returned HTTP ${response.status}.`, 502);
    const bytes = await readBoundedBody(response);
    const basename = new URL(currentUrl).pathname.split("/").filter(Boolean).at(-1) ?? "source-image";
    return { bytes, finalUrl: currentUrl, filename: decodeURIComponent(basename) };
  }
}

function originalMimeType(format: string) {
  const map: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
  const value = map[format.toLowerCase()];
  if (!value) throw new Gc2dIntakeError(`Unsupported decoded source format: ${format}.`, 422);
  return value;
}
function originalExtension(format: string) {
  const map: Record<string, string> = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", avif: "avif" };
  const value = map[format.toLowerCase()];
  if (!value) throw new Gc2dIntakeError(`Unsupported decoded source format: ${format}.`, 422);
  return value;
}

async function processImage(bytes: Buffer): Promise<ProcessedImage> {
  if (bytes.length < 1 || bytes.length > MAX_SOURCE_BYTES) throw new Gc2dIntakeError("Controlled media source bytes are invalid.", 422);
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Gc2dIntakeError("Unable to verify controlled media metadata.", 422);
  let pipeline = sharp(bytes, { failOn: "error" }).rotate();
  if (Math.max(metadata.width, metadata.height) > TARGET_LONG_EDGE) {
    pipeline = pipeline.resize({ width: TARGET_LONG_EDGE, height: TARGET_LONG_EDGE, fit: "inside", withoutEnlargement: true });
  }
  const optimizedBytes = await pipeline.webp({ quality: 80, smartSubsample: true }).toBuffer();
  const output = await sharp(optimizedBytes, { failOn: "error" }).metadata();
  if (!output.width || !output.height || output.format !== "webp") throw new Gc2dIntakeError("Unable to verify optimized WebP output.", 422);
  return {
    original: { format: metadata.format, mimeType: originalMimeType(metadata.format), width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: sha256(bytes) },
    optimized: { mimeType: "image/webp", width: output.width, height: output.height, bytes: optimizedBytes.length, sha256: sha256(optimizedBytes) },
    optimizedBytes,
  };
}

function runId() {
  return `${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

async function upsertProvenance(client: SupabaseClient, assetId: string, candidate: ControlledCandidate) {
  const provenance = {
    media_asset_id: assetId, source_site: SOURCE_SITE, source_brand: candidate.sourceBrand,
    source_candidate_id: candidate.id, source_url: candidate.sourceUrl, source_page_url: candidate.sourcePageUrl,
    source_page_id: candidate.sourcePageId, source_label: candidate.sourceLabel,
    migration_disposition: candidate.migrationDisposition, attribution_required: candidate.attributionRequired,
    notes: candidate.notes, discovered_at: null,
  };
  const { data: existing, error: findError } = await client.from("store_media_asset_sources").select("id")
    .eq("media_asset_id", assetId).eq("source_candidate_id", candidate.id).maybeSingle();
  if (findError) throw findError;
  if (existing?.id) {
    const { error } = await client.from("store_media_asset_sources").update(provenance).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("store_media_asset_sources").insert(provenance);
    if (error) throw error;
  }
}

async function ensureDuplicateStagingObjects(client: SupabaseClient, duplicate: DuplicateAsset, source: SourceDownload, processed: ProcessedImage) {
  if (!duplicate.staging_original_path || !duplicate.staging_optimized_path) throw new Gc2dIntakeError("Duplicate media is missing private staging locator metadata.", 409);
  const expected = [
    { path: duplicate.staging_original_path, bytes: source.bytes, contentType: processed.original.mimeType, sha256: processed.original.sha256 },
    { path: duplicate.staging_optimized_path, bytes: processed.optimizedBytes, contentType: processed.optimized.mimeType, sha256: processed.optimized.sha256 },
  ];
  for (const item of expected) {
    const { data, error } = await client.storage.from(STAGING_BUCKET).download(item.path);
    if (!error && data) {
      const existingBytes = Buffer.from(await data.arrayBuffer());
      if (existingBytes.byteLength !== item.bytes.byteLength || sha256(existingBytes) !== item.sha256) throw new Gc2dIntakeError(`Duplicate staging object failed integrity verification: ${item.path}`, 409);
      continue;
    }
    if (!isMissingStorageObject(error)) throw error;
    const { error: uploadError } = await client.storage.from(STAGING_BUCKET).upload(item.path, item.bytes, { contentType: item.contentType, upsert: false });
    if (uploadError) throw uploadError;
  }
}

function resultFrom(status: Gc2dIntakeResult["status"], assetId: string, candidate: ControlledCandidate, source: SourceDownload, processed: ProcessedImage, originalPath: string | null, optimizedPath: string | null, published = false): Gc2dIntakeResult {
  return {
    status, candidateId: candidate.id, assetId,
    source: { url: candidate.sourceUrl, finalUrl: source.finalUrl },
    original: { mimeType: processed.original.mimeType, width: processed.original.width, height: processed.original.height, bytes: processed.original.bytes, sha256: processed.original.sha256 },
    optimized: processed.optimized,
    staging: { bucket: STAGING_BUCKET, originalPath, optimizedPath },
    published,
  };
}

export async function importGc2dRepresentativeCandidate(accessToken: string, candidateId: string): Promise<Gc2dIntakeResult> {
  if (!accessToken) throw new Gc2dIntakeError("Authentication required.", 401);
  const candidate = getCandidate(candidateId);
  const { client, userId } = await requireUserScopedAdmin(accessToken);
  const source = await downloadControlledSource(candidate);
  const processed = await processImage(source.bytes);

  const { data: duplicate, error: duplicateError } = await client.from("store_media_assets")
    .select("id,status,staging_original_path,staging_optimized_path")
    .eq("original_sha256", processed.original.sha256).maybeSingle();
  if (duplicateError) throw duplicateError;

  if (duplicate?.id) {
    await ensureDuplicateStagingObjects(client, duplicate, source, processed);
    await upsertProvenance(client, duplicate.id, candidate);
    return resultFrom("duplicate", duplicate.id, candidate, source, processed, duplicate.staging_original_path, duplicate.staging_optimized_path, duplicate.status === "published");
  }

  const assetId = randomUUID();
  const basePath = `imports/granite/${runId()}/${candidate.id}`;
  const originalPath = `${basePath}/original.${originalExtension(processed.original.format)}`;
  const optimizedPath = `${basePath}/optimized.webp`;
  const uploadedPaths: string[] = [];
  let assetInserted = false;

  try {
    const { error: originalUploadError } = await client.storage.from(STAGING_BUCKET).upload(originalPath, source.bytes, { contentType: processed.original.mimeType, upsert: false });
    if (originalUploadError) throw originalUploadError;
    uploadedPaths.push(originalPath);
    const { error: optimizedUploadError } = await client.storage.from(STAGING_BUCKET).upload(optimizedPath, processed.optimizedBytes, { contentType: "image/webp", upsert: false });
    if (optimizedUploadError) throw optimizedUploadError;
    uploadedPaths.push(optimizedPath);

    const { error: assetError } = await client.from("store_media_assets").insert({
      id: assetId, status: "review", title: candidate.title, default_alt_text: null, caption: null, media_type: "image",
      original_filename: source.filename, original_mime_type: processed.original.mimeType,
      original_width: processed.original.width, original_height: processed.original.height, original_bytes: processed.original.bytes, original_sha256: processed.original.sha256,
      optimized_mime_type: processed.optimized.mimeType, optimized_width: processed.optimized.width, optimized_height: processed.optimized.height,
      optimized_bytes: processed.optimized.bytes, optimized_sha256: processed.optimized.sha256,
      staging_bucket: STAGING_BUCKET, staging_original_path: originalPath, staging_optimized_path: optimizedPath,
      public_bucket: null, public_path: null, attribution_classification: candidate.attributionClassification,
      cabinet_relevance: "unreviewed", review_notes: candidate.notes, published_at: null, created_by: userId, updated_by: userId,
    });
    if (assetError) throw assetError;
    assetInserted = true;
    await upsertProvenance(client, assetId, candidate);
    return resultFrom("created", assetId, candidate, source, processed, originalPath, optimizedPath);
  } catch (error) {
    if (assetInserted) await client.from("store_media_assets").delete().eq("id", assetId);
    if (uploadedPaths.length > 0) await client.storage.from(STAGING_BUCKET).remove(uploadedPaths);
    throw error;
  }
}
