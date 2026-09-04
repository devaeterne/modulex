# Modulex Google Calendar Project Integration Design

## Goal

Add an Oakwell-first Google Calendar integration to Modulex Admin using one Google OAuth connection and one Modulex-created Google Calendar per Project, while keeping all operational behavior manageable from Admin instead of hardcoding customer-specific values.

Modulex remains the canonical source of scheduling truth. Google Calendar is an outbound projection and convenience surface only.

## Current architecture and scope

- Repository baseline before this design work: `7309065ce00f4dee44985328a8d73482440cd501`.
- Modulex is currently single-company. Company-facing configuration is a singleton in `public.general_settings` (`id = 1`), not a multi-tenant `company_id` model.
- V1 must follow that existing singleton architecture instead of introducing speculative tenancy solely for Google Calendar.
- All customer-changeable Calendar behavior must be stored in DB-backed Admin settings and require no deploy to edit.
- OAuth client secret, token-encryption key, refresh token, service-role/elevated credentials, authorization codes, and access tokens must never be exposed to browser code.
- V1 sync direction is Modulex -> Google only.
- Store, Customer Portal, and Dealer Portal behavior are unchanged.

A future multi-company Modulex architecture may add tenant/company ownership to these tables in the same migration program that makes the rest of Modulex multi-tenant. V1 must not pretend that tenant boundary already exists.

## Google authorization model

Create one Google Cloud project and one OAuth 2.0 Web Application client for the Modulex Admin deployment.

Server-only environment configuration:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI` only if the existing canonical Admin origin cannot derive it safely
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`

The OAuth client values are deployment/application configuration, not customer business settings. Admin may display configured/not-configured state but never the client secret or encryption key.

Request the narrow Calendar scope:

`https://www.googleapis.com/auth/calendar.app.created`

This permits Modulex to create secondary calendars and manage events on calendars created by Modulex without requesting broad access to every calendar in the connected Google account.

Request `access_type=offline` so the server can obtain a refresh token and continue synchronization when the user is not present.

OAuth `state` must be cryptographically protected or server-persisted, short-lived, tied to the authenticated initiating user/session, and resistant to replay/callback swapping.

V1 does not request arbitrary calendar browsing, Calendar List access, ACL access, free/busy access, or broad event access. Adding those scopes is a separate product/security decision.

## Secret and token protection

Refresh tokens are encrypted before storage using application-layer AES-256-GCM with the dedicated server-only `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`.

Store a versioned encrypted envelope containing ciphertext plus the required IV/authentication-tag material. Encryption and decryption occur only in server code. The DB never stores or receives the encryption key.

The credential table is not directly readable by normal authenticated browser/PostgREST flows. Browser-facing status responses expose only non-sensitive metadata such as connection state, account email, timestamps, and normalized error state.

Do not persist access tokens as canonical credentials. They are short-lived and obtained/refreshed server-side from the encrypted refresh token when needed.

Disconnect retires the stored credential and stops synchronization. Reconnect performs a fresh OAuth flow and replaces the stored encrypted refresh token only after a valid callback.

## Data model

### `calendar_integration_credentials`

Single-company singleton credential record.

Suggested fields:

- `id smallint primary key default 1`
- `provider text not null default 'google'`
- `status text not null` with reviewed states such as `connected`, `disconnected`, `error`
- `provider_account_id text`
- `provider_account_email text`
- `encrypted_refresh_token text`
- `granted_scopes text[]`
- `connected_by uuid`
- `connected_at timestamptz`
- `disconnected_at timestamptz`
- `last_success_at timestamptz`
- `last_error_at timestamptz`
- `last_error_code text`
- `created_at timestamptz`
- `updated_at timestamptz`
- singleton constraint `id = 1`

The table must not be broadly granted to `authenticated`. Credential mutation/read is server-only through the reviewed elevated boundary.

### `calendar_integration_settings`

DB-backed settings editable from Admin.

Suggested fields:

- `id smallint primary key default 1`
- `enabled boolean not null default false`
- `auto_create_project_calendar boolean not null default true`
- `calendar_name_template text not null default '{project_no} - {customer_name}'`
- `timezone_override text null`
- `sync_measurements boolean not null default true`
- `sync_deliveries boolean not null default true`
- `sync_installations boolean not null default true`
- `sync_customer_appointments boolean not null default false`
- `created_by uuid`
- `updated_by uuid`
- `created_at timestamptz`
- `updated_at timestamptz`
- singleton constraint `id = 1`

Timezone resolution:

1. `calendar_integration_settings.timezone_override` when explicitly set;
2. otherwise canonical `general_settings.timezone`.

This avoids duplicating the company timezone while still allowing a Calendar-specific override from Admin.

Calendar name templates are configuration, not source-code constants. V1 supports a small allowlist of placeholders discovered from canonical Project data, beginning with `{project_no}`, `{project_name}` where available, and `{customer_name}`. Unknown placeholders and an empty resolved name fail validation.

