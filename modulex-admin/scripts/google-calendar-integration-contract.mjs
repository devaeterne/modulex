import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    assert.fail(`Required Google Calendar integration file is missing: ${relativePath}`);
  }
}

const migrationPath = "../modulex-store/supabase/migrations/20260905170000_google_calendar_project_integration.sql";

const [
  configSource,
  cryptoSource,
  templateSource,
  authSource,
  envSource,
  canonicalSql,
  migrationSql,
  repositorySource,
  oauthSource,
  calendarSource,
  accessSource,
  oauthStartRoute,
  oauthCallbackRoute,
  statusRoute,
  connectionRoute,
] = await Promise.all([
  source("src/lib/google-calendar/config.ts"),
  source("src/lib/google-calendar/crypto.ts"),
  source("src/lib/google-calendar/template.ts"),
  source("src/lib/auth/admin-api.ts"),
  source(".env.example"),
  source("sql/google-calendar-project-integration.sql"),
  source(migrationPath),
  source("src/lib/google-calendar/repository.ts"),
  source("src/lib/google-calendar/google-oauth.ts"),
  source("src/lib/google-calendar/google-calendar.ts"),
  source("src/lib/google-calendar/access.ts"),
  source("src/app/api/admin/google-calendar/oauth/start/route.ts"),
  source("src/app/api/admin/google-calendar/oauth/callback/route.ts"),
  source("src/app/api/admin/google-calendar/status/route.ts"),
  source("src/app/api/admin/google-calendar/connection/route.ts"),
]);

assert.match(configSource, /GOOGLE_CALENDAR_CLIENT_ID/);
assert.match(configSource, /GOOGLE_CALENDAR_CLIENT_SECRET/);
assert.match(configSource, /GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY/);
assert.match(configSource, /calendar\.app\.created/);
assert.match(configSource, /openid/);
assert.match(configSource, /email/);
assert.match(cryptoSource, /aes-256-gcm/);
assert.match(cryptoSource, /randomBytes\(12\)/);
assert.match(templateSource, /project_no/);
assert.match(templateSource, /project_name/);
assert.match(templateSource, /customer_name/);
assert.match(authSource, /requirePermission/);
assert.match(envSource, /GOOGLE_CALENDAR_CLIENT_ID=/);
assert.match(envSource, /GOOGLE_CALENDAR_CLIENT_SECRET=/);
assert.match(envSource, /GOOGLE_CALENDAR_REDIRECT_URI=/);
assert.match(envSource, /GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=/);

for (const sql of [canonicalSql, migrationSql]) {
  assert.match(sql, /create table if not exists public\.calendar_integration_credentials/i);
  assert.match(sql, /create table if not exists public\.calendar_integration_settings/i);
  assert.match(sql, /create table if not exists public\.calendar_oauth_states/i);
  assert.match(sql, /create table if not exists public\.project_calendar_bindings/i);
  assert.match(sql, /create table if not exists public\.project_calendar_event_links/i);
  assert.match(sql, /project_id uuid not null references public\.customer_projects\(id\)/i);
  assert.match(sql, /constraint calendar_integration_credentials_singleton check \(id = 1\)/i);
  assert.match(sql, /constraint calendar_integration_settings_singleton check \(id = 1\)/i);
  assert.match(sql, /unique \(project_id\)/i);
  assert.match(sql, /unique \(project_calendar_binding_id, source_type, source_id\)/i);
  assert.match(sql, /calendar_event_link_source_integrity/i);
  assert.match(sql, /revoke all on public\.calendar_integration_credentials from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.calendar_oauth_states from anon, authenticated/i);
  assert.match(sql, /grant all on public\.calendar_integration_credentials to service_role/i);
  assert.match(sql, /grant all on public\.calendar_oauth_states to service_role/i);
  assert.match(sql, /alter table public\.calendar_integration_credentials enable row level security/i);
  assert.match(sql, /alter table public\.project_calendar_event_links enable row level security/i);
}

assert.equal(canonicalSql.trim(), migrationSql.trim(), "Canonical SQL and migration must stay mirrored exactly.");

