import "server-only";

import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarEvent,
  GoogleCalendarProviderError,
  listGoogleCalendarEvents,
  patchGoogleCalendarEvent,
  type GoogleCalendarEventResource,
} from "@/lib/google-calendar/google-calendar";
import {
  buildGoogleEventForSource,
  googleEventFingerprint,
  googleOriginalStartKey,
  isEditableGoogleDefaultEvent,
} from "@/lib/google-calendar/event-mapping";
import { applyGoogleEventReplica } from "@/lib/google-calendar/provider-event-replica";
import {
  claimCalendarSyncBatch,
  enqueueCalendarSync,
  getCompanyCalendarBinding,
  getProviderEventLinkByProviderEventId,
  getProviderEventLinkBySource,
  insertCalendarSyncAudit,
  markCalendarSyncFailure,
  markCalendarSyncSuccess,
  updateCompanyBindingSync,
  upsertProviderEventLink,
  type CalendarSyncOutboxItem,
  type V3SourceType,
} from "@/lib/google-calendar/v3-repository";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export type SyncResult = { processed: number; created: number; updated: number; deleted: number; conflicts: number; errors: number; mode?: "full" | "incremental" };
export type BatchResult = SyncResult & { attempted: number };

function blankResult(): SyncResult {
  return { processed: 0, created: 0, updated: 0, deleted: 0, conflicts: 0, errors: 0 };
}

function providerErrorCode(error: unknown) {
  if (error instanceof GoogleCalendarProviderError) return error.code;
  return error instanceof Error && error.message ? error.message.slice(0, 120) : "calendar_sync_failed";
}

