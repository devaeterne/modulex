# Google Calendar Project Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side Google Calendar integration for Oakwell with one Google OAuth connection, one Modulex-managed calendar per Project, Admin-managed business settings, and idempotent outbound Installation event synchronization.

**Architecture:** Modulex remains canonical. Google OAuth client credentials and the token-encryption key live only in server environment configuration; the refresh token is encrypted with AES-256-GCM before DB storage. Admin settings live in Supabase, Project calendars and event mappings are projection metadata, and Google calls are made only from authenticated Next.js server routes/services. V1 projects canonical `customer_installations.scheduled_start_at/scheduled_end_at`; Shipment delivery, measurement, and appointment toggles remain unavailable until those domains have stable canonical scheduling fields.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase/Postgres, existing Modulex RBAC, native `fetch`, Node `crypto`, Google OAuth 2.0, Google Calendar API v3.

**Spec:** `docs/superpowers/specs/2026-09-05-google-calendar-project-integration-design.md`

## Global Constraints

- Work from current `main` before implementation and preserve parallel Modulex work.
- Branch: `feat/google-calendar-project-integration` or a safe unique variant if already occupied by another active worker.
- V1 is single-company and follows the existing `general_settings` singleton architecture; do not add speculative `company_id` columns.
- V1 sync direction is Modulex -> Google only.
- Calendar scope remains `https://www.googleapis.com/auth/calendar.app.created`; add only `openid email` identity scopes so Admin can display the connected Google account.
- Never expose OAuth client secret, token-encryption key, authorization code, access token, refresh token, Supabase secret/service-role key, or raw Google credential payloads to browser code or logs.
- Refresh tokens must be encrypted with AES-256-GCM before persistence.
- Google provider failures must never roll back valid Modulex business mutations.
- Settings mutation requires `settings.manage`; Project Calendar mutation requires `projects.manage`; read surfaces respect `settings.view` / `projects.view`.
- Reuse `withApiTiming()` for every new Admin API route.
- Reuse shared Admin UI primitives and pass `npm run smoke:admin-ui-strict` for every changed/new feature UI file.
- Do not modify Store/Customer Portal/Dealer Portal behavior.
- No live Google write happens merely because schema/code is deployed; the Oakwell account must be explicitly connected and integration enabled.

---

## File Structure

### New server/domain files

- `modulex-admin/src/lib/google-calendar/config.ts` — server-only runtime config validation and redirect-origin resolution.
- `modulex-admin/src/lib/google-calendar/crypto.ts` — AES-256-GCM refresh-token envelope encode/decode.
- `modulex-admin/src/lib/google-calendar/template.ts` — calendar-name template validation/rendering.
- `modulex-admin/src/lib/google-calendar/types.ts` — shared server/browser-safe DTO types; contains no secret-bearing types.
- `modulex-admin/src/lib/google-calendar/repository.ts` — server-only Supabase Admin persistence for credentials, settings, OAuth states, bindings, event links.
- `modulex-admin/src/lib/google-calendar/google-oauth.ts` — authorization URL, code exchange, refresh, ID-token/user identity handling.
- `modulex-admin/src/lib/google-calendar/google-calendar.ts` — Calendar API create/update/delete helpers using native `fetch`.
- `modulex-admin/src/lib/google-calendar/project-calendar.ts` — idempotent Project calendar creation/rename/status/resync orchestration.
- `modulex-admin/src/lib/google-calendar/installation-projection.ts` — canonical Installation -> Google event mapping and idempotent sync.
- `modulex-admin/src/lib/google-calendar/client.ts` — browser-safe authenticated fetch helpers for Admin components.

### New API routes

- `modulex-admin/src/app/api/admin/google-calendar/status/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/settings/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/oauth/start/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/oauth/callback/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/disconnect/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/projects/[projectId]/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/projects/[projectId]/resync/route.ts`
- `modulex-admin/src/app/api/admin/google-calendar/installations/[installationId]/sync/route.ts`

### New Admin UI

- `modulex-admin/src/app/(admin)/settings/integrations/google-calendar/page.tsx`
- `modulex-admin/src/components/settings/GoogleCalendarSettings.tsx`
- `modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx`

### Schema / contracts

