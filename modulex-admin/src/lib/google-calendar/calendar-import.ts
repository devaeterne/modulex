import "server-only";

import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import { hasGoogleCalendarImportScopes } from "@/lib/google-calendar/config";
import {
  GoogleCalendarProviderError,
  listGoogleCalendarEvents,
  listGoogleCalendars,
  type GoogleCalendarEventResource,
} from "@/lib/google-calendar/google-calendar";
import {
  applyGoogleCalendarMirrorDelta,
  createImportedGoogleCalendar,
  getCalendarBindingById,
  listImportedProviderCalendarIds,
  markGoogleMirrorSyncError,
  replaceGoogleCalendarMirrorSnapshot,
  updateImportedCalendarProviderMetadata,
  type GoogleCalendarMirrorMutation,
  type ProjectCalendarBindingRow,
} from "@/lib/google-calendar/repository";
import type { GoogleCalendarDiscoveryItem } from "@/lib/google-calendar/types";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const FULL_SYNC_LOOKBACK_DAYS = 180;
const FULL_SYNC_LOOKAHEAD_DAYS = 730;

export class GoogleCalendarImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "GoogleCalendarImportError";
  }
}

function boundedFullSyncRange(now = new Date()) {
  const min = new Date(now);
  min.setUTCDate(min.getUTCDate() - FULL_SYNC_LOOKBACK_DAYS);
  const max = new Date(now);
  max.setUTCDate(max.getUTCDate() + FULL_SYNC_LOOKAHEAD_DAYS);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

function providerErrorCode(error: unknown) {
  if (error instanceof GoogleCalendarProviderError) return error.code;
  if (error instanceof GoogleCalendarImportError) return error.code;
  return "google_calendar_import_failed";
}

function normalizeGoogleEvent(event: GoogleCalendarEventResource): GoogleCalendarMirrorMutation | null {
  if (!event.id) return null;
  const allDay = Boolean(event.start?.date);
  const timedStart = event.start?.dateTime ?? null;
  const allDayStart = event.start?.date ?? null;
  if (!timedStart && !allDayStart && event.status !== "cancelled") return null;

  return {
    providerEventId: event.id,
    title: event.summary?.trim() || "(Untitled Google event)",
    startAt: allDay ? null : timedStart,
    endAt: allDay ? null : event.end?.dateTime ?? null,
    allDay,
    allDayStart,
    allDayEnd: allDay ? event.end?.date ?? null : null,
    status: event.status ?? null,
    providerEventUrl: event.htmlLink ?? null,
    providerColorId: event.colorId ?? null,
    providerUpdatedAt: event.updated ?? null,
    providerEtag: event.etag ?? null,
  };
}

async function requireImportAccess(requestUrl?: string) {
  const access = await getConnectedGoogleAccessToken(requestUrl);
  if (!hasGoogleCalendarImportScopes(access.grantedScopes)) {
    throw new GoogleCalendarImportError(
      "reconnect_required",
      "Reconnect Google Calendar to grant Calendar discovery and owned-event scopes.",
      409,
    );
  }
  return access;
}

export async function discoverGoogleCalendars(requestUrl?: string): Promise<GoogleCalendarDiscoveryItem[]> {
  const access = await requireImportAccess(requestUrl);
  const [providerCalendars, importedIds] = await Promise.all([
    listGoogleCalendars({ accessToken: access.accessToken }),
    listImportedProviderCalendarIds(),
  ]);
  const imported = new Set(importedIds);

  return providerCalendars
    .map((calendar) => ({
      provider_calendar_id: calendar.id,
      provider_calendar_name: calendar.summary?.trim() || "Untitled Google Calendar",
      timezone: calendar.timeZone?.trim() || "UTC",
      data_owner: calendar.dataOwner?.trim() || null,
      access_role: calendar.accessRole?.trim() || "none",
      background_color: calendar.backgroundColor?.trim() || null,
      foreground_color: calendar.foregroundColor?.trim() || null,
      color_id: calendar.colorId?.trim() || null,
      primary: calendar.primary === true,
      selected: calendar.selected === true,
      already_imported: imported.has(calendar.id),
      write_eligible: calendar.accessRole === "owner",
    } satisfies GoogleCalendarDiscoveryItem))
    .sort((left, right) => Number(right.primary) - Number(left.primary) || left.provider_calendar_name.localeCompare(right.provider_calendar_name));
}

async function assertActiveOwner(ownerProfileId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", ownerProfileId)
    .maybeSingle();
  if (error) throw new GoogleCalendarImportError("owner_lookup_failed", "Calendar owner could not be validated.", 500);
  if (!data?.is_active) {
    throw new GoogleCalendarImportError("invalid_owner", "Calendar owner must be an active Modulex user.", 400);
  }
}

async function fullMirrorSync(binding: ProjectCalendarBindingRow, accessToken: string) {
  const range = boundedFullSyncRange();
  const page = await listGoogleCalendarEvents({
    accessToken,
    calendarId: binding.provider_calendar_id,
    timeMin: range.timeMin,
    timeMax: range.timeMax,
  });
  const events = page.items.flatMap((event) => {
    const normalized = normalizeGoogleEvent(event);
    return normalized ? [normalized] : [];
  });
  await replaceGoogleCalendarMirrorSnapshot({ binding, events, syncToken: page.nextSyncToken });
  return { mirrored: events.filter((event) => event.status !== "cancelled").length, mode: "full" as const };
}

export async function syncImportedGoogleCalendar(bindingId: string, requestUrl?: string) {
  const binding = await getCalendarBindingById(bindingId);
  if (!binding || binding.binding_mode !== "google_imported") {
    throw new GoogleCalendarImportError("import_not_found", "Imported Google Calendar was not found.", 404);
  }

  const access = await requireImportAccess(requestUrl);
  try {
    const providerCalendars = await listGoogleCalendars({ accessToken: access.accessToken });
    const providerCalendar = providerCalendars.find((calendar) => calendar.id === binding.provider_calendar_id);
    if (!providerCalendar) {
      await markGoogleMirrorSyncError(binding.id, "provider_calendar_not_found");
      throw new GoogleCalendarImportError("provider_calendar_not_found", "Google Calendar is no longer available to the connected account.", 409);
    }

    const accessRole = providerCalendar.accessRole?.trim() || "none";
    await updateImportedCalendarProviderMetadata({
      bindingId: binding.id,
      name: providerCalendar.summary?.trim() || binding.provider_calendar_name,
      timezone: providerCalendar.timeZone?.trim() || binding.timezone,
      dataOwner: providerCalendar.dataOwner?.trim() || null,
      accessRole,
      backgroundColor: providerCalendar.backgroundColor?.trim() || null,
      foregroundColor: providerCalendar.foregroundColor?.trim() || null,
      colorId: providerCalendar.colorId?.trim() || null,
    });

    if (accessRole !== "owner") {
      await markGoogleMirrorSyncError(binding.id, "provider_access_downgraded");
      throw new GoogleCalendarImportError(
        "provider_access_downgraded",
        "The connected Google account is no longer an owner of this Calendar, so V1 mirror/write access is disabled.",
        409,
      );
    }

    const refreshed = await getCalendarBindingById(binding.id);
    if (!refreshed) throw new GoogleCalendarImportError("import_not_found", "Imported Google Calendar was not found.", 404);

    if (!refreshed.provider_sync_token) {
      return await fullMirrorSync(refreshed, access.accessToken);
    }

    try {
      const page = await listGoogleCalendarEvents({
        accessToken: access.accessToken,
        calendarId: refreshed.provider_calendar_id,
        syncToken: refreshed.provider_sync_token,
      });
      const events = page.items.flatMap((event) => {
        const normalized = normalizeGoogleEvent(event);
        return normalized ? [normalized] : [];
      });
      await applyGoogleCalendarMirrorDelta({ binding: refreshed, events, syncToken: page.nextSyncToken });
      return { mirrored: events.length, mode: "incremental" as const };
    } catch (error) {
      if (!(error instanceof GoogleCalendarProviderError) || error.status !== 410) throw error;
      return await fullMirrorSync(refreshed, access.accessToken);
    }
  } catch (error) {
    if (!(error instanceof GoogleCalendarImportError)) {
      await markGoogleMirrorSyncError(binding.id, providerErrorCode(error));
    }
    throw error;
  }
}

export async function importGoogleCalendar(input: {
  providerCalendarId: string;
  ownerProfileId: string;
  actorUserId: string;
  requestUrl?: string;
}) {
  await assertActiveOwner(input.ownerProfileId);
  const discovery = await discoverGoogleCalendars(input.requestUrl);
  const candidate = discovery.find((calendar) => calendar.provider_calendar_id === input.providerCalendarId);
  if (!candidate) {
    throw new GoogleCalendarImportError("provider_calendar_not_found", "Google Calendar is not available to the connected account.", 404);
  }
  if (!candidate.write_eligible || candidate.access_role !== "owner") {
    throw new GoogleCalendarImportError(
      "provider_owner_required",
      "This Calendar is visible, but the connected Google account must have owner access for V1 import.",
      409,
    );
  }

  const binding = await createImportedGoogleCalendar({
    providerCalendarId: candidate.provider_calendar_id,
    providerCalendarName: candidate.provider_calendar_name,
    timezone: candidate.timezone,
    providerDataOwner: candidate.data_owner,
    providerAccessRole: candidate.access_role,
    providerBackgroundColor: candidate.background_color,
    providerForegroundColor: candidate.foreground_color,
    providerColorId: candidate.color_id,
    ownerProfileId: input.ownerProfileId,
    actorUserId: input.actorUserId,
  });

  try {
    const sync = await syncImportedGoogleCalendar(binding.id, input.requestUrl);
    return { binding, sync, sync_error_code: null as string | null };
  } catch (error) {
    const code = providerErrorCode(error);
    await markGoogleMirrorSyncError(binding.id, code);
    return { binding, sync: null, sync_error_code: code };
  }
}
