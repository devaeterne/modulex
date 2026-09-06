import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (p) => readFile(path.join(root, p), "utf8");

const [sql, migration, config, provider, syncEngine, eventRoute, webhook, reconcile, workspace, projectTab] = await Promise.all([
  source("sql/calendar-v3-bidirectional.sql"),
  source("../modulex-store/supabase/migrations/20260906113000_calendar_v3_bidirectional.sql"),
  source("src/lib/google-calendar/config.ts"),
  source("src/lib/google-calendar/google-calendar.ts"),
  source("src/lib/google-calendar/bidirectional-sync.ts"),
  source("src/app/api/admin/calendar/events/route.ts"),
  source("src/app/api/admin/calendar/google/webhook/route.ts"),
  source("src/app/api/admin/calendar/google/reconcile/route.ts"),
  source("src/components/calendar/AdminCalendarWorkspace.tsx"),
  source("src/components/customers/project-detail/ProjectCalendarTab.tsx"),
]);

assert.equal(sql.trim(), migration.trim());
for (const token of [
  "calendar_events",
  "calendar_provider_event_links",
  "calendar_sync_outbox",
  "calendar_google_watch_channels",
  "calendar_sync_conflicts",
  "calendar_business_event_extensions",
  "company_shared",
]) assert.match(sql, new RegExp(token));
assert.match(config, /calendar\.events/);
assert.doesNotMatch(config, /GOOGLE_CALENDAR_IMPORT_SCOPES[\s\S]*calendar\.events\.owned/);
assert.match(provider, /events\/watch|watchGoogleCalendarEvents/);
assert.match(provider, /PATCH/);
assert.match(syncEngine, /syncToken|sync_token/);
assert.match(syncEngine, /410|sync_token_gone/);
assert.match(syncEngine, /calendar_sync_outbox/);
assert.match(syncEngine, /calendar_sync_conflicts/);
assert.match(eventRoute, /requirePermission\(request, "calendar\.manage"\)/);
assert.match(webhook, /x-goog-channel-id/i);
assert.match(webhook, /x-goog-resource-id/i);
assert.match(reconcile, /CRON_SECRET|cron/i);
assert.match(workspace, /@fullcalendar\/interaction/);
assert.match(workspace, /eventDrop|eventResize|selectable/);
assert.match(projectTab, /Show Calendar/);
assert.match(projectTab, /Upcoming Calendar Events/);
assert.doesNotMatch(projectTab, /Google Calendar Name/);
assert.doesNotMatch(projectTab, /Create Calendar/);
console.log("PASS: Calendar V3 bidirectional contract");