- `modulex-admin/sql/google-calendar-project-integration.sql` — readable canonical SQL mirror.
- `modulex-store/supabase/migrations/20260905010000_google_calendar_project_integration.sql` — shared production migration.
- `modulex-admin/scripts/google-calendar-integration-contract.mjs` — static/behavioral contract suite.
- `modulex-admin/package.json` — add `smoke:google-calendar` and wire into appropriate Admin smoke chain without creating a new workflow file.
- `modulex-admin/.env.example` — server-only Google runtime variables.
- `modulex-admin/ADMIN_ROADMAP.md` — mark package active/completed according to verification state.

### Existing files intentionally modified

- `modulex-admin/src/lib/auth/admin-api.ts` — extract reusable authenticated actor resolver and add permission-aware server guard without weakening `requireAdmin`.
- `modulex-admin/src/layout/AppSidebar.tsx` — add Google Calendar under General Settings with `settings.view`.
- `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx` — add `Calendar` tab and render `ProjectCalendarTab`.
- `modulex-admin/src/components/customers/CreateInstallationFromOrder.tsx` — after canonical RPC success, fire best-effort installation sync before navigation.
- `modulex-admin/src/components/customers/CustomerInstallationDetail.tsx` — replace legacy native controls touched by this work with shared primitives, then invoke best-effort sync after status mutations so cancellation/provider state is projected.

---

### Task 1: Lock runtime configuration, templates, encryption, and permission guard contracts

**Files:**
- Create: `modulex-admin/src/lib/google-calendar/config.ts`
- Create: `modulex-admin/src/lib/google-calendar/crypto.ts`
- Create: `modulex-admin/src/lib/google-calendar/template.ts`
- Create: `modulex-admin/src/lib/google-calendar/types.ts`
- Modify: `modulex-admin/src/lib/auth/admin-api.ts`
- Modify: `modulex-admin/.env.example`
- Create: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Modify: `modulex-admin/package.json`

**Interfaces:**
- Produces: `getGoogleCalendarConfig()`, `encryptRefreshToken()`, `decryptRefreshToken()`, `validateCalendarNameTemplate()`, `renderCalendarNameTemplate()`, `requirePermission(request, permission)`.
- Consumes: existing `Permission`, `hasPermission`, `supabaseAdmin`, `jsonError`.

- [ ] **Step 1: Write RED contract assertions**

Add assertions in `scripts/google-calendar-integration-contract.mjs` that require:

```js
assert.match(configSource, /GOOGLE_CALENDAR_CLIENT_ID/);
assert.match(configSource, /GOOGLE_CALENDAR_CLIENT_SECRET/);
assert.match(configSource, /GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY/);
assert.match(cryptoSource, /aes-256-gcm/);
assert.match(templateSource, /project_no/);
assert.match(templateSource, /customer_name/);
assert.match(authSource, /requirePermission/);
```

Also execute pure helper checks by importing compiled-compatible `.ts` only if the current contract harness already supports TS loading; otherwise keep the contract structural here and add runtime behavior checks in Task 4 route/service tests.

- [ ] **Step 2: Run RED contract**

Run:

```bash
cd modulex-admin
node scripts/google-calendar-integration-contract.mjs
```

Expected: FAIL because Google Calendar files do not exist.

- [ ] **Step 3: Implement server config**

`config.ts` must be server-only and return exactly:

```ts
export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  redirectUri: string;
};

export function getGoogleCalendarConfig(requestUrl?: string): GoogleCalendarConfig;
export function isGoogleCalendarConfigured(): boolean;
```

Validate the encryption key as a base64-encoded 32-byte key. Prefer `GOOGLE_CALENDAR_REDIRECT_URI`; otherwise derive `${NEXT_PUBLIC_SITE_URL}/api/admin/google-calendar/oauth/callback`, and only fall back to the request origin when the configured site URL is absent.

- [ ] **Step 4: Implement AES-256-GCM envelope**

Use Node `crypto` with a versioned string envelope:

```ts
export function encryptRefreshToken(plainText: string, key: Buffer): string;
export function decryptRefreshToken(envelope: string, key: Buffer): string;
```

Envelope format:

```text
v1.<base64url-iv>.<base64url-ciphertext>.<base64url-auth-tag>
```

Use a fresh 12-byte IV on every encryption; reject malformed/tampered envelopes.

