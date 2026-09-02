import { withApiTiming } from "@/lib/observability/apiTiming";
import { getVendorCatalogAdapter, vendorCatalogRegistry } from "@/lib/vendor-catalog/adapters";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { runVendorCatalogCheck } from "@/lib/vendor-catalog/check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CheckBody = {
  vendor?: unknown;
  categoryKey?: unknown;
  categoryLabel?: unknown;
};

async function handlePost(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const body = (await request.json().catch(() => ({}))) as CheckBody;
  const vendor = typeof body.vendor === "string" ? body.vendor.trim().toLowerCase() : "";
  if (!vendor || !vendorCatalogRegistry[vendor]) {
    return Response.json({ error: "A registered vendor is required." }, { status: 400 });
  }

  const categoryKey =
    typeof body.categoryKey === "string" && body.categoryKey.trim()
      ? body.categoryKey.trim()
      : null;
  const categoryLabel =
    typeof body.categoryLabel === "string" && body.categoryLabel.trim()
      ? body.categoryLabel.trim()
      : categoryKey;

  const result = await runVendorCatalogCheck(getVendorCatalogAdapter(vendor), {
    userId: authorization.userId,
    scope: { categoryKey, categoryLabel },
  });

  return Response.json(result, { status: result.status === "SUCCEEDED" ? 200 : 502 });
}

export async function POST(request: Request) {
  return withApiTiming({ route: "/api/vendor-catalog/check", method: "POST" }, () => handlePost(request));
}
