import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";

export type V3SourceType = "project_start" | "project_target" | "project_delivery" | "installation" | "calendar_event";

export type CompanyCalendarBinding = {
  id: string;
  admin_calendar_id: string;
  provider_calendar_id: string;
  provider_calendar_name: string;
  provider_data_owner: string | null;
  provider_access_role: string | null;
  provider_background_color: string | null;
  provider_foreground_color: string | null;
  provider_color_id: string | null;
  provider_sync_token: string | null;
  timezone: string;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};

export type CalendarProviderEventLink = {
  id: string;
  provider_binding_id: string;
  source_type: V3SourceType;
  source_id: string;
  project_id: string | null;
  occurrence_key: string;
  provider_event_id: string;
  provider_recurring_event_id: string | null;
  provider_original_start_key: string | null;
  provider_etag: string | null;
  provider_updated_at: string | null;
  provider_fingerprint: string | null;
  provider_observed_at: string | null;
  modulex_fingerprint: string | null;
  last_synced_at: string | null;
  last_sync_origin: string | null;
  sync_status: string;
  provider_deleted: boolean;
};

export type CalendarSyncOutboxItem = {
  id: string;
  provider_binding_id: string;
  source_type: V3SourceType;
  source_id: string;
  project_id: string | null;
  occurrence_key: string;
  operation: "upsert" | "delete";
  source_fingerprint: string | null;
  attempt_count: number;
};

export type CalendarWatchChannelRow = {
  id: string;
  provider_binding_id: string;
  channel_id: string;
  resource_id: string | null;
  resource_uri: string | null;
  channel_token_hash: string;
  expires_at: string | null;
  status: "pending" | "active" | "replaced" | "stopped" | "error";
  last_message_number: number | null;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

function requireData<T>(data: T | null, fallback: string): T {
  if (!data) throw new Error(fallback);
  return data;
}

export async function getCompanyCalendarBinding(): Promise<CompanyCalendarBinding | null> {
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("calendar_integration_settings")
    .select("company_provider_binding_id")
    .eq("id", 1)
    .maybeSingle();
  assertNoError(settingsError, "Company Calendar settings could not be loaded.");
  if (!settings?.company_provider_binding_id) return null;

  const { data, error } = await supabaseAdmin
    .from("project_calendar_bindings")
    .select("id,admin_calendar_id,provider_calendar_id,provider_calendar_name,provider_data_owner,provider_access_role,provider_background_color,provider_foreground_color,provider_color_id,provider_sync_token,timezone,sync_enabled,last_sync_at,last_error_at,last_error_code")
    .eq("id", settings.company_provider_binding_id)
    .eq("binding_mode", "company_shared")
    .maybeSingle();
  assertNoError(error, "Company Google Calendar binding could not be loaded.");
  return data as CompanyCalendarBinding | null;
}

async function ensureCompanyAdminCalendar(input: { ownerProfileId: string; name: string; timezone: string; actorUserId: string }) {
  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.ownerProfileId)
    .maybeSingle();
  assertNoError(ownerError, "Company Calendar owner could not be validated.");
  if (!owner?.is_active) throw new Error("Company Calendar owner must be active.");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("admin_calendars")
    .select("id")
    .eq("kind", "company")
    .eq("is_active", true)
    .maybeSingle();
  assertNoError(existingError, "Company Calendar could not be loaded.");

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("admin_calendars")
      .update({
        name: input.name,
        owner_profile_id: input.ownerProfileId,
        timezone: input.timezone,
        updated_by: input.actorUserId,
      })
      .eq("id", existing.id);
    assertNoError(error, "Company Calendar could not be updated.");
    return String(existing.id);
  }

  const { data, error } = await supabaseAdmin
    .from("admin_calendars")
    .insert({
      name: input.name,
      kind: "company",
      owner_profile_id: input.ownerProfileId,
      project_id: null,
      timezone: input.timezone,
      created_by: input.actorUserId,
      updated_by: input.actorUserId,
    })
    .select("id")
    .single();
  assertNoError(error, "Company Calendar could not be created.");
  return String(requireData(data, "Company Calendar could not be created.").id);
}

