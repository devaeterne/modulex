# Modulex Admin Calendar & Scheduling Core Design

## Goal

Promote Calendar from a Project-specific Google sync utility into a first-class Modulex Admin scheduling surface.

The Admin Calendar must:

- work even when Google is disconnected;
- provide Month / Week / Day / List views in Admin;
- require one Modulex owner for every calendar;
- automatically surface Project Start, Project Target, Planned Delivery, and all canonical Installation appointments;
- allow importing/linking existing Google calendars from the connected customer account;
- preserve imported Google calendar colors and event-specific colors/labels when available;
- keep Modulex business dates canonical while treating imported Google-only events as external provider data;
- support Google Family Calendar scenarios without requiring the developer/operator to join the customer's Google family group.

## Existing canonical sources

Current Modulex Project data already has:

- `customer_projects.start_date`
- `customer_projects.target_date`

Order data has:

- `customer_orders.expected_delivery_date`

Installation data has:

- `customer_installations.scheduled_start_at`
- `customer_installations.scheduled_end_at`

`target_date` remains a Project target/completion milestone and must not be silently redefined as delivery.

Add a separate Project-level `planned_delivery_date` so Project delivery remains explicit and stable for Calendar/notification use.

A Project may have multiple Installation appointments. Exactly zero or one related Installation may be designated as the Project's Primary Installation for summary/display purposes.

Primary Installation remains a real `customer_installations` row. Do not duplicate its schedule into a Project date column.

## First-class Admin Calendar

Add a top-level Admin sidebar item: `Calendar`.

The Calendar page uses Modulex data as its primary read model and does not iframe Google Calendar.

Initial views:

- Month
- Week
- Day
- List

Initial filters:

- My Calendar
- Owner
- Project
- Calendar
- Event Type

The Calendar continues to render valid Modulex events if Google is unavailable.

## Calendar ownership

Every Modulex calendar must have exactly one required Modulex owner (`profiles.id`).

The Modulex owner is operational ownership inside Admin and is independent of Google's technical calendar/data owner.

`My Calendar` means calendars where `owner_profile_id = auth.uid()`/current profile id.

Suggested registry table: `admin_calendars`.

Core fields:

- `id`
- `name`
- `kind` (`project`, `google_imported`)
- `owner_profile_id`
- `project_id` when applicable
- `timezone`
- `default_background_color`
- `default_foreground_color`
- active/audit timestamps and actors

Owner is required for both Modulex-created and imported calendars.

Default owner for a Project calendar:

1. active Project sales representative;
2. current authorized creator;
3. otherwise require explicit owner selection.

Existing Project Google bindings are backfilled deterministically and must fail closed if no valid owner can be resolved.

## Normalized Calendar events

Do not create a second canonical business ledger for schedules that already exist.

Initial event types:

- `project_start`
- `project_target`
- `project_delivery`
- `installation`

Normalized event output contains:

- stable source identity
- Modulex calendar id
- owner id
- Project/customer references when applicable
- title
- start/end
- all-day flag
- timezone
- effective colors
- safe navigation target
- provider metadata only when provider-backed

### Project Start

`customer_projects.start_date` becomes an all-day Calendar event automatically.

### Project Target

`customer_projects.target_date` becomes a distinct all-day Project Target event.

### Planned Delivery

New `customer_projects.planned_delivery_date` becomes a distinct all-day Project Delivery event.

Order `expected_delivery_date` remains Order-specific and is not silently promoted to Project delivery.

### Installations

Every canonical Installation related to the Project appears automatically as a timed Calendar event.

Add optional `customer_projects.primary_installation_id` with integrity enforcement that the selected Installation belongs to an Order in the same Project.

Changing which Installation is Primary does not hide or delete the others.

If there is no eligible canonical Order/Installation path, Modulex must not create a fake Installation row just to satisfy Calendar UI.

## Project UX

Project detail should expose clear scheduling concepts:

- Start Date
- Target Completion Date
- Planned Delivery Date
- Primary Installation

Saving Project dates updates Modulex first. Google projection is best-effort afterward and may not roll back a successful Modulex mutation.

The Project `Calendar` tab becomes a Project-focused view of the same Admin Calendar model, not only a provider-sync control screen.

The existing dark-mode text issue in Project Calendar must be fixed using shared Admin theme tokens.

## Google Calendar import/link model

Import means link/mirror, not destructive migration.

When an existing Google calendar is imported:

- create a Modulex calendar registry row;
- require Modulex owner selection;
- persist provider identity, access role, data owner, timezone, and safe color metadata;
- mirror existing provider-only events for display;
- keep Google as source of truth for those pre-existing Google-only events;
- never turn imported Google-only events into Project/Order/Installation records automatically.

