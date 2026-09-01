import "server-only";

import {
  classifyVendorProduct,
  stableDiscoveryHash,
  type NormalizedVendorProduct,
  type VendorCatalogAdapter,
  type VendorCatalogChangeState,
  type VendorCatalogDiscoveryScope,
} from "@/lib/vendor-catalog/domain";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "@/lib/supabase/server-admin";

type ExistingHashRow = {
  external_id: string;
  discovery_hash: string | null;
};

type CheckCounts = {
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

type CheckItemRow = {
  normalized_payload: Record<string, unknown>;
  source_payload: unknown;
};

export type VendorCatalogCheckResult = {
  checkId: string;
  vendorCode: string;
  categoryKey: string | null;
  categoryLabel: string | null;
  status: "SUCCEEDED" | "FAILED";
  counts: CheckCounts;
  willSync: number;
  error?: string;
};

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizedPayload(product: NormalizedVendorProduct) {
  return {
    vendorCode: product.vendorCode,
    externalId: product.externalId,
    sku: product.sku,
    title: product.title,
    description: product.description,
    productUrl: product.productUrl,
    vendorPriceReference: product.vendorPriceReference,
    vendorCurrency: product.vendorCurrency,
    vendorCategoryKey: product.vendorCategoryKey,
    vendorCategoryLabel: product.vendorCategoryLabel,
    familyKey: product.familyKey,
    variantCode: product.variantCode,
    variantLabel: product.variantLabel,
    assets: product.assets,
  };
}

function fromNormalizedPayload(row: CheckItemRow): NormalizedVendorProduct {
  const payload = row.normalized_payload;
  return {
    vendorCode: String(payload.vendorCode),
    externalId: String(payload.externalId),
    sku: typeof payload.sku === "string" ? payload.sku : null,
    title: String(payload.title ?? "Untitled product"),
    description: typeof payload.description === "string" ? payload.description : null,
    productUrl: String(payload.productUrl),
    vendorPriceReference:
      typeof payload.vendorPriceReference === "number"
        ? payload.vendorPriceReference
        : payload.vendorPriceReference === null
          ? null
          : Number(payload.vendorPriceReference),
    vendorCurrency: typeof payload.vendorCurrency === "string" ? payload.vendorCurrency : null,
    vendorCategoryKey:
      typeof payload.vendorCategoryKey === "string" ? payload.vendorCategoryKey : null,
    vendorCategoryLabel:
      typeof payload.vendorCategoryLabel === "string" ? payload.vendorCategoryLabel : null,
    familyKey: String(payload.familyKey),
    variantCode: typeof payload.variantCode === "string" ? payload.variantCode : null,
    variantLabel: typeof payload.variantLabel === "string" ? payload.variantLabel : null,
    assets: Array.isArray(payload.assets)
      ? (payload.assets as NormalizedVendorProduct["assets"])
      : [],
    sourcePayload: row.source_payload,
  };
}

async function loadExistingHashes(vendorCode: string) {
  const rows: ExistingHashRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("vendor_catalog_items")
      .select("external_id,discovery_hash")
      .eq("vendor_code", vendorCode)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as ExistingHashRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return new Map(rows.map((row) => [row.external_id, row.discovery_hash]));
}

export async function runVendorCatalogCheck(
  adapter: VendorCatalogAdapter,
  options: { scope?: VendorCatalogDiscoveryScope; userId?: string | null } = {}
): Promise<VendorCatalogCheckResult> {
  if (!isSupabaseAdminConfigured) {
    throw new Error("Vendor catalog check requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const scope = options.scope ?? {};
  const categoryKey = scope.categoryKey?.trim() || null;
  const categoryLabel = scope.categoryLabel?.trim() || categoryKey;
  const { data: check, error: createError } = await supabaseAdmin
    .from("vendor_catalog_checks")
    .insert({
      vendor_code: adapter.vendorCode,
      vendor_category_key: categoryKey,
      vendor_category_label: categoryLabel,
      status: "RUNNING",
      created_by: options.userId ?? null,
    })
    .select("id")
    .single();
  if (createError || !check) throw createError ?? new Error("Vendor catalog check could not be created.");

  const counts: CheckCounts = {
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  try {
    const [products, existingHashes] = await Promise.all([
      adapter.discover(scope),
      loadExistingHashes(adapter.vendorCode),
    ]);
    counts.discovered = products.length;

    const prepared = products.map((product) => {
      const discoveryHash = stableDiscoveryHash(product);
      const changeState = classifyVendorProduct(
        existingHashes.get(product.externalId),
        discoveryHash
      );
      if (changeState === "NEW") counts.created += 1;
      else if (changeState === "UPDATED") counts.updated += 1;
      else counts.unchanged += 1;

      return {
        check_id: check.id,
        external_id: product.externalId,
        discovery_hash: discoveryHash,
        change_state: changeState,
        normalized_payload: normalizedPayload(product),
        source_payload: product.sourcePayload,
      };
    });

    for (const batch of chunk(prepared, 250)) {
      if (batch.length === 0) continue;
      const { error } = await supabaseAdmin.from("vendor_catalog_check_items").insert(batch);
      if (error) throw error;
    }

    const { error: finishError } = await supabaseAdmin
      .from("vendor_catalog_checks")
      .update({
        status: "SUCCEEDED",
        discovered_count: counts.discovered,
        new_count: counts.created,
        updated_count: counts.updated,
        unchanged_count: counts.unchanged,
        failed_count: 0,
        finished_at: new Date().toISOString(),
      })
      .eq("id", check.id);
    if (finishError) throw finishError;

    return {
      checkId: check.id,
      vendorCode: adapter.vendorCode,
      categoryKey,
      categoryLabel,
      status: "SUCCEEDED",
      counts,
      willSync: counts.created + counts.updated,
    };
  } catch (error) {
    const message = errorMessage(error);
    counts.failed += 1;
    await supabaseAdmin
      .from("vendor_catalog_checks")
      .update({
        status: "FAILED",
        discovered_count: counts.discovered,
        new_count: counts.created,
        updated_count: counts.updated,
        unchanged_count: counts.unchanged,
        failed_count: counts.failed,
        finished_at: new Date().toISOString(),
        error_summary: [{ message }],
      })
      .eq("id", check.id);

    return {
      checkId: check.id,
      vendorCode: adapter.vendorCode,
      categoryKey,
      categoryLabel,
      status: "FAILED",
      counts,
      willSync: 0,
      error: message,
    };
  }
}

export async function loadVendorCatalogCheck(
  checkId: string,
  vendorCode: string
): Promise<{
  scope: VendorCatalogDiscoveryScope;
  products: NormalizedVendorProduct[];
  states: Map<string, VendorCatalogChangeState>;
}> {
  const { data: check, error: checkError } = await supabaseAdmin
    .from("vendor_catalog_checks")
    .select("id,vendor_code,vendor_category_key,vendor_category_label,status,expires_at")
    .eq("id", checkId)
    .maybeSingle();
  if (checkError || !check) throw checkError ?? new Error("Vendor catalog check was not found.");
  if (check.vendor_code !== vendorCode) throw new Error("Vendor catalog check does not match the selected vendor.");
  if (check.status !== "SUCCEEDED") throw new Error("Vendor catalog check is not ready for sync.");
  if (new Date(check.expires_at).getTime() <= Date.now()) {
    throw new Error("Vendor catalog check expired. Run Check Updates again.");
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("vendor_catalog_check_items")
    .select("external_id,change_state,normalized_payload,source_payload")
    .eq("check_id", checkId)
    .order("external_id", { ascending: true });
  if (rowsError) throw rowsError;

  const states = new Map<string, VendorCatalogChangeState>();
  const products = (rows ?? []).map((row) => {
    states.set(row.external_id, row.change_state as VendorCatalogChangeState);
    return fromNormalizedPayload(row as CheckItemRow);
  });

  return {
    scope: {
      categoryKey: check.vendor_category_key,
      categoryLabel: check.vendor_category_label,
    },
    products,
    states,
  };
}