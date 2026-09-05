import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";
import {
  normalizeGoogleMirrorEvent,
  normalizeInstallationCalendarEvent,
  normalizeProjectCalendarEvents,
  type AdminCalendarDescriptor,
  type AdminCalendarEvent,
  type AdminCalendarEventType,
  type AdminCalendarInstallationRow,
  type AdminCalendarProjectRow,
  type GoogleCalendarMirrorRow,
} from "@/lib/calendar/event-normalization";

export type AdminCalendarListItem = AdminCalendarDescriptor & {
  owner_name: string;
  owner_email: string | null;
  project_number: string | null;
  project_name: string | null;
  provider_binding_id: string | null;
  provider_calendar_name: string | null;
  provider_data_owner: string | null;
  provider_access_role: string | null;
  provider_background_color: string | null;
  provider_foreground_color: string | null;
  provider_color_id: string | null;
  binding_mode: "modulex_created" | "google_imported" | null;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_mirror_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};

export type AdminCalendarOwnerOption = {
  id: string;
  label: string;
  email: string | null;
};

export type AdminCalendarProjectOption = {
  id: string;
  project_number: string;
  name: string;
};

export type AdminCalendarEventQuery = {
  start: string;
  end: string;
  actorProfileId: string;
  myCalendar?: boolean;
  ownerId?: string | null;
  projectId?: string | null;
  calendarId?: string | null;
  eventType?: AdminCalendarEventType | null;
};

export type AdminCalendarSnapshot = {
  calendars: AdminCalendarListItem[];
  owners: AdminCalendarOwnerOption[];
  projects: AdminCalendarProjectOption[];
  events: AdminCalendarEvent[];
};

type CalendarRow = AdminCalendarDescriptor & { is_active: boolean };
type ProviderBindingRow = {
  id: string;
  admin_calendar_id: string;
  provider_calendar_name: string;
  provider_data_owner: string | null;
  provider_access_role: string | null;
  provider_background_color: string | null;
  provider_foreground_color: string | null;
  provider_color_id: string | null;
  binding_mode: "modulex_created" | "google_imported";
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_mirror_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};

type ProjectRecord = AdminCalendarProjectRow & { status: string };
type OrderRecord = {
  id: string;
  project_id: string;
  customer_id: string;
  order_number: string;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function inRange(event: AdminCalendarEvent, start: Date, end: Date) {
  const eventStart = event.all_day ? new Date(`${event.start}T00:00:00Z`) : new Date(event.start);
  if (Number.isNaN(eventStart.valueOf())) return false;
  if (!event.end) return eventStart >= start && eventStart < end;
  const eventEnd = event.all_day ? new Date(`${event.end}T00:00:00Z`) : new Date(event.end);
  if (Number.isNaN(eventEnd.valueOf())) return eventStart >= start && eventStart < end;
  return eventStart < end && eventEnd > start;
}

async function readCalendarRows(): Promise<CalendarRow[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_calendars")
    .select("id,name,kind,owner_profile_id,project_id,timezone,default_background_color,default_foreground_color,is_active")
    .eq("is_active", true)
    .order("name");
  assertNoError(error, "Admin calendars could not be loaded.");
  return (data ?? []) as CalendarRow[];
}

export async function listCalendarOwnerOptions(): Promise<AdminCalendarOwnerOption[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,email")
    .eq("is_active", true)
    .order("full_name");
  assertNoError(error, "Calendar owner options could not be loaded.");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.full_name || row.email || "Unnamed user"),
    email: row.email ? String(row.email) : null,
  }));
}

export async function reassignAdminCalendarOwner(input: {
  calendarId: string;
  ownerProfileId: string;
  actorUserId: string;
}) {
  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.ownerProfileId)
    .maybeSingle();
  assertNoError(ownerError, "Calendar owner could not be validated.");
  if (!owner?.is_active) throw new Error("Calendar owner must be an active Modulex user.");

  const { data, error } = await supabaseAdmin
    .from("admin_calendars")
    .update({ owner_profile_id: input.ownerProfileId, updated_by: input.actorUserId })
    .eq("id", input.calendarId)
    .eq("is_active", true)
    .select("id,owner_profile_id")
    .maybeSingle();
  assertNoError(error, "Calendar owner could not be updated.");
  if (!data) throw new Error("Calendar was not found.");
  return { id: String(data.id), owner_profile_id: String(data.owner_profile_id) };
}

