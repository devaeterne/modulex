import { withApiTiming } from "@/lib/observability/apiTiming";
import { authorizeVendorCatalogRequest } from "@/lib/vendor-catalog/auth";
import { stoneVendorCatalogRegistry } from "@/lib/vendor-catalog/stone-adapters";
import { runStoneVendorCatalogSync } from "@/lib/vendor-catalog/stone-sync";
import type { StoneVendorCode } from "@/lib/vendor-catalog/stone-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SyncBody = {
  vendor?: string;
  vendors?: string[];
  categoryKey?: string | null;
  categoryLabel?: string | null;
};

async function handlePost(request: Request) {
  const authorization = await authorizeVendorCatalogRequest(request, {
    allowCron: true,
    allowAdmin: true,
  });
  if (authorization instanceof Response) return authorization;

  let body: SyncBody = {};
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    body = {};
  }

  const requested = body.vendors?.length
    ? body.vendors
    : body.vendor
      ? [body.vendor]
      : Object.keys(stoneVendorCatalogRegistry);
  const unique = [
    ...new Set(requested.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ];
  const unknown = unique.filter((vendor) => !(vendor in stoneVendorCatalogRegistry));
  if (unknown.length) {
    return Response.json(
      { error: `Unknown Stone vendor(s): ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  const results = [];
  for (const vendor of unique) {
    results.push(
      await runStoneVendorCatalogSync(vendor as StoneVendorCode, {
        categoryKey: body.categoryKey ?? null,
        categoryLabel: body.categoryLabel ?? null,
      })
    );
  }

  return Response.json({
    catalogDomain: "stone",
    autoPublished: false,
    results,
  });
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/vendor-catalog/stone/sync", method: "POST" },
    () => handlePost(request)
  );
}
