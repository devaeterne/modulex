import "server-only";

import { withApiTiming } from "@/lib/observability/apiTiming";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/server-admin";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function requireAdmin(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return { response: jsonError("Email delivery monitoring is not configured.", 503) };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: jsonError("Authentication required.", 401) };
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    return { response: jsonError("Invalid or expired session.", 401) };
  }

  const userId = data.user.id;
  const [{ data: profile }, { data: assignedRoles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("role,is_active").eq("id", userId).single(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (!profile?.is_active) {
    return { response: jsonError("Active staff access is required.", 403) };
  }

  const roles = new Set<string>([
    String(profile.role || ""),
    ...(assignedRoles ?? []).map((row: { role: string }) => String(row.role)),
  ]);
  if (!roles.has("admin") && !roles.has("super_admin")) {
    return { response: jsonError("Admin access is required.", 403) };
  }

  return { response: null };
}

async function handleGet(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit") || 100) || 100));
  const { data, error } = await supabaseAdmin.rpc("get_email_delivery_monitor", { p_limit: limit });
  if (error) return jsonError("Email delivery monitor could not be loaded.", 500);

  return Response.json({ deliveries: data ?? [] });
}

async function handlePost(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
    return jsonError("A valid notification id is required.", 400);
  }

  const { data, error } = await supabaseAdmin.rpc("retry_email_notification", {
    p_notification_id: notificationId,
  });
  if (error) return jsonError("Email delivery retry could not be scheduled.", 500);
  if (!data) return jsonError("This delivery is not retryable or its retry budget is exhausted.", 409);

  return Response.json({ success: true });
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/email-notifications/monitor", method: "GET" },
    () => handleGet(request)
  );
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/email-notifications/monitor", method: "POST" },
    () => handlePost(request)
  );
}
