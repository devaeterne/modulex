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
- Modify: `modulex-admin/scripts/admin-full-route-regression-contract.mjs` only if route inventory assertions need V3 wording/content changes; preserve all concurrent route additions.

**Interfaces:**
- Consumes: existing Calendar V2 files and package smoke infrastructure.
- Produces: `npm run smoke:calendar-v3`, wired into `npm run smoke` and the existing Admin UI foundation CI job.

- [ ] **Step 1: Re-read execution-time `main`, open PRs, repo rules, Admin UI guide, validation guide, current Calendar files, and this spec/plan before creating the feature branch.**

Run/verify equivalent repository reads for:

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

Expected: feature work starts from the then-current `main`, not from the old V2 implementation SHA or the design branch.

- [ ] **Step 2: Create an isolated feature branch from execution-time `main`.**

Use:

```text
feat/calendar-v3-bidirectional
```

If occupied, use a safe unique suffix. Copy the approved V3 spec and this plan into the feature branch without reverting newer `main` changes.

- [ ] **Step 3: Write the RED contract before implementation.**

Create `calendar-v3-bidirectional-contract.mjs` with concrete required paths and assertions. Minimum contract body:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (p) => readFile(path.join(root, p), "utf8");

const [sql, migration, config, provider, syncEngine, eventRoute, webhook, reconcile, workspace, projectTab] = await Promise.all([
  source("sql/calendar-v3-bidirectional.sql"),
  source("../modulex-store/supabase/migrations/20260906XXXXXX_calendar_v3_bidirectional.sql"),
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

Replace `20260906XXXXXX` with the actual migration timestamp chosen in Task 2 and keep the contract exact.

- [ ] **Step 4: Run the new contract and verify RED.**

Run:

```bash
cd modulex-admin
node scripts/calendar-v3-bidirectional-contract.mjs
```

Expected: FAIL because `sql/calendar-v3-bidirectional.sql` and V3 service/API files do not exist yet.

- [ ] **Step 5: Wire the contract without adding a new workflow.**

Add to `package.json`:

```json
"smoke:calendar-v3": "node scripts/calendar-v3-bidirectional-contract.mjs"
```

Add `npm run smoke:calendar-v3` to the existing `smoke` chain after `smoke:admin-calendar`. Update `.github/workflows/admin-ui-foundation.yml` path filters and job steps for the V3 contract/SQL/migration/Calendar files.

- [ ] **Step 6: Commit the RED gate.**

```bash
git add modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs modulex-admin/package.json .github/workflows/admin-ui-foundation.yml
git commit -m "test(calendar): add V3 bidirectional RED contract"
```

Expected: CI demonstrates the new contract is RED before implementation.

---

### Task 2: Add the additive V3 database model and safe cutover state

**Files:**
- Create: `modulex-admin/sql/calendar-v3-bidirectional.sql`
- Create: `modulex-store/supabase/migrations/20260906XXXXXX_calendar_v3_bidirectional.sql`
- Modify: `modulex-admin/sql/README.md`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**
- Produces tables/types required by every later service:
  - `admin_calendars.kind += 'company'`
  - `project_calendar_bindings.binding_mode += 'company_shared'`
  - `calendar_integration_settings.company_provider_binding_id uuid null`
  - `calendar_events`
  - `calendar_business_event_extensions`
  - `calendar_provider_event_links`
  - `calendar_sync_outbox`
  - `calendar_google_watch_channels`
  - `calendar_sync_conflicts`
- Produces server-only/private RPCs for Google-origin business mutations and normal-event mutation integrity.

- [ ] **Step 1: Extend the RED SQL assertions with exact invariants.**

Add assertions for:

```js
assert.match(sql, /kind in \([^)]*company/i);
assert.match(sql, /binding_mode[\s\S]*company_shared/i);
assert.match(sql, /create unique index[\s\S]*admin_calendars[\s\S]*kind = 'company'/i);
assert.match(sql, /create unique index[\s\S]*company_shared/i);
assert.match(sql, /calendar_events[\s\S]*project_id uuid/i);
assert.match(sql, /calendar_provider_event_links[\s\S]*provider_event_id text not null/i);
assert.match(sql, /calendar_sync_outbox[\s\S]*source_type/i);
assert.match(sql, /calendar_google_watch_channels[\s\S]*resource_id/i);
assert.match(sql, /calendar_sync_conflicts/i);
assert.match(sql, /alter table public\.calendar_events enable row level security/i);
assert.match(sql, /revoke all on public\.calendar_events from anon, authenticated/i);
```

- [ ] **Step 2: Write canonical SQL as one additive transaction.**

Use these concrete shapes; names/types must remain stable through later tasks:

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

Create `calendar_events` with typed schedule shape and JSONB provider-compatible fields:

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

Create the generic link/outbox/watch/conflict/extension tables with uniqueness:

```sql
unique (provider_binding_id, source_type, source_id)
unique (provider_binding_id, provider_event_id)
unique (provider_binding_id, source_type, source_id) -- outbox coalescing key
```

`calendar_google_watch_channels` must persist `channel_id`, `provider_binding_id`, `resource_id`, `resource_uri`, `channel_token_hash`, `expires_at`, `status`, `last_message_number`, `created_at`, `renewed_at`, `stopped_at`.

- [ ] **Step 3: Add domain-safe private/public functions used by provider-origin apply.**

Add a private function that takes trusted source identity rather than arbitrary table/column names:

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

Behavior:

```text
project_start    -> update customer_projects.start_date
project_target   -> update customer_projects.target_date
project_delivery -> update customer_projects.planned_delivery_date
installation     -> update scheduled_start_at/end_at; if p_deleted=true set status='cancelled'
```

The function must reject unsupported `source_type`, reject recurrence for business sources at the service layer, validate Installation linkage through existing tables, and set a transaction-local origin marker such as:

```sql
perform set_config('modulex.calendar_sync_origin', 'google', true);
```

Outbox trigger functions must skip enqueueing when `current_setting('modulex.calendar_sync_origin', true) = 'google'` and the resulting source fingerprint equals the provider-applied state.

- [ ] **Step 4: Add RLS/revokes/grants/indexes.**

All V3 provider/sync persistence tables remain server-only:

```sql
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant all on public.calendar_events to service_role;
```

Apply the same server-only pattern to extension/link/outbox/watch/conflict tables. Calendar browser UI continues through permission-checked Next.js APIs.

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

- [ ] **Step 5: Preserve legacy Project Google rows without activating them for V3.**

Migration rules:

```text
existing modulex_created bindings: unchanged, no deletion
existing google_imported bindings: unchanged, no deletion
new company admin calendar: create/backfill exactly one using existing active calendar owner logic
company_provider_binding_id: remains NULL until explicit Settings selection
no Google network writes during migration
```

Do not repoint old `project_calendar_event_links` to the company binding.

- [ ] **Step 6: Mirror canonical SQL byte-for-byte into the migration file and run the contract.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
```

Expected: SQL/schema assertions pass; later service/API assertions remain RED.

- [ ] **Step 7: Commit schema.**

```bash
git add modulex-admin/sql/calendar-v3-bidirectional.sql modulex-store/supabase/migrations/20260906XXXXXX_calendar_v3_bidirectional.sql modulex-admin/sql/README.md modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add V3 bidirectional persistence"
```

---

### Task 3: Expand Google OAuth and provider primitives for shared writable calendars

**Files:**
- Modify: `modulex-admin/src/lib/google-calendar/config.ts`
- Modify: `modulex-admin/src/lib/google-calendar/google-oauth.ts`
- Modify: `modulex-admin/src/lib/google-calendar/google-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/types.ts`
- Modify: `modulex-admin/src/app/api/admin/google-calendar/status/route.ts`
- Test: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**
- Produces:

```ts
hasGoogleCalendarBidirectionalScopes(scopes): boolean
patchGoogleCalendarEvent(...): Promise<GoogleCalendarEventResource>
watchGoogleCalendarEvents(...): Promise<GoogleCalendarWatchChannel>
stopGoogleCalendarWatchChannel(...): Promise<void>
```

Provider event resource expands to preserve recurrence, attendees, reminders, conferenceData, extendedProperties, eventType, recurringEventId, originalStartTime, visibility, transparency, organizer/creator.

- [ ] **Step 1: Tighten RED contract around scopes and shared role eligibility.**

Assert:

```js
assert.match(config, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);
assert.match(config, /calendar\.calendarlist\.readonly/);
assert.match(config, /hasGoogleCalendarBidirectionalScopes/);
assert.doesNotMatch(config, /GOOGLE_CALENDAR_IMPORT_SCOPES[\s\S]*calendar\.events\.owned/);
```

- [ ] **Step 2: Replace the V3 write-scope requirement.**

Use:

```ts
export const GOOGLE_CALENDAR_BIDIRECTIONAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;
```

Keep `calendar.app.created` only if required to avoid breaking legacy routes; mark those routes legacy and stop calling them from V3 UI.

- [ ] **Step 3: Expand provider DTOs.**

Use safe types similar to:

```ts
export type GoogleCalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: string;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
};

export type GoogleCalendarEventResource = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  colorId?: string;
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
  status?: string;
  updated?: string;
  etag?: string;
  htmlLink?: string;
};
```

- [ ] **Step 4: Add PATCH and watch/stop provider calls.**

Provider methods must use these concrete endpoints:

```text
PATCH /calendar/v3/calendars/{calendarId}/events/{eventId}
POST  /calendar/v3/calendars/{calendarId}/events/watch
POST  /calendar/v3/channels/stop
```

`patchGoogleCalendarEvent` accepts optional `sendUpdates` and `conferenceDataVersion` query params. Semantic attendee mutations use `sendUpdates=all`; mirror/fingerprint-only patches omit invitation mail.

`watchGoogleCalendarEvents` request body:

```ts
{
  id: crypto.randomUUID(),
  type: "web_hook",
  address: webhookUrl,
  token: channelToken,
}
```

Return/persist Google `resourceId`, `resourceUri`, and numeric expiration.

- [ ] **Step 5: Keep CalendarList discovery but change `write_eligible`.**

Eligibility in discovery service becomes:

```ts
const writeEligible = entry.accessRole === "owner" || entry.accessRole === "writer";
```

Explicitly reject `writerWithoutPrivateAccess`.

- [ ] **Step 6: Update status DTO/UI reconnect state and run provider contracts.**

```bash
cd modulex-admin
npm run smoke:google-calendar
npm run smoke:calendar-v3
```

Expected: provider/scope assertions GREEN; sync-engine/API/UI assertions still RED.

- [ ] **Step 7: Commit provider primitives.**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/src/app/api/admin/google-calendar/status/route.ts modulex-admin/scripts/google-calendar-integration-contract.mjs modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add shared-calendar Google primitives"
```

