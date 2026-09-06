"use client";

import { useEffect, useState } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Checkbox from "@/components/form/input/Checkbox";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type CalendarEditorEvent = {
  source_type: string;
  source_id: string;
  project_id: string | null;
  owner_profile_id: string;
  title: string;
  start: string;
  end: string | null;
  all_day: boolean;
  timezone: string;
  provider_color_id: string | null;
  provider_event_url: string | null;
  provider_event_type: string | null;
  editable: boolean;
  deletable: boolean;
  description?: string | null;
  location?: string | null;
  recurrence?: unknown[];
  attendees?: unknown[];
  reminders?: Record<string, unknown> | null;
  conference_data?: Record<string, unknown> | null;
  visibility?: string | null;
  transparency?: string | null;
};

type Option = { value: string; label: string };
type Draft = {
  title: string;
  projectId: string;
  ownerId: string;
  allDay: boolean;
  start: string;
  end: string;
  timezone: string;
  description: string;
  location: string;
  colorId: string;
  recurrence: string;
  attendees: string;
  reminderMinutes: string;
  createMeet: boolean;
  visibility: string;
  transparency: string;
};

const visibilityOptions = [
  { value: "default", label: "Default" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
  { value: "confidential", label: "Confidential" },
];
const transparencyOptions = [
  { value: "opaque", label: "Busy" },
  { value: "transparent", label: "Free" },
];

function pad(value: number) { return String(value).padStart(2, "0"); }
function timedInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function emptyDraft(ownerId: string, projectId: string | null, range?: { start: string; end: string | null; allDay: boolean } | null): Draft {
  const seed = range ?? { start: new Date().toISOString(), end: null, allDay: false };
  const start = seed.allDay ? seed.start.slice(0, 10) : timedInput(seed.start);
  const end = seed.allDay
    ? seed.end?.slice(0, 10) || nextDate(start)
    : timedInput(seed.end || new Date(new Date(seed.start).getTime() + 60 * 60_000).toISOString());
  return { title: "", projectId: projectId ?? "", ownerId, allDay: seed.allDay, start, end, timezone: "UTC", description: "", location: "", colorId: "", recurrence: "", attendees: "", reminderMinutes: "", createMeet: false, visibility: "default", transparency: "opaque" };
}
function fromEvent(event: CalendarEditorEvent): Draft {
  const attendeeText = (event.attendees ?? []).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const email = (value as Record<string, unknown>).email;
    return typeof email === "string" ? [email] : [];
  }).join(", ");
  const overrides = event.reminders && Array.isArray(event.reminders.overrides) ? event.reminders.overrides as Array<Record<string, unknown>> : [];
  const first = overrides.find((item) => typeof item.minutes === "number");
  return {
    title: event.title,
    projectId: event.project_id ?? "",
    ownerId: event.owner_profile_id,
    allDay: event.all_day,
    start: event.all_day ? event.start.slice(0, 10) : timedInput(event.start),
    end: event.all_day ? event.end?.slice(0, 10) || nextDate(event.start.slice(0, 10)) : timedInput(event.end),
    timezone: event.timezone || "UTC",
    description: event.description ?? "",
    location: event.location ?? "",
    colorId: event.provider_color_id ?? "",
    recurrence: (event.recurrence ?? []).filter((value): value is string => typeof value === "string").join("\n"),
    attendees: attendeeText,
    reminderMinutes: first ? String(first.minutes) : "",
    createMeet: Boolean(event.conference_data),
    visibility: event.visibility ?? "default",
    transparency: event.transparency ?? "opaque",
  };
}
function isBusiness(event: CalendarEditorEvent | null) {
  return Boolean(event && ["project_start", "project_target", "project_delivery", "installation"].includes(event.source_type));
}
function deleteCopy(event: CalendarEditorEvent) {
  if (event.source_type === "project_start") return "Deleting clears the Project Start Date.";
  if (event.source_type === "project_target") return "Deleting clears the Target Completion Date.";
  if (event.source_type === "project_delivery") return "Deleting clears the Planned Delivery Date.";
  return "Deleting cancels the Installation while keeping its Modulex record.";
}

