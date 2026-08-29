import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const STAGING_BUCKET = "store-media-staging";
const SOURCE_SITE = "granitecenterva.com";
const ALLOWED_RELEVANCE = new Set(["unreviewed", "relevant", "mixed", "irrelevant"]);

function throwIfError(result, operation) {
  if (result?.error) {
    const message = result.error.message || String(result.error);
    throw new Error(`${operation}: ${message}`);
  }
  return result?.data;
}

function safeToken(value, label) {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!token) throw new Error(`${label} must produce a non-empty safe path token.`);
  return token;
}

function originalMimeType(format) {
  const map = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
  };
  const mimeType = map[String(format || "").toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported decoded source format: ${format}`);
  return mimeType;
}

function originalExtension(format) {
  const map = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", avif: "avif" };
  const extension = map[String(format || "").toLowerCase()];
  if (!extension) throw new Error(`Unsupported decoded source format: ${format}`);
  return extension;
}

function attributionClassification(candidate) {
  return candidate?.oakwellAction === "parent_attributed" ? "parent_attributed" : "unverified_hold";
}

function cabinetRelevance(candidate) {
  const value = String(candidate?.cabinetRelevance || "").toLowerCase();
  if (ALLOWED_RELEVANCE.has(value)) return value;
  if (value === "high") return "relevant";
  if (value === "medium") return "mixed";
  if (value === "low") return "irrelevant";
  return "unreviewed";
}

function buildProvenance({ assetId, candidate, sourceBrand, sourcePageUrl }) {
  return {
    media_asset_id: assetId,
    source_site: SOURCE_SITE,
    source_brand: sourceBrand || null,
    source_candidate_id: candidate.id || null,
    source_url: candidate.sourceUrl,
    source_page_url: sourcePageUrl || null,
    source_page_id: candidate.sourcePageId || null,
    source_label: candidate.sourceAlt || candidate.label || null,
    migration_disposition: candidate.oakwellAction,
    attribution_required: Boolean(candidate.attributionRequired || candidate.attribution === "parent_required"),
    notes: candidate.notes || null,
    discovered_at: null,
  };
}

export function resolveSupabaseCredentials(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  const legacyKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const key = secretKey || legacyKey;
  const keySource = secretKey ? "SUPABASE_SECRET_KEY" : legacyKey ? "SUPABASE_SERVICE_ROLE_KEY" : null;

  if (!url || !key) {
    throw new Error("GC-2 import requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY). Keep these server-side only.");
  }
  return { url, key, keySource };
}

export function createSupabaseGateway(client) {
  if (!client) throw new Error("Supabase client is required.");

  return {
    async findAssetByOriginalSha(originalSha256) {
      const result = await client
        .from("store_media_assets")
        .select("*")
        .eq("original_sha256", originalSha256)
        .maybeSingle();
      return throwIfError(result, "Find media asset by original SHA-256");
    },

    async uploadStaging(storagePath, bytes, contentType) {
      const result = await client.storage
        .from(STAGING_BUCKET)
        .upload(storagePath, bytes, { contentType, upsert: false });
      return throwIfError(result, `Upload staging object ${storagePath}`);
    },

    async removeStaging(paths) {
      if (!Array.isArray(paths) || paths.length === 0) return [];
      const result = await client.storage.from(STAGING_BUCKET).remove(paths);
      return throwIfError(result, "Remove GC-2 staging objects") || [];
    },

    async insertAsset(row) {
      const result = await client
        .from("store_media_assets")
        .insert(row)
        .select("*")
        .single();
      return throwIfError(result, "Insert media asset");
    },

    async deleteAsset(assetId) {
      const result = await client.from("store_media_assets").delete().eq("id", assetId);
      throwIfError(result, `Delete rolled-back media asset ${assetId}`);
    },

    async upsertProvenance(row) {
      let query = client
        .from("store_media_asset_sources")
        .select("id")
        .eq("media_asset_id", row.media_asset_id);

      query = row.source_candidate_id
        ? query.eq("source_candidate_id", row.source_candidate_id)
        : query.eq("source_url", row.source_url);

      const existingResult = await query.maybeSingle();
      const existing = throwIfError(existingResult, "Find media provenance");
      if (existing?.id) {
        const updateResult = await client
          .from("store_media_asset_sources")
          .update(row)
          .eq("id", existing.id)
          .select("*")
          .single();
        return throwIfError(updateResult, "Update media provenance");
      }

      const insertResult = await client
        .from("store_media_asset_sources")
        .insert(row)
        .select("*")
        .single();
      return throwIfError(insertResult, "Insert media provenance");
    },
  };
}

export function createSupabaseGatewayFromEnv(env = process.env, createClientImpl = createClient) {
  const { url, key } = resolveSupabaseCredentials(env);
  const client = createClientImpl(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return createSupabaseGateway(client);
}

export async function registerAsset({
  gateway,
  candidate,
  sourceInfo,
  processed,
  runId,
  sourceBrand = null,
  sourcePageUrl = null,
}) {
  if (!gateway || !candidate || !sourceInfo || !processed || !runId) {
    throw new Error("registerAsset requires gateway, candidate, sourceInfo, processed and runId.");
  }

  const duplicate = await gateway.findAssetByOriginalSha(processed.original.sha256);
  if (duplicate?.id) {
    await gateway.upsertProvenance(buildProvenance({
      assetId: duplicate.id,
      candidate,
      sourceBrand,
      sourcePageUrl,
    }));
    return { status: "duplicate", assetId: duplicate.id };
  }

  const assetId = randomUUID();
  const safeRunId = safeToken(runId, "runId");
  const safeCandidateId = safeToken(candidate.id, "candidate id");
  const originalExt = originalExtension(processed.original.format);
  const originalMime = originalMimeType(processed.original.format);
  const basePath = path.posix.join("imports", "granite", safeRunId, safeCandidateId);
  const originalPath = path.posix.join(basePath, `original.${originalExt}`);
  const optimizedPath = path.posix.join(basePath, "optimized.webp");
  const uploadedPaths = [];
  let insertedAssetId = null;

  try {
    await gateway.uploadStaging(originalPath, sourceInfo.bytes, originalMime);
    uploadedPaths.push(originalPath);
    await gateway.uploadStaging(optimizedPath, processed.optimizedBytes, "image/webp");
    uploadedPaths.push(optimizedPath);

    const asset = await gateway.insertAsset({
      id: assetId,
      status: "review",
      title: candidate.label || candidate.sourceAlt || candidate.id,
      default_alt_text: candidate.sourceAlt || null,
      caption: null,
      media_type: "image",
      original_filename: sourceInfo.filename || null,
      original_mime_type: originalMime,
      original_width: processed.original.width,
      original_height: processed.original.height,
      original_bytes: processed.original.bytes,
      original_sha256: processed.original.sha256,
      optimized_mime_type: "image/webp",
      optimized_width: processed.optimized.width,
      optimized_height: processed.optimized.height,
      optimized_bytes: processed.optimized.bytes,
      optimized_sha256: processed.optimized.sha256,
      staging_bucket: STAGING_BUCKET,
      staging_original_path: originalPath,
      staging_optimized_path: optimizedPath,
      public_bucket: null,
      public_path: null,
      attribution_classification: attributionClassification(candidate),
      cabinet_relevance: cabinetRelevance(candidate),
      review_notes: candidate.notes || null,
      published_at: null,
    });
    insertedAssetId = asset.id;

    await gateway.upsertProvenance(buildProvenance({
      assetId: asset.id,
      candidate,
      sourceBrand,
      sourcePageUrl,
    }));

    return { status: "created", assetId: asset.id, originalPath, optimizedPath };
  } catch (error) {
    if (insertedAssetId && typeof gateway.deleteAsset === "function") {
      try {
        await gateway.deleteAsset(insertedAssetId);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    if (uploadedPaths.length > 0) {
      try {
        await gateway.removeStaging(uploadedPaths);
      } catch (rollbackError) {
        error.storageRollbackError = rollbackError;
      }
    }
    throw error;
  }
}

export async function registerStagedAsset(client, input) {
  return registerAsset({ gateway: createSupabaseGateway(client), ...input });
}