---

### Task 4: Build the V3 repository and event domain layer

**Files:**
- Create: `modulex-admin/src/lib/calendar/calendar-events.ts`
- Create: `modulex-admin/src/lib/calendar/calendar-event-validation.ts`
- Create: `modulex-admin/src/lib/google-calendar/v3-repository.ts`
- Modify: `modulex-admin/src/lib/calendar/event-normalization.ts`
- Modify: `modulex-admin/src/lib/calendar/admin-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/repository.ts` only for legacy compatibility helpers; new V3 code should prefer `v3-repository.ts`.
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**
- Produces normal-event CRUD and mapping/outbox/watch repository APIs.

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

- [ ] **Step 1: Add failing contract assertions for normal-event types and generic links.**

```js
assert.match(calendarEventsSource, /createCalendarEvent/);
assert.match(calendarEventsSource, /deleteCalendarEvent/);
assert.match(v3RepoSource, /calendar_provider_event_links/);
assert.match(v3RepoSource, /calendar_sync_outbox/);
assert.match(v3RepoSource, /calendar_google_watch_channels/);
```

- [ ] **Step 2: Define one normalized editable event DTO.**

In `calendar-event-validation.ts`:

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

Validation rules:

```text
title trimmed/non-empty
end > start for timed events
all-day end uses exclusive date semantics and must be > start
recurrence accepts RFC5545 lines only for normal/default events
attendee emails normalized/deduplicated
reminder minutes >= 0 and supported methods only
Project id optional and must reference a real Project when supplied
owner must be active
```

