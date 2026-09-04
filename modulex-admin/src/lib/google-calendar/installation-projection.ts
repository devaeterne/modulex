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
} from "@/lib/google-calendar/repository";
import type { CalendarMutationResult } from "@/lib/google-calendar/types";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

type InstallationSource = {
  installationId: string;
  installationNumber: string;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string | null;
  addressSnapshot: Record<string, unknown> | null;
  projectId: string;
  projectNumber: string;
  customerName: string;
};

function normalizeProviderError(error: unknown) {
  if (!(error instanceof GoogleCalendarProviderError)) return "google_transient_failure";
  if (error.status === 404) return "event_missing";
  if (error.status === 429) return "google_rate_limited";
  if (error.status >= 500) return "google_transient_failure";
  if (error.status === 401 || error.status === 403) return "google_reconnect_required";
  return "google_transient_failure";
}

async function loadInstallationSource(installationId: string): Promise<InstallationSource> {
  const { data: installation, error: installationError } = await supabaseAdmin
    .from("customer_installations")
    .select("id,installation_number,order_id,status,scheduled_start_at,scheduled_end_at,address_snapshot")
    .eq("id", installationId)
    .maybeSingle();
  if (installationError) throw new Error(installationError.message);
  if (!installation) throw new Error("Installation was not found.");

  const { data: order, error: orderError } = await supabaseAdmin
    .from("customer_orders")
    .select("id,project_id,customer_id")
    .eq("id", installation.order_id)
    .single();
  if (orderError) throw new Error(orderError.message);
  if (!order.project_id) throw new Error("Installation Order is not assigned to a Project.");

  const [{ data: project, error: projectError }, { data: customer, error: customerError }] = await Promise.all([
    supabaseAdmin.from("customer_projects").select("id,project_number,customer_id").eq("id", order.project_id).single(),
    supabaseAdmin.from("customers").select("id,name").eq("id", order.customer_id).single(),
  ]);
  if (projectError) throw new Error(projectError.message);
  if (customerError) throw new Error(customerError.message);
  if (project.customer_id !== customer.id) throw new Error("Project and Installation customer do not match.");

  return {
    installationId: installation.id,
    installationNumber: installation.installation_number,
    status: installation.status,
    scheduledStartAt: installation.scheduled_start_at,
    scheduledEndAt: installation.scheduled_end_at,
    addressSnapshot: installation.address_snapshot as Record<string, unknown> | null,
    projectId: project.id,
    projectNumber: project.project_number,
    customerName: customer.name,
  };
}

