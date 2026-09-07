import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import {
  syncCompanyCalendarCurrentFirstPage,
  type CalendarBootstrapRange,
} from "@/lib/google-calendar/bootstrap-sync";
import {
  GoogleCalendarImportError,
  syncImportedGoogleCalendar,
} from "@/lib/google-calendar/calendar-import";
import { GoogleCalendarProviderError } from "@/lib/google-calendar/google-calendar";
import { ensureCompanyCalendarWatch } from "@/lib/google-calendar/watch-channels";
import { withApiTiming } from "@/lib/observability/apiTiming";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BOOTSTRAP_RANGE_MS = 370 * 24 * 60 * 60 * 1000;

function parseBootstrapRange(body: Record<string, unknown>): CalendarBootstrapRange | Response | null {
  const startRaw = typeof body.bootstrap_start === "string" ? body.bootstrap_start.trim() : "";
  const endRaw = typeof body.bootstrap_end === "string" ? body.bootstrap_end.trim() : "";
  if (!startRaw && !endRaw) return null;
  if (!startRaw || !endRaw) return jsonError("Calendar bootstrap start/end range is required.", 400);

  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (
    Number.isNaN(start.valueOf())
    || Number.isNaN(end.valueOf())
    || start >= end
    || end.valueOf() - start.valueOf() > MAX_BOOTSTRAP_RANGE_MS
  ) {
    return jsonError("Calendar bootstrap start/end range is invalid.", 400);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const legacyBindingId = typeof body.binding_id === "string" ? body.binding_id.trim() : "";
  const continuationToken = typeof body.continuation_token === "string" && body.continuation_token
    ? body.continuation_token
    : null;
  const bootstrapRange = parseBootstrapRange(body);
  if (bootstrapRange instanceof Response) return bootstrapRange;

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

    // Outbound Modulex changes are flushed once at the start. Provider continuation
    // requests stay focused on one bounded Google page so they cannot grow into a 504.
    // On first full sync the currently visible range is mirrored first, then the same
    // continuation walks historical data until Google returns the durable sync token.
    const outbox = continuationToken ? null : await flushCalendarOutboxBatch(25, request.url);
    const providerPage = await syncCompanyCalendarCurrentFirstPage(
      "manual",
      request.url,
      continuationToken,
      bootstrapRange,
    );
    const { continuationToken: nextContinuationToken, ...provider } = providerPage;
    let watch_error_code: string | null = null;
    if (provider.complete) {
      try {
        await ensureCompanyCalendarWatch(request.url);
      } catch (error) {
        watch_error_code = error instanceof Error ? error.message.slice(0, 120) : "watch_setup_failed";
      }
    }
    return Response.json({
      ok: true,
      mode: "company",
      outbox,
      provider: {
        ...provider,
        continuation_token: nextContinuationToken,
      },
      watch_error_code,
    });
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