async function getOutboxItem(itemId: string): Promise<CalendarSyncOutboxItem | null> {
  const { data, error } = await supabaseAdmin.from("calendar_sync_outbox").select("*").eq("id", itemId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CalendarSyncOutboxItem | null;
}

export async function flushCalendarOutboxItem(itemId: string, requestUrl?: string): Promise<SyncResult> {
  const item = await getOutboxItem(itemId);
  if (!item) return blankResult();
  const binding = await getCompanyCalendarBinding();
  if (!binding || binding.id !== item.provider_binding_id || !binding.sync_enabled) {
    await markCalendarSyncFailure(item, "company_calendar_not_active");
    return { ...blankResult(), processed: 1, errors: 1 };
  }

  try {
    const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
    const source = await buildGoogleEventForSource(item.source_type, item.source_id);
    const link = await getProviderEventLinkBySource({ bindingId: binding.id, sourceType: item.source_type, sourceId: item.source_id, occurrenceKey: item.occurrence_key });

    if (source.deleted || item.operation === "delete") {
      if (link && !link.provider_deleted) {
        try {
          await deleteGoogleCalendarEvent({ accessToken, calendarId: binding.provider_calendar_id, eventId: link.provider_event_id, sendUpdates: item.source_type === "calendar_event" ? "all" : "none" });
        } catch (error) {
          if (!(error instanceof GoogleCalendarProviderError) || error.status !== 404) throw error;
        }
        await upsertProviderEventLink({
          bindingId: binding.id, sourceType: item.source_type, sourceId: item.source_id, projectId: source.projectId ?? item.project_id,
          occurrenceKey: item.occurrence_key, providerEventId: link.provider_event_id, providerEtag: link.provider_etag,
          providerUpdatedAt: link.provider_updated_at, providerFingerprint: link.provider_fingerprint, providerObservedAt: new Date().toISOString(),
          modulexFingerprint: source.fingerprint, lastSyncOrigin: "modulex", syncStatus: "deleted", providerDeleted: true,
        });
      }
      await markCalendarSyncSuccess(item.id);
      await insertCalendarSyncAudit({ bindingId: binding.id, sourceType: item.source_type, sourceId: item.source_id, projectId: source.projectId ?? item.project_id, providerEventId: link?.provider_event_id, direction: "modulex_to_google", action: "delete", resolution: "applied" });
      return { ...blankResult(), processed: 1, deleted: link ? 1 : 0 };
    }

    if (!source.event || !source.fingerprint) throw new Error("Calendar source cannot be projected.");

    // Google-origin replica writes can fire the local outbox trigger. If the resulting
    // Modulex representation still matches the state recorded during that provider apply,
    // consume the echo without another provider call.
    if (link?.last_sync_origin === "google" && link.modulex_fingerprint === source.fingerprint) {
      await markCalendarSyncSuccess(item.id);
      return { ...blankResult(), processed: 1 };
    }

    let providerEvent: GoogleCalendarEventResource;
    let created = false;
    if (link && !link.provider_deleted) {
      try {
        providerEvent = await patchGoogleCalendarEvent({
          accessToken,
          calendarId: binding.provider_calendar_id,
          eventId: link.provider_event_id,
          event: source.event,
          sendUpdates: source.sendUpdates,
          conferenceDataVersion: source.conferenceDataVersion,
        });
      } catch (error) {
        if (!(error instanceof GoogleCalendarProviderError) || error.status !== 404) throw error;
        providerEvent = await createGoogleCalendarEvent({ accessToken, calendarId: binding.provider_calendar_id, event: source.event, sendUpdates: source.sendUpdates, conferenceDataVersion: source.conferenceDataVersion });
        created = true;
      }
    } else {
      providerEvent = await createGoogleCalendarEvent({ accessToken, calendarId: binding.provider_calendar_id, event: source.event, sendUpdates: source.sendUpdates, conferenceDataVersion: source.conferenceDataVersion });
      created = true;
    }

    await upsertProviderEventLink({
      bindingId: binding.id,
      sourceType: item.source_type,
      sourceId: item.source_id,
      projectId: source.projectId,
      occurrenceKey: item.occurrence_key,
      providerEventId: providerEvent.id,
      providerRecurringEventId: providerEvent.recurringEventId ?? null,
      providerOriginalStartKey: googleOriginalStartKey(providerEvent) || null,
      providerEtag: providerEvent.etag ?? null,
      providerUpdatedAt: providerEvent.updated ?? null,
      providerFingerprint: googleEventFingerprint(providerEvent),
      providerObservedAt: new Date().toISOString(),
      modulexFingerprint: source.fingerprint,
      lastSyncOrigin: "modulex",
      syncStatus: "synced",
      providerDeleted: false,
    });
    await markCalendarSyncSuccess(item.id);
    await insertCalendarSyncAudit({ bindingId: binding.id, sourceType: item.source_type, sourceId: item.source_id, projectId: source.projectId, providerEventId: providerEvent.id, direction: "modulex_to_google", action: created ? "create" : "update", resolution: "applied" });
    return { ...blankResult(), processed: 1, created: created ? 1 : 0, updated: created ? 0 : 1 };
  } catch (error) {
    await markCalendarSyncFailure(item, providerErrorCode(error));
    return { ...blankResult(), processed: 1, errors: 1 };
  }
}

export async function flushCalendarOutboxBatch(limit = 25, requestUrl?: string): Promise<BatchResult> {
  const items = await claimCalendarSyncBatch(limit);
  const total: BatchResult = { ...blankResult(), attempted: items.length };
  for (const item of items) {
    const result = await flushCalendarOutboxItem(item.id, requestUrl);
    total.processed += result.processed;
    total.created += result.created;
    total.updated += result.updated;
    total.deleted += result.deleted;
    total.conflicts += result.conflicts;
    total.errors += result.errors;
  }
  return total;
}

async function updateBusinessExtensionFromGoogle(link: NonNullable<Awaited<ReturnType<typeof getProviderEventLinkByProviderEventId>>>, event: GoogleCalendarEventResource) {
  const values = {
    admin_calendar_id: (await getCompanyCalendarBinding())!.admin_calendar_id,
    project_id: link.project_id,
    source_type: link.source_type,
    source_id: link.source_id,
    title_override: event.summary?.trim() || null,
    description: event.description ?? null,
    location: event.location ?? null,
    provider_color_id: event.colorId ?? null,
    attendees: event.attendees ?? [],
    guests_can_invite_others: event.guestsCanInviteOthers ?? null,
    guests_can_modify: event.guestsCanModify ?? null,
    guests_can_see_other_guests: event.guestsCanSeeOtherGuests ?? null,
    reminders: event.reminders ?? null,
    conference_data: event.conferenceData ?? null,
    visibility: event.visibility ?? null,
    transparency: event.transparency ?? null,
  };
  const { error } = await supabaseAdmin.from("calendar_business_event_extensions").upsert(values, { onConflict: "source_type,source_id" });
  if (error) throw new Error(error.message);
}

async function applyBusinessGoogleChange(bindingId: string, link: NonNullable<Awaited<ReturnType<typeof getProviderEventLinkByProviderEventId>>>, event: GoogleCalendarEventResource) {
  if ((event.recurrence?.length ?? 0) > 0 || event.recurringEventId) {
    await insertCalendarSyncAudit({ bindingId, sourceType: link.source_type, sourceId: link.source_id, projectId: link.project_id, providerEventId: event.id, direction: "google_to_modulex", action: "conflict", resolution: "business_recurrence_not_supported", details: { recurrence: event.recurrence ?? [], recurringEventId: event.recurringEventId ?? null } });
    await enqueueCalendarSync({ bindingId, sourceType: link.source_type, sourceId: link.source_id, projectId: link.project_id, operation: "upsert" });
    return { conflict: true };
  }

  const deleted = event.status === "cancelled";
  const sourceType = link.source_type as Exclude<V3SourceType, "calendar_event">;
  const allDayStart = event.start?.date ?? null;
  const startAt = event.start?.dateTime ?? null;
  const endAt = event.end?.dateTime ?? null;
  if (!deleted) {
    if (sourceType.startsWith("project_") && !allDayStart) throw new Error("Project milestone must remain an all-day event.");
    if (sourceType === "installation" && !startAt) throw new Error("Installation must remain a timed event.");
  }

  const { error } = await supabaseAdmin.rpc("apply_google_business_schedule_change", {
    p_source_type: sourceType,
    p_source_id: link.source_id,
    p_start_at: startAt,
    p_end_at: endAt,
    p_all_day_start: allDayStart,
    p_deleted: deleted,
  });
  if (error) throw new Error(error.message);
  if (!deleted) await updateBusinessExtensionFromGoogle(link, event);
  const source = await buildGoogleEventForSource(link.source_type, link.source_id);
  await upsertProviderEventLink({
    bindingId, sourceType: link.source_type, sourceId: link.source_id, projectId: link.project_id,
    providerEventId: event.id, providerEtag: event.etag ?? null, providerUpdatedAt: event.updated ?? null,
    providerFingerprint: googleEventFingerprint(event), providerObservedAt: new Date().toISOString(), modulexFingerprint: source.fingerprint,
    lastSyncOrigin: "google", syncStatus: deleted ? "deleted" : "synced", providerDeleted: deleted,
  });
  await insertCalendarSyncAudit({ bindingId, sourceType: link.source_type, sourceId: link.source_id, projectId: link.project_id, providerEventId: event.id, direction: "google_to_modulex", action: deleted ? "delete" : "update", resolution: "applied" });
  return { conflict: false };
}

async function findRecurringMasterLink(bindingId: string, recurringEventId: string) {
  const { data, error } = await supabaseAdmin.from("calendar_provider_event_links").select("*")
    .eq("provider_binding_id", bindingId).eq("provider_event_id", recurringEventId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Awaited<ReturnType<typeof getProviderEventLinkByProviderEventId>>;
}

async function applyNormalGoogleChange(bindingId: string, link: Awaited<ReturnType<typeof getProviderEventLinkByProviderEventId>>, event: GoogleCalendarEventResource, requestUrl?: string) {
  let resolvedLink = link;
  let recurringParentId: string | null = null;
  if (!resolvedLink && event.recurringEventId) {
    let masterLink = await findRecurringMasterLink(bindingId, event.recurringEventId);
    if (!masterLink) {
      const binding = await getCompanyCalendarBinding();
      if (binding) {
        const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
        const master = await getGoogleCalendarEvent({ accessToken, calendarId: binding.provider_calendar_id, eventId: event.recurringEventId });
        await applyGoogleEventChange(master, requestUrl);
        masterLink = await findRecurringMasterLink(bindingId, event.recurringEventId);
      }
    }
    if (masterLink?.source_type === "calendar_event") recurringParentId = masterLink.source_id;
  }

  const existingEventId = resolvedLink?.source_type === "calendar_event" ? resolvedLink.source_id : null;
  const row = await applyGoogleEventReplica({ event, existingEventId, projectId: resolvedLink?.project_id ?? null, recurringParentEventId: recurringParentId });
  if (!row) return { created: false, updated: false, deleted: event.status === "cancelled" };
  const sourceId = String(row.id);
  const source = await buildGoogleEventForSource("calendar_event", sourceId);
  await upsertProviderEventLink({
    bindingId, sourceType: "calendar_event", sourceId, projectId: row.project_id ? String(row.project_id) : null,
    occurrenceKey: googleOriginalStartKey(event), providerEventId: event.id, providerRecurringEventId: event.recurringEventId ?? null,
    providerOriginalStartKey: googleOriginalStartKey(event) || null, providerEtag: event.etag ?? null, providerUpdatedAt: event.updated ?? null,
    providerFingerprint: googleEventFingerprint(event), providerObservedAt: new Date().toISOString(), modulexFingerprint: source.fingerprint,
    lastSyncOrigin: "google", syncStatus: event.status === "cancelled" ? "deleted" : "synced", providerDeleted: event.status === "cancelled",
  });
  await insertCalendarSyncAudit({ bindingId, sourceType: "calendar_event", sourceId, projectId: row.project_id ? String(row.project_id) : null, providerEventId: event.id, direction: "google_to_modulex", action: existingEventId ? "update" : "create", resolution: isEditableGoogleDefaultEvent(event) ? "editable_replica" : "read_only_special" });
  return { created: !existingEventId, updated: Boolean(existingEventId), deleted: event.status === "cancelled" };
}

export async function applyGoogleEventChange(event: GoogleCalendarEventResource, requestUrl?: string) {
  const binding = await getCompanyCalendarBinding();
  if (!binding) throw new Error("Company Calendar is not configured.");
  const link = await getProviderEventLinkByProviderEventId(binding.id, event.id);
  if (link && link.source_type !== "calendar_event") {
    const result = await applyBusinessGoogleChange(binding.id, link, event);
    return { ...blankResult(), processed: 1, conflicts: result.conflict ? 1 : 0, updated: result.conflict ? 0 : 1 };
  }
  if (!link && event.status === "cancelled") return { ...blankResult(), processed: 1 };
  const result = await applyNormalGoogleChange(binding.id, link, event, requestUrl);
  return { ...blankResult(), processed: 1, created: result.created ? 1 : 0, updated: result.updated ? 1 : 0, deleted: result.deleted ? 1 : 0 };
}

async function runProviderSync(input: { bindingId: string; syncToken?: string | null; requestUrl?: string; mode: "full" | "incremental" }) {
  const binding = await getCompanyCalendarBinding();
  if (!binding || binding.id !== input.bindingId) throw new Error("Company Calendar binding is not active.");
  const { accessToken } = await getConnectedGoogleAccessToken(input.requestUrl);
  const page = await listGoogleCalendarEvents({
    accessToken,
    calendarId: binding.provider_calendar_id,
    syncToken: input.syncToken ?? null,
    singleEvents: true,
  });
  const total: SyncResult = { ...blankResult(), mode: input.mode };
  for (const event of page.items) {
    try {
      const applied = await applyGoogleEventChange(event, input.requestUrl);
      total.processed += applied.processed;
      total.created += applied.created;
      total.updated += applied.updated;
      total.deleted += applied.deleted;
      total.conflicts += applied.conflicts;
    } catch (error) {
      total.errors += 1;
      await insertCalendarSyncAudit({ bindingId: binding.id, providerEventId: event.id, direction: "google_to_modulex", action: "apply_error", resolution: providerErrorCode(error) });
    }
  }
  if (total.errors > 0) throw new Error(`Google Calendar sync had ${total.errors} apply errors.`);
  await updateCompanyBindingSync({ bindingId: binding.id, syncToken: page.nextSyncToken, success: true });
  return total;
}

export async function syncCompanyCalendarFromGoogle(reason: "watch" | "manual" | "reconcile", requestUrl?: string): Promise<SyncResult> {
  const binding = await getCompanyCalendarBinding();
  if (!binding) throw new Error("Company Calendar is not configured.");
  try {
    if (!binding.provider_sync_token) return await runProviderSync({ bindingId: binding.id, requestUrl, mode: "full" });
    return await runProviderSync({ bindingId: binding.id, syncToken: binding.provider_sync_token, requestUrl, mode: "incremental" });
  } catch (error) {
    if (error instanceof GoogleCalendarProviderError && (error.code === "sync_token_gone" || error.status === 410)) {
      await updateCompanyBindingSync({ bindingId: binding.id, syncToken: null });
      const result = await runProviderSync({ bindingId: binding.id, requestUrl, mode: "full" });
      await insertCalendarSyncAudit({ bindingId: binding.id, direction: "system", action: "full_resync", resolution: "sync_token_gone", details: { reason } });
      return result;
    }
    await updateCompanyBindingSync({ bindingId: binding.id, errorCode: providerErrorCode(error) });
    throw error;
  }
}