- [ ] **Step 5: Implement calendar name templates**

Allowed placeholders are exactly:

```ts
export const CALENDAR_NAME_PLACEHOLDERS = [
  "project_no",
  "project_name",
  "customer_name",
] as const;
```

Expose:

```ts
export function validateCalendarNameTemplate(template: string): { ok: true } | { ok: false; error: string };
export function renderCalendarNameTemplate(template: string, values: Record<"project_no" | "project_name" | "customer_name", string>): string;
```

Reject unknown placeholders and rendered blank names; normalize repeated whitespace.

- [ ] **Step 6: Add permission-aware server guard**

Refactor `admin-api.ts` so token/profile/roles are resolved once internally, preserving `requireAdmin()` behavior, then add:

```ts
export async function requirePermission(
  request: Request,
  permission: Permission
): Promise<{ actor: AdminActor; response?: never } | { actor?: never; response: Response }>;
```

Return 403 when `hasPermission(actor.profile.roles, permission)` is false.

- [ ] **Step 7: Add env documentation and npm script**

Append server-only variables:

```text
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=
```

Add:

```json
"smoke:google-calendar": "node scripts/google-calendar-integration-contract.mjs"
```

Do not create a new workflow file.

- [ ] **Step 8: Run GREEN contract plus auth regression**

```bash
npm run smoke:google-calendar
npm run smoke:rbac
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/src/lib/auth/admin-api.ts modulex-admin/.env.example modulex-admin/scripts/google-calendar-integration-contract.mjs modulex-admin/package.json
git commit -m "feat(calendar): add secure integration foundations"
```

---

### Task 2: Add fail-closed database schema, RLS, grants, and OAuth replay protection

**Files:**
- Create: `modulex-admin/sql/google-calendar-project-integration.sql`
- Create: `modulex-store/supabase/migrations/20260905010000_google_calendar_project_integration.sql`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Modify: `modulex-admin/ADMIN_ROADMAP.md`

**Interfaces:**
- Produces DB tables: `calendar_integration_credentials`, `calendar_integration_settings`, `calendar_oauth_states`, `project_calendar_bindings`, `project_calendar_event_links`.
- Credentials/OAuth-state tables are service-boundary only; browser users never receive encrypted token/state secret material.

- [ ] **Step 1: Extend RED schema contract**

Assert both SQL files contain the five tables, singleton checks, project FK, unique event identity, RLS enablement, anon revokes, and no authenticated SELECT grant on `calendar_integration_credentials` or `calendar_oauth_states`.

- [ ] **Step 2: Run RED schema contract**

```bash
npm run smoke:google-calendar
```

Expected: FAIL on missing SQL.

- [ ] **Step 3: Implement settings and credential schema**

Use:

```sql
create table public.calendar_integration_credentials (
  id smallint primary key default 1 check (id = 1),
  provider text not null default 'google' check (provider = 'google'),
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  provider_account_id text,
  provider_account_email text,
  encrypted_refresh_token text,
  granted_scopes text[] not null default '{}',
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`calendar_integration_settings` is singleton `id=1`, defaults integration disabled, auto-create true, template `{project_no} - {customer_name}`, optional timezone override, installations true, and unsupported source toggles false.

- [ ] **Step 4: Implement replay-safe OAuth state table**

Store only a hash of the random state token:

```sql
create table public.calendar_oauth_states (
  state_hash text primary key,
  initiated_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
```

The raw OAuth state value never enters the DB.

- [ ] **Step 5: Implement Project binding/event link integrity**

`project_calendar_bindings.project_id` references canonical Project table discovered from `project-domain.ts`/PB migrations and is unique. `project_calendar_event_links` contains `source_type`, `source_id`, `provider_event_id`, fingerprint/status/error metadata and unique `(project_calendar_binding_id, source_type, source_id)`.

Add a DB trigger/check function that rejects an event link whose `project_id` does not equal its binding's Project.

- [ ] **Step 6: Apply authorization boundaries**

- `calendar_integration_settings`: authenticated SELECT for roles with existing Settings visibility semantics; UPDATE only Admin/Super Admin-equivalent DB role predicate.
- credential/state tables: no `anon`; no direct authenticated browser grants.
- bindings/event links: browser-safe SELECT only when existing Project visibility allows it; provider IDs/error metadata may be readable, encrypted token material never exists in these tables.
- all structural mutation is server-side service role or narrowly reviewed RPC; do not grant generic browser INSERT/UPDATE for projection metadata.

- [ ] **Step 7: Mirror migration exactly and mark roadmap `[~]`**

The Admin SQL mirror and shared migration must contain equivalent schema/security behavior. Add a roadmap row describing Google Calendar as active, single-company, outbound-only, Installation-first.

- [ ] **Step 8: Run DB/static gates**

```bash
npm run smoke:google-calendar
npm run smoke:rbac
```

Expected: PASS. Do not apply production migration before owner merge/review unless explicitly requested.

- [ ] **Step 9: Commit**

```bash
git add modulex-admin/sql/google-calendar-project-integration.sql modulex-store/supabase/migrations/20260905010000_google_calendar_project_integration.sql modulex-admin/scripts/google-calendar-integration-contract.mjs modulex-admin/ADMIN_ROADMAP.md
git commit -m "feat(db): add Google Calendar projection schema"
```

---

### Task 3: Build server-only repository, OAuth, and Google Calendar clients

**Files:**
- Create: `modulex-admin/src/lib/google-calendar/repository.ts`
- Create: `modulex-admin/src/lib/google-calendar/google-oauth.ts`
- Create: `modulex-admin/src/lib/google-calendar/google-calendar.ts`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`

**Interfaces:**
- Produces: credential/settings/state CRUD, `buildGoogleAuthorizationUrl()`, `exchangeGoogleAuthorizationCode()`, `getGoogleAccessToken()`, `createGoogleCalendar()`, `renameGoogleCalendar()`, `upsertGoogleEvent()`, `deleteGoogleEvent()`.

- [ ] **Step 1: Add RED server-boundary contract**

Require every new file to contain `import "server-only";`; assert no `NEXT_PUBLIC_GOOGLE*` variables and no credential-bearing DTO is exported from browser-safe types.

- [ ] **Step 2: Implement repository**

Use `supabaseAdmin` only. Expose focused functions such as:

```ts
getIntegrationStatus();
getIntegrationSettings();
updateIntegrationSettings(input, actorId);
storeConnectedCredential(input);
markCredentialDisconnected(actorId);
createOAuthState({ stateHash, actorId, expiresAt });
consumeOAuthState({ stateHash, actorId, now });
getProjectCalendarBinding(projectId);
insertProjectCalendarBinding(input);
upsertProjectEventLink(input);
```

`consumeOAuthState` must atomically reject missing, expired, already-consumed, or wrong-actor states.

- [ ] **Step 3: Implement OAuth flow helpers**

Authorization URL parameters must include:

```text
response_type=code
access_type=offline
prompt=consent
scope=openid email https://www.googleapis.com/auth/calendar.app.created
```

Code exchange uses `https://oauth2.googleapis.com/token`. Require a refresh token on initial/reconnect callback; encrypt it before repository storage. Parse the returned ID token payload only for provider subject/email after validating that token exchange succeeded; do not log the token.

- [ ] **Step 4: Implement refresh helper**

Decrypt the stored refresh token, POST grant type `refresh_token`, return an in-memory access token. Normalize `invalid_grant` to `GOOGLE_RECONNECT_REQUIRED`; transient 429/5xx to retryable provider errors.

- [ ] **Step 5: Implement Calendar API client**

Use `https://www.googleapis.com/calendar/v3` and native `fetch`:

```ts
createGoogleCalendar(accessToken, { summary, timeZone });
renameGoogleCalendar(accessToken, calendarId, { summary, timeZone });
createGoogleEvent(accessToken, calendarId, event);
updateGoogleEvent(accessToken, calendarId, eventId, event);
deleteGoogleEvent(accessToken, calendarId, eventId);
```

Treat 404 separately so orchestration can repair missing calendars/events.

- [ ] **Step 6: Run focused gates**

```bash
npm run smoke:google-calendar
npm run typecheck
npm run lint -- --quiet
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/scripts/google-calendar-integration-contract.mjs
git commit -m "feat(calendar): add Google OAuth and provider clients"
```

---

### Task 4: Add Admin settings/status/connect/reconnect/disconnect APIs

**Files:**
- Create: API routes under `modulex-admin/src/app/api/admin/google-calendar/...`
- Create: `modulex-admin/src/lib/google-calendar/client.ts`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`

**Interfaces:**
- Browser-safe status DTO excludes all secret material.
- GET settings/status requires `settings.view`; PATCH/connect/reconnect/disconnect requires `settings.manage`.

- [ ] **Step 1: RED route inventory contract**

Assert every route exists and uses both `requirePermission` and `withApiTiming`.

- [ ] **Step 2: Implement `GET /status`**

Return only:

```ts
{
  configured: boolean;
  status: "connected" | "disconnected" | "error";
  accountEmail: string | null;
  connectedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
}
```

- [ ] **Step 3: Implement settings GET/PATCH**

Normalize booleans/strings; validate template and IANA timezone via `Intl.DateTimeFormat(undefined, { timeZone })`. Unsupported source toggles (`deliveries`, `measurements`, `customerAppointments`) remain false and PATCH rejects attempts to enable them with a clear 400 response.

- [ ] **Step 4: Implement OAuth start/callback**

Start route creates 32 random bytes, stores SHA-256 hash with 10-minute expiry tied to actor, returns/redirects to Google authorization URL. Callback requires authenticated Admin actor, hashes received state, atomically consumes matching state, exchanges code, encrypts refresh token, stores connection metadata, then redirects to `/settings/integrations/google-calendar?connected=1`.

- [ ] **Step 5: Implement disconnect**

Disconnect marks credential disconnected, clears encrypted refresh token/provider account metadata, preserves historical Project bindings/event links, and stops future sync.

- [ ] **Step 6: Implement browser-safe client helpers**

`client.ts` obtains the current Supabase session access token and wraps authenticated calls; no Google token ever crosses this boundary.

- [ ] **Step 7: Run API gates**

```bash
npm run smoke:google-calendar
npm run smoke:api-timing
npm run smoke:api
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modulex-admin/src/app/api/admin/google-calendar modulex-admin/src/lib/google-calendar/client.ts modulex-admin/scripts/google-calendar-integration-contract.mjs
git commit -m "feat(calendar): add Admin OAuth and settings APIs"
```

---

### Task 5: Build Google Calendar Admin Settings UI and navigation

**Files:**
- Create: `modulex-admin/src/app/(admin)/settings/integrations/google-calendar/page.tsx`
- Create: `modulex-admin/src/components/settings/GoogleCalendarSettings.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`

**Interfaces:**
- Consumes browser-safe API client from Task 4.
- Produces the owner-facing management surface for connect/reconnect/disconnect and DB-backed business settings.

- [ ] **Step 1: RED UI contract**

Require the route, sidebar entry `Google Calendar`, shared `ComponentCard`, `Button`, `Alert`, `Label`, `Input`, and existing shared switch/checkbox primitive used elsewhere.

- [ ] **Step 2: Add sidebar route**

Under `General Settings` add:

```ts
{ name: "Google Calendar", path: "/settings/integrations/google-calendar", permission: "settings.view" }
```

Do not touch legacy `GeneralSettingsOverview`.

- [ ] **Step 3: Create page shell**

Use `PageBreadcrumb pageTitle="Google Calendar"` and render `GoogleCalendarSettings`.

- [ ] **Step 4: Implement settings states**

Render explicit loading/error/disconnected/connected/error-reconnect states. `settings.manage` users can edit; `settings.view` users see read-only values.

Editable fields:

- integration enabled
- auto-create Project Calendar
- calendar name template
- optional timezone override with current company timezone fallback shown
- Installation sync toggle

Show Delivery/Measurement/Customer Appointment as disabled "Not available yet — no canonical Modulex schedule source" controls rather than pretending they work.

- [ ] **Step 5: Implement connection actions**

Connect/Reconnect navigates to OAuth start endpoint via an authenticated fetch that returns authorization URL, then `window.location.assign(url)`. Disconnect uses a confirmation modal and server call.

- [ ] **Step 6: Run strict UI gates**

```bash
ADMIN_UI_STRICT_FILES='src/app/(admin)/settings/integrations/google-calendar/page.tsx,src/components/settings/GoogleCalendarSettings.tsx' npm run smoke:admin-ui-strict
npm run smoke:admin-ui
npm run smoke:google-calendar
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modulex-admin/src/app/'(admin)'/settings/integrations/google-calendar modulex-admin/src/components/settings/GoogleCalendarSettings.tsx modulex-admin/src/layout/AppSidebar.tsx modulex-admin/scripts/google-calendar-integration-contract.mjs
git commit -m "feat(admin): add Google Calendar settings UI"
```

---

### Task 6: Add idempotent Project Calendar binding service, APIs, and Project tab

**Files:**
- Create: `modulex-admin/src/lib/google-calendar/project-calendar.ts`
- Create: `modulex-admin/src/app/api/admin/google-calendar/projects/[projectId]/route.ts`
- Create: `modulex-admin/src/app/api/admin/google-calendar/projects/[projectId]/resync/route.ts`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`

**Interfaces:**
- Produces `ensureProjectCalendar(projectId, actorId)`, `renameProjectCalendar(projectId, name, actorId)`, `resyncProjectCalendar(projectId, actorId)`.

- [ ] **Step 1: RED Project contract**

Require `Calendar` in `PROJECT_TABS`, `ProjectCalendarTab`, project API routes, and uniqueness/idempotency logic in service.

- [ ] **Step 2: Implement canonical Project lookup**

Read canonical Project/customer data through server-side Supabase Admin using Project id. Render name through `renderCalendarNameTemplate()`. Resolve timezone from Calendar override then `general_settings.timezone`.

- [ ] **Step 3: Implement `ensureProjectCalendar`**

Algorithm:

```text
1. Fail closed when integration disabled/disconnected/unconfigured.
2. Return existing binding when present.
3. Obtain access token.
4. Create secondary Google Calendar.
5. Insert binding with unique project_id.
6. If concurrent insert wins, keep canonical DB binding and avoid a duplicate retry path.
```

For the race case, if Google calendar creation succeeded but binding insert loses uniqueness, record a normalized orphan warning for operator cleanup rather than overwriting the winning binding.

- [ ] **Step 4: Implement Project API**

GET requires `projects.view`. POST create and PATCH rename/sync-enabled require `projects.manage`. The route exposes browser-safe binding/status only.

- [ ] **Step 5: Implement manual resync**

Resync ensures binding then calls Installation projection for every non-cancelled/cancelled canonical Installation under Orders belonging to that Project.

- [ ] **Step 6: Add Project tab**

Append `Calendar` to `PROJECT_TABS` and render `ProjectCalendarTab` when active. The tab shows connection state, calendar name, sync enabled, last sync/error, Create Calendar, Open Google Calendar, Rename, Disable/Enable Sync, and Resync.

- [ ] **Step 7: Run Project/UI gates**

```bash
npm run smoke:google-calendar
npm run smoke:rbac
ADMIN_UI_STRICT_FILES='src/components/customers/project-detail/ProjectCalendarTab.tsx,src/components/customers/ProjectDetailWorkspace.tsx' npm run smoke:admin-ui-strict
npm run smoke:admin-ui
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modulex-admin/src/lib/google-calendar/project-calendar.ts modulex-admin/src/app/api/admin/google-calendar/projects modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx modulex-admin/scripts/google-calendar-integration-contract.mjs
git commit -m "feat(project): add Google Calendar binding controls"
```

---

### Task 7: Project canonical Installations to Google events idempotently

**Files:**
- Create: `modulex-admin/src/lib/google-calendar/installation-projection.ts`
- Create: `modulex-admin/src/app/api/admin/google-calendar/installations/[installationId]/sync/route.ts`
- Modify: `modulex-admin/src/components/customers/CreateInstallationFromOrder.tsx`
- Modify: `modulex-admin/src/components/customers/CustomerInstallationDetail.tsx`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`

**Interfaces:**
- Produces `syncInstallationToGoogle(installationId)` and `syncProjectInstallations(projectId)`.
- Source identity is `source_type='installation'`, `source_id=customer_installations.id`.

- [ ] **Step 1: RED projection contract**

Require source fields `scheduled_start_at`, `scheduled_end_at`, `installation_number`, status handling, order->project verification, fingerprint, and event-link uniqueness.

- [ ] **Step 2: Build canonical Installation query**

Join Installation -> Order -> Project -> Customer server-side. Reject installations whose Order has no Project. Do not infer a Project from customer alone.

- [ ] **Step 3: Map safe Google event payload**

Payload fields:

```ts
{
  summary: `Installation — ${project.project_number} — ${customer.name}`,
  start: { dateTime: installation.scheduled_start_at, timeZone },
  end: { dateTime: installation.scheduled_end_at ?? defaultEnd, timeZone },
  description: `Modulex Project: ${project.project_number}\nInstallation: ${installation.installation_number}`,
  location: approvedAddressStringOrUndefined,
}
```

When no end exists, use start + 2 hours as a projection-only default; never write that derived end back to Modulex.

Never include `internal_notes`, costs, margin, payment data, credentials, or phone numbers in the Google event.

- [ ] **Step 4: Implement fingerprint/idempotency**

Hash normalized projection payload with SHA-256. If event link exists and fingerprint is unchanged, mark success/return without provider write. If link exists and changed, update same Google event id. If Google returns event 404, create a replacement event and update the link.

- [ ] **Step 5: Implement cancellation behavior**

When canonical Installation status is `cancelled`, delete mapped Google event if present; retain event-link history with sync status `cancelled` and no business-row deletion.

- [ ] **Step 6: Ensure Project calendar before first event**

When auto-create is true and no binding exists, call `ensureProjectCalendar`. When auto-create false, record `calendar_not_bound` and do not create a provider calendar.

- [ ] **Step 7: Add sync API**

POST requires `projects.manage` after resolving the Installation's Project. Provider errors return a retryable sync result but the endpoint never changes Installation business state.

- [ ] **Step 8: Hook Installation creation best-effort**

After `create_customer_installation_from_order` succeeds in `CreateInstallationFromOrder.tsx`, call browser client sync for the returned Installation id. If sync fails, do not block navigation or undo the appointment; expose a non-blocking warning only when the current UI can display it before redirect, otherwise rely on Project Calendar error state/manual resync.

- [ ] **Step 9: Modernize touched Installation detail controls and hook lifecycle sync**

Because `CustomerInstallationDetail.tsx` is legacy and modifying it triggers strict UI review, replace touched native `button`/`textarea`/alert/card appearances with existing shared `Button`, `TextArea`, `Alert`, `ComponentCard`, and `Badge` patterns while preserving the exact status RPC and lifecycle semantics. After `set_customer_installation_status` succeeds, call Installation sync best-effort so cancellation removes the Google event.

- [ ] **Step 10: Run Installation/UI gates**

```bash
npm run smoke:google-calendar
ADMIN_UI_STRICT_FILES='src/components/customers/CreateInstallationFromOrder.tsx,src/components/customers/CustomerInstallationDetail.tsx' npm run smoke:admin-ui-strict
npm run smoke:admin-ui
npm run smoke:customer-detail
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add modulex-admin/src/lib/google-calendar/installation-projection.ts modulex-admin/src/app/api/admin/google-calendar/installations modulex-admin/src/components/customers/CreateInstallationFromOrder.tsx modulex-admin/src/components/customers/CustomerInstallationDetail.tsx modulex-admin/scripts/google-calendar-integration-contract.mjs
git commit -m "feat(calendar): sync Project installations to Google"
```

---

### Task 8: Harden failure states, unsupported sources, and observability

**Files:**
- Modify: Google Calendar server/domain/API files from Tasks 3-7
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`

- [ ] **Step 1: Add RED normalized-error contract**

Require stable internal codes:

```text
google_not_configured
google_not_connected
google_reconnect_required
oauth_state_invalid
oauth_state_expired
oauth_state_replayed
calendar_missing
event_missing
google_rate_limited
google_transient_failure
invalid_calendar_template
invalid_timezone
calendar_not_bound
project_binding_mismatch
```

- [ ] **Step 2: Normalize provider errors**

Never persist/log raw token responses or Authorization headers. Persist only normalized code + timestamp. Keep `withApiTiming` logs limited to route/method/status/duration.

- [ ] **Step 3: Fail closed unsupported sources**

Delivery remains unavailable because `customer_shipments` has no canonical scheduled delivery time; Measurements and Customer Appointments remain unavailable because no stable canonical scheduling source was verified. Contract must reject enabling those toggles.

- [ ] **Step 4: Verify disabled/disconnected semantics**

Disabling integration or per-Project sync prevents provider writes while preserving bindings/event history. Disabling Installation source prevents future Installation writes but does not destructively purge already-created events.

- [ ] **Step 5: Run focused regression**

```bash
npm run smoke:google-calendar
npm run smoke:api-timing
npm run smoke:rbac
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/src/app/api/admin/google-calendar modulex-admin/scripts/google-calendar-integration-contract.mjs
git commit -m "fix(calendar): harden sync failure boundaries"
```

---

### Task 9: Final verification, roadmap closeout, and owner-ready PR

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Create after deployment acceptance only if the project convention requires it: `docs/acceptance/google-calendar-project-integration.md`

- [ ] **Step 1: Rebase/merge latest `main` into feature branch**

Resolve only Calendar-related conflicts; preserve parallel Project/Admin work.

- [ ] **Step 2: Run focused tests first**

```bash
cd modulex-admin
npm run smoke:google-calendar
npm run smoke:rbac
npm run smoke:api-timing
npm run smoke:customer-detail
npm run smoke:admin-ui
npm run smoke:admin-ui-strict
```

Expected: PASS.

- [ ] **Step 3: Run full compile quality gates**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run schema advisors after migration is applied in the approved environment**

Run Supabase Security Advisor and Performance Advisor because schema/RLS/grants/functions changed. Record only findings introduced by this package; do not fix unrelated advisor backlog.

- [ ] **Step 5: Configure deployment secrets outside source control**

Set in the Admin deployment environment:

```text
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
```

Set `GOOGLE_CALENDAR_REDIRECT_URI` only when canonical Admin origin derivation is not sufficient. Never commit values.

- [ ] **Step 6: Google Cloud console setup acceptance**

Enable Google Calendar API, create one OAuth Web Application client, configure the exact production callback URI, and configure consent for `openid`, `email`, and `calendar.app.created`.

- [ ] **Step 7: Post-deploy owner acceptance**

With Oakwell Admin account:

```text
1. Open Settings -> Google Calendar.
2. Connect the intended Google account.
3. Confirm browser/UI never exposes client secret or refresh token.
4. Enable integration; leave auto-create on.
5. Create or choose one test Modulex Project with an Installation-capable Order.
6. Schedule one Installation.
7. Confirm exactly one secondary Google Calendar exists for that Project.
8. Confirm exactly one Installation event exists.
9. Resync twice and confirm no duplicate calendar/event.
10. Cancel the Installation and confirm mapped Google event is removed while Modulex history remains.
11. Disconnect Google and confirm new sync attempts stop and UI shows reconnect state.
```

- [ ] **Step 8: Update roadmap status**

Keep `[~]` until merge + migration + deploy + signed-in Google acceptance is complete. Change to `[x]` only after all acceptance points pass.

- [ ] **Step 9: Final commit**

```bash
git add modulex-admin/ADMIN_ROADMAP.md docs/acceptance/google-calendar-project-integration.md
git commit -m "docs(calendar): record Google Calendar acceptance"
```

If deployment acceptance has not happened yet, commit only the roadmap's truthful `[~]` state and do not create a false completed acceptance record.

- [ ] **Step 10: Open draft PR**

PR title:

```text
feat: add Project Google Calendar integration
```

PR body must summarize security boundaries, Installation-only V1 source, tests, migration status, required deployment secrets, and explicitly state that Google OAuth connection/production writes require owner action after deploy.

---

## Self-Review Result

- Spec coverage: OAuth, encrypted token persistence, replay-safe state, Admin-managed settings, Project binding, idempotent event links, one-way sync, error handling, unsupported-source fail-closed behavior, UI, RBAC, tests, advisors, and production acceptance are all mapped to tasks.
- Canonical source check: Installation has `scheduled_start_at` / `scheduled_end_at`; Shipment has no scheduled-delivery field, so Delivery is intentionally unavailable in V1 rather than inferred from `shipped_at`/`delivered_at`.
- UI gate check: legacy `GeneralSettingsOverview` is not modified. `CustomerInstallationDetail` is modified only together with a scoped shared-primitive modernization required by the strict changed-file gate.
- Type/signature consistency: later tasks consume the exact helper/service names declared in earlier tasks.
- Placeholder scan: no implementation step relies on `TBD`, `TODO`, or an unspecified file/path.
