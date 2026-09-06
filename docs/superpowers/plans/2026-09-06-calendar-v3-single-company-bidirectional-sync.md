# Calendar V3 — Single Company Calendar + Bidirectional Google Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-Project Google calendars with one writable Company Operational Calendar and deliver durable bidirectional Google ↔ Modulex event synchronization, rich event CRUD, and a compact Project Calendar UX.

**Architecture:** Keep Modulex business schedule fields canonical, but allow trusted Google changes to mutate only those schedule fields through domain-safe server functions. Add a first-class `calendar_events` replica for ordinary events, a generic provider-event mapping, durable sync outbox, Google watch-channel lifecycle, incremental sync, conflict audit, and one company provider binding. The Admin `/calendar` page becomes the full CRUD surface; Project Calendar becomes a compact project-filtered view with the calendar collapsed by default.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase/PostgreSQL, FullCalendar 6, Google Calendar API v3, existing Modulex authenticated APIs and Admin UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-06-calendar-v3-single-company-bidirectional-sync-design.md`

## Global Constraints

- Single-company architecture only. Do **not** introduce `company_id`.
- Exactly one active Modulex `admin_calendars.kind = 'company'` calendar and at most one active `company_shared` Google binding.
- Do not create new Google Calendars for Projects in V3.
- Do not delete legacy Project Google Calendars during cutover; disable V3 writes to legacy bindings and retain mappings for audit/history.
- OAuth write scope becomes `https://www.googleapis.com/auth/calendar.events`; retain CalendarList readonly + OpenID/email. `calendar.app.created` may remain only for legacy compatibility.
- A Company Calendar is write-eligible only with Google `accessRole` `owner` or `writer`. Reject `reader`, `freeBusyReader`, and `writerWithoutPrivateAccess` for V3 write binding.
- Normal/default events support two-way title, description, location, start/end, all-day, timezone, color, recurrence, attendees/guest options, reminders, Google Meet/conference data, visibility, and transparency.
- Google special event types (`focusTime`, `outOfOffice`, `workingLocation`, `birthday`, `fromGmail`, and other non-default specialized types) are mirror/display only in V3.
- Business events remain backed by `customer_projects` / `customer_installations`; no duplicate business schedule ledger.
- Business delete behavior is fixed: Project Start → `start_date = null`; Target → `target_date = null`; Planned Delivery → `planned_delivery_date = null`; Installation event deletion → canonical Installation status `cancelled`, never physical delete.
- Business events are singular. Recurrence is not accepted for Project milestones or Installations.
- Google-origin business mutations require an existing trusted provider mapping; private extended properties are identity hints, never authorization.
- Modulex mutations commit first. Google failure must never roll back a valid Modulex business/calendar mutation.
- No DB trigger/function may perform a network call. DB may only write local rows/outbox.
- Provider-origin writes must suppress identical Modulex→Google echo work.
- Push webhook payloads are change signals only; event details are fetched through incremental `syncToken` synchronization.
- Google watch channels expire. Persist channel state, replace before expiration, tolerate overlap, and verify channel id/token/resource id.
- Persist conflict/audit data. Do not silently overwrite simultaneous two-sided edits without deterministic policy and audit.
- `calendar.view` remains read permission; `calendar.manage` covers normal event CRUD and company binding management. Google OAuth/configuration remains Settings-management protected where current routes already require it.
- Use existing shared Admin UI primitives and `ADMIN_TEXT_STYLES`; changed feature TSX must pass `npm run smoke:admin-ui-strict`.
- Reuse existing CI workflow(s). Do not add a new workflow without explicit approval.
- Schema/RLS/grant/index changes require Supabase Security + Performance Advisor checks after production migration.
- Do not apply the production migration until RED→GREEN contracts, typecheck, lint, build, production data preflight, and PR review are complete.

---

### Task 1: Rebaseline from current `main` and add the V3 RED contract

