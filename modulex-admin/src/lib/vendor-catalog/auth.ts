import "server-only";

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "@/lib/supabase/server-admin";

export type VendorCatalogAuthorization =
  | { kind: "cron" }
  | { kind: "admin"; userId: string; accessToken: string };

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isCronSecret(token: string) {
  if (!token) return false;
  const secrets = [
    process.env.CRON_SECRET,
    process.env.VENDOR_CATALOG_SYNC_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  return secrets.some((secret) => secureEquals(token, secret));
}

export async function authorizeVendorCatalogAdmin(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return Response.json(
      { error: "Vendor catalog is not configured." },
      { status: 503 }
    );
  }

  const token = bearerToken(request);
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

  return {
    kind: "admin" as const,
    userId: user.id,
    accessToken: token,
  };
}

export async function authorizeVendorCatalogRequest(
  request: Request,
  options: { allowCron: boolean; allowAdmin: boolean }
): Promise<VendorCatalogAuthorization | Response> {
  const token = bearerToken(request);

  if (options.allowCron && isCronSecret(token)) {
    return { kind: "cron" };
  }

  if (options.allowAdmin) {
    return authorizeVendorCatalogAdmin(request);
  }

  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

export function createVendorCatalogUserClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public runtime configuration is missing.");
  }

  return createClient(supabaseUrl, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}