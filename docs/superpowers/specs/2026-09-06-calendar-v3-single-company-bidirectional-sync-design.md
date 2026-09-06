# Modulex Calendar V3 — Single Company Calendar + Bidirectional Google Sync Design

## Status and precedence

This design supersedes the Google-provider topology and one-way source-of-truth rules in:

- `docs/superpowers/specs/2026-09-05-google-calendar-project-integration-design.md`
- `docs/superpowers/specs/2026-09-05-admin-calendar-scheduling-core-design.md`

The existing Project scheduling fields, Primary Installation integrity, first-class Admin Calendar, RBAC, and server-only credential rules remain valid unless this document explicitly changes them.

The key V3 change is architectural: Modulex no longer creates or expects one Google Calendar per Project. The company selects one writable Google Calendar and Modulex synchronizes that calendar bidirectionally.

## Goal

Make Modulex Calendar behave like the company's operational Google Calendar while preserving Modulex business integrity.

V3 must provide:

- one company-level Google Calendar binding, which may be a primary, Family, or other shared calendar;
- no automatic Google Calendar creation per Project;
- bidirectional create/update/delete synchronization for ordinary calendar events;
- controlled bidirectional schedule synchronization for Project Start, Project Target, Planned Delivery, and Installation appointments;
- Google `events.watch` push notifications plus incremental `syncToken` reconciliation;
- familiar Google Calendar event fields in Modulex, including recurrence, attendees, reminders, colors, and Google Meet for normal/default events;
- a compact Project Calendar experience with the large calendar collapsed by default;
- the full Month / Week / Day / List workspace on the top-level `/calendar` page;
- operation without Google: Modulex remains usable and provider writes are retried later.

## Approved product decisions

The following decisions are fixed for V3:

1. The company uses one shared operational calendar. Projects do not get separate Google calendars.
2. Google and Modulex changes synchronize in both directions.
3. Project business event deletion follows option A:
   - deleting Project Start clears `customer_projects.start_date`;
   - deleting Project Target clears `customer_projects.target_date`;
   - deleting Planned Delivery clears `customer_projects.planned_delivery_date`;
   - deleting an Installation event does not delete the Installation row; it cancels the Installation;
   - deleting a normal calendar event deletes it from the user's calendar experience on both sides.
4. Normal/default Google events support rich editing in Modulex: title, dates, all-day, timezone, description, location, color, recurrence, attendees, reminders, Google Meet, visibility, and transparency where Google exposes them.
5. Google-specific special event types such as focus time, out-of-office, and working location may be mirrored/displayed but are not created or edited by Modulex V3.
6. The Project Calendar's large visual calendar is hidden by default and shown only on demand.

## Current state being replaced

The deployed integration currently contains:

- one Google OAuth credential singleton;
- `calendar_integration_settings` with `auto_create_project_calendar`;
- `project_calendar_bindings` that historically associate a Project with one provider calendar;
- `project_calendar_event_links` for Project milestone/Installation provider mappings;
- `admin_calendars` including one logical Project calendar per Project;
- `google_calendar_event_mirror` for imported provider-only read-only events;
- Project milestone and Installation projection from Modulex to Google;
- Google CalendarList discovery and incremental event listing;
- no Google `events.watch` webhook lifecycle;
- OAuth scope `calendar.events.owned`, which is too narrow for a shared calendar where the connected account is a writer rather than the calendar owner.

V3 evolves this state additively and preserves existing IDs/data for audit and rollback. It does not destructively delete legacy Google calendars during cutover.

## Architecture

The single-company flow is:

```text
Google Family / Shared / Primary Calendar
                  ↕
        Google Calendar API
        events.watch + syncToken
                  ↕
        Modulex Sync Engine
          ↙              ↘
 Business schedules     Normal events
 Project/Installation   calendar_events
                  ↘      ↙
              Admin Calendar
          /calendar + Project filter
```

Modulex has two event classes with different canonical rules:

- **Business events:** the underlying Project or Installation row is canonical, but authorized Google changes are allowed to update the corresponding canonical scheduling fields.
- **Normal events:** Modulex and the selected Google Calendar are peers. `calendar_events` is the local durable replica used by Admin UI and offline/provider-failure behavior.

