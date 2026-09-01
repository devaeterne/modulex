import { timingSafeEqual } from "node:crypto";
import {
  getVendorCatalogAdapter,
  vendorCatalogRegistry,
} from "@/lib/vendor-catalog/adapters";
import { runVendorCatalogSync } from "@/lib/vendor-catalog/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function authorize(request: Request) {
  const secret = process.env.VENDOR_CATALOG_SYNC_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Vendor catalog sync is not configured." },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!supplied || !secureEquals(supplied, secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

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

async function handle(request: Request, body?: unknown) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const vendors = [...new Set(requestedVendors(request, body))];
  const unknown = vendors.filter((vendor) => !vendorCatalogRegistry[vendor]);
  if (unknown.length > 0) {
    return Response.json(
      { error: "Unknown vendor adapter.", vendors: unknown },
      { status: 400 }
    );
  }

  const results = [];
  for (const vendor of vendors) {
    results.push(await runVendorCatalogSync(getVendorCatalogAdapter(vendor)));
  }

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
  return handle(request);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  return handle(request, body);
}
