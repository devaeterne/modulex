import assert from "node:assert/strict";
import { resolveGoogleCalendarEventColors } from "../src/lib/calendar/event-normalization.ts";

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

console.log("PASS: Google Calendar event color resolution");