No database trigger or database function calls Google directly.

## Persistence model

V3 uses these exact server-owned persistence responsibilities:

- `admin_calendars`: logical Modulex calendars; add `kind = 'company'`.
- `calendar_integration_settings`: singleton integration settings; add `company_admin_calendar_id` and `company_provider_binding_id`.
- `project_calendar_bindings`: retain the physical table for compatibility; extend `binding_mode` with `company_shared`. Despite the legacy name, the selected `company_shared` row has `project_id = null` and is the active company provider binding.
- `calendar_events`: ordinary, business-neutral calendar events editable from either side.
- `calendar_business_event_extensions`: provider/calendar presentation metadata for business-backed events without duplicating canonical schedule fields.
- `calendar_provider_event_links`: generic V3 source↔provider event identity and synchronization metadata.
- `calendar_sync_outbox`: durable Modulex→Google work.
- `calendar_sync_jobs`: coalesced Google→Modulex/reconciliation work signaled by watch notifications or maintenance.
- `calendar_watch_channels`: active/replaced/stopped Google watch channel lifecycle.
- `calendar_sync_audit`: provider-origin business changes, automatic conflict decisions, cutover events, and sync diagnostics that require durable audit.

Existing `project_calendar_event_links` and `google_calendar_event_mirror` remain legacy-compatible during cutover. New V3 mappings use `calendar_provider_event_links` rather than overloading old per-Project mapping constraints.

## Company Operational Calendar

### One active company calendar

Extend `admin_calendars.kind` with `company` and enforce at most one active `company` row for the single-company instance.

The company calendar:

- has one required active Modulex `owner_profile_id`;
- has no `project_id`;
- uses the company/default timezone unless the selected Google calendar supplies a more specific timezone;
- remains a Modulex logical calendar even if Google is disconnected.

`calendar_integration_settings.company_admin_calendar_id` references this logical calendar. `calendar_integration_settings.company_provider_binding_id` references the selected `project_calendar_bindings` row whose `binding_mode = 'company_shared'`.

The Company Calendar row and company provider binding are created/activated by the explicit Settings selection flow, not merely by applying the database migration. The user selecting the calendar must also select/confirm the required Modulex calendar owner.

The legacy setting `auto_create_project_calendar` is set to `false` at V3 activation and is no longer used by new Project flows.

### Eligible Google calendars

Settings → Calendar lists the connected account's CalendarList entries.

A calendar is eligible as the writable Company Operational Calendar when the connected account has effective `accessRole`:

- `owner`, or
- `writer`.

`reader`, `freeBusyReader`, and `writerWithoutPrivateAccess` are not eligible for the full-fidelity V3 company binding. `writerWithoutPrivateAccess` is deliberately rejected because private event fidelity cannot be guaranteed.

Family Calendar receives no name-based special case. If Google exposes it through CalendarList with sufficient access, it behaves like any other eligible shared calendar.

Persist provider calendar id, name, timezone, access role, data owner when available, and provider colors separately from the Modulex owner.

## OAuth scopes

V3 replaces `calendar.events.owned` as the write scope with:

- `https://www.googleapis.com/auth/calendar.events`

Retain:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `openid`
- `email`

`calendar.app.created` may remain temporarily during legacy transition, but V3 does not use it to create new Project calendars.

Existing credentials without `calendar.events` must show `Reconnect required` and must not activate bidirectional company sync until the user re-consents.

The application does not add Calendar ACL-management, full-calendar administration, or free/busy scopes.

## Modulex ownership and My Calendar

The Company Operational Calendar has one required Modulex owner.

Every normal `calendar_events` row also has one required active `owner_profile_id`:

- events created in Modulex default to the current profile;
- Google-origin normal events assign an active Modulex profile when the organizer email exactly matches a known active profile email;
- otherwise Google-origin normal events fall back to the Company Calendar owner.

Business event responsibility is derived without adding a second owner ledger:

- Project Start/Target/Delivery use the active Project Sales Rep when present, otherwise the Company Calendar owner;
- Installation events use the active Project Sales Rep when present, otherwise the Company Calendar owner in V3. Installer-specific responsibility may be introduced later only when a canonical employee assignment exists.

