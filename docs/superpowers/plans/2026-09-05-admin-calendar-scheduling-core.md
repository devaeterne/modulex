# Modulex Admin Calendar & Scheduling Core — Implementation Plan

> **Execution baseline:** approved design in `docs/superpowers/specs/2026-09-05-admin-calendar-scheduling-core-design.md`, based on `main` commit `c3375de200a1ca0ad3cc08aea30fa8abc20d26a9`.
>
> **Execution rule:** before implementation, re-read current `main`, `AGENTS.md`, `modulex-admin/ADMIN_ROADMAP.md`, `modulex-admin/ADMIN_UI_GUIDE.md`, and `modulex-admin/ADMIN_VALIDATION_GUIDE.md`. Rebase/merge current `main` into the implementation branch if it advanced. Do not modify unrelated parallel work.

## Goal

Make Calendar a first-class Modulex Admin scheduling surface that works without Google, while preserving the existing Google Project-calendar projection. Add required Modulex calendar ownership, Project Start/Target/Planned Delivery, canonical Installation events, import/mirror of eligible existing Google calendars with provider colors, and a central Month/Week/Day/List UI.

Notifications and SMS remain explicitly out of this package; this package only creates the stable scheduling/event identities they will consume later.

## Confirmed provider boundary

Keep the approved narrow Google scope model:

- retain `https://www.googleapis.com/auth/calendar.app.created`;
- add `https://www.googleapis.com/auth/calendar.calendarlist.readonly`;
- add `https://www.googleapis.com/auth/calendar.events.owned`;
- retain `openid` and `email`.

Google's current documentation defines `calendar.events.owned` as CRUD access to events on calendars the authenticated user owns, and `calendar.calendarlist.readonly` as read access to subscribed calendars. Therefore V1 may discover shared calendars, but only an owner-eligible calendar is importable with event mirroring/write projection under this narrow scope. Do **not** silently broaden to `calendar.events`; non-owner shared/Family calendars must be shown as not write-eligible. Existing credentials lacking the added scopes require reconnect/re-consent.

## Physical data-model decision

Avoid a second independent provider-binding stack. Add `admin_calendars` as the Modulex ownership/visual registry and extend the existing `project_calendar_bindings` table so it can represent either a Project Google binding or an imported Google-only calendar:

- add `admin_calendar_id`;
- add `binding_mode` = `modulex_created | google_imported`;
- make `project_id` nullable only for `google_imported` rows;
- keep `project_id` required for `modulex_created` rows through a check constraint;
- preserve existing binding IDs and `project_calendar_event_links` mappings;
- keep the legacy physical table name for additive rollout safety; repository/service code treats it as the provider-binding table.

This lets the deployed old Project code continue to query by `project_id` during the additive migration while the new code gains imported calendars.

---

## Task 1 — Re-baseline, production preflight, and RED contracts

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Create: `modulex-admin/scripts/admin-calendar-scheduling-core-contract.mjs`
- Modify: `modulex-admin/scripts/google-calendar-integration-contract.mjs`
- Modify: `modulex-admin/scripts/project-base-contract.mjs`
- Modify: `modulex-admin/scripts/admin-full-route-regression-contract.mjs`
- Modify: `modulex-admin/package.json`

### Steps

1. Re-read current `main`, repo instructions, Admin roadmap/UI/validation guides, and inspect open PRs touching Projects, Installations, Calendar, permissions, sidebar, or Google Calendar. If `main` advanced after the design baseline, start implementation from the new head and carry the approved spec/plan forward.
2. Inspect production Supabase before DDL:
   - count Projects with null/inactive `sales_rep_id`;
   - inspect existing `project_calendar_bindings.created_by` and Project status-history creator fallback for owner backfill;
   - inspect duplicate/invalid Google provider calendar IDs;
   - inspect current Project/Installation FK relationships;
   - inspect exact definitions/signatures of `create_customer_project`, `update_customer_project`, `get_customer_project`, `get_customer_projects_page`, `create_customer_installation_from_order`, and related grants/security settings.
3. Add roadmap entry `[~] Admin Calendar & Scheduling Core` with the approved scope and keep it in-progress until post-deploy acceptance.
4. Add `admin-calendar-scheduling-core-contract.mjs` asserting, before implementation, the future schema mirror/API/UI/RBAC contracts:
   - `admin_calendars` registry and required owner;
   - Project `planned_delivery_date` and `primary_installation_id`;
   - `calendar.view` / `calendar.manage` permissions;
   - `/calendar` sidebar/route;
   - FullCalendar Month/Week/Day/List plugins;
   - normalized event types;
   - imported calendar provider metadata/colors;
   - Google-only mirror read-only behavior;
   - Project Calendar dark-mode token usage.
