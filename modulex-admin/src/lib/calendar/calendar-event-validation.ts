export type CalendarEventAttendeeInput = {
  email: string;
  displayName?: string;
  optional?: boolean;
};

export type CalendarEventReminderInput = {
  useDefault: boolean;
  overrides: Array<{ method: "email" | "popup"; minutes: number }>;
};

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
  attendees: CalendarEventAttendeeInput[];
  guestOptions: {
    canInviteOthers: boolean | null;
    canModify: boolean | null;
    canSeeOtherGuests: boolean | null;
  };
  reminders: CalendarEventReminderInput | null;
  conference: { createGoogleMeet: boolean; removeConference: boolean };
  visibility: "default" | "public" | "private" | "confidential" | null;
  transparency: "opaque" | "transparent" | null;
};

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeAttendees(attendees: CalendarEventAttendeeInput[]) {
  const seen = new Set<string>();
  return attendees.flatMap((attendee) => {
    const email = attendee.email.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) return [];
    seen.add(email);
    return [{ email, displayName: attendee.displayName?.trim() || undefined, optional: attendee.optional === true }];
  });
}

export function validateCalendarEventMutation(input: CalendarEventMutation): CalendarEventMutation {
  const title = input.title.trim();
  if (!title) throw new Error("Event title is required.");
  const timezone = input.timezone.trim();
  if (!timezone || !validTimezone(timezone)) throw new Error("Event timezone must be a valid IANA timezone.");
  if (!input.ownerProfileId) throw new Error("Event owner is required.");

  if (input.allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start)) throw new Error("All-day event start must be a date.");
    if (!input.end || !/^\d{4}-\d{2}-\d{2}$/.test(input.end) || input.end <= input.start) {
      throw new Error("All-day event end must be an exclusive date after start.");
    }
  } else {
    const start = new Date(input.start);
    const end = input.end ? new Date(input.end) : null;
    if (Number.isNaN(start.valueOf())) throw new Error("Timed event start is invalid.");
    if (end && (Number.isNaN(end.valueOf()) || end <= start)) throw new Error("Timed event end must be after start.");
  }

  const recurrence = input.recurrence.map((rule) => rule.trim()).filter(Boolean);
  for (const rule of recurrence) {
    if (!/^(RRULE|RDATE|EXDATE):/i.test(rule)) throw new Error("Recurrence entries must use RRULE, RDATE, or EXDATE.");
  }

  if (input.reminders) {
    for (const reminder of input.reminders.overrides) {
      if (!Number.isInteger(reminder.minutes) || reminder.minutes < 0) throw new Error("Reminder minutes must be a non-negative integer.");
      if (reminder.method !== "email" && reminder.method !== "popup") throw new Error("Reminder method is invalid.");
    }
  }

  return {
    ...input,
    title,
    timezone,
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    colorId: input.colorId?.trim() || null,
    recurrence,
    attendees: normalizeAttendees(input.attendees),
  };
}