`My Calendar` in V3 filters by this effective event responsibility, not merely by the single company calendar owner.

## Event classes and canonical data

### Business event types

The following remain business-backed events:

- `project_start`
- `project_target`
- `project_delivery`
- `installation`

Their canonical schedule fields remain:

- `customer_projects.start_date`
- `customer_projects.target_date`
- `customer_projects.planned_delivery_date`
- `customer_installations.scheduled_start_at`
- `customer_installations.scheduled_end_at`

Changing a business event in Modulex or Google updates these canonical fields through domain-safe server mutation functions. The Calendar integration does not create a second schedule ledger.

### Business deletion behavior

Provider or Modulex deletion means:

| Event type | Canonical result |
| --- | --- |
| Project Start | `start_date = null` |
| Project Target | `target_date = null` |
| Planned Delivery | `planned_delivery_date = null` |
| Installation | set canonical Installation status to `cancelled`; do not physically delete the row |

Deleting/cancelling the Primary Installation must continue to clear/recalculate `primary_installation_id` according to the existing integrity rules.

### Business event presentation metadata

Business schedule identity and schedule remain canonical in their domain tables. `calendar_business_event_extensions` stores only flexible calendar/provider presentation fields keyed by source type + source id:

- title override;
- description;
- location;
- provider color id;
- attendees;
- reminders;
- conference data / Google Meet metadata;
- visibility;
- transparency.

Editing an event title never renames the Project, Customer, or Installation record.

Business events are always singular. Recurrence is not allowed for Project milestones or Installation records because one canonical business record must not silently become multiple business appointments. If Google adds recurrence to a mapped business event, the sync engine audits the incompatible change and restores the supported singular representation rather than creating fake Projects/Installations.

## Normal calendar events

`calendar_events` is the first-class server-owned local replica for ordinary events that are not backed by a Project milestone or Installation.

Required core fields include:

- stable Modulex event id;
- company admin calendar id;
- optional `project_id` for contextual filtering only;
- required operational owner profile id;
- title;
- description;
- location;
- timed or all-day start/end shape;
- timezone;
- provider color id and effective colors;
- recurrence rules;
- optional recurring parent identity for occurrence overrides;
- provider recurring event id/original start identity where applicable;
- attendee data;
- reminder configuration;
- Google Meet/conference data;
- visibility;
- transparency;
- provider event type;
- status/deletion tombstone;
- created/updated actors and timestamps.

Normal events may exist without a Project. When created from a Project Calendar tab, `project_id` defaults to the current Project but remains calendar metadata rather than a new Project business record.

User-visible deletion is immediate. An internal tombstone is retained long enough for provider synchronization, conflict detection, and audit before maintenance cleanup.

## Google event fidelity

For normal/default events, Modulex V3 supports Google-compatible fields that materially affect the event experience:

- summary/title;
- description;
- location;
- start/end;
- all-day dates using Google's exclusive end-date semantics;
- timezone;
- `colorId`;
- recurrence rules;
- attendee email/list plus provider-returned response status for display;
- reminders (`useDefault` and supported overrides);
- conference/Google Meet data;
- visibility;
- transparency;
- status;
- organizer/creator information for display when safe;
- `htmlLink`;
- provider `etag` and `updated` metadata.

Modulex does not edit attendee response statuses on behalf of invitees. It edits the attendee list; Google remains authoritative for attendee responses.

Updates from Modulex use Google `events.patch` for partial mutations so unsupported or unedited provider fields are not accidentally erased.

### Recurring events

Canonical provider synchronization uses `Events.list` without `singleEvents=true` so recurring master resources and exceptions remain available. Calendar display may expand instances using the local recurrence read model and/or provider instance identity without replacing the stored recurring master.

V3 supports:

- creating and editing a recurring series;
- deleting a recurring series;
- displaying expanded instances in Calendar views;
- editing or deleting a single occurrence using Google's recurring-event instance identity (`recurringEventId` + `originalStartTime`/instance id).

The advanced Google Calendar UI behavior "this and following events" is not reproduced in V3 because Google represents it as a series split rather than a single primitive mutation. A user can edit the whole series or one occurrence in Modulex, while advanced series splitting remains available in Google.