export async function listAdminCalendars(): Promise<AdminCalendarListItem[]> {
  const calendars = await readCalendarRows();
  if (calendars.length === 0) return [];

  const ownerIds = unique(calendars.map((calendar) => calendar.owner_profile_id));
  const projectIds = unique(calendars.map((calendar) => calendar.project_id));
  const calendarIds = calendars.map((calendar) => calendar.id);

  const [ownersResult, projectsResult, bindingsResult] = await Promise.all([
    ownerIds.length
      ? supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabaseAdmin.from("customer_projects").select("id,project_number,name").in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("project_calendar_bindings")
      .select("id,admin_calendar_id,provider_calendar_name,provider_data_owner,provider_access_role,provider_background_color,provider_foreground_color,provider_color_id,binding_mode,sync_enabled,last_sync_at,last_mirror_sync_at,last_error_at,last_error_code")
      .in("admin_calendar_id", calendarIds),
  ]);

  assertNoError(ownersResult.error, "Calendar owners could not be loaded.");
  assertNoError(projectsResult.error, "Calendar Projects could not be loaded.");
  assertNoError(bindingsResult.error, "Calendar provider bindings could not be loaded.");

  const ownerMap = new Map((ownersResult.data ?? []).map((row) => [String(row.id), row]));
  const projectMap = new Map((projectsResult.data ?? []).map((row) => [String(row.id), row]));
  const bindingMap = new Map(
    ((bindingsResult.data ?? []) as ProviderBindingRow[]).map((row) => [row.admin_calendar_id, row]),
  );

  return calendars.map((calendar) => {
    const owner = ownerMap.get(calendar.owner_profile_id);
    const project = calendar.project_id ? projectMap.get(calendar.project_id) : null;
    const binding = bindingMap.get(calendar.id) ?? null;
    return {
      id: calendar.id,
      name: calendar.name,
      kind: calendar.kind,
      owner_profile_id: calendar.owner_profile_id,
      project_id: calendar.project_id,
      timezone: calendar.timezone,
      default_background_color: binding?.provider_background_color || calendar.default_background_color,
      default_foreground_color: binding?.provider_foreground_color || calendar.default_foreground_color,
      owner_name: String(owner?.full_name || owner?.email || "Unknown owner"),
      owner_email: owner?.email ? String(owner.email) : null,
      project_number: project?.project_number ? String(project.project_number) : null,
      project_name: project?.name ? String(project.name) : null,
      provider_binding_id: binding?.id ?? null,
      provider_calendar_name: binding?.provider_calendar_name ?? null,
      provider_data_owner: binding?.provider_data_owner ?? null,
      provider_access_role: binding?.provider_access_role ?? null,
      provider_background_color: binding?.provider_background_color ?? null,
      provider_foreground_color: binding?.provider_foreground_color ?? null,
      provider_color_id: binding?.provider_color_id ?? null,
      binding_mode: binding?.binding_mode ?? null,
      sync_enabled: binding?.sync_enabled ?? false,
      last_sync_at: binding?.last_sync_at ?? null,
      last_mirror_sync_at: binding?.last_mirror_sync_at ?? null,
      last_error_at: binding?.last_error_at ?? null,
      last_error_code: binding?.last_error_code ?? null,
    };
  });
}

async function loadProjects(projectIds: string[]): Promise<ProjectRecord[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("customer_projects")
    .select("id,project_number,customer_id,name,start_date,target_date,planned_delivery_date,primary_installation_id,status")
    .in("id", projectIds)
    .neq("status", "cancelled");
  assertNoError(error, "Calendar Project schedules could not be loaded.");
  return (data ?? []) as ProjectRecord[];
}

async function loadInstallations(projectIds: string[], start: string, end: string): Promise<AdminCalendarInstallationRow[]> {
  if (projectIds.length === 0) return [];

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from("customer_orders")
    .select("id,project_id,customer_id,order_number")
    .in("project_id", projectIds)
    .neq("status", "cancelled");
  assertNoError(ordersError, "Calendar Project Orders could not be loaded.");
  const orderRows = (orders ?? []) as OrderRecord[];
  if (orderRows.length === 0) return [];

  const orderMap = new Map(orderRows.map((row) => [row.id, row]));
  const { data, error } = await supabaseAdmin
    .from("customer_installations")
    .select("id,order_id,scheduled_start_at,scheduled_end_at,status")
    .in("order_id", orderRows.map((row) => row.id))
    .neq("status", "cancelled")
    .lt("scheduled_start_at", end)
    .or(`scheduled_end_at.is.null,scheduled_end_at.gt.${start}`)
    .order("scheduled_start_at");
  assertNoError(error, "Installation schedules could not be loaded.");

  return (data ?? []).flatMap((row) => {
    const order = orderMap.get(String(row.order_id));
    if (!order || !row.scheduled_start_at) return [];
    return [{
      id: String(row.id),
      project_id: order.project_id,
      customer_id: order.customer_id,
      order_id: order.id,
      order_number: order.order_number,
      scheduled_start_at: String(row.scheduled_start_at),
      scheduled_end_at: row.scheduled_end_at ? String(row.scheduled_end_at) : null,
      status: String(row.status),
    } satisfies AdminCalendarInstallationRow];
  });
}

