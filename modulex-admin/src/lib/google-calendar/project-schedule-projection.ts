import "server-only";

import { createHash } from "node:crypto";
import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarProviderError,
  type GoogleCalendarEventInput,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar/google-calendar";
import { ensureProjectCalendar } from "@/lib/google-calendar/project-calendar";
import {
  getCalendarIntegrationSettings,
  getGoogleCredential,
  getProjectCalendarBinding,
  getProjectCalendarEventLink,
  upsertProjectCalendarEventLink,
  type ProjectCalendarEventSourceType,
} from "@/lib/google-calendar/repository";
import type { CalendarMutationResult } from "@/lib/google-calendar/types";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

type ProjectScheduleSource = {
  projectId: string;
  projectNumber: string;
  projectName: string;
  customerName: string;
  startDate: string | null;
  targetDate: string | null;
  plannedDeliveryDate: string | null;
};

type MilestoneDefinition = {
  sourceType: Extract<ProjectCalendarEventSourceType, "project_start" | "project_target" | "project_delivery">;
  label: string;
  date: string | null;
};

function normalizeProviderError(error: unknown) {
  if (!(error instanceof GoogleCalendarProviderError)) return "google_transient_failure";
  if (error.status === 404) return "event_missing";
  if (error.status === 429) return "google_rate_limited";
  if (error.status >= 500) return "google_transient_failure";
  if (error.status === 401 || error.status === 403) return "google_reconnect_required";
  return "google_transient_failure";
}

async function loadProjectSchedule(projectId: string): Promise<ProjectScheduleSource> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("customer_projects")
    .select("id,project_number,name,customer_id,start_date,target_date,planned_delivery_date")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("Project was not found.");

  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("name")
    .eq("id", project.customer_id)
    .single();
  if (customerError) throw new Error(customerError.message);

  return {
    projectId: String(project.id),
    projectNumber: String(project.project_number),
    projectName: String(project.name),
    customerName: String(customer.name),
    startDate: project.start_date ? String(project.start_date) : null,
    targetDate: project.target_date ? String(project.target_date) : null,
    plannedDeliveryDate: project.planned_delivery_date ? String(project.planned_delivery_date) : null,
  };
}

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function milestonePayload(source: ProjectScheduleSource, milestone: MilestoneDefinition): GoogleCalendarEventInput {
  if (!milestone.date) throw new Error("Project milestone date is required.");
  return {
    summary: `${milestone.label} — ${source.projectNumber} — ${source.customerName}`,
    description: `Modulex Project: ${source.projectNumber}\n${source.projectName}`,
    start: { date: milestone.date },
    end: { date: nextDate(milestone.date) },
  };
}

