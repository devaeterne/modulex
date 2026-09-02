import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import sharp from "sharp";
import {
  getVendorCatalogAdapter,
  vendorCatalogImageHosts,
  vendorCatalogLabels,
} from "@/lib/vendor-catalog/adapters";
import {
  stableProductHash,
  type NormalizedVendorProduct,
  type VendorAsset,
} from "@/lib/vendor-catalog/domain";
import { createVendorCatalogUserClient } from "@/lib/vendor-catalog/auth";
import {
  loadVendorCategoryMapping,
  type ResolvedVendorCategoryMapping,
} from "@/lib/vendor-catalog/mappings";
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

type VendorCatalogItemRow = {
  id: string;
  vendor_code: string;
  external_id: string;
  sku: string | null;
  title: string;
  description: string | null;
  product_url: string;
  vendor_price_reference: number | null;
  vendor_currency: string | null;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
  family_key: string | null;
  variant_code: string | null;
  variant_label: string | null;
  source_payload: unknown;
  canonical_product_id: string | null;
};

type VendorAssetRow = {
  id: string;
  item_id: string;
  kind: "image" | "specification" | "cad" | "document";
  url: string;
  label: string | null;
  file_type: string | null;
  sort_order: number;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_sha256: string | null;
  storage_bytes: number | null;
};

type ArchivedImage = {
  assetId: string;
  sourceUrl: string;
  label: string | null;
  sortOrder: number;
  storageBucket: string;
  storagePath: string;
  storageSha256: string;
  storageBytes: number;
  publicUrl: string;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "vendor-product";
}

function normalizedCode(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function safeSku(item: VendorCatalogItemRow) {
  const raw = item.sku?.trim() || `${item.vendor_code}-${item.external_id}`;
  return normalizedCode(raw, `${item.vendor_code.toUpperCase()}-${item.id.slice(0, 8)}`);
}

function safeFamilyKey(item: VendorCatalogItemRow, sku: string) {
  return normalizedCode(item.family_key?.trim() || sku, sku);
}

function safeVariantCode(item: VendorCatalogItemRow) {
  return item.variant_code?.trim()
    ? normalizedCode(item.variant_code, "DEFAULT")
    : "DEFAULT";
}

function isAllowedImageUrl(vendorCode: string, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (isIP(url.hostname) !== 0 || url.hostname === "localhost") return false;

  const allowedHosts = vendorCatalogImageHosts[vendorCode] ?? [];
  return allowedHosts.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );
}

async function readWithLimit(response: Response, maxBytes: number) {
  if (!response.body) throw new Error("Vendor image response had no body.");
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
      throw new Error("Vendor image exceeds the 12 MB source limit.");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );
  return results;
}

