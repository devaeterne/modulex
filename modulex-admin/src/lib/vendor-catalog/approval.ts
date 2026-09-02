import "server-only";

import { approveVendorCatalogItem } from "@/lib/vendor-catalog/approve";
import {
  isVendorApprovalEligible,
  type VendorAvailabilityStatus,
} from "@/lib/vendor-catalog/domain";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export class VendorUnavailableError extends Error {
  readonly code = "VENDOR_UNAVAILABLE";
  readonly availabilityStatus: VendorAvailabilityStatus;

  constructor(status: VendorAvailabilityStatus) {
    super(`Vendor product is not approval-eligible while availability is ${status}.`);
    this.name = "VendorUnavailableError";
    this.availabilityStatus = status;
  }
}

export class VendorReviewNotEligibleError extends Error {
  readonly code = "VENDOR_REVIEW_NOT_ELIGIBLE";

  constructor() {
    super("Ignored vendor products cannot be approved until they are returned to review.");
    this.name = "VendorReviewNotEligibleError";
  }
}

type Authorization = { userId: string; accessToken: string };

type CompletedApproval = {
  productId: string;
  storeProductContentId: string | null;
  archivedImageCount: number;
  baseProductCode: string | null;
  alreadyApproved: boolean;
};

async function loadApprovalState(itemId: string) {
  const { data, error } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select("review_status,canonical_product_id,availability_status")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Vendor catalog item was not found.");
  return data as {
    review_status: "PENDING" | "APPROVED" | "IGNORED";
    canonical_product_id: string | null;
    availability_status: VendorAvailabilityStatus;
  };
}

async function loadCompletedApproval(
  state: Awaited<ReturnType<typeof loadApprovalState>>
): Promise<CompletedApproval | null> {
  if (state.review_status !== "APPROVED" || !state.canonical_product_id) return null;

  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("sku,base_product_code")
    .eq("id", state.canonical_product_id)
    .maybeSingle();
  if (productError) throw productError;
  const baseProductCode = product?.base_product_code ?? product?.sku ?? null;

  let storeProductContentId: string | null = null;
  if (baseProductCode) {
    const { data: storeContent, error: storeError } = await supabaseAdmin
      .from("store_product_content")
      .select("id")
      .eq("base_product_code", baseProductCode)
      .limit(1)
      .maybeSingle();
    if (storeError) throw storeError;
    storeProductContentId = storeContent?.id ?? null;
  }

  return {
    productId: state.canonical_product_id,
    storeProductContentId,
    archivedImageCount: 0,
    baseProductCode,
    alreadyApproved: true,
  };
}

async function waitForConcurrentApproval(itemId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = await loadApprovalState(itemId);
    if (state.review_status === "IGNORED") throw new VendorReviewNotEligibleError();
    if (!isVendorApprovalEligible(state.availability_status)) {
      throw new VendorUnavailableError(state.availability_status);
    }
    const completed = await loadCompletedApproval(state);
    if (completed) return completed;
    if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

export async function approveAvailableVendorCatalogItem(
  itemId: string,
  authorization: Authorization
): Promise<CompletedApproval> {
  const state = await loadApprovalState(itemId);
  if (state.review_status === "IGNORED") throw new VendorReviewNotEligibleError();
  if (!isVendorApprovalEligible(state.availability_status)) {
    throw new VendorUnavailableError(state.availability_status);
  }

  const completed = await loadCompletedApproval(state);
  if (completed) return completed;

  try {
    const result = await approveVendorCatalogItem(itemId, authorization);
    return { ...result, alreadyApproved: false };
  } catch (error) {
    const recovered = await waitForConcurrentApproval(itemId);
    if (recovered) return recovered;
    throw error;
  }
}