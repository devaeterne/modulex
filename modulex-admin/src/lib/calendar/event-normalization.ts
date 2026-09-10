export type AdminCalendarEventType =
  | "project_start"
  | "project_target"
  | "project_delivery"
  | "installation"
  | "calendar_event"
  | "google_special"
  | "google_external";

export type AdminCalendarDescriptor = {
  id: string;
  name: string;
  kind: "project" | "google_imported" | "company";
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
  sales_rep_id: string | null;
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
  owner_profile_id?: string | null;
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

export type LocalCalendarEventRow = {
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
  recurrence: unknown[];
  attendees: unknown[];
  reminders: Record<string, unknown> | null;
  conference_data: Record<string, unknown> | null;
  visibility: string | null;
  transparency: string | null;
  provider_event_type: string;
  provider_html_link: string | null;
};

export type AdminCalendarEvent = {
  id: string;
  calendar_id: string;
  owner_profile_id: string;
  responsible_profile_id: string;
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
  provider_event_type: string | null;
  is_primary_installation: boolean;
  provider_backed: boolean;
  editable: boolean;
  deletable: boolean;
  sync_status: "local" | "synced" | "pending" | "error" | "conflict";
  description?: string | null;
  location?: string | null;
  recurrence?: unknown[];
  attendees?: unknown[];
  reminders?: Record<string, unknown> | null;
  conference_data?: Record<string, unknown> | null;
  visibility?: string | null;
  transparency?: string | null;
};

export type GoogleCalendarEventColor = { background?: string; foreground?: string };
export type GoogleCalendarEventColorPalette = Record<string, GoogleCalendarEventColor>;

export function resolveGoogleCalendarEventColors(input: {
  providerColorId: string | null;
  calendar: AdminCalendarDescriptor;
  palette: GoogleCalendarEventColorPalette;
}) {
  const providerColor = input.providerColorId ? input.palette[input.providerColorId] : undefined;
  return {
    backgroundColor: providerColor?.background || input.calendar.default_background_color,
    foregroundColor: providerColor?.foreground || input.calendar.default_foreground_color,
  };
}

type BusinessCalendarEventType = "project_start" | "project_target" | "project_delivery" | "installation";

const MODULEX_EVENT_COLORS: Record<BusinessCalendarEventType, string> = {
  project_start: "#465fff",
  project_target: "#f79009",
  project_delivery: "#12b76a",
  installation: "#7a5af8",
};

function eventBackground(calendar: AdminCalendarDescriptor, type: BusinessCalendarEventType) {
  return calendar.default_background_color || MODULEX_EVENT_COLORS[type];
}

function projectNavigation(projectId: string) {
  return `/projects/${projectId}?tab=Calendar`;
}

export function normalizeProjectCalendarEvents(
  project: AdminCalendarProjectRow,
  calendar: AdminCalendarDescriptor,
): AdminCalendarEvent[] {
  const responsible = project.sales_rep_id || calendar.owner_profile_id;
  const base = {
    calendar_id: calendar.id,
    owner_profile_id: responsible,
    responsible_profile_id: responsible,
    project_id: project.id,
    customer_id: project.customer_id,
    timezone: calendar.timezone,
    foreground_color: calendar.default_foreground_color,
    navigation_target: projectNavigation(project.id),
    provider_event_url: null,
    provider_color_id: null,
    provider_event_type: "default",
    is_primary_installation: false,
    provider_backed: false,
    editable: true,
    deletable: true,
    sync_status: "local" as const,
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
  const responsible = installation.owner_profile_id || project.sales_rep_id || calendar.owner_profile_id;
  return {
    id: `${calendar.id}:installation:${installation.id}`,
    calendar_id: calendar.id,
    owner_profile_id: responsible,
    responsible_profile_id: responsible,
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
    provider_event_type: "default",
    is_primary_installation: project.primary_installation_id === installation.id,
    provider_backed: false,
    editable: true,
    deletable: true,
    sync_status: "local",
  };
}

export function normalizeLocalCalendarEvent(
  row: LocalCalendarEventRow,
  calendar: AdminCalendarDescriptor,
  syncStatus: AdminCalendarEvent["sync_status"] = "local",
  providerColors: GoogleCalendarEventColorPalette = {},
): AdminCalendarEvent | null {
  const start = row.all_day ? row.all_day_start : row.start_at;
  if (!start) return null;
  const isDefault = row.provider_event_type === "default";
  const colors = resolveGoogleCalendarEventColors({ providerColorId: row.provider_color_id, calendar, palette: providerColors });
  return {
    id: `${calendar.id}:${isDefault ? "calendar_event" : "google_special"}:${row.id}`,
    calendar_id: calendar.id,
    owner_profile_id: row.owner_profile_id,
    responsible_profile_id: row.owner_profile_id,
    project_id: row.project_id,
    customer_id: null,
    source_type: isDefault ? "calendar_event" : "google_special",
    source_id: row.id,
    title: row.title,
    start,
    end: row.all_day ? row.all_day_end : row.end_at,
    all_day: row.all_day,
    timezone: row.timezone || calendar.timezone,
    background_color: colors.backgroundColor,
    foreground_color: colors.foregroundColor,
    navigation_target: row.project_id ? projectNavigation(row.project_id) : null,
    provider_event_url: row.provider_html_link,
    provider_color_id: row.provider_color_id,
    provider_event_type: row.provider_event_type,
    is_primary_installation: false,
    provider_backed: Boolean(row.provider_html_link),
    editable: isDefault,
    deletable: isDefault,
    sync_status: syncStatus,
    description: row.description,
    location: row.location,
    recurrence: row.recurrence,
    attendees: row.attendees,
    reminders: row.reminders,
    conference_data: row.conference_data,
    visibility: row.visibility,
    transparency: row.transparency,
  };
}

export function normalizeGoogleMirrorEvent(
  mirror: GoogleCalendarMirrorRow,
  calendar: AdminCalendarDescriptor,
  providerColors: GoogleCalendarEventColorPalette = {},
): AdminCalendarEvent | null {
  const start = mirror.all_day ? mirror.all_day_start : mirror.start_at;
  if (!start) return null;
  const colors = resolveGoogleCalendarEventColors({ providerColorId: mirror.provider_color_id, calendar, palette: providerColors });

  return {
    id: `${calendar.id}:google_external:${mirror.provider_event_id}`,
    calendar_id: calendar.id,
    owner_profile_id: calendar.owner_profile_id,
    responsible_profile_id: calendar.owner_profile_id,
    project_id: calendar.project_id,
    customer_id: null,
    source_type: "google_external",
    source_id: mirror.id,
    title: mirror.title,
    start,
    end: mirror.all_day ? mirror.all_day_end : mirror.end_at,
    all_day: mirror.all_day,
    timezone: calendar.timezone,
    background_color: colors.backgroundColor,
    foreground_color: colors.foregroundColor,
    navigation_target: null,
    provider_event_url: mirror.provider_event_url,
    provider_color_id: mirror.provider_color_id,
    provider_event_type: "default",
    is_primary_installation: false,
    provider_backed: true,
    editable: false,
    deletable: false,
    sync_status: "synced",
  };
}
