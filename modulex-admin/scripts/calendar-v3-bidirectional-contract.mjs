import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (p) => readFile(path.join(root, p), "utf8");
const optionalSource = (p) => source(p).catch((error) => {
  if (error?.code === "ENOENT") return "";
  throw error;
});

const [sql, migration, config, provider, syncEngine, bootstrapSync, eventRoute, webhook, reconcile, refresh, syncRoute, companyBinding, workspace, projectTab, vercelConfig, watchChannels] = await Promise.all([
  source("sql/calendar-v3-bidirectional.sql"),
  source("../modulex-store/supabase/migrations/20260906113000_calendar_v3_bidirectional.sql"),
  source("src/lib/google-calendar/config.ts"),
  source("src/lib/google-calendar/google-calendar.ts"),
  source("src/lib/google-calendar/bidirectional-sync.ts"),
  optionalSource("src/lib/google-calendar/bootstrap-sync.ts"),
  source("src/app/api/admin/calendar/events/route.ts"),
  source("src/app/api/admin/calendar/google/webhook/route.ts"),
  source("src/app/api/admin/calendar/google/reconcile/route.ts"),
  source("src/app/api/admin/calendar/google/refresh/route.ts"),
  source("src/app/api/admin/calendar/google/sync/route.ts"),
  source("src/app/api/admin/calendar/company-binding/route.ts"),
  source("src/components/calendar/AdminCalendarWorkspace.tsx"),
  source("src/components/customers/project-detail/ProjectCalendarTab.tsx"),
  source("vercel.json"),
  source("src/lib/google-calendar/watch-channels.ts"),
]);

assert.equal(sql.trim(), migration.trim(), "Calendar V3 canonical SQL and migration must remain byte-identical.");
for (const token of [
  "calendar_events",
  "calendar_provider_event_links",
  "calendar_sync_outbox",
  "calendar_sync_jobs",
  "calendar_watch_channels",
  "calendar_sync_audit",
  "calendar_business_event_extensions",
  "company_shared",
]) assert.match(sql, new RegExp(token));
assert.match(sql, /kind in \([^)]*company/i);
assert.match(sql, /binding_mode[\s\S]*company_shared/i);
assert.match(sql, /company_admin_calendar_id uuid/i);
assert.match(sql, /company_provider_binding_id uuid/i);
assert.match(sql, /create unique index[\s\S]*admin_calendars[\s\S]*kind = 'company'/i);
assert.match(sql, /calendar_events[\s\S]*project_id uuid/i);
assert.match(sql, /calendar_provider_event_links[\s\S]*provider_event_id text not null/i);
assert.match(sql, /calendar_sync_outbox[\s\S]*source_type/i);
assert.match(sql, /calendar_watch_channels[\s\S]*resource_id/i);
assert.match(sql, /calendar_sync_audit/i);
assert.match(sql, /apply_google_business_schedule_change/i);
assert.match(sql, /modulex\.calendar_sync_origin/i);
assert.match(sql, /alter table public\.calendar_events enable row level security/i);
assert.match(sql, /revoke all on public\.calendar_events from anon, authenticated/i);
assert.match(config, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);
assert.doesNotMatch(config, /GOOGLE_CALENDAR_IMPORT_SCOPES[\s\S]*calendar\.events\.owned/);
assert.match(provider, /events\/watch|watchGoogleCalendarEvents/);
assert.match(provider, /PATCH/);
assert.match(syncEngine, /syncToken|sync_token/);
assert.match(syncEngine, /410|sync_token_gone/);
assert.match(syncEngine, /calendar_sync_outbox/);
assert.match(syncEngine, /insertCalendarSyncAudit/);
assert.match(eventRoute, /requirePermission\(request, "calendar\.manage"\)/);
assert.match(webhook, /x-goog-channel-id/i);
assert.match(webhook, /x-goog-resource-id/i);
assert.match(reconcile, /CRON_SECRET|cron/i);

// Large first-time Google calendars must be pulled in bounded provider pages so a
// manual Sync Now never depends on one Vercel request surviving the whole history.
assert.match(provider, /export async function listGoogleCalendarEventPage/);
assert.match(provider, /pageToken\?: string \| null/);
assert.match(provider, /maxResults\?: number/);
assert.match(syncEngine, /PROVIDER_SYNC_PAGE_SIZE = 100/);
assert.match(syncEngine, /export async function syncCompanyCalendarFromGooglePage/);
assert.match(syncEngine, /continuationToken/);
assert.match(syncRoute, /continuation_token/);
assert.match(syncRoute, /syncCompanyCalendarCurrentFirstPage/);
assert.match(workspace, /while \(continuationToken\)/);
assert.doesNotMatch(
  companyBinding,
  /await syncCompanyCalendarFromGoogle\("manual"/,
  "Choosing a Company Calendar must not run an unbounded first-time provider pull inside the binding request.",
);
assert.match(
  refresh,
  /binding\.provider_sync_token/,
  "Open-page refresh must not start an unbounded full-history pull before initial Sync Now finishes.",
);

// Initial full sync must make the currently visible Calendar useful before walking
// years of historical Google events. The client supplies its visible range, the
// bootstrap helper preserves a recent/history phase in its continuation, and each
// bounded page is reloaded into the workspace while the remaining history continues.
assert.match(syncRoute, /bootstrap_start/);
assert.match(syncRoute, /bootstrap_end/);
assert.match(bootstrapSync, /phase: "recent"/);
assert.match(bootstrapSync, /phase: "history"/);
assert.match(bootstrapSync, /timeMin: bootstrapRange\.start/);
assert.match(bootstrapSync, /timeMax: bootstrapRange\.end/);
assert.match(workspace, /bootstrap_start: range\.start/);
assert.match(workspace, /bootstrap_end: range\.end/);
assert.match(
  workspace,
  /await load\(\);[\s\S]*while \(continuationToken\)/,
  "Sync Now must refresh the visible Calendar after each bounded provider page instead of waiting for the entire historical backfill.",
);

assert.match(refresh, /requirePermission\(request, "calendar\.view"\)/);
assert.match(refresh, /getCompanyCalendarBinding/);
assert.match(refresh, /last_sync_at/);
assert.match(refresh, /OPEN_REFRESH_MIN_INTERVAL_MS/);
assert.match(refresh, /flushCalendarOutboxBatch/);
assert.match(refresh, /syncCompanyCalendarFromGoogle/);
assert.match(refresh, /ensureCompanyCalendarWatch/);
assert.match(workspace, /\/api\/admin\/calendar\/google\/refresh/);
assert.match(workspace, /autoRefreshStartedRef/);

assert.match(workspace, /@fullcalendar\/interaction/);
assert.match(workspace, /eventDrop|eventResize|selectable/);
assert.match(projectTab, /Show Calendar/);
assert.match(projectTab, /Upcoming Calendar Events/);
assert.doesNotMatch(projectTab, /Google Calendar Name/);
assert.doesNotMatch(projectTab, /Create Calendar/);

const vercel = JSON.parse(vercelConfig);
const calendarReconcileCron = vercel.crons?.find((cron) => cron.path === "/api/admin/calendar/google/reconcile");
assert.equal(
  calendarReconcileCron?.schedule,
  "5 7 * * *",
  "Google Calendar reconciliation must remain on a Hobby-compatible daily Vercel cron.",
);
assert.match(
  watchChannels,
  /const RENEW_BEFORE_MS = 48 \* 60 \* 60 \* 1000;/,
  "Daily reconciliation must renew Google watch channels at least 48 hours before expiry.",
);

console.log("PASS: Calendar V3 bidirectional contract");