### `project_calendar_bindings`

One Google Calendar binding per Project in v1.

Suggested fields:

- `id uuid primary key`
- `project_id uuid not null unique`
- `provider text not null default 'google'`
- `provider_calendar_id text not null unique`
- `provider_calendar_name text not null`
- `timezone text not null`
- `sync_enabled boolean not null default true`
- `created_by uuid`
- `created_at timestamptz`
- `updated_at timestamptz`
- `last_sync_at timestamptz`
- `last_error_at timestamptz`
- `last_error_code text`

The binding is projection metadata only; it never becomes scheduling truth.

### `project_calendar_event_links`

Maps canonical Modulex scheduling records to provider events so retries are idempotent.

Suggested fields:

- `id uuid primary key`
- `project_id uuid not null`
- `project_calendar_binding_id uuid not null`
- `source_type text not null`
- `source_id uuid not null`
- `provider_event_id text not null`
- `source_fingerprint text`
- `sync_status text not null`
- `last_synced_at timestamptz`
- `last_error_at timestamptz`
- `last_error_code text`
- `created_at timestamptz`
- `updated_at timestamptz`

Enforce uniqueness on `(project_calendar_binding_id, source_type, source_id)` so the same Modulex record cannot silently create duplicate Google events.

## Admin settings UX

Add a Google Calendar section under the existing Admin Settings/Integrations area and compose it exclusively from reviewed shared Admin primitives.

Expose:

- Google integration configured/not configured;
- connected/disconnected/error state;
- connected Google account email;
- Connect;
- Reconnect;
- Disconnect with confirmation;
- integration enabled toggle;
- auto-create project calendar toggle;
- calendar name template;
- optional timezone override, with the current `general_settings.timezone` shown as the fallback;
- event-type sync toggles;
- last success/error metadata;
- validation and retry states.

These settings are persisted to Supabase and can be changed later without touching source code or Vercel environment values.

OAuth app credentials are intentionally excluded from this UI because they are application secrets, not ordinary editable company settings.

## Project UX

Add a Calendar section/tab to Project detail using current Project composition conventions.

When no binding exists:

- show whether Google Calendar is connected/enabled;
- allow an authorized user to create the Project Calendar;
- if auto-create is enabled, creation may occur through the same idempotent server service after Project creation or when the first eligible schedule item needs projection.

When a binding exists:

- show Calendar name;
- show sync enabled/disabled;
- show last sync/error state;
- expose Open in Google Calendar if a safe provider URL can be built;
- allow sync enable/disable;
- allow an explicit Modulex-driven calendar rename action when supported by the Calendar API;
- expose manual retry/resync.

V1 does not browse or select unrelated calendars in the connected account because the narrow `calendar.app.created` scope is intentional.

## Canonical event sources

V1 projects only scheduling records that already exist canonically in Modulex. Implementation must inspect the live repository schema/RPCs before wiring each source and must not create a parallel scheduling ledger merely to feed Google.

Initial candidates:

- deliveries/shipments with canonical scheduled date/time;
- installations with canonical scheduled date/time;
- measurements only if the current Project/Order model has a stable canonical measurement record or field;
- customer appointments only if a stable Project-related appointment entity already exists.

If a candidate has no canonical source today, its Admin toggle may remain unavailable/disabled until that Modulex domain exists. Do not invent data.

## Google event projection

A projected event may contain only operationally necessary, non-sensitive fields derived from the canonical source:

- summary containing operation type plus Project/customer label;
- start/end;
- Modulex Project/Order reference;
- approved project/site location when already canonical and permitted;
- concise operational description.

Never project internal cost, margin, financial information, private notes, credentials, unrelated personal data, or hidden Admin metadata.

## Synchronization behavior

V1 is strictly Modulex -> Google.

- Eligible canonical create/update -> create or update the mapped Google event.
- Existing event link -> update the same provider event, never create a duplicate because of a retry.
- Source cancellation -> apply an explicit provider cancellation/deletion projection while retaining Modulex history.
- Google-side edit/delete -> never mutate Modulex.
- Google-side drift may be repaired by explicit/manual resync or the next relevant Modulex projection.

A valid Modulex business mutation must not be rolled back merely because Google is temporarily unavailable. Provider failure is recorded separately and surfaced as retryable sync state.

Disabling an event type stops future projection/updates for that type but does not destructively delete already-created Google events in v1. Re-enabling resumes from canonical Modulex state.

Disabling the integration or disconnecting Google stops all new sync attempts while preserving Modulex records and historical binding/event-link metadata.

## Server/API boundaries

All Google interaction is server-side.

Expected units:

- OAuth start route;
- OAuth callback route;
- server-only credential repository/encryption helper;
- Google OAuth/token refresh client;
- Google Calendar client;
- integration settings read/update boundary;
- connect/reconnect/disconnect actions;
- project calendar create/rename/status/sync boundary;
- event projection mapper/service.

