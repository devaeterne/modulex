import "server-only";

import { createHash } from "node:crypto";
import { getCalendarEvent, type CalendarEventRecord } from "@/lib/calendar/calendar-events";
import type { V3SourceType } from "@/lib/google-calendar/v3-repository";
import type { GoogleCalendarEventInput, GoogleCalendarEventResource } from "@/lib/google-calendar/google-calendar";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export type MappedModulexSource = {
  sourceType: V3SourceType;
  sourceId: string;
  projectId: string | null;
  deleted: boolean;
  fingerprint: string | null;
  event: GoogleCalendarEventInput | null;
  sendUpdates: "all" | "none";
  conferenceDataVersion?: number;
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

async function extension(sourceType: string, sourceId: string) {
  const { data } = await supabaseAdmin.from("calendar_business_event_extensions").select("*").eq("source_type", sourceType).eq("source_id", sourceId).maybeSingle();
  return data as Record<string, unknown> | null;
}

function applyFlexibleFields(event: GoogleCalendarEventInput, ext: Record<string, unknown> | null) {
  if (!ext) return event;
  const result: GoogleCalendarEventInput = { ...event };
  if (typeof ext.title_override === "string" && ext.title_override.trim()) result.summary = ext.title_override.trim();
  if (typeof ext.description === "string") result.description = ext.description;
  if (typeof ext.location === "string") result.location = ext.location;
  if (typeof ext.provider_color_id === "string") result.colorId = ext.provider_color_id;
  if (Array.isArray(ext.attendees)) result.attendees = ext.attendees as GoogleCalendarEventInput["attendees"];
  if (typeof ext.guests_can_invite_others === "boolean") result.guestsCanInviteOthers = ext.guests_can_invite_others;
  if (typeof ext.guests_can_modify === "boolean") result.guestsCanModify = ext.guests_can_modify;
  if (typeof ext.guests_can_see_other_guests === "boolean") result.guestsCanSeeOtherGuests = ext.guests_can_see_other_guests;
  if (ext.reminders && typeof ext.reminders === "object") result.reminders = ext.reminders as GoogleCalendarEventInput["reminders"];
  if (ext.conference_data && typeof ext.conference_data === "object") result.conferenceData = ext.conference_data as Record<string, unknown>;
  if (typeof ext.visibility === "string") result.visibility = ext.visibility;
  if (typeof ext.transparency === "string") result.transparency = ext.transparency;
  return result;
}

function identity(sourceType: V3SourceType, sourceId: string, projectId: string | null) {
  return {
    private: {
      modulex_source_type: sourceType,
      modulex_source_id: sourceId,
      modulex_project_id: projectId ?? "",
    },
  };
}

function normalToGoogle(event: CalendarEventRecord): GoogleCalendarEventInput {
  const conference = event.conference_data;
  const createMeet = conference?.request === "create_google_meet";
  const removeConference = conference?.request === "remove_conference";
  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    colorId: event.provider_color_id,
    start: event.all_day ? { date: event.all_day_start ?? undefined } : { dateTime: event.start_at ?? undefined, timeZone: event.timezone },
    end: event.all_day ? { date: event.all_day_end ?? undefined } : { dateTime: event.end_at ?? event.start_at ?? undefined, timeZone: event.timezone },
    recurrence: event.recurrence ?? [],
    attendees: event.attendees as GoogleCalendarEventInput["attendees"],
    guestsCanInviteOthers: event.guests_can_invite_others ?? undefined,
    guestsCanModify: event.guests_can_modify ?? undefined,
    guestsCanSeeOtherGuests: event.guests_can_see_other_guests ?? undefined,
    reminders: event.reminders as GoogleCalendarEventInput["reminders"],
    conferenceData: createMeet
      ? { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } }
      : removeConference ? null : event.conference_data,
    visibility: event.visibility,
    transparency: event.transparency,
    extendedProperties: identity("calendar_event", event.id, event.project_id),
  };
}