async function downloadAndArchiveImage(
  item: VendorCatalogItemRow,
  asset: VendorAssetRow
): Promise<ArchivedImage> {
  if (asset.storage_bucket && asset.storage_path && asset.storage_sha256) {
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(asset.storage_bucket).getPublicUrl(asset.storage_path);
    return {
      assetId: asset.id,
      sourceUrl: asset.url,
      label: asset.label,
      sortOrder: asset.sort_order,
      storageBucket: asset.storage_bucket,
      storagePath: asset.storage_path,
      storageSha256: asset.storage_sha256,
      storageBytes: asset.storage_bytes ?? 0,
      publicUrl,
    };
  }

  if (!isAllowedImageUrl(item.vendor_code, asset.url)) {
    throw new Error(`Vendor image host is not allowed: ${asset.url}`);
  }

  const response = await fetch(asset.url, {
    cache: "no-store",
    redirect: "follow",
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg" },
  });
  if (!response.ok) {
    throw new Error(`Vendor image request failed (${response.status}): ${asset.url}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Unsupported vendor image type ${contentType ?? "unknown"}: ${asset.url}`);
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
  const path = `vendor-catalog/${item.vendor_code}/${item.id}/${String(asset.sort_order).padStart(2, "0")}-${sha256.slice(0, 20)}.webp`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORE_MEDIA_BUCKET)
    .upload(path, webp, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { error: assetUpdateError } = await supabaseAdmin
    .from("vendor_catalog_assets")
    .update({
      storage_bucket: STORE_MEDIA_BUCKET,
      storage_path: path,
      storage_sha256: sha256,
      storage_bytes: webp.byteLength,
      archived_at: new Date().toISOString(),
    })
    .eq("id", asset.id);
  if (assetUpdateError) throw assetUpdateError;

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(STORE_MEDIA_BUCKET).getPublicUrl(path);

  return {
    assetId: asset.id,
    sourceUrl: asset.url,
    label: asset.label,
    sortOrder: asset.sort_order,
    storageBucket: STORE_MEDIA_BUCKET,
    storagePath: path,
    storageSha256: sha256,
    storageBytes: webp.byteLength,
    publicUrl,
  };
}

async function ensureVendorBrand(vendorCode: string) {
  const brandName = vendorCatalogLabels[vendorCode] ?? vendorCode;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("product_brands")
    .select("id,name,status")
    .ilike("name", brandName)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    if (existing.status !== "active") {
      throw new Error(`${brandName} product brand exists but is not active.`);
    }
    return { id: existing.id, name: existing.name };
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("product_brands")
    .insert({ name: brandName, status: "active" })
    .select("id,name")
    .single();
  if (createError || !created) {
    const { data: raced, error: racedError } = await supabaseAdmin
      .from("product_brands")
      .select("id,name,status")
      .ilike("name", brandName)
      .maybeSingle();
    if (racedError || !raced?.id || raced.status !== "active") {
      throw createError ?? racedError ?? new Error(`Unable to create ${brandName} product brand.`);
    }
    return { id: raced.id, name: raced.name };
  }

  return created;
}

async function assertSafeCanonicalReuse(
  item: VendorCatalogItemRow,
  productId: string,
  sku: string
) {
  const { data, error } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select("id,vendor_code,sku,family_key")
    .eq("canonical_product_id", productId)
    .neq("id", item.id)
    .limit(5);
  if (error) throw error;

  const conflicts = (data ?? []).filter((row) => {
    const sameVendor = row.vendor_code === item.vendor_code;
    const sameSku = row.sku?.trim().toUpperCase() === sku;
    return !sameVendor || !sameSku;
  });
  if (conflicts.length > 0) {
    throw new Error(
      "This canonical product is already linked to a different vendor catalog identity. Resolve the duplicate before approval."
    );
  }
}

async function ensureCanonicalProduct(
  item: VendorCatalogItemRow,
  userAccessToken: string,
  mapping: ResolvedVendorCategoryMapping
) {
  if (item.canonical_product_id) {
    const { data: linked, error } = await supabaseAdmin
      .from("products")
      .select("id,sku,base_product_code,name,description")
      .eq("id", item.canonical_product_id)
      .maybeSingle();
    if (error || !linked) throw error ?? new Error("Linked canonical product was not found.");
    return linked;
  }

  const sku = safeSku(item);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("products")
    .select("id,sku,base_product_code,name,description")
    .ilike("sku", sku)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    await assertSafeCanonicalReuse(item, existing.id, sku);
    return existing;
  }

  const brand = await ensureVendorBrand(item.vendor_code);
  const familyKey = safeFamilyKey(item, sku);
  const variantCode = safeVariantCode(item);
  const userClient = createVendorCatalogUserClient(userAccessToken);
  const { data: savedId, error: saveError } = await userClient.rpc("save_product_master_v2", {
    p_product: {
      id: null,
      sku,
      barcode: null,
      name: item.title,
      description: item.description,
      brand_id: brand.id,
      category_id: mapping.category.id,
      base_product_code: familyKey,
      color_code: variantCode,
      color_name: item.variant_label,
      brand: brand.name,
      category: mapping.category.name,
      unit: mapping.uom.code.toLowerCase(),
      product_type_id: mapping.productType.id,
      uom_id: mapping.uom.id,
      min_stock_level: 0,
      status: "active",
      metadata: {
        source: "vendor_catalog",
        vendor_code: item.vendor_code,
        vendor_external_id: item.external_id,
        vendor_product_url: item.product_url,
        vendor_category_key: item.vendor_category_key,
        vendor_category_label: item.vendor_category_label,
        vendor_family_key: item.family_key,
        vendor_variant_code: item.variant_code,
        vendor_variant_label: item.variant_label,
      },
    },
    p_stone_profile: null,
  });
  if (saveError || !savedId) throw saveError ?? new Error("Canonical product creation returned no id.");

  const { data: created, error: createdError } = await supabaseAdmin
    .from("products")
    .select("id,sku,base_product_code,name,description")
    .eq("id", String(savedId))
    .single();
  if (createdError || !created) throw createdError ?? new Error("Created canonical product was not found.");
  return created;
}