### Attendees and invitation updates

Attendees are editable for normal/default events.

Semantic Modulex mutations to attendee-bearing Google events use provider invitation updates (`sendUpdates=all`) so invitees receive schedule/cancellation updates expected from a normal Calendar edit. Sync-only metadata patches that do not change event semantics must not generate attendee mail.

Provider-origin changes are never echoed back merely to rewrite the same attendee state.

### Google Meet

Normal/default events can add, preserve, and remove Google Meet conference data when the selected calendar supports Google Meet.

Before V3 enables conference modifications on an existing mirrored calendar, the selected company calendar must complete an initial full event sync. Provider mutations involving conference data use `conferenceDataVersion=1` and unique conference creation request ids.

### Special Google event types

Provider event types with specialized Google semantics, including focus time, out-of-office, and working location, are mirrored for display when visible through the API.

V3 does not create or edit these specialized types from Modulex. They remain provider-owned/read-only entries in Modulex Calendar.

## Provider identity and extended properties

Modulex-created Google events include private extended properties sufficient to recover identity without exposing secrets, for example:

- Modulex event/source class;
- Modulex source id;
- Modulex Project id when applicable;
- Modulex normal event id when applicable.

These properties are identifiers, not authorization. A webhook/provider payload is never allowed to mutate a Project or Installation solely because arbitrary extended properties claim a source id.

Before applying a Google change to business data, the sync engine verifies the active company binding and an existing trusted `calendar_provider_event_links` relationship. If private extended properties claim a business source but no trusted mapping exists, the event is treated as untrusted provider data and cannot mutate business rows.

Google-origin ordinary events without Modulex metadata are imported as normal `calendar_events` and mapped by provider calendar/event identity.

## Generic provider event mapping

`calendar_provider_event_links` is independent of Project-specific calendars.

Each row contains:

- company provider binding id;
- source type (`project_start`, `project_target`, `project_delivery`, `installation`, `calendar_event`);
- source id;
- optional Project id for filtering/audit;
- provider event id;
- provider recurring parent/original-start identity where needed;
- last provider `etag`;
- last provider `updated` timestamp;
- last provider fingerprint;
- last Modulex fingerprint/version;
- last successful sync time;
- last sync origin;
- sync status/error metadata;
- provider deletion/tombstone state where needed.

Enforce uniqueness by binding + source identity and by binding + provider event id. Recurring occurrence exceptions use an occurrence discriminator so a series source and its provider exceptions do not collide.

Existing `project_calendar_event_links` are retained as legacy mappings for old per-Project Google calendars. V3 does not repoint old provider event ids to the company calendar because provider event ids are calendar-specific.

## Modulex → Google synchronization

A Modulex mutation always commits its own business/calendar transaction first.

The same transaction records an idempotent `calendar_sync_outbox` item when a Google-relevant source changed. Database triggers may enqueue work, but they never call an external provider.

After a successful Admin API mutation, the server attempts to flush the affected outbox item immediately for low latency. Provider failure does not roll back the Modulex mutation.

Unsuccessful items remain durable and are retried by reconciliation/maintenance processing with bounded backoff.

Outbox identity coalesces duplicate changes for the same source/occurrence rather than creating unlimited duplicate work.

## Google → Modulex synchronization

### `events.watch`

For the selected company provider calendar, Modulex creates one Google Events notification channel using an HTTPS webhook.

`calendar_watch_channels` stores server-only channel state:

- channel id;
- company binding id;
- Google resource id;
- resource URI when useful;
- channel token hash;
- returned expiration;
- active/replaced/stopped status;
- last accepted message number;
- created/renewed/stopped timestamps.

The channel token contains no OAuth token or secret business data.

The webhook validates at least:

- active channel id;
- channel token using constant-time comparison against the stored hash model;
- Google resource id;
- binding association;
- expiration/status.

Google notification messages contain no event body. A valid notification only signals that the watched event collection changed.

The webhook first upserts/coalesces a `calendar_sync_jobs` row for the binding and returns an idempotent success path. It then attempts the incremental sync inline when execution budget allows; the durable job remains the retry source if inline work fails or times out.

Duplicate/retried notifications are harmless.

### Channel renewal