- [ ] **Step 3: Implement server-only normal-event CRUD with same-transaction outbox enqueue.**

Normal event mutation and outbox insertion must succeed/fail together, using a server RPC or transaction-safe SQL function rather than two unrelated browser requests. The service must return the local event immediately; provider sync is best-effort afterward.

- [ ] **Step 4: Extend normalized Calendar feed.**

Add event types:

```ts
"calendar_event" | "google_special"
```

`calendar_event` represents editable normal events. `google_special` is read-only. Business events continue as the four existing types.

Each feed event includes:

```ts
editable: boolean;
deletable: boolean;
responsible_profile_id: string;
provider_event_type: string | null;
sync_status: "local" | "synced" | "pending" | "error" | "conflict";
```

- [ ] **Step 5: Change Admin Calendar filtering to the company calendar/read model.**

Project filtering must filter event `project_id`, not require a Project-specific Google/Admin calendar. `My Calendar` uses `responsible_profile_id` / effective responsibility rather than the company calendar owner alone.

- [ ] **Step 6: Run V3 + existing Calendar contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:admin-calendar
```

Expected: repository/domain assertions GREEN without breaking the existing core contract.

- [ ] **Step 7: Commit.**

```bash
git add modulex-admin/src/lib/calendar modulex-admin/src/lib/google-calendar/v3-repository.ts modulex-admin/src/lib/google-calendar/repository.ts modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add V3 event domain and repository"
```

---

### Task 5: Implement the bidirectional sync engine, outbox, conflict logic, and watch lifecycle

**Files:**
- Create: `modulex-admin/src/lib/google-calendar/bidirectional-sync.ts`
- Create: `modulex-admin/src/lib/google-calendar/event-mapping.ts`
- Create: `modulex-admin/src/lib/google-calendar/watch-channels.ts`
- Create: `modulex-admin/src/lib/google-calendar/sync-conflicts.ts`
- Modify: `modulex-admin/src/lib/google-calendar/calendar-import.ts` to delegate V3 company sync rather than duplicate logic where appropriate.
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

- [ ] **Step 1: Add RED assertions for source mapping, echo suppression, conflicts, and 410 recovery.**

```js
assert.match(syncEngine, /applyGoogleEventChange/);
assert.match(syncEngine, /flushCalendarOutbox/);
assert.match(syncEngine, /last_sync_origin|sync_origin/);
assert.match(syncEngine, /calendar_sync_conflicts/);
assert.match(syncEngine, /sync_token_gone|410/);
assert.match(syncEngine, /extendedProperties/);
```

- [ ] **Step 2: Implement Modulex → Google mapping.**

Normal event private extended properties:

```ts
private: {
  modulex_source_type: "calendar_event",
  modulex_source_id: event.id,
  modulex_project_id: event.project_id ?? "",
}
```

Business mapping uses existing trusted source type/id and stores the provider mapping row after create.

Use Google `PATCH` for updates. Use `DELETE` for normal event deletion. For business deletion from Modulex, remove the Google event after the canonical date is cleared/cancelled and retain a link tombstone/audit state sufficient to recognize late provider notifications.

- [ ] **Step 3: Implement Google → Modulex classification.**

Algorithm:

```text
1. Look up existing provider link by company binding + provider_event_id.
2. If link exists and source_type is business: apply only schedule/delete semantics to canonical business source.
3. If link exists and source_type=calendar_event: patch local normal event.
4. If no link and eventType=default: create/import normal calendar_event, then link it.
5. If no link and special event type: persist/update read-only provider mirror/special record; do not create editable normal event.
6. Never trust extendedProperties alone to mutate business data without an existing trusted link.
```

- [ ] **Step 4: Implement recurrence and occurrence behavior for normal events.**

Master recurring event maps to one `calendar_events` series source. Provider instances use `recurringEventId + originalStartTime` identity. A single-instance override/deletion must be represented as provider occurrence metadata/local exception data without cloning a Project/Installation.

Do not accept recurrence on business links. If Google changes a mapped business event into recurrence, write a sync conflict with code `business_recurrence_not_supported` and enqueue restoration of the singular Modulex representation.

- [ ] **Step 5: Implement fingerprint/conflict decisions.**

For each mapping store/compare:

```text
last_provider_etag
last_provider_updated_at
provider_observed_at
last_provider_fingerprint
last_modulex_fingerprint
last_sync_origin
```

Decision:

```text
provider changed only -> apply provider
Modulex changed only -> push Modulex
neither -> no-op
both -> choose deterministic winner by changed timestamp/observed-at fallback, write calendar_sync_conflicts row, then converge loser
```

Reminder-only provider changes may not advance `event.updated`; when fingerprint changes but provider timestamp does not, use `provider_observed_at` as the provider side conflict timestamp.

- [ ] **Step 6: Implement incremental sync and 410 reset.**

```ts
try {
  const page = await listGoogleCalendarEvents({ syncToken: binding.provider_sync_token, ... });
  // apply every item, then persist nextSyncToken only after full batch success
} catch (error) {
  if (error instanceof GoogleCalendarProviderError && error.code === "sync_token_gone") {
    // bounded full resync, rebuild provider replica/link observations, store new nextSyncToken
  } else {
    // retain prior data/token, mark stale/error
  }
}
```

- [ ] **Step 7: Implement watch-channel creation/renewal.**

Generate a random channel token, persist only a SHA-256 hash, and send the raw token only to Google during watch creation. Persist pending channel row before/while creating so an early initial `sync` notification can be accepted. On success update resource id/expiration and mark active.

Renew before expiration using a replacement channel id, allow overlap, then stop/retire the older channel. Do not assume fixed lifetime.

- [ ] **Step 8: Run contract.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:google-calendar
```

