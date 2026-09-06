import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  flushCalendarOutboxBatch,
  syncCompanyCalendarFromGoogle,
} from "@/lib/google-calendar/bidirectional-sync";
import {
  GoogleCalendarImportError,
  syncImportedGoogleCalendar,
} from "@/lib/google-calendar/calendar-import";
import { GoogleCalendarProviderError } from "@/lib/google-calendar/google-calendar";
import { ensureCompanyCalendarWatch } from "@/lib/google-calendar/watch-channels";
import { withApiTiming } from "@/lib/observability/apiTiming";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const legacyBindingId = typeof body.binding_id === "string" ? body.binding_id.trim() : "";

  try {
    if (legacyBindingId) {
      if (!UUID_PATTERN.test(legacyBindingId)) return jsonError("A valid imported Calendar binding is required.", 400);
      const result = await syncImportedGoogleCalendar(legacyBindingId, request.url);
      const { mode: providerSyncMode, ...syncResult } = result;
      return Response.json({
        ok: true,
        mode: "legacy_import",
        provider_sync_mode: providerSyncMode,
        ...syncResult,
      });
    }

    const outbox = await flushCalendarOutboxBatch(50, request.url);
    const provider = await syncCompanyCalendarFromGoogle("manual", request.url);
    let watch_error_code: string | null = null;
    try {
      await ensureCompanyCalendarWatch(request.url);
    } catch (error) {
      watch_error_code = error instanceof Error ? error.message.slice(0, 120) : "watch_setup_failed";
    }
    return Response.json({ ok: true, mode: "company", outbox, provider, watch_error_code });
  } catch (error) {
    if (error instanceof GoogleCalendarImportError) return jsonError(error.message, error.status);
    if (error instanceof GoogleCalendarProviderError) {
      const status = error.status === 410 ? 409 : error.status >= 500 ? 502 : 409;
      return jsonError(`Google Calendar sync failed: ${error.code}.`, status);
    }
    return jsonError(error instanceof Error ? error.message : "Google Calendar sync failed.", 502);
  }
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/sync", method: "POST" },
    () => handlePost(request),
  );
}
