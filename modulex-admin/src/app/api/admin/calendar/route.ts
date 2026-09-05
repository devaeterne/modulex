import { hasPermission } from "@/lib/auth/permissions";
import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  getAdminCalendarSnapshot,
  reassignAdminCalendarOwner,
  type AdminCalendarEventQuery,
} from "@/lib/calendar/admin-calendar";
import type { AdminCalendarEventType } from "@/lib/calendar/event-normalization";
import { withApiTiming } from "@/lib/observability/apiTiming";

const EVENT_TYPES = new Set<AdminCalendarEventType>([
  "project_start",
  "project_target",
  "project_delivery",
  "installation",
  "google_external",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)?.trim();
  return value || null;
}

function parseRange(searchParams: URLSearchParams) {
  const start = optionalParam(searchParams, "start");
  const end = optionalParam(searchParams, "end");
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()) || startDate >= endDate) return null;
  if (endDate.valueOf() - startDate.valueOf() > 370 * 24 * 60 * 60 * 1000) return null;
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}

async function handleGet(request: Request) {
  const auth = await requirePermission(request, "calendar.view");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const range = parseRange(url.searchParams);
  if (!range) return jsonError("Calendar start/end range is required and must be valid.", 400);

  const eventTypeValue = optionalParam(url.searchParams, "event_type");
  if (eventTypeValue && !EVENT_TYPES.has(eventTypeValue as AdminCalendarEventType)) {
    return jsonError("Calendar event type is invalid.", 400);
  }

  const query: AdminCalendarEventQuery = {
    ...range,
    actorProfileId: auth.actor.profile.id,
    myCalendar: url.searchParams.get("my_calendar") === "true",
    ownerId: optionalParam(url.searchParams, "owner_id"),
    projectId: optionalParam(url.searchParams, "project_id"),
    calendarId: optionalParam(url.searchParams, "calendar_id"),
    eventType: (eventTypeValue as AdminCalendarEventType | null) ?? null,
  };

  try {
    const snapshot = await getAdminCalendarSnapshot(query);
    return Response.json({
      ...snapshot,
      can_manage: hasPermission(auth.actor.profile.roles, "calendar.manage"),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Admin Calendar could not be loaded.", 500);
  }
}

async function handlePatch(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const calendarId = typeof body.calendar_id === "string" ? body.calendar_id.trim() : "";
  const ownerProfileId = typeof body.owner_profile_id === "string" ? body.owner_profile_id.trim() : "";
  if (!UUID_PATTERN.test(calendarId) || !UUID_PATTERN.test(ownerProfileId)) {
    return jsonError("A valid Calendar and active owner are required.", 400);
  }

  try {
    return Response.json(await reassignAdminCalendarOwner({
      calendarId,
      ownerProfileId,
      actorUserId: auth.actor.user.id,
    }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Calendar owner could not be updated.", 400);
  }
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar", method: "GET" },
    () => handleGet(request),
  );
}

export async function PATCH(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar", method: "PATCH" },
    () => handlePatch(request),
  );
}