Expected: sync-engine/provider assertions GREEN.

- [ ] **Step 9: Commit sync engine.**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add bidirectional Google sync engine"
```

---

### Task 6: Add permission-checked event CRUD, company binding, webhook, manual sync, and reconciliation APIs

**Files:**
- Create: `modulex-admin/src/app/api/admin/calendar/events/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/events/[eventId]/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/company-binding/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/google/webhook/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/google/reconcile/route.ts`
- Modify: `modulex-admin/src/app/api/admin/calendar/google/discovery/route.ts`
- Modify: `modulex-admin/src/app/api/admin/calendar/google/import/route.ts` or replace V3 usage with company-binding route while keeping legacy compatibility.
- Modify: `modulex-admin/src/app/api/admin/calendar/google/sync/route.ts` for V3 manual company sync.
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
POST   /api/admin/calendar/google/webhook     # Google, no user auth; channel verification required
POST   /api/admin/calendar/google/sync        # authorized manual sync
GET/POST /api/admin/calendar/google/reconcile # CRON_SECRET protected
```

- [ ] **Step 1: Add RED assertions for route permissions and webhook verification headers.**

```js
assert.match(eventRoute, /calendar\.manage/);
assert.match(webhook, /x-goog-channel-token/i);
assert.match(webhook, /x-goog-channel-id/i);
assert.match(webhook, /x-goog-resource-id/i);
assert.match(webhook, /timingSafeEqual|timingSafe/i);
```

