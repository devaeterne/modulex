import "server-only";

import {
  classifyVendorProduct,
  stableProductHash,
  type NormalizedVendorProduct,
  type VendorCatalogAdapter,
  type VendorCatalogReviewStatus,
} from "@/lib/vendor-catalog/domain";
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

export type VendorCatalogSyncResult = {
  runId: string;
  vendorCode: string;
  status: "SUCCEEDED" | "FAILED";
  counts: SyncCounts;
  errors: Array<{ externalId?: string; message: string }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function persistProduct(
  runId: string,
  product: NormalizedVendorProduct,
  counts: SyncCounts
) {
  const hash = stableProductHash(product);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select("id, snapshot_hash, review_status")
    .eq("vendor_code", product.vendorCode)
    .eq("external_id", product.externalId)
    .maybeSingle();

  if (existingError) throw existingError;

  const changeState = classifyVendorProduct(existing?.snapshot_hash, hash);
  const previousReviewStatus = (existing?.review_status ?? "PENDING") as VendorCatalogReviewStatus;
  const reviewStatus: VendorCatalogReviewStatus =
    changeState === "UNCHANGED" ? previousReviewStatus : "PENDING";

  const { data: item, error: itemError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .upsert(
      {
        vendor_code: product.vendorCode,
        external_id: product.externalId,
        sku: product.sku,
        title: product.title,
        description: product.description,
        product_url: product.productUrl,
        vendor_price_reference: product.vendorPriceReference,
        vendor_currency: product.vendorCurrency,
        snapshot_hash: hash,
        change_state: changeState,
        review_status: reviewStatus,
        last_seen_run_id: runId,
        source_payload: product.sourcePayload,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "vendor_code,external_id" }
    )
    .select("id")
    .single();

  if (itemError || !item) throw itemError ?? new Error("Vendor item upsert returned no row.");

  const { error: snapshotError } = await supabaseAdmin
    .from("vendor_catalog_snapshots")
    .insert({
      run_id: runId,
      item_id: item.id,
      snapshot_hash: hash,
      change_state: changeState,
      normalized_payload: {
        vendorCode: product.vendorCode,
        externalId: product.externalId,
        sku: product.sku,
        title: product.title,
        description: product.description,
        productUrl: product.productUrl,
        vendorPriceReference: product.vendorPriceReference,
        vendorCurrency: product.vendorCurrency,
        assets: product.assets,
      },
      source_payload: product.sourcePayload,
    });

  if (snapshotError) throw snapshotError;

  if (changeState !== "UNCHANGED") {
    const { error: deleteAssetsError } = await supabaseAdmin
      .from("vendor_catalog_assets")
      .delete()
      .eq("item_id", item.id);
    if (deleteAssetsError) throw deleteAssetsError;

    if (product.assets.length > 0) {
      const { error: assetError } = await supabaseAdmin
        .from("vendor_catalog_assets")
        .insert(
          product.assets.map((asset, sortOrder) => ({
            item_id: item.id,
            kind: asset.kind,
            url: asset.url,
            label: asset.label ?? null,
            file_type: asset.fileType ?? null,
            sort_order: sortOrder,
          }))
        );
      if (assetError) throw assetError;
    }
  }

  if (changeState === "NEW") counts.created += 1;
  else if (changeState === "UPDATED") counts.updated += 1;
  else counts.unchanged += 1;
}

export async function runVendorCatalogSync(
  adapter: VendorCatalogAdapter
): Promise<VendorCatalogSyncResult> {
  if (!isSupabaseAdminConfigured) {
    throw new Error("Vendor catalog sync requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const counts: SyncCounts = {
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  const errors: Array<{ externalId?: string; message: string }> = [];

  const { data: run, error: runError } = await supabaseAdmin
    .from("vendor_catalog_runs")
    .insert({
      vendor_code: adapter.vendorCode,
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) throw runError ?? new Error("Vendor sync run could not be created.");

  try {
    const products = await adapter.discover();
    counts.discovered = products.length;

    for (const product of products) {
      try {
        await persistProduct(run.id, product, counts);
      } catch (error) {
        counts.failed += 1;
        errors.push({ externalId: product.externalId, message: errorMessage(error) });
      }
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
      status: "FAILED",
      counts: { ...counts, failed: counts.failed + 1 },
      errors,
    };
  }
}
