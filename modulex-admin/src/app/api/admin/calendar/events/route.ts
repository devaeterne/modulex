import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { parseCalendarEventMutationBody } from "@/lib/calendar/calendar-event-request";
import { createCalendarEvent } from "@/lib/calendar/calendar-events";
import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import { withApiTiming } from "@/lib/observability/apiTiming";

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  try {
    const event = await createCalendarEvent(parseCalendarEventMutationBody(body), auth.actor.user.id);
    let providerSync: "synced" | "pending" | "error" = "pending";
    let providerErrorCode: string | null = null;
    try {
      const sync = await flushCalendarOutboxBatch(10, request.url);
      providerSync = sync.errors ? "error" : "synced";
      providerErrorCode = sync.errors ? "google_sync_pending" : null;
    } catch {
      providerSync = "pending";
      providerErrorCode = "google_sync_pending";
    }
    return Response.json({ event, provider_sync: providerSync, provider_error_code: providerErrorCode }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Calendar event could not be created.", 400);
  }
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/events", method: "POST" },
    () => handlePost(request),
  );
}
