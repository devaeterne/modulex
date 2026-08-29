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

const REPRESENTATIVE_CANDIDATE = Object.freeze({
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
  notes: "Source showroom asset imported for GC-2D review; publication requires explicit Admin approval.",
});

export type Gc2dIntakeResult = {
  status: "created" | "duplicate";
  candidateId: string;
  assetId: string;
  source: {
    url: string;
    finalUrl: string;
  };
  original: {
    mimeType: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  };
  optimized: {
    mimeType: "image/webp";
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  };
  staging: {
    bucket: typeof STAGING_BUCKET;
    originalPath: string | null;
    optimizedPath: string | null;
  };
  published: boolean;
};

export class Gc2dIntakeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "Gc2dIntakeError";
  }
}

type UserScopedContext = {
  client: SupabaseClient;
  userId: string;
};

type SourceDownload = {
  bytes: Buffer;
  finalUrl: string;
  filename: string;
};

type ProcessedImage = {
  original: {
    format: string;
    mimeType: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  };
  optimized: {
    mimeType: "image/webp";
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  };
  optimizedBytes: Buffer;
};

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Gc2dIntakeError("Supabase public runtime configuration is unavailable.", 503);
  }
  return { url, publishableKey };
}

async function requireUserScopedAdmin(accessToken: string): Promise<UserScopedContext> {
  const { url, publishableKey } = requireSupabasePublicConfig();
  const client = createClient(url, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) {
    throw new Gc2dIntakeError("Authentication required.", 401);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile || !profile.is_active) {
    throw new Gc2dIntakeError("Active Admin access is required.", 403);
  }
  if (!new Set(["super_admin", "admin"]).has(profile.role)) {
    throw new Gc2dIntakeError("Admin access is required.", 403);
  }

  return { client, userId: userData.user.id };
}

function validateSourceUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Gc2dIntakeError("Controlled media source URL is invalid.", 500);
  }
  if (parsed.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Gc2dIntakeError("Controlled media source is outside the approved host allowlist.", 500);
  }
  return parsed;
}

async function readBoundedBody(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_SOURCE_BYTES) {
      throw new Gc2dIntakeError("Controlled media source exceeds the 20 MB limit.", 502);
    }
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
        await reader.cancel("GC-2D source exceeded 20 MB limit");
        throw new Gc2dIntakeError("Controlled media source exceeds the 20 MB limit.", 502);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function downloadControlledSource(): Promise<SourceDownload> {
  let currentUrl = validateSourceUrl(REPRESENTATIVE_CANDIDATE.sourceUrl).toString();
  let redirects = 0;

  while (true) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.1",
        "user-agent": "Oakwell-GC2D-Admin-Intake/1.0",
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= MAX_REDIRECTS) {
        throw new Gc2dIntakeError(`Controlled media source exceeded ${MAX_REDIRECTS} redirects.`, 502);
      }
      const location = response.headers.get("location");
      if (!location) throw new Gc2dIntakeError("Controlled media redirect is missing Location.", 502);
      currentUrl = validateSourceUrl(new URL(location, currentUrl).toString()).toString();
      redirects += 1;
      continue;
    }

    if (!response.ok) {
      throw new Gc2dIntakeError(`Controlled media source returned HTTP ${response.status}.`, 502);
    }

    const bytes = await readBoundedBody(response);
    const pathname = new URL(currentUrl).pathname;
    const basename = pathname.split("/").filter(Boolean).at(-1) ?? "source-image";
    return {
      bytes,
      finalUrl: currentUrl,
      filename: decodeURIComponent(basename),
    };
  }
}

function originalMimeType(format: string) {
  const mimeTypes: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
  };
  const mimeType = mimeTypes[format.toLowerCase()];
  if (!mimeType) throw new Gc2dIntakeError(`Unsupported decoded source format: ${format}.`, 422);
  return mimeType;
}

function originalExtension(format: string) {
  const extensions: Record<string, string> = {
    jpeg: "jpg",
    jpg: "jpg",
    png: "png",
    webp: "webp",
    avif: "avif",
  };
  const extension = extensions[format.toLowerCase()];
  if (!extension) throw new Gc2dIntakeError(`Unsupported decoded source format: ${format}.`, 422);
  return extension;
}

