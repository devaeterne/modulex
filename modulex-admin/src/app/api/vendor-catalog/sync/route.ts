import {
  getVendorCatalogAdapter,
  vendorCatalogRegistry,
} from "@/lib/vendor-catalog/adapters";
import { authorizeVendorCatalogRequest } from "@/lib/vendor-catalog/auth";
import { runVendorCatalogSync } from "@/lib/vendor-catalog/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SyncBody = {
  vendors?: unknown;
  vendor?: unknown;
  categoryKey?: unknown;
  categoryLabel?: unknown;
  checkId?: unknown;
  changedOnly?: unknown;
};

function requestedVendors(request: Request, body?: SyncBody) {
  const url = new URL(request.url);
  const queryVendors = url.searchParams.get("vendors")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const singleVendor =
    typeof body?.vendor === "string" && body.vendor.trim()
      ? [body.vendor.trim().toLowerCase()]
      : undefined;
  const bodyVendors = Array.isArray(body?.vendors)
    ? body.vendors
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : undefined;

  return singleVendor?.length
    ? singleVendor
    : bodyVendors?.length
      ? bodyVendors
      : queryVendors?.length
        ? queryVendors
        : Object.keys(vendorCatalogRegistry);
}

async function handle(
  request: Request,
  body: SyncBody | undefined,
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

  const categoryKey =
    typeof body?.categoryKey === "string" && body.categoryKey.trim()
      ? body.categoryKey.trim()
      : null;
  const categoryLabel =
    typeof body?.categoryLabel === "string" && body.categoryLabel.trim()
      ? body.categoryLabel.trim()
      : categoryKey;
  const checkId =
    typeof body?.checkId === "string" && body.checkId.trim() ? body.checkId.trim() : null;
  const changedOnly = body?.changedOnly === true;

  if ((categoryKey || checkId) && vendors.length !== 1) {
    return Response.json(
      { error: "Category-scoped or checked sync requires exactly one vendor." },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    vendors.map((vendor) =>
      runVendorCatalogSync(getVendorCatalogAdapter(vendor), {
        scope: { categoryKey, categoryLabel },
        checkId,
        changedOnly,
        userId: authorization.kind === "admin" ? authorization.userId : null,
      })
    )
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
  const body = (await request.json().catch(() => undefined)) as SyncBody | undefined;
  return handle(request, body, true);
}