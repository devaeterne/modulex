import { processPendingEmailNotifications } from "@/lib/email/transactional";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/server-admin";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

const EMAIL_QUEUE_ROLES = new Set([
  "super_admin",
  "admin",
  "sales",
  "finance",
  "warehouse",
  "shipping",
]);

async function requireActiveStaff(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return { response: jsonError("Server email processing is not configured.", 503) };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: jsonError("Authentication required.", 401) };
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return { response: jsonError("Invalid or expired session.", 401) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return { response: jsonError("Active staff access is required.", 403) };
  }

  if (!EMAIL_QUEUE_ROLES.has(String(profile.role))) {
    return { response: jsonError("Email queue access is not available for this role.", 403) };
  }

  return { response: null };
}

async function handlePost(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body is allowed.
  }

  const limit = Math.min(50, Math.max(1, Number(body.limit || 20) || 20));

  try {
    const results = await processPendingEmailNotifications(limit);
    return Response.json({ success: true, processed: results.length, results });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Email notifications could not be processed.",
      500
    );
  }
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/email-notifications/process", method: "POST" },
    () => handlePost(request)
  );
}
