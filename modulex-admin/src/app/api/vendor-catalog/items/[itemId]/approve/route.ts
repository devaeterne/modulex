import { withApiTiming } from "@/lib/observability/apiTiming";
import { serializeUnknownError, unknownErrorMessage } from "@/lib/errors/unknown-error";
import {
  approveReviewableVendorCatalogItem,
  VendorCatalogMissingError,
  VendorReviewNotEligibleError,
} from "@/lib/vendor-catalog/approval";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { CategoryMappingRequiredError } from "@/lib/vendor-catalog/mappings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

async function handlePost(request: Request, context: RouteContext) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const { itemId } = await context.params;
  if (!itemId) {
    return Response.json({ error: "Vendor catalog item id is required." }, { status: 400 });
  }

  try {
    const result = await approveReviewableVendorCatalogItem(itemId, authorization);
    return Response.json({ status: "APPROVED", ...result });
  } catch (error) {
    if (error instanceof VendorCatalogMissingError) {
      return Response.json(
        {
          code: error.code,
          availabilityStatus: error.availabilityStatus,
          error: error.message,
        },
        { status: 409 }
      );
    }

    if (error instanceof VendorReviewNotEligibleError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: 409 }
      );
    }

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

    console.error("Vendor catalog approval failed.", {
      itemId,
      error: serializeUnknownError(error),
    });

    return Response.json(
      { error: unknownErrorMessage(error, "Vendor catalog approval failed.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/vendor-catalog/items/[itemId]/approve", method: "POST" },
    () => handlePost(request, context)
  );
}