Notification channels expire and cannot be renewed in place. V3 creates a replacement channel with a new id before the current channel expires, allows a safe overlap period, and retires the old channel.

Maintenance uses the expiration value Google actually returned; it does not assume a permanent channel or hardcode provider TTL as a correctness condition.

### Incremental synchronization

The selected company binding stores the latest Google `nextSyncToken`.

Canonical full/incremental synchronization uses the same stable Events.list parameter set so Google sync-token semantics remain valid.

Flow:

1. First activation performs a full event sync and stores the returned sync token.
2. Each notification/reconciliation run calls Events.list with the previous sync token.
3. Apply every changed/deleted provider event idempotently.
4. Store the new `nextSyncToken` only after the batch has been applied successfully.
5. If Google returns HTTP 410 for an invalid sync token, run a full resync and replace the token.

A failed incremental sync leaves the last successful local replica intact and records stale/error state. It never clears valid Modulex Calendar data merely because Google is unavailable.

### Reconciliation safety net

Push notifications are the fast path, not the only correctness mechanism.

A scheduled reconciliation job periodically:

- retries `calendar_sync_outbox` failures;
- drains pending `calendar_sync_jobs`;
- runs incremental sync if a company binding is active;
- renews expiring watch channels;
- detects provider access downgrade/removal;
- records health state.

The schedule uses the existing server cron mechanism. Webhook delivery remains the near-real-time Google→Modulex path; immediate post-mutation flush remains the near-real-time Modulex→Google path.

## Loop prevention

Provider-origin mutations applied to Modulex must not immediately enqueue an identical write back to Google.

Internal Google-apply mutation functions set an explicit transaction-local sync origin such as `google`. Outbox triggers recognize that origin and suppress echo work for the provider-applied source/occurrence.

Provider `etag`/fingerprints and Modulex fingerprints make repeated webhook messages and reconciliation idempotent.

Metadata-only identity maintenance is also fingerprint-aware so adding Modulex private extended properties cannot create an infinite Google→Modulex→Google cycle.

## Conflict policy

A conflict exists when both the Modulex source fingerprint and the Google provider fingerprint changed since the last successful synchronization.

V3 resolves conflicts deterministically:

1. compare Google's provider `updated` timestamp with the canonical Modulex row/event `updated_at`;
2. the later server timestamp wins;
3. if timestamps are within two seconds, Modulex wins;
4. write a `calendar_sync_audit` row with event/source identity, both fingerprints/timestamps, chosen winner, origin, and resolution time.

Deletion participates in the same rule.

Examples:

- Google deletes Project Start after the last sync and no newer Modulex edit exists → clear `start_date`.
- Google deletes a business event but Modulex has a newer canonical schedule → Modulex wins and the Google event is restored/recreated.
- Google edits a normal event while Modulex has a newer unsynced edit → the newer Modulex version wins and is patched to Google.

Conflict history is operational/audit data; ordinary single-sided edits require no user intervention.

## Domain-safe Google-origin business mutation

Google write access effectively becomes an integration actor capable of changing approved schedule fields. Provider-origin business updates therefore use narrow internal functions, not arbitrary service-role table writes.

Allowed mappings are only:

- Project Start date;
- Project Target date;
- Planned Delivery date;
- Installation scheduled start/end;
- Installation cancellation caused by deleting its mapped calendar event.

Provider changes must not mutate:

- Project/customer names;
- pricing;
- orders;
- products;
- arbitrary Installation fields;
- Project status;
- unrelated business data.

Every provider-origin domain change writes a `calendar_sync_audit` entry identifying Google as the origin and the connected provider account/binding. Do not falsely attribute an exact human editor when Google does not expose one.

## Project Calendar UX

The current Project Calendar tab is too large and provider-management-heavy. V3 replaces it with a compact Project scheduling surface.

Default layout:

```text
Project Schedule
Start        Target       Delivery       Primary Installation
Sep 3        Oct 5        Oct 15         Aug 28
[ Edit Schedule ]

Upcoming Calendar Events                          [+ Add Event]
Sep 18 10:00   Cabinet Installation
Sep 22 14:30   Customer Meeting
Oct 5 All day  Project Target

[ Show Calendar ]

Company Calendar · Family / Operations · Synced · Open in Google
```

