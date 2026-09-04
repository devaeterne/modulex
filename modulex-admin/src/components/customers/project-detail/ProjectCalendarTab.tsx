"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ProjectCalendarBindingDto } from "@/lib/google-calendar/types";

function displayDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ProjectCalendarTab({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const [status, setStatus] = useState<ProjectCalendarBindingDto | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const endpoint = `/api/admin/google-calendar/projects/${projectId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await authenticatedFetch<ProjectCalendarBindingDto>(endpoint);
      setStatus(next);
      setName(next.provider_calendar_name ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project Calendar status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setSuccess(`Calendar resync completed: ${result.synced}/${result.total} Installation records processed successfully.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project Calendar resync failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status) {
    return <ComponentCard title="Google Calendar" desc="Loading Project Calendar status."><p className="text-sm" role="status">Loading Calendar…</p></ComponentCard>;
  }

  if (!status) {
    return (
      <div className="space-y-3">
        <Alert variant="error" title="Project Calendar unavailable" message={error || "Calendar status could not be loaded."} />
        <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const hasCalendar = Boolean(status.provider_calendar_url);

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error" title="Project Calendar action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Project Calendar updated" message={success} /> : null}

      <ComponentCard
        title="Google Calendar"
        desc="This Project owns one Modulex-created Google Calendar. Modulex remains the canonical source."
        headerAction={<Badge color={status.connected ? "success" : "warning"}>{status.connected ? "Google connected" : "Google not connected"}</Badge>}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Badge color={status.integration_enabled ? "success" : "light"}>{status.integration_enabled ? "Integration enabled" : "Integration disabled"}</Badge>
            <Badge color={status.sync_enabled ? "info" : "light"}>{status.sync_enabled ? "Project sync enabled" : "Project sync disabled"}</Badge>
          </div>
          <p className="text-sm"><strong>Calendar:</strong> {status.provider_calendar_name || "Not created yet"}</p>
          <p className="text-sm"><strong>Timezone:</strong> {status.timezone || "Company default"}</p>
          <p className="text-sm"><strong>Last sync:</strong> {displayDateTime(status.last_sync_at)}</p>
          <p className="text-sm"><strong>Last error:</strong> {status.last_error_code || "—"}</p>

          {canManage ? (
            <div className="flex flex-wrap gap-3">
              {!hasCalendar ? <Button size="sm" disabled={busy || !status.connected || !status.integration_enabled} onClick={() => void createCalendar()}>Create Calendar</Button> : null}
              {hasCalendar ? <Button size="sm" variant="outline" onClick={() => status.provider_calendar_url && window.open(status.provider_calendar_url, "_blank", "noopener,noreferrer")}>Open Google Calendar</Button> : null}
              {hasCalendar ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleSync()}>{status.sync_enabled ? "Disable Sync" : "Enable Sync"}</Button> : null}
              {hasCalendar && status.sync_enabled ? <Button size="sm" variant="outline" disabled={busy || !status.connected || !status.integration_enabled} onClick={() => void resync()}>Resync Installations</Button> : null}
            </div>
          ) : null}
        </div>
      </ComponentCard>

      {hasCalendar ? (
        <ComponentCard title="Calendar Name" desc="Rename the Google Calendar without changing the Modulex Project name.">
          <div className="space-y-3">
            <Label htmlFor={`project-calendar-name-${projectId}`}>Google Calendar name</Label>
            <Input id={`project-calendar-name-${projectId}`} value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage || busy} />
            {canManage ? <div><Button size="sm" disabled={busy || !name.trim()} onClick={() => void saveName()}>Save Calendar Name</Button></div> : null}
          </div>
        </ComponentCard>
      ) : (
        <Alert variant="info" title="No Project Calendar yet" message="When Google is connected and the integration is enabled, Modulex can create one dedicated Google Calendar for this Project." />
      )}
    </div>
  );
}
