"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import type { DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import AdminFullCalendarSurface from "@/components/ui/calendar/AdminFullCalendarSurface";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

type CalendarEventType = "project_start" | "project_target" | "project_delivery" | "installation" | "google_external";

type CalendarEvent = {
  id: string;
  calendar_id: string;
  owner_profile_id: string;
  project_id: string | null;
  customer_id: string | null;
  source_type: CalendarEventType;
  source_id: string;
  title: string;
  start: string;
  end: string | null;
  all_day: boolean;
  timezone: string;
  background_color: string | null;
  foreground_color: string | null;
  navigation_target: string | null;
  provider_event_url: string | null;
  provider_color_id: string | null;
  is_primary_installation: boolean;
  provider_backed: boolean;
};

type CalendarItem = {
  id: string;
  name: string;
  kind: "project" | "google_imported";
  owner_profile_id: string;
  project_id: string | null;
  timezone: string;
  owner_name: string;
  owner_email: string | null;
  project_number: string | null;
  project_name: string | null;
  provider_binding_id: string | null;
  provider_calendar_name: string | null;
  provider_data_owner: string | null;
  provider_access_role: string | null;
  binding_mode: "modulex_created" | "google_imported" | null;
  sync_enabled: boolean;
  last_mirror_sync_at: string | null;
  last_error_code: string | null;
};

type OwnerOption = { id: string; label: string; email: string | null };
type ProjectOption = { id: string; project_number: string; name: string };
type CalendarSnapshot = {
  calendars: CalendarItem[];
  owners: OwnerOption[];
  projects: ProjectOption[];
  events: CalendarEvent[];
  can_manage: boolean;
};

type GoogleDiscoveryItem = {
  provider_calendar_id: string;
  provider_calendar_name: string;
  timezone: string;
  data_owner: string | null;
  access_role: string;
  background_color: string | null;
  foreground_color: string | null;
  color_id: string | null;
  primary: boolean;
  selected: boolean;
  already_imported: boolean;
  write_eligible: boolean;
};

type DateRange = { start: string; end: string };

const EVENT_TYPE_OPTIONS = [
  { value: "project_start", label: "Project Start" },
  { value: "project_target", label: "Project Target" },
  { value: "project_delivery", label: "Planned Delivery" },
  { value: "installation", label: "Installation" },
  { value: "google_external", label: "Google External" },
];

