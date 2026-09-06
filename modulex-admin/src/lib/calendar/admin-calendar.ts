import "server-only";

import { listCalendarEvents } from "@/lib/calendar/calendar-events";
import {
  normalizeGoogleMirrorEvent,
  normalizeInstallationCalendarEvent,
  normalizeLocalCalendarEvent,
  normalizeProjectCalendarEvents,
  type AdminCalendarDescriptor,
  type AdminCalendarEvent,
  type AdminCalendarEventType,
  type AdminCalendarInstallationRow,
  type AdminCalendarProjectRow,
  type GoogleCalendarMirrorRow,
  type LocalCalendarEventRow,
} from "@/lib/calendar/event-normalization";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

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
  binding_mode: "modulex_created" | "google_imported" | "company_shared" | null;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_mirror_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};

export type AdminCalendarOwnerOption = { id: string; label: string; email: string | null };
export type AdminCalendarProjectOption = { id: string; project_number: string; name: string };

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
  binding_mode: "modulex_created" | "google_imported" | "company_shared";
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_mirror_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};
type ProjectRecord = AdminCalendarProjectRow & { status: string };
type OrderRecord = { id: string; project_id: string; customer_id: string; order_number: string };
type SyncLinkRow = { source_type: string; source_id: string; sync_status: string; provider_deleted: boolean };
type OutboxRow = { source_type: string; source_id: string; status: string };

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
    .order("kind")
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

export async function listCalendarProjectOptions(): Promise<AdminCalendarProjectOption[]> {
  const { data, error } = await supabaseAdmin
    .from("customer_projects")
    .select("id,project_number,name,status")
    .neq("status", "cancelled")
    .order("project_number", { ascending: false });
  assertNoError(error, "Calendar Project options could not be loaded.");
  return (data ?? []).map((row) => ({ id: String(row.id), project_number: String(row.project_number), name: String(row.name) }));
}