5. Extend `google-calendar-integration-contract.mjs` with RED assertions for CalendarList scope/discovery, `calendar.events.owned`, reconnect-required scope detection, `dataOwner`/`accessRole`, duplicate import protection, provider colors, mirror sync tokens, and no broad `calendar.events` scope.
6. Extend `project-base-contract.mjs` with RED assertions for `planned_delivery_date`, `primary_installation_id`, and Project Settings inputs.
7. Extend `admin-full-route-regression-contract.mjs` to require `/calendar` and the top-level sidebar item with `calendar.view`.
8. Add `smoke:admin-calendar` package script and wire it into the existing Admin smoke chain/workflow; do not create a new workflow file.
9. Run the focused contracts and record RED caused by missing implementation, not syntax/test harness errors.

**RED commands:**
```bash
cd modulex-admin
npm run smoke:admin-calendar
npm run smoke:google-calendar
npm run smoke:project-base
node scripts/admin-full-route-regression-contract.mjs
```

**Expected:** focused assertions fail specifically on the new Calendar Core requirements.

**Commit:** `test(calendar): lock Admin scheduling core contracts`

---

## Task 2 — Add Calendar registry, Project scheduling fields, provider-binding metadata, and mirror storage

**Files:**
- Create: `modulex-admin/sql/admin-calendar-scheduling-core.sql`
- Modify: `modulex-admin/sql/google-calendar-project-integration.sql` only if the repository convention requires the canonical foundation mirror to reflect the evolved final shape; otherwise keep the new additive SQL as the canonical delta and reference it from SQL README.
- Modify: `modulex-admin/sql/README.md`
- Modify: `modulex-admin/src/lib/auth/permissions.ts`

**Production migration name:** `admin_calendar_scheduling_core`

### Schema

1. Create `public.admin_calendars`:
   - `id uuid primary key default gen_random_uuid()`;
   - `name text not null`;
   - `kind text not null check (kind in ('project','google_imported'))`;
   - `owner_profile_id uuid not null references public.profiles(id)`;
   - `project_id uuid null references public.customer_projects(id) on delete cascade`;
   - `timezone text not null`;
   - `default_background_color text null`;
   - `default_foreground_color text null`;
   - `is_active boolean not null default true`;
   - `created_by`, `updated_by` profile FKs;
   - timestamps;
   - partial unique index allowing at most one `kind='project'` calendar per Project.
2. Add to `customer_projects`:
   - `planned_delivery_date date null`;
   - `primary_installation_id uuid null references customer_installations(id) on delete set null`.
3. Add integrity trigger/function that rejects `primary_installation_id` unless the Installation's Order belongs to the same Project. Keep all other Installations visible; Primary is only a summary pointer.
4. Extend `project_calendar_bindings` additively:
   - `admin_calendar_id uuid null references admin_calendars(id) on delete cascade`;
   - `binding_mode text not null default 'modulex_created' check (...)`;
   - `provider_data_owner text null`;
   - `provider_access_role text null`;
   - `provider_color_id text null`;
   - `provider_background_color text null`;
   - `provider_foreground_color text null`;
   - `provider_sync_token text null`;
   - `provider_sync_updated_at timestamptz null`;
   - make `project_id` nullable after backfill/check setup;
   - enforce `modulex_created => project_id is not null` and `google_imported => project_id is null`;
   - unique `admin_calendar_id` when non-null; retain unique provider calendar ID.
5. Create `public.google_calendar_external_events` for safe mirrored Google-only events:
   - binding/calendar FK;
   - provider event ID;
   - safe title/status/html link;
   - timed or all-day start/end fields;
   - provider `color_id` plus resolved background/foreground colors;
   - provider updated timestamp/etag;
   - mirrored timestamp;
   - unique `(binding_id, provider_event_id)`.
6. Enable RLS on new tables. Revoke browser `anon/authenticated` table access and grant server/service boundary access consistent with existing Google Calendar integration tables. Browser reads/writes go through reviewed APIs/RPCs only.
7. Add `calendar.view` and `calendar.manage` to app permission definitions and route guards. Assign roles conservatively from existing operational semantics:
   - `super_admin`, `admin`: view + manage;
   - `sales`: view + manage so existing Project scheduling behavior is not regressed;
   - other roles receive no Calendar permission unless existing Project/Installation access rules prove they require it during implementation review.