Requirements:

- the large visual calendar is collapsed by default on each Project Detail entry;
- `Show Calendar` expands a Project-filtered Month/List mini workspace;
- `Hide Calendar` collapses it again;
- `+ Add Event` opens the shared Calendar event editor with the current Project preselected;
- clicking an event opens the same editor/detail experience;
- business events expose only fields compatible with their domain mapping plus supported business presentation metadata;
- normal events expose the full supported Google-like event editor;
- the compact schedule editor continues to manage Start, Target, Planned Delivery, and Primary Installation;
- the Project Calendar tab works if Google is temporarily unavailable;
- dark-mode styling uses the shared Admin UI system.

Remove from Project Detail:

- per-Project `Google Calendar Projection` management card;
- Project-level Enable/Disable Google sync;
- `Google Calendar Name` rename card;
- any action that creates or renames a provider calendar for a Project.

## Central Admin Calendar UX

The top-level `/calendar` remains the full operational workspace.

Views:

- Month
- Week
- Day
- List

Filters include:

- My Calendar / responsibility;
- Owner/responsible employee;
- Project;
- Calendar/provider state when relevant;
- Event Type.

The central workspace supports:

- create normal event;
- edit normal event;
- delete normal event;
- edit supported business schedule fields;
- approved business deletion semantics;
- drag/drop and resize as schedule edits when the event type allows them;
- Google/provider color display;
- provider sync/stale/conflict indicators without hiding valid Modulex data.

The shared event editor is used by both `/calendar` and Project Calendar.

## Legacy Project calendar cutover

V3 does not automatically delete existing per-Project Google calendars or their events.

When a Company Operational Calendar is successfully activated:

1. complete an initial full sync of the chosen company calendar;
2. establish a valid Events watch channel;
3. project current Modulex business events into the company calendar using new V3 mappings;
4. set `calendar_integration_settings.auto_create_project_calendar = false`;
5. disable legacy per-Project provider synchronization only after the company binding is healthy;
6. retain legacy provider bindings/event links for audit and optional manual cleanup;
7. mark/exclude legacy Project logical calendars from the default V3 Calendar feed so users do not see duplicate scheduling surfaces;
8. disable the `ensure_project_admin_calendar` creation path for new Projects in V3 company mode.

Existing legacy Google calendars remain untouched unless a future explicit cleanup action is approved.

Before explicit V3 activation, the migration does not silently change the active provider destination or write to Google.

## Switching the company calendar

Changing the selected Company Operational Calendar is an explicit Settings action.

The switch is staged:

1. validate `writer`/`owner` access to the new calendar;
2. full-sync the new calendar;
3. create its watch channel;
4. project current Modulex business events and establish V3 mappings;
5. atomically mark the new binding active in `calendar_integration_settings`;
6. retire the old watch and disable old synchronization.

Do not automatically delete events from the previously selected Google calendar during V3 switching. Destructive provider cleanup requires a separate explicit future action.

## RBAC

Preserve:

- `calendar.view`
- `calendar.manage`

Rules:

- viewing Calendar requires `calendar.view`;
- normal event create/edit/delete requires `calendar.manage`;
- company provider selection, reconnect, watch maintenance controls, and ownership reassignment require `calendar.manage` plus the existing Settings-management permission where applicable;
- editing Project-backed schedule fields through Calendar must also satisfy the existing Project mutation permission;
- editing/cancelling Installation-backed events through Calendar must satisfy the existing Installation/Fulfillment mutation permission;
- webhook/provider-origin synchronization is server-only and limited to the domain-safe mappings defined above.

Browser clients never receive refresh tokens, access tokens, OAuth codes, webhook channel secrets, client secrets, or encryption material.

## Security and integrity

Required invariants:

- at most one active company admin calendar;
- at most one active company provider binding;
- Company Operational Calendar has one valid active Modulex owner;
- every normal Modulex event has one valid active operational owner;
- active provider calendar has effective Google `writer` or `owner` access;
- provider event ids are unique within the active binding;
- generic event mapping is unique by binding + source/occurrence identity;
- business source mappings are validated before any Google-origin domain mutation;
- unknown/malformed Google extended properties cannot grant business mutation authority;
- webhook channel id/token/resource id must match active server-side channel state;
- all provider/OAuth/watch persistence remains server-only under RLS/revokes;
- webhook and sync processing are idempotent;
- no Google failure rolls back a successful canonical Modulex mutation;
- no DB trigger performs external network I/O.

