import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { createCalendarEvent } from "@/lib/calendar/calendar-events";
import type { CalendarEventMutation } from "@/lib/calendar/calendar-event-validation";
import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import { withApiTiming } from "@/lib/observability/apiTiming";

function parseMutation(body: Record<string, unknown>): CalendarEventMutation {
  const guestOptions = (body.guest_options && typeof body.guest_options === "object" ? body.guest_options : {}) as Record<string, unknown>;
  const conference = (body.conference && typeof body.conference === "object" ? body.conference : {}) as Record<string, unknown>;
  return {
    title: typeof body.title === "string" ? body.title : "",
    projectId: typeof body.project_id === "string" && body.project_id ? body.project_id : null,
    ownerProfileId: typeof body.owner_profile_id === "string" ? body.owner_profile_id : "",
    description: typeof body.description === "string" ? body.description : null,
    location: typeof body.location === "string" ? body.location : null,
    allDay: body.all_day === true,
    start: typeof body.start === "string" ? body.start : "",
    end: typeof body.end === "string" && body.end ? body.end : null,
    timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
    colorId: typeof body.color_id === "string" ? body.color_id : null,
    recurrence: Array.isArray(body.recurrence) ? body.recurrence.filter((value): value is string => typeof value === "string") : [],
    attendees: Array.isArray(body.attendees) ? body.attendees.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      if (typeof row.email !== "string") return [];
      return [{ email: row.email, displayName: typeof row.displayName === "string" ? row.displayName : undefined, optional: row.optional === true }];
    }) : [],
    guestOptions: {
      canInviteOthers: typeof guestOptions.canInviteOthers === "boolean" ? guestOptions.canInviteOthers : null,
      canModify: typeof guestOptions.canModify === "boolean" ? guestOptions.canModify : null,
      canSeeOtherGuests: typeof guestOptions.canSeeOtherGuests === "boolean" ? guestOptions.canSeeOtherGuests : null,
    },
    reminders: body.reminders && typeof body.reminders === "object" ? body.reminders as CalendarEventMutation["reminders"] : null,
    conference: { createGoogleMeet: conference.createGoogleMeet === true, removeConference: conference.removeConference === true },
    visibility: typeof body.visibility === "string" ? body.visibility as CalendarEventMutation["visibility"] : null,
    transparency: typeof body.transparency === "string" ? body.transparency as CalendarEventMutation["transparency"] : null,
  };
}

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return jsonError("Invalid request body.", 400); }
  try {
    const event = await createCalendarEvent(parseMutation(body), auth.actor.user.id);
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
  return withApiTiming({ route: "/api/admin/calendar/events", method: "POST" }, () => handlePost(request));
}