export async function reassignAdminCalendarOwner(input: { calendarId: string; ownerProfileId: string; actorUserId: string }) {
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
  if (!calendars.length) return [];
  const ownerIds = unique(calendars.map((calendar) => calendar.owner_profile_id));
  const projectIds = unique(calendars.map((calendar) => calendar.project_id));
  const calendarIds = calendars.map((calendar) => calendar.id);
  const [ownersResult, projectsResult, bindingsResult] = await Promise.all([
    ownerIds.length ? supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ownerIds) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabaseAdmin.from("customer_projects").select("id,project_number,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("project_calendar_bindings")
      .select("id,admin_calendar_id,provider_calendar_name,provider_data_owner,provider_access_role,provider_background_color,provider_foreground_color,provider_color_id,binding_mode,sync_enabled,last_sync_at,last_mirror_sync_at,last_error_at,last_error_code")
      .in("admin_calendar_id", calendarIds),
  ]);
  assertNoError(ownersResult.error, "Calendar owners could not be loaded.");
  assertNoError(projectsResult.error, "Calendar Projects could not be loaded.");
  assertNoError(bindingsResult.error, "Calendar provider bindings could not be loaded.");
  const ownerMap = new Map((ownersResult.data ?? []).map((row) => [String(row.id), row]));
  const projectMap = new Map((projectsResult.data ?? []).map((row) => [String(row.id), row]));
  const bindingMap = new Map(((bindingsResult.data ?? []) as ProviderBindingRow[]).map((row) => [row.admin_calendar_id, row]));
  return calendars.map((calendar) => {
    const owner = ownerMap.get(calendar.owner_profile_id);
    const project = calendar.project_id ? projectMap.get(calendar.project_id) : null;
    const binding = bindingMap.get(calendar.id) ?? null;
    return {
      ...calendar,
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

async function loadProjects(projectId?: string | null): Promise<ProjectRecord[]> {
  let query = supabaseAdmin
    .from("customer_projects")
    .select("id,project_number,customer_id,name,sales_rep_id,start_date,target_date,planned_delivery_date,primary_installation_id,status")
    .neq("status", "cancelled");
  if (projectId) query = query.eq("id", projectId);
  const { data, error } = await query;
  assertNoError(error, "Calendar Project schedules could not be loaded.");
  return (data ?? []) as ProjectRecord[];
}

async function loadInstallations(projectIds: string[], start: string, end: string): Promise<AdminCalendarInstallationRow[]> {
  if (!projectIds.length) return [];
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from("customer_orders")
    .select("id,project_id,customer_id,order_number")
    .in("project_id", projectIds)
    .neq("status", "cancelled");
  assertNoError(ordersError, "Calendar Project Orders could not be loaded.");
  const orderRows = (orders ?? []) as OrderRecord[];
  if (!orderRows.length) return [];
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
  if (!calendarIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("google_calendar_event_mirror")
    .select("id,admin_calendar_id,project_calendar_binding_id,provider_event_id,title,start_at,end_at,all_day,all_day_start,all_day_end,status,provider_event_url,provider_color_id,provider_updated_at")
    .in("admin_calendar_id", calendarIds)
    .neq("status", "cancelled");
  assertNoError(error, "Imported Google Calendar events could not be loaded.");
  return (data ?? []) as GoogleCalendarMirrorRow[];
}

function sourceKey(event: AdminCalendarEvent) {
  const providerType = event.source_type === "google_special" ? "calendar_event" : event.source_type;
  return `${providerType}:${event.source_id}`;
}

async function decorateV3Sync(events: AdminCalendarEvent[], bindingId: string | null) {
  if (!bindingId || !events.length) return events;
  const ids = unique(events.filter((event) => event.source_type !== "google_external").map((event) => event.source_id));
  if (!ids.length) return events;
  const [linksResult, outboxResult] = await Promise.all([
    supabaseAdmin.from("calendar_provider_event_links").select("source_type,source_id,sync_status,provider_deleted").eq("provider_binding_id", bindingId).in("source_id", ids),
    supabaseAdmin.from("calendar_sync_outbox").select("source_type,source_id,status").eq("provider_binding_id", bindingId).in("source_id", ids),
  ]);
  assertNoError(linksResult.error, "Calendar provider sync state could not be loaded.");
  assertNoError(outboxResult.error, "Calendar pending sync state could not be loaded.");
  const links = new Map(((linksResult.data ?? []) as SyncLinkRow[]).map((row) => [`${row.source_type}:${row.source_id}`, row]));
  const outbox = new Map(((outboxResult.data ?? []) as OutboxRow[]).map((row) => [`${row.source_type}:${row.source_id}`, row]));
  return events.map((event) => {
    const key = sourceKey(event);
    const link = links.get(key);
    const pending = outbox.get(key);
    let syncStatus: AdminCalendarEvent["sync_status"] = event.sync_status;
    if (pending?.status === "error" || link?.sync_status === "error") syncStatus = "error";
    else if (link?.sync_status === "conflict") syncStatus = "conflict";
    else if (pending && ["pending", "retry", "processing"].includes(pending.status)) syncStatus = "pending";
    else if (link && !link.provider_deleted && link.sync_status === "synced") syncStatus = "synced";
    return { ...event, provider_backed: event.provider_backed || Boolean(link && !link.provider_deleted), sync_status: syncStatus };
  });
}

export async function listAdminCalendarEvents(input: AdminCalendarEventQuery): Promise<AdminCalendarEvent[]> {
  const rangeStart = new Date(input.start);
  const rangeEnd = new Date(input.end);
  if (Number.isNaN(rangeStart.valueOf()) || Number.isNaN(rangeEnd.valueOf()) || rangeStart >= rangeEnd) throw new Error("Calendar range is invalid.");
  const allCalendars = await listAdminCalendars();
  const selectedCalendars = input.calendarId ? allCalendars.filter((calendar) => calendar.id === input.calendarId) : allCalendars;
  if (!selectedCalendars.length) return [];
  const company = selectedCalendars.find((calendar) => calendar.kind === "company") ?? null;
  const events: AdminCalendarEvent[] = [];
  const businessTypes = new Set<AdminCalendarEventType>(["project_start", "project_target", "project_delivery", "installation"]);
  const needsBusiness = !input.eventType || businessTypes.has(input.eventType);

  if (needsBusiness) {
    if (company) {
      const projects = await loadProjects(input.projectId);
      const projectMap = new Map(projects.map((project) => [project.id, project]));
      for (const project of projects) events.push(...normalizeProjectCalendarEvents(project, company));
      if (!input.eventType || input.eventType === "installation") {
        const installations = await loadInstallations(projects.map((project) => project.id), input.start, input.end);
        for (const installation of installations) {
          const project = projectMap.get(installation.project_id);
          if (project) events.push(normalizeInstallationCalendarEvent({ installation, project, calendar: company }));
        }
      }
    } else {
      const projectCalendars = selectedCalendars.filter((calendar): calendar is AdminCalendarListItem & { project_id: string } => Boolean(calendar.project_id));
      const requested = input.projectId ? projectCalendars.filter((calendar) => calendar.project_id === input.projectId) : projectCalendars;
      const projectIds = requested.map((calendar) => calendar.project_id);
      const allProjects = await loadProjects();
      const projects = allProjects.filter((project) => projectIds.includes(project.id));
      const projectMap = new Map(projects.map((project) => [project.id, project]));
      const calendarMap = new Map(requested.map((calendar) => [calendar.project_id, calendar]));
      for (const project of projects) {
        const calendar = calendarMap.get(project.id);
        if (calendar) events.push(...normalizeProjectCalendarEvents(project, calendar));
      }
      if (!input.eventType || input.eventType === "installation") {
        const installations = await loadInstallations(projectIds, input.start, input.end);
        for (const installation of installations) {
          const project = projectMap.get(installation.project_id);
          const calendar = calendarMap.get(installation.project_id);
          if (project && calendar) events.push(normalizeInstallationCalendarEvent({ installation, project, calendar }));
        }
      }
    }
  }

  if (company && (!input.eventType || input.eventType === "calendar_event" || input.eventType === "google_special")) {
    const localRows = await listCalendarEvents({
      start: input.start,
      end: input.end,
      projectId: input.projectId,
      ownerProfileId: input.ownerId || (input.myCalendar ? input.actorProfileId : null),
    });
    for (const row of localRows as LocalCalendarEventRow[]) {
      const event = normalizeLocalCalendarEvent(row, company);
      if (event) events.push(event);
    }
  }

  if (!input.eventType || input.eventType === "google_external") {
    const imported = selectedCalendars.filter((calendar) => calendar.kind === "google_imported");
    const mirrors = await loadGoogleMirrors(imported.map((calendar) => calendar.id));
    const calendarMap = new Map(imported.map((calendar) => [calendar.id, calendar]));
    for (const mirror of mirrors) {
      const calendar = calendarMap.get(mirror.admin_calendar_id);
      const event = calendar ? normalizeGoogleMirrorEvent(mirror, calendar) : null;
      if (event) events.push(event);
    }
  }

  let filtered = events
    .filter((event) => !input.eventType || event.source_type === input.eventType)
    .filter((event) => !input.projectId || event.project_id === input.projectId)
    .filter((event) => !input.ownerId || event.responsible_profile_id === input.ownerId)
    .filter((event) => !input.myCalendar || event.responsible_profile_id === input.actorProfileId)
    .filter((event) => !input.calendarId || event.calendar_id === input.calendarId)
    .filter((event) => inRange(event, rangeStart, rangeEnd));
  filtered = await decorateV3Sync(filtered, company?.provider_binding_id ?? null);
  return filtered.sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title));
}

export async function getAdminCalendarSnapshot(input: AdminCalendarEventQuery): Promise<AdminCalendarSnapshot> {
  const [calendars, owners, projects, events] = await Promise.all([
    listAdminCalendars(),
    listCalendarOwnerOptions(),
    listCalendarProjectOptions(),
    listAdminCalendarEvents(input),
  ]);
  return { calendars, owners, projects, events };
}
