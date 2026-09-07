"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventApi } from "@fullcalendar/core";
import CalendarCompanyStatus, { type CalendarCompanyBindingStatus } from "@/components/calendar/CalendarCompanyStatus";
import CalendarEventEditorModal, { type CalendarEditorEvent } from "@/components/calendar/CalendarEventEditorModal";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

type OwnerOption = { id: string; label: string; email: string | null };
type ProjectOption = { id: string; project_number: string; name: string };
type CalendarItem = {
  id: string;
  name: string;
  kind: "project" | "google_imported" | "company";
  owner_profile_id: string;
  provider_calendar_name: string | null;
  provider_access_role: string | null;
  provider_binding_id: string | null;
  sync_enabled: boolean;
};
type CalendarSnapshot = {
  calendars: CalendarItem[];
  owners: OwnerOption[];
  projects: ProjectOption[];
  events: CalendarEditorEvent[] & never;
  can_manage: boolean;
};
type SnapshotEvent = CalendarEditorEvent & {
  id: string;
  calendar_id: string;
  customer_id: string | null;
  background_color: string | null;
  foreground_color: string | null;
  navigation_target: string | null;
  is_primary_installation: boolean;
  provider_backed: boolean;
  responsible_profile_id: string;
  sync_status: "local" | "synced" | "pending" | "error" | "conflict";
};
type Snapshot = Omit<CalendarSnapshot, "events"> & { events: SnapshotEvent[] };
type DiscoveryItem = {
  provider_calendar_id: string;
  provider_calendar_name: string;
  timezone: string;
  access_role: string;
  background_color: string | null;
  foreground_color: string | null;
  color_id: string | null;
  primary: boolean;
  write_eligible: boolean;
};
type CompanySyncResponse = {
  mode: "company";
  provider: {
    complete: boolean;
    continuation_token: string | null;
  };
};

type Range = { start: string; end: string };