8. Backfill one `admin_calendars(kind='project')` row for every Project that has a resolvable owner. Owner resolution: active Project sales rep first; otherwise authenticated/recorded Project creator evidence already present in canonical audit/history. Do not guess an arbitrary employee.
9. Backfill existing `project_calendar_bindings.admin_calendar_id` to the corresponding Project registry row and preserve binding IDs/event-link IDs exactly.
10. If production preflight finds unresolved owner rows, stop before enforcing/production applying the required-owner migration. Resolve with an explicit reviewed mapping from real production records; do not invent a company default in code.
11. Update authoritative Project RPCs (`create_customer_project`, `update_customer_project`, detail/page projections) using their exact live definitions:
    - accept/return `planned_delivery_date`;
    - create the Project's `admin_calendars` row atomically at Project creation using active Sales Rep, falling back to the authenticated creator;
    - do not automatically change Calendar owner when Sales Rep later changes;
    - allow explicit Calendar owner reassignment only through Calendar manage API.

### DB verification

Run SQL/contract checks for:
- required owner;
- one Project calendar per Project;
- invalid Primary Installation rejected;
- valid Primary Installation accepted;
- multiple Installation rows remain visible/valid;
- existing provider/event-link row counts unchanged after backfill;
- imported provider ID uniqueness;
- browser grants remain revoked.

Then run Supabase **Security Advisor** and **Performance Advisor** and fix only findings introduced by this package.

**GREEN command:**
```bash
cd modulex-admin
npm run smoke:admin-calendar
npm run smoke:project-base
```

**Commit:** `feat(calendar): add scheduling registry and Project dates`

---

## Task 3 — Build normalized Modulex Calendar read model and server API

**Files:**
- Create: `modulex-admin/src/lib/calendar/types.ts`
- Create: `modulex-admin/src/lib/calendar/repository.ts`
- Create: `modulex-admin/src/lib/calendar/event-feed.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/feed/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/calendars/route.ts`
- Create: `modulex-admin/src/app/api/admin/calendar/calendars/[id]/route.ts`
- Modify: `modulex-admin/src/lib/observability/apiTiming.ts` inventory/contract only if route-count assertions require registration; preserve wrapper behavior.

### Steps

1. Define one browser-safe `AdminCalendarDto` and one `AdminCalendarEventDto` with:
   - stable `id`/source identity;
   - calendar/owner IDs and labels;
   - event type (`project_start`, `project_target`, `project_delivery`, `installation`, `google_external`);
   - Project/customer refs;
   - start/end/all-day/timezone;
   - effective background/foreground colors;
   - safe internal navigation target or provider URL;
   - stale/provider state metadata without secrets.
2. Implement server repository queries bounded by requested `start`/`end`; never load an unbounded event history.
3. Normalize canonical Modulex sources directly, without a second writable event ledger:
   - `customer_projects.start_date` => all-day Project Start;
   - `target_date` => all-day Project Target;
   - `planned_delivery_date` => all-day Planned Delivery;
   - every `customer_installations.scheduled_start_at/end_at` under Project Orders => timed Installation;
   - mirrored provider-only records => `google_external`.
4. Use stable synthetic IDs such as `project_start:<project_id>` rather than generating new event rows.
5. Implement color fallback:
   - external event explicit provider color;
   - provider/imported calendar color;
   - Modulex fallback token.
   Do not make color drive business state.
6. Implement filters server-side: `owner`, `project`, `calendar`, `event_type`, `mine`.
7. `/api/admin/calendar/feed` requires `calendar.view`; validates date range and filter allowlists; returns only normalized safe DTOs.
8. `/api/admin/calendar/calendars` requires `calendar.view`; Calendar owner reassignment in `[id]` requires `calendar.manage`, validates active `profiles.id`, and records `updated_by`.
9. Wrap new routes in `withApiTiming` and keep mutable responses.
10. Add focused contract assertions for range bounds, safe DTO shape, no secrets, filter parsing, and Google-only records being read-only.

**Tests:**
```bash
cd modulex-admin
npm run smoke:admin-calendar
node scripts/api-timing-contract.mjs
npm run smoke:rbac
```

**Commit:** `feat(calendar): add normalized Admin event feed`

---

## Task 4 — Expand Google OAuth capability and add Calendar discovery/import

