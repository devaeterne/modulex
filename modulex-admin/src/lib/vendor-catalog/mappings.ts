import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";

export type ResolvedVendorCategoryMapping = {
  id: string;
  vendorCode: string;
  vendorCategoryKey: string;
  vendorCategoryLabel: string;
  category: { id: string; name: string };
  productType: { id: string; code: string; name: string };
  uom: { id: string; code: string; name: string };
};

export class CategoryMappingRequiredError extends Error {
  readonly code = "CATEGORY_MAPPING_REQUIRED";
  readonly vendorCode: string;
  readonly vendorCategoryKey: string | null;
  readonly vendorCategoryLabel: string | null;

  constructor(input: {
    vendorCode: string;
    vendorCategoryKey: string | null;
    vendorCategoryLabel: string | null;
  }) {
    super(
      input.vendorCategoryKey
        ? `No Modulex category mapping exists for ${input.vendorCategoryLabel ?? input.vendorCategoryKey}.`
        : "This vendor product has no category identity to map."
    );
    this.name = "CategoryMappingRequiredError";
    this.vendorCode = input.vendorCode;
    this.vendorCategoryKey = input.vendorCategoryKey;
    this.vendorCategoryLabel = input.vendorCategoryLabel;
  }
}

type MappingRow = {
  id: string;
  vendor_code: string;
  vendor_category_key: string;
  vendor_category_label: string;
  modulex_category_id: string;
  product_type_id: string;
  uom_id: string;
};

async function resolveMappingRow(row: MappingRow): Promise<ResolvedVendorCategoryMapping> {
  const [categoryResult, typeResult, uomResult, allowedResult] = await Promise.all([
    supabaseAdmin
      .from("product_categories")
      .select("id,name,status")
      .eq("id", row.modulex_category_id)
      .maybeSingle(),
    supabaseAdmin
      .from("product_types")
      .select("id,code,name,is_active")
      .eq("id", row.product_type_id)
      .maybeSingle(),
    supabaseAdmin
      .from("units_of_measure")
      .select("id,code,name,is_active")
      .eq("id", row.uom_id)
      .maybeSingle(),
    supabaseAdmin
      .from("product_type_allowed_uoms")
      .select("uom_id")
      .eq("product_type_id", row.product_type_id),
  ]);

  if (categoryResult.error || !categoryResult.data || categoryResult.data.status !== "active") {
    throw categoryResult.error ?? new Error("Mapped Modulex category is missing or inactive.");
  }
  if (typeResult.error || !typeResult.data || !typeResult.data.is_active) {
    throw typeResult.error ?? new Error("Mapped Product Type is missing or inactive.");
  }
  if (uomResult.error || !uomResult.data || !uomResult.data.is_active) {
    throw uomResult.error ?? new Error("Mapped UOM is missing or inactive.");
  }
  if (allowedResult.error) throw allowedResult.error;
  const allowedUomIds = (allowedResult.data ?? []).map((item) => item.uom_id);
  if (allowedUomIds.length > 0 && !allowedUomIds.includes(row.uom_id)) {
    throw new Error("Mapped UOM is not allowed for the selected Product Type.");
  }

  return {
    id: row.id,
    vendorCode: row.vendor_code,
    vendorCategoryKey: row.vendor_category_key,
    vendorCategoryLabel: row.vendor_category_label,
    category: { id: categoryResult.data.id, name: categoryResult.data.name },
    productType: {
      id: typeResult.data.id,
      code: typeResult.data.code,
      name: typeResult.data.name,
    },
    uom: { id: uomResult.data.id, code: uomResult.data.code, name: uomResult.data.name },
  };
}

