# Modulex Google Calendar Project Integration Design

## Goal

Add an Oakwell-first Google Calendar integration to Modulex Admin using one company-level Google OAuth connection and one Google Calendar per Modulex Project, while keeping all operational settings manageable from Admin instead of hardcoding business behavior.

Modulex remains the canonical source of project scheduling truth. Google Calendar is an outbound synchronization target and convenience surface, not the authoritative project ledger.

## Current baseline and constraints

- Repository: `devaeterne/modulex`.
- Baseline `main`: `7309065ce00f4dee44985328a8d73482440cd501`.
- The current Admin roadmap defines `modulex-admin` as the operational control plane and requires mutable production business configuration to be managed through Admin/Supabase rather than source-code edits or manual SQL.
- Existing Admin UI must continue to use the shared Modulex components and the `ADMIN_UI_GUIDE.md` rules.
- Service-role, OAuth client secret, refresh token, or equivalent elevated credentials must never be exposed to browser code.
- First production consumer is Oakwell, but the schema must be company-scoped so future Modulex companies do not require a breaking migration.
- Initial sync direction is one-way: Modulex -> Google Calendar.

## Google authorization model

Create one Google Cloud project and one OAuth 2.0 Web Application client for the Modulex Admin deployment.

The Google OAuth client ID/secret are application deployment secrets, not editable business settings. They live only in server-side environment/secret storage. Admin may show whether the Google OAuth application is configured, but must never reveal the secret.

Use the narrow Google Calendar scope:

`https://www.googleapis.com/auth/calendar.app.created`

This scope permits Modulex to create secondary calendars and manage events on calendars created by Modulex, without requesting blanket access to every calendar in the user's account.

Request OAuth with `access_type=offline` so the server can obtain and use a refresh token when the user is not present. Use a CSRF-safe `state` value bound to the authenticated Modulex session/company and callback intent.

The first version does not request broad calendar read access, calendar list access, ACL access, or free/busy access. Those capabilities require a later explicit scope expansion and product decision.

## Ownership model

There are three distinct ownership layers.

1. **Application credential**
   - Google OAuth client ID/secret.
   - Deployment-level server secret.
   - Not editable in Admin.

2. **Company connection**
   - One active Google account connection for Oakwell in v1.
   - Stored company-scoped.
   - Connect, reconnect, disconnect, health/status, and last sync information are managed from Admin.

3. **Project calendar binding**
   - Each Modulex Project can have zero or one Modulex-created Google Calendar binding in v1.
   - Calendar identity is stored per Project.
   - A Project may disable synchronization without deleting its Google Calendar.

## Data model

Add company-scoped integration tables rather than placing provider tokens or calendar IDs directly on Project rows.

### `company_calendar_integrations`

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null`
- `provider text not null` constrained to `google`
- `status text not null` constrained to states such as `connected`, `disconnected`, `error`
- `provider_account_id text`
- `provider_account_email text`
- `refresh_token_encrypted text`
- `granted_scopes text[]`
- `connected_by uuid`
- `connected_at timestamptz`
- `disconnected_at timestamptz`
- `last_success_at timestamptz`
- `last_error_at timestamptz`
- `last_error_code text`
- `created_at timestamptz`
- `updated_at timestamptz`

Only one active Google Calendar integration per company is required in v1. Enforce that contract with an appropriate partial unique constraint/index.

Do not persist long-lived Google access tokens as canonical credentials. Access tokens are short-lived and should be refreshed server-side from the stored refresh token as needed.

### `company_calendar_settings`

Suggested fields:

- `company_id uuid primary key`
- `provider text not null default 'google'`
- `enabled boolean not null default false`
- `auto_create_project_calendar boolean not null default true`
- `calendar_name_template text not null`
- `default_timezone text not null`
- `sync_measurements boolean not null default true`
- `sync_installations boolean not null default true`
- `sync_deliveries boolean not null default true`
- `sync_customer_appointments boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

The initial default calendar name template should be equivalent to `{project_no} - {customer_name}`, but it is persisted configuration and editable from Admin. Template validation must reject unknown placeholders and empty resolved names.

