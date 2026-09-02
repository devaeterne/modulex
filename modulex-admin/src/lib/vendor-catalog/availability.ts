import "server-only";

import type { VendorAvailabilityStatus } from "@/lib/vendor-catalog/domain";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export type VendorAvailabilityReconcileItem = {
  id: string;
  canonical_product_id: string | null;
  canonical_inactivated_by_vendor_at: string | null;
  canonical_status_version_at: string | null;
  reactivation_requires_review: boolean;
};

export type VendorAvailabilityReconcileResult = {
  deactivated: boolean;
  reactivated: boolean;
  reviewRequired: boolean;
};

const VENDOR_BLOCKING_STATUSES = new Set<VendorAvailabilityStatus>([
  "OUT_OF_STOCK",
  "UNAVAILABLE",
  "MISSING",
]);

function emptyResult(): VendorAvailabilityReconcileResult {
  return { deactivated: false, reactivated: false, reviewRequired: false };
}

async function updateVendorMarkers(
  itemId: string,
  values: {
    canonical_inactivated_by_vendor_at?: string | null;
    canonical_status_version_at?: string | null;
    reactivation_requires_review?: boolean;
  }
) {
  const { error } = await supabaseAdmin
    .from("vendor_catalog_items")
    .update(values)
    .eq("id", itemId);
  if (error) throw error;
}

export async function reconcileVendorAvailability(
  item: VendorAvailabilityReconcileItem,
  nextStatus: VendorAvailabilityStatus,
  now = new Date().toISOString()
): Promise<VendorAvailabilityReconcileResult> {
  if (!item.canonical_product_id) return emptyResult();

  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id,status,updated_at")
    .eq("id", item.canonical_product_id)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) return emptyResult();

  if (VENDOR_BLOCKING_STATUSES.has(nextStatus)) {
    if (product.status !== "active") {
      return emptyResult();
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("products")
      .update({ status: "inactive" })
      .eq("id", product.id)
      .eq("status", "active")
      .select("updated_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return emptyResult();

    await updateVendorMarkers(item.id, {
      canonical_inactivated_by_vendor_at: now,
      canonical_status_version_at: updated.updated_at,
      reactivation_requires_review: false,
    });

    return { deactivated: true, reactivated: false, reviewRequired: false };
  }

  if (nextStatus !== "AVAILABLE" || !item.canonical_inactivated_by_vendor_at) {
    return emptyResult();
  }

  if (product.status === "archived") {
    await updateVendorMarkers(item.id, { reactivation_requires_review: true });
    return { deactivated: false, reactivated: false, reviewRequired: true };
  }

  if (product.status === "active") {
    await updateVendorMarkers(item.id, {
      canonical_inactivated_by_vendor_at: null,
      canonical_status_version_at: null,
      reactivation_requires_review: false,
    });
    return emptyResult();
  }

  const untouchedSinceVendorChange =
    Boolean(item.canonical_status_version_at) &&
    product.updated_at === item.canonical_status_version_at;

  if (!untouchedSinceVendorChange) {
    await updateVendorMarkers(item.id, { reactivation_requires_review: true });
    return { deactivated: false, reactivated: false, reviewRequired: true };
  }

  const { data: reactivated, error: reactivateError } = await supabaseAdmin
    .from("products")
    .update({ status: "active" })
    .eq("id", product.id)
    .eq("status", "inactive")
    .eq("updated_at", product.updated_at)
    .select("updated_at")
    .maybeSingle();
  if (reactivateError) throw reactivateError;

  if (!reactivated) {
    await updateVendorMarkers(item.id, { reactivation_requires_review: true });
    return { deactivated: false, reactivated: false, reviewRequired: true };
  }

  await updateVendorMarkers(item.id, {
    canonical_inactivated_by_vendor_at: null,
    canonical_status_version_at: null,
    reactivation_requires_review: false,
  });

  return { deactivated: false, reactivated: true, reviewRequired: false };
}