function fingerprint(payload: GoogleCalendarEventInput) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function syncMilestone(input: {
  source: ProjectScheduleSource;
  milestone: MilestoneDefinition;
  bindingId: string;
  providerCalendarId: string;
  accessToken: string;
}): Promise<CalendarMutationResult> {
  const existing = await getProjectCalendarEventLink({
    bindingId: input.bindingId,
    sourceType: input.milestone.sourceType,
    sourceId: input.source.projectId,
  });

  if (!input.milestone.date) {
    if (!existing) return { ok: true, status: "skipped" };
    try {
      await deleteGoogleCalendarEvent({
        accessToken: input.accessToken,
        calendarId: input.providerCalendarId,
        eventId: existing.provider_event_id,
      });
    } catch (error) {
      if (!(error instanceof GoogleCalendarProviderError) || error.status !== 404) {
        const errorCode = normalizeProviderError(error);
        await upsertProjectCalendarEventLink({
          projectId: input.source.projectId,
          bindingId: input.bindingId,
          sourceType: input.milestone.sourceType,
          sourceId: input.source.projectId,
          providerEventId: existing.provider_event_id,
          sourceFingerprint: existing.source_fingerprint,
          syncStatus: "error",
          lastErrorAt: new Date().toISOString(),
          lastErrorCode: errorCode,
        });
        return { ok: false, status: "error", error_code: errorCode };
      }
    }
    await upsertProjectCalendarEventLink({
      projectId: input.source.projectId,
      bindingId: input.bindingId,
      sourceType: input.milestone.sourceType,
      sourceId: input.source.projectId,
      providerEventId: existing.provider_event_id,
      sourceFingerprint: null,
      syncStatus: "cancelled",
      lastSyncedAt: new Date().toISOString(),
      lastErrorAt: null,
      lastErrorCode: null,
    });
    return { ok: true, status: "cancelled" };
  }

  const payload = milestonePayload(input.source, input.milestone);
  const sourceFingerprint = fingerprint(payload);
  if (existing?.source_fingerprint === sourceFingerprint && existing.sync_status === "synced") {
    return { ok: true, status: "synced" };
  }

  try {
    let event;
    if (existing) {
      try {
        event = await updateGoogleCalendarEvent({
          accessToken: input.accessToken,
          calendarId: input.providerCalendarId,
          eventId: existing.provider_event_id,
          event: payload,
        });
      } catch (error) {
        if (!(error instanceof GoogleCalendarProviderError) || error.status !== 404) throw error;
        event = await createGoogleCalendarEvent({
          accessToken: input.accessToken,
          calendarId: input.providerCalendarId,
          event: payload,
        });
      }
    } else {
      event = await createGoogleCalendarEvent({
        accessToken: input.accessToken,
        calendarId: input.providerCalendarId,
        event: payload,
      });
    }

    await upsertProjectCalendarEventLink({
      projectId: input.source.projectId,
      bindingId: input.bindingId,
      sourceType: input.milestone.sourceType,
      sourceId: input.source.projectId,
      providerEventId: event.id,
      sourceFingerprint,
      syncStatus: "synced",
      lastSyncedAt: new Date().toISOString(),
      lastErrorAt: null,
      lastErrorCode: null,
    });
    return { ok: true, status: "synced" };
  } catch (error) {
    const errorCode = normalizeProviderError(error);
    if (existing) {
      await upsertProjectCalendarEventLink({
        projectId: input.source.projectId,
        bindingId: input.bindingId,
        sourceType: input.milestone.sourceType,
        sourceId: input.source.projectId,
        providerEventId: existing.provider_event_id,
        sourceFingerprint,
        syncStatus: "error",
        lastErrorAt: new Date().toISOString(),
        lastErrorCode: errorCode,
      });
    }
    return { ok: false, status: "error", error_code: errorCode };
  }
}

export async function syncProjectScheduleToGoogle(
  projectId: string,
  actorId: string,
  requestUrl?: string,
) {
  const source = await loadProjectSchedule(projectId);
  const [settings, credential] = await Promise.all([
    getCalendarIntegrationSettings(),
    getGoogleCredential(),
  ]);
  if (!settings.enabled) return { total: 3, synced: 0, errors: 0, skipped: 3 };
  if (!credential || credential.status !== "connected") return { total: 3, synced: 0, errors: 3, skipped: 0 };

  let binding = await getProjectCalendarBinding(projectId);
  if (!binding) {
    if (!settings.auto_create_project_calendar) return { total: 3, synced: 0, errors: 0, skipped: 3 };
    binding = await ensureProjectCalendar(projectId, actorId, requestUrl);
  }
  if (!binding) throw new Error("Project Calendar binding could not be resolved.");
  const activeBinding = binding;
  if (!activeBinding.sync_enabled) return { total: 3, synced: 0, errors: 0, skipped: 3 };

  const milestones: MilestoneDefinition[] = [
    { sourceType: "project_start", label: "Project Start", date: source.startDate },
    { sourceType: "project_target", label: "Project Target", date: source.targetDate },
    { sourceType: "project_delivery", label: "Planned Delivery", date: source.plannedDeliveryDate },
  ];
  const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
  let synced = 0;
  let errors = 0;
  let skipped = 0;
  for (const milestone of milestones) {
    const result = await syncMilestone({
      source,
      milestone,
      bindingId: activeBinding.id,
      providerCalendarId: activeBinding.provider_calendar_id,
      accessToken,
    });
    if (!result.ok) errors += 1;
    else if (result.status === "skipped") skipped += 1;
    else synced += 1;
  }
  return { total: milestones.length, synced, errors, skipped };
}
