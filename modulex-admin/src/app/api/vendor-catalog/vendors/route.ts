import { withApiTiming } from "@/lib/observability/apiTiming";
import {
  getVendorCatalogAdapter,
  vendorCatalogLabels,
  vendorCatalogRegistry,
} from "@/lib/vendor-catalog/adapters";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleGet(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const url = new URL(request.url);
  const requestedVendor = url.searchParams.get("vendor")?.trim().toLowerCase() || null;
  const vendors = Object.keys(vendorCatalogRegistry).map((code) => ({
    code,
    label: vendorCatalogLabels[code] ?? code,
  }));

  if (!requestedVendor) return Response.json({ vendors });
  if (!vendorCatalogRegistry[requestedVendor]) {
    return Response.json({ error: "Unknown vendor adapter." }, { status: 400 });
  }

  const adapter = getVendorCatalogAdapter(requestedVendor);
  const categories = adapter.listCategories ? await adapter.listCategories() : [];

  return Response.json({
    vendors,
    vendor: {
      code: requestedVendor,
      label: vendorCatalogLabels[requestedVendor] ?? requestedVendor,
      categories,
    },
  });
}

export async function GET(request: Request) {
  return withApiTiming({ route: "/api/vendor-catalog/vendors", method: "GET" }, () => handleGet(request));
}
