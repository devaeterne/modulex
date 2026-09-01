import {
  vendorCatalogLabels,
  vendorCatalogRegistry,
} from "@/lib/vendor-catalog/adapters";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  return Response.json({
    vendors: Object.keys(vendorCatalogRegistry).map((code) => ({
      code,
      label: vendorCatalogLabels[code] ?? code,
    })),
  });
}