async function processImage(bytes: Buffer): Promise<ProcessedImage> {
  if (bytes.length < 1 || bytes.length > MAX_SOURCE_BYTES) {
    throw new Gc2dIntakeError("Controlled media source bytes are invalid.", 422);
  }

  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Gc2dIntakeError("Unable to verify controlled media metadata.", 422);
  }

  let pipeline = sharp(bytes, { failOn: "error" }).rotate();
  if (Math.max(metadata.width, metadata.height) > TARGET_LONG_EDGE) {
    pipeline = pipeline.resize({
      width: TARGET_LONG_EDGE,
      height: TARGET_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const optimizedBytes = await pipeline
    .webp({ quality: 80, smartSubsample: true })
    .toBuffer();
  const output = await sharp(optimizedBytes, { failOn: "error" }).metadata();
  if (!output.width || !output.height || output.format !== "webp") {
    throw new Gc2dIntakeError("Unable to verify optimized WebP output.", 422);
  }

  return {
    original: {
      format: metadata.format,
      mimeType: originalMimeType(metadata.format),
      width: metadata.width,
      height: metadata.height,
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
    optimized: {
      mimeType: "image/webp",
      width: output.width,
      height: output.height,
      bytes: optimizedBytes.length,
      sha256: sha256(optimizedBytes),
    },
    optimizedBytes,
  };
}

function runId() {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

async function upsertProvenance(client: SupabaseClient, assetId: string) {
  const provenance = {
    media_asset_id: assetId,
    source_site: SOURCE_SITE,
    source_brand: REPRESENTATIVE_CANDIDATE.sourceBrand,
    source_candidate_id: REPRESENTATIVE_CANDIDATE.id,
    source_url: REPRESENTATIVE_CANDIDATE.sourceUrl,
    source_page_url: REPRESENTATIVE_CANDIDATE.sourcePageUrl,
    source_page_id: REPRESENTATIVE_CANDIDATE.sourcePageId,
    source_label: REPRESENTATIVE_CANDIDATE.sourceLabel,
    migration_disposition: REPRESENTATIVE_CANDIDATE.migrationDisposition,
    attribution_required: REPRESENTATIVE_CANDIDATE.attributionRequired,
    notes: REPRESENTATIVE_CANDIDATE.notes,
    discovered_at: null,
  };

  const { data: existing, error: findError } = await client
    .from("store_media_asset_sources")
    .select("id")
    .eq("media_asset_id", assetId)
    .eq("source_candidate_id", REPRESENTATIVE_CANDIDATE.id)
    .maybeSingle();
  if (findError) throw findError;

  if (existing?.id) {
    const { error } = await client
      .from("store_media_asset_sources")
      .update(provenance)
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("store_media_asset_sources").insert(provenance);
  if (error) throw error;
}

function resultFrom(
  status: Gc2dIntakeResult["status"],
  assetId: string,
  source: SourceDownload,
  processed: ProcessedImage,
  originalPath: string | null,
  optimizedPath: string | null,
  published = false,
): Gc2dIntakeResult {
  return {
    status,
    candidateId: REPRESENTATIVE_CANDIDATE.id,
    assetId,
    source: {
      url: REPRESENTATIVE_CANDIDATE.sourceUrl,
      finalUrl: source.finalUrl,
    },
    original: {
      mimeType: processed.original.mimeType,
      width: processed.original.width,
      height: processed.original.height,
      bytes: processed.original.bytes,
      sha256: processed.original.sha256,
    },
    optimized: processed.optimized,
    staging: {
      bucket: STAGING_BUCKET,
      originalPath,
      optimizedPath,
    },
    published,
  };
}

export async function importGc2dRepresentativeCandidate(
  accessToken: string,
  candidateId: string,
): Promise<Gc2dIntakeResult> {
  if (candidateId !== REPRESENTATIVE_CANDIDATE.id) {
    throw new Gc2dIntakeError("Unknown controlled GC-2D candidate.", 400);
  }
  if (!accessToken) throw new Gc2dIntakeError("Authentication required.", 401);

  const { client, userId } = await requireUserScopedAdmin(accessToken);
  const source = await downloadControlledSource();
  const processed = await processImage(source.bytes);

  const { data: duplicate, error: duplicateError } = await client
    .from("store_media_assets")
    .select("id,status,staging_original_path,staging_optimized_path")
    .eq("original_sha256", processed.original.sha256)
    .maybeSingle();
  if (duplicateError) throw duplicateError;

  if (duplicate?.id) {
    await upsertProvenance(client, duplicate.id);
    return resultFrom(
      "duplicate",
      duplicate.id,
      source,
      processed,
      duplicate.staging_original_path,
      duplicate.staging_optimized_path,
      duplicate.status === "published",
    );
  }

  const assetId = randomUUID();
  const basePath = `imports/granite/${runId()}/${REPRESENTATIVE_CANDIDATE.id}`;
  const originalPath = `${basePath}/original.${originalExtension(processed.original.format)}`;
  const optimizedPath = `${basePath}/optimized.webp`;
  const uploadedPaths: string[] = [];
  let assetInserted = false;

  try {
    const { error: originalUploadError } = await client.storage
      .from(STAGING_BUCKET)
      .upload(originalPath, source.bytes, {
        contentType: processed.original.mimeType,
        upsert: false,
      });
    if (originalUploadError) throw originalUploadError;
    uploadedPaths.push(originalPath);

    const { error: optimizedUploadError } = await client.storage
      .from(STAGING_BUCKET)
      .upload(optimizedPath, processed.optimizedBytes, {
        contentType: "image/webp",
        upsert: false,
      });
    if (optimizedUploadError) throw optimizedUploadError;
    uploadedPaths.push(optimizedPath);

    const { error: assetError } = await client.from("store_media_assets").insert({
      id: assetId,
      status: "review",
      title: REPRESENTATIVE_CANDIDATE.title,
      default_alt_text: null,
      caption: null,
      media_type: "image",
      original_filename: source.filename,
      original_mime_type: processed.original.mimeType,
      original_width: processed.original.width,
      original_height: processed.original.height,
      original_bytes: processed.original.bytes,
      original_sha256: processed.original.sha256,
      optimized_mime_type: processed.optimized.mimeType,
      optimized_width: processed.optimized.width,
      optimized_height: processed.optimized.height,
      optimized_bytes: processed.optimized.bytes,
      optimized_sha256: processed.optimized.sha256,
      staging_bucket: STAGING_BUCKET,
      staging_original_path: originalPath,
      staging_optimized_path: optimizedPath,
      public_bucket: null,
      public_path: null,
      attribution_classification: REPRESENTATIVE_CANDIDATE.attributionClassification,
      cabinet_relevance: "unreviewed",
      review_notes: REPRESENTATIVE_CANDIDATE.notes,
      published_at: null,
      created_by: userId,
      updated_by: userId,
    });
    if (assetError) throw assetError;
    assetInserted = true;

    await upsertProvenance(client, assetId);
    return resultFrom("created", assetId, source, processed, originalPath, optimizedPath);
  } catch (error) {
    if (assetInserted) {
      await client.from("store_media_assets").delete().eq("id", assetId);
    }
    if (uploadedPaths.length > 0) {
      await client.storage.from(STAGING_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}
