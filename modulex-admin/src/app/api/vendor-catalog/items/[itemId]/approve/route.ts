import { approveVendorCatalogItem } from "@/lib/vendor-catalog/approve";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { CategoryMappingRequiredError } from "@/lib/vendor-catalog/mappings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const { itemId } = await context.params;
  if (!itemId) {
    return Response.json({ error: "Vendor catalog item id is required." }, { status: 400 });
  }

  try {
    const result = await approveVendorCatalogItem(itemId, authorization);
    return Response.json({ status: "APPROVED", ...result });
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