Schema/RLS/grant/index changes require Supabase Security and Performance Advisor verification after migration.

## Error and degraded-state behavior

The UI distinguishes:

- Google disconnected;
- reconnect/new scope required;
- no Company Operational Calendar selected;
- provider calendar access downgraded;
- watch channel unhealthy/expired;
- last provider sync stale/error;
- pending Modulex→Google retry;
- conflict automatically resolved with audit available;
- unsupported special provider event type;
- invalid business-event edit rejected by domain rules.

Modulex Calendar always renders valid local business schedules and normal events from its durable local data even when provider sync is degraded.

## Notifications and SMS boundary

Customer SMS/notification automation remains outside this package.

V3 preserves stable event ids, source ids, effective timestamps, owner/responsibility, and change audit data so a later notification package can safely react to schedule creation/change/cancellation without coupling directly to Google.

## Migration strategy

Implementation is additive and staged:

1. add V3 company calendar/provider selection fields and company calendar kind;
2. add `calendar_events`;
3. add `calendar_business_event_extensions`;
4. add `calendar_provider_event_links`, `calendar_sync_outbox`, `calendar_sync_jobs`, `calendar_watch_channels`, and `calendar_sync_audit`;
5. expand OAuth to `calendar.events` and expose reconnect-required state;
6. add provider `PATCH`, watch/stop, conference, recurrence, attendee, reminder, and richer event DTO support;
7. build full/incremental V3 sync engine and safe business mutation adapters;
8. build Company Operational Calendar selection UI;
9. perform initial full sync before enabling Google Meet mutations;
10. add webhook + watch renewal + reconciliation routes;
11. replace Project provider-management UI with compact schedule/upcoming/collapsed calendar UI;
12. enable central Calendar rich CRUD and drag/resize;
13. activate company binding and project current business schedules;
14. disable legacy per-Project sync after successful cutover;
15. run production acceptance and Supabase advisors.

No migration alone performs live Google writes. Provider cutover requires an explicit server action after schema/code deployment and a valid re-consented OAuth connection.

## Testing requirements

TDD/contract coverage includes at least:

### Topology and migration

- only one active company calendar/binding;
- new Projects do not create Google calendars after V3 activation;
- legacy bindings are preserved and not destructively deleted;
- company cutover does not duplicate active Calendar feed events.

### OAuth and access

- `calendar.events` is required;
- old `calendar.events.owned`-only credential shows reconnect required;
- `owner` and `writer` company calendars accepted;
- reader/free-busy/writer-without-private-access rejected for full V3 binding;
- Family calendar is handled by returned metadata, not name matching.

### Normal event CRUD

- Modulex create → Google create;
- Modulex patch → Google patch;
- Modulex delete → Google delete;
- Google create → Modulex event;
- Google update → Modulex update;
- Google delete → Modulex deletion/tombstone;
- Project-linked normal event remains only a contextual Project link;
- Google-origin event receives deterministic Modulex owner fallback.

### Rich Google fields

- all-day exclusive end dates;
- timezone;
- color;
- description/location;
- recurrence series;
- single occurrence edit/delete;
- attendees and response-status preservation;
- reminders;
- Google Meet after full sync;
- visibility/transparency;
- unsupported special event types remain read-only;
- partial patch does not erase unrelated provider fields.

### Business event bidirectional rules

- Google edits Project Start → `start_date`;
- Google edits Target → `target_date`;
- Google edits Delivery → `planned_delivery_date`;
- Google edits Installation time → canonical Installation schedule;
- Google delete Start/Target/Delivery clears only the mapped field;
- Google delete Installation cancels but does not delete the row;
- business title edit never renames Project;
- recurrence on business event is rejected/repaired, not expanded into fake business records;
- malformed/untrusted extended properties cannot mutate business rows.

### Sync engine

