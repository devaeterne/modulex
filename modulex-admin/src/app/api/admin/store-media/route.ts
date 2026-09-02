import { createHash } from "node:crypto";
import { jsonError, requireAdmin } from "@/lib/auth/admin-api";
import { withApiTiming } from "@/lib/observability/apiTiming";
import type { StoreMediaAsset } from "@/lib/store/mediaLibrary";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const PUBLIC_BUCKET = "store-media";
const STAGING_BUCKET = "store-media-staging";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MediaApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type LifecycleBody = { asset_id?: unknown; action?: unknown };
type StorageErrorLike = { message?: string; statusCode?: string | number; status?: number };

const referenceFields = [
  { table: "store_pages", columns: ["hero_image_url", "og_image_url"] },
  { table: "store_projects", columns: ["cover_image_url", "og_image_url"] },
  { table: "store_project_media", columns: ["media_url"] },
  { table: "store_site_settings", columns: ["hero_poster_url", "hero_panorama_url", "homepage_og_image_url"] },
] as const;

const structuralReferences = [
  { table: "store_projects", column: "cover_media_asset_id" },
  { table: "store_project_media", column: "media_asset_id" },
] as const;

function parseAssetId(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new MediaApiError("A valid asset_id is required.", 400);
  return value;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isMissingStorageError(error: unknown) {
  const candidate = error as StorageErrorLike | null;
  const status = candidate?.statusCode ?? candidate?.status;
  return status === 404 || status === "404" || /not found|does not exist/i.test(candidate?.message ?? "");
}

async function downloadObject(bucket: string, objectPath: string) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(objectPath);
  if (error) {
    if (isMissingStorageError(error)) return null;
    throw new MediaApiError(`Unable to read ${bucket}/${objectPath}: ${error.message}`, 502);
  }
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

function verifyOptimizedBytes(asset: StoreMediaAsset, bytes: Uint8Array) {
  if (!asset.optimized_sha256 || !asset.optimized_bytes) throw new MediaApiError("Optimized media metadata is incomplete.", 409);
  if (bytes.byteLength !== asset.optimized_bytes) throw new MediaApiError("Optimized media byte length does not match verified metadata.", 409);
  if (sha256(bytes) !== asset.optimized_sha256) throw new MediaApiError("Optimized media checksum does not match verified metadata.", 409);
}

async function loadAsset(assetId: string) {
  const { data, error } = await supabaseAdmin.from("store_media_assets").select("*").eq("id", assetId).single();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === "PGRST116") throw new MediaApiError("Media asset not found.", 404);
    throw new MediaApiError(error?.message ?? "Media asset not found.", error ? 500 : 404);
  }
  return data as StoreMediaAsset;
}

function validatePublishable(asset: StoreMediaAsset) {
  if (asset.status !== "approved") throw new MediaApiError("Only approved media can be published.", 409);
  if (!asset.title.trim()) throw new MediaApiError("Media title is required before publish.", 409);
  if (!asset.default_alt_text?.trim()) throw new MediaApiError("Default alt text is required before publish.", 409);
  if (asset.attribution_classification === "unverified_hold") throw new MediaApiError("Unverified-hold media cannot be published.", 409);
  if (!(["relevant", "mixed"] as const).includes(asset.cabinet_relevance as "relevant" | "mixed")) {
    throw new MediaApiError("Media must be cabinet-relevant or mixed relevance before publish.", 409);
  }
  if (
    asset.staging_bucket !== STAGING_BUCKET || !asset.staging_optimized_path || asset.optimized_mime_type !== "image/webp" ||
    !asset.optimized_sha256 || !asset.optimized_bytes || !asset.optimized_width || !asset.optimized_height
  ) throw new MediaApiError("Approved media is missing a verified optimized staging derivative.", 409);
}

async function findReferences(asset: StoreMediaAsset) {
  const marker = `%/media/${asset.id}/%`;
  const references: string[] = [];

  for (const reference of structuralReferences) {
    const { data, error } = await supabaseAdmin
      .from(reference.table)
      .select("id")
      .eq(reference.column, asset.id)
      .limit(1);
    if (error) throw new MediaApiError(`Unable to verify ${reference.table}.${reference.column} references: ${error.message}`, 500);
    if ((data ?? []).length > 0) references.push(`${reference.table}.${reference.column}`);
  }

  for (const group of referenceFields) {
    for (const column of group.columns) {
      const { data, error } = await supabaseAdmin.from(group.table).select("id").ilike(column, marker).limit(1);
      if (error) throw new MediaApiError(`Unable to verify ${group.table}.${column} references: ${error.message}`, 500);
      if ((data ?? []).length > 0) references.push(`${group.table}.${column}`);
    }
  }
  return references;
}

