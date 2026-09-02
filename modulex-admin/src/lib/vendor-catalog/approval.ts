import "server-only";

import { approveVendorCatalogItem } from "@/lib/vendor-catalog/approve";
import {
  isVendorApprovalEligible,
  type VendorAvailabilityStatus,
} from "@/lib/vendor-catalog/domain";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export class VendorCatalogMissingError extends Error {
  readonly code = "VENDOR_CATALOG_MISSING";
  readonly availabilityStatus: VendorAvailabilityStatus;

  constructor(status: VendorAvailabilityStatus) {
    super("Vendor product is no longer present in the authoritative vendor catalog.");
    this.name = "VendorCatalogMissingError";
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

type ApprovalState = {
  review_status: "PENDING" | "APPROVED" | "IGNORED";
  canonical_product_id: string | null;
  availability_status: VendorAvailabilityStatus;
  vendor_price_reference: number | null;
  vendor_currency: string | null;
};

type CompletedApproval = {
  productId: string;
  storeProductContentId: string | null;
  archivedImageCount: number;
  baseProductCode: string | null;
  alreadyApproved: boolean;
};

async function loadApprovalState(itemId: string): Promise<ApprovalState> {
  const { data, error } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select(
      "review_status,canonical_product_id,availability_status,vendor_price_reference,vendor_currency"
    )
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Vendor catalog item was not found.");
  return data as ApprovalState;
}

async function writeVendorListPrice(
  productId: string,
  state: Pick<ApprovalState, "vendor_price_reference" | "vendor_currency">,
  userId: string
) {
  if (state.vendor_price_reference == null) return;

  const currencyCode = state.vendor_currency?.trim().toUpperCase();
  if (!currencyCode) {
    throw new Error("Vendor currency is required before the vendor price can become List Price.");
  }

  const { data: baseGroups, error: baseGroupError } = await supabaseAdmin
    .from("price_groups")
    .select("id")
    .eq("is_base_price", true)
    .eq("is_active", true)
    .limit(2);
  if (baseGroupError) throw baseGroupError;
  if ((baseGroups ?? []).length !== 1) {
    throw new Error("Exactly one active List Price group is required for vendor approval.");
  }

  const priceGroupId = baseGroups![0].id;
  const { data: currentPrice, error: currentPriceError } = await supabaseAdmin
    .from("product_prices")
    .select("id")
    .eq("product_id", productId)
    .eq("price_group_id", priceGroupId)
    .eq("currency_code", currencyCode)
    .eq("is_active", true)
    .is("valid_to", null)
    .maybeSingle();
  if (currentPriceError) throw currentPriceError;

  const now = new Date().toISOString();
  if (currentPrice) {
    const { error: updateError } = await supabaseAdmin
      .from("product_prices")
      .update({
        amount: state.vendor_price_reference,
        updated_by: userId,
        updated_at: now,
      })
      .eq("id", currentPrice.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabaseAdmin.from("product_prices").insert({
    product_id: productId,
    price_group_id: priceGroupId,
    amount: state.vendor_price_reference,
    currency_code: currencyCode,
    valid_from: now,
    valid_to: null,
    is_active: true,
    created_by: userId,
    updated_by: userId,
  });
  if (insertError) throw insertError;
}

async function loadCompletedApproval(state: ApprovalState): Promise<CompletedApproval | null> {
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
      throw new VendorCatalogMissingError(state.availability_status);
    }
    const completed = await loadCompletedApproval(state);
    if (completed) return completed;
    if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

export async function approveReviewableVendorCatalogItem(
  itemId: string,
  authorization: Authorization
): Promise<CompletedApproval> {
  const state = await loadApprovalState(itemId);
  if (state.review_status === "IGNORED") throw new VendorReviewNotEligibleError();
  if (!isVendorApprovalEligible(state.availability_status)) {
    throw new VendorCatalogMissingError(state.availability_status);
  }

  const completed = await loadCompletedApproval(state);
  if (completed) {
    await writeVendorListPrice(completed.productId, state, authorization.userId);
    return completed;
  }

  try {
    const result = await approveVendorCatalogItem(itemId, authorization);
    await writeVendorListPrice(result.productId, state, authorization.userId);
    return { ...result, alreadyApproved: false };
  } catch (error) {
    const recovered = await waitForConcurrentApproval(itemId);
    if (recovered) {
      const latestState = await loadApprovalState(itemId);
      await writeVendorListPrice(recovered.productId, latestState, authorization.userId);
      return recovered;
    }
    throw error;
  }
}
