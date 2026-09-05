import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    assert.fail(`Required Admin Calendar scheduling file is missing: ${relativePath}`);
  }
}

const migrationPath = "../modulex-store/supabase/migrations/20260905203000_admin_calendar_scheduling_core.sql";

const [
  canonicalSql,
  migrationSql,
  permissions,
  sidebar,
  calendarDomain,
  normalization,
  calendarRoute,
  calendarPage,
  calendarWorkspace,
  projectCalendarTab,
  googleCalendarProvider,
  googleCalendarRepository,
  discoveryRoute,
  importRoute,
  syncRoute,
] = await Promise.all([
  source("sql/admin-calendar-scheduling-core.sql"),
  source(migrationPath),
  source("src/lib/auth/permissions.ts"),
  source("src/layout/AppSidebar.tsx"),
  source("src/lib/calendar/admin-calendar.ts"),
  source("src/lib/calendar/event-normalization.ts"),
  source("src/app/api/admin/calendar/route.ts"),
  source("src/app/(admin)/calendar/page.tsx"),
  source("src/components/calendar/AdminCalendarWorkspace.tsx"),
  source("src/components/customers/project-detail/ProjectCalendarTab.tsx"),
  source("src/lib/google-calendar/google-calendar.ts"),
  source("src/lib/google-calendar/repository.ts"),
  source("src/app/api/admin/calendar/google/discovery/route.ts"),
  source("src/app/api/admin/calendar/google/import/route.ts"),
  source("src/app/api/admin/calendar/google/sync/route.ts"),
]);

for (const sql of [canonicalSql, migrationSql]) {
  assert.match(sql, /create table if not exists public\.admin_calendars/i);
  assert.match(sql, /owner_profile_id uuid not null references public\.profiles\(id\)/i);
  assert.match(sql, /kind text not null/i);
  assert.match(sql, /project_id uuid references public\.customer_projects\(id\)/i);
  assert.match(sql, /planned_delivery_date date/i);
  assert.match(sql, /primary_installation_id uuid/i);
  assert.match(sql, /admin_calendar_id uuid/i);
  assert.match(sql, /binding_mode text/i);
  assert.match(sql, /google_imported/i);
  assert.match(sql, /provider_data_owner/i);
  assert.match(sql, /provider_access_role/i);
  assert.match(sql, /provider_background_color/i);
  assert.match(sql, /provider_foreground_color/i);
  assert.match(sql, /provider_color_id/i);
  assert.match(sql, /create table if not exists public\.google_calendar_event_mirror/i);
  assert.match(sql, /provider_event_id text not null/i);
  assert.match(sql, /sync_token/i);
  assert.match(sql, /alter table public\.admin_calendars enable row level security/i);
  assert.match(sql, /alter table public\.google_calendar_event_mirror enable row level security/i);
  assert.match(sql, /revoke all on public\.admin_calendars from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.google_calendar_event_mirror from anon, authenticated/i);
  assert.match(sql, /grant all on public\.admin_calendars to service_role/i);
  assert.match(sql, /grant all on public\.google_calendar_event_mirror to service_role/i);
  assert.match(sql, /primary installation/i);
}
assert.equal(canonicalSql.trim(), migrationSql.trim(), "Admin Calendar canonical SQL and migration must stay mirrored exactly.");

assert.match(permissions, /"calendar\.view"/);
assert.match(permissions, /"calendar\.manage"/);
assert.match(permissions, /path === "\/calendar"/);
assert.match(sidebar, /name:\s*"Calendar"/);
assert.match(sidebar, /path:\s*"\/calendar"/);
assert.match(sidebar, /permission:\s*"calendar\.view"/);

for (const eventType of ["project_start", "project_target", "project_delivery", "installation", "google_external"]) {
  assert.match(normalization, new RegExp(eventType));
}
assert.match(normalization, /planned_delivery_date/);
assert.match(normalization, /scheduled_start_at/);
assert.match(normalization, /scheduled_end_at/);
assert.match(normalization, /allDay|all_day/);
assert.match(normalization, /navigation|href|target/);

assert.match(calendarDomain, /listAdminCalendarEvents/);
assert.match(calendarDomain, /listAdminCalendars/);
assert.match(calendarDomain, /owner_profile_id/);
assert.match(calendarDomain, /google_calendar_event_mirror/);
assert.match(calendarDomain, /customer_projects/);
assert.match(calendarDomain, /customer_installations/);
assert.doesNotMatch(calendarDomain, /encrypted_refresh_token|GOOGLE_CALENDAR_CLIENT_SECRET/);

assert.match(calendarRoute, /requirePermission\(request, "calendar\.view"\)/);
assert.match(calendarRoute, /listAdminCalendarEvents/);
assert.match(calendarRoute, /withApiTiming/);
assert.doesNotMatch(calendarRoute, /encrypted_refresh_token|refresh_token/);

assert.match(calendarPage, /PageBreadCrumb|PageBreadcrumb/);
assert.match(calendarPage, /AdminCalendarWorkspace/);
assert.match(calendarWorkspace, /@fullcalendar\/react/);
assert.match(calendarWorkspace, /@fullcalendar\/daygrid/);
assert.match(calendarWorkspace, /@fullcalendar\/timegrid/);
assert.match(calendarWorkspace, /@fullcalendar\/list/);
assert.match(calendarWorkspace, /dayGridMonth/);
assert.match(calendarWorkspace, /timeGridWeek/);
assert.match(calendarWorkspace, /timeGridDay/);
assert.match(calendarWorkspace, /listWeek|listMonth/);
for (const label of ["My Calendar", "Owner", "Project", "Calendar", "Event Type"]) {
  assert.match(calendarWorkspace, new RegExp(label));
}
assert.match(calendarWorkspace, /ADMIN_TEXT_STYLES/);
assert.doesNotMatch(calendarWorkspace, /<(button|input|select|textarea|label|table)\b/);

assert.match(projectCalendarTab, /AdminCalendarWorkspace|ProjectCalendarFeed/);
assert.match(projectCalendarTab, /projectId/);
assert.match(projectCalendarTab, /ADMIN_TEXT_STYLES/);

assert.match(googleCalendarProvider, /calendarList/);
assert.match(googleCalendarProvider, /backgroundColor/);
assert.match(googleCalendarProvider, /foregroundColor/);
assert.match(googleCalendarProvider, /accessRole/);
assert.match(googleCalendarRepository, /provider_data_owner/);
assert.match(googleCalendarRepository, /provider_access_role/);
assert.match(googleCalendarRepository, /google_calendar_event_mirror/);
assert.match(googleCalendarRepository, /sync_token/);

assert.match(discoveryRoute, /requirePermission\(request, "calendar\.manage"\)/);
assert.match(discoveryRoute, /accessRole/);
assert.match(importRoute, /requirePermission\(request, "calendar\.manage"\)/);
assert.match(importRoute, /ownerProfileId|owner_profile_id/);
assert.match(importRoute, /owner/i);
assert.match(syncRoute, /requirePermission\(request, "calendar\.manage"\)/);
assert.match(syncRoute, /syncToken|sync_token/);
assert.match(syncRoute, /410/);
assert.doesNotMatch(`${discoveryRoute}\n${importRoute}\n${syncRoute}`, /customer_projects.*(?:insert|update)|customer_installations.*(?:insert|update)/is);

console.log("PASS: Admin Calendar scheduling core contract");
