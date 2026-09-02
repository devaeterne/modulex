import "server-only";

import {
  classifyVendorProduct,
  stableAvailabilityHash,
  stableDiscoveryHash,
  stableNormalizedAvailabilityHash,
  type NormalizedVendorProduct,
  type VendorCatalogAdapter,
  type VendorCatalogChangeState,
  type VendorCatalogDiscoveryScope,
  type VendorCatalogReviewStatus,
  type VendorAvailabilityStatus,
} from "@/lib/vendor-catalog/domain";
import { loadVendorCatalogCheck } from "@/lib/vendor-catalog/check";
import {
  reconcileVendorAvailability,
  type VendorAvailabilityReconcileItem,
} from "@/lib/vendor-catalog/availability";
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
  availabilityChanged: number;
  available: number;
  outOfStock: number;
  unavailable: number;
  unknown: number;
  missing: number;
  canonicalDeactivated: number;
  canonicalReactivated: number;
};

type ExistingItem = VendorAvailabilityReconcileItem & {
  external_id: string;
  snapshot_hash: string;
  discovery_hash: string | null;
  review_status: VendorCatalogReviewStatus;
  details_refreshed_at: string | null;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
  family_key: string | null;
  variant_code: string | null;
  variant_label: string | null;
  availability_status: VendorAvailabilityStatus;
  availability_hash: string | null;
  availability_changed_at: string | null;
  missing_success_count: number;
};

type PreparedProduct = {
  product: NormalizedVendorProduct;
  existing: ExistingItem | undefined;
  discoveryHash: string;
  availabilityHash: string;
  availabilityChanged: boolean;
  snapshotHash: string;
  changeState: VendorCatalogChangeState;
  reviewStatus: VendorCatalogReviewStatus;
  detailsRefreshedAt: string | null;
  classificationBackfillNeeded: boolean;
  seenResetNeeded: boolean;
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

function emptyCounts(): SyncCounts {
  return {
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    availabilityChanged: 0,
    available: 0,
    outOfStock: 0,
    unavailable: 0,
    unknown: 0,
    missing: 0,
    canonicalDeactivated: 0,
    canonicalReactivated: 0,
  };
}

function countAvailability(counts: SyncCounts, status: VendorAvailabilityStatus) {
  if (status === "AVAILABLE") counts.available += 1;
  else if (status === "OUT_OF_STOCK") counts.outOfStock += 1;
  else if (status === "UNAVAILABLE") counts.unavailable += 1;
  else if (status === "MISSING") counts.missing += 1;
  else counts.unknown += 1;
}

async function loadExistingItems(vendorCode: string) {
  const rows: ExistingItem[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("vendor_catalog_items")
      .select(
        "id,external_id,snapshot_hash,discovery_hash,review_status,details_refreshed_at,vendor_category_key,vendor_category_label,family_key,variant_code,variant_label,canonical_product_id,availability_status,availability_hash,availability_changed_at,missing_success_count,canonical_inactivated_by_vendor_at,canonical_status_version_at,reactivation_requires_review"
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
    const availabilityHash = stableAvailabilityHash(product);
    const availabilityChanged = existing?.availability_hash !== availabilityHash;
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
      familyKey: product.familyKey ?? existing?.family_key ?? product.familyKey,
      variantCode: product.variantCode ?? existing?.variant_code ?? null,
      variantLabel: product.variantLabel ?? existing?.variant_label ?? null,
    };
    const classificationBackfillNeeded =
      Boolean(existing) &&
      ((existing?.vendor_category_key == null &&
        productWithPreservedScope.vendorCategoryKey != null) ||
        (existing?.vendor_category_label == null &&
          productWithPreservedScope.vendorCategoryLabel != null) ||
        (existing?.family_key == null && productWithPreservedScope.familyKey != null) ||
        (existing?.variant_code == null && productWithPreservedScope.variantCode != null) ||
        (existing?.variant_label == null && productWithPreservedScope.variantLabel != null));

    return {
      product: productWithPreservedScope,
      existing,
      discoveryHash,
      availabilityHash,
      availabilityChanged,
      snapshotHash:
        changeState === "UNCHANGED" && existing?.snapshot_hash
          ? existing.snapshot_hash
          : discoveryHash,
      changeState,
      reviewStatus,
      detailsRefreshedAt:
        changeState === "UNCHANGED" ? existing?.details_refreshed_at ?? null : null,
      classificationBackfillNeeded,
      seenResetNeeded: Boolean(existing && existing.missing_success_count > 0),
    };
  });
}

function isAuthoritativeFullDiscovery(
  adapter: VendorCatalogAdapter,
  categoryKey: string | null,
  products: NormalizedVendorProduct[]
) {
  if (categoryKey !== null) return false;
  if (
    adapter.vendorCode === "ruvati" &&
    products.some((product) => product.externalId.startsWith("sitemap:"))
  ) {
    return false;
  }
  return true;
}