### `project_calendar_bindings`

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null`
- `project_id uuid not null unique`
- `calendar_integration_id uuid not null`
- `provider text not null default 'google'`
- `provider_calendar_id text not null`
- `provider_calendar_name text not null`
- `timezone text not null`
- `sync_enabled boolean not null default true`
- `created_by uuid`
- `created_at timestamptz`
- `updated_at timestamptz`
- `last_sync_at timestamptz`
- `last_error_at timestamptz`
- `last_error_code text`

The binding owns only the projection relationship; it does not become project scheduling truth.

### `project_calendar_event_links`

Use a separate event-link table so sync is idempotent and existing Google events are updated rather than duplicated.

Suggested fields:

- `id uuid primary key`
- `company_id uuid not null`
- `project_id uuid not null`
- `project_calendar_binding_id uuid not null`
- `source_type text not null`
- `source_id uuid not null`
- `provider_event_id text not null`
- `source_revision text` or equivalent deterministic source fingerprint
- `sync_status text not null`
- `last_synced_at timestamptz`
- `last_error_at timestamptz`
- `last_error_code text`
- `created_at timestamptz`
- `updated_at timestamptz`

Enforce uniqueness on the logical source-to-provider mapping, for example `(project_calendar_binding_id, source_type, source_id)`.

## Secret protection

OAuth client secret remains in deployment secret storage.

Google refresh tokens are server-side credentials and must not be readable through ordinary authenticated PostgREST access. The implementation should use the repository's existing server/elevated boundary rather than making token columns generally selectable.

If refresh-token encryption at rest is implemented in PostgreSQL, the encryption key must remain outside the database in deployment secret storage. If the existing Modulex runtime already has a reviewed secret-storage/encryption convention, reuse it rather than introducing a parallel mechanism.

Disconnect must revoke/retire the Modulex credential relationship and mark the integration disconnected. Historical project/calendar IDs may remain for audit and diagnosis, but no further sync may execute through a disconnected integration.

## Admin settings UX

Add a Google Calendar section under the existing Admin Settings/Integrations surface, following the shared Admin UI guide.

The company-level screen exposes:

- integration configured/not configured state;
- connected/disconnected/error status;
- connected Google account email;
- Connect Google Calendar;
- Reconnect;
- Disconnect;
- default timezone;
- project calendar name template;
- auto-create project calendar toggle;
- event-type sync toggles;
- last successful sync/error state where available.

OAuth client secret is never displayed or editable in the browser.

Business settings are DB-backed. Changing these settings must not require a deploy.

## Project UX

Add a Calendar section/tab to Project detail using existing Project detail composition patterns.

For a Project with no binding:

- show company integration availability;
- allow an authorized user to create the project's Google Calendar when integration is connected;
- if auto-create is enabled, project creation or the first eligible scheduling action may create the binding through the same idempotent server boundary.

For a Project with a binding:

- show provider calendar name;
- show sync enabled/disabled;
- show last synchronization/error state;
- provide Open in Google Calendar where a safe provider URL can be derived;
- allow sync enable/disable;
- allow calendar name changes through Modulex only if the Google API and v1 authorization contract supports changing the Modulex-created calendar cleanly;
- do not offer arbitrary selection of unrelated user calendars in v1 because `calendar.app.created` intentionally avoids broad calendar access.

The requested manageable behavior therefore applies to Modulex-created calendar settings and binding behavior, not to browsing every calendar in the connected Google account.

## Event projection

V1 synchronizes only Modulex scheduling entities for which the repository already has canonical records and stable identifiers.

Target event types are configurable at company level and initially include:

- measurement;
- delivery;
- installation;
- customer appointment, only if a canonical Project-related appointment entity already exists in the current schema.

Implementation must inspect current canonical Project/Order/Shipment/Installation/appointment contracts before mapping each type. It must not invent a parallel scheduling record merely to satisfy Google Calendar.

Every projection uses a deterministic source mapping and event link so retries are idempotent.

Typical Google event content may include:

- event summary with operation type and project/customer label;
- start/end from canonical Modulex scheduling timestamps;
- Modulex project/order reference in description;
- non-sensitive operational location when the canonical source explicitly contains a customer/project site address and existing authorization permits its use.

Do not put internal cost, margin, finance details, private notes, credentials, or unrelated personal data into Google events.

## Synchronization behavior

V1 is strictly Modulex -> Google.

- Creating an eligible Modulex scheduling record creates or updates the corresponding Google event.
- Updating its relevant scheduling fields updates the same Google event.
- Cancelling/removing an eligible source follows the source's existing lifecycle semantics. If the canonical source is cancelled, the Google event should be cancelled/deleted according to an explicit projection rule; Modulex history must remain intact.
- Deleting or editing an event directly in Google does not mutate Modulex.
- Google-side drift is repaired on the next explicit or automatic Modulex sync when practical.

Synchronization failures must not roll back valid Modulex business mutations unless the existing transaction contract explicitly requires external side effects to be atomic. Persist or surface sync failure state separately and allow retry.

## Server/API boundaries

All Google OAuth and Calendar API interaction runs server-side.

Expected server routes/services include:

- OAuth start endpoint;
- OAuth callback endpoint;
- connection status/read endpoint if not served directly by an existing server component boundary;
- disconnect/reconnect action;
- company settings read/update action;
- project calendar create/status/update action;
- project calendar sync/retry action;
- shared Google OAuth/token refresh service;
- shared Calendar API client/service;
- shared event projection mapper.

Protected mutation routes must reuse Modulex authorization conventions. Company integration/settings changes require an administrative/settings capability. Project-level calendar actions require the same Project authorization boundary as other Project operational mutations plus any integration-specific capability adopted by the existing RBAC system.

OAuth `state` must be signed or server-persisted, short-lived, single-use where practical, and must bind at minimum the Modulex company and initiating authenticated user/session to prevent callback swapping.

## Company scoping and authorization

Every integration, setting, binding, and event-link row carries or derives company scope.

DB constraints/triggers/RPCs must fail closed on cross-company mismatches:

- Project company must equal binding company.
- Binding company must equal integration company.
- Event-link company/project/binding relationships must reconcile.

RLS/grants/RPC authorization must prevent users from accessing another company's integration metadata or triggering sync against it.

Sensitive credential material must be excluded from normal Admin projections even for authorized Admin users; the UI needs status metadata, not the token itself.

## Error handling and observability

Use normalized internal error codes rather than persisting raw Google responses containing potentially sensitive data.

Relevant conditions include:

- OAuth application not configured;
- consent denied;
- missing refresh token after connection/reconnection flow;
- token revoked/invalid grant;
- Google Calendar API quota/transient error;
- provider calendar missing;
- provider event missing;
- unsupported/invalid timezone;
- invalid calendar name template;
- integration disconnected;
- company/project mismatch.

Transient Google failures should be retryable. Invalid or revoked credentials should move the company integration to an error/reconnect-required state.

Do not log access tokens, refresh tokens, authorization codes, OAuth client secrets, or full Google credential responses.

## Configuration changes

Admin setting edits affect future sync behavior without source-code changes.

- Calendar naming template changes apply to newly created calendars by default; existing calendars are not silently renamed unless the user explicitly requests a rename/sync-name action.
- Disabling an event type stops future projection for that type. V1 retains already-created provider events and stops future updates until re-enabled, avoiding destructive surprises.
- Disabling company integration stops new sync attempts while preserving Modulex project data and binding history.
- Disconnecting Google requires explicit confirmation and stops all sync.

## Rollout sequence

1. Add schema, constraints, RLS/grants/RPC boundaries, and Admin roadmap entry.
2. Add server-only Google OAuth/token service using deployment secrets.
3. Add company connection/settings endpoints and Admin Settings/Integrations UI.
4. Add Project calendar binding/create/status UI and service.
5. Add outbound event projection for each existing canonical scheduling entity one at a time.
6. Add retry/error status surfaces.
7. Configure the Oakwell Google Cloud OAuth application and production environment secrets.
8. Connect the Oakwell Google account from production Admin.
9. Create and verify a test Project calendar before enabling broader auto-create behavior.

Production OAuth connection and live Calendar writes are explicit acceptance operations; they must not occur automatically from migration deployment alone.

## Testing and verification

Follow TDD for the implementation.

Required automated coverage includes:

- calendar name-template validation and rendering;
- company/project/binding cross-scope rejection;
- integration settings authorization;
- OAuth state validation, expiry/replay boundary, and callback failure states;
- credential response sanitization;
- token refresh handling without browser token exposure;
- idempotent project calendar creation;
- idempotent event create/update projection;
- disconnected/revoked integration failure behavior;
- event-type configuration behavior;
- no token/secret exposure in Admin responses;
- Project UI loading/empty/connected/error/permission states;
- Admin UI strict contract and Project/Admin regressions.

Because the package changes schema/RLS/grants/functions, final verification includes Supabase Security and Performance Advisors.

Final application verification includes targeted contracts, Admin UI strict checks, RBAC checks, TypeScript, lint, production build, and existing Project Base regressions affected by the change.

Production acceptance after deploy should prove:

- Oakwell Admin can connect Google successfully;
- refresh token remains server-only;
- Admin can edit timezone/template/sync toggles without deploy;
- one test Project creates exactly one secondary Google Calendar;
- repeated creation remains idempotent;
- one canonical scheduling change creates/updates exactly one Google event;
- Google-side failure does not corrupt Modulex business state;
- disconnect stops sync and exposes reconnect-required state.

## Out of scope for v1

- Google -> Modulex bidirectional synchronization;
- arbitrary browsing or selecting every calendar in the user's Google account;
- employee personal-calendar synchronization;
- free/busy scheduling;
- calendar sharing/ACL management;
- customer invitations/attendees unless separately approved;
- Store or Customer/Dealer Portal Calendar UI;
- replacing canonical Modulex Project, Shipment, Installation, appointment, or fulfillment records with Google entities;
- hardcoded Oakwell email address, calendar names, timezone, event-type choices, or Project naming rules.

## Design decision summary

Use one server-configured Google OAuth client for Modulex, one company-level Google connection for Oakwell, and one Modulex-created secondary Google Calendar per Project. Keep credentials at the server boundary, keep business behavior in company-scoped DB settings managed from Admin, and synchronize only from canonical Modulex records to Google in v1.
