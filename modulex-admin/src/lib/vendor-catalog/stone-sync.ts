import "server-only";

import { createHash } from "node:crypto";
import { getStoneVendorCatalogAdapter } from "@/lib/vendor-catalog/stone-adapters";
import {
  stableStoneVendorHash,
  type NormalizedStoneVendorProduct,
  type StoneVendorCode,
} from "@/lib/vendor-catalog/stone-domain";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

function availabilityHash(product: NormalizedStoneVendorProduct) {
  return createHash("sha256")
    .update(JSON.stringify(product.availability))
    .digest("hex");
}

function stoneData(product: NormalizedStoneVendorProduct) {
  return {
    sourceStoneTypeName: product.sourceStoneTypeName,
    stoneTypeName: product.stoneTypeName,
    brand: product.brand,
    collection: product.collection,
    colors: product.colors,
    backgroundColor: product.backgroundColor,
    veinColors: product.veinColors,
    colorTone: product.colorTone,
    features: product.features,
    variant: product.variant,
    vendorInventory: product.vendorInventory,
  };
}

async function resolveStoneType(product: NormalizedStoneVendorProduct) {
  if (!product.sourceStoneTypeName.trim() || product.stoneTypeName === "Unknown") {
    throw new Error(`Stone type could not be resolved for ${product.vendorCode}:${product.externalId}.`);
  }
  const { data, error } = await supabaseAdmin.rpc("resolve_vendor_stone_type", {
    p_vendor_code: product.vendorCode,
    p_vendor_type_name: product.sourceStoneTypeName,
    p_canonical_name: product.stoneTypeName,
  });
  if (error || !data) throw error ?? new Error("Stone type resolver returned no id.");
  return String(data);
}

async function replaceAssets(itemId: string, product: NormalizedStoneVendorProduct) {
  const { error: deleteError } = await supabaseAdmin
    .from("vendor_catalog_assets")
    .delete()
    .eq("item_id", itemId)
    .is("archived_at", null);
  if (deleteError) throw deleteError;

  if (product.assets.length === 0) return;
  const { error: insertError } = await supabaseAdmin.from("vendor_catalog_assets").insert(
    product.assets.map((asset, index) => ({
      item_id: itemId,
      kind: asset.kind,
      url: asset.url,
      label: asset.label ?? asset.role ?? null,
      file_type: asset.fileType ?? null,
      sort_order: index,
    }))
  );
  if (insertError) throw insertError;
}

export type StoneVendorSyncOptions = {
  categoryKey?: string | null;
  categoryLabel?: string | null;
};