async function reconcileObservedAvailability(
  entries: PreparedProduct[],
  counts: SyncCounts,
  now: string
) {
  for (const entry of entries) {
    if (!entry.existing || !entry.availabilityChanged) continue;
    const result = await reconcileVendorAvailability(
      entry.existing,
      entry.product.availability.status,
      now
    );
    if (result.deactivated) counts.canonicalDeactivated += 1;
    if (result.reactivated) counts.canonicalReactivated += 1;
  }
}

async function reconcileMissingItems(
  adapter: VendorCatalogAdapter,
  products: NormalizedVendorProduct[],
  existingByExternalId: Map<string, ExistingItem>,
  counts: SyncCounts,
  now: string
) {
  const discoveredIds = new Set(products.map((product) => product.externalId));
  const missingAvailability = {
    status: "MISSING" as const,
    available: null,
    purchasable: null,
    stockQuantity: null,
  };
  const missingHash = stableNormalizedAvailabilityHash(missingAvailability);

  for (const existing of existingByExternalId.values()) {
    if (discoveredIds.has(existing.external_id)) continue;
    const nextMissingCount = existing.missing_success_count + 1;
    const becomesMissing = nextMissingCount >= 2;
    const availabilityChanged = becomesMissing && existing.availability_status !== "MISSING";

    const { error } = await supabaseAdmin
      .from("vendor_catalog_items")
      .update({
        missing_success_count: nextMissingCount,
        ...(becomesMissing
          ? {
              availability_status: "MISSING",
              vendor_available: null,
              vendor_purchasable: null,
              vendor_stock_quantity: null,
              availability_hash: missingHash,
              availability_changed_at: availabilityChanged
                ? now
                : existing.availability_changed_at,
            }
          : {}),
      })
      .eq("id", existing.id);
    if (error) throw error;

    if (!becomesMissing) continue;
    counts.missing += 1;
    if (availabilityChanged) counts.availabilityChanged += 1;

    const result = await reconcileVendorAvailability(existing, "MISSING", now);
    if (result.deactivated) counts.canonicalDeactivated += 1;
    if (result.reactivated) counts.canonicalReactivated += 1;
  }
}

export async function runVendorCatalogSync(
  adapter: VendorCatalogAdapter,
  options: VendorCatalogSyncOptions = {}
): Promise<VendorCatalogSyncResult> {
  if (!isSupabaseAdminConfigured) {
    throw new Error("Vendor catalog sync requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const errors: Array<{ externalId?: string; message: string }> = [];
  const counts = emptyCounts();

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
    for (const entry of prepared) {
      countAvailability(counts, entry.product.availability.status);
      if (entry.existing && entry.availabilityChanged) counts.availabilityChanged += 1;
    }

    const candidates =
      options.changedOnly === true
        ? prepared.filter(
            (entry) =>
              entry.changeState !== "UNCHANGED" ||
              entry.classificationBackfillNeeded ||
              entry.availabilityChanged ||
              entry.seenResetNeeded
          )
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
            availability_status: entry.product.availability.status,
            vendor_available: entry.product.availability.available,
            vendor_purchasable: entry.product.availability.purchasable,
            vendor_stock_quantity: entry.product.availability.stockQuantity,
            availability_hash: entry.availabilityHash,
            availability_changed_at: entry.availabilityChanged
              ? now
              : entry.existing?.availability_changed_at ?? null,
            missing_success_count: 0,
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
        availability: entry.product.availability,
        assets: entry.product.assets,
      },
      source_payload: entry.product.sourcePayload,
    }));

    for (const snapshotBatch of chunk(snapshotRows, 250)) {
      if (snapshotBatch.length === 0) continue;
      const { error } = await supabaseAdmin.from("vendor_catalog_snapshots").insert(snapshotBatch);
      if (error) throw error;
    }

    await reconcileObservedAvailability(persisted, counts, now);

    if (isAuthoritativeFullDiscovery(adapter, categoryKey, products) && counts.failed === 0) {
      await reconcileMissingItems(adapter, products, existingByExternalId, counts, now);
    }

    for (const entry of persisted) {
      if (entry.changeState === "NEW") counts.created += 1;
      else if (entry.changeState === "UPDATED") counts.updated += 1;
      else if (options.changedOnly !== true) counts.unchanged += 1;
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
        availability_changed_count: counts.availabilityChanged,
        available_count: counts.available,
        out_of_stock_count: counts.outOfStock,
        unavailable_count: counts.unavailable,
        unknown_count: counts.unknown,
        missing_count: counts.missing,
        canonical_deactivated_count: counts.canonicalDeactivated,
        canonical_reactivated_count: counts.canonicalReactivated,
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
        availability_changed_count: counts.availabilityChanged,
        available_count: counts.available,
        out_of_stock_count: counts.outOfStock,
        unavailable_count: counts.unavailable,
        unknown_count: counts.unknown,
        missing_count: counts.missing,
        canonical_deactivated_count: counts.canonicalDeactivated,
        canonical_reactivated_count: counts.canonicalReactivated,
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