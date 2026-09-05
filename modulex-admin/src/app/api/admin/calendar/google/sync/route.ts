import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  GoogleCalendarImportError,
  syncImportedGoogleCalendar,
} from "@/lib/google-calendar/calendar-import";
import { GoogleCalendarProviderError } from "@/lib/google-calendar/google-calendar";
import { withApiTiming } from "@/lib/observability/apiTiming";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const bindingId = typeof body.binding_id === "string" ? body.binding_id.trim() : "";
  if (!UUID_PATTERN.test(bindingId)) return jsonError("A valid imported Calendar binding is required.", 400);

  try {
    const result = await syncImportedGoogleCalendar(bindingId, request.url);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof GoogleCalendarImportError) return jsonError(error.message, error.status);
    if (error instanceof GoogleCalendarProviderError) {
      const status = error.status === 410 ? 409 : error.status >= 500 ? 502 : 409;
      return jsonError(`Google Calendar sync failed: ${error.code}.`, status);
    }
    return jsonError("Google Calendar sync failed.", 502);
  }
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/sync", method: "POST" },
    () => handlePost(request),
  );
}
