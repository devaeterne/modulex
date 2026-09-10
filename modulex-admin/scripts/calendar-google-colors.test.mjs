import assert from "node:assert/strict";
import {
  normalizeGoogleMirrorEvent,
  normalizeLocalCalendarEvent,
  resolveGoogleCalendarEventColors,
} from "../src/lib/calendar/event-normalization.ts";

const calendar = {
  id: "calendar-1",
  name: "Company Calendar",
  kind: "company",
  owner_profile_id: "owner-1",
  project_id: null,
  timezone: "America/New_York",
  default_background_color: "#9fe1e7",
  default_foreground_color: "#000000",
};

const palette = {
  "1": { background: "#a4bdfc", foreground: "#1d1d1d" },
  "5": { background: "#fbd75b" },
};

assert.deepEqual(
  resolveGoogleCalendarEventColors({ providerColorId: "1", calendar, palette }),
  { backgroundColor: "#a4bdfc", foregroundColor: "#1d1d1d" },
  "Google event color must override the calendar default when colorId resolves in the provider palette.",
);

assert.deepEqual(
  resolveGoogleCalendarEventColors({ providerColorId: "5", calendar, palette }),
  { backgroundColor: "#fbd75b", foregroundColor: "#000000" },
  "A partially populated Google color must inherit the calendar foreground color.",
);

assert.deepEqual(
  resolveGoogleCalendarEventColors({ providerColorId: "999", calendar, palette }),
  { backgroundColor: "#9fe1e7", foregroundColor: "#000000" },
  "Unknown Google color IDs must fail safe to the calendar colors.",
);

assert.deepEqual(
  resolveGoogleCalendarEventColors({ providerColorId: null, calendar, palette }),
  { backgroundColor: "#9fe1e7", foregroundColor: "#000000" },
  "Events without a Google color must retain the calendar colors.",
);

const localEvent = normalizeLocalCalendarEvent({
  id: "event-1",
  admin_calendar_id: calendar.id,
  project_id: null,
  owner_profile_id: "owner-1",
  title: "Google colored event",
  description: null,
  location: null,
  all_day: false,
  start_at: "2026-09-11T14:00:00.000Z",
  end_at: "2026-09-11T15:00:00.000Z",
  all_day_start: null,
  all_day_end: null,
  timezone: "America/New_York",
  provider_color_id: "1",
  recurrence: [],
  attendees: [],
  reminders: null,
  conference_data: null,
  visibility: null,
  transparency: null,
  provider_event_type: "default",
  provider_html_link: "https://calendar.google.com/event?eid=event-1",
}, calendar, "synced", palette);

assert.equal(localEvent?.background_color, "#a4bdfc");
assert.equal(localEvent?.foreground_color, "#1d1d1d");

const mirrorEvent = normalizeGoogleMirrorEvent({
  id: "mirror-1",
  admin_calendar_id: calendar.id,
  project_calendar_binding_id: "binding-1",
  provider_event_id: "provider-event-1",
  title: "Imported colored event",
  start_at: "2026-09-11T16:00:00.000Z",
  end_at: "2026-09-11T17:00:00.000Z",
  all_day: false,
  all_day_start: null,
  all_day_end: null,
  status: "confirmed",
  provider_event_url: "https://calendar.google.com/event?eid=provider-event-1",
  provider_color_id: "5",
  provider_updated_at: "2026-09-11T12:00:00.000Z",
}, calendar, palette);

assert.equal(mirrorEvent?.background_color, "#fbd75b");
assert.equal(mirrorEvent?.foreground_color, "#000000");

console.log("PASS: Google Calendar event color resolution");