async function loadGoogleMirrors(calendarIds: string[]): Promise<GoogleCalendarMirrorRow[]> {
  if (calendarIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("google_calendar_event_mirror")
    .select("id,admin_calendar_id,project_calendar_binding_id,provider_event_id,title,start_at,end_at,all_day,all_day_start,all_day_end,status,provider_event_url,provider_color_id,provider_updated_at")
    .in("admin_calendar_id", calendarIds)
    .neq("status", "cancelled");
  assertNoError(error, "Imported Google Calendar events could not be loaded.");
  return (data ?? []) as GoogleCalendarMirrorRow[];
}

export async function listAdminCalendarEvents(input: AdminCalendarEventQuery): Promise<AdminCalendarEvent[]> {
  const rangeStart = new Date(input.start);
  const rangeEnd = new Date(input.end);
  if (Number.isNaN(rangeStart.valueOf()) || Number.isNaN(rangeEnd.valueOf()) || rangeStart >= rangeEnd) {
    throw new Error("Calendar range is invalid.");
  }

  const allCalendars = await listAdminCalendars();
  const calendars = allCalendars.filter((calendar) => {
    if (input.myCalendar && calendar.owner_profile_id !== input.actorProfileId) return false;
    if (input.ownerId && calendar.owner_profile_id !== input.ownerId) return false;
    if (input.projectId && calendar.project_id !== input.projectId) return false;
    if (input.calendarId && calendar.id !== input.calendarId) return false;
    return true;
  });
  if (calendars.length === 0) return [];

  const projectCalendars = calendars.filter((calendar) => calendar.project_id);
  const projectIds = unique(projectCalendars.map((calendar) => calendar.project_id));
  const projectRows = await loadProjects(projectIds);
  const projectMap = new Map(projectRows.map((project) => [project.id, project]));
  const calendarByProject = new Map(
    projectCalendars
      .filter((calendar): calendar is AdminCalendarListItem & { project_id: string } => Boolean(calendar.project_id))
      .map((calendar) => [calendar.project_id, calendar]),
  );

  const events: AdminCalendarEvent[] = [];
  for (const project of projectRows) {
    const calendar = calendarByProject.get(project.id);
    if (!calendar) continue;
    events.push(...normalizeProjectCalendarEvents(project, calendar));
  }

  if (!input.eventType || input.eventType === "installation") {
    const installations = await loadInstallations(projectIds, input.start, input.end);
    for (const installation of installations) {
      const project = projectMap.get(installation.project_id);
      const calendar = calendarByProject.get(installation.project_id);
      if (!project || !calendar) continue;
      events.push(normalizeInstallationCalendarEvent({ installation, project, calendar }));
    }
  }

  if (!input.eventType || input.eventType === "google_external") {
    const importedCalendars = calendars.filter((calendar) => calendar.kind === "google_imported");
    const mirrorRows = await loadGoogleMirrors(importedCalendars.map((calendar) => calendar.id));
    const calendarMap = new Map(importedCalendars.map((calendar) => [calendar.id, calendar]));
    for (const mirror of mirrorRows) {
      const calendar = calendarMap.get(mirror.admin_calendar_id);
      if (!calendar) continue;
      const event = normalizeGoogleMirrorEvent(mirror, calendar);
      if (event) events.push(event);
    }
  }

  return events
    .filter((event) => (!input.eventType || event.source_type === input.eventType))
    .filter((event) => inRange(event, rangeStart, rangeEnd))
    .sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title));
}

export async function getAdminCalendarSnapshot(input: AdminCalendarEventQuery): Promise<AdminCalendarSnapshot> {
  const [calendars, owners, events] = await Promise.all([
    listAdminCalendars(),
    listCalendarOwnerOptions(),
    listAdminCalendarEvents(input),
  ]);

  const projects = calendars
    .filter((calendar): calendar is AdminCalendarListItem & { project_id: string } => Boolean(calendar.project_id))
    .map((calendar) => ({
      id: calendar.project_id,
      project_number: calendar.project_number || calendar.project_id,
      name: calendar.project_name || calendar.name,
    }))
    .sort((left, right) => left.project_number.localeCompare(right.project_number));

  return { calendars, owners, projects, events };
}
