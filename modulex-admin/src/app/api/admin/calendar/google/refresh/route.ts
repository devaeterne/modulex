import { requirePermission } from "@/lib/auth/admin-api";
import {
  flushCalendarOutboxBatch,
  syncCompanyCalendarFromGoogle,
} from "@/lib/google-calendar/bidirectional-sync";
import { getCompanyCalendarBinding } from "@/lib/google-calendar/v3-repository";
import { ensureCompanyCalendarWatch } from "@/lib/google-calendar/watch-channels";
import { withApiTiming } from "@/lib/observability/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPEN_REFRESH_MIN_INTERVAL_MS = 60 * 1000;

function isProviderSyncFresh(lastSyncAt: string | null, now = Date.now()) {
  if (!lastSyncAt) return false;
  const syncedAt = new Date(lastSyncAt).getTime();
  return Number.isFinite(syncedAt) && now - syncedAt < OPEN_REFRESH_MIN_INTERVAL_MS;
}

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "calendar.view");
  if (auth.response) return auth.response;

  const binding = await getCompanyCalendarBinding();
  if (!binding) {
    return Response.json({ status: "NO_COMPANY_CALENDAR", provider_sync: "skipped", errors: [] });
  }
  if (!binding.sync_enabled) {
    return Response.json({ status: "SYNC_DISABLED", provider_sync: "skipped", errors: [] });
  }

  const errors: string[] = [];
  let outbox: unknown = null;
  let provider: unknown = null;
  let watch: unknown = null;
  const providerSyncFresh = isProviderSyncFresh(binding.last_sync_at);

  try {
    outbox = await flushCalendarOutboxBatch(25, request.url);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "outbox_flush_failed");
  }

  if (!providerSyncFresh) {
    try {
      provider = await syncCompanyCalendarFromGoogle("manual", request.url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "provider_sync_failed");
    }
  }

  try {
    watch = await ensureCompanyCalendarWatch(request.url);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "watch_setup_failed");
  }

  return Response.json(
    {
      status: errors.length === 0 ? "SUCCEEDED" : "PARTIAL_FAILURE",
      provider_sync: providerSyncFresh ? "skipped_fresh" : "requested",
      errors,
      outbox,
      provider,
      watch,
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/refresh", method: "POST" },
    () => handlePost(request),
  );
}