assert.match(repositorySource, /getCalendarIntegrationSettings/);
assert.match(repositorySource, /updateCalendarIntegrationSettings/);
assert.match(repositorySource, /saveConnectedGoogleCredential/);
assert.match(repositorySource, /retireGoogleCredential/);
assert.match(repositorySource, /createCalendarOAuthState/);
assert.match(repositorySource, /consumeCalendarOAuthState/);
assert.match(repositorySource, /getProjectCalendarBinding/);
assert.match(repositorySource, /upsertProjectCalendarBinding/);
assert.match(repositorySource, /getProjectCalendarEventLink/);
assert.match(repositorySource, /upsertProjectCalendarEventLink/);
assert.doesNotMatch(repositorySource, /NEXT_PUBLIC_GOOGLE/);

assert.match(oauthSource, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
assert.match(oauthSource, /oauth2\.googleapis\.com\/token/);
assert.match(oauthSource, /openidconnect\.googleapis\.com\/v1\/userinfo/);
assert.match(oauthSource, /createGoogleAuthorizationUrl/);
assert.match(oauthSource, /exchangeGoogleAuthorizationCode/);
assert.match(oauthSource, /refreshGoogleAccessToken/);
assert.match(oauthSource, /revokeGoogleRefreshToken/);
assert.match(oauthSource, /randomBytes\(32\)/);
assert.match(oauthSource, /createHash\("sha256"\)/);
assert.match(oauthSource, /timingSafeEqual/);
assert.doesNotMatch(oauthSource, /console\.(log|info|warn|error)\([^\n]*(access_token|refresh_token|client_secret)/i);

assert.match(calendarSource, /www\.googleapis\.com\/calendar\/v3\/calendars/);
assert.match(calendarSource, /createGoogleProjectCalendar/);
assert.match(calendarSource, /renameGoogleProjectCalendar/);
assert.match(calendarSource, /createGoogleCalendarEvent/);
assert.match(calendarSource, /updateGoogleCalendarEvent/);
assert.match(calendarSource, /deleteGoogleCalendarEvent/);
assert.match(calendarSource, /GoogleCalendarProviderError/);
assert.doesNotMatch(calendarSource, /console\.(log|info|warn|error)\([^\n]*(accessToken|refreshToken)/i);

assert.match(accessSource, /getConnectedGoogleAccessToken/);
assert.match(accessSource, /decryptRefreshToken/);
assert.match(accessSource, /refreshGoogleAccessToken/);
assert.match(accessSource, /invalid_grant/);

assert.match(oauthStartRoute, /requirePermission\(request, "settings\.manage"\)/);
assert.match(oauthStartRoute, /createCalendarOAuthState/);
assert.match(oauthStartRoute, /HttpOnly/);
assert.match(oauthStartRoute, /SameSite=Lax/);
assert.match(oauthStartRoute, /Max-Age=600/);
assert.match(oauthStartRoute, /withApiTiming/);
assert.doesNotMatch(oauthStartRoute, /refresh_token|client_secret/i);

assert.match(oauthCallbackRoute, /timingSafeOAuthStateEqual/);
assert.match(oauthCallbackRoute, /consumeCalendarOAuthState/);
assert.match(oauthCallbackRoute, /exchangeGoogleAuthorizationCode/);
assert.match(oauthCallbackRoute, /fetchGoogleUserInfo/);
assert.match(oauthCallbackRoute, /encryptRefreshToken/);
assert.match(oauthCallbackRoute, /saveConnectedGoogleCredential/);
assert.match(oauthCallbackRoute, /Max-Age=0/);
assert.doesNotMatch(oauthCallbackRoute, /console\.(log|info|warn|error)/);

assert.match(statusRoute, /requirePermission\(request, "settings\.view"\)/);
assert.match(statusRoute, /requirePermission\(request, "settings\.manage"\)/);
assert.match(statusRoute, /validateCalendarNameTemplate/);
assert.match(statusRoute, /sync_deliveries: false/);
assert.match(statusRoute, /sync_measurements: false/);
assert.match(statusRoute, /sync_customer_appointments: false/);
assert.match(statusRoute, /withApiTiming/);
assert.doesNotMatch(statusRoute, /encrypted_refresh_token/);

assert.match(connectionRoute, /requirePermission\(request, "settings\.manage"\)/);
assert.match(connectionRoute, /revokeGoogleRefreshToken/);
assert.match(connectionRoute, /retireGoogleCredential/);
assert.match(connectionRoute, /withApiTiming/);

console.log("Google Calendar integration foundation, persistence, server-boundary, and OAuth API contract passed.");