Modulex-managed Project/Installation events remain Modulex-canonical even if projected into an imported provider calendar.

## Google scopes

Extend the existing OAuth request with:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events.owned`

Retain:

- `https://www.googleapis.com/auth/calendar.app.created`
- `openid`
- `email`

Do not request broad Calendar/ACL/freebusy scopes in this package.

Existing credentials missing the new scopes show `Reconnect required` before import is enabled.

## Google access-role vs data-owner distinction

Google Calendar API exposes both:

- `dataOwner`: the single underlying data owner for a calendar;
- `accessRole`: the effective permission of the connected user (`reader`, `writer`, `owner`, etc.).

These are not the same concept. Google allows multiple users to have `owner` accessRole even though a calendar has one data owner.

Modulex must persist both as provider metadata when available and must never confuse either with the required Modulex owner.

Import eligibility is based on the effective Google access capability needed by the action, not on matching `dataOwner` email strings.

For write-enabled binding under the narrow `calendar.events.owned` scope, require effective Google `accessRole = owner`.

Calendars that are visible but only `reader`/`writer` under the connected account may be shown as unavailable for write-binding in this V1. We do not broaden to `calendar.events` merely to support shared writer calendars without a separate approval.

## Google Family Calendar

This customer uses a Google Family Group, so Family Calendar behavior is explicitly supported.

Google automatically creates a calendar named `Family` for a family group. The family manager is the default data owner, while family members can receive strong calendar-management permissions.

Google Family membership itself is not a Modulex dependency.

Important consequences:

- the developer/operator does not need to join the customer's family group;
- the customer's own Google account should be the OAuth-connected account whenever possible;
- if the connected customer account sees the Family calendar in CalendarList, Modulex discovers it like any other calendar;
- Modulex records the returned `dataOwner` and `accessRole` rather than guessing from the calendar name `Family`;
- if the Family calendar returns effective `owner` accessRole, it is eligible for normal write-enabled import/binding;
- if it returns only writer/read access, Modulex may display it as non-write-eligible under the narrow V1 scope rather than requesting broader permissions automatically.

Google also permits a Family calendar to be shared directly with non-family users from Calendar settings. Therefore cross-country Google Family membership restrictions do not need to be worked around by changing account country; direct calendar sharing is a separate fallback if the business wants another Google account to see the calendar.

## Google color preservation

Imported provider appearance takes precedence over Modulex defaults.

Persist CalendarList visual metadata when available:

- `backgroundColor`
- `foregroundColor`
- `colorId`

For imported provider events, preserve event-specific provider color/label metadata needed to reproduce the user's view when Google exposes it.

Display fallback order:

1. provider event-specific color/label;
2. imported Google calendar background/foreground colors;
3. Modulex fallback color.

For Modulex-created events written to an imported Google calendar, do not force an unrelated Modulex event-type color by default.

Color is presentation metadata only and never drives Project/Order/Installation state.

## Imported Google event mirror

Do not make every Admin Calendar render depend on a live provider request.

Add a provider event mirror/cache for Google-only events with safe fields only:

- Modulex calendar/binding id
- provider event id
- title
- start/end
- all-day
- status
- provider updated/etag
- provider event URL when safe
- provider color/label metadata
- last mirrored timestamp

Use Google incremental sync tokens where supported.

If provider sync fails, retain the last successful mirrored data and mark it stale/error. Do not erase it.

Imported provider-only events are read-only in Modulex V1 and may link to `Open in Google Calendar`.

## Provider binding model

Keep provider projection metadata separate from Modulex calendar ownership.

Provider binding stores at least:

- Modulex admin calendar id
- provider
- provider calendar id/name
- provider data owner
- provider access role
- provider background/foreground colors
- timezone
- binding mode (`modulex_created`, `google_imported`)
- sync enabled
- last sync/error metadata

A provider calendar can be imported only once per connected single-company instance.

Existing `project_calendar_event_links` idempotency mappings remain intact through migration.

## Source-of-truth rules

### Modulex business events

Modulex is canonical for:

- Project Start
- Project Target
- Planned Delivery
- Installations

Google edits/deletes of Modulex-managed provider events never mutate the underlying Modulex business record. Resync restores provider state from Modulex.

### Imported Google-only events

Google is canonical for pre-existing provider-only events.

Provider changes update only the external mirror/cache. They do not create or mutate Modulex business entities.

## RBAC

Add explicit permissions:

- `calendar.view`
- `calendar.manage`

Calendar import, provider binding, owner reassignment, and global Calendar management require `calendar.manage`.

Project date mutations still require `projects.manage`.

Installation mutations still use existing Installation permissions.

Google OAuth/configuration remains protected by Settings management permission.

## Notifications and SMS boundary

Calendar Core does not send customer notifications or SMS yet.

