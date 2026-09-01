import "server-only";

import {
  classifyVendorProduct,
  stableDiscoveryHash,
  type NormalizedVendorProduct,
  type VendorCatalogAdapter,
  type VendorCatalogChangeState,
  type VendorCatalogDiscoveryScope,
  type VendorCatalogReviewStatus,
} from "@/lib/vendor-catalog/domain";
import { loadVendorCatalogCheck } from "@/lib/vendor-catalog/check";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "@/lib/supabase/server-admin";

type SyncCounts = {
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

type ExistingItem = {
  id: string;
  external_id: string;
  snapshot_hash: string;
  discovery_hash: string | null;
  review_status: VendorCatalogReviewStatus;
  details_refreshed_at: string | null;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
};

type PreparedProduct = {
  product: NormalizedVendorProduct;
  discoveryHash: string;
  snapshotHash: string;
  changeState: VendorCatalogChangeState;
  reviewStatus: VendorCatalogReviewStatus;
  detailsRefreshedAt: string | null;
};

export type VendorCatalogSyncOptions = {
  scope?: VendorCatalogDiscoveryScope;
  checkId?: string | null;
  changedOnly?: boolean;
  userId?: string | null;
};

export type VendorCatalogSyncResult = {
  runId: string;
  vendorCode: string;
  categoryKey: string | null;
  categoryLabel: string | null;
  status: "SUCCEEDED" | "FAILED";
  counts: SyncCounts;
  errors: Array<{ externalId?: string; message: string }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function loadExistingItems(vendorCode: string) {
  const rows: ExistingItem[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("vendor_catalog_items")
      .select(
        "id,external_id,snapshot_hash,discovery_hash,review_status,details_refreshed_at,vendor_category_key,vendor_category_label"
      )
      .eq("vendor_code", vendorCode)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as ExistingItem[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return new Map(rows.map((row) => [row.external_id, row]));
}

function prepareProducts(
  products: NormalizedVendorProduct[],
  existingByExternalId: Map<string, ExistingItem>,
  forcedStates?: Map<string, VendorCatalogChangeState>
) {
  return products.map<PreparedProduct>((product) => {
    const existing = existingByExternalId.get(product.externalId);
    const discoveryHash = stableDiscoveryHash(product);
    const changeState =
      forcedStates?.get(product.externalId) ??
      classifyVendorProduct(existing?.discovery_hash, discoveryHash);
    const reviewStatus: VendorCatalogReviewStatus =
      changeState === "UNCHANGED" ? existing?.review_status ?? "PENDING" : "PENDING";
    const productWithPreservedScope: NormalizedVendorProduct = {
      ...product,
      vendorCategoryKey:
        product.vendorCategoryKey ?? existing?.vendor_category_key ?? null,
      vendorCategoryLabel:
        product.vendorCategoryLabel ?? existing?.vendor_category_label ?? null,
    };

    return {
      product: productWithPreservedScope,
      discoveryHash,
      snapshotHash:
        changeState === "UNCHANGED" && existing?.snapshot_hash
          ? existing.snapshot_hash
          : discoveryHash,
      changeState,
      reviewStatus,
      detailsRefreshedAt:
        changeState === "UNCHANGED" ? existing?.details_refreshed_at ?? null : null,
    };
  });
}

export async function runVendorCatalogSync(
  adapter: VendorCatalogAdapter,
  options: VendorCatalogSyncOptions = {}
): Promise<VendorCatalogSyncResult> {
  if (!isSupabaseAdminConfigured) {
    throw new Error("Vendor catalog sync requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const errors: Array<{ externalId?: string; message: string }> = [];
  const counts: SyncCounts = {
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  let scope: VendorCatalogDiscoveryScope = options.scope ?? {};
  let snapshotProducts: NormalizedVendorProduct[] | null = null;
  let snapshotStates: Map<string, VendorCatalogChangeState> | undefined;

  if (options.checkId) {
    const snapshot = await loadVendorCatalogCheck(options.checkId, adapter.vendorCode);
    scope = snapshot.scope;
    snapshotProducts = snapshot.products;
    snapshotStates = snapshot.states;
  }

  const categoryKey = scope.categoryKey?.trim() || null;
  const categoryLabel = scope.categoryLabel?.trim() || categoryKey;
  const { data: run, error: runError } = await supabaseAdmin
    .from("vendor_catalog_runs")
    .insert({
      vendor_code: adapter.vendorCode,
      vendor_category_key: categoryKey,
      vendor_category_label: categoryLabel,
      sync_mode: "SYNC",
      selection_payload: {
        checkId: options.checkId ?? null,
        changedOnly: options.changedOnly === true,
        requestedBy: options.userId ?? null,
      },
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) throw runError ?? new Error("Vendor sync run could not be created.");

  try {
    const [products, existingByExternalId] = await Promise.all([
      snapshotProducts ? Promise.resolve(snapshotProducts) : adapter.discover(scope),
      loadExistingItems(adapter.vendorCode),
    ]);
    counts.discovered = products.length;

    const prepared = prepareProducts(products, existingByExternalId, snapshotStates);
    const candidates =
      options.changedOnly === true
        ? prepared.filter((entry) => entry.changeState !== "UNCHANGED")
        : prepared;
    if (options.changedOnly === true) {
      counts.unchanged = prepared.filter((entry) => entry.changeState === "UNCHANGED").length;
    }

    const persistedIds = new Map<string, string>();
    const now = new Date().toISOString();

    for (const batch of chunk(candidates, 100)) {
      const { data, error } = await supabaseAdmin
        .from("vendor_catalog_items")
        .upsert(
          batch.map((entry) => ({
            vendor_code: entry.product.vendorCode,
            external_id: entry.product.externalId,
            sku: entry.product.sku,
            title: entry.product.title,
            description: entry.product.description,
            product_url: entry.product.productUrl,
            vendor_price_reference: entry.product.vendorPriceReference,
            vendor_currency: entry.product.vendorCurrency,
            vendor_category_key: entry.product.vendorCategoryKey,
            vendor_category_label: entry.product.vendorCategoryLabel,
            family_key: entry.product.familyKey,
            variant_code: entry.product.variantCode,
            variant_label: entry.product.variantLabel,
            snapshot_hash: entry.snapshotHash,
            discovery_hash: entry.discoveryHash,
            change_state: entry.changeState,
            review_status: entry.reviewStatus,
            last_seen_run_id: run.id,
            source_payload: entry.product.sourcePayload,
            last_seen_at: now,
            details_refreshed_at: entry.detailsRefreshedAt,
          })),
          { onConflict: "vendor_code,external_id" }
        )
        .select("id,external_id");

      if (error) {
        for (const entry of batch) {
          counts.failed += 1;
          errors.push({ externalId: entry.product.externalId, message: error.message });
        }
        continue;
      }

      for (const row of data ?? []) {
        persistedIds.set(row.external_id, row.id);
      }
    }

    const persisted = candidates.filter((entry) => persistedIds.has(entry.product.externalId));
    const changed = persisted.filter((entry) => entry.changeState !== "UNCHANGED");

    for (const itemIdBatch of chunk(
      changed.map((entry) => persistedIds.get(entry.product.externalId)!).filter(Boolean),
      100
    )) {
      if (itemIdBatch.length === 0) continue;
      const { error } = await supabaseAdmin
        .from("vendor_catalog_assets")
        .delete()
        .in("item_id", itemIdBatch);
      if (error) throw error;
    }

    const assetRows = changed.flatMap((entry) => {
      const itemId = persistedIds.get(entry.product.externalId);
      if (!itemId) return [];
      return entry.product.assets.map((asset, sortOrder) => ({
        item_id: itemId,
        kind: asset.kind,
        url: asset.url,
        label: asset.label ?? null,
        file_type: asset.fileType ?? null,
        sort_order: sortOrder,
      }));
    });

    for (const assetBatch of chunk(assetRows, 500)) {
      if (assetBatch.length === 0) continue;
      const { error } = await supabaseAdmin.from("vendor_catalog_assets").insert(assetBatch);
      if (error) throw error;
    }

    const snapshotRows = persisted.map((entry) => ({
      run_id: run.id,
      item_id: persistedIds.get(entry.product.externalId)!,
      snapshot_hash: entry.snapshotHash,
      change_state: entry.changeState,
      normalized_payload: {
        vendorCode: entry.product.vendorCode,
        externalId: entry.product.externalId,
        sku: entry.product.sku,
        title: entry.product.title,
        description: entry.product.description,
        productUrl: entry.product.productUrl,
        vendorPriceReference: entry.product.vendorPriceReference,
        vendorCurrency: entry.product.vendorCurrency,
        vendorCategoryKey: entry.product.vendorCategoryKey,
        vendorCategoryLabel: entry.product.vendorCategoryLabel,
        familyKey: entry.product.familyKey,
        variantCode: entry.product.variantCode,
        variantLabel: entry.product.variantLabel,
        assets: entry.product.assets,
      },
      source_payload: entry.product.sourcePayload,
    }));

    for (const snapshotBatch of chunk(snapshotRows, 250)) {
      if (snapshotBatch.length === 0) continue;
      const { error } = await supabaseAdmin.from("vendor_catalog_snapshots").insert(snapshotBatch);
      if (error) throw error;
    }

    for (const entry of persisted) {
      if (entry.changeState === "NEW") counts.created += 1;
      else if (entry.changeState === "UPDATED") counts.updated += 1;
      else counts.unchanged += 1;
    }

    const status = counts.failed > 0 ? "FAILED" : "SUCCEEDED";
    const { error: finishError } = await supabaseAdmin
      .from("vendor_catalog_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        discovered_count: counts.discovered,
        new_count: counts.created,
        updated_count: counts.updated,
        unchanged_count: counts.unchanged,
        failed_count: counts.failed,
        error_summary: errors.length > 0 ? errors : null,
      })
      .eq("id", run.id);
    if (finishError) throw finishError;

    return {
      runId: run.id,
      vendorCode: adapter.vendorCode,
      categoryKey,
      categoryLabel,
      status,
      counts,
      errors,
    };
  } catch (error) {
    const message = errorMessage(error);
    errors.push({ message });
    await supabaseAdmin
      .from("vendor_catalog_runs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        discovered_count: counts.discovered,
        new_count: counts.created,
        updated_count: counts.updated,
        unchanged_count: counts.unchanged,
        failed_count: counts.failed + 1,
        error_summary: errors,
      })
      .eq("id", run.id);

    return {
      runId: run.id,
      vendorCode: adapter.vendorCode,
      categoryKey,
      categoryLabel,
      status: "FAILED",
      counts: { ...counts, failed: counts.failed + 1 },
      errors,
    };
  }
}