**Files:**
- Modify: `modulex-admin/src/lib/google-calendar/config.ts`
- Modify: `modulex-admin/src/lib/google-calendar/google-oauth.ts`
- Modify: `modulex-admin/src/lib/google-calendar/google-calendar.ts`
- Modify: `modulex-admin/src/lib/google-calendar/repository.ts`
- Modify: `modulex-admin/src/lib/google-calendar/types.ts`
- Create: `modulex-admin/src/lib/google-calendar/calendar-import.ts`
- Create: `modulex-admin/src/app/api/admin/google-calendar/calendars/route.ts`
- Create: `modulex-admin/src/app/api/admin/google-calendar/imports/route.ts`
- Create: `modulex-admin/src/app/api/admin/google-calendar/imports/[id]/sync/route.ts`
- Modify existing Google Calendar status/settings route(s) to expose `reconnect_required` safely.

### Steps

1. Extend the canonical OAuth scope list with only `calendar.calendarlist.readonly` and `calendar.events.owned` in addition to existing scopes.
2. Add a helper comparing stored `granted_scopes` against the required set. Existing connected credentials without them return `reconnect_required`; do not attempt provider import with insufficient scopes.
3. Add Calendar API methods:
   - list CalendarList entries with pagination;
   - map `id`, `summary`, `timeZone`, `accessRole`, `dataOwner`, `colorId`, `backgroundColor`, `foregroundColor`;
   - list events for one owned calendar over initial bounded horizon;
   - list incremental changes using `syncToken`;
   - retrieve provider color palette needed to resolve event `colorId` into display colors.
4. Discovery GET requires `calendar.manage`, active connection, and sufficient scopes. Return safe provider calendar candidates; never expose tokens.
5. Eligibility is based on returned provider capability, not names/email guessing:
   - `accessRole='owner'` => V1 import eligible;
   - writer/reader/freeBusyReader => visible but import/write-ineligible under approved narrow scope.
   - never special-case a calendar named `Family`.
6. Import POST requires:
   - provider calendar ID from a fresh/validated discovery result;
   - active Modulex `owner_profile_id`;
   - owner-eligible provider role;
   - idempotent unique provider ID check.
   Create `admin_calendars(kind='google_imported')` + imported-mode provider binding transactionally at the DB boundary.
7. Preserve provider calendar colors exactly as returned.
8. Initial sync mirrors only safe Google-only event fields; subsequent sync uses stored `syncToken`.
9. Handle invalidated sync token (`410 Gone`) by clearing token and performing one bounded full resync, without deleting valid cached rows until the replacement sync succeeds.
10. Provider failure records normalized error/stale state while retaining last successful mirrored events.
11. Imported external events remain read-only in Modulex; no route may turn them into Project/Order/Installation records.
12. Extend Google contract to prove:
   - narrow scopes only;
   - reconnect gate;
   - owner-only import;
   - `dataOwner` and `accessRole` distinct;
   - Family name has no branch/special behavior;
   - colors preserved;
   - duplicate import idempotent;
   - no credential material in responses.

**Tests:**
```bash
cd modulex-admin
npm run smoke:google-calendar
npm run smoke:admin-calendar
npm run typecheck
```

**Commit:** `feat(calendar): import owned Google calendars`

---

## Task 5 — Project scheduling inputs, Primary Installation, and projection hooks

