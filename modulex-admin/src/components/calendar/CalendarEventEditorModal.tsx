"use client";

import { useEffect, useMemo, useState } from "react";
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

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function timedInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function blankDraft(input: { start: string; end: string | null; allDay: boolean; projectId: string | null; ownerId: string; timezone: string }): Draft {
  const start = input.allDay ? input.start.slice(0, 10) : timedInput(input.start);
  const end = input.allDay
    ? (input.end?.slice(0, 10) || nextDate(start))
    : timedInput(input.end || new Date(new Date(input.start).getTime() + 60 * 60_000).toISOString());
  return {
    title: "",
    projectId: input.projectId ?? "",
    ownerId: input.ownerId,
    allDay: input.allDay,
    start,
    end,
    timezone: input.timezone || "UTC",
    description: "",
    location: "",
    colorId: "",
    recurrence: "",
    attendees: "",
    reminderMinutes: "",
    createMeet: false,
    visibility: "default",
    transparency: "opaque",
  };
}

function eventDraft(event: CalendarEditorEvent): Draft {
  const attendees = (event.attendees ?? []).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const email = (value as Record<string, unknown>).email;
    return typeof email === "string" ? [email] : [];
  }).join(", ");
  const reminderOverrides = event.reminders && Array.isArray(event.reminders.overrides)
    ? event.reminders.overrides as Array<Record<string, unknown>>
    : [];
  const firstReminder = reminderOverrides.find((row) => typeof row.minutes === "number");
  return {
    title: event.title,
    projectId: event.project_id ?? "",
    ownerId: event.owner_profile_id,
    allDay: event.all_day,
    start: event.all_day ? event.start.slice(0, 10) : timedInput(event.start),
    end: event.all_day ? (event.end?.slice(0, 10) || nextDate(event.start.slice(0, 10))) : timedInput(event.end),
    timezone: event.timezone || "UTC",
    description: event.description ?? "",
    location: event.location ?? "",
    colorId: event.provider_color_id ?? "",
    recurrence: (event.recurrence ?? []).filter((value): value is string => typeof value === "string").join("\n"),
    attendees,
    reminderMinutes: firstReminder ? String(firstReminder.minutes) : "",
    createMeet: Boolean(event.conference_data),
    visibility: event.visibility ?? "default",
    transparency: event.transparency ?? "opaque",
  };
}

function isBusiness(event: CalendarEditorEvent | null) {
  return Boolean(event && ["project_start", "project_target", "project_delivery", "installation"].includes(event.source_type));
}

function businessDeleteMessage(event: CalendarEditorEvent) {
  if (event.source_type === "project_start") return "Deleting clears the Project Start Date.";
  if (event.source_type === "project_target") return "Deleting clears the Target Completion Date.";
  if (event.source_type === "project_delivery") return "Deleting clears the Planned Delivery Date.";
  return "Deleting cancels the Installation. The Installation record remains in Modulex.";
}

