import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";
import {
  validateCalendarEventMutation,
  type CalendarEventMutation,
} from "@/lib/calendar/calendar-event-validation";

export type CalendarEventRecord = {
  id: string;
  admin_calendar_id: string;
  project_id: string | null;
  owner_profile_id: string;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  all_day_start: string | null;
  all_day_end: string | null;
  timezone: string;
  provider_color_id: string | null;
  recurrence: string[];
  attendees: Array<Record<string, unknown>>;
  guests_can_invite_others: boolean | null;
  guests_can_modify: boolean | null;
  guests_can_see_other_guests: boolean | null;
  reminders: Record<string, unknown> | null;
  conference_data: Record<string, unknown> | null;
  visibility: string | null;
  transparency: string | null;
  provider_event_type: string;
  provider_html_link: string | null;
  provider_recurring_event_id: string | null;
  provider_original_start_key: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function assertOwnerAndProject(input: CalendarEventMutation) {
  const ownerResult = await supabaseAdmin.from("profiles").select("id,is_active").eq("id", input.ownerProfileId).maybeSingle();
  assertNoError(ownerResult.error, "Calendar event owner could not be validated.");
  if (!ownerResult.data?.is_active) throw new Error("Calendar event owner must be active.");

  if (input.projectId) {
    const projectResult = await supabaseAdmin.from("customer_projects").select("id").eq("id", input.projectId).maybeSingle();
    assertNoError(projectResult.error, "Calendar event Project could not be validated.");
    if (!projectResult.data) throw new Error("Calendar event Project was not found.");
  }
}

export async function getCompanyAdminCalendar(): Promise<{ id: string; timezone: string; owner_profile_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("admin_calendars")
    .select("id,timezone,owner_profile_id")
    .eq("kind", "company")
    .eq("is_active", true)
    .maybeSingle();
  assertNoError(error, "Company Calendar could not be loaded.");
  return data ? { id: String(data.id), timezone: String(data.timezone), owner_profile_id: String(data.owner_profile_id) } : null;
}

function eventValues(input: CalendarEventMutation, actorId: string) {
  return {
    project_id: input.projectId,
    owner_profile_id: input.ownerProfileId,
    title: input.title,
    description: input.description,
    location: input.location,
    all_day: input.allDay,
    start_at: input.allDay ? null : input.start,
    end_at: input.allDay ? null : input.end,
    all_day_start: input.allDay ? input.start : null,
    all_day_end: input.allDay ? input.end : null,
    timezone: input.timezone,
    provider_color_id: input.colorId,
    recurrence: input.recurrence,
    attendees: input.attendees,
    guests_can_invite_others: input.guestOptions.canInviteOthers,
    guests_can_modify: input.guestOptions.canModify,
    guests_can_see_other_guests: input.guestOptions.canSeeOtherGuests,
    reminders: input.reminders,
    conference_data: input.conference.createGoogleMeet
      ? { request: "create_google_meet" }
      : input.conference.removeConference
        ? { request: "remove_conference" }
        : null,
    visibility: input.visibility,
    transparency: input.transparency,
    provider_event_type: "default",
    status: "confirmed",
    deleted_at: null,
    updated_by: actorId,
  };
}

export async function createCalendarEvent(input: CalendarEventMutation, actorId: string): Promise<CalendarEventRecord> {
  const normalized = validateCalendarEventMutation(input);
  await assertOwnerAndProject(normalized);
  const calendar = await getCompanyAdminCalendar();
  if (!calendar) throw new Error("Company Calendar is not configured.");
  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .insert({ admin_calendar_id: calendar.id, ...eventValues(normalized, actorId), created_by: actorId })
    .select("*")
    .single();
  assertNoError(error, "Calendar event could not be created.");
  return data as CalendarEventRecord;
}

export async function getCalendarEvent(id: string): Promise<CalendarEventRecord | null> {
  const { data, error } = await supabaseAdmin.from("calendar_events").select("*").eq("id", id).maybeSingle();
  assertNoError(error, "Calendar event could not be loaded.");
  return data as CalendarEventRecord | null;
}

export async function updateCalendarEvent(id: string, input: CalendarEventMutation, actorId: string): Promise<CalendarEventRecord> {
  const current = await getCalendarEvent(id);
  if (!current || current.deleted_at) throw new Error("Calendar event was not found.");
  if (current.provider_event_type !== "default") throw new Error("This Google event type is read-only in Modulex.");
  const normalized = validateCalendarEventMutation(input);
  await assertOwnerAndProject(normalized);
  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .update(eventValues(normalized, actorId))
    .eq("id", id)
    .select("*")
    .single();
  assertNoError(error, "Calendar event could not be updated.");
  return data as CalendarEventRecord;
}

export async function deleteCalendarEvent(id: string, actorId: string): Promise<void> {
  const current = await getCalendarEvent(id);
  if (!current || current.deleted_at) return;
  if (current.provider_event_type !== "default") throw new Error("This Google event type is read-only in Modulex.");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("calendar_events").update({ status: "cancelled", deleted_at: now, updated_by: actorId }).eq("id", id);
  assertNoError(error, "Calendar event could not be deleted.");
}

type CalendarEventListInput = {
  start: string;
  end: string;
  projectId?: string | null;
  ownerProfileId?: string | null;
};

async function listCalendarEventRowsForRange(input: CalendarEventListInput, allDay: boolean): Promise<CalendarEventRecord[]> {
  let query = supabaseAdmin
    .from("calendar_events")
    .select("*")
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .eq("all_day", allDay);

  if (input.projectId) query = query.eq("project_id", input.projectId);
  if (input.ownerProfileId) query = query.eq("owner_profile_id", input.ownerProfileId);

  if (allDay) {
    const startDate = input.start.slice(0, 10);
    const endDate = input.end.slice(0, 10);
    query = query
      .lt("all_day_start", endDate)
      .or(`all_day_end.gt.${startDate},all_day_start.gt.${startDate}`);
  } else {
    query = query
      .lt("start_at", input.end)
      .or(`end_at.gte.${input.start},start_at.gte.${input.start}`);
  }

  const { data, error } = await query.order(allDay ? "all_day_start" : "start_at");
  assertNoError(error, "Calendar events could not be loaded.");
  return (data ?? []) as CalendarEventRecord[];
}

export async function listCalendarEvents(input: CalendarEventListInput): Promise<CalendarEventRecord[]> {
  const [timedRows, allDayRows] = await Promise.all([
    listCalendarEventRowsForRange(input, false),
    listCalendarEventRowsForRange(input, true),
  ]);
  const start = new Date(input.start);
  const end = new Date(input.end);
  return [...timedRows, ...allDayRows].filter((event) => {
    if (event.all_day) return Boolean(event.all_day_start && event.all_day_start < input.end.slice(0, 10) && (event.all_day_end ?? event.all_day_start) > input.start.slice(0, 10));
    if (!event.start_at) return false;
    const eventStart = new Date(event.start_at);
    const eventEnd = event.end_at ? new Date(event.end_at) : eventStart;
    return eventStart < end && eventEnd >= start;
  });
}
