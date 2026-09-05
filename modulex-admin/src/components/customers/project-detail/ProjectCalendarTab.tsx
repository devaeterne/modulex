"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminCalendarWorkspace from "@/components/calendar/AdminCalendarWorkspace";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  getCustomerProject,
  updateCustomerProjectSchedule,
  type CustomerProject,
} from "@/lib/customers/project-domain";
import type { ProjectCalendarBindingDto } from "@/lib/google-calendar/types";
import { supabase } from "@/lib/supabase/client";

type InstallationOption = {
  id: string;
  installation_number: string;
  scheduled_start_at: string;
  status: string;
};

function displayDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ProjectCalendarTab({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const [status, setStatus] = useState<ProjectCalendarBindingDto | null>(null);
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState("");
  const [primaryInstallationId, setPrimaryInstallationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const endpoint = `/api/admin/google-calendar/projects/${projectId}`;

  const installationOptions = useMemo(
    () => installations.map((installation) => ({
      value: installation.id,
      label: `${installation.installation_number} — ${displayDateTime(installation.scheduled_start_at)} — ${statusLabel(installation.status)}`,
    })),
    [installations],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextProject] = await Promise.all([
        authenticatedFetch<ProjectCalendarBindingDto>(endpoint),
        getCustomerProject(projectId),
      ]);
      const orderIds = (nextProject.orders ?? []).filter((order) => order.status !== "cancelled").map((order) => order.id);
      let nextInstallations: InstallationOption[] = [];
      if (orderIds.length > 0) {
        const installationsResult = await supabase
          .from("customer_installations")
          .select("id,installation_number,scheduled_start_at,status")
          .in("order_id", orderIds)
          .neq("status", "cancelled")
          .order("scheduled_start_at");
        if (installationsResult.error) throw installationsResult.error;
        nextInstallations = (installationsResult.data ?? []) as InstallationOption[];
      }

      setStatus(nextStatus);
      setProject(nextProject);
      setInstallations(nextInstallations);
      setName(nextStatus.provider_calendar_name ?? "");
      setStartDate(dateValue(nextProject.start_date));
      setTargetDate(dateValue(nextProject.target_date));
      setPlannedDeliveryDate(dateValue(nextProject.planned_delivery_date));
      setPrimaryInstallationId(nextProject.primary_installation_id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project Calendar status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setSuccess("Project schedule saved in Modulex.");
      try {
        if (status?.connected && status.integration_enabled && status.sync_enabled && status.provider_calendar_url) {
          await authenticatedFetch(`${endpoint}/resync`, { method: "POST" });
        }
      } catch {
        setSuccess("Project schedule saved in Modulex. Google projection will retry on the next resync.");
      }
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project schedule could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function createCalendar() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await authenticatedFetch<ProjectCalendarBindingDto>(endpoint, { method: "POST" });
      setStatus(next);
      setName(next.provider_calendar_name ?? "");
      setSuccess("Project Google Calendar is ready.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project Calendar could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await authenticatedFetch<ProjectCalendarBindingDto>(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ provider_calendar_name: name }),
      });
      setStatus(next);
      setName(next.provider_calendar_name ?? "");
      setSuccess("Project Calendar name updated.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project Calendar name could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSync() {
    if (!status) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await authenticatedFetch<ProjectCalendarBindingDto>(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ sync_enabled: !status.sync_enabled }),
      });
      setStatus(next);
      setSuccess(next.sync_enabled ? "Project Calendar sync enabled." : "Project Calendar sync disabled.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project Calendar sync setting could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function resync() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await authenticatedFetch<{ total: number; synced: number; errors: number }>(`${endpoint}/resync`, { method: "POST" });
      setSuccess(`Calendar resync completed: ${result.synced}/${result.total} schedule records processed successfully${result.errors ? `; ${result.errors} errors` : ""}.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project Calendar resync failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status && !project) {
    return <ComponentCard title="Project Calendar" desc="Loading Modulex schedule and Google projection status."><p className={`text-sm ${ADMIN_TEXT_STYLES.body}`} role="status">Loading Calendar…</p></ComponentCard>;
  }

  if (!status || !project) {
    return (
      <div className="space-y-3">
        <Alert variant="error" title="Project Calendar unavailable" message={error || "Calendar status could not be loaded."} />
        <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const hasCalendar = Boolean(status.provider_calendar_url);

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Project Calendar action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Project Calendar updated" message={success} /> : null}

      <AdminCalendarWorkspace projectId={projectId} showManagement={false} />

      <ComponentCard title="Project Schedule" desc="Modulex is canonical for these dates. Primary Installation is a summary pointer; all Installation appointments remain visible on Calendar.">
        {canManage ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label htmlFor={`project-calendar-start-${projectId}`}>Start Date</Label>
                <Input id={`project-calendar-start-${projectId}`} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} />
              </div>
              <div>
                <Label htmlFor={`project-calendar-target-${projectId}`}>Target Completion Date</Label>
                <Input id={`project-calendar-target-${projectId}`} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} disabled={busy} />
              </div>
              <div>
                <Label htmlFor={`project-calendar-delivery-${projectId}`}>Planned Delivery Date</Label>
                <Input id={`project-calendar-delivery-${projectId}`} type="date" value={plannedDeliveryDate} onChange={(event) => setPlannedDeliveryDate(event.target.value)} disabled={busy} />
              </div>
              <div>
                <Label htmlFor={`project-calendar-primary-installation-${projectId}`}>Primary Installation</Label>
                <Select id={`project-calendar-primary-installation-${projectId}`} options={installationOptions} value={primaryInstallationId} onChange={setPrimaryInstallationId} placeholder="No Primary Installation" allowEmpty disabled={busy} />
              </div>
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
        title="Google Calendar Projection"
        desc="Google is an external projection for Modulex-managed Project milestones and Installation appointments. Modulex remains canonical."
        headerAction={<Badge color={status.connected ? "success" : "warning"}>{status.connected ? "Google connected" : "Google not connected"}</Badge>}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Badge color={status.integration_enabled ? "success" : "light"}>{status.integration_enabled ? "Integration enabled" : "Integration disabled"}</Badge>
            <Badge color={status.sync_enabled ? "info" : "light"}>{status.sync_enabled ? "Project sync enabled" : "Project sync disabled"}</Badge>
          </div>
          <div className={`space-y-2 text-sm ${ADMIN_TEXT_STYLES.body}`}>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Calendar:</strong> {status.provider_calendar_name || "Not created yet"}</p>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Timezone:</strong> {status.timezone || "Company default"}</p>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Last sync:</strong> {displayDateTime(status.last_sync_at)}</p>
            <p><strong className={ADMIN_TEXT_STYLES.strong}>Last error:</strong> {status.last_error_code || "—"}</p>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-3">
              {!hasCalendar ? <Button size="sm" disabled={busy || !status.connected || !status.integration_enabled} onClick={() => void createCalendar()}>Create Calendar</Button> : null}
              {hasCalendar ? <Button size="sm" variant="outline" onClick={() => status.provider_calendar_url && window.open(status.provider_calendar_url, "_blank", "noopener,noreferrer")}>Open Google Calendar</Button> : null}
              {hasCalendar ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleSync()}>{status.sync_enabled ? "Disable Sync" : "Enable Sync"}</Button> : null}
              {hasCalendar && status.sync_enabled ? <Button size="sm" variant="outline" disabled={busy || !status.connected || !status.integration_enabled} onClick={() => void resync()}>Resync Schedule</Button> : null}
            </div>
          ) : null}
        </div>
      </ComponentCard>

      {hasCalendar ? (
        <ComponentCard title="Google Calendar Name" desc="Rename the provider Calendar without changing the Modulex Project name.">
          <div className="space-y-3">
            <Label htmlFor={`project-calendar-name-${projectId}`}>Google Calendar name</Label>
            <Input id={`project-calendar-name-${projectId}`} value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage || busy} />
            {canManage ? <div><Button size="sm" disabled={busy || !name.trim()} onClick={() => void saveName()}>Save Calendar Name</Button></div> : null}
          </div>
        </ComponentCard>
      ) : (
        <Alert variant="info" title="No Google Project Calendar yet" message="Modulex Calendar works independently. When Google is connected and synchronization is enabled, you can add the external Project projection here." />
      )}
    </div>
  );
}
