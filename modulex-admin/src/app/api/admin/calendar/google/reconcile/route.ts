import { timingSafeEqual } from "node:crypto";
import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import {
  flushCalendarOutboxBatch,
  syncCompanyCalendarFromGoogle,
} from "@/lib/google-calendar/bidirectional-sync";
import { listGoogleCalendars } from "@/lib/google-calendar/google-calendar";
import {
  getCompanyCalendarBinding,
  insertCalendarSyncAudit,
} from "@/lib/google-calendar/v3-repository";
import { renewExpiringCompanyCalendarWatch } from "@/lib/google-calendar/watch-channels";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeSecretEqual(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function authorizeCron(request: Request) {
  const configured = process.env.CRON_SECRET?.trim() || process.env.CALENDAR_SYNC_SECRET?.trim() || "";
  if (!configured) return new Response("Calendar reconciliation is not configured.", { status: 503 });
  const authorization = request.headers.get("authorization") ?? "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeSecretEqual(configured, presented)) return new Response("Unauthorized", { status: 401 });
  return null;
}

async function completeDueJobs(bindingId: string, success: boolean, errorCode: string | null) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("calendar_sync_jobs")
    .select("id,attempt_count")
    .eq("provider_binding_id", bindingId)
    .in("status", ["pending", "retry"])
    .lte("available_at", now)
    .limit(50);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (success) {
      const result = await supabaseAdmin.from("calendar_sync_jobs").update({
        status: "completed",
        completed_at: now,
        locked_at: null,
        last_error_at: null,
        last_error_code: null,
      }).eq("id", row.id);
      if (result.error) throw new Error(result.error.message);
      continue;
    }
    const attempt = Number(row.attempt_count ?? 0) + 1;
    const delayMinutes = Math.min(60, 2 ** Math.min(attempt, 6));
    const result = await supabaseAdmin.from("calendar_sync_jobs").update({
      status: attempt >= 8 ? "error" : "retry",
      attempt_count: attempt,
      available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      locked_at: null,
      last_error_at: now,
      last_error_code: errorCode || "calendar_reconcile_failed",
    }).eq("id", row.id);
    if (result.error) throw new Error(result.error.message);
  }
}

async function refreshProviderAccess(bindingId: string, requestUrl: string) {
  const binding = await getCompanyCalendarBinding();
  if (!binding || binding.id !== bindingId) return { status: "missing_binding" as const };
  const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
  const calendars = await listGoogleCalendars({ accessToken });
  const provider = calendars.find((item) => item.id === binding.provider_calendar_id);
  if (!provider) {
    await supabaseAdmin.from("project_calendar_bindings").update({
      sync_enabled: false,
      last_error_at: new Date().toISOString(),
      last_error_code: "provider_calendar_not_found",
    }).eq("id", binding.id);
    return { status: "provider_calendar_not_found" as const };
  }
  const accessRole = provider.accessRole?.trim() || "none";
  const writable = accessRole === "owner" || accessRole === "writer";
  await supabaseAdmin.from("project_calendar_bindings").update({
    provider_calendar_name: provider.summary?.trim() || binding.provider_calendar_name,
    provider_data_owner: provider.dataOwner?.trim() || null,
    provider_access_role: accessRole,
    provider_background_color: provider.backgroundColor?.trim() || null,
    provider_foreground_color: provider.foregroundColor?.trim() || null,
    provider_color_id: provider.colorId?.trim() || null,
    timezone: provider.timeZone?.trim() || binding.timezone,
    sync_enabled: writable,
    last_error_at: writable ? null : new Date().toISOString(),
    last_error_code: writable ? null : "provider_access_downgraded",
  }).eq("id", binding.id);
  return { status: writable ? "writable" as const : "provider_access_downgraded" as const, access_role: accessRole };
}

async function handleGet(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const binding = await getCompanyCalendarBinding();
  if (!binding) return Response.json({ status: "NO_COMPANY_CALENDAR" });

  const errors: string[] = [];
  let outbox: unknown = null;
  let providerSync: unknown = null;
  let watch: unknown = null;
  let access: unknown = null;

  try {
    outbox = await flushCalendarOutboxBatch(50, request.url);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "outbox_flush_failed");
  }
  try {
    providerSync = await syncCompanyCalendarFromGoogle("reconcile", request.url);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "provider_sync_failed");
  }
  try {
    watch = await renewExpiringCompanyCalendarWatch(new Date(), request.url);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "watch_renew_failed");
  }
  try {
    access = await refreshProviderAccess(binding.id, request.url);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "provider_access_check_failed");
  }

  await completeDueJobs(binding.id, errors.length === 0, errors[0] ?? null);
  await insertCalendarSyncAudit({
    bindingId: binding.id,
    direction: "system",
    action: "reconcile",
    resolution: errors.length === 0 ? "success" : "partial_failure",
    details: { errors, outbox, providerSync, watch, access },
  });

  return Response.json(
    { status: errors.length === 0 ? "SUCCEEDED" : "PARTIAL_FAILURE", errors, outbox, provider_sync: providerSync, watch, access },
    { status: errors.length === 0 ? 200 : 207 },
  );
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/reconcile", method: "GET" },
    () => handleGet(request),
  );
}