function initialDateRange(): DateRange {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function displayDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AdminCalendarWorkspace({
  projectId = null,
  showManagement = true,
}: {
  projectId?: string | null;
  showManagement?: boolean;
}) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(() => initialDateRange());
  const [snapshot, setSnapshot] = useState<CalendarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [myCalendar, setMyCalendar] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [eventType, setEventType] = useState("");
  const [discovery, setDiscovery] = useState<GoogleDiscoveryItem[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [providerCalendarId, setProviderCalendarId] = useState("");
  const [importOwnerId, setImportOwnerId] = useState("");
  const [manageCalendarId, setManageCalendarId] = useState("");
  const [manageOwnerId, setManageOwnerId] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ start: range.start, end: range.end });
    if (myCalendar) params.set("my_calendar", "true");
    if (ownerId) params.set("owner_id", ownerId);
    if (projectId || filterProjectId) params.set("project_id", projectId || filterProjectId);
    if (calendarId) params.set("calendar_id", calendarId);
    if (eventType) params.set("event_type", eventType);

    setLoading(true);
    setError(null);
    void authenticatedFetch<CalendarSnapshot>(`/api/admin/calendar?${params.toString()}`, { signal: controller.signal })
      .then((data) => setSnapshot(data))
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Calendar could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [calendarId, eventType, filterProjectId, myCalendar, ownerId, projectId, range, refreshKey]);

  useEffect(() => {
    if (!snapshot) return;
    if (!importOwnerId && snapshot.owners.length === 1) setImportOwnerId(snapshot.owners[0].id);
  }, [importOwnerId, snapshot]);

  const ownerOptions = useMemo(
    () => (snapshot?.owners ?? []).map((owner) => ({ value: owner.id, label: owner.label })),
    [snapshot],
  );
  const projectOptions = useMemo(
    () => (snapshot?.projects ?? []).map((project) => ({ value: project.id, label: `${project.project_number} — ${project.name}` })),
    [snapshot],
  );
  const calendarOptions = useMemo(
    () => (snapshot?.calendars ?? []).map((calendar) => ({ value: calendar.id, label: `${calendar.name} — ${calendar.owner_name}` })),
    [snapshot],
  );
  const providerOptions = useMemo(
    () => discovery
      .filter((calendar) => calendar.write_eligible && !calendar.already_imported)
      .map((calendar) => ({ value: calendar.provider_calendar_id, label: `${calendar.provider_calendar_name} — ${calendar.access_role}` })),
    [discovery],
  );
  const fullCalendarEvents = useMemo<EventInput[]>(
    () => (snapshot?.events ?? []).map((event) => ({
      id: event.id,
      title: event.is_primary_installation ? `★ ${event.title}` : event.title,
      start: event.start,
      end: event.end ?? undefined,
      allDay: event.all_day,
      backgroundColor: event.background_color ?? undefined,
      borderColor: event.background_color ?? undefined,
      textColor: event.foreground_color ?? undefined,
      extendedProps: { modulexEvent: event },
    })),
    [snapshot],
  );

  const handleDatesSet = useCallback((dates: DatesSetArg) => {
    setRange((current) => {
      const next = { start: dates.start.toISOString(), end: dates.end.toISOString() };
      return current.start === next.start && current.end === next.end ? current : next;
    });
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const event = info.event.extendedProps.modulexEvent as CalendarEvent | undefined;
    if (!event) return;
    if (event.navigation_target) {
      router.push(event.navigation_target);
      return;
    }
    if (event.provider_event_url) window.open(event.provider_event_url, "_blank", "noopener,noreferrer");
  }, [router]);

  async function discoverCalendars() {
    setDiscovering(true);
    setError(null);
    setMessage(null);
    try {
      const result = await authenticatedFetch<{ calendars: GoogleDiscoveryItem[] }>("/api/admin/calendar/google/discovery");
      setDiscovery(result.calendars);
      setProviderCalendarId("");
      setMessage("Google calendars refreshed. Only owner-access calendars are importable in V1.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Google calendars could not be discovered.");
    } finally {
      setDiscovering(false);
    }
  }

  async function importCalendar() {
    if (!providerCalendarId || !importOwnerId) return;
    setBusyAction("import");
    setError(null);
    setMessage(null);
    try {
      const result = await authenticatedFetch<{ sync_error_code: string | null }>("/api/admin/calendar/google/import", {
        method: "POST",
        body: JSON.stringify({ provider_calendar_id: providerCalendarId, owner_profile_id: importOwnerId }),
      });
      setMessage(result.sync_error_code
        ? `Calendar imported, but the initial Google mirror needs attention: ${result.sync_error_code}.`
        : "Google Calendar imported and mirrored successfully.");
      setRefreshKey((value) => value + 1);
      await discoverCalendars();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Google Calendar could not be imported.");
    } finally {
      setBusyAction(null);
    }
  }

  async function syncImportedCalendar(bindingId: string) {
    setBusyAction(bindingId);
    setError(null);
    setMessage(null);
    try {
      await authenticatedFetch("/api/admin/calendar/google/sync", {
        method: "POST",
        body: JSON.stringify({ binding_id: bindingId }),
      });
      setMessage("Imported Google Calendar mirror synchronized.");
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Imported Google Calendar could not be synchronized.");
    } finally {
      setBusyAction(null);
    }
  }

  function selectManagedCalendar(nextCalendarId: string) {
    setManageCalendarId(nextCalendarId);
    const calendar = snapshot?.calendars.find((item) => item.id === nextCalendarId);
    setManageOwnerId(calendar?.owner_profile_id ?? "");
  }

  async function saveCalendarOwner() {
    if (!manageCalendarId || !manageOwnerId) return;
    setBusyAction("owner");
    setError(null);
    setMessage(null);
    try {
      await authenticatedFetch("/api/admin/calendar", {
        method: "PATCH",
        body: JSON.stringify({ calendar_id: manageCalendarId, owner_profile_id: manageOwnerId }),
      });
      setMessage("Calendar owner updated.");
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Calendar owner could not be updated.");
    } finally {
      setBusyAction(null);
    }
  }

  const importedCalendars = (snapshot?.calendars ?? []).filter((calendar) => calendar.binding_mode === "google_imported");

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Calendar action failed" message={error} /> : null}
      {message ? <Alert variant="success" title="Calendar updated" message={message} /> : null}

      <ComponentCard
        title={projectId ? "Project Schedule" : "Admin Calendar"}
        desc={projectId ? "Modulex Project milestones and canonical Installation appointments." : "Month, Week, Day, and List views from Modulex scheduling truth plus imported Google-only events."}
        headerAction={loading ? <Badge color="info">Refreshing</Badge> : <Badge color="success">Modulex live</Badge>}
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label htmlFor={`calendar-owner-filter-${projectId || "all"}`}>Owner</Label>
              <Select id={`calendar-owner-filter-${projectId || "all"}`} options={ownerOptions} value={ownerId} onChange={setOwnerId} placeholder="All owners" allowEmpty />
            </div>
            {!projectId ? (
              <div>
                <Label htmlFor="calendar-project-filter">Project</Label>
                <Select id="calendar-project-filter" options={projectOptions} value={filterProjectId} onChange={setFilterProjectId} placeholder="All Projects" allowEmpty />
              </div>
            ) : null}
            <div>
              <Label htmlFor={`calendar-calendar-filter-${projectId || "all"}`}>Calendar</Label>
              <Select id={`calendar-calendar-filter-${projectId || "all"}`} options={calendarOptions} value={calendarId} onChange={setCalendarId} placeholder="All calendars" allowEmpty />
            </div>
            <div>
              <Label htmlFor={`calendar-event-type-filter-${projectId || "all"}`}>Event Type</Label>
              <Select id={`calendar-event-type-filter-${projectId || "all"}`} options={EVENT_TYPE_OPTIONS} value={eventType} onChange={setEventType} placeholder="All event types" allowEmpty />
            </div>
            <div className="flex items-end">
              <Checkbox label="My Calendar" checked={myCalendar} onChange={setMyCalendar} />
            </div>
          </div>

          <div className={`flex flex-wrap gap-4 text-sm ${ADMIN_TEXT_STYLES.body}`}>
            <span>{snapshot?.events.length ?? 0} events in the visible range</span>
            <span>{snapshot?.calendars.length ?? 0} calendars</span>
          </div>

          <AdminFullCalendarSurface>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }}
              buttonText={{ month: "Month", week: "Week", day: "Day", list: "List", today: "Today" }}
              events={fullCalendarEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              height="auto"
              nowIndicator
              stickyHeaderDates
              dayMaxEvents
            />
          </AdminFullCalendarSurface>
        </div>
      </ComponentCard>

      {showManagement && snapshot?.can_manage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ComponentCard title="Calendar Ownership" desc="Every Modulex calendar has exactly one active operational owner.">
            <div className="space-y-4">
              <div>
                <Label htmlFor="calendar-owner-management-calendar">Calendar</Label>
                <Select id="calendar-owner-management-calendar" options={calendarOptions} value={manageCalendarId} onChange={selectManagedCalendar} placeholder="Select Calendar" allowEmpty />
              </div>
              <div>
                <Label htmlFor="calendar-owner-management-owner">Owner</Label>
                <Select id="calendar-owner-management-owner" options={ownerOptions} value={manageOwnerId} onChange={setManageOwnerId} placeholder="Select Owner" allowEmpty />
              </div>
              <Button disabled={!manageCalendarId || !manageOwnerId || busyAction === "owner"} onClick={() => void saveCalendarOwner()}>
                {busyAction === "owner" ? "Saving…" : "Save Owner"}
              </Button>
            </div>
          </ComponentCard>

          <ComponentCard title="Google Calendar Import" desc="Discover subscribed Google calendars. V1 imports only calendars where the connected account has owner access.">
            <div className="space-y-4">
              <Button variant="outline" disabled={discovering} onClick={() => void discoverCalendars()}>
                {discovering ? "Discovering…" : "Discover Google Calendars"}
              </Button>
              {discovery.length > 0 ? (
                <div className="space-y-2">
                  {discovery.map((calendar) => (
                    <div key={calendar.provider_calendar_id} className="flex flex-wrap items-center justify-between gap-3 py-1">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>{calendar.provider_calendar_name}</p>
                        <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Access: {calendar.access_role} · Data owner: {calendar.data_owner || "not reported"}</p>
                      </div>
                      <Badge color={calendar.already_imported ? "success" : calendar.write_eligible ? "info" : "warning"}>
                        {calendar.already_imported ? "Imported" : calendar.write_eligible ? "Owner eligible" : "Read only in V1"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <Label htmlFor="google-calendar-import-calendar">Calendar</Label>
                <Select id="google-calendar-import-calendar" options={providerOptions} value={providerCalendarId} onChange={setProviderCalendarId} placeholder="Select owner-access Google Calendar" allowEmpty />
              </div>
              <div>
                <Label htmlFor="google-calendar-import-owner">Owner</Label>
                <Select id="google-calendar-import-owner" options={ownerOptions} value={importOwnerId} onChange={setImportOwnerId} placeholder="Select Modulex Owner" allowEmpty />
              </div>
              <Button disabled={!providerCalendarId || !importOwnerId || busyAction === "import"} onClick={() => void importCalendar()}>
                {busyAction === "import" ? "Importing…" : "Import Calendar"}
              </Button>
            </div>
          </ComponentCard>
        </div>
      ) : null}

      {showManagement && snapshot?.can_manage && importedCalendars.length > 0 ? (
        <ComponentCard title="Imported Google Calendars" desc="Google-only events remain read-only Modulex mirror data. Provider failures retain the last successful mirror.">
          <div className="space-y-4">
            {importedCalendars.map((calendar) => (
              <div key={calendar.id} className="flex flex-wrap items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{calendar.name}</p>
                  <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Owner: {calendar.owner_name} · Google access: {calendar.provider_access_role || "—"} · Last mirror: {displayDateTime(calendar.last_mirror_sync_at)}</p>
                  {calendar.last_error_code ? <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Last error: {calendar.last_error_code}</p> : null}
                </div>
                {calendar.provider_binding_id ? (
                  <Button variant="outline" size="sm" disabled={busyAction === calendar.provider_binding_id} onClick={() => void syncImportedCalendar(calendar.provider_binding_id!)}>
                    {busyAction === calendar.provider_binding_id ? "Syncing…" : "Sync Mirror"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </ComponentCard>
      ) : null}
    </div>
  );
}
