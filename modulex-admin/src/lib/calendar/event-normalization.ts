export type AdminCalendarEventType =
  | "project_start"
  | "project_target"
  | "project_delivery"
  | "installation"
  | "google_external";

export type AdminCalendarDescriptor = {
  id: string;
  name: string;
  kind: "project" | "google_imported";
  owner_profile_id: string;
  project_id: string | null;
  timezone: string;
  default_background_color: string | null;
  default_foreground_color: string | null;
};

export type AdminCalendarProjectRow = {
  id: string;
  project_number: string;
  customer_id: string;
  name: string;
  start_date: string | null;
  target_date: string | null;
  planned_delivery_date: string | null;
  primary_installation_id: string | null;
};

export type AdminCalendarInstallationRow = {
  id: string;
  project_id: string;
  customer_id: string;
  order_id: string;
  order_number: string;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  status: string;
};

export type GoogleCalendarMirrorRow = {
  id: string;
  admin_calendar_id: string;
  project_calendar_binding_id: string;
  provider_event_id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  all_day_start: string | null;
  all_day_end: string | null;
  status: string | null;
  provider_event_url: string | null;
  provider_color_id: string | null;
  provider_updated_at: string | null;
};

export type AdminCalendarEvent = {
  id: string;
  calendar_id: string;
  owner_profile_id: string;
  project_id: string | null;
  customer_id: string | null;
  source_type: AdminCalendarEventType;
  source_id: string;
  title: string;
  start: string;
  end: string | null;
  all_day: boolean;
  timezone: string;
  background_color: string | null;
  foreground_color: string | null;
  navigation_target: string | null;
  provider_event_url: string | null;
  provider_color_id: string | null;
  is_primary_installation: boolean;
  provider_backed: boolean;
};

const MODULEX_EVENT_COLORS: Record<Exclude<AdminCalendarEventType, "google_external">, string> = {
  project_start: "#465fff",
  project_target: "#f79009",
  project_delivery: "#12b76a",
  installation: "#7a5af8",
};

function eventBackground(calendar: AdminCalendarDescriptor, type: Exclude<AdminCalendarEventType, "google_external">) {
  return calendar.default_background_color || MODULEX_EVENT_COLORS[type];
}

function projectNavigation(projectId: string) {
  return `/projects/${projectId}?tab=Calendar`;
}

export function normalizeProjectCalendarEvents(
  project: AdminCalendarProjectRow,
  calendar: AdminCalendarDescriptor,
): AdminCalendarEvent[] {
  const base = {
    calendar_id: calendar.id,
    owner_profile_id: calendar.owner_profile_id,
    project_id: project.id,
    customer_id: project.customer_id,
    timezone: calendar.timezone,
    foreground_color: calendar.default_foreground_color,
    navigation_target: projectNavigation(project.id),
    provider_event_url: null,
    provider_color_id: null,
    is_primary_installation: false,
    provider_backed: false,
  } as const;
  const label = project.project_number || project.name;
  const events: AdminCalendarEvent[] = [];

  if (project.start_date) {
    events.push({
      ...base,
      id: `${calendar.id}:project_start:${project.id}`,
      source_type: "project_start",
      source_id: project.id,
      title: `Project Start — ${label}`,
      start: project.start_date,
      end: null,
      all_day: true,
      background_color: eventBackground(calendar, "project_start"),
    });
  }

  if (project.target_date) {
    events.push({
      ...base,
      id: `${calendar.id}:project_target:${project.id}`,
      source_type: "project_target",
      source_id: project.id,
      title: `Project Target — ${label}`,
      start: project.target_date,
      end: null,
      all_day: true,
      background_color: eventBackground(calendar, "project_target"),
    });
  }

  if (project.planned_delivery_date) {
    events.push({
      ...base,
      id: `${calendar.id}:project_delivery:${project.id}`,
      source_type: "project_delivery",
      source_id: project.id,
      title: `Planned Delivery — ${label}`,
      start: project.planned_delivery_date,
      end: null,
      all_day: true,
      background_color: eventBackground(calendar, "project_delivery"),
    });
  }

  return events;
}

export function normalizeInstallationCalendarEvent(input: {
  installation: AdminCalendarInstallationRow;
  project: AdminCalendarProjectRow;
  calendar: AdminCalendarDescriptor;
}): AdminCalendarEvent {
  const { installation, project, calendar } = input;
  const label = project.project_number || project.name;
  return {
    id: `${calendar.id}:installation:${installation.id}`,
    calendar_id: calendar.id,
    owner_profile_id: calendar.owner_profile_id,
    project_id: project.id,
    customer_id: installation.customer_id,
    source_type: "installation",
    source_id: installation.id,
    title: `Installation — ${label}`,
    start: installation.scheduled_start_at,
    end: installation.scheduled_end_at,
    all_day: false,
    timezone: calendar.timezone,
    background_color: eventBackground(calendar, "installation"),
    foreground_color: calendar.default_foreground_color,
    navigation_target: `/customers/${installation.customer_id}/orders/${installation.order_id}`,
    provider_event_url: null,
    provider_color_id: null,
    is_primary_installation: project.primary_installation_id === installation.id,
    provider_backed: false,
  };
}

export function normalizeGoogleMirrorEvent(
  mirror: GoogleCalendarMirrorRow,
  calendar: AdminCalendarDescriptor,
): AdminCalendarEvent | null {
  const start = mirror.all_day ? mirror.all_day_start : mirror.start_at;
  if (!start) return null;

  return {
    id: `${calendar.id}:google_external:${mirror.provider_event_id}`,
    calendar_id: calendar.id,
    owner_profile_id: calendar.owner_profile_id,
    project_id: calendar.project_id,
    customer_id: null,
    source_type: "google_external",
    source_id: mirror.id,
    title: mirror.title,
    start,
    end: mirror.all_day ? mirror.all_day_end : mirror.end_at,
    all_day: mirror.all_day,
    timezone: calendar.timezone,
    background_color: calendar.default_background_color,
    foreground_color: calendar.default_foreground_color,
    navigation_target: null,
    provider_event_url: mirror.provider_event_url,
    provider_color_id: mirror.provider_color_id,
    is_primary_installation: false,
    provider_backed: true,
  };
}