function defaultRange(): Range {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalMutationPayload(record: SnapshotEvent, event: EventApi) {
  const allDay = event.allDay;
  const start = allDay ? event.startStr.slice(0, 10) : event.start?.toISOString() ?? record.start;
  const end = allDay
    ? (event.endStr ? event.endStr.slice(0, 10) : record.end)
    : event.end?.toISOString() ?? null;
  return {
    title: record.title,
    project_id: record.project_id,
    owner_profile_id: record.owner_profile_id,
    description: record.description ?? null,
    location: record.location ?? null,
    all_day: allDay,
    start,
    end,
    timezone: record.timezone,
    color_id: record.provider_color_id,
    recurrence: record.recurrence ?? [],
    attendees: record.attendees ?? [],
    guest_options: { canInviteOthers: true, canModify: false, canSeeOtherGuests: true },
    reminders: record.reminders ?? { useDefault: true, overrides: [] },
    conference: { createGoogleMeet: Boolean(record.conference_data), removeConference: false },
    visibility: record.visibility ?? "default",
    transparency: record.transparency ?? "opaque",
  };
}

export default function AdminCalendarWorkspace({
  projectId = null,
  showManagement = true,
  compactProjectMode = false,
}: {
  projectId?: string | null;
  showManagement?: boolean;
  compactProjectMode?: boolean;
}) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [companyStatus, setCompanyStatus] = useState<CalendarCompanyBindingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [myCalendar, setMyCalendar] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [calendarId, setCalendarId] = useState("");
  const [eventType, setEventType] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorEvent, setEditorEvent] = useState<SnapshotEvent | null>(null);
  const [initialRange, setInitialRange] = useState<{ start: string; end: string | null; allDay: boolean } | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryItem[]>([]);
  const [bindingCalendarId, setBindingCalendarId] = useState("");
  const [bindingOwnerId, setBindingOwnerId] = useState("");
  const autoRefreshStartedRef = useRef(false);

  const queryProjectId = projectId ?? selectedProjectId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end });
      if (myCalendar) params.set("my_calendar", "true");
      if (ownerId) params.set("owner_id", ownerId);
      if (queryProjectId) params.set("project_id", queryProjectId);
      if (calendarId) params.set("calendar_id", calendarId);
      if (eventType) params.set("event_type", eventType);
      const [nextSnapshot, nextCompany] = await Promise.all([
        authenticatedFetch<Snapshot>(`/api/admin/calendar?${params.toString()}`),
        authenticatedFetch<CalendarCompanyBindingStatus>("/api/admin/calendar/company-binding").catch(() => null),
      ]);
      setSnapshot(nextSnapshot);
      setCompanyStatus(nextCompany);
      const company = nextSnapshot.calendars.find((item) => item.kind === "company");
      if (!bindingOwnerId) setBindingOwnerId(company?.owner_profile_id ?? nextSnapshot.owners[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Calendar could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [bindingOwnerId, calendarId, eventType, myCalendar, ownerId, queryProjectId, range.end, range.start]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoRefreshStartedRef.current || !companyStatus?.binding?.sync_enabled) return;
    autoRefreshStartedRef.current = true;
    void (async () => {
      try {
        await authenticatedFetch("/api/admin/calendar/google/refresh", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await load();
      } catch {
        // Calendar opening must stay usable if background Google refresh is temporarily unavailable.
      }
    })();
  }, [companyStatus?.binding?.sync_enabled, load]);

  const ownerOptions = useMemo(() => (snapshot?.owners ?? []).map((item) => ({ value: item.id, label: item.label })), [snapshot?.owners]);
  const projectOptions = useMemo(() => (snapshot?.projects ?? []).map((item) => ({ value: item.id, label: `${item.project_number} — ${item.name}` })), [snapshot?.projects]);
  const calendarOptions = useMemo(() => (snapshot?.calendars ?? []).filter((item) => item.kind === "company" || item.kind === "google_imported").map((item) => ({ value: item.id, label: item.provider_calendar_name || item.name })), [snapshot?.calendars]);
  const eventTypeOptions = useMemo(() => [
    { value: "project_start", label: "Project Start" },
    { value: "project_target", label: "Project Target" },
    { value: "project_delivery", label: "Planned Delivery" },
    { value: "installation", label: "Installation" },
    { value: "calendar_event", label: "Calendar Event" },
    { value: "google_special", label: "Google Special Event" },
  ], []);
  const defaultOwnerId = companyStatus?.binding
    ? snapshot?.calendars.find((item) => item.kind === "company")?.owner_profile_id ?? snapshot?.owners[0]?.id ?? ""
    : snapshot?.owners[0]?.id ?? "";

  const calendarEvents = useMemo(() => (snapshot?.events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end ?? undefined,
    allDay: event.all_day,
    backgroundColor: event.background_color ?? undefined,
    textColor: event.foreground_color ?? undefined,
    editable: Boolean(snapshot?.can_manage && event.editable),
    extendedProps: { record: event },
  })), [snapshot]);

  function openCreate(input: { start: string; end: string | null; allDay: boolean }) {
    if (!snapshot?.can_manage) return;
    setEditorEvent(null);
    setInitialRange(input);
    setEditorOpen(true);
  }

  function openEvent(record: SnapshotEvent) {
    setEditorEvent(record);
    setInitialRange(null);
    setEditorOpen(true);
  }

  async function persistMovedEvent(event: EventApi, revert: () => void) {
    const record = event.extendedProps.record as SnapshotEvent | undefined;
    if (!record || !snapshot?.can_manage || !record.editable) {
      revert();
      return;
    }
    setError(null);
    try {
      if (["project_start", "project_target", "project_delivery", "installation"].includes(record.source_type)) {
        await authenticatedFetch("/api/admin/calendar/business-events", {
          method: "PATCH",
          body: JSON.stringify({
            source_type: record.source_type,
            source_id: record.source_id,
            start: event.allDay ? event.startStr.slice(0, 10) : event.start?.toISOString(),
            end: event.allDay ? null : event.end?.toISOString() ?? null,
            deleted: false,
          }),
        });
      } else {
        await authenticatedFetch(`/api/admin/calendar/events/${record.source_id}`, {
          method: "PATCH",
          body: JSON.stringify(normalMutationPayload(record, event)),
        });
      }
      setSuccess("Calendar event updated. Google synchronization is continuing in the background if needed.");
      await load();
    } catch (moveError) {
      revert();
      setError(moveError instanceof Error ? moveError.message : "Calendar event could not be moved.");
    }
  }

  async function discoverCalendars() {
    setBusy(true);
    setError(null);
    try {
      const result = await authenticatedFetch<{ calendars: DiscoveryItem[] } | DiscoveryItem[]>("/api/admin/calendar/google/discovery");
      const items = Array.isArray(result) ? result : result.calendars;
      setDiscovery(items.filter((item) => item.write_eligible));
      setBindingCalendarId(items.find((item) => item.write_eligible && item.primary)?.provider_calendar_id ?? items.find((item) => item.write_eligible)?.provider_calendar_id ?? "");
      setDiscoveryOpen(true);
    } catch (discoveryError) {
      setError(discoveryError instanceof Error ? discoveryError.message : "Google Calendars could not be discovered.");
    } finally {
      setBusy(false);
    }
  }

  async function runCompanySyncToCompletion() {
    let continuationToken: string | null = null;
    const seenContinuationTokens = new Set<string>();
    do {
      const result: CompanySyncResponse = await authenticatedFetch<CompanySyncResponse>("/api/admin/calendar/google/sync", {
        method: "POST",
        body: JSON.stringify(continuationToken ? { continuation_token: continuationToken } : {}),
      });
      const nextContinuationToken: string | null = result.provider.continuation_token;
      if (!result.provider.complete && !nextContinuationToken) {
        throw new Error("Google Calendar sync stopped before the provider history was complete.");
      }
      if (nextContinuationToken && seenContinuationTokens.has(nextContinuationToken)) {
        throw new Error("Google Calendar sync returned a repeated continuation token.");
      }
      if (nextContinuationToken) seenContinuationTokens.add(nextContinuationToken);
      continuationToken = nextContinuationToken;
    } while (continuationToken);
  }

  async function saveCompanyBinding() {
    if (!bindingCalendarId || !bindingOwnerId) return;
    setBusy(true);
    setError(null);
    try {
      await authenticatedFetch("/api/admin/calendar/company-binding", {
        method: "PUT",
        body: JSON.stringify({ provider_calendar_id: bindingCalendarId, owner_profile_id: bindingOwnerId }),
      });
      setDiscoveryOpen(false);
      await runCompanySyncToCompletion();
      setSuccess("Company Calendar selected and initial synchronization completed.");
      await load();
    } catch (bindingError) {
      setError(bindingError instanceof Error ? bindingError.message : "Company Calendar could not be selected.");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      await runCompanySyncToCompletion();
      setSuccess("Company Calendar synchronization completed.");
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Company Calendar synchronization failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error" title="Calendar action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Calendar updated" message={success} /> : null}

      {showManagement ? <CalendarCompanyStatus status={companyStatus} busy={busy} onChangeCalendar={() => void discoverCalendars()} onSync={() => void syncNow()} /> : null}

      {showManagement && discoveryOpen ? (
        <ComponentCard title="Choose Company Calendar" desc="Use one Google Calendar with writer or owner access. Shared and Family calendars are supported when the connected account can write events.">
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="company-google-calendar">Google Calendar</Label><Select id="company-google-calendar" options={discovery.map((item) => ({ value: item.provider_calendar_id, label: `${item.provider_calendar_name} · ${item.access_role}` }))} value={bindingCalendarId} onChange={setBindingCalendarId} placeholder="Choose Calendar" disabled={busy} /></div>
            <div><Label htmlFor="company-calendar-owner">Modulex Calendar Owner</Label><Select id="company-calendar-owner" options={ownerOptions} value={bindingOwnerId} onChange={setBindingOwnerId} placeholder="Choose owner" disabled={busy} /></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3"><Button disabled={busy || !bindingCalendarId || !bindingOwnerId} onClick={() => void saveCompanyBinding()}>Use as Company Calendar</Button><Button variant="outline" disabled={busy} onClick={() => setDiscoveryOpen(false)}>Cancel</Button></div>
        </ComponentCard>
      ) : null}

      {!compactProjectMode ? (
        <ComponentCard title="Calendar Filters" desc="Filter the shared operational Calendar by responsible employee, Project, Calendar, or Event Type.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="flex items-end"><Checkbox label="My Calendar" checked={myCalendar} onChange={setMyCalendar} /></div>
            <div><Label htmlFor="calendar-owner-filter">Owner</Label><Select id="calendar-owner-filter" options={ownerOptions} value={ownerId} onChange={setOwnerId} placeholder="All owners" allowEmpty /></div>
            {!projectId ? <div><Label htmlFor="calendar-project-filter">Project</Label><Select id="calendar-project-filter" options={projectOptions} value={selectedProjectId} onChange={setSelectedProjectId} placeholder="All Projects" allowEmpty /></div> : null}
            <div><Label htmlFor="calendar-calendar-filter">Calendar</Label><Select id="calendar-calendar-filter" options={calendarOptions} value={calendarId} onChange={setCalendarId} placeholder="All calendars" allowEmpty /></div>
            <div><Label htmlFor="calendar-type-filter">Event Type</Label><Select id="calendar-type-filter" options={eventTypeOptions} value={eventType} onChange={setEventType} placeholder="All event types" allowEmpty /></div>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard
        title={compactProjectMode ? "Project Calendar" : "Operational Calendar"}
        desc={compactProjectMode ? "Month/List view for this Project. Google and Modulex changes synchronize through the Company Calendar." : "Month, Week, Day, and List views share the same Company Calendar and bidirectional Google synchronization."}
        headerAction={snapshot?.can_manage ? <Button size="sm" onClick={() => openCreate({ start: new Date().toISOString(), end: null, allDay: false })}>Add Event</Button> : undefined}
      >
        {loading && !snapshot ? <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`} role="status">Loading Calendar…</p> : null}
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={compactProjectMode ? "dayGridMonth" : "dayGridMonth"}
          headerToolbar={compactProjectMode ? { left: "prev,next today", center: "title", right: "dayGridMonth,listMonth" } : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
          events={calendarEvents}
          selectable={Boolean(snapshot?.can_manage)}
          editable={Boolean(snapshot?.can_manage)}
          eventDurationEditable={Boolean(snapshot?.can_manage)}
          selectMirror
          height="auto"
          datesSet={(info) => {
            const next = { start: info.start.toISOString(), end: info.end.toISOString() };
            if (next.start !== range.start || next.end !== range.end) setRange(next);
          }}
          select={(info) => openCreate({ start: info.allDay ? info.startStr.slice(0, 10) : info.start.toISOString(), end: info.allDay ? info.endStr.slice(0, 10) : info.end?.toISOString() ?? null, allDay: info.allDay })}
          eventClick={(info) => {
            const record = info.event.extendedProps.record as SnapshotEvent | undefined;
            if (record) openEvent(record);
          }}
          eventDrop={(info) => void persistMovedEvent(info.event, info.revert)}
          eventResize={(info) => void persistMovedEvent(info.event, info.revert)}
          eventContent={(info) => {
            const record = info.event.extendedProps.record as SnapshotEvent | undefined;
            return <div className="min-w-0"><p className="truncate text-xs font-medium">{info.event.title}</p>{record?.sync_status && record.sync_status !== "synced" ? <p className="truncate text-xs">{record.sync_status}</p> : null}</div>;
          }}
        />
      </ComponentCard>

      <CalendarEventEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        event={editorEvent}
        initialRange={initialRange}
        ownerOptions={ownerOptions}
        projectOptions={projectOptions}
        defaultOwnerId={defaultOwnerId}
        fixedProjectId={projectId}
        onSaved={() => void load()}
      />
    </div>
  );
}
