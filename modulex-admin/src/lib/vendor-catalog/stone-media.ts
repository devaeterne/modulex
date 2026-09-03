import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { isTrustedStoneImageUrl } from "@/lib/vendor-catalog/stone-content";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const STORE_MEDIA_BUCKET = "store-media";
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1400;
const WEBP_QUALITY = 82;
const ARCHIVE_CONCURRENCY = 3;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type StoneMediaItem = {
  id: string;
  vendor_code: string;
  title: string;
  description: string | null;
  product_url: string;
  variant_code: string | null;
};

type StoneCanonicalProduct = {
  id: string;
  sku: string;
  base_product_code: string | null;
  name: string;
  description: string | null;
};

type StoneImageAsset = {
  id: string;
  url: string;
  label: string | null;
  sort_order: number;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_sha256: string | null;
  storage_bytes: number | null;
};

type ArchivedStoneImage = {
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
  label: string | null;
  sortOrder: number;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "stone-product";
}

function normalizedCode(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

async function readWithLimit(response: Response, maxBytes: number) {
  if (!response.body) throw new Error("Stone vendor image response had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Stone vendor image exceeds the 12 MB source limit.");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

async function archiveImage(item: StoneMediaItem, asset: StoneImageAsset): Promise<ArchivedStoneImage> {
  if (asset.storage_bucket && asset.storage_path && asset.storage_sha256) {
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(asset.storage_bucket)
      .getPublicUrl(asset.storage_path);
    return {
      storageBucket: asset.storage_bucket,
      storagePath: asset.storage_path,
      publicUrl,
      label: asset.label,
      sortOrder: asset.sort_order,
    };
  }

  const response = await fetch(asset.url, {
    cache: "no-store",
    redirect: "follow",
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg" },
  });
  if (!response.ok) {
    throw new Error(`Stone vendor image request failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Unsupported Stone vendor image type: ${contentType ?? "unknown"}.`);
  }

  const source = await readWithLimit(response, MAX_SOURCE_IMAGE_BYTES);
  const webp = await sharp(source)
    .rotate()
    .resize({
      width: IMAGE_MAX_EDGE,
      height: IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  const sha256 = createHash("sha256").update(webp).digest("hex");
  const storagePath = `vendor-catalog/${item.vendor_code}/${item.id}/${String(asset.sort_order).padStart(2, "0")}-${sha256.slice(0, 20)}.webp`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORE_MEDIA_BUCKET)
    .upload(storagePath, webp, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { error: assetUpdateError } = await supabaseAdmin
    .from("vendor_catalog_assets")
    .update({
      storage_bucket: STORE_MEDIA_BUCKET,
      storage_path: storagePath,
      storage_sha256: sha256,
      storage_bytes: webp.byteLength,
      archived_at: new Date().toISOString(),
    })
    .eq("id", asset.id);
  if (assetUpdateError) throw assetUpdateError;

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(STORE_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storageBucket: STORE_MEDIA_BUCKET,
    storagePath,
    publicUrl,
    label: asset.label,
    sortOrder: asset.sort_order,
  };
}

async function ensureStoreContent(
  product: StoneCanonicalProduct,
  item: StoneMediaItem,
  description: string,
  userId: string
) {
  const baseProductCode = product.base_product_code || product.sku;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("store_product_content")
    .select("id,base_product_code,slug,description,og_image_url")
    .eq("base_product_code", baseProductCode)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (!existing.description?.trim() && description.trim()) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("store_product_content")
        .update({ description, updated_by: userId })
        .eq("id", existing.id)
        .select("id,base_product_code,slug,description,og_image_url")
        .single();
      if (updateError || !updated) throw updateError ?? new Error("Stone Store content update returned no row.");
      return updated;
    }
    return existing;
  }

  const slug = slugify(`${item.vendor_code}-${baseProductCode}-${item.id.slice(0, 8)}`);
  const { data: created, error: createError } = await supabaseAdmin
    .from("store_product_content")
    .insert({
      base_product_code: baseProductCode,
      slug,
      display_name: item.title,
      short_description: null,
      description,
      is_published: false,
      is_featured: false,
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select("id,base_product_code,slug,description,og_image_url")
    .single();
  if (createError || !created) throw createError ?? new Error("Stone Store draft creation returned no row.");
  return created;
}

async function attachImages(
  content: { id: string; og_image_url: string | null },
  images: ArchivedStoneImage[],
  item: StoneMediaItem,
  userId: string
) {
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("store_product_media")
    .select("storage_bucket,storage_path,is_primary")
    .eq("product_content_id", content.id)
    .eq("media_type", "image");
  if (existingError) throw existingError;

  const existing = new Set(
    (existingRows ?? [])
      .filter((row) => row.storage_bucket && row.storage_path)
      .map((row) => `${row.storage_bucket}:${row.storage_path}`)
  );
  let hasPrimary = (existingRows ?? []).some((row) => row.is_primary);
  const colorCode = item.variant_code?.trim() ? normalizedCode(item.variant_code) : null;

  for (const image of images) {
    const identity = `${image.storageBucket}:${image.storagePath}`;
    if (existing.has(identity)) continue;
    const makePrimary = !hasPrimary;
    const { error } = await supabaseAdmin.from("store_product_media").insert({
      product_content_id: content.id,
      color_code: colorCode,
      media_type: "image",
      url: image.publicUrl,
      alt_text: image.label?.trim() || item.title,
      title: image.label?.trim() || `${item.title} image ${image.sortOrder + 1}`,
      sort_order: image.sortOrder,
      is_primary: makePrimary,
      storage_bucket: image.storageBucket,
      storage_path: image.storagePath,
      created_by: userId,
      updated_by: userId,
    });
    if (error) throw error;
    hasPrimary = hasPrimary || makePrimary;
    existing.add(identity);
  }

  if (!content.og_image_url && images[0]?.publicUrl) {
    const { error } = await supabaseAdmin
      .from("store_product_content")
      .update({ og_image_url: images[0].publicUrl, updated_by: userId })
      .eq("id", content.id);
    if (error) throw error;
  }
}

export async function archiveStoneProductContent(options: {
  item: StoneMediaItem;
  product: StoneCanonicalProduct;
  description: string;
  userId: string;
}) {
  const { item, product, description, userId } = options;
  const content = await ensureStoreContent(product, item, description, userId);

  const { data: assetRows, error: assetsError } = await supabaseAdmin
    .from("vendor_catalog_assets")
    .select("id,url,label,sort_order,storage_bucket,storage_path,storage_sha256,storage_bytes")
    .eq("item_id", item.id)
    .eq("kind", "image")
    .order("sort_order", { ascending: true });
  if (assetsError) throw assetsError;

  const trustedAssets = ((assetRows ?? []) as StoneImageAsset[]).filter((asset) =>
    isTrustedStoneImageUrl(item.product_url, asset.url)
  );

  const attempts = await mapWithConcurrency(trustedAssets, ARCHIVE_CONCURRENCY, async (asset) => {
    try {
      return { image: await archiveImage(item, asset), error: null as string | null };
    } catch (error) {
      return {
        image: null,
        error: error instanceof Error ? error.message : "Unknown Stone image archive error.",
      };
    }
  });
  const archivedImages = attempts
    .map((attempt) => attempt.image)
    .filter((image): image is ArchivedStoneImage => Boolean(image));
  const failures = attempts.filter((attempt) => attempt.error);

  if (failures.length > 0) {
    console.warn("[stone-media] Some vendor images could not be archived.", {
      itemId: item.id,
      vendorCode: item.vendor_code,
      trustedImageCount: trustedAssets.length,
      archivedImageCount: archivedImages.length,
      failedImageCount: failures.length,
      errors: failures.map((failure) => failure.error),
    });
  }
  if (trustedAssets.length > 0 && archivedImages.length === 0) {
    throw new Error("Stone product images were found but none could be archived.");
  }

  await attachImages(content, archivedImages, item, userId);

  return {
    storeProductContentId: content.id,
    archivedImageCount: archivedImages.length,
    trustedImageCount: trustedAssets.length,
  };
}