It must expose stable event identities/timestamps so a later notification package can add rules such as:

- Project starts today
- Planned delivery tomorrow/today
- Installation tomorrow/today
- Installation starts in one hour
- schedule changed

The existing notification delivery system will be extended later rather than replaced.

SMS is a separate provider-neutral delivery channel. The later SMS package must include US consent/opt-out suppression, delivery status, templates/audit, timezone/quiet-hour handling, and applicable A2P registration/compliance before automated sends are enabled.

Examples later include product shipped, delivery reminder, and installer approximately one hour away.

## Migration safety

Implementation sequence must be additive:

1. add Modulex calendar registry;
2. add owner/provider binding metadata and deterministic backfill;
3. add Project `planned_delivery_date` and `primary_installation_id` integrity;
4. backfill existing Project calendar bindings into the registry;
5. retain current event-link mappings;
6. refactor Project Calendar services behind the registry;
7. expand OAuth scopes and require reconnect when needed;
8. add Google CalendarList discovery/import;
9. add provider event mirror/incremental sync;
10. add central Admin Calendar and Project calendar feed UI.

No live Google writes occur merely because a migration is deployed.

## Error handling

UI must distinguish:

- Modulex schedule load failure
- Google disconnected
- reconnect/scopes required
- provider calendar no longer available
- provider access downgraded
- imported Family/shared calendar not write-eligible
- provider mirror stale
- owner inactive/reassignment required
- invalid Primary Installation relation

Provider failure never removes valid Modulex events from the Admin Calendar.

## Security/integrity

Required invariants:

- every Modulex calendar has a valid Modulex owner;
- one primary Modulex Project calendar at most;
- imported provider calendar id unique;
- provider binding references a real Modulex calendar;
- Primary Installation belongs to the same Project;
- external provider event mirror is unique by binding/event id;
- Modulex provider projection mapping remains unique by binding/source identity;
- browser-safe APIs never expose OAuth refresh/access tokens, auth codes, client secrets, or encryption material.

Schema/RLS/grant/index changes require Supabase Security and Performance Advisor verification.

## Testing requirements

TDD coverage includes:

- Project Start/Target/Delivery event mapping;
- multiple Installations and Primary Installation integrity;
- required Modulex owner and owner backfill;
- central Calendar route/views/filters;
- dark mode on central and Project Calendar;
- new OAuth scope requirement and reconnect state;
- CalendarList import discovery;
- `dataOwner` and `accessRole` kept distinct;
- Family calendar handled by returned provider metadata, not by name assumptions;
- `owner`-role write eligibility;
- non-owner shared calendar rejected for write binding under narrow scopes;
- imported colors and event-specific color fallback;
- duplicate import idempotency;
- provider mirror incremental sync/stale behavior;
- Google-only event cannot mutate Modulex business data;
- Google failure cannot roll back Modulex mutation;
- existing Project/Installation/Google projection regressions;
- RBAC, Admin UI strict, typecheck, lint, and production build.

## Production acceptance

After merge/migration/deploy/reconnect:

- Admin has a first-class Calendar page;
- Calendar still works if Google is temporarily unavailable;
- every calendar displays a Modulex owner;
- My Calendar works;
- Start, Target, Planned Delivery, and all Installations appear automatically;
- one Installation can be Primary while multiple remain visible;
- an eligible existing Google calendar can be imported;
- customer's Family calendar can be discovered when exposed by the connected customer account;
- Google `dataOwner` and `accessRole` are shown/handled correctly;
- imported Google colors are preserved;
- imported Google-only events are visible but cannot mutate Modulex business records;
- repeated import/sync/resync does not create duplicates;
- current Modulex-created Project Google calendar flow remains functional.

## Out of scope

- Google changes mutating Project/Order/Installation records;
- arbitrary editing of imported Google-only events from Modulex;
- broad shared-calendar writes requiring `calendar.events`;
- Calendar ACL management;
- free/busy scheduling;
- attendee/customer invitation automation;
- per-employee OAuth connections;
- automatic SMS sending;
- bulk SMS campaigns;
- Store/Portal calendar UX;
- multi-company tenancy.

## Decision summary

Modulex gets a first-class Admin Calendar independent of Google. Every calendar has a required Modulex owner. Project Start, Project Target, new Planned Delivery, and every canonical Installation appear automatically. One Installation may be Primary without preventing multiple appointments.

Existing Google calendars can be imported as linked/mirrored calendars, preserving provider colors. Google `dataOwner`, effective `accessRole`, and Modulex owner are three separate concepts.

The customer's Google Family Calendar is explicitly supported through normal CalendarList/provider metadata. Modulex does not depend on joining the customer's family group, so Google's same-country family-membership restriction does not block the integration.

Notifications and US SMS follow as separate packages that consume this stable scheduling model.