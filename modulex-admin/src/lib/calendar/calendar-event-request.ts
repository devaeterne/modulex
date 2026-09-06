import type { CalendarEventMutation } from "@/lib/calendar/calendar-event-validation";

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export function parseCalendarEventMutationBody(body: Record<string, unknown>): CalendarEventMutation {
  const guestOptions = body.guest_options && typeof body.guest_options === "object"
    ? body.guest_options as Record<string, unknown>
    : {};
  const conference = body.conference && typeof body.conference === "object"
    ? body.conference as Record<string, unknown>
    : {};

  const attendees = Array.isArray(body.attendees)
    ? body.attendees.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const row = value as Record<string, unknown>;
        if (typeof row.email !== "string") return [];
        return [{
          email: row.email,
          displayName: typeof row.displayName === "string" ? row.displayName : undefined,
          optional: row.optional === true,
        }];
      })
    : [];

  const reminders = body.reminders && typeof body.reminders === "object"
    ? body.reminders as CalendarEventMutation["reminders"]
    : null;

  return {
    title: typeof body.title === "string" ? body.title : "",
    projectId: nullableString(body.project_id),
    ownerProfileId: typeof body.owner_profile_id === "string" ? body.owner_profile_id.trim() : "",
    description: nullableString(body.description),
    location: nullableString(body.location),
    allDay: body.all_day === true,
    start: typeof body.start === "string" ? body.start : "",
    end: nullableString(body.end),
    timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC",
    colorId: nullableString(body.color_id),
    recurrence: Array.isArray(body.recurrence)
      ? body.recurrence.filter((value): value is string => typeof value === "string")
      : [],
    attendees,
    guestOptions: {
      canInviteOthers: nullableBoolean(guestOptions.canInviteOthers),
      canModify: nullableBoolean(guestOptions.canModify),
      canSeeOtherGuests: nullableBoolean(guestOptions.canSeeOtherGuests),
    },
    reminders,
    conference: {
      createGoogleMeet: conference.createGoogleMeet === true,
      removeConference: conference.removeConference === true,
    },
    visibility: typeof body.visibility === "string"
      ? body.visibility as CalendarEventMutation["visibility"]
      : null,
    transparency: typeof body.transparency === "string"
      ? body.transparency as CalendarEventMutation["transparency"]
      : null,
  };
}
