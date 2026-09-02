import { withApiTiming } from "@/lib/observability/apiTiming";
import { authorizeVendorCatalogRequest } from "@/lib/vendor-catalog/auth";
import {
  stoneVendorCatalogLabels,
  stoneVendorCatalogRegistry,
} from "@/lib/vendor-catalog/stone-adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGet(request: Request) {
  const authorization = await authorizeVendorCatalogRequest(request, {
    allowCron: false,
    allowAdmin: true,
  });
  if (authorization instanceof Response) return authorization;

  const url = new URL(request.url);
  const requestedVendor = url.searchParams.get("vendor")?.trim().toLowerCase() ?? "";
  const vendorCodes = Object.keys(stoneVendorCatalogRegistry) as Array<
    keyof typeof stoneVendorCatalogRegistry
  >;

  if (!requestedVendor) {
    return Response.json({
      catalogDomain: "stone",
      vendors: vendorCodes.map((vendorCode) => ({
        vendorCode,
        label: stoneVendorCatalogLabels[vendorCode],
      })),
    });
  }

  if (!vendorCodes.includes(requestedVendor as keyof typeof stoneVendorCatalogRegistry)) {
    return Response.json({ error: `Unknown Stone vendor: ${requestedVendor}` }, { status: 400 });
  }

  const vendorCode = requestedVendor as keyof typeof stoneVendorCatalogRegistry;
  const adapter = stoneVendorCatalogRegistry[vendorCode]();
  const categories = await adapter.listCategories();

  return Response.json({
    catalogDomain: "stone",
    vendor: {
      vendorCode,
      label: stoneVendorCatalogLabels[vendorCode],
      categories,
    },
  });
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/vendor-catalog/stone/vendors", method: "GET" },
    () => handleGet(request)
  );
}