Protected actions reuse existing Modulex auth/RBAC patterns. Integration configuration is Admin/Super Admin only unless the current permission model provides a narrower reviewed Settings capability. Project-level sync actions require the existing Project operational permission boundary as well as an active integration.

No elevated key, OAuth token, or encryption key is ever sent to client components.

## Database integrity and authorization

Because Modulex is single-company today, v1 does not add a fake `company_id` column.

The DB must still fail closed on structural mismatches:

- binding `project_id` must reference a real Project;
- event link Project must equal the Project of its binding;
- event link source identity must satisfy the source-type contract;
- one binding per Project;
- one credential/settings singleton;
- provider/calendar/event IDs must satisfy uniqueness rules required for idempotency.

Browser-safe settings/status projections must never include encrypted credential material.

Schema/RLS/grants/functions follow the existing Admin security conventions and are covered by Supabase Security/Performance Advisor verification.

## Error handling and observability

Persist normalized internal error codes, not raw provider payloads.

Relevant states include:

- OAuth app not configured;
- consent denied;
- OAuth state invalid/expired/replayed;
- callback missing refresh token;
- refresh token decrypt failure;
- token revoked/invalid grant;
- Google transient/quota failure;
- provider calendar missing;
- provider event missing;
- invalid timezone;
- invalid name template;
- integration disabled/disconnected;
- Project binding mismatch.

Do not log authorization codes, access tokens, refresh tokens, OAuth client secret, encryption key, or complete Google credential responses.

Credential errors become reconnect-required. Transient provider failures remain retryable.

## Rollout

1. Add Admin roadmap entry and focused design/contract tests.
2. Add schema, constraints, RLS/grants, singleton settings, credential storage boundary, and canonical mirrored SQL/migration required by Modulex conventions.
3. Add server-side AES-GCM token encryption and OAuth/token client.
4. Add company-level Connect/Reconnect/Disconnect and Admin settings UI.
5. Add Project Calendar binding/status/create/rename/retry UI and server actions.
6. Wire one canonical event source at a time, starting with the clearest existing scheduled domain.
7. Add remaining canonical event sources that actually exist.
8. Run targeted tests, Admin UI strict, Project/RBAC regressions, typecheck, lint, build, and Supabase advisors.
9. Configure Google Cloud OAuth and Vercel server secrets for Oakwell.
10. After merge/deploy/migration acceptance, connect the Oakwell account manually from Admin and verify one test Project end-to-end before enabling broad auto-create behavior.

No live Google calendar writes occur merely because the migration is deployed.

## Required tests

TDD coverage must include:

- template allowlist, validation, and rendering;
- timezone fallback/override;
- settings authorization and persistence;
- browser responses never exposing encrypted token/secret material;
- AES-GCM encrypt/decrypt and tamper failure;
- OAuth state validation, expiry, and replay rejection;
- callback/refresh-token failure handling;
- idempotent Project Calendar creation;
- idempotent event create/update projection;
- binding/source mismatch rejection;
- disabled/disconnected behavior;
- provider missing-calendar/event recovery behavior;
- event-type toggle behavior;
- Project UI loading/empty/connected/error/permission states;
- Admin Settings UI states;
- Admin UI strict contract;
- existing Project Base and RBAC regressions affected by the package.

Final verification includes TypeScript, lint, production build, focused smoke/contracts, and Supabase Security + Performance Advisors because schema/RLS/grants/functions change.

## Production acceptance

After merge, migration, and deploy:

- Admin shows OAuth application configured without exposing credentials;
- Oakwell Admin can connect one Google account;
- stored refresh token is encrypted and inaccessible to browser/PostgREST users;
- Admin can change calendar template, timezone behavior, auto-create, enabled state, and event-type toggles without deploy;
- one test Project creates exactly one Modulex-managed secondary Google Calendar;
- repeated create/resync remains idempotent;
- one canonical scheduling change creates/updates exactly one Google event;
- Google API failure does not corrupt Modulex business data;
- disconnect immediately stops sync and exposes reconnect-required state.

## Out of scope for v1

- Google -> Modulex bidirectional synchronization;
- arbitrary Google Calendar browsing/selection;
- employee personal-calendar synchronization;
- free/busy scheduling;
- Calendar ACL/sharing management;
- customer attendee invitations unless separately approved;
- Store/Portal Calendar UI;
- replacing Modulex Project/Shipment/Installation/appointment truth with Google entities;
- introducing Modulex multi-tenancy solely for this integration;
- hardcoded Oakwell email, timezone, calendar names, event-type selections, Project naming rules, or customer-specific identifiers.

## Decision summary

Use one server-configured Google OAuth client, one singleton Oakwell Google connection, and one Modulex-created Google Calendar per Project. Store business behavior in DB-backed Admin settings, encrypt the refresh token at the server boundary with AES-256-GCM, reuse `general_settings.timezone` unless an Admin override is set, and keep synchronization strictly Modulex -> Google in v1.
