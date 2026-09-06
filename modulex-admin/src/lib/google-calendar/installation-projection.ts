import "server-only";

import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import { getCompanyCalendarBinding } from "@/lib/google-calendar/v3-repository";
import type { CalendarMutationResult } from "@/lib/google-calendar/types";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export async function resolveInstallationProjectId(installationId: string) {
  const { data: installation, error: installationError } = await supabaseAdmin
    .from("customer_installations")
    .select("id,order_id")
    .eq("id", installationId)
    .maybeSingle();
  if (installationError) throw new Error(installationError.message);
  if (!installation) throw new Error("Installation was not found.");
  const { data: order, error: orderError } = await supabaseAdmin
    .from("customer_orders")
    .select("project_id")
    .eq("id", installation.order_id)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order?.project_id) throw new Error("Installation Order is not assigned to a Project.");
  return String(order.project_id);
}

/**
 * Compatibility entrypoint. Calendar V3 persists Installation schedule changes
 * first; DB triggers enqueue `installation:<id>` against the Company Calendar.
 * No Project-specific Google Calendar is created or written here.
 */
export async function syncInstallationToGoogle(
  installationId: string,
  _actorId: string,
  requestUrl?: string,
): Promise<CalendarMutationResult> {
  await resolveInstallationProjectId(installationId);
  const binding = await getCompanyCalendarBinding();
  if (!binding || !binding.sync_enabled) {
    return { ok: true, status: "skipped", error_code: "company_calendar_not_bound" };
  }
  const result = await flushCalendarOutboxBatch(50, requestUrl);
  if (result.errors) return { ok: false, status: "error", error_code: "google_sync_pending" };
  return { ok: true, status: "synced" };
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

  const total = installations?.length ?? 0;
  if (!total) return { total: 0, synced: 0, errors: 0 };
  const result = await syncInstallationToGoogle(String(installations![0].id), actorId, requestUrl);
  return { total, synced: result.ok ? total : 0, errors: result.ok ? 0 : total };
}