async function publishAsset(asset: StoreMediaAsset, actorId: string) {
  if (asset.status === "published" && asset.public_bucket === PUBLIC_BUCKET && asset.public_path === `media/${asset.id}/${asset.optimized_sha256}.webp`) {
    const existing = await downloadObject(PUBLIC_BUCKET, asset.public_path);
    if (!existing) throw new MediaApiError("Published media object is missing and requires repair.", 409);
    verifyOptimizedBytes(asset, existing);
    return asset;
  }

  validatePublishable(asset);
  const publicPath = `media/${asset.id}/${asset.optimized_sha256}.webp`;
  const stagingBytes = await downloadObject(STAGING_BUCKET, asset.staging_optimized_path!);
  if (!stagingBytes) throw new MediaApiError("Optimized staging object is missing.", 409);
  verifyOptimizedBytes(asset, stagingBytes);

  let createdPublicObject = false;
  const existingPublic = await downloadObject(PUBLIC_BUCKET, publicPath);
  if (existingPublic) verifyOptimizedBytes(asset, existingPublic);
  else {
    const { error: uploadError } = await supabaseAdmin.storage.from(PUBLIC_BUCKET).upload(publicPath, stagingBytes, {
      contentType: "image/webp", cacheControl: "31536000", upsert: false,
    });
    if (uploadError) throw new MediaApiError(`Unable to publish media object: ${uploadError.message}`, 502);
    createdPublicObject = true;
  }

  const publishedBytes = await downloadObject(PUBLIC_BUCKET, publicPath);
  if (!publishedBytes) {
    if (createdPublicObject) await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove([publicPath]);
    throw new MediaApiError("Published media object could not be verified.", 502);
  }
  verifyOptimizedBytes(asset, publishedBytes);

  const { data, error } = await supabaseAdmin.from("store_media_assets").update({
    status: "published", public_bucket: PUBLIC_BUCKET, public_path: publicPath,
    published_at: new Date().toISOString(), updated_by: actorId,
  }).eq("id", asset.id).eq("status", "approved").select("*").single();

  if (error || !data) {
    if (createdPublicObject) await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove([publicPath]);
    throw new MediaApiError(error?.message ?? "Unable to finalize media publication.", 500);
  }
  return data as StoreMediaAsset;
}

async function unpublishAsset(asset: StoreMediaAsset, actorId: string) {
  if (asset.status === "approved" && !asset.public_bucket && !asset.public_path) return asset;
  if (asset.status !== "published" || asset.public_bucket !== PUBLIC_BUCKET || !asset.public_path) {
    throw new MediaApiError("Only published media can be unpublished.", 409);
  }
  const references = await findReferences(asset);
  if (references.length) throw new MediaApiError(`Media is still referenced by published/CMS content: ${references.join(", ")}.`, 409);

  const publicBytes = await downloadObject(PUBLIC_BUCKET, asset.public_path);
  if (publicBytes) {
    const { error: removeError } = await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove([asset.public_path]);
    if (removeError && !isMissingStorageError(removeError)) throw new MediaApiError(`Unable to remove public media object: ${removeError.message}`, 502);
  }

  const { data, error } = await supabaseAdmin.from("store_media_assets").update({
    status: "approved", public_bucket: null, public_path: null, published_at: null, updated_by: actorId,
  }).eq("id", asset.id).eq("status", "published").select("*").single();
  if (error || !data) throw new MediaApiError(error?.message ?? "Unable to finalize media unpublish.", 500);
  return data as StoreMediaAsset;
}

async function hardDeleteAsset(asset: StoreMediaAsset) {
  if (asset.status === "published") throw new MediaApiError("Published media must be unpublished before deletion.", 409);
  const references = await findReferences(asset);
  if (references.length) throw new MediaApiError(`Media is still referenced by CMS content: ${references.join(", ")}.`, 409);

  const stagingPaths = [asset.staging_original_path, asset.staging_optimized_path].filter((value): value is string => Boolean(value));
  if (stagingPaths.length) {
    const { error: removeError } = await supabaseAdmin.storage.from(STAGING_BUCKET).remove(stagingPaths);
    if (removeError && !isMissingStorageError(removeError)) throw new MediaApiError(`Unable to remove private staging objects: ${removeError.message}`, 502);
  }
  const { error } = await supabaseAdmin.from("store_media_assets").delete().eq("id", asset.id).neq("status", "published");
  if (error) throw new MediaApiError(error.message, 500);
}

function errorResponse(error: unknown) {
  if (error instanceof MediaApiError) return jsonError(error.message, error.status);
  console.error("Store media lifecycle error", error);
  return jsonError("Media lifecycle operation failed.", 500);
}

async function handlePatch(request: Request) {
  const authorization = await requireAdmin(request);
  if (authorization.response) return authorization.response;
  try {
    const body = (await request.json()) as LifecycleBody;
    const assetId = parseAssetId(body.asset_id);
    if (body.action !== "publish" && body.action !== "unpublish") throw new MediaApiError("Action must be publish or unpublish.", 400);
    const asset = await loadAsset(assetId);
    const updated = body.action === "publish" ? await publishAsset(asset, authorization.actor.user.id) : await unpublishAsset(asset, authorization.actor.user.id);
    return Response.json({ asset: updated });
  } catch (error) { return errorResponse(error); }
}

async function handleDelete(request: Request) {
  const authorization = await requireAdmin(request);
  if (authorization.response) return authorization.response;
  try {
    const assetId = parseAssetId(new URL(request.url).searchParams.get("asset_id"));
    const asset = await loadAsset(assetId);
    await hardDeleteAsset(asset);
    return Response.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  return withApiTiming({ route: "/api/admin/store-media", method: "PATCH" }, () => handlePatch(request));
}

export async function DELETE(request: Request) {
  return withApiTiming({ route: "/api/admin/store-media", method: "DELETE" }, () => handleDelete(request));
}