export async function loadVendorCategoryMapping(input: {
  vendorCode: string;
  vendorCategoryKey: string | null;
  vendorCategoryLabel: string | null;
}) {
  if (!input.vendorCategoryKey) throw new CategoryMappingRequiredError(input);

  const { data, error } = await supabaseAdmin
    .from("vendor_catalog_category_mappings")
    .select(
      "id,vendor_code,vendor_category_key,vendor_category_label,modulex_category_id,product_type_id,uom_id"
    )
    .eq("vendor_code", input.vendorCode)
    .eq("vendor_category_key", input.vendorCategoryKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CategoryMappingRequiredError(input);
  return resolveMappingRow(data as MappingRow);
}

export async function getVendorCategoryMappingOptions() {
  const [categories, productTypes, uoms, allowed] = await Promise.all([
    supabaseAdmin
      .from("product_categories")
      .select("id,name")
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("product_types")
      .select("id,code,name,default_uom_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("units_of_measure")
      .select("id,code,name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("product_type_allowed_uoms")
      .select("product_type_id,uom_id"),
  ]);

  if (categories.error) throw categories.error;
  if (productTypes.error) throw productTypes.error;
  if (uoms.error) throw uoms.error;
  if (allowed.error) throw allowed.error;

  return {
    categories: categories.data ?? [],
    productTypes: productTypes.data ?? [],
    uoms: uoms.data ?? [],
    allowedUoms: allowed.data ?? [],
  };
}

async function resolveOrCreateCategory(input: {
  modulexCategoryId?: string | null;
  createCategoryName?: string | null;
}) {
  const createName = input.createCategoryName?.trim() || null;
  if (createName) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("product_categories")
      .select("id,name,status")
      .ilike("name", createName)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.status !== "active") {
        throw new Error("A category with this name exists but is inactive.");
      }
      return existing;
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("product_categories")
      .insert({ name: createName, status: "active" })
      .select("id,name,status")
      .single();
    if (createError || !created) throw createError ?? new Error("Modulex category creation failed.");
    return created;
  }

  if (!input.modulexCategoryId) throw new Error("Select an existing Modulex category or create one.");
  const { data, error } = await supabaseAdmin
    .from("product_categories")
    .select("id,name,status")
    .eq("id", input.modulexCategoryId)
    .maybeSingle();
  if (error || !data || data.status !== "active") {
    throw error ?? new Error("Selected Modulex category is missing or inactive.");
  }
  return data;
}

export async function saveVendorCategoryMapping(
  input: {
    vendorCode: string;
    vendorCategoryKey: string;
    vendorCategoryLabel: string;
    modulexCategoryId?: string | null;
    createCategoryName?: string | null;
    productTypeId: string;
    uomId: string;
  },
  userId: string
) {
  const vendorCode = input.vendorCode.trim().toLowerCase();
  const vendorCategoryKey = input.vendorCategoryKey.trim();
  const vendorCategoryLabel = input.vendorCategoryLabel.trim();
  if (!vendorCode || !vendorCategoryKey || !vendorCategoryLabel) {
    throw new Error("Vendor and vendor category are required for mapping.");
  }
  if (!input.productTypeId || !input.uomId) {
    throw new Error("Product Type and UOM are required for mapping.");
  }

  const [category, typeResult, uomResult, allowedResult] = await Promise.all([
    resolveOrCreateCategory(input),
    supabaseAdmin
      .from("product_types")
      .select("id,code,name,is_active")
      .eq("id", input.productTypeId)
      .maybeSingle(),
    supabaseAdmin
      .from("units_of_measure")
      .select("id,code,name,is_active")
      .eq("id", input.uomId)
      .maybeSingle(),
    supabaseAdmin
      .from("product_type_allowed_uoms")
      .select("uom_id")
      .eq("product_type_id", input.productTypeId),
  ]);

  if (typeResult.error || !typeResult.data || !typeResult.data.is_active) {
    throw typeResult.error ?? new Error("Selected Product Type is missing or inactive.");
  }
  if (uomResult.error || !uomResult.data || !uomResult.data.is_active) {
    throw uomResult.error ?? new Error("Selected UOM is missing or inactive.");
  }
  if (allowedResult.error) throw allowedResult.error;
  const allowedUomIds = (allowedResult.data ?? []).map((row) => row.uom_id);
  if (allowedUomIds.length > 0 && !allowedUomIds.includes(input.uomId)) {
    throw new Error("Selected UOM is not allowed for this Product Type.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("vendor_catalog_category_mappings")
    .select("id,created_by")
    .eq("vendor_code", vendorCode)
    .eq("vendor_category_key", vendorCategoryKey)
    .maybeSingle();
  if (existingError) throw existingError;

  const { data: saved, error: saveError } = await supabaseAdmin
    .from("vendor_catalog_category_mappings")
    .upsert(
      {
        id: existing?.id,
        vendor_code: vendorCode,
        vendor_category_key: vendorCategoryKey,
        vendor_category_label: vendorCategoryLabel,
        modulex_category_id: category.id,
        product_type_id: input.productTypeId,
        uom_id: input.uomId,
        created_by: existing?.created_by ?? userId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "vendor_code,vendor_category_key" }
    )
    .select(
      "id,vendor_code,vendor_category_key,vendor_category_label,modulex_category_id,product_type_id,uom_id"
    )
    .single();
  if (saveError || !saved) throw saveError ?? new Error("Vendor category mapping save failed.");

  return resolveMappingRow(saved as MappingRow);
}