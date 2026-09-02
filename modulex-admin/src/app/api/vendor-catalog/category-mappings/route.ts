import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import {
  getVendorCategoryMappingOptions,
  saveVendorCategoryMapping,
} from "@/lib/vendor-catalog/mappings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MappingBody = {
  vendorCode?: unknown;
  vendorCategoryKey?: unknown;
  vendorCategoryLabel?: unknown;
  modulexCategoryId?: unknown;
  createCategoryName?: unknown;
  productTypeId?: unknown;
  uomId?: unknown;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  try {
    return Response.json(await getVendorCategoryMappingOptions());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const body = (await request.json().catch(() => ({}))) as MappingBody;
  const vendorCode = optionalString(body.vendorCode);
  const vendorCategoryKey = optionalString(body.vendorCategoryKey);
  const vendorCategoryLabel = optionalString(body.vendorCategoryLabel);
  const productTypeId = optionalString(body.productTypeId);
  const uomId = optionalString(body.uomId);

  if (!vendorCode || !vendorCategoryKey || !vendorCategoryLabel || !productTypeId || !uomId) {
    return Response.json(
      { error: "Vendor category, Product Type and UOM are required." },
      { status: 400 }
    );
  }

  try {
    const mapping = await saveVendorCategoryMapping(
      {
        vendorCode,
        vendorCategoryKey,
        vendorCategoryLabel,
        modulexCategoryId: optionalString(body.modulexCategoryId),
        createCategoryName: optionalString(body.createCategoryName),
        productTypeId,
        uomId,
      },
      authorization.userId
    );
    return Response.json({ mapping });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}