export async function runStoneVendorCatalogSync(
  vendorCode: StoneVendorCode,
  options: StoneVendorSyncOptions = {}
) {
  const adapter = getStoneVendorCatalogAdapter(vendorCode);
  const { data: run, error: runError } = await supabaseAdmin
    .from("vendor_catalog_runs")
    .insert({
      vendor_code: vendorCode,
      status: "RUNNING",
      vendor_category_key: options.categoryKey ?? null,
      vendor_category_label: options.categoryLabel ?? null,
      sync_mode: "SYNC",
      selection_payload: { catalogDomain: "stone" },
    })
    .select("id")
    .single();
  if (runError || !run) throw runError ?? new Error("Unable to create Stone vendor sync run.");

  let discovered = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let available = 0;
  let outOfStock = 0;
  let unavailable = 0;
  let unknown = 0;
  const errors: Array<{ externalId?: string; message: string }> = [];

  try {
    const products = await adapter.discover({
      categoryKey: options.categoryKey,
      categoryLabel: options.categoryLabel,
    });
    discovered = products.length;

    for (const product of products) {
      try {
        const hash = stableStoneVendorHash(product);
        const nextAvailabilityHash = availabilityHash(product);
        const stoneTypeId = await resolveStoneType(product);
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("vendor_catalog_items")
          .select("id,snapshot_hash,availability_hash,review_status")
          .eq("vendor_code", product.vendorCode)
          .eq("external_id", product.externalId)
          .maybeSingle();
        if (existingError) throw existingError;

        const changeState = !existing
          ? "NEW"
          : existing.snapshot_hash === hash
            ? "UNCHANGED"
            : "UPDATED";
        const now = new Date().toISOString();
        const row = {
          vendor_code: product.vendorCode,
          external_id: product.externalId,
          sku: product.sku,
          title: product.title,
          description: product.description,
          product_url: product.productUrl,
          vendor_price_reference: null,
          vendor_currency: null,
          snapshot_hash: hash,
          discovery_hash: hash,
          change_state: changeState,
          last_seen_run_id: run.id,
          source_payload: product.sourcePayload,
          last_seen_at: now,
          details_refreshed_at: now,
          vendor_category_key: product.sourceStoneTypeName,
          vendor_category_label: product.sourceStoneTypeName,
          family_key: product.familyKey,
          variant_code: product.variantCode,
          variant_label: product.variantLabel,
          availability_status: product.availability.status,
          vendor_available: product.availability.available,
          vendor_purchasable: product.availability.purchasable,
          vendor_stock_quantity: product.availability.stockQuantity,
          availability_hash: nextAvailabilityHash,
          availability_changed_at:
            !existing || existing.availability_hash !== nextAvailabilityHash ? now : undefined,
          missing_success_count: 0,
          catalog_domain: "stone",
          stone_type_id: stoneTypeId,
          stone_data: stoneData(product),
        };

        let itemId: string;
        if (existing) {
          const nextReviewStatus = changeState === "UPDATED" ? "PENDING" : existing.review_status;
          const { data: saved, error: saveError } = await supabaseAdmin
            .from("vendor_catalog_items")
            .update({ ...row, review_status: nextReviewStatus })
            .eq("id", existing.id)
            .select("id")
            .single();
          if (saveError || !saved) throw saveError ?? new Error("Unable to update Stone vendor item.");
          itemId = saved.id;
        } else {
          const { data: saved, error: saveError } = await supabaseAdmin
            .from("vendor_catalog_items")
            .insert({ ...row, review_status: "PENDING" })
            .select("id")
            .single();
          if (saveError || !saved) throw saveError ?? new Error("Unable to create Stone vendor item.");
          itemId = saved.id;
        }

        await replaceAssets(itemId, product);
        const { error: snapshotError } = await supabaseAdmin
          .from("vendor_catalog_snapshots")
          .upsert(
            {
              run_id: run.id,
              item_id: itemId,
              snapshot_hash: hash,
              change_state: changeState,
              normalized_payload: stoneData(product),
              source_payload: product.sourcePayload,
            },
            { onConflict: "run_id,item_id" }
          );
        if (snapshotError) throw snapshotError;

        if (changeState === "NEW") created += 1;
        else if (changeState === "UPDATED") updated += 1;
        else unchanged += 1;

        if (product.availability.status === "AVAILABLE") available += 1;
        else if (product.availability.status === "OUT_OF_STOCK") outOfStock += 1;
        else if (product.availability.status === "UNAVAILABLE") unavailable += 1;
        else unknown += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          externalId: product.externalId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const status = failed === 0 ? "SUCCEEDED" : discovered > failed ? "SUCCEEDED" : "FAILED";
    const { error: finishError } = await supabaseAdmin
      .from("vendor_catalog_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        discovered_count: discovered,
        new_count: created,
        updated_count: updated,
        unchanged_count: unchanged,
        failed_count: failed,
        error_summary: errors.length ? errors.slice(0, 100) : null,
        available_count: available,
        out_of_stock_count: outOfStock,
        unavailable_count: unavailable,
        unknown_count: unknown,
      })
      .eq("id", run.id);
    if (finishError) throw finishError;

    return {
      runId: run.id,
      vendorCode,
      catalogDomain: "stone" as const,
      discovered,
      created,
      updated,
      unchanged,
      failed,
      autoPublished: false,
      missingReconciliation: false,
    };
  } catch (error) {
    await supabaseAdmin
      .from("vendor_catalog_runs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        discovered_count: discovered,
        new_count: created,
        updated_count: updated,
        unchanged_count: unchanged,
        failed_count: Math.max(failed, 1),
        error_summary: [{ message: error instanceof Error ? error.message : String(error) }],
      })
      .eq("id", run.id);
    throw error;
  }
}