async function ensureStoreProductContent(
  product: {
    id: string;
    sku: string;
    base_product_code: string | null;
    name: string;
    description: string | null;
  },
  item: VendorCatalogItemRow,
  userId: string
) {
  const baseProductCode = product.base_product_code || product.sku;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("store_product_content")
    .select("id,base_product_code,slug,og_image_url")
    .eq("base_product_code", baseProductCode)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const slug = slugify(`${item.vendor_code}-${baseProductCode}-${item.id.slice(0, 8)}`);
  const { data: created, error: createError } = await supabaseAdmin
    .from("store_product_content")
    .insert({
      base_product_code: baseProductCode,
      slug,
      display_name: item.title,
      short_description: null,
      description: item.description,
      is_published: false,
      is_featured: false,
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select("id,base_product_code,slug,og_image_url")
    .single();
  if (createError || !created) throw createError ?? new Error("Draft Store product creation returned no row.");
  return created;
}

async function attachStoreImages(
  productContent: { id: string; og_image_url: string | null },
  images: ArchivedImage[],
  item: VendorCatalogItemRow,
  userId: string
) {
  const { data: existingMedia, error: existingError } = await supabaseAdmin
    .from("store_product_media")
    .select("id,storage_bucket,storage_path,is_primary")
    .eq("product_content_id", productContent.id)
    .eq("media_type", "image");
  if (existingError) throw existingError;

  const existingObjects = new Set(
    (existingMedia ?? [])
      .filter((row) => row.storage_bucket && row.storage_path)
      .map((row) => `${row.storage_bucket}:${row.storage_path}`)
  );
  let hasPrimary = (existingMedia ?? []).some((row) => row.is_primary);
  const variantCode = item.variant_code?.trim()
    ? normalizedCode(item.variant_code, "DEFAULT")
    : null;

  for (const image of images) {
    const identity = `${image.storageBucket}:${image.storagePath}`;
    if (existingObjects.has(identity)) continue;

    const makePrimary = !hasPrimary;
    const { error } = await supabaseAdmin.from("store_product_media").insert({
      product_content_id: productContent.id,
      color_code: variantCode,
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
  }

  if (!productContent.og_image_url && images[0]?.publicUrl) {
    const { error } = await supabaseAdmin
      .from("store_product_content")
      .update({ og_image_url: images[0].publicUrl, updated_by: userId })
      .eq("id", productContent.id);
    if (error) throw error;
  }
}

export async function approveVendorCatalogItem(
  itemId: string,
  authorization: { userId: string; accessToken: string }
) {
  const { data: item, error: itemError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select(
      "id,vendor_code,external_id,sku,title,description,product_url,vendor_price_reference,vendor_currency,vendor_category_key,vendor_category_label,family_key,variant_code,variant_label,source_payload,canonical_product_id"
    )
    .eq("id", itemId)
    .maybeSingle();
  if (itemError || !item) throw itemError ?? new Error("Vendor catalog item was not found.");

  const typedItem = item as VendorCatalogItemRow;
  const mapping = await loadVendorCategoryMapping({
    vendorCode: typedItem.vendor_code,
    vendorCategoryKey: typedItem.vendor_category_key,
    vendorCategoryLabel: typedItem.vendor_category_label,
  });

  const { data: assetRows, error: assetsError } = await supabaseAdmin
    .from("vendor_catalog_assets")
    .select(
      "id,item_id,kind,url,label,file_type,sort_order,storage_bucket,storage_path,storage_sha256,storage_bytes"
    )
    .eq("item_id", item.id)
    .order("sort_order", { ascending: true });
  if (assetsError) throw assetsError;

  const currentAssets = (assetRows ?? []) as VendorAssetRow[];
  const normalized: NormalizedVendorProduct = {
    vendorCode: typedItem.vendor_code,
    externalId: typedItem.external_id,
    sku: typedItem.sku,
    title: typedItem.title,
    description: typedItem.description,
    productUrl: typedItem.product_url,
    vendorPriceReference:
      typedItem.vendor_price_reference === null ? null : Number(typedItem.vendor_price_reference),
    vendorCurrency: typedItem.vendor_currency,
    vendorCategoryKey: typedItem.vendor_category_key,
    vendorCategoryLabel: typedItem.vendor_category_label,
    familyKey: typedItem.family_key || safeSku(typedItem),
    variantCode: typedItem.variant_code,
    variantLabel: typedItem.variant_label,
    availability: {
      status: "AVAILABLE",
      available: true,
      purchasable: true,
      stockQuantity: null,
    },
    assets: currentAssets.map<VendorAsset>((asset) => ({
      kind: asset.kind,
      url: asset.url,
      label: asset.label,
      fileType: asset.file_type,
    })),
    sourcePayload: typedItem.source_payload,
  };

  const adapter = getVendorCatalogAdapter(typedItem.vendor_code);
  const enriched = adapter.enrich ? await adapter.enrich(normalized) : normalized;

  if (enriched.assets.length > 0) {
    const { error: upsertAssetsError } = await supabaseAdmin
      .from("vendor_catalog_assets")
      .upsert(
        enriched.assets.map((asset, sortOrder) => ({
          item_id: typedItem.id,
          kind: asset.kind,
          url: asset.url,
          label: asset.label ?? null,
          file_type: asset.fileType ?? null,
          sort_order: sortOrder,
        })),
        { onConflict: "item_id,url" }
      );
    if (upsertAssetsError) throw upsertAssetsError;
  }

  const { data: refreshedAssets, error: refreshedAssetsError } = await supabaseAdmin
    .from("vendor_catalog_assets")
    .select(
      "id,item_id,kind,url,label,file_type,sort_order,storage_bucket,storage_path,storage_sha256,storage_bytes"
    )
    .eq("item_id", typedItem.id)
    .order("sort_order", { ascending: true });
  if (refreshedAssetsError) throw refreshedAssetsError;

  const images = ((refreshedAssets ?? []) as VendorAssetRow[]).filter(
    (asset) => asset.kind === "image"
  );
  if (images.length === 0) {
    throw new Error("Vendor product has no images to archive. Approval was not completed.");
  }

  const archivedImages = await mapWithConcurrency(
    images,
    ARCHIVE_CONCURRENCY,
    (asset) => downloadAndArchiveImage(typedItem, asset)
  );

  const canonicalProduct = await ensureCanonicalProduct(
    typedItem,
    authorization.accessToken,
    mapping
  );
  const storeContent = await ensureStoreProductContent(
    canonicalProduct,
    typedItem,
    authorization.userId
  );
  await attachStoreImages(
    storeContent,
    archivedImages,
    typedItem,
    authorization.userId
  );

  const { error: itemUpdateError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .update({
      canonical_product_id: canonicalProduct.id,
      review_status: "APPROVED",
      snapshot_hash: stableProductHash(enriched),
      details_refreshed_at: new Date().toISOString(),
    })
    .eq("id", typedItem.id);
  if (itemUpdateError) throw itemUpdateError;

  return {
    productId: canonicalProduct.id,
    storeProductContentId: storeContent.id,
    archivedImageCount: archivedImages.length,
    baseProductCode: canonicalProduct.base_product_code,
  };
}
