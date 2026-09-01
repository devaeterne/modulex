import { timingSafeEqual } from "node:crypto";
import {
  getVendorCatalogAdapter,
  vendorCatalogRegistry,
} from "@/lib/vendor-catalog/adapters";
import { runVendorCatalogSync } from "@/lib/vendor-catalog/sync";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isCronSecret(token: string) {
  const secret = process.env.CRON_SECRET ?? process.env.VENDOR_CATALOG_SYNC_SECRET;
  return Boolean(secret && token && secureEquals(token, secret));
}

async function authorizeAdminSession(token: string) {
  if (!isSupabaseAdminConfigured) {
    return Response.json(
      { error: "Vendor catalog sync is not configured." },
      { status: 503 }
    );
  }

  if (!token) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("role,is_active")
        .eq("id", user.id)
        .maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
    ]);

  if (profileError || rolesError || !profile?.is_active) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const roles = new Set<string>([
    profile.role,
    ...(roleRows ?? []).map((row) => row.role),
  ]);

  if (!roles.has("admin") && !roles.has("super_admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
}

async function authorize(request: Request, allowAdminSession: boolean) {
  const token = bearerToken(request);

  if (isCronSecret(token)) return null;

  if (allowAdminSession) {
    return authorizeAdminSession(token);
  }

  return Response.json({ error: "Unauthorized." }, { status: 401 });
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

async function handle(
  request: Request,
  body: unknown,
  allowAdminSession: boolean
) {
  const unauthorized = await authorize(request, allowAdminSession);
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
  return handle(request, undefined, false);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  return handle(request, body, true);
}
