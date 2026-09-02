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

  const vendors = [];
  for (const vendorCode of Object.keys(stoneVendorCatalogRegistry) as Array<
    keyof typeof stoneVendorCatalogRegistry
  >) {
    const adapter = stoneVendorCatalogRegistry[vendorCode]();
    const categories = await adapter.listCategories();
    vendors.push({
      vendorCode,
      label: stoneVendorCatalogLabels[vendorCode],
      categories,
    });
  }

  return Response.json({ catalogDomain: "stone", vendors });
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/vendor-catalog/stone/vendors", method: "GET" },
    () => handleGet(request)
  );
}
