import "server-only";

import { getCompanyAdminCalendar } from "@/lib/calendar/calendar-events";
import type { GoogleCalendarEventResource } from "@/lib/google-calendar/google-calendar";
import { googleOriginalStartKey, isEditableGoogleDefaultEvent } from "@/lib/google-calendar/event-mapping";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

function nextUtcDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function normalizedProviderTimes(event: GoogleCalendarEventResource) {
  const allDayStart = event.start?.date ?? null;
  if (allDayStart) {
    const providerEnd = event.end?.date ?? null;
    return {
      allDay: true,
      startAt: null,
      endAt: null,
      allDayStart,
      allDayEnd: providerEnd && providerEnd > allDayStart ? providerEnd : nextUtcDate(allDayStart),
    };
  }

  const startAt = event.start?.dateTime ?? null;
  const providerEnd = event.end?.dateTime ?? null;
  const startMs = startAt ? Date.parse(startAt) : Number.NaN;
  const endMs = providerEnd ? Date.parse(providerEnd) : Number.NaN;
  const endAt = providerEnd && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs
    ? null
    : providerEnd;

  return {
    allDay: false,
    startAt,
    endAt,
    allDayStart: null,
    allDayEnd: null,
  };
}

function valuesFromGoogle(input: {
  event: GoogleCalendarEventResource;
  projectId: string | null;
  ownerProfileId: string;
  adminCalendarId: string;
  recurringParentEventId?: string | null;
}) {
  const event = input.event;
  const times = normalizedProviderTimes(event);
  const deleted = event.status === "cancelled";
  return {
    admin_calendar_id: input.adminCalendarId,
    project_id: input.projectId,
    owner_profile_id: input.ownerProfileId,
    title: event.summary?.trim() || "(No title)",
    description: event.description ?? null,
    location: event.location ?? null,
    all_day: times.allDay,
    start_at: times.startAt,
    end_at: times.endAt,
    all_day_start: times.allDayStart,
    all_day_end: times.allDayEnd,
    timezone: event.start?.timeZone ?? event.end?.timeZone ?? "UTC",
    provider_color_id: event.colorId ?? null,
    recurrence: event.recurrence ?? [],
    recurring_parent_event_id: input.recurringParentEventId ?? null,
    provider_recurring_event_id: event.recurringEventId ?? null,
    provider_original_start_key: googleOriginalStartKey(event) || null,
    attendees: event.attendees ?? [],
    guests_can_invite_others: event.guestsCanInviteOthers ?? null,
    guests_can_modify: event.guestsCanModify ?? null,
    guests_can_see_other_guests: event.guestsCanSeeOtherGuests ?? null,
    reminders: event.reminders ?? null,
    conference_data: event.conferenceData ?? null,
    visibility: event.visibility ?? null,
    transparency: event.transparency ?? null,
    provider_event_type: event.eventType ?? "default",
    provider_html_link: event.htmlLink ?? null,
    organizer: event.organizer ?? null,
    creator: event.creator ?? null,
    status: deleted ? "cancelled" : event.status ?? "confirmed",
    deleted_at: deleted ? new Date().toISOString() : null,
  };
}

export async function applyGoogleEventReplica(input: {
  event: GoogleCalendarEventResource;
  existingEventId?: string | null;
  projectId?: string | null;
  recurringParentEventId?: string | null;
}) {
  const company = await getCompanyAdminCalendar();
  if (!company) throw new Error("Company Calendar is not configured.");
  const values = valuesFromGoogle({
    event: input.event,
    projectId: input.projectId ?? null,
    ownerProfileId: company.owner_profile_id,
    adminCalendarId: company.id,
    recurringParentEventId: input.recurringParentEventId ?? null,
  });

  if (input.existingEventId) {
    const { data, error } = await supabaseAdmin.from("calendar_events").update(values).eq("id", input.existingEventId).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  }

  if (input.event.status === "cancelled") return null;
  const { data, error } = await supabaseAdmin.from("calendar_events").insert({ ...values, created_by: null, updated_by: null }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export function providerEventIsEditable(event: GoogleCalendarEventResource) {
  return isEditableGoogleDefaultEvent(event);
}