- [ ] **Step 2: Implement normal event CRUD routes.**

`POST/PATCH/DELETE` require `calendar.manage`, call the server domain, commit local mutation/outbox, then attempt immediate flush. Response must distinguish local success from provider status:

```ts
{
  event: CalendarEventDto,
  provider_sync: "synced" | "pending" | "error",
  provider_error_code: string | null
}
```

Google failure returns local success (2xx) with pending/error sync status rather than undoing the Modulex mutation.

- [ ] **Step 3: Implement company binding selection.**

`PUT /company-binding` accepts:

```ts
{
  provider_calendar_id: string,
  owner_profile_id: string
}
```

Validate active Modulex owner, Google access role owner/writer, required bidirectional scopes, uniqueness, and provider metadata. Set `calendar_integration_settings.company_provider_binding_id`, disable legacy `auto_create_project_calendar`, perform initial full sync, then establish watch. If initial Google sync/watch fails after binding selection, keep the binding but surface health/error state; do not delete user Google data.

- [ ] **Step 4: Implement webhook verification and coalesced sync.**

Webhook does **not** use user session auth. Verify stored active/pending channel using all relevant `X-Goog-*` headers and token hash. Ignore duplicate/lower message numbers safely. Record/coalesce sync work, then attempt incremental sync. Respond quickly with 2xx for accepted duplicate/change notifications so Google does not amplify retries.

- [ ] **Step 5: Implement reconciliation route and cron.**

Protect with existing Vercel cron pattern/`CRON_SECRET`. Reconciliation performs in order:

```text
1. flush due outbox items
2. incremental provider sync if binding active
3. renew watch if near expiration
4. refresh CalendarList access role / detect downgrade
5. record health
```

Update `vercel.json` by adding one Calendar reconciliation schedule alongside vendor sync, e.g. every 15 minutes if Vercel plan permits the repository's current cron policy. If deployment plan only permits daily cron, use hourly/daily reconciliation while push remains the real-time path; document the actual selected cadence in PR notes.

