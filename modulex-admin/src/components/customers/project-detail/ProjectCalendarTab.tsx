"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminCalendarWorkspace from "@/components/calendar/AdminCalendarWorkspace";
import CalendarEventEditorModal, { type CalendarEditorEvent } from "@/components/calendar/CalendarEventEditorModal";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { getCustomerProject, updateCustomerProjectSchedule, type CustomerProject } from "@/lib/customers/project-domain";
import { supabase } from "@/lib/supabase/client";

type InstallationOption = {
  id: string;
  installation_number: string;
  scheduled_start_at: string;
  status: string;
};
type OwnerOption = { id: string; label: string; email: string | null };
type SnapshotEvent = CalendarEditorEvent & {
  id: string;
  source_type: string;
  source_id: string;
  sync_status: "local" | "synced" | "pending" | "error" | "conflict";
};
type CalendarSnapshot = {
  calendars: Array<{ id: string; kind: string; owner_profile_id: string; provider_calendar_name: string | null; last_sync_at: string | null }>;
  owners: OwnerOption[];
  projects: Array<{ id: string; project_number: string; name: string }>;
  events: SnapshotEvent[];
  can_manage: boolean;
};
type CompanyStatus = {
  binding: { provider_calendar_name: string; provider_calendar_id: string; last_sync_at: string | null; sync_enabled: boolean } | null;
};

function displayDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayEventTime(event: SnapshotEvent) {
  if (event.all_day) return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${event.start.slice(0, 10)}T00:00:00`));
  return displayDateTime(event.start);
}

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ProjectCalendarTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [snapshot, setSnapshot] = useState<CalendarSnapshot | null>(null);
  const [company, setCompany] = useState<CompanyStatus | null>(null);
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState("");
  const [primaryInstallationId, setPrimaryInstallationId] = useState("");
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorEvent, setEditorEvent] = useState<SnapshotEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const installationOptions = useMemo(() => installations.map((installation) => ({
    value: installation.id,
    label: `${installation.installation_number} — ${displayDateTime(installation.scheduled_start_at)} — ${statusLabel(installation.status)}`,
  })), [installations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProject = await getCustomerProject(projectId);
      const orderIds = (nextProject.orders ?? []).filter((order) => order.status !== "cancelled").map((order) => order.id);
      let nextInstallations: InstallationOption[] = [];
      if (orderIds.length) {
        const result = await supabase
          .from("customer_installations")
          .select("id,installation_number,scheduled_start_at,status")
          .in("order_id", orderIds)
          .neq("status", "cancelled")
          .order("scheduled_start_at");
        if (result.error) throw result.error;
        nextInstallations = (result.data ?? []) as InstallationOption[];
      }

      const now = new Date();
      const start = new Date(now); start.setUTCMonth(start.getUTCMonth() - 6);
      const end = new Date(now); end.setUTCFullYear(end.getUTCFullYear() + 2);
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), project_id: projectId });
      const [nextSnapshot, nextCompany] = await Promise.all([
        authenticatedFetch<CalendarSnapshot>(`/api/admin/calendar?${params.toString()}`),
        authenticatedFetch<CompanyStatus>("/api/admin/calendar/company-binding").catch(() => null),
      ]);

      setProject(nextProject);
      setInstallations(nextInstallations);
      setSnapshot(nextSnapshot);
      setCompany(nextCompany);
      setStartDate(dateValue(nextProject.start_date));
      setTargetDate(dateValue(nextProject.target_date));
      setPlannedDeliveryDate(dateValue(nextProject.planned_delivery_date));
      setPrimaryInstallationId(nextProject.primary_installation_id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project Calendar could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function saveSchedule() {
    if (!project || !canManage) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await updateCustomerProjectSchedule({
        projectId,
        startDate: startDate || null,
        targetDate: targetDate || null,
        plannedDeliveryDate: plannedDeliveryDate || null,
        primaryInstallationId: primaryInstallationId || null,
      });
      let message = "Project schedule saved in Modulex.";
      try {
        await authenticatedFetch("/api/admin/calendar/google/sync", { method: "POST", body: JSON.stringify({}) });
        message = "Project schedule saved and Company Calendar synchronization requested.";
      } catch {
        message = "Project schedule saved in Modulex. Google synchronization is queued for retry.";
      }
      setSuccess(message);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project schedule could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !project) {
    return <ComponentCard title="Project Calendar" desc="Loading Project schedule and Company Calendar events."><p className={`text-sm ${ADMIN_TEXT_STYLES.body}`} role="status">Loading Calendar…</p></ComponentCard>;
  }
  if (!project) {
    return <div className="space-y-3"><Alert variant="error" title="Project Calendar unavailable" message={error || "Calendar could not be loaded."} /><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>;
  }

  const upcoming = (snapshot?.events ?? []).filter((event) => new Date(event.all_day ? `${event.start.slice(0, 10)}T23:59:59` : event.end || event.start).getTime() >= Date.now()).slice(0, 8);
  const ownerOptions = (snapshot?.owners ?? []).map((owner) => ({ value: owner.id, label: owner.label }));
  const projectOptions = (snapshot?.projects ?? []).map((item) => ({ value: item.id, label: `${item.project_number} — ${item.name}` }));
  const defaultOwnerId = snapshot?.calendars.find((item) => item.kind === "company")?.owner_profile_id ?? snapshot?.owners[0]?.id ?? "";

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error" title="Project Calendar action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Project Calendar updated" message={success} /> : null}

      <ComponentCard title="Project Schedule" desc="Project milestones and Primary Installation remain canonical Modulex business data and synchronize through the shared Company Calendar.">
        {canManage ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor={`project-calendar-start-${projectId}`}>Start Date</Label><Input id={`project-calendar-start-${projectId}`} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} /></div>
              <div><Label htmlFor={`project-calendar-target-${projectId}`}>Target Completion Date</Label><Input id={`project-calendar-target-${projectId}`} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} disabled={busy} /></div>
              <div><Label htmlFor={`project-calendar-delivery-${projectId}`}>Planned Delivery Date</Label><Input id={`project-calendar-delivery-${projectId}`} type="date" value={plannedDeliveryDate} onChange={(event) => setPlannedDeliveryDate(event.target.value)} disabled={busy} /></div>
              <div><Label htmlFor={`project-calendar-primary-${projectId}`}>Primary Installation</Label><Select id={`project-calendar-primary-${projectId}`} options={installationOptions} value={primaryInstallationId} onChange={setPrimaryInstallationId} placeholder="No Primary Installation" allowEmpty disabled={busy} /></div>
            </div>
            <Button disabled={busy} onClick={() => void saveSchedule()}>{busy ? "Saving…" : "Save Project Schedule"}</Button>
          </div>
        ) : (
          <div className={`grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4 ${ADMIN_TEXT_STYLES.body}`}>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Start:</strong> {project.start_date || "—"}</p>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Target:</strong> {project.target_date || "—"}</p>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Planned Delivery:</strong> {project.planned_delivery_date || "—"}</p>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Primary Installation:</strong> {installations.find((item) => item.id === project.primary_installation_id)?.installation_number || "—"}</p>
          </div>
        )}
      </ComponentCard>

      <ComponentCard
        title="Upcoming Calendar Events"
        desc="Nearest Project-linked events from the shared Company Calendar."
        headerAction={canManage ? <Button size="sm" onClick={() => { setEditorEvent(null); setEditorOpen(true); }}>Add Event</Button> : undefined}
      >
        {upcoming.length ? <div className="space-y-1">{upcoming.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className={`text-sm ${ADMIN_TEXT_STYLES.strong}`}>{event.title}</p><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{displayEventTime(event)} · {statusLabel(event.source_type)}</p></div><div className="flex items-center gap-2"><Badge color={event.sync_status === "error" || event.sync_status === "conflict" ? "error" : event.sync_status === "pending" ? "warning" : "success"}>{event.sync_status}</Badge><Button size="sm" variant="outline" onClick={() => { setEditorEvent(event); setEditorOpen(true); }}>View</Button></div></div>)}</div> : <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>No upcoming Project events in the current Calendar window.</p>}
      </ComponentCard>

      <div className={`flex flex-wrap items-center justify-between gap-3 text-sm ${ADMIN_TEXT_STYLES.body}`}>
        <p><strong className={ADMIN_TEXT_STYLES.strong}>Company Calendar:</strong> {company?.binding?.provider_calendar_name ?? "Not selected"} · {company?.binding?.sync_enabled ? "Synced" : "Setup required"} · last sync {displayDateTime(company?.binding?.last_sync_at ?? null)}</p>
        <div className="flex flex-wrap gap-2">{company?.binding ? <Button size="sm" variant="outline" onClick={() => window.open(`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(company.binding!.provider_calendar_id)}`, "_blank", "noopener,noreferrer")}>Open in Google</Button> : null}<Button size="sm" variant="outline" onClick={() => setCalendarVisible((visible) => !visible)}>{calendarVisible ? "Hide Calendar" : "Show Calendar"}</Button></div>
      </div>

      {calendarVisible ? <AdminCalendarWorkspace projectId={projectId} showManagement={false} compactProjectMode /> : null}

      <CalendarEventEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        event={editorEvent}
        initialRange={null}
        ownerOptions={ownerOptions}
        projectOptions={projectOptions}
        defaultOwnerId={defaultOwnerId}
        fixedProjectId={projectId}
        onSaved={() => void load()}
      />
    </div>
  );
}