export default function CalendarEventEditorModal({
  isOpen,
  onClose,
  event,
  initialRange,
  ownerOptions,
  projectOptions,
  defaultOwnerId,
  fixedProjectId = null,
  onSaved,
}: {
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
  const [draft, setDraft] = useState<Draft>(() => blankDraft({ start: new Date().toISOString(), end: null, allDay: false, projectId: fixedProjectId, ownerId: defaultOwnerId, timezone: "UTC" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const business = isBusiness(event);
  const specialReadOnly = Boolean(event && (!event.editable || event.source_type === "google_special"));

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (event) {
      setDraft(eventDraft(event));
      return;
    }
    const range = initialRange ?? { start: new Date().toISOString(), end: null, allDay: false };
    setDraft(blankDraft({ ...range, projectId: fixedProjectId, ownerId: defaultOwnerId, timezone: "UTC" }));
  }, [defaultOwnerId, event, fixedProjectId, initialRange, isOpen]);

  const title = event ? (specialReadOnly ? "Google Calendar Event" : "Edit Calendar Event") : "Add Calendar Event";
  const canDelete = Boolean(event?.deletable && !specialReadOnly);
  const visibilityOptions = useMemo(() => [
    { value: "default", label: "Default" },
    { value: "public", label: "Public" },
    { value: "private", label: "Private" },
    { value: "confidential", label: "Confidential" },
  ], []);
  const transparencyOptions = useMemo(() => [
    { value: "opaque", label: "Busy" },
    { value: "transparent", label: "Free" },
  ], []);

  function normalPayload() {
    const start = draft.allDay ? draft.start : new Date(draft.start).toISOString();
    const end = draft.allDay ? draft.end : draft.end ? new Date(draft.end).toISOString() : null;
    const attendees = draft.attendees.split(",").map((email) => email.trim()).filter(Boolean).map((email) => ({ email }));
    const reminderValue = Number(draft.reminderMinutes);
    return {
      title: draft.title,
      project_id: fixedProjectId ?? draft.projectId || null,
      owner_profile_id: draft.ownerId,
      description: draft.description || null,
      location: draft.location || null,
      all_day: draft.allDay,
      start,
      end,
      timezone: draft.timezone,
      color_id: draft.colorId || null,
      recurrence: draft.recurrence.split("\n").map((line) => line.trim()).filter(Boolean),
      attendees,
      guest_options: { canInviteOthers: true, canModify: false, canSeeOtherGuests: true },
      reminders: draft.reminderMinutes.trim() && Number.isFinite(reminderValue)
        ? { useDefault: false, overrides: [{ method: "popup", minutes: reminderValue }] }
        : { useDefault: true, overrides: [] },
      conference: { createGoogleMeet: draft.createMeet, removeConference: false },
      visibility: draft.visibility,
      transparency: draft.transparency,
    };
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (business && event) {
        await authenticatedFetch("/api/admin/calendar/business-events", {
          method: "PATCH",
          body: JSON.stringify({
            source_type: event.source_type,
            source_id: event.source_id,
            start: draft.allDay ? draft.start : new Date(draft.start).toISOString(),
            end: draft.allDay ? null : draft.end ? new Date(draft.end).toISOString() : null,
            deleted: false,
          }),
        });
      } else if (event) {
        await authenticatedFetch(`/api/admin/calendar/events/${event.source_id}`, { method: "PATCH", body: JSON.stringify(normalPayload()) });
      } else {
        await authenticatedFetch("/api/admin/calendar/events", { method: "POST", body: JSON.stringify(normalPayload()) });
      }
      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Calendar event could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      if (business) {
        await authenticatedFetch("/api/admin/calendar/business-events", {
          method: "PATCH",
          body: JSON.stringify({ source_type: event.source_type, source_id: event.source_id, deleted: true }),
        });
      } else {
        await authenticatedFetch(`/api/admin/calendar/events/${event.source_id}`, { method: "DELETE" });
      }
      onSaved();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Calendar event could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="relative m-4 w-full max-w-3xl p-6 sm:p-8" ariaLabel={title}>
      <div className="space-y-5">
        <div className="pr-10">
          <h2 className={ADMIN_TEXT_STYLES.title}>{title}</h2>
          <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.body}`}>Google Calendar-compatible event fields synchronize through the Company Calendar.</p>
        </div>
        {error ? <Alert variant="error" title="Calendar event action failed" message={error} /> : null}
        {event ? <div className="flex flex-wrap gap-2"><Badge color={event.provider_event_type === "default" ? "info" : "light"}>{event.provider_event_type || "default"}</Badge>{event.provider_event_url ? <Badge color="success">Google linked</Badge> : null}</div> : null}
        {business && event ? <Alert variant="warning" title="Business event" message={businessDeleteMessage(event)} /> : null}
        {specialReadOnly ? <Alert variant="info" title="Read-only Google event" message="This Google event type is mirrored in Modulex but must be edited in Google Calendar." /> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Label htmlFor="calendar-editor-title">Title</Label><Input id="calendar-editor-title" value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} disabled={busy || business || specialReadOnly} /></div>
          {!fixedProjectId ? <div><Label htmlFor="calendar-editor-project">Project</Label><Select id="calendar-editor-project" options={projectOptions} value={draft.projectId} onChange={(value) => setDraft((v) => ({ ...v, projectId: value }))} placeholder="No Project" allowEmpty disabled={busy || business || specialReadOnly} /></div> : null}
          <div><Label htmlFor="calendar-editor-owner">Owner / responsible</Label><Select id="calendar-editor-owner" options={ownerOptions} value={draft.ownerId} onChange={(value) => setDraft((v) => ({ ...v, ownerId: value }))} disabled={busy || business || specialReadOnly} /></div>
          <div className="flex items-end"><Checkbox label="All day" checked={draft.allDay} onChange={(checked) => setDraft((v) => ({ ...v, allDay: checked }))} disabled={busy || business || specialReadOnly} /></div>
          <div><Label htmlFor="calendar-editor-start">Start</Label><Input id="calendar-editor-start" type={draft.allDay ? "date" : "datetime-local"} value={draft.start} onChange={(e) => setDraft((v) => ({ ...v, start: e.target.value }))} disabled={busy || specialReadOnly} /></div>
          <div><Label htmlFor="calendar-editor-end">End</Label><Input id="calendar-editor-end" type={draft.allDay ? "date" : "datetime-local"} value={draft.end} onChange={(e) => setDraft((v) => ({ ...v, end: e.target.value }))} disabled={busy || specialReadOnly || (business && event?.source_type !== "installation")} /></div>
          <div><Label htmlFor="calendar-editor-timezone">Timezone</Label><Input id="calendar-editor-timezone" value={draft.timezone} onChange={(e) => setDraft((v) => ({ ...v, timezone: e.target.value }))} disabled={busy || business || specialReadOnly} /></div>
          <div><Label htmlFor="calendar-editor-color">Google color ID</Label><Input id="calendar-editor-color" value={draft.colorId} onChange={(e) => setDraft((v) => ({ ...v, colorId: e.target.value }))} disabled={busy || business || specialReadOnly} /></div>
          <div className="md:col-span-2"><Label htmlFor="calendar-editor-description">Description</Label><TextArea id="calendar-editor-description" value={draft.description} onChange={(value) => setDraft((v) => ({ ...v, description: value }))} disabled={busy || business || specialReadOnly} /></div>
          <div className="md:col-span-2"><Label htmlFor="calendar-editor-location">Location</Label><Input id="calendar-editor-location" value={draft.location} onChange={(e) => setDraft((v) => ({ ...v, location: e.target.value }))} disabled={busy || business || specialReadOnly} /></div>
          {!business ? <><div className="md:col-span-2"><Label htmlFor="calendar-editor-recurrence">Recurrence</Label><TextArea id="calendar-editor-recurrence" rows={2} value={draft.recurrence} onChange={(value) => setDraft((v) => ({ ...v, recurrence: value }))} placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO" disabled={busy || specialReadOnly} /></div><div className="md:col-span-2"><Label htmlFor="calendar-editor-attendees">Guests / Attendees</Label><Input id="calendar-editor-attendees" value={draft.attendees} onChange={(e) => setDraft((v) => ({ ...v, attendees: e.target.value }))} placeholder="name@example.com, second@example.com" disabled={busy || specialReadOnly} /></div><div><Label htmlFor="calendar-editor-reminder">Reminders (minutes before)</Label><Input id="calendar-editor-reminder" type="number" min={0} value={draft.reminderMinutes} onChange={(e) => setDraft((v) => ({ ...v, reminderMinutes: e.target.value }))} disabled={busy || specialReadOnly} /></div><div className="flex items-end"><Checkbox label="Google Meet" checked={draft.createMeet} onChange={(checked) => setDraft((v) => ({ ...v, createMeet: checked }))} disabled={busy || specialReadOnly} /></div><div><Label htmlFor="calendar-editor-visibility">Visibility</Label><Select id="calendar-editor-visibility" options={visibilityOptions} value={draft.visibility} onChange={(value) => setDraft((v) => ({ ...v, visibility: value }))} disabled={busy || specialReadOnly} /></div><div><Label htmlFor="calendar-editor-transparency">Availability</Label><Select id="calendar-editor-transparency" options={transparencyOptions} value={draft.transparency} onChange={(value) => setDraft((v) => ({ ...v, transparency: value }))} disabled={busy || specialReadOnly} /></div></> : null}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <div>{canDelete ? <Button variant="outline" disabled={busy} onClick={() => void remove()}>{business && event?.source_type === "installation" ? "Cancel Installation" : "Delete Event"}</Button> : null}</div>
          <div className="flex flex-wrap gap-3">{event?.provider_event_url ? <Button variant="outline" onClick={() => window.open(event.provider_event_url!, "_blank", "noopener,noreferrer")}>Open in Google Calendar</Button> : null}<Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>{!specialReadOnly ? <Button disabled={busy || !draft.title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save Event"}</Button> : null}</div>
        </div>
      </div>
    </Modal>
  );
}