export default function CalendarEventEditorModal({ isOpen, onClose, event, initialRange, ownerOptions, projectOptions, defaultOwnerId, fixedProjectId = null, onSaved }: {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEditorEvent | null;
  initialRange: { start: string; end: string | null; allDay: boolean } | null;
  ownerOptions: Option[];
  projectOptions: Option[];
  defaultOwnerId: string;
  fixedProjectId?: string | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultOwnerId, fixedProjectId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const business = isBusiness(event);
  const readOnly = Boolean(event && (!event.editable || event.source_type === "google_special"));

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setDraft(event ? fromEvent(event) : emptyDraft(defaultOwnerId, fixedProjectId, initialRange));
  }, [defaultOwnerId, event, fixedProjectId, initialRange, isOpen]);

  function payload() {
    const reminderMinutes = Number(draft.reminderMinutes);
    return {
      title: draft.title,
      project_id: (fixedProjectId ?? draft.projectId) || null,
      owner_profile_id: draft.ownerId,
      description: draft.description || null,
      location: draft.location || null,
      all_day: draft.allDay,
      start: draft.allDay ? draft.start : new Date(draft.start).toISOString(),
      end: draft.allDay ? draft.end : draft.end ? new Date(draft.end).toISOString() : null,
      timezone: draft.timezone,
      color_id: draft.colorId || null,
      recurrence: draft.recurrence.split("\n").map((line) => line.trim()).filter(Boolean),
      attendees: draft.attendees.split(",").map((email) => email.trim()).filter(Boolean).map((email) => ({ email })),
      guest_options: { canInviteOthers: true, canModify: false, canSeeOtherGuests: true },
      reminders: draft.reminderMinutes.trim() && Number.isFinite(reminderMinutes)
        ? { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes }] }
        : { useDefault: true, overrides: [] },
      conference: { createGoogleMeet: draft.createMeet, removeConference: false },
      visibility: draft.visibility,
      transparency: draft.transparency,
    };
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      if (business && event) {
        await authenticatedFetch("/api/admin/calendar/business-events", { method: "PATCH", body: JSON.stringify({ source_type: event.source_type, source_id: event.source_id, start: draft.allDay ? draft.start : new Date(draft.start).toISOString(), end: draft.allDay ? null : draft.end ? new Date(draft.end).toISOString() : null, deleted: false }) });
      } else if (event) {
        await authenticatedFetch(`/api/admin/calendar/events/${event.source_id}`, { method: "PATCH", body: JSON.stringify(payload()) });
      } else {
        await authenticatedFetch("/api/admin/calendar/events", { method: "POST", body: JSON.stringify(payload()) });
      }
      onSaved(); onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Calendar event could not be saved.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!event) return;
    setBusy(true); setError(null);
    try {
      if (business) await authenticatedFetch("/api/admin/calendar/business-events", { method: "PATCH", body: JSON.stringify({ source_type: event.source_type, source_id: event.source_id, deleted: true }) });
      else await authenticatedFetch(`/api/admin/calendar/events/${event.source_id}`, { method: "DELETE" });
      onSaved(); onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Calendar event could not be deleted.");
    } finally { setBusy(false); }
  }

  const heading = event ? (readOnly ? "Google Calendar Event" : "Edit Calendar Event") : "Add Calendar Event";
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="relative m-4 w-full max-w-3xl p-6 sm:p-8" ariaLabel={heading}>
      <div className="space-y-5">
        <div className="pr-10"><h2 className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{heading}</h2><p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.body}`}>Google Calendar-compatible fields synchronize through the shared Company Calendar.</p></div>
        {error ? <Alert variant="error" title="Calendar event action failed" message={error} /> : null}
        {event ? <div className="flex flex-wrap gap-2"><Badge color={event.provider_event_type === "default" ? "info" : "light"}>{event.provider_event_type || "default"}</Badge>{event.provider_event_url ? <Badge color="success">Google linked</Badge> : null}</div> : null}
        {business && event ? <Alert variant="warning" title="Business event" message={deleteCopy(event)} /> : null}
        {readOnly ? <Alert variant="info" title="Read-only Google event" message="This special Google event type is visible in Modulex but must be edited in Google Calendar." /> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Label htmlFor="calendar-editor-title">Title</Label><Input id="calendar-editor-title" value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} disabled={busy || business || readOnly} /></div>
          {!fixedProjectId ? <div><Label htmlFor="calendar-editor-project">Project</Label><Select id="calendar-editor-project" options={projectOptions} value={draft.projectId} onChange={(projectId) => setDraft((v) => ({ ...v, projectId }))} placeholder="No Project" allowEmpty disabled={busy || business || readOnly} /></div> : null}
          <div><Label htmlFor="calendar-editor-owner">Owner / responsible</Label><Select id="calendar-editor-owner" options={ownerOptions} value={draft.ownerId} onChange={(ownerId) => setDraft((v) => ({ ...v, ownerId }))} placeholder="Choose owner" disabled={busy || business || readOnly} /></div>
          <div className="flex items-end"><Checkbox label="All day" checked={draft.allDay} onChange={(allDay) => setDraft((v) => ({ ...v, allDay }))} disabled={busy || business || readOnly} /></div>
          <div><Label htmlFor="calendar-editor-start">Start</Label><Input id="calendar-editor-start" type={draft.allDay ? "date" : "datetime-local"} value={draft.start} onChange={(e) => setDraft((v) => ({ ...v, start: e.target.value }))} disabled={busy || readOnly} /></div>
          <div><Label htmlFor="calendar-editor-end">End</Label><Input id="calendar-editor-end" type={draft.allDay ? "date" : "datetime-local"} value={draft.end} onChange={(e) => setDraft((v) => ({ ...v, end: e.target.value }))} disabled={busy || readOnly || (business && event?.source_type !== "installation")} /></div>
          <div><Label htmlFor="calendar-editor-timezone">Timezone</Label><Input id="calendar-editor-timezone" value={draft.timezone} onChange={(e) => setDraft((v) => ({ ...v, timezone: e.target.value }))} disabled={busy || business || readOnly} /></div>
          <div><Label htmlFor="calendar-editor-color">Google color ID</Label><Input id="calendar-editor-color" value={draft.colorId} onChange={(e) => setDraft((v) => ({ ...v, colorId: e.target.value }))} disabled={busy || business || readOnly} /></div>
          <div className="md:col-span-2"><Label htmlFor="calendar-editor-description">Description</Label><TextArea id="calendar-editor-description" value={draft.description} onChange={(description) => setDraft((v) => ({ ...v, description }))} disabled={busy || business || readOnly} /></div>
          <div className="md:col-span-2"><Label htmlFor="calendar-editor-location">Location</Label><Input id="calendar-editor-location" value={draft.location} onChange={(e) => setDraft((v) => ({ ...v, location: e.target.value }))} disabled={busy || business || readOnly} /></div>
          {!business ? <><div className="md:col-span-2"><Label htmlFor="calendar-editor-recurrence">Recurrence</Label><TextArea id="calendar-editor-recurrence" rows={2} value={draft.recurrence} onChange={(recurrence) => setDraft((v) => ({ ...v, recurrence }))} placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO" disabled={busy || readOnly} /></div><div className="md:col-span-2"><Label htmlFor="calendar-editor-guests">Guests / Attendees</Label><Input id="calendar-editor-guests" value={draft.attendees} onChange={(e) => setDraft((v) => ({ ...v, attendees: e.target.value }))} placeholder="name@example.com, team@example.com" disabled={busy || readOnly} /></div><div><Label htmlFor="calendar-editor-reminders">Reminders</Label><Input id="calendar-editor-reminders" type="number" min={0} value={draft.reminderMinutes} onChange={(e) => setDraft((v) => ({ ...v, reminderMinutes: e.target.value }))} hint="Minutes before event" disabled={busy || readOnly} /></div><div className="flex items-end"><Checkbox label="Google Meet" checked={draft.createMeet} onChange={(createMeet) => setDraft((v) => ({ ...v, createMeet }))} disabled={busy || readOnly} /></div><div><Label htmlFor="calendar-editor-visibility">Visibility</Label><Select id="calendar-editor-visibility" options={visibilityOptions} value={draft.visibility} onChange={(visibility) => setDraft((v) => ({ ...v, visibility }))} disabled={busy || readOnly} /></div><div><Label htmlFor="calendar-editor-availability">Availability</Label><Select id="calendar-editor-availability" options={transparencyOptions} value={draft.transparency} onChange={(transparency) => setDraft((v) => ({ ...v, transparency }))} disabled={busy || readOnly} /></div></> : null}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <div>{event?.deletable && !readOnly ? <Button variant="outline" disabled={busy} onClick={() => void remove()}>{business && event.source_type === "installation" ? "Cancel Installation" : "Delete Event"}</Button> : null}</div>
          <div className="flex flex-wrap gap-3">{event?.provider_event_url ? <Button variant="outline" onClick={() => window.open(event.provider_event_url!, "_blank", "noopener,noreferrer")}>Open in Google Calendar</Button> : null}<Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>{!readOnly ? <Button disabled={busy || (!business && (!draft.title.trim() || !draft.ownerId))} onClick={() => void save()}>{busy ? "Saving…" : "Save Event"}</Button> : null}</div>
        </div>
      </div>
    </Modal>
  );
}
