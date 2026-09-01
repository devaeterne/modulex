import {
  getVendorCatalogAdapter,
  vendorCatalogRegistry,
} from "@/lib/vendor-catalog/adapters";
import { authorizeVendorCatalogRequest } from "@/lib/vendor-catalog/auth";
import { runVendorCatalogSync } from "@/lib/vendor-catalog/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function requestedVendors(request: Request, body?: unknown) {
  const url = new URL(request.url);
  const queryVendors = url.searchParams.get("vendors")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const bodyVendors =
    body && typeof body === "object" && Array.isArray((body as { vendors?: unknown }).vendors)
      ? ((body as { vendors: unknown[] }).vendors)
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      : undefined;

  return bodyVendors?.length
    ? bodyVendors
    : queryVendors?.length
      ? queryVendors
      : Object.keys(vendorCatalogRegistry);
}

async function handle(
  request: Request,
  body: unknown,
  allowAdminSession: boolean
) {
  const authorization = await authorizeVendorCatalogRequest(request, {
    allowCron: true,
    allowAdmin: allowAdminSession,
  });
  if (authorization instanceof Response) return authorization;

  const vendors = [...new Set(requestedVendors(request, body))];
  const unknown = vendors.filter((vendor) => !vendorCatalogRegistry[vendor]);
  if (unknown.length > 0) {
    return Response.json(
      { error: "Unknown vendor adapter.", vendors: unknown },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    vendors.map((vendor) => runVendorCatalogSync(getVendorCatalogAdapter(vendor)))
  );
  const failed = results.some((result) => result.status === "FAILED");

  return Response.json(
    {
      status: failed ? "PARTIAL_FAILURE" : "SUCCEEDED",
      results,
      autoPublished: false,
    },
    { status: failed ? 207 : 200 }
  );
}

export async function GET(request: Request) {
  return handle(request, undefined, false);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  return handle(request, body, true);
}