- [ ] **Step 6: Run API timing and V3 contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:api-timing
```

Expected: GREEN.

- [ ] **Step 7: Commit APIs.**

```bash
git add modulex-admin/src/app/api/admin/calendar modulex-admin/vercel.json modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): expose V3 sync and event APIs"
```

---

### Task 7: Refactor the full Admin Calendar into the rich event CRUD workspace

**Files:**
- Modify: `modulex-admin/src/components/calendar/AdminCalendarWorkspace.tsx`
- Create: `modulex-admin/src/components/calendar/CalendarEventEditorModal.tsx`
- Create: `modulex-admin/src/components/calendar/CalendarCompanyStatus.tsx`
- Modify: `modulex-admin/src/app/(admin)/calendar/page.tsx` if page-level props/copy are needed.
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`
- Test: `modulex-admin/scripts/admin-ui-strict-contract.mjs`

**Interfaces:**
- Admin Calendar consumes Calendar feed + event CRUD + company binding status.
- FullCalendar uses `@fullcalendar/interaction` for select/drag/resize.

- [ ] **Step 1: Add RED UI assertions.**

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

- [ ] **Step 2: Add `CalendarEventEditorModal`.**

Use shared Admin components only. Fields:

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
Availability (busy/free -> transparency)
```

When opened on a read-only special Google event, show provider details and `Open in Google Calendar` but disable mutation actions.

- [ ] **Step 3: Add create/edit/delete behavior.**

Calendar blank-range selection opens create modal. Event click opens edit modal instead of navigating away for editable events. Normal event delete uses confirmation. Business event editor exposes supported schedule/presentation fields and clearly warns deletion consequence:

```text
Project Start/Target/Delivery deletion clears that Project date.
Installation deletion cancels the Installation.
```

- [ ] **Step 4: Add drag/drop + resize.**

Use FullCalendar interaction callbacks. Optimistically revert on local API failure:

```ts
async function handleEventDrop(info: EventDropArg) {
  try {
    await updateEventTime(...);
  } catch {
    info.revert();
  }
}
```

Provider pending/error state does **not** revert a successful local mutation; instead show `Sync pending`/`Sync error` badge.

- [ ] **Step 5: Simplify company/calendar management.**

Replace generic imported-calendar management as the main workflow with one Company Calendar status/selector card:

```text
Company Calendar: <provider name>
Google account: <email>
Access: writer/owner
Sync: healthy/pending/error/conflict
Last Google sync
Watch expires
[Change Calendar] [Sync Now] [Open in Google]
```

CalendarList discovery remains available inside `Change Calendar` management, not as multiple imported calendars the user must manage individually.

- [ ] **Step 6: Preserve top-level Month / Week / Day / List and filters.**

Filters remain Owner, Project, Calendar/Event Type where still meaningful; `My Calendar` becomes effective responsibility filter. For single company topology, hide/reduce the redundant Calendar filter if only one active company calendar exists, while retaining compatibility if legacy/read-only calendars are displayed.

- [ ] **Step 7: Run strict UI + Calendar contracts.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:admin-calendar
npm run smoke:admin-ui-strict
```

Expected: GREEN and no native button/input/select/textarea/label/table violations in changed feature TSX.

- [ ] **Step 8: Commit Admin Calendar UI.**

```bash
git add modulex-admin/src/components/calendar modulex-admin/src/app/'(admin)'/calendar/page.tsx modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "feat(calendar): add rich bidirectional Admin Calendar UI"
```

---

### Task 8: Compact the Project Calendar tab and remove per-Project Google management

**Files:**
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx`
- Create: `modulex-admin/src/components/customers/project-detail/ProjectCalendarEventList.tsx`
- Reuse: `modulex-admin/src/components/calendar/CalendarEventEditorModal.tsx`
- Modify legacy Project Google API usage only as needed so the tab no longer calls create/rename/toggle Project Calendar endpoints.
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`
- Test: existing customer/project detail contracts.

**Interfaces:**
- Project tab uses the same event APIs as `/calendar` with fixed `project_id`.
- Large visual Calendar is collapsed by default.

- [ ] **Step 1: Add RED assertions for compact UX and removed legacy controls.**

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

Display/edit:

```text
Start Date
Target Completion Date
Planned Delivery Date
Primary Installation
```

Keep existing domain mutation `updateCustomerProjectSchedule`; stop manually calling the old per-Project `/resync` endpoint. The domain/outbox path now handles provider projection.

- [ ] **Step 3: Add upcoming event list.**

Show the nearest relevant events with time, title, type, sync state, and edit affordance. `+ Add Event` opens the shared editor with `projectId` preselected.

- [ ] **Step 4: Add collapsed visual calendar.**

Initial state:

```ts
const [calendarVisible, setCalendarVisible] = useState(false);
```

