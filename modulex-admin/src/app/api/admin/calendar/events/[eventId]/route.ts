import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { parseCalendarEventMutationBody } from "@/lib/calendar/calendar-event-request";
import {
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/lib/calendar/calendar-events";
import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import { withApiTiming } from "@/lib/observability/apiTiming";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

async function attemptProviderFlush(request: Request) {
  try {
    const sync = await flushCalendarOutboxBatch(10, request.url);
    return {
      provider_sync: sync.errors ? "error" as const : "synced" as const,
      provider_error_code: sync.errors ? "google_sync_pending" : null,
    };
  } catch {
    return { provider_sync: "pending" as const, provider_error_code: "google_sync_pending" };
  }
}

async function handleGet(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "calendar.view");
  if (auth.response) return auth.response;
  const { eventId } = await context.params;
  try {
    const event = await getCalendarEvent(eventId);
    if (!event || event.deleted_at) return jsonError("Calendar event was not found.", 404);
    return Response.json({ event });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Calendar event could not be loaded.", 500);
  }
}

async function handlePatch(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;
  const { eventId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  try {
    const event = await updateCalendarEvent(eventId, parseCalendarEventMutationBody(body), auth.actor.user.id);
    return Response.json({ event, ...(await attemptProviderFlush(request)) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Calendar event could not be updated.", 400);
  }
}

async function handleDelete(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;
  const { eventId } = await context.params;
  try {
    await deleteCalendarEvent(eventId, auth.actor.user.id);
    return Response.json({ deleted: true, ...(await attemptProviderFlush(request)) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Calendar event could not be deleted.", 400);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/calendar/events/[eventId]", method: "GET" },
    () => handleGet(request, context),
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/calendar/events/[eventId]", method: "PATCH" },
    () => handlePatch(request, context),
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/calendar/events/[eventId]", method: "DELETE" },
    () => handleDelete(request, context),
  );
}
