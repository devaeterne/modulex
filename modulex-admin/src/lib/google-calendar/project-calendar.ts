import "server-only";

import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";
import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import {
  createGoogleProjectCalendar,
  renameGoogleProjectCalendar as renameProviderCalendar,
} from "@/lib/google-calendar/google-calendar";
import {
  getCalendarIntegrationSettings,
  getGeneralTimezone,
  getGoogleCredential,
  getProjectCalendarBinding,
  updateProjectCalendarBinding,
} from "@/lib/google-calendar/repository";
import { renderCalendarNameTemplate } from "@/lib/google-calendar/template";
import type { ProjectCalendarBindingDto } from "@/lib/google-calendar/types";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export class ProjectCalendarError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProjectCalendarError";
  }
}

type ProjectContext = {
  id: string;
  projectNumber: string;
  projectName: string;
  customerName: string;
};

async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("customer_projects")
    .select("id,project_number,name,customer_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new ProjectCalendarError("project_not_found", "Project was not found.");

  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("name")
    .eq("id", project.customer_id)
    .single();
  if (customerError) throw new Error(customerError.message);

  return {
    id: project.id,
    projectNumber: project.project_number,
    projectName: project.name,
    customerName: customer.name,
  };
}

function googleCalendarUrl(calendarId: string) {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
}

export async function getProjectCalendarStatus(projectId: string): Promise<ProjectCalendarBindingDto> {
  await loadProjectContext(projectId);
  const [settings, credential, binding] = await Promise.all([
    getCalendarIntegrationSettings(),
    getGoogleCredential(),
    getProjectCalendarBinding(projectId),
  ]);

  return {
    project_id: projectId,
    connected: credential?.status === "connected",
    integration_enabled: settings.enabled,
    sync_enabled: binding?.sync_enabled ?? true,
    provider_calendar_name: binding?.provider_calendar_name ?? null,
    provider_calendar_url: binding ? googleCalendarUrl(binding.provider_calendar_id) : null,
    timezone: binding?.timezone ?? settings.timezone_override ?? null,
    last_sync_at: binding?.last_sync_at ?? null,
    last_error_at: binding?.last_error_at ?? null,
    last_error_code: binding?.last_error_code ?? null,
  };
}

export async function ensureProjectCalendar(
  projectId: string,
  actorId: string,
  requestUrl?: string
) {
  const existing = await getProjectCalendarBinding(projectId);
  if (existing) return existing;

  if (!isGoogleCalendarConfigured()) {
    throw new ProjectCalendarError("google_not_configured", "Google Calendar OAuth application is not configured.");
  }

  const [settings, credential, project] = await Promise.all([
    getCalendarIntegrationSettings(),
    getGoogleCredential(),
    loadProjectContext(projectId),
  ]);
  if (!settings.enabled) {
    throw new ProjectCalendarError("integration_disabled", "Google Calendar synchronization is disabled.");
  }
  if (!credential || credential.status !== "connected") {
    throw new ProjectCalendarError("google_not_connected", "Google Calendar is not connected.");
  }

  const timezone = settings.timezone_override || await getGeneralTimezone();
  const calendarName = renderCalendarNameTemplate(settings.calendar_name_template, {
    project_no: project.projectNumber,
    project_name: project.projectName,
    customer_name: project.customerName,
  });
  const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
  const created = await createGoogleProjectCalendar({ accessToken, summary: calendarName, timeZone: timezone });

  const { data, error } = await supabaseAdmin
    .from("project_calendar_bindings")
    .insert({
      project_id: projectId,
      provider: "google",
      provider_calendar_id: created.id,
      provider_calendar_name: created.summary || calendarName,
      timezone: created.timeZone || timezone,
      sync_enabled: true,
      created_by: actorId,
      last_sync_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const winner = await getProjectCalendarBinding(projectId);
      if (winner) return winner;
    }
    throw new ProjectCalendarError("project_binding_mismatch", "Project Calendar binding could not be saved.");
  }

  return data;
}

export async function renameProjectCalendar(
  projectId: string,
  name: string,
  actorId: string,
  requestUrl?: string
) {
  void actorId;
  const normalized = name.trim();
  if (!normalized) throw new ProjectCalendarError("invalid_calendar_name", "Calendar name is required.");

  const binding = await getProjectCalendarBinding(projectId);
  if (!binding) throw new ProjectCalendarError("calendar_not_bound", "This Project does not have a Google Calendar yet.");
  if (!binding.sync_enabled) throw new ProjectCalendarError("project_sync_disabled", "Project Calendar synchronization is disabled.");

  const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
  const updated = await renameProviderCalendar({
    accessToken,
    calendarId: binding.provider_calendar_id,
    summary: normalized,
    timeZone: binding.timezone,
  });
  return updateProjectCalendarBinding(projectId, {
    provider_calendar_name: updated.summary || normalized,
    timezone: updated.timeZone || binding.timezone,
    last_sync_at: new Date().toISOString(),
    last_error_at: null,
    last_error_code: null,
  });
}

export async function setProjectCalendarSyncEnabled(projectId: string, enabled: boolean) {
  const binding = await getProjectCalendarBinding(projectId);
  if (!binding) throw new ProjectCalendarError("calendar_not_bound", "This Project does not have a Google Calendar yet.");
  return updateProjectCalendarBinding(projectId, { sync_enabled: enabled });
}

export async function resyncProjectCalendar(projectId: string, actorId: string, requestUrl?: string) {
  const binding = await ensureProjectCalendar(projectId, actorId, requestUrl);
  if (!binding.sync_enabled) {
    throw new ProjectCalendarError("project_sync_disabled", "Project Calendar synchronization is disabled.");
  }
  const { syncProjectInstallations } = await import("@/lib/google-calendar/installation-projection");
  const result = await syncProjectInstallations(projectId, actorId, requestUrl);
  await updateProjectCalendarBinding(projectId, {
    last_sync_at: new Date().toISOString(),
    last_error_at: null,
    last_error_code: null,
  });
  return result;
}