function addressString(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return undefined;
  const parts = [
    snapshot.address_line_1,
    snapshot.address_line_2,
    snapshot.city,
    snapshot.state_region,
    snapshot.postal_code,
    snapshot.country_code,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return parts.length ? parts.join(", ") : undefined;
}

function eventPayload(source: InstallationSource, timezone: string): GoogleCalendarEventInput {
  const start = new Date(source.scheduledStartAt);
  const end = source.scheduledEndAt
    ? new Date(source.scheduledEndAt)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return {
    summary: `Installation — ${source.projectNumber} — ${source.customerName}`,
    description: `Modulex Project: ${source.projectNumber}\nInstallation: ${source.installationNumber}`,
    location: addressString(source.addressSnapshot),
    start: { dateTime: start.toISOString(), timeZone: timezone },
    end: { dateTime: end.toISOString(), timeZone: timezone },
  };
}

function fingerprint(payload: GoogleCalendarEventInput) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function resolveInstallationProjectId(installationId: string) {
  return (await loadInstallationSource(installationId)).projectId;
}

export async function syncInstallationToGoogle(
  installationId: string,
  actorId: string,
  requestUrl?: string
): Promise<CalendarMutationResult> {
  const source = await loadInstallationSource(installationId);
  const [settings, credential] = await Promise.all([
    getCalendarIntegrationSettings(),
    getGoogleCredential(),
  ]);

  if (!settings.enabled || !settings.sync_installations) {
    return { ok: true, status: "skipped", error_code: "integration_disabled" };
  }
  if (!credential || credential.status !== "connected") {
    return { ok: false, status: "error", error_code: "google_not_connected" };
  }

  let binding = await getProjectCalendarBinding(source.projectId);
  if (!binding) {
    if (!settings.auto_create_project_calendar) {
      return { ok: false, status: "skipped", error_code: "calendar_not_bound" };
    }
    binding = await ensureProjectCalendar(source.projectId, actorId, requestUrl);
  }
  if (!binding) {
    return { ok: false, status: "error", error_code: "project_binding_mismatch" };
  }
  if (!binding.sync_enabled) return { ok: true, status: "skipped", error_code: "project_sync_disabled" };

  const existing = await getProjectCalendarEventLink({
    bindingId: binding.id,
    sourceType: "installation",
    sourceId: installationId,
  });
  const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);

  if (source.status === "cancelled") {
    if (!existing) return { ok: true, status: "cancelled" };
    try {
      await deleteGoogleCalendarEvent({
        accessToken,
        calendarId: binding.provider_calendar_id,
        eventId: existing.provider_event_id,
      });
    } catch (error) {
      if (!(error instanceof GoogleCalendarProviderError) || error.status !== 404) {
        const errorCode = normalizeProviderError(error);
        await upsertProjectCalendarEventLink({
          projectId: source.projectId,
          bindingId: binding.id,
          sourceType: "installation",
          sourceId: installationId,
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
      projectId: source.projectId,
      bindingId: binding.id,
      sourceType: "installation",
      sourceId: installationId,
      providerEventId: existing.provider_event_id,
      sourceFingerprint: existing.source_fingerprint,
      syncStatus: "cancelled",
      lastSyncedAt: new Date().toISOString(),
      lastErrorAt: null,
      lastErrorCode: null,
    });
    return { ok: true, status: "cancelled" };
  }

  const payload = eventPayload(source, binding.timezone);
  const sourceFingerprint = fingerprint(payload);
  if (existing?.source_fingerprint === sourceFingerprint && existing.sync_status === "synced") {
    return { ok: true, status: "synced" };
  }

  try {
    let event;
    if (existing) {
      try {
        event = await updateGoogleCalendarEvent({
          accessToken,
          calendarId: binding.provider_calendar_id,
          eventId: existing.provider_event_id,
          event: payload,
        });
      } catch (error) {
        if (!(error instanceof GoogleCalendarProviderError) || error.status !== 404) throw error;
        event = await createGoogleCalendarEvent({ accessToken, calendarId: binding.provider_calendar_id, event: payload });
      }
    } else {
      event = await createGoogleCalendarEvent({ accessToken, calendarId: binding.provider_calendar_id, event: payload });
    }

    await upsertProjectCalendarEventLink({
      projectId: source.projectId,
      bindingId: binding.id,
      sourceType: "installation",
      sourceId: installationId,
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
        projectId: source.projectId,
        bindingId: binding.id,
        sourceType: "installation",
        sourceId: installationId,
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

export async function syncProjectInstallations(projectId: string, actorId: string, requestUrl?: string) {
  const { data: orders, error: orderError } = await supabaseAdmin
    .from("customer_orders")
    .select("id")
    .eq("project_id", projectId);
  if (orderError) throw new Error(orderError.message);
  const orderIds = (orders ?? []).map((row) => row.id);
  if (!orderIds.length) return { total: 0, synced: 0, errors: 0 };

  const { data: installations, error: installationError } = await supabaseAdmin
    .from("customer_installations")
    .select("id")
    .in("order_id", orderIds);
  if (installationError) throw new Error(installationError.message);

  let synced = 0;
  let errors = 0;
  for (const installation of installations ?? []) {
    const result = await syncInstallationToGoogle(installation.id, actorId, requestUrl);
    if (result.ok) synced += 1;
    else errors += 1;
  }
  return { total: installations?.length ?? 0, synced, errors };
}