Render `Show Calendar`; once open, render a project-filtered Month/List workspace only. Provide `Hide Calendar` to collapse again. Do not render Week/Day controls in the Project compact view.

- [ ] **Step 5: Replace legacy Google cards with one small company status row.**

Example copy:

```text
Company Calendar · <Family / Operations> · Synced <time> · Open in Google
```

No Project-level create/rename/enable/disable controls.

- [ ] **Step 6: Run tests.**

```bash
cd modulex-admin
npm run smoke:calendar-v3
npm run smoke:customer-detail
npm run smoke:admin-ui-strict
```

Expected: GREEN.

- [ ] **Step 7: Commit Project UX.**

```bash
git add modulex-admin/src/components/customers/project-detail modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "refactor(calendar): compact Project Calendar around company sync"
```

---

### Task 9: Disable new legacy per-Project provider creation and preserve backward compatibility

**Files:**
- Modify: `modulex-admin/src/lib/google-calendar/project-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/project-schedule-projection.ts`
- Modify: `modulex-admin/src/lib/google-calendar/installation-projection.ts`
- Modify: legacy `/api/admin/google-calendar/projects/**` routes as needed.
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Test: `modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs`

**Interfaces:**
- New Project creation never creates a Google Calendar.
- Existing legacy binding status/read operations continue to work for audit/transition, but V3 UI does not use them as active destination.

- [ ] **Step 1: Add a failing regression assertion that V3 project flow does not create calendars.**

```js
assert.doesNotMatch(projectCalendarV3Path, /createGoogleProjectCalendar\(/);
assert.match(settingsSqlOrService, /auto_create_project_calendar[\s\S]*false/);
```

Keep the low-level legacy provider helper itself if existing tests/records still require it; the assertion targets V3 flow, not necessarily deleting the function from the repository.

- [ ] **Step 2: Route Project/Installation projection through the company outbox.**

Project schedule save and Installation mutations must enqueue source identities:

```text
project_start:<project_id>
project_target:<project_id>
project_delivery:<project_id>
installation:<installation_id>
```

No Project binding lookup is required for new V3 projection.

- [ ] **Step 3: Disable legacy auto-create setting on V3 company binding activation.**

Do not delete the column in this package. Set it false and ensure V3 Project flows ignore it.

- [ ] **Step 4: Preserve legacy data and prevent double writes.**

If a source has both a legacy Project provider link and a V3 company link, only the V3 company link is active for new writes after cutover. Legacy rows are retained and marked/treated inactive for projection.

- [ ] **Step 5: Run projection regression contracts.**

```bash
cd modulex-admin
npm run smoke:google-calendar
npm run smoke:admin-calendar
npm run smoke:calendar-v3
```

Expected: GREEN.

- [ ] **Step 6: Commit cutover behavior.**

```bash
git add modulex-admin/src/lib/google-calendar modulex-admin/src/app/api/admin/google-calendar modulex-admin/scripts/google-calendar-integration-contract.mjs modulex-admin/scripts/calendar-v3-bidirectional-contract.mjs
git commit -m "refactor(calendar): cut over projection to company calendar"
```

---

### Task 10: Documentation, roadmap, full verification, production preflight, and PR readiness

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Modify: `modulex-admin/sql/README.md`
- Modify: V3 spec/plan only if implementation discovered a necessary approved clarification; do not silently change product decisions.
- PR body: summarize migration/cutover/reconnect/acceptance steps.

**Interfaces:**
- Produces a review-ready draft PR with no production migration applied yet.

- [ ] **Step 1: Update roadmap as in-progress.**

Add/modify the Calendar package with `[~]`, not `[x]`, until production acceptance passes. Record:

```text
single Company Operational Calendar
bidirectional Google sync
rich event CRUD
Project compact Calendar
watch/reconciliation
legacy per-Project Calendar cutover
```

Preserve all parallel Finance/Product/Store roadmap changes from current main.

- [ ] **Step 2: Run the focused contract suite.**

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

- [ ] **Step 4: Run the wider smoke chain or the existing Calendar CI job and inspect logs.**

```bash
cd modulex-admin
npm run smoke
```

If CI is the only executable environment, require the corresponding GitHub Actions job to complete GREEN and inspect failed job logs before claiming readiness.

- [ ] **Step 5: Re-run production data preflight before DB apply.**

Read-only checks must confirm:

