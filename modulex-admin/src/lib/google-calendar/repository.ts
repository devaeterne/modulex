import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";
import type {
  GoogleCalendarConnectionStatus,
  GoogleCalendarIntegrationSettings,
  GoogleCalendarSyncStatus,
} from "@/lib/google-calendar/types";

const DEFAULT_SETTINGS: GoogleCalendarIntegrationSettings = {
  enabled: false,
  auto_create_project_calendar: true,
  calendar_name_template: "{project_no} - {customer_name}",
  timezone_override: null,
  sync_installations: true,
  sync_deliveries: false,
  sync_measurements: false,
  sync_customer_appointments: false,
};

export type GoogleCredentialRow = {
  id: number;
  provider: "google";
  status: GoogleCalendarConnectionStatus;
  provider_account_id: string | null;
  provider_account_email: string | null;
  encrypted_refresh_token: string | null;
  granted_scopes: string[];
  connected_by: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCalendarBindingRow = {
  id: string;
  project_id: string;
  provider: "google";
  provider_calendar_id: string;
  provider_calendar_name: string;
  timezone: string;
  sync_enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};

export type ProjectCalendarEventLinkRow = {
  id: string;
  project_id: string;
  project_calendar_binding_id: string;
  source_type: "installation";
  source_id: string;
  provider_event_id: string;
  source_fingerprint: string | null;
  sync_status: GoogleCalendarSyncStatus;
  last_synced_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

export async function getCalendarIntegrationSettings(): Promise<GoogleCalendarIntegrationSettings> {
  const { data, error } = await supabaseAdmin
    .from("calendar_integration_settings")
    .select("enabled,auto_create_project_calendar,calendar_name_template,timezone_override,sync_installations,sync_deliveries,sync_measurements,sync_customer_appointments")
    .eq("id", 1)
    .maybeSingle();
  assertNoError(error, "Google Calendar settings could not be loaded.");
  return data ? { ...DEFAULT_SETTINGS, ...data } as GoogleCalendarIntegrationSettings : DEFAULT_SETTINGS;
}

export async function updateCalendarIntegrationSettings(
  input: GoogleCalendarIntegrationSettings,
  actorUserId: string
): Promise<GoogleCalendarIntegrationSettings> {
  const { data, error } = await supabaseAdmin
    .from("calendar_integration_settings")
    .upsert({ id: 1, ...input, updated_by: actorUserId }, { onConflict: "id" })
    .select("enabled,auto_create_project_calendar,calendar_name_template,timezone_override,sync_installations,sync_deliveries,sync_measurements,sync_customer_appointments")
    .single();
  assertNoError(error, "Google Calendar settings could not be saved.");
  return data as GoogleCalendarIntegrationSettings;
}

export async function getGeneralTimezone(): Promise<string> {
  const { data, error } = await supabaseAdmin.from("general_settings").select("timezone").eq("id", 1).single();
  assertNoError(error, "General timezone could not be loaded.");
  return String(data?.timezone || "UTC");
}

export async function getGoogleCredential(): Promise<GoogleCredentialRow | null> {
  const { data, error } = await supabaseAdmin.from("calendar_integration_credentials").select("*").eq("id", 1).maybeSingle();
  assertNoError(error, "Google Calendar credential could not be loaded.");
  return data as GoogleCredentialRow | null;
}

export async function saveConnectedGoogleCredential(input: {
  providerAccountId: string | null;
  providerAccountEmail: string | null;
  encryptedRefreshToken: string;
  grantedScopes: string[];
  connectedBy: string;
}): Promise<GoogleCredentialRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("calendar_integration_credentials")
    .upsert({
      id: 1,
      provider: "google",
      status: "connected",
      provider_account_id: input.providerAccountId,
      provider_account_email: input.providerAccountEmail,
      encrypted_refresh_token: input.encryptedRefreshToken,
      granted_scopes: input.grantedScopes,
      connected_by: input.connectedBy,
      connected_at: now,
      disconnected_at: null,
      last_success_at: now,
      last_error_at: null,
      last_error_code: null,
    }, { onConflict: "id" })
    .select("*")
    .single();
  assertNoError(error, "Google Calendar credential could not be saved.");
  return data as GoogleCredentialRow;
}

export async function retireGoogleCredential(errorCode: string | null = null): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("calendar_integration_credentials")
    .update({
      status: errorCode ? "error" : "disconnected",
      encrypted_refresh_token: null,
      disconnected_at: now,
      last_error_at: errorCode ? now : null,
      last_error_code: errorCode,
    })
    .eq("id", 1);
  assertNoError(error, "Google Calendar credential could not be retired.");
}

export async function markGoogleCredentialSuccess(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("calendar_integration_credentials")
    .update({ status: "connected", last_success_at: new Date().toISOString(), last_error_at: null, last_error_code: null })
    .eq("id", 1);
  assertNoError(error, "Google Calendar credential success state could not be recorded.");
}