- watch webhook header/token/resource validation;
- duplicate notifications idempotent;
- initial Google `sync` notification handling safe;
- durable inbound job exists before provider pull is considered complete;
- incremental sync stores token only after successful apply;
- HTTP 410 triggers full resync;
- watch renewal creates replacement before expiration;
- provider failure preserves local data;
- outbox retries provider failure;
- provider-origin mutation does not echo-loop;
- both-side conflict resolution chooses later timestamp and audits;
- tie within two seconds chooses Modulex.

### UI

- Project calendar grid collapsed by default;
- Show/Hide Calendar works;
- Project upcoming events list is Project-filtered;
- Project Add Event preselects Project;
- old Google Projection/Calendar Name controls are absent;
- central Month/Week/Day/List remain available;
- shared event editor CRUD works;
- drag/resize honors business permissions/type constraints;
- dark mode and Admin strict UI contracts pass.

### Regression gates

- existing Project/Installation tests;
- RBAC tests;
- Google OAuth tests;
- Admin Calendar contract;
- Admin strict UI;
- full route regression;
- API timing;
- typecheck;
- lint;
- production build;
- post-migration Supabase Security and Performance Advisors.

## Production acceptance

V3 is accepted when all of the following are demonstrated against the connected test/company account without destructive customer data changes:

- one chosen shared/Family/primary Google calendar is the active Company Operational Calendar;
- creating a safe test normal event in Google appears in Modulex without a manual resync button;
- editing that event in Modulex appears in Google;
- deleting it on either side is reflected on the other side;
- rich normal event fields round-trip without unrelated provider fields disappearing;
- Project Start/Target/Delivery and Installation events all live in the one company Google calendar;
- changing an approved business schedule in Google changes the corresponding Modulex canonical date/time;
- approved business deletion semantics work exactly as defined;
- new Projects no longer create new Google calendars;
- Project Calendar shows compact schedule/upcoming content with its large calendar collapsed by default;
- `/calendar` remains the full company scheduling workspace;
- temporary Google failure leaves Modulex usable and later retry/reconciliation heals provider state;
- watch renewal/reconciliation health is observable;
- no duplicate events appear after repeated webhook notifications or resyncs.

## Out of scope

V3 does not include:

- Calendar ACL/share management from Modulex;
- joining/managing Google Family groups;
- multiple active company Google calendars;
- multiple OAuth accounts per Modulex instance;
- per-employee Google OAuth;
- automatic creation of Google calendars per Project;
- automatic deletion of legacy Project Google calendars;
- Google special event type creation/editing (`focusTime`, `outOfOffice`, `workingLocation`);
- recurring-series "this and following" split editing;
- arbitrary Google changes to non-scheduling Project/Order/Installation fields;
- customer SMS/notification automation;
- Store/Portal Calendar UX;
- multi-company tenancy.

## Provider references verified for this design

- OAuth scopes: https://developers.google.com/workspace/calendar/api/auth
- Calendar sharing/access roles: https://developers.google.com/workspace/calendar/api/concepts/sharing
- Push notifications/watch channels: https://developers.google.com/workspace/calendar/api/guides/push
- Incremental synchronization/sync tokens: https://developers.google.com/workspace/calendar/api/guides/sync
- Extended properties: https://developers.google.com/workspace/calendar/api/guides/extended-properties
- Recurring events: https://developers.google.com/workspace/calendar/api/guides/recurringevents
- Event creation, reminders, attendees, conference data: https://developers.google.com/workspace/calendar/api/guides/create-events

## Decision summary

Calendar V3 changes Modulex from per-Project, mostly one-way Google projection to one company-level operational calendar with controlled bidirectional synchronization.

Normal events are fully editable from either Google or Modulex and preserve the approved Google Calendar event structure. Project and Installation events remain backed by canonical Modulex business records, while Google edits are allowed to update only their approved schedule fields. Business deletion follows the approved clear/cancel semantics.

Google push notifications provide the fast Google→Modulex path; incremental sync tokens, durable outbound/inbound work, watch renewal, and scheduled reconciliation provide correctness and recovery. Modulex never requires Google to be online for its own transaction to succeed.

The Project Calendar becomes compact and task-focused, with the large calendar collapsed by default. The top-level Admin Calendar remains the full scheduling workspace.