**Files:**
- Modify: `modulex-admin/src/lib/customers/project-domain.ts`
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx`
- Modify: `modulex-admin/src/lib/google-calendar/project-calendar.ts`
- Modify/add projection mapper(s) under `modulex-admin/src/lib/google-calendar/` for Project milestone sources.
- Create/update Google sync API routes under `modulex-admin/src/app/api/admin/google-calendar/projects/[projectId]/...` as needed, preserving existing route contracts.

### Steps

1. Extend `CustomerProject` and mutation inputs with `planned_delivery_date` and `primary_installation_id`.
2. Add shared Admin `Input` for Planned Delivery Date in Project Settings next to Start/Target; preserve validation and dark-mode tokens.
3. Load eligible canonical Installations for the Project and expose Primary Installation selection using shared `Select`/`SearchableSelect`; allow `None` and every Installation remains visible regardless of selection.
4. Save through authoritative Project mutation boundary; DB integrity remains the final guard that the selected Installation belongs to the Project.
5. After successful Modulex date mutation, trigger best-effort provider resync for the Project Calendar if one exists and integration/sync are enabled. Google failure never reverses the Modulex save.
6. Extend Project Google projection to idempotently map Project Start, Target, and Planned Delivery in addition to Installations using stable source identities. Add/update/delete provider event according to canonical null/date changes while retaining link history conventions.
7. Do not project Order `expected_delivery_date` as Project Planned Delivery.
8. Preserve current Installation lifecycle projection and duplicate protections.
9. Fix the current Project Calendar dark-mode bug by applying shared `ADMIN_TEXT_STYLES.body/strong` to Calendar/Timezone/Last sync/Last error/loading text.
10. Keep existing Create/Open/Rename/Enable/Disable/Resync controls functional.

**Tests:**
```bash
cd modulex-admin
npm run smoke:project-base
npm run smoke:google-calendar
npm run smoke:admin-calendar
npm run smoke:admin-ui-strict
```

**Commit:** `feat(project): project scheduling into Calendar`

---

## Task 6 — Build the first-class Admin Calendar UI

**Files:**
- Create: `modulex-admin/src/app/(admin)/calendar/page.tsx`
- Create: `modulex-admin/src/components/calendar/AdminCalendarWorkspace.tsx`
- Create: `modulex-admin/src/components/calendar/AdminCalendarFilters.tsx`
- Create: `modulex-admin/src/components/calendar/GoogleCalendarImportModal.tsx`
- Create: `modulex-admin/src/components/calendar/CalendarOwnerField.tsx`
- Modify: `modulex-admin/src/layout/AppSidebar.tsx`
- Modify: `modulex-admin/src/app/globals.css` only for FullCalendar theme variables/selectors that cannot be expressed through existing shared component primitives; avoid route-owned appearance CSS.

### Steps

1. Add top-level sidebar `Calendar` route `/calendar` guarded by `calendar.view`.
2. Page uses shared `PageBreadCrumb` and Admin layout primitives.
3. Build FullCalendar using the already-installed 6.1.19 packages:
   - `dayGridPlugin` => Month;
   - `timeGridPlugin` => Week/Day;
   - `listPlugin` => List;
   - `interactionPlugin` only where needed for navigation/selection; do not introduce drag-to-mutate business dates in V1.
4. `datesSet` drives bounded `/api/admin/calendar/feed` fetches; avoid fetching all history.
5. Filters use shared controls: My Calendar, Owner, Project, Calendar, Event Type. Preserve filters when switching Month/Week/Day/List.
6. Event click behavior:
   - Project milestone => Project detail/Calendar tab;
   - Installation => canonical Installation/Order detail target already supported by Admin;
   - Google external => safe `Open in Google Calendar` link when available.
7. Show Calendar owner visibly and provide owner reassignment only to `calendar.manage` users.
8. Add Import Google Calendar action for `calendar.manage`:
   - disconnected => direct user to existing Google Calendar settings;
   - reconnect required => explicit Reconnect state;
   - connected => discovery list with provider colors, data-owner/access-role metadata, eligibility status;
   - selecting eligible calendar requires Modulex owner before Import;
   - imported calendar appears immediately in filter/list and provider mirror sync starts explicitly/best-effort.
9. Preserve Google calendar/event colors; imported event explicit color overrides calendar color. Use readable foreground fallback if provider foreground is absent.
10. Support loading/empty/stale/provider-error states without hiding Modulex events.
11. Make mobile/narrow layout usable: filters wrap/stack and FullCalendar uses appropriate height/list fallback without horizontal form overflow.
12. Run strict Admin changed-file audit; no native form/table primitives.

**Tests:**
```bash
cd modulex-admin
npm run smoke:admin-calendar
npm run smoke:admin-ui-strict
node scripts/admin-full-route-regression-contract.mjs
npm run typecheck
npm run lint
```

**Commit:** `feat(calendar): add first-class Admin Calendar UI`

---

## Task 7 — Make Project Calendar tab a Project-focused calendar surface

**Files:**
- Modify: `modulex-admin/src/components/customers/project-detail/ProjectCalendarTab.tsx`
- Create or reuse: `modulex-admin/src/components/calendar/CalendarView.tsx` if shared extraction reduces duplication without weakening UI rules.
- Modify: `modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx`

### Steps

1. Reuse the normalized event feed with fixed `project=<id>` rather than implementing a second Project event query.
2. Keep the provider management card (Google status, Create/Open/Rename/Sync/Resync) but render a Project-focused Month/List calendar below it.
3. Project feed works even if Google is disconnected or Project has no Google provider binding.
4. Show Start, Target, Planned Delivery, and every Installation automatically.
5. Mark Primary Installation in event details/badge only; do not hide other Installation appointments.
6. Use provider color only where provider-backed; Modulex event fallback remains stable.
7. Ensure dark mode on every label/value/loading/empty state through shared Admin theme tokens.
8. Do not add event drag/drop mutation in V1.

**Tests:**
```bash
cd modulex-admin
npm run smoke:admin-calendar
npm run smoke:google-calendar
npm run smoke:project-base
npm run smoke:admin-ui-strict
```

**Commit:** `feat(calendar): embed Project scheduling view`

---

## Task 8 — Verification, production migration gate, deploy acceptance, and roadmap closeout

**Files:**
- Modify: `modulex-admin/ADMIN_ROADMAP.md`
- Create: `docs/acceptance/admin-calendar-scheduling-core.md`
- Modify existing CI workflow only if required to register `smoke:admin-calendar`; do not create a new workflow.

### Local/CI verification

Run fresh on final head:

```bash
cd modulex-admin
npm ci
npm run smoke:admin-calendar
npm run smoke:google-calendar
npm run smoke:project-base
npm run smoke:admin-ui-strict
npm run smoke:rbac
node scripts/admin-full-route-regression-contract.mjs
node scripts/api-timing-contract.mjs
npm run typecheck
npm run lint
npm run build
```

Expected: all green on final head. Run changed-file Admin UI strict gate against the exact PR diff.

### Database gate

Before applying production migration:

1. Re-run owner/backfill preflight against production.
2. Confirm current production schema/function signatures still match planned replacements.
3. Apply `admin_calendar_scheduling_core` migration through the Supabase migration boundary.
4. Verify row counts/backfills/constraints/RLS/grants.
5. Run Supabase Security + Performance Advisors and distinguish package-introduced findings from pre-existing unrelated findings.

### Google Cloud manual configuration gate

Because OAuth scopes expand, update the existing Google Cloud OAuth consent Data Access list with the two approved Calendar scopes before production reconnect. Do not change OAuth client/redirect values or expose secrets.

Then reconnect the Oakwell/Granite Center Google account from Admin so the stored credential actually contains the expanded scopes.

### Production acceptance

Verify signed-in at `https://admin.oakwellcabinetry.com`:

