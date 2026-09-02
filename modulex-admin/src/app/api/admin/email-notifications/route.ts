import { jsonError, requireAdmin } from "@/lib/auth/admin-api";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const VALID_STATUSES = ["pending", "processing", "sent", "failed", "skipped"] as const;
const VALID_AUDIENCES = ["customer", "internal"] as const;

function valid<T extends readonly string[]>(value: string | null, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

async function countStatus(status: string) {
  const { count, error } = await supabaseAdmin.from("email_notifications").select("id", { count: "exact", head: true }).eq("status", status);
  if (error) throw error;
  return count ?? 0;
}

async function handleGet(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const perPage = Math.min(100, Math.max(10, Number(searchParams.get("perPage") || 25) || 25));
  const status = searchParams.get("status");
  const audience = searchParams.get("audience");
  const eventType = searchParams.get("event_type")?.trim() || "";
  const from = (page - 1) * perPage;

  let query = supabaseAdmin
    .from("email_notifications")
    .select("id,event_type,audience,entity_type,entity_id,event_key,payload,status,attempts,to_emails,resend_message_ids,last_error,next_attempt_at,processed_at,sent_at,created_at,updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);

  if (valid(status, VALID_STATUSES)) query = query.eq("status", status);
  if (valid(audience, VALID_AUDIENCES)) query = query.eq("audience", audience);
  if (eventType) query = query.eq("event_type", eventType);

  try {
    const [{ data, error, count }, pending, processing, sent, failed, skipped] = await Promise.all([
      query,
      countStatus("pending"), countStatus("processing"), countStatus("sent"), countStatus("failed"), countStatus("skipped"),
    ]);
    if (error) return jsonError(error.message, 500);
    return Response.json({ notifications: data ?? [], page, perPage, total: count ?? 0, stats: { pending, processing, sent, failed, skipped, total: pending + processing + sent + failed + skipped } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Email notifications could not be loaded.", 500);
  }
}

async function handlePatch(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return jsonError("Invalid request body.", 400); }

  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) return jsonError("Notification ID is required.", 400);
  if (!["retry", "skip"].includes(action)) return jsonError("Unsupported notification action.", 400);

  const { data: existing, error: findError } = await supabaseAdmin.from("email_notifications").select("id,status").eq("id", id).maybeSingle();
  if (findError) return jsonError(findError.message, 500);
  if (!existing) return jsonError("Notification was not found.", 404);
  if (existing.status === "sent") return jsonError("Sent notifications cannot be changed from the queue.", 400);

  const now = new Date().toISOString();
  if (action === "retry") {
    const { data, error } = await supabaseAdmin.from("email_notifications").update({ status: "pending", attempts: 0, next_attempt_at: now, processed_at: null, last_error: null, updated_at: now }).eq("id", id).select("*").single();
    if (error) return jsonError(error.message, 500);
    return Response.json({ success: true, notification: data });
  }

  const actor = auth.actor.user.email || auth.actor.user.id;
  const { data, error } = await supabaseAdmin.from("email_notifications").update({ status: "skipped", processed_at: now, last_error: `Skipped manually by ${actor}`, updated_at: now }).eq("id", id).select("*").single();
  if (error) return jsonError(error.message, 500);
  return Response.json({ success: true, notification: data });
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/email-notifications", method: "GET" },
    () => handleGet(request)
  );
}

export async function PATCH(request: Request) {
  return withApiTiming(
    { route: "/api/admin/email-notifications", method: "PATCH" },
    () => handlePatch(request)
  );
}