export async function buildGoogleEventForSource(sourceType: V3SourceType, sourceId: string): Promise<MappedModulexSource> {
  if (sourceType === "calendar_event") {
    const event = await getCalendarEvent(sourceId);
    if (!event || event.deleted_at || event.status === "cancelled") {
      return { sourceType, sourceId, projectId: event?.project_id ?? null, deleted: true, fingerprint: null, event: null, sendUpdates: "all" };
    }
    const payload = normalToGoogle(event);
    return {
      sourceType, sourceId, projectId: event.project_id, deleted: false, fingerprint: hash(payload), event: payload,
      sendUpdates: event.attendees?.length ? "all" : "none",
      conferenceDataVersion: payload.conferenceData ? 1 : undefined,
    };
  }

  if (sourceType === "project_start" || sourceType === "project_target" || sourceType === "project_delivery") {
    const { data: project, error } = await supabaseAdmin.from("customer_projects").select("id,project_number,name,customer_id,start_date,target_date,planned_delivery_date,status").eq("id", sourceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) return { sourceType, sourceId, projectId: sourceId, deleted: true, fingerprint: null, event: null, sendUpdates: "none" };
    const date = sourceType === "project_start" ? project.start_date : sourceType === "project_target" ? project.target_date : project.planned_delivery_date;
    if (!date || project.status === "cancelled") return { sourceType, sourceId, projectId: sourceId, deleted: true, fingerprint: null, event: null, sendUpdates: "none" };
    const { data: customer } = await supabaseAdmin.from("customers").select("name").eq("id", project.customer_id).maybeSingle();
    const label = sourceType === "project_start" ? "Project Start" : sourceType === "project_target" ? "Project Target" : "Planned Delivery";
    let payload: GoogleCalendarEventInput = {
      summary: `${label} — ${project.project_number} — ${customer?.name ?? project.name}`,
      description: `Modulex Project: ${project.project_number}\n${project.name}`,
      start: { date: String(date) },
      end: { date: nextDate(String(date)) },
      extendedProperties: identity(sourceType, sourceId, sourceId),
    };
    payload = applyFlexibleFields(payload, await extension(sourceType, sourceId));
    return { sourceType, sourceId, projectId: sourceId, deleted: false, fingerprint: hash(payload), event: payload, sendUpdates: payload.attendees?.length ? "all" : "none", conferenceDataVersion: payload.conferenceData ? 1 : undefined };
  }

  const { data: installation, error } = await supabaseAdmin.from("customer_installations")
    .select("id,installation_number,order_id,scheduled_start_at,scheduled_end_at,status")
    .eq("id", sourceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!installation) return { sourceType, sourceId, projectId: null, deleted: true, fingerprint: null, event: null, sendUpdates: "none" };
  const { data: order } = await supabaseAdmin.from("customer_orders").select("id,order_number,project_id,customer_id").eq("id", installation.order_id).maybeSingle();
  const projectId = order?.project_id ? String(order.project_id) : null;
  if (installation.status === "cancelled" || !installation.scheduled_start_at || !projectId) return { sourceType, sourceId, projectId, deleted: true, fingerprint: null, event: null, sendUpdates: "none" };
  const { data: project } = await supabaseAdmin.from("customer_projects").select("project_number,name").eq("id", projectId).maybeSingle();
  const { data: customer } = order?.customer_id ? await supabaseAdmin.from("customers").select("name").eq("id", order.customer_id).maybeSingle() : { data: null };
  let payload: GoogleCalendarEventInput = {
    summary: `Installation — ${project?.project_number ?? installation.installation_number} — ${customer?.name ?? project?.name ?? "Customer"}`,
    description: `Modulex Installation: ${installation.installation_number}${order?.order_number ? `\nOrder: ${order.order_number}` : ""}`,
    start: { dateTime: String(installation.scheduled_start_at) },
    end: { dateTime: String(installation.scheduled_end_at ?? installation.scheduled_start_at) },
    extendedProperties: identity("installation", sourceId, projectId),
  };
  payload = applyFlexibleFields(payload, await extension("installation", sourceId));
  return { sourceType, sourceId, projectId, deleted: false, fingerprint: hash(payload), event: payload, sendUpdates: payload.attendees?.length ? "all" : "none", conferenceDataVersion: payload.conferenceData ? 1 : undefined };
}

export function googleEventFingerprint(event: GoogleCalendarEventResource) {
  return hash({
    summary: event.summary ?? "",
    description: event.description ?? null,
    location: event.location ?? null,
    colorId: event.colorId ?? null,
    start: event.start ?? null,
    end: event.end ?? null,
    recurrence: event.recurrence ?? [],
    attendees: event.attendees ?? [],
    guestsCanInviteOthers: event.guestsCanInviteOthers ?? null,
    guestsCanModify: event.guestsCanModify ?? null,
    guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests ?? null,
    reminders: event.reminders ?? null,
    conferenceData: event.conferenceData ?? null,
    visibility: event.visibility ?? null,
    transparency: event.transparency ?? null,
    status: event.status ?? null,
    eventType: event.eventType ?? "default",
  });
}

export function googleOriginalStartKey(event: GoogleCalendarEventResource) {
  return event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? "";
}

export function isEditableGoogleDefaultEvent(event: GoogleCalendarEventResource) {
  return !event.eventType || event.eventType === "default";
}