export async function markGoogleCredentialError(errorCode: string, reconnectRequired = false): Promise<void> {
  const values: Record<string, unknown> = {
    last_error_at: new Date().toISOString(),
    last_error_code: errorCode,
  };
  if (reconnectRequired) {
    values.status = "error";
    values.encrypted_refresh_token = null;
  }

  const { error } = await supabaseAdmin.from("calendar_integration_credentials").update(values).eq("id", 1);
  assertNoError(error, "Google Calendar credential error state could not be recorded.");
}

export async function createCalendarOAuthState(input: {
  userId: string;
  stateHash: string;
  expiresAt: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("calendar_oauth_states").insert({
    user_id: input.userId,
    state_hash: input.stateHash,
    expires_at: input.expiresAt,
  });
  assertNoError(error, "Google Calendar OAuth state could not be stored.");
}

export async function consumeCalendarOAuthState(input: {
  stateHash: string;
  now?: string;
}): Promise<{ userId: string } | null> {
  const now = input.now ?? new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("calendar_oauth_states")
    .update({ consumed_at: now })
    .eq("state_hash", input.stateHash)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();
  assertNoError(error, "Google Calendar OAuth state could not be consumed.");
  return data?.user_id ? { userId: String(data.user_id) } : null;
}

export async function getProjectCalendarBinding(projectId: string): Promise<ProjectCalendarBindingRow | null> {
  const { data, error } = await supabaseAdmin.from("project_calendar_bindings").select("*").eq("project_id", projectId).maybeSingle();
  assertNoError(error, "Project Calendar binding could not be loaded.");
  return data as ProjectCalendarBindingRow | null;
}

export async function upsertProjectCalendarBinding(input: {
  projectId: string;
  providerCalendarId: string;
  providerCalendarName: string;
  timezone: string;
  syncEnabled?: boolean;
  createdBy?: string | null;
}): Promise<ProjectCalendarBindingRow> {
  const { data, error } = await supabaseAdmin
    .from("project_calendar_bindings")
    .upsert({
      project_id: input.projectId,
      provider: "google",
      provider_calendar_id: input.providerCalendarId,
      provider_calendar_name: input.providerCalendarName,
      timezone: input.timezone,
      sync_enabled: input.syncEnabled ?? true,
      created_by: input.createdBy ?? null,
      last_error_at: null,
      last_error_code: null,
    }, { onConflict: "project_id" })
    .select("*")
    .single();
  assertNoError(error, "Project Calendar binding could not be saved.");
  return data as ProjectCalendarBindingRow;
}

export async function updateProjectCalendarBinding(
  projectId: string,
  values: Partial<Pick<ProjectCalendarBindingRow,
    "provider_calendar_name" | "timezone" | "sync_enabled" | "last_sync_at" | "last_error_at" | "last_error_code">>
): Promise<ProjectCalendarBindingRow> {
  const { data, error } = await supabaseAdmin
    .from("project_calendar_bindings")
    .update(values)
    .eq("project_id", projectId)
    .select("*")
    .single();
  assertNoError(error, "Project Calendar binding could not be updated.");
  return data as ProjectCalendarBindingRow;
}

export async function getProjectCalendarEventLink(input: {
  bindingId: string;
  sourceType: "installation";
  sourceId: string;
}): Promise<ProjectCalendarEventLinkRow | null> {
  const { data, error } = await supabaseAdmin
    .from("project_calendar_event_links")
    .select("*")
    .eq("project_calendar_binding_id", input.bindingId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .maybeSingle();
  assertNoError(error, "Project Calendar event link could not be loaded.");
  return data as ProjectCalendarEventLinkRow | null;
}

export async function upsertProjectCalendarEventLink(input: {
  projectId: string;
  bindingId: string;
  sourceType: "installation";
  sourceId: string;
  providerEventId: string;
  sourceFingerprint: string | null;
  syncStatus: GoogleCalendarSyncStatus;
  lastSyncedAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorCode?: string | null;
}): Promise<ProjectCalendarEventLinkRow> {
  const { data, error } = await supabaseAdmin
    .from("project_calendar_event_links")
    .upsert({
      project_id: input.projectId,
      project_calendar_binding_id: input.bindingId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      provider_event_id: input.providerEventId,
      source_fingerprint: input.sourceFingerprint,
      sync_status: input.syncStatus,
      last_synced_at: input.lastSyncedAt ?? null,
      last_error_at: input.lastErrorAt ?? null,
      last_error_code: input.lastErrorCode ?? null,
    }, { onConflict: "project_calendar_binding_id,source_type,source_id" })
    .select("*")
    .single();
  assertNoError(error, "Project Calendar event link could not be saved.");
  return data as ProjectCalendarEventLinkRow;
}