export async function setCompanyCalendarBinding(input: {
  providerCalendarId: string;
  providerCalendarName: string;
  timezone: string;
  providerDataOwner: string | null;
  providerAccessRole: string;
  providerBackgroundColor: string | null;
  providerForegroundColor: string | null;
  providerColorId: string | null;
  ownerProfileId: string;
  actorUserId: string;
}): Promise<CompanyCalendarBinding> {
  if (input.providerAccessRole !== "owner" && input.providerAccessRole !== "writer") {
    throw new Error("Company Calendar requires Google writer or owner access.");
  }

  const adminCalendarId = await ensureCompanyAdminCalendar({
    ownerProfileId: input.ownerProfileId,
    name: input.providerCalendarName,
    timezone: input.timezone,
    actorUserId: input.actorUserId,
  });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("project_calendar_bindings")
    .select("id,admin_calendar_id,binding_mode")
    .eq("provider_calendar_id", input.providerCalendarId)
    .maybeSingle();
  assertNoError(existingError, "Google Calendar binding could not be checked.");
  if (existing?.binding_mode === "modulex_created") {
    throw new Error("This Google Calendar is still bound to a legacy Project calendar.");
  }

  let bindingId: string;
  if (existing) {
    const oldAdminCalendarId = String(existing.admin_calendar_id);
    const { data, error } = await supabaseAdmin
      .from("project_calendar_bindings")
      .update({
        project_id: null,
        admin_calendar_id: adminCalendarId,
        binding_mode: "company_shared",
        provider_calendar_name: input.providerCalendarName,
        provider_data_owner: input.providerDataOwner,
        provider_access_role: input.providerAccessRole,
        provider_background_color: input.providerBackgroundColor,
        provider_foreground_color: input.providerForegroundColor,
        provider_color_id: input.providerColorId,
        timezone: input.timezone,
        sync_enabled: true,
        provider_sync_token: null,
        last_error_at: null,
        last_error_code: null,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    assertNoError(error, "Company Google Calendar binding could not be promoted.");
    bindingId = String(requireData(data, "Company Google Calendar binding could not be promoted.").id);

    if (oldAdminCalendarId !== adminCalendarId) {
      await supabaseAdmin
        .from("admin_calendars")
        .update({ is_active: false, updated_by: input.actorUserId })
        .eq("id", oldAdminCalendarId)
        .eq("kind", "google_imported");
    }
  } else {
    const { data, error } = await supabaseAdmin
      .from("project_calendar_bindings")
      .insert({
        project_id: null,
        admin_calendar_id: adminCalendarId,
        binding_mode: "company_shared",
        provider: "google",
        provider_calendar_id: input.providerCalendarId,
        provider_calendar_name: input.providerCalendarName,
        provider_data_owner: input.providerDataOwner,
        provider_access_role: input.providerAccessRole,
        provider_background_color: input.providerBackgroundColor,
        provider_foreground_color: input.providerForegroundColor,
        provider_color_id: input.providerColorId,
        timezone: input.timezone,
        sync_enabled: true,
        created_by: input.actorUserId,
      })
      .select("id")
      .single();
    assertNoError(error, "Company Google Calendar binding could not be created.");
    bindingId = String(requireData(data, "Company Google Calendar binding could not be created.").id);
  }

  const { error: settingsError } = await supabaseAdmin
    .from("calendar_integration_settings")
    .update({
      company_admin_calendar_id: adminCalendarId,
      company_provider_binding_id: bindingId,
      auto_create_project_calendar: false,
      enabled: true,
      updated_by: input.actorUserId,
    })
    .eq("id", 1);
  assertNoError(settingsError, "Company Calendar settings could not be activated.");

  const result = await getCompanyCalendarBinding();
  if (!result) throw new Error("Company Calendar binding could not be activated.");
  return result;
}

export async function getProviderEventLinkByProviderEventId(bindingId: string, providerEventId: string) {
  const { data, error } = await supabaseAdmin
    .from("calendar_provider_event_links")
    .select("*")
    .eq("provider_binding_id", bindingId)
    .eq("provider_event_id", providerEventId)
    .maybeSingle();
  assertNoError(error, "Calendar provider event link could not be loaded.");
  return data as CalendarProviderEventLink | null;
}

export async function getProviderEventLinkBySource(input: { bindingId: string; sourceType: V3SourceType; sourceId: string; occurrenceKey?: string }) {
  const { data, error } = await supabaseAdmin
    .from("calendar_provider_event_links")
    .select("*")
    .eq("provider_binding_id", input.bindingId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("occurrence_key", input.occurrenceKey ?? "")
    .maybeSingle();
  assertNoError(error, "Calendar provider source link could not be loaded.");
  return data as CalendarProviderEventLink | null;
}

export async function upsertProviderEventLink(input: {
  bindingId: string;
  sourceType: V3SourceType;
  sourceId: string;
  projectId: string | null;
  occurrenceKey?: string;
  providerEventId: string;
  providerRecurringEventId?: string | null;
  providerOriginalStartKey?: string | null;
  providerEtag?: string | null;
  providerUpdatedAt?: string | null;
  providerFingerprint?: string | null;
  providerObservedAt?: string | null;
  modulexFingerprint?: string | null;
  lastSyncOrigin?: "modulex" | "google" | "reconcile" | "cutover";
  syncStatus?: string;
  providerDeleted?: boolean;
}) {
  const row = {
    provider_binding_id: input.bindingId,
    source_type: input.sourceType,
    source_id: input.sourceId,
    project_id: input.projectId,
    occurrence_key: input.occurrenceKey ?? "",
    provider_event_id: input.providerEventId,
    provider_recurring_event_id: input.providerRecurringEventId ?? null,
    provider_original_start_key: input.providerOriginalStartKey ?? null,
    provider_etag: input.providerEtag ?? null,
    provider_updated_at: input.providerUpdatedAt ?? null,
    provider_fingerprint: input.providerFingerprint ?? null,
    provider_observed_at: input.providerObservedAt ?? new Date().toISOString(),
    modulex_fingerprint: input.modulexFingerprint ?? null,
    last_synced_at: new Date().toISOString(),
    last_sync_origin: input.lastSyncOrigin ?? "reconcile",
    sync_status: input.syncStatus ?? "synced",
    last_error_at: null,
    last_error_code: null,
    provider_deleted: input.providerDeleted ?? false,
  };

  const { data, error } = await supabaseAdmin
    .from("calendar_provider_event_links")
    .upsert(row, { onConflict: "provider_binding_id,source_type,source_id,occurrence_key" })
    .select("*")
    .single();
  assertNoError(error, "Calendar provider event link could not be saved.");
  return data as CalendarProviderEventLink;
}

export async function claimCalendarSyncBatch(limit = 25): Promise<CalendarSyncOutboxItem[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("calendar_sync_outbox")
    .select("*")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", now)
    .order("queued_at")
    .limit(limit);
  assertNoError(error, "Calendar sync outbox could not be loaded.");

  const rows = (data ?? []) as CalendarSyncOutboxItem[];
  if (rows.length) {
    const { error: lockError } = await supabaseAdmin
      .from("calendar_sync_outbox")
      .update({ status: "processing", locked_at: now })
      .in("id", rows.map((row) => row.id));
    assertNoError(lockError, "Calendar sync outbox could not be claimed.");
  }
  return rows;
}

export async function markCalendarSyncSuccess(itemId: string) {
  const { error } = await supabaseAdmin
    .from("calendar_sync_outbox")
    .update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null, last_error_at: null, last_error_code: null })
    .eq("id", itemId);
  assertNoError(error, "Calendar sync success could not be recorded.");
}

export async function markCalendarSyncFailure(item: CalendarSyncOutboxItem, errorCode: string) {
  const attempt = item.attempt_count + 1;
  const delayMinutes = Math.min(60, 2 ** Math.min(attempt, 6));
  const next = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const { error } = await supabaseAdmin
    .from("calendar_sync_outbox")
    .update({
      status: attempt >= 8 ? "error" : "retry",
      attempt_count: attempt,
      next_attempt_at: next,
      locked_at: null,
      last_error_at: new Date().toISOString(),
      last_error_code: errorCode,
    })
    .eq("id", item.id);
  assertNoError(error, "Calendar sync failure could not be recorded.");
}

export async function enqueueCalendarSync(source: {
  bindingId: string;
  sourceType: V3SourceType;
  sourceId: string;
  projectId: string | null;
  operation: "upsert" | "delete";
  sourceFingerprint?: string | null;
  occurrenceKey?: string;
}) {
  const { error } = await supabaseAdmin
    .from("calendar_sync_outbox")
    .upsert({
      provider_binding_id: source.bindingId,
      source_type: source.sourceType,
      source_id: source.sourceId,
      project_id: source.projectId,
      occurrence_key: source.occurrenceKey ?? "",
      operation: source.operation,
      source_fingerprint: source.sourceFingerprint ?? null,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
      locked_at: null,
      queued_at: new Date().toISOString(),
      completed_at: null,
    }, { onConflict: "provider_binding_id,source_type,source_id,occurrence_key" });
  assertNoError(error, "Calendar sync work could not be queued.");
}

export async function enqueueCalendarSyncJob(input: {
  bindingId: string;
  jobType: "incremental" | "full" | "reconcile" | "watch_renew" | "access_check";
  dedupeKey?: string;
  payload?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin.rpc("enqueue_calendar_sync_job", {
    p_provider_binding_id: input.bindingId,
    p_job_type: input.jobType,
    p_dedupe_key: input.dedupeKey ?? "default",
    p_payload: input.payload ?? {},
  });
  if (!error) return data ? String(data) : null;

  const { data: fallback, error: fallbackError } = await supabaseAdmin
    .from("calendar_sync_jobs")
    .upsert({
      provider_binding_id: input.bindingId,
      job_type: input.jobType,
      dedupe_key: input.dedupeKey ?? "default",
      payload: input.payload ?? {},
      status: "pending",
      attempt_count: 0,
      available_at: new Date().toISOString(),
      locked_at: null,
      completed_at: null,
    }, { onConflict: "provider_binding_id,job_type,dedupe_key" })
    .select("id")
    .single();
  assertNoError(fallbackError, "Calendar sync job could not be queued.");
  return String(requireData(fallback, "Calendar sync job could not be queued.").id);
}

export async function updateCompanyBindingSync(input: { bindingId: string; syncToken?: string | null; success?: boolean; errorCode?: string | null }) {
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {};
  if (input.syncToken !== undefined) values.provider_sync_token = input.syncToken;
  if (input.success) Object.assign(values, { last_sync_at: now, last_mirror_sync_at: now, last_error_at: null, last_error_code: null });
  if (input.errorCode) Object.assign(values, { last_error_at: now, last_error_code: input.errorCode });
  const { error } = await supabaseAdmin.from("project_calendar_bindings").update(values).eq("id", input.bindingId);
  assertNoError(error, "Company Calendar sync state could not be updated.");
}

export async function insertCalendarSyncAudit(input: {
  bindingId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  projectId?: string | null;
  providerEventId?: string | null;
  direction: "modulex_to_google" | "google_to_modulex" | "system";
  action: string;
  resolution?: string | null;
  details?: Record<string, unknown>;
  actorProfileId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("calendar_sync_audit").insert({
    provider_binding_id: input.bindingId ?? null,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    project_id: input.projectId ?? null,
    provider_event_id: input.providerEventId ?? null,
    direction: input.direction,
    action: input.action,
    resolution: input.resolution ?? null,
    details: input.details ?? {},
    actor_profile_id: input.actorProfileId ?? null,
  });
  assertNoError(error, "Calendar sync audit could not be written.");
}

export async function insertPendingWatchChannel(input: { bindingId: string; channelId: string; tokenHash: string; expiresAt: string | null }) {
  const { data, error } = await supabaseAdmin
    .from("calendar_watch_channels")
    .insert({
      provider_binding_id: input.bindingId,
      channel_id: input.channelId,
      channel_token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      status: "pending",
    })
    .select("*")
    .single();
  assertNoError(error, "Calendar watch channel could not be staged.");
  return data as CalendarWatchChannelRow;
}

export async function activateWatchChannel(input: { channelId: string; resourceId: string; resourceUri: string | null; expiresAt: string | null }) {
  const { data, error } = await supabaseAdmin
    .from("calendar_watch_channels")
    .update({
      resource_id: input.resourceId,
      resource_uri: input.resourceUri,
      expires_at: input.expiresAt,
      status: "active",
      renewed_at: new Date().toISOString(),
    })
    .eq("channel_id", input.channelId)
    .select("*")
    .single();
  assertNoError(error, "Calendar watch channel could not be activated.");
  return data as CalendarWatchChannelRow;
}

export async function getWatchChannel(channelId: string) {
  const { data, error } = await supabaseAdmin
    .from("calendar_watch_channels")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();
  assertNoError(error, "Calendar watch channel could not be loaded.");
  return data as CalendarWatchChannelRow | null;
}

export async function listActiveWatchChannels(bindingId: string) {
  const { data, error } = await supabaseAdmin
    .from("calendar_watch_channels")
    .select("*")
    .eq("provider_binding_id", bindingId)
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false });
  assertNoError(error, "Calendar watch channels could not be loaded.");
  return (data ?? []) as CalendarWatchChannelRow[];
}

export async function markWatchMessage(channelId: string, messageNumber: number) {
  const { error } = await supabaseAdmin
    .from("calendar_watch_channels")
    .update({ last_message_number: messageNumber })
    .eq("channel_id", channelId);
  assertNoError(error, "Calendar watch notification could not be recorded.");
}

export async function stopWatchChannelRecord(channelId: string, status: "replaced" | "stopped" | "error" = "stopped") {
  const { error } = await supabaseAdmin
    .from("calendar_watch_channels")
    .update({ status, stopped_at: new Date().toISOString() })
    .eq("channel_id", channelId);
  assertNoError(error, "Calendar watch channel state could not be stopped.");
}