1. Sidebar shows top-level Calendar and General Settings → Google Calendar still exists.
2. `/calendar` Month/Week/Day/List loads even with provider requests unavailable.
3. Every registry calendar shows one Modulex owner; My Calendar filters correctly.
4. A real Project Start/Target/Planned Delivery appears on the correct dates.
5. Multiple Installation appointments all appear; Primary is highlighted only.
6. Project Calendar tab has readable dark-mode text and same Project events.
7. Existing Project Google Calendar Create/Open/Rename/Resync remains idempotent.
8. Existing owned Google calendar discovery shows original calendar colors and `dataOwner`/`accessRole` separately.
9. Family calendar, if visible to the connected account, is discovered based on API metadata rather than name logic; only owner-eligible calendars are importable under V1 scopes.
10. Import one eligible existing calendar; initial Google-only events mirror with colors and appear in Admin.
11. Repeat import/sync/resync and prove no duplicate calendar/event rows.
12. Temporarily/provider-failure-path verification proves cached external events remain and Modulex events still render.
13. Browser/network responses never expose refresh/access tokens, authorization codes, client secret, encryption key, or service-role key.

### Closeout

- Record evidence in `docs/acceptance/admin-calendar-scheduling-core.md`.
- Keep roadmap `[~]` until migration + deploy + signed-in live acceptance are complete.
- Only then mark `[x]` and update roadmap Last reviewed/Main baseline/Next Action.
- Notifications and SMS become separate follow-up packages; do not implement them opportunistically here.

**Final commit:** `docs(calendar): record scheduling core acceptance`

---

## Suggested PR structure

Use one implementation branch from the execution-time current `main`, e.g. `feat/admin-calendar-scheduling-core` (or a safe unique variant). Open a **draft PR after the RED contract commit**, then push each GREEN task as a reviewable commit. Do not merge or production-deploy automatically; wait for explicit owner instruction.

The package is intentionally one architectural PR because schema, server read model, Google import, and UI share the same ownership/provider invariants. If implementation reveals an unsafe migration dependency or a same-Order multi-Installation lifecycle conflict, stop that subpart, preserve current behavior, and document the blocker instead of inventing a new fulfillment rule.