```text
exactly one intended active Modulex company calendar can be established
all existing Project calendars/bindings remain resolvable
no duplicate provider calendar id that would violate company_shared uniqueness
connected Google credential is known and can reconnect for calendar.events
all active business source mappings resolve to real Projects/Installations
no orphan primary Installation integrity issues
```

Do not mutate production during preflight.

- [ ] **Step 6: Open/update a draft PR from the feature branch.**

PR notes must state:

```text
Production migration NOT applied yet.
Google OAuth re-consent for calendar.events required after deploy.
Company Calendar must be selected explicitly after reconnect.
Legacy Project Google calendars are retained but no longer receive V3 writes after cutover.
Webhook URL must be publicly HTTPS reachable before watch activation.
```

- [ ] **Step 7: Verify PR mergeability/current-main conflicts.**

If `main` moved, resolve by preserving both newer main behavior and V3 behavior; pay particular attention to shared regression scripts, package scripts, roadmap, `vercel.json`, and Google Calendar files. Re-run all gates after conflict resolution.

- [ ] **Step 8: Stop at review-ready state unless the user explicitly requests production migration/deploy.**

No merge, production DB migration, OAuth reconnect, watch activation, or deployment is implicit in this plan execution.

---

### Task 11: Production migration, reconnect, company binding activation, and end-to-end acceptance

**Files/Systems:**
- Supabase production project
- Vercel Admin deployment
- Google OAuth consent / Calendar API
- Production Admin Calendar

**Interfaces:**
- This task starts only after the user explicitly asks to migrate/deploy/activate production.

- [ ] **Step 1: Apply the mirrored V3 migration after final preflight.**

Apply only the committed migration file. Verify migration history records the expected version and canonical SQL remains byte-identical to the repository mirror.

- [ ] **Step 2: Run Supabase Security + Performance Advisors immediately after migration.**

Classify new Calendar findings separately from pre-existing baseline warnings. Fix only Calendar regressions introduced by V3 in the same package and mirror any hardening SQL back into the repo.

- [ ] **Step 3: Deploy Admin and verify the webhook/reconcile endpoints are reachable.**

Confirm HTTPS webhook returns an intentional non-success/validation response for an unauthenticated fake Google request rather than 404/500, and reconcile endpoint rejects requests without the cron secret.

- [ ] **Step 4: Reconnect Google with `calendar.events`.**

Verify status shows bidirectional scopes granted. Never ask the user to paste OAuth secrets/tokens.

- [ ] **Step 5: Select the real Family/shared/operations calendar as Company Calendar.**

Acceptance requires Google access role `writer` or `owner`, initial full sync success, a stored `nextSyncToken`, and an active watch channel with expiration.

- [ ] **Step 6: Run normal-event bidirectional acceptance.**

Test all directions without leaving test artifacts:

```text
Google create -> appears in Modulex
Google edit -> Modulex updates
Google delete -> Modulex deletes/tombstones
Modulex create -> appears in Google
Modulex edit -> Google updates
Modulex delete -> Google deletes
```

Also test color, description, location, all-day/timed, recurrence, one occurrence edit/delete, attendees, reminder, Google Meet, visibility/transparency where supported by the chosen calendar.

- [ ] **Step 7: Run business-event bidirectional acceptance.**

Use a safe test Project/Installation and verify:

```text
Modulex Start/Target/Delivery change -> Google event converges
Google business event move -> canonical Project date changes
Google Project Start deletion -> start_date clears
Google Target deletion -> target_date clears
Google Delivery deletion -> planned_delivery_date clears
Google Installation deletion -> Installation becomes cancelled, row remains
Modulex Installation change -> Google converges
```

Verify no sync loop and no duplicate provider events.

- [ ] **Step 8: Verify push + reconciliation resilience.**

Check Google-side change reaches Modulex through watch without manual refresh/sync. Then exercise manual/reconciliation sync to prove missed-push safety. Confirm repeated webhook/reconcile calls are idempotent.

- [ ] **Step 9: Verify Project UX.**

Project Calendar opens with the large calendar hidden, shows schedule summary/upcoming events, `Add Event` works, `Show Calendar` reveals only the Project-filtered compact calendar, and legacy Project Google management cards are absent.

- [ ] **Step 10: Close roadmap only after user acceptance.**

Change `[~]` to `[x]` only when production migration, reconnect, company binding activation, two-way CRUD, business delete semantics, watch delivery, reconciliation, and Project compact UX are all accepted.