**Files:**
- Create: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`
- Modify: `modulex-admin/package.json`
- Modify: `.github/workflows/admin-ui-foundation.yml`
- Modify: `modulex-admin/scripts/admin-full-route-regression-contract.mjs` only if V3 route inventory changes it; preserve concurrent route additions.

**Interfaces:**
- Consumes: current V2 Calendar implementation and existing smoke/CI infrastructure.
- Produces: `npm run smoke:calendar-v3` wired into the existing smoke chain and Admin UI foundation CI.

- [ ] **Step 1: Re-read execution-time `main`, open PRs, repo rules, UI/validation guides, roadmap, and current Calendar code.**

Read:

```text
AGENTS.md
modulex-admin/ADMIN_UI_GUIDE.md
modulex-admin/ADMIN_VALIDATION_GUIDE.md
modulex-admin/ADMIN_ROADMAP.md
modulex-admin/src/lib/google-calendar/*
modulex-admin/src/lib/calendar/*
modulex-admin/src/components/calendar/*
modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx
modulex-admin/src/app/api/admin/calendar/**
modulex-admin/src/app/api/admin/google-calendar/**
```

Expected: execution starts from the then-current `main`, not from the design branch or an older Calendar SHA.

- [ ] **Step 2: Create an isolated feature branch.**

Use:

```text
feat/calendar-v3-bidirectional
```

If that ref already exists, use a safe unique suffix. Copy the approved V3 spec and this plan into the feature branch while preserving all newer `main` changes.

- [ ] **Step 3: Write the RED contract before implementation.**

Create `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs` with exact required paths and assertions:

```js
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
```

- [ ] **Step 4: Run the contract and verify RED.**

```bash
cd modulex-admin
node scripts/calendar-v3-bidirectional-contract.mjs
```

Expected: FAIL because the V3 SQL/service/API files do not exist yet.

- [ ] **Step 5: Wire the contract without adding a workflow.**

Add to `modulex-admin/package.json`:

```json
"smoke:calendar-v3": "node scripts/calendar-v3-bidirectional-contract.mjs"
```

Add `npm run smoke:calendar-v3` immediately after `smoke:admin-calendar` in the existing `smoke` chain. Add V3 paths and the command to `.github/workflows/admin-ui-foundation.yml`.

- [ ] **Step 6: Commit the RED gate.**

```bash
git add modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs modulex-admin/package.json .github/workflows/admin-ui-foundation.yml
git commit -m "test(calendar): add V3 bidirectional RED contract"
```

---

### Task 2: Add the additive V3 database model and cutover state

**Files:**
- Create: `modulex-admin/sql/calendar-v3-bidirectional.sql`
- Create: `modulex-store/supabase/migrations/20260906113000_calendar_v3_bidirectional.sql`
- Modify: `modulex-admin/sql/README.md`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**
- Produces:
  - `admin_calendars.kind += 'company'`
  - `project_calendar_bindings.binding_mode += 'company_shared'`
  - `calendar_integration_settings.company_provider_binding_id uuid null`
  - `calendar_events`
  - `calendar_business_event_extensions`
  - `calendar_provider_event_links`
  - `calendar_sync_outbox`
  - `calendar_google_watch_channels`
  - `calendar_sync_conflicts`
  - domain-safe provider-origin schedule mutation RPCs.

- [ ] **Step 1: Extend RED SQL assertions with invariants.**

```js
assert.match(sql, /kind in \([^)]*company/i);
assert.match(sql, /binding_mode[\s\S]*company_shared/i);
assert.match(sql, /create unique index[\s\S]*admin_calendars[\s\S]*kind = 'company'/i);
assert.match(sql, /calendar_events[\s\S]*project_id uuid/i);
assert.match(sql, /calendar_provider_event_links[\s\S]*provider_event_id text not null/i);
assert.match(sql, /calendar_sync_outbox[\s\S]*source_type/i);
assert.match(sql, /calendar_google_watch_channels[\s\S]*resource_id/i);
assert.match(sql, /calendar_sync_conflicts/i);
assert.match(sql, /alter table public\.calendar_events enable row level security/i);
assert.match(sql, /revoke all on public\.calendar_events from anon, authenticated/i);
```

- [ ] **Step 2: Extend the existing registry/binding/settings additively.**

Use:

```sql
alter table public.admin_calendars
  drop constraint if exists admin_calendars_kind_valid;
alter table public.admin_calendars
  add constraint admin_calendars_kind_valid
  check (kind in ('project','google_imported','company'));

create unique index if not exists admin_calendars_single_active_company_idx
  on public.admin_calendars(kind)
  where kind = 'company' and is_active = true;

alter table public.project_calendar_bindings
  drop constraint if exists project_calendar_bindings_binding_mode_valid;
alter table public.project_calendar_bindings
  add constraint project_calendar_bindings_binding_mode_valid
  check (binding_mode in ('modulex_created','google_imported','company_shared'));

alter table public.calendar_integration_settings
  add column if not exists company_provider_binding_id uuid;
```

Add the FK from `company_provider_binding_id` to the existing provider-binding table with `on delete set null`.

- [ ] **Step 3: Create `calendar_events`.**

Use a server-owned table with this stable field set:

```sql
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  admin_calendar_id uuid not null references public.admin_calendars(id) on update cascade on delete restrict,
  project_id uuid references public.customer_projects(id) on update cascade on delete set null,
  owner_profile_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  title text not null,
  description text,
  location text,
  all_day boolean not null default false,
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end date,
  timezone text not null,
  provider_color_id text,
  recurrence jsonb not null default '[]'::jsonb,
  attendees jsonb not null default '[]'::jsonb,
  guests_can_invite_others boolean,
  guests_can_modify boolean,
  guests_can_see_other_guests boolean,
  reminders jsonb,
  conference_data jsonb,
  visibility text,
  transparency text,
  provider_event_type text not null default 'default',
  status text not null default 'confirmed',
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_title_not_empty check (length(btrim(title)) > 0),
  constraint calendar_events_time_shape check (
    (all_day and all_day_start is not null and start_at is null)
    or (not all_day and start_at is not null and all_day_start is null)
  )
);
```

All-day end dates use Google's exclusive-end convention.

- [ ] **Step 4: Create extension/link/outbox/watch/conflict tables with exact uniqueness.**

Required uniqueness:

```sql
unique (provider_binding_id, source_type, source_id)
unique (provider_binding_id, provider_event_id)
unique (provider_binding_id, source_type, source_id) -- outbox coalescing key
```

`calendar_google_watch_channels` stores:

```text
channel_id
provider_binding_id
resource_id
resource_uri
channel_token_hash
expires_at
status
last_message_number
created_at
renewed_at
stopped_at
```

`calendar_provider_event_links` stores provider etag/updated/fingerprint, Modulex fingerprint, last sync origin/status/error, provider tombstone state, optional `project_id`, and the stable source type/id.

- [ ] **Step 5: Add domain-safe Google-origin schedule function.**

Create:

```sql
private.apply_google_business_schedule_change(
  p_source_type text,
  p_source_id uuid,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_all_day_start date default null,
  p_deleted boolean default false
) returns void
```

Mapping is fixed:

```text
project_start    -> customer_projects.start_date
project_target   -> customer_projects.target_date
project_delivery -> customer_projects.planned_delivery_date
installation     -> scheduled_start_at/scheduled_end_at; if deleted, status='cancelled'
```

The function sets a transaction-local origin marker:

```sql
perform set_config('modulex.calendar_sync_origin', 'google', true);
```

Outbox trigger logic must suppress identical echo work while provider-origin state is being applied.

- [ ] **Step 6: Add indexes, RLS, revokes, and service-role grants.**

All V3 Calendar persistence remains server-only; for every new table:

```sql
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant all on public.calendar_events to service_role;
```

Apply the same pattern to business extensions, provider links, outbox, watch channels, and conflicts.

Add indexes for:

```text
calendar_events(admin_calendar_id, start_at)
calendar_events(project_id, start_at) where project_id is not null
calendar_events(owner_profile_id, start_at)
calendar_sync_outbox(next_attempt_at, status)
calendar_google_watch_channels(provider_binding_id, status, expires_at)
calendar_provider_event_links(provider_binding_id, provider_event_id)
calendar_sync_conflicts(provider_binding_id, created_at desc)
```

- [ ] **Step 7: Backfill only the logical company calendar; do not mutate Google.**

Migration behavior:

```text
create exactly one active `company` admin calendar using an existing valid active Modulex owner
leave existing `modulex_created` and `google_imported` bindings untouched
leave `company_provider_binding_id` NULL
leave all legacy Project event links untouched
perform no Google network writes
```

Fail closed if no active owner can be resolved.

- [ ] **Step 8: Mirror SQL byte-for-byte and run the contract.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
```

Expected: schema assertions pass; later V3 service/API/UI assertions remain RED.

- [ ] **Step 9: Commit schema.**

```bash
git add modulex-admin/sql/calendar-v3-bidirectional.sql modulex-store/supabase/migrations/20260906113000_calendar_v3_bidirectional.sql modulex-admin/sql/README.md modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add V3 bidirectional persistence"
```

---

### Task 3: Expand Google OAuth and provider primitives

**Files:**
- Modify: `modulex-admin/src/lib/google-calendar/config.ts`
- Modify: `modulex-admin/src/lib/google-calendar/google-oauth.ts`
- Modify: `modulex-admin/src/lib/google-calendar/google-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/types.ts`
- Modify: `modulex-admin/src/app/api/admin/google-calendar/status/route.ts`
- Test: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**

```ts
hasGoogleCalendarBidirectionalScopes(scopes): boolean
patchGoogleCalendarEvent(...): Promise<GoogleCalendarEventResource>
watchGoogleCalendarEvents(...): Promise<GoogleCalendarWatchChannel>
stopGoogleCalendarWatchChannel(...): Promise<void>
```

- [ ] **Step 1: Make the V3 scope requirement RED.**

```js
assert.match(config, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);
assert.match(config, /calendar\.calendarlist\.readonly/);
assert.match(config, /hasGoogleCalendarBidirectionalScopes/);
```

- [ ] **Step 2: Replace the V3 write-scope check.**

```ts
export const GOOGLE_CALENDAR_BIDIRECTIONAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;
```

Retain `calendar.app.created` only for legacy compatibility; no V3 UI/service may depend on it.

- [ ] **Step 3: Expand Google event DTOs.**

Add fields for:

```ts
recurrence?: string[];
recurringEventId?: string;
originalStartTime?: GoogleCalendarEventDate;
attendees?: GoogleCalendarAttendee[];
reminders?: { useDefault?: boolean; overrides?: Array<{ method: string; minutes: number }> };
conferenceData?: Record<string, unknown>;
extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
eventType?: string;
visibility?: string;
transparency?: string;
creator?: Record<string, unknown>;
organizer?: Record<string, unknown>;
```

- [ ] **Step 4: Add PATCH/watch/stop provider calls.**

Use:

```text
PATCH /calendar/v3/calendars/{calendarId}/events/{eventId}
POST  /calendar/v3/calendars/{calendarId}/events/watch
POST  /calendar/v3/channels/stop
```

`patchGoogleCalendarEvent` accepts optional `sendUpdates` and `conferenceDataVersion` query parameters. Semantic attendee changes use `sendUpdates=all`; sync-only metadata work must not send invitation email.

Watch request:

```ts
{
  id: crypto.randomUUID(),
  type: "web_hook",
  address: webhookUrl,
  token: channelToken,
}
```

Persist the returned resource id/URI/expiration through later repository APIs.

- [ ] **Step 5: Change discovery eligibility.**

```ts
const writeEligible = entry.accessRole === "owner" || entry.accessRole === "writer";
```

Reject `writerWithoutPrivateAccess` for the active Company binding.

- [ ] **Step 6: Update reconnect status and run contracts.**

```bash
cd modulex-admin
npm run smoke:google-calendar
npm run smoke:calendar-v3
```

Expected: scope/provider assertions GREEN; sync-engine/API/UI assertions remain RED.

- [ ] **Step 7: Commit.**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/src/app/api/admin/google-calendar/status/route.ts modulex-admin/scripts/google-calendar-integration-contract.mjs modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add shared-calendar Google primitives"
```

---

### Task 4: Build the V3 local event domain and repository

**Files:**
- Create: `modulex-admin/src/lib/calendar/calendar-events.ts`
- Create: `modulex-admin/src/lib/calendar/calendar-event-validation.ts`
- Create: `modulex-admin/src/lib/google-calendar/v3-repository.ts`
- Modify: `modulex-admin/src/lib/calendar/event-normalization.ts`
- Modify: `modulex-admin/src/lib/calendar/admin-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/repository.ts` only for legacy compatibility helpers.
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**

```ts
createCalendarEvent(input): Promise<CalendarEventRecord>
updateCalendarEvent(id, input): Promise<CalendarEventRecord>
deleteCalendarEvent(id, actorId): Promise<void>
getCalendarEvent(id): Promise<CalendarEventRecord | null>
listCalendarEvents(query): Promise<CalendarEventRecord[]>

enqueueCalendarSync(source): Promise<void>
claimCalendarSyncBatch(limit): Promise<CalendarSyncOutboxItem[]>
markCalendarSyncSuccess(...): Promise<void>
markCalendarSyncFailure(...): Promise<void>

getCompanyCalendarBinding(): Promise<CompanyCalendarBinding | null>
setCompanyCalendarBinding(...): Promise<CompanyCalendarBinding>
getProviderEventLinkByProviderEventId(...)
getProviderEventLinkBySource(...)
upsertProviderEventLink(...)
```

- [ ] **Step 1: Add RED repository/domain assertions.**

```js
assert.match(calendarEventsSource, /createCalendarEvent/);
assert.match(calendarEventsSource, /deleteCalendarEvent/);
assert.match(v3RepoSource, /calendar_provider_event_links/);
assert.match(v3RepoSource, /calendar_sync_outbox/);
assert.match(v3RepoSource, /calendar_google_watch_channels/);
```

- [ ] **Step 2: Define one editable event mutation DTO.**

```ts
export type CalendarEventMutation = {
  title: string;
  projectId: string | null;
  ownerProfileId: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  start: string;
  end: string | null;
  timezone: string;
  colorId: string | null;
  recurrence: string[];
  attendees: Array<{ email: string; displayName?: string; optional?: boolean }>;
  guestOptions: {
    canInviteOthers: boolean | null;
    canModify: boolean | null;
    canSeeOtherGuests: boolean | null;
  };
  reminders: { useDefault: boolean; overrides: Array<{ method: "email" | "popup"; minutes: number }> } | null;
  conference: { createGoogleMeet: boolean; removeConference: boolean };
  visibility: "default" | "public" | "private" | "confidential" | null;
  transparency: "opaque" | "transparent" | null;
};
```

Validation is exact:

```text
title trimmed/non-empty
end > start for timed events
all-day end > start and remains exclusive
recurrence RFC5545 strings allowed only for normal/default events
attendee emails normalized and deduplicated
reminder minutes >= 0 and method is email or popup
project id, when supplied, must resolve to a real Project
owner profile must be active
```

- [ ] **Step 3: Implement normal-event CRUD with transaction-safe outbox enqueue.**

The local event mutation and outbox upsert must be atomic through a private/public SQL RPC or equivalent DB transaction boundary. Browser code must not perform direct writes to server-only tables.

- [ ] **Step 4: Extend normalized Calendar feed.**

Add:

```ts
"calendar_event" | "google_special"
```

Every feed event also exposes:

```ts
editable: boolean;
deletable: boolean;
responsible_profile_id: string;
provider_event_type: string | null;
sync_status: "local" | "synced" | "pending" | "error" | "conflict";
```

- [ ] **Step 5: Change filtering semantics.**

Project filter operates on event `project_id`, not a Project-specific Google calendar. `My Calendar` filters effective event responsibility. Project milestones prefer active Sales Rep; Installations prefer existing assigned employee/installer when the current domain exposes one, otherwise Project responsibility, then Company Calendar owner.

- [ ] **Step 6: Run Calendar contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:admin-calendar
```

Expected: domain/repository assertions GREEN.

- [ ] **Step 7: Commit.**

```bash
git add modulex-admin/src/lib/calendar modulex-admin/src/lib/google-calendar/v3-repository.ts modulex-admin/src/lib/google-calendar/repository.ts modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add V3 event domain and repository"
```

---

### Task 5: Implement bidirectional sync, conflict logic, and Google watch lifecycle

**Files:**
- Create: `modulex-admin/src/lib/google-calendar/bidirectional-sync.ts`
- Create: `modulex-admin/src/lib/google-calendar/event-mapping.ts`
- Create: `modulex-admin/src/lib/google-calendar/watch-channels.ts`
- Create: `modulex-admin/src/lib/google-calendar/sync-conflicts.ts`
- Modify: `modulex-admin/src/lib/google-calendar/calendar-import.ts` to delegate company-calendar sync rather than duplicate V3 logic.
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**

```ts
flushCalendarOutboxItem(itemId: string): Promise<SyncResult>
flushCalendarOutboxBatch(limit?: number): Promise<BatchResult>
syncCompanyCalendarFromGoogle(reason: "watch" | "manual" | "reconcile"): Promise<SyncResult>
applyGoogleEventChange(event: GoogleCalendarEventResource): Promise<ApplyResult>
ensureCompanyCalendarWatch(): Promise<WatchState>
renewExpiringCompanyCalendarWatch(now?: Date): Promise<WatchState>
```

- [ ] **Step 1: Add RED sync assertions.**

```js
assert.match(syncEngine, /applyGoogleEventChange/);
assert.match(syncEngine, /flushCalendarOutbox/);
assert.match(syncEngine, /last_sync_origin|sync_origin/);
assert.match(syncEngine, /calendar_sync_conflicts/);
assert.match(syncEngine, /sync_token_gone|410/);
assert.match(syncEngine, /extendedProperties/);
```

- [ ] **Step 2: Map Modulex normal/business events to Google.**

Normal events use private extended properties:

```ts
private: {
  modulex_source_type: "calendar_event",
  modulex_source_id: event.id,
  modulex_project_id: event.project_id ?? "",
}
```

Business events use trusted link rows and corresponding source type/id. Use Google PATCH for updates. Use Google DELETE for normal event deletion. Business date clear/cancel removes the corresponding provider event and retains enough tombstone/link history to recognize late provider notifications.

- [ ] **Step 3: Implement Google → Modulex classification.**

```text
1. Find link by company binding + provider_event_id.
2. Existing business link -> apply only allowed schedule/delete semantics.
3. Existing calendar_event link -> patch local normal event.
4. No link + eventType=default -> create/import normal calendar_event and link it.
5. No link + special event type -> mirror as read-only `google_special`.
6. Never mutate business data solely from untrusted extendedProperties.
```

- [ ] **Step 4: Implement recurrence/occurrence behavior.**

One recurring normal-event series maps to one normal source. Single occurrence identity uses `recurringEventId + originalStartTime`. Single occurrence edit/delete remains an exception/override; it never clones a Project or Installation. `this and following` is not implemented.

If a mapped business event is made recurring in Google, record conflict code `business_recurrence_not_supported` and enqueue restoration of its singular Modulex representation.

- [ ] **Step 5: Implement fingerprint/conflict decisions.**

Persist and compare:

```text
last_provider_etag
last_provider_updated_at
provider_observed_at
last_provider_fingerprint
last_modulex_fingerprint
last_sync_origin
```

Decision table:

```text
provider changed only -> apply provider
Modulex changed only   -> push Modulex
neither                -> no-op
both                    -> deterministic timestamp/observed-at winner + conflict audit + converge loser
```

Reminder-only provider fingerprint changes may use `provider_observed_at` when Google `updated` did not advance.

- [ ] **Step 6: Implement incremental sync and HTTP 410 recovery.**

```ts
try {
  const page = await listGoogleCalendarEvents({ syncToken: binding.provider_sync_token, ... });
  // apply every changed/deleted event
  // persist nextSyncToken only after the full batch succeeds
} catch (error) {
  if (error instanceof GoogleCalendarProviderError && error.code === "sync_token_gone") {
    // bounded full resync, then replace provider_sync_token
  } else {
    // keep last successful local replica/token and mark provider health stale/error
  }
}
```

- [ ] **Step 7: Implement watch creation and renewal.**

Generate a random channel token, persist only its SHA-256 hash, and send the raw token only to Google when creating the channel. Create a `pending` channel record before/with the watch request so Google's initial `sync` notification can be accepted even if it arrives before the watch response is fully persisted.

Renew before expiration by creating a replacement channel with a new id, allow overlap, then stop/retire the older channel.

- [ ] **Step 8: Run provider/sync contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:google-calendar
```

Expected: sync engine/provider assertions GREEN.

- [ ] **Step 9: Commit.**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add bidirectional Google sync engine"
```

---

### Task 6: Add event CRUD, company binding, webhook, manual sync, and reconciliation APIs

**Files:**
- Create: `modulex-admin/src/app/api/admin/calendar/events/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/events/[eventId]/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/company-binding/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/google/webhook/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/google/reconcile/route.ts`
- Modify: `modulex-admin/src/app/api/admin/calendar/google/discovery/route.ts`
- Modify: `modulex-admin/src/app/api/admin/calendar/google/sync/route.ts`
- Keep legacy `.../google/import/route.ts` only for backward compatibility; V3 UI no longer uses it as the primary company-binding action.
- Modify: `modulex-admin/vercel.json`
- Test: `modulex-admin/scripts/api-timing-contract.mjs`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**

```text
POST   /api/admin/calendar/events
PATCH  /api/admin/calendar/events/:eventId
DELETE /api/admin/calendar/events/:eventId
GET    /api/admin/calendar/company-binding
PUT    /api/admin/calendar/company-binding
POST   /api/admin/calendar/google/webhook
POST   /api/admin/calendar/google/sync
GET    /api/admin/calendar/google/reconcile
```

- [ ] **Step 1: Add RED route/security assertions.**

```js
assert.match(eventRoute, /calendar\.manage/);
assert.match(webhook, /x-goog-channel-token/i);
assert.match(webhook, /x-goog-channel-id/i);
assert.match(webhook, /x-goog-resource-id/i);
assert.match(webhook, /timingSafeEqual|timingSafe/i);
```

- [ ] **Step 2: Implement normal event CRUD routes.**

`POST/PATCH/DELETE` require `calendar.manage`. Local mutation/outbox commits first, then immediate provider flush is attempted. Response shape:

```ts
{
  event: CalendarEventDto,
  provider_sync: "synced" | "pending" | "error",
  provider_error_code: string | null
}
```

A Google failure returns local success with pending/error sync status instead of rolling back Modulex.

- [ ] **Step 3: Implement company binding selection.**

`PUT /api/admin/calendar/company-binding` accepts:

```ts
{
  provider_calendar_id: string,
  owner_profile_id: string
}
```

Validate active owner, connected OAuth scopes, CalendarList entry, `accessRole` owner/writer, uniqueness, timezone/colors/provider metadata. Persist `company_provider_binding_id`, set `auto_create_project_calendar=false`, run initial full sync, then establish watch. Initial provider/watch failure after DB selection leaves the binding present with explicit error health; it never deletes Google data.

- [ ] **Step 4: Implement webhook verification.**

Webhook does not require a user session. Verify stored pending/active channel using `X-Goog-Channel-ID`, `X-Goog-Channel-Token`, `X-Goog-Resource-ID`, status/expiration, and timing-safe token hash comparison. Duplicate/lower message numbers are harmless. Coalesce sync work and attempt incremental sync; return promptly for valid notifications.

- [ ] **Step 5: Implement hourly reconciliation.**

Protect `/api/admin/calendar/google/reconcile` with the repository's existing Vercel cron-secret convention. Run in this order:

```text
1. flush due outbox items
2. incremental company-calendar sync
3. renew watch if near expiration
4. refresh CalendarList access role and detect downgrade/removal
5. persist health state
```

Add to `modulex-admin/vercel.json`:

```json
{
  "path": "/api/admin/calendar/google/reconcile",
  "schedule": "5 * * * *"
}
```

Keep the existing vendor cron unchanged. If the deployed Vercel plan rejects hourly cron, stop deployment and surface that infrastructure constraint before substituting another scheduler.

- [ ] **Step 6: Run API/V3 contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:api-timing
```

Expected: GREEN.

- [ ] **Step 7: Commit.**

```bash
git add modulex-admin/src/app/api/admin/calendar modulex-admin/vercel.json modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): expose V3 sync and event APIs"
```

---

### Task 7: Turn `/calendar` into the full rich CRUD workspace

**Files:**
- Modify: `modulex-admin/src/components/calendar/AdminCalendarWorkspace.tsx`
- Create: `modulex-admin/src/components/calendar/CalendarEventEditorModal.tsx`
- Create: `modulex-admin/src/components/calendar/CalendarCompanyStatus.tsx`
- Modify: `modulex-admin/src/app/(admin)/calendar/page.tsx` if page copy/props need updating.
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`
- Test: `modulex-admin/scripts/admin-ui-strict-contract.mjs`

**Interfaces:**
- FullCalendar uses existing day/week/month/list plugins plus `@fullcalendar/interaction`.
- Shared event editor is reused by Project Calendar.

- [ ] **Step 1: Add RED rich-UI assertions.**

```js
assert.match(workspace, /interactionPlugin/);
assert.match(workspace, /eventDrop/);
assert.match(workspace, /eventResize/);
assert.match(workspace, /select=/);
assert.match(eventEditor, /Recurrence/);
assert.match(eventEditor, /Guests|Attendees/);
assert.match(eventEditor, /Reminders/);
assert.match(eventEditor, /Google Meet/);
```

- [ ] **Step 2: Implement `CalendarEventEditorModal`.**

Use shared Admin primitives for:

```text
Title
Project (optional)
Owner/responsible employee
All day
Start / End
Timezone
Description
Location
Color
Recurrence
Guests/attendees
Guest permissions
Reminders
Google Meet add/remove
Visibility
Availability (busy/free)
```

Special Google event types render read-only provider details plus `Open in Google Calendar`.

- [ ] **Step 3: Add create/edit/delete.**

Blank-range select opens create. Editable event click opens edit. Normal delete requires confirmation. Business delete warning text states the exact canonical effect before confirmation:

```text
Project Start -> clear Start Date
Project Target -> clear Target Completion Date
Planned Delivery -> clear Planned Delivery Date
Installation -> cancel Installation; row remains
```

- [ ] **Step 4: Add drag/drop and resize.**

On local API failure, call FullCalendar `info.revert()`. On local success + provider pending/error, keep the local move and show sync state; do not revert a valid Modulex change because Google is temporarily unavailable.

- [ ] **Step 5: Replace imported-calendar management with Company Calendar status.**

Show:

```text
Company Calendar: <name>
Google account: <email>
Access: writer/owner
Sync: healthy/pending/error/conflict
Last Google sync
Watch expires
[Change Calendar] [Sync Now] [Open in Google]
```

Calendar discovery remains inside `Change Calendar` management.

- [ ] **Step 6: Keep full Month / Week / Day / List and filters.**

Preserve Owner, Project, Event Type and `My Calendar`. The Calendar filter may be reduced/hidden when only the single Company Calendar is active, but legacy/read-only calendars may still be exposed when useful.

- [ ] **Step 7: Run UI gates.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:admin-calendar
npm run smoke:admin-ui-strict
```

Expected: GREEN with no forbidden native form/table elements in changed feature TSX.

- [ ] **Step 8: Commit.**

```bash
git add modulex-admin/src/components/calendar modulex-admin/src/app/'(admin)'/calendar/page.tsx modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add rich bidirectional Admin Calendar UI"
```

---

### Task 8: Compact the Project Calendar and remove per-Project Google controls

**Files:**
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectCalendarEventList.tsx`
- Reuse: `modulex-admin/src/components/calendar/CalendarEventEditorModal.tsx`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`
- Test: existing customer/project detail contracts.

**Interfaces:**
- Project tab uses the same company-calendar/event APIs with fixed `project_id`.
- Large visual calendar is hidden by default.

- [ ] **Step 1: Add RED compact-UX assertions.**

```js
assert.match(projectTab, /Upcoming Calendar Events/);
assert.match(projectTab, /Show Calendar/);
assert.match(projectTab, /Add Event/);
assert.doesNotMatch(projectTab, /Google Calendar Projection/);
assert.doesNotMatch(projectTab, /Google Calendar Name/);
assert.doesNotMatch(projectTab, /Create Calendar/);
assert.doesNotMatch(projectTab, /Disable Sync/);
```

- [ ] **Step 2: Keep Project Schedule compact.**

Keep:

```text
Start Date
Target Completion Date
Planned Delivery Date
Primary Installation
```

Continue using `updateCustomerProjectSchedule`. Remove the explicit legacy per-Project `/resync` call; outbox/immediate provider flush handles projection.

- [ ] **Step 3: Add upcoming Project events.**

List nearest Project-linked events with date/time, title, type, responsible user, and sync status. `+ Add Event` opens the shared normal-event editor with current `projectId` preselected.

- [ ] **Step 4: Add collapsed Month/List visual calendar.**

```ts
const [calendarVisible, setCalendarVisible] = useState(false);
```

Initial UI shows `Show Calendar`. When expanded, show only the project-filtered Month/List workspace and a `Hide Calendar` action. Week/Day controls remain exclusive to the top-level `/calendar` workspace.

- [ ] **Step 5: Replace legacy Google cards with one small status row.**

```text
Company Calendar · <Family / Operations> · Synced <time> · Open in Google
```

No Project-level create, rename, enable/disable, or resync controls.

- [ ] **Step 6: Run Project/UI tests.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:customer-detail
npm run smoke:admin-ui-strict
```

Expected: GREEN.

- [ ] **Step 7: Commit.**

```bash
git add modulex-admin/src/components/customers/project-detail modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "refactor(calendar): compact Project Calendar around company sync"
```

---

### Task 9: Cut new projection over from per-Project bindings to the Company binding

**Files:**
- Modify: `modulex-admin/src/lib/google-calendar/project-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/project-schedule-projection.ts`
- Modify: `modulex-admin/src/lib/google-calendar/installation-projection.ts`
- Modify: legacy `modulex-admin/src/app/api/admin/google-calendar/projects/**` only as needed for compatibility/read-only status.
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**
- New Project creation never creates Google Calendars.
- Project/Installation schedule changes enqueue V3 source identities against the Company binding.
- Legacy provider data remains but receives no new V3 writes after cutover.

- [ ] **Step 1: Add regression assertion for no V3 Project Calendar creation.**

Target the new V3 projection path, not the legacy low-level helper:

```js
assert.doesNotMatch(v3ProjectionSource, /createGoogleProjectCalendar\(/);
assert.match(v3ProjectionSource, /calendar_sync_outbox|enqueueCalendarSync/);
```

- [ ] **Step 2: Route schedule sources through the V3 outbox.**

Use exact source identities:

```text
project_start:<project_id>
project_target:<project_id>
project_delivery:<project_id>
installation:<installation_id>
```

No Project provider-binding lookup is required for new V3 writes.

- [ ] **Step 3: Disable legacy auto-create when Company binding activates.**

Keep the column for backward compatibility but set `auto_create_project_calendar=false` during V3 company-binding activation and ensure V3 Project flows ignore it.

- [ ] **Step 4: Prevent double writes.**

If a source has both a legacy Project provider link and a V3 Company link, only the Company link is active for new synchronization. Legacy rows remain queryable for audit/history.

- [ ] **Step 5: Run regressions.**

```bash
cd modulex-admin
npm run smoke:google-calendar
npm run smoke:admin-calendar
npm run smoke:calendar-v3
```

Expected: GREEN.

- [ ] **Step 6: Commit.**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/src/app/api/admin/google-calendar modulex-admin/scripts/google-calendar-integration-contract.mjs modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "refactor(calendar): cut over projection to company calendar"
```

---

### Task 10: Documentation, roadmap, full verification, preflight, and review-ready PR

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `modulex-admin/sql/README.md`
- Keep V3 spec/plan aligned if an implementation detail requires an explicitly approved clarification.

**Interfaces:**
- Produces a review-ready draft PR. Production migration/deploy is not part of this task.

- [ ] **Step 1: Update roadmap as in progress.**

Mark `[~]` for:

```text
single Company Operational Calendar
bidirectional Google sync
rich event CRUD
Project compact Calendar
watch/reconciliation
legacy per-Project Calendar cutover
```

Preserve parallel Finance/Product/Store roadmap changes.

- [ ] **Step 2: Run focused contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:google-calendar
npm run smoke:admin-calendar
npm run smoke:rbac
npm run smoke:customer-detail
npm run smoke:admin-ui-strict
npm run smoke:api-timing
```

Expected: all PASS.

- [ ] **Step 3: Run compiler/static/build gates.**

```bash
cd modulex-admin
npm run typecheck
npm run lint
npm run build
```

Expected: exit 0 for all three.

- [ ] **Step 4: Run the wider smoke chain or equivalent existing GitHub Actions gate.**

```bash
cd modulex-admin
npm run smoke
```

When CI is the only executable environment, require the corresponding Actions jobs to complete GREEN and inspect failed logs before claiming readiness.

- [ ] **Step 5: Re-run production read-only preflight.**

Verify:

```text
one valid active Modulex Company Calendar can exist
all legacy Project calendars/bindings remain resolvable
no provider calendar-id collision violates company_shared uniqueness
connected credential can be re-consented for calendar.events
all active business source mappings resolve to real Project/Installation rows
no orphan Primary Installation integrity issue exists
```

Do not mutate production during preflight.

- [ ] **Step 6: Open/update a draft PR.**

PR notes must state:

```text
Production migration NOT applied.
OAuth re-consent for calendar.events is required after deploy.
Company Calendar must be selected explicitly after reconnect.
Legacy Project Google calendars are retained but stop receiving V3 writes after cutover.
Webhook URL must be publicly HTTPS reachable before watch activation.
Hourly Vercel reconciliation cron is required; deployment must stop if the plan rejects that schedule.
```

- [ ] **Step 7: Verify current-main mergeability and resolve conflicts without dropping either side.**

Recheck shared regression scripts, package scripts, roadmap, `vercel.json`, Google Calendar files, and other overlapping current-main changes. Re-run all gates after conflict resolution.

- [ ] **Step 8: Stop at review-ready state.**

Do not merge, migrate production DB, deploy, reconnect OAuth, or activate watch unless the user explicitly requests those production actions.

---

### Task 11: Production migration, reconnect, Company binding activation, and end-to-end acceptance

**Systems:**
- Supabase production
- Vercel Admin production
- Google OAuth / Calendar API
- Admin `/calendar`
- Project Calendar

**Interfaces:**
- Starts only after the user explicitly requests production migration/deploy/activation.

- [ ] **Step 1: Apply only the committed V3 migration after final preflight.**

Verify the production migration history records `20260906113000_calendar_v3_bidirectional.sql` and repository canonical SQL remains byte-identical.

- [ ] **Step 2: Run Supabase Security + Performance Advisors immediately.**

Separate new Calendar findings from existing baseline. Fix only V3-introduced regressions in this package and mirror hardening SQL back to the repository.

- [ ] **Step 3: Deploy Admin and verify webhook/reconcile security behavior.**

A fake Google webhook must get an intentional validation rejection, not 404/500. Reconcile must reject requests without the cron secret.

- [ ] **Step 4: Reconnect Google with `calendar.events`.**

Verify status reports bidirectional scopes granted. Never request pasted OAuth secrets/tokens.

- [ ] **Step 5: Select the real Family/shared/operations Calendar.**

Acceptance requires effective Google accessRole `writer` or `owner`, successful initial full sync, stored `nextSyncToken`, and active watch channel with expiration.

- [ ] **Step 6: Run normal-event bidirectional acceptance and clean up test artifacts.**

```text
Google create -> Modulex appears
Google edit -> Modulex updates
Google delete -> Modulex deletes/tombstones
Modulex create -> Google appears
Modulex edit -> Google updates
Modulex delete -> Google deletes
```

Also verify color, description, location, all-day/timed, recurrence, single occurrence edit/delete, attendees, guest options, reminders, Google Meet, visibility/transparency where supported.

- [ ] **Step 7: Run business-event bidirectional acceptance.**

Using a safe test Project/Installation:

```text
Modulex Start/Target/Delivery change -> Google converges
Google business event move -> canonical Project date changes
Google Project Start delete -> start_date clears
Google Target delete -> target_date clears
Google Delivery delete -> planned_delivery_date clears
Google Installation delete -> Installation status cancelled; row remains
Modulex Installation change -> Google converges
```

Verify no sync loop and no duplicate provider event.

- [ ] **Step 8: Verify watch + reconciliation resilience.**

Confirm a Google-side edit reaches Modulex through push without manual sync. Then run manual/hourly reconciliation and confirm repeated notifications/reconciliation are idempotent.

- [ ] **Step 9: Verify Project UX.**

Project Calendar starts collapsed, shows schedule summary/upcoming events, `Add Event` works, `Show Calendar` reveals Project-filtered Month/List only, and legacy Project Google management cards are absent.

- [ ] **Step 10: Close roadmap only after user acceptance.**

Change `[~]` to `[x]` only when production migration, reconnect, Company binding activation, two-way CRUD, business deletion semantics, push delivery, reconciliation, and compact Project UX are accepted.
