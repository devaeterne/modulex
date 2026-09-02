import { approveVendorCatalogItem } from "@/lib/vendor-catalog/approve";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { CategoryMappingRequiredError } from "@/lib/vendor-catalog/mappings";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

type CompletedApproval = {
  status: "APPROVED";
  productId: string;
  storeProductContentId: string | null;
  archivedImageCount: number;
  baseProductCode: string | null;
  alreadyApproved: true;
};

async function loadCompletedApproval(itemId: string): Promise<CompletedApproval | null> {
  const { data: item, error: itemError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select("review_status,canonical_product_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (item?.review_status !== "APPROVED" || !item.canonical_product_id) return null;

  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("sku,base_product_code")
    .eq("id", item.canonical_product_id)
    .maybeSingle();
  if (productError) throw productError;

  const baseProductCode = product?.base_product_code ?? product?.sku ?? null;
  let storeProductContentId: string | null = null;
  if (baseProductCode) {
    const { data: storeContent, error: storeContentError } = await supabaseAdmin
      .from("store_product_content")
      .select("id")
      .eq("base_product_code", baseProductCode)
      .limit(1)
      .maybeSingle();
    if (storeContentError) throw storeContentError;
    storeProductContentId = storeContent?.id ?? null;
  }

  return {
    status: "APPROVED",
    productId: item.canonical_product_id,
    storeProductContentId,
    archivedImageCount: 0,
    baseProductCode,
    alreadyApproved: true,
  };
}

async function waitForCompletedApproval(itemId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const completed = await loadCompletedApproval(itemId);
    if (completed) return completed;
    if (attempt < 11) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return null;
}

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const { itemId } = await context.params;
  if (!itemId) {
    return Response.json({ error: "Vendor catalog item id is required." }, { status: 400 });
  }

  try {
    const completed = await loadCompletedApproval(itemId);
    if (completed) return Response.json(completed);

    const result = await approveVendorCatalogItem(itemId, authorization);
    return Response.json({ status: "APPROVED", ...result, alreadyApproved: false });
  } catch (error) {
    if (error instanceof CategoryMappingRequiredError) {
      return Response.json(
        {
          code: "CATEGORY_MAPPING_REQUIRED",
          error: error.message,
          vendorCode: error.vendorCode,
          vendorCategoryKey: error.vendorCategoryKey,
          vendorCategoryLabel: error.vendorCategoryLabel,
        },
        { status: 409 }
      );
    }

    try {
      const recovered = await waitForCompletedApproval(itemId);
      if (recovered) return Response.json(recovered);
    } catch (recoveryError) {
      console.error("Vendor catalog approval recovery check failed.", {
        itemId,
        error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      });
    }

    console.error("Vendor catalog approval failed.", {
      itemId,
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Vendor catalog approval failed.",
      },
      { status: 500 }
    );
  }
}