import "server-only";

import { createVendorCatalogUserClient } from "@/lib/vendor-catalog/auth";
import {
  buildStoneProductDescription,
  type StoneDataLike,
} from "@/lib/vendor-catalog/stone-content";
import { loadVendorCategoryMapping } from "@/lib/vendor-catalog/mappings";
import { stoneVendorCatalogLabels } from "@/lib/vendor-catalog/stone-adapters";
import { archiveStoneProductContent } from "@/lib/vendor-catalog/stone-media";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

type Authorization = { userId: string; accessToken: string };

type StoneItemRow = {
  id: string;
  vendor_code: string;
  external_id: string;
  sku: string | null;
  title: string;
  description: string | null;
  product_url: string;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
  family_key: string | null;
  variant_code: string | null;
  variant_label: string | null;
  stone_type_id: string | null;
  stone_data: StoneDataLike | null;
  canonical_product_id: string | null;
};

type StoneCanonicalProduct = {
  id: string;
  sku: string;
  base_product_code: string | null;
  name: string;
  description: string | null;
};

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

function stoneSku(item: StoneItemRow) {
  const identity = item.sku?.trim() || item.external_id;
  return normalizedCode(`STONE-${item.vendor_code}-${identity}`, `STONE-${item.id.slice(0, 8)}`);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function ensureBrand(item: StoneItemRow) {
  const brandFromData = stringValue(item.stone_data?.brand);
  const brandName =
    brandFromData ||
    stoneVendorCatalogLabels[item.vendor_code as keyof typeof stoneVendorCatalogLabels] ||
    item.vendor_code;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("product_brands")
    .select("id,name,status")
    .ilike("name", brandName)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    if (existing.status !== "active") throw new Error(`${brandName} product brand exists but is not active.`);
    return { id: existing.id, name: existing.name };
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("product_brands")
    .insert({ name: brandName, status: "active" })
    .select("id,name")
    .single();
  if (createError || !created) throw createError ?? new Error(`Unable to create ${brandName} brand.`);
  return created;
}

async function loadItem(itemId: string) {
  const { data, error } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select("id,vendor_code,external_id,sku,title,description,product_url,vendor_category_key,vendor_category_label,family_key,variant_code,variant_label,stone_type_id,stone_data,canonical_product_id,catalog_domain")
    .eq("id", itemId)
    .single();
  if (error || !data) throw error ?? new Error("Stone vendor catalog item was not found.");
  if (data.catalog_domain !== "stone") throw new Error("Vendor catalog item is not a Stone item.");
  return data as StoneItemRow & { catalog_domain: "stone" };
}

async function loadStoneCategoryMapping(item: StoneItemRow) {
  const mapping = await loadVendorCategoryMapping({
    vendorCode: item.vendor_code,
    vendorCategoryKey: item.vendor_category_key,
    vendorCategoryLabel: item.vendor_category_label,
  });
  if (mapping.productType.code !== "STONE") {
    throw new Error("Stone vendor categories must map to the STONE Product Type.");
  }
  if (mapping.uom.code !== "SLAB") {
    throw new Error("Stone vendor categories must map to the SLAB UOM.");
  }
  return mapping;
}

async function backfillCanonicalDescription(
  product: StoneCanonicalProduct,
  description: string
): Promise<StoneCanonicalProduct> {
  if (product.description?.trim() || !description.trim()) return product;
  const { data, error } = await supabaseAdmin
    .from("products")
    .update({ description })
    .eq("id", product.id)
    .select("id,sku,base_product_code,name,description")
    .single();
  if (error || !data) throw error ?? new Error("Stone product description backfill returned no row.");
  return data as StoneCanonicalProduct;
}

async function loadOrCreateCanonicalProduct(
  item: StoneItemRow,
  authorization: Authorization,
  description: string
) {
  if (!item.stone_type_id) throw new Error("Stone type must be resolved before approval.");

  const mapping = await loadStoneCategoryMapping(item);

  if (item.canonical_product_id) {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id,sku,base_product_code,name,description")
      .eq("id", item.canonical_product_id)
      .single();
    if (error || !data) throw error ?? new Error("Linked Stone product was not found.");
    return backfillCanonicalDescription(data as StoneCanonicalProduct, description);
  }

  const sku = stoneSku(item);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("products")
    .select("id,sku,base_product_code,name,description,metadata")
    .ilike("sku", sku)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    if (metadata.vendor_code !== item.vendor_code || metadata.vendor_external_id !== item.external_id) {
      throw new Error(`Stone SKU collision detected for ${sku}.`);
    }
    return backfillCanonicalDescription(existing as StoneCanonicalProduct, description);
  }

  const brand = await ensureBrand(item);
  const rawColors = item.stone_data?.colors;
  const colors = Array.isArray(rawColors)
    ? rawColors.filter((value): value is string => typeof value === "string")
    : [];
  const familyKey = normalizedCode(item.family_key?.trim() || sku, sku);
  const variantCode = normalizedCode(item.variant_code?.trim() || "DEFAULT", "DEFAULT");
  const userClient = createVendorCatalogUserClient(authorization.accessToken);
  const { data: savedId, error: saveError } = await userClient.rpc("save_product_master_v2", {
    p_product: {
      id: null,
      sku,
      barcode: null,
      name: item.title,
      description,
      brand_id: brand.id,
      category_id: mapping.category.id,
      base_product_code: familyKey,
      color_code: variantCode,
      color_name: item.variant_label || colors[0] || null,
      brand: brand.name,
      category: mapping.category.name,
      unit: mapping.uom.code.toLowerCase(),
      product_type_id: mapping.productType.id,
      uom_id: mapping.uom.id,
      min_stock_level: 0,
      status: "active",
      metadata: {
        product_kind: "stone",
        source: "vendor_catalog",
        vendor_code: item.vendor_code,
        vendor_external_id: item.external_id,
        vendor_product_url: item.product_url,
        vendor_family_key: item.family_key,
        vendor_variant_code: item.variant_code,
        vendor_variant_label: item.variant_label,
        stone: item.stone_data ?? {},
      },
    },
    p_stone_profile: {
      stone_type_id: item.stone_type_id,
      material_price_band_id: null,
      vendor_name: brand.name,
      source_ref: item.product_url,
    },
  });
  if (saveError || !savedId) throw saveError ?? new Error("Stone product creation returned no id.");

  const { data: created, error: createdError } = await supabaseAdmin
    .from("products")
    .select("id,sku,base_product_code,name,description")
    .eq("id", String(savedId))
    .single();
  if (createdError || !created) throw createdError ?? new Error("Created Stone product was not found.");
  return created as StoneCanonicalProduct;
}

export async function approveStoneVendorCatalogItem(itemId: string, authorization: Authorization) {
  const item = await loadItem(itemId);
  const description = buildStoneProductDescription(item);
  const product = await loadOrCreateCanonicalProduct(item, authorization, description);
  const contentResult = await archiveStoneProductContent({
    item,
    product,
    description,
    userId: authorization.userId,
  });

  const { error: itemUpdateError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .update({
      canonical_product_id: product.id,
      review_status: "APPROVED",
      reviewed_at: new Date().toISOString(),
      reviewed_by: authorization.userId,
    })
    .eq("id", item.id);
  if (itemUpdateError) throw itemUpdateError;

  return {
    productId: product.id,
    storeProductContentId: contentResult.storeProductContentId,
    archivedImageCount: contentResult.archivedImageCount,
    baseProductCode: product.base_product_code ?? product.sku ?? null,
  };
}
