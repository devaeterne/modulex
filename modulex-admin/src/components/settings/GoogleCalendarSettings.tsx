"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { hasPermission } from "@/lib/auth/permissions";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type {
  GoogleCalendarIntegrationSettings,
  GoogleCalendarStatusDto,
} from "@/lib/google-calendar/types";
import { getCurrentProfile } from "@/lib/supabase/profile";

const emptySettings: GoogleCalendarIntegrationSettings = {
  enabled: false,
  auto_create_project_calendar: true,
  calendar_name_template: "{project_no} - {customer_name}",
  timezone_override: null,
  sync_installations: true,
  sync_deliveries: false,
  sync_measurements: false,
  sync_customer_appointments: false,
};

type BusyAction = "connect" | "save" | "disconnect" | null;

function statusBadge(status: GoogleCalendarStatusDto["connection"]["status"]) {
  if (status === "connected") return <Badge color="success">Connected</Badge>;
  if (status === "error") return <Badge color="error">Reconnect required</Badge>;
  return <Badge color="light">Disconnected</Badge>;
}

function callbackNotice(value: string | null) {
  if (value === "connected") {
    return { variant: "success" as const, title: "Google Calendar connected", message: "The Google account is ready for Modulex Project calendars." };
  }
  if (!value) return null;
  const messages: Record<string, string> = {
    invalid_state: "The Google authorization request expired or could not be validated. Start the connection again.",
    consent_denied: "Google authorization was cancelled. No connection was saved.",
    missing_code: "Google did not return an authorization code. Start the connection again.",
    missing_refresh_token: "Google did not return an offline refresh token. Reconnect and grant access again.",
    oauth_failed: "Google authorization could not be completed. Reconnect and try again.",
  };
  return {
    variant: "error" as const,
    title: "Google Calendar connection failed",
    message: messages[value] || "Google Calendar could not be connected.",
  };
}

export default function GoogleCalendarSettings() {
  const [status, setStatus] = useState<GoogleCalendarStatusDto | null>(null);
  const [form, setForm] = useState<GoogleCalendarIntegrationSettings>(emptySettings);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<ReturnType<typeof callbackNotice>>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ profile, error: profileError }, nextStatus] = await Promise.all([
        getCurrentProfile(),
        authenticatedFetch<GoogleCalendarStatusDto>("/api/admin/google-calendar/status"),
      ]);
      if (profileError) throw profileError;
      setCanManage(Boolean(profile && hasPermission(profile.roles, "settings.manage")));
      setStatus(nextStatus);
      setForm(nextStatus.settings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Google Calendar settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const callbackResult = new URLSearchParams(window.location.search).get("calendar");
    setOauthNotice(callbackNotice(callbackResult));
    void load();
  }, [load]);

  useEffect(() => {
    const clearTransientAction = () => setBusyAction(null);
    window.addEventListener("pageshow", clearTransientAction);
    return () => window.removeEventListener("pageshow", clearTransientAction);
  }, []);

  async function startConnection() {
    setBusyAction("connect");
    setError(null);
    setSuccess(null);
    try {
      const result = await authenticatedFetch<{ authorization_url: string }>(
        "/api/admin/google-calendar/oauth/start",
        { method: "POST" }
      );
      window.location.assign(result.authorization_url);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Google authorization could not be started.");
      setBusyAction(null);
    }
  }

  async function saveSettings() {
    setBusyAction("save");
    setError(null);
    setSuccess(null);
    try {
      const nextStatus = await authenticatedFetch<GoogleCalendarStatusDto>(
        "/api/admin/google-calendar/status",
        {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            timezone_override: form.timezone_override?.trim() || null,
            sync_deliveries: false,
            sync_measurements: false,
            sync_customer_appointments: false,
          }),
        }
      );
      setStatus(nextStatus);
      setForm(nextStatus.settings);
      setSuccess("Google Calendar settings saved.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Google Calendar settings could not be saved.");
    } finally {
      setBusyAction(null);
    }
  }

  async function disconnect() {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }

    setBusyAction("disconnect");
    setError(null);
    setSuccess(null);
    try {
      await authenticatedFetch<{ success: boolean }>(
        "/api/admin/google-calendar/connection",
        { method: "DELETE" }
      );
      setConfirmDisconnect(false);
      setSuccess("Google Calendar disconnected. Existing Modulex data was not changed.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Google Calendar could not be disconnected.");
    } finally {
      setBusyAction(null);
    }
  }

  if (loading && !status) {
    return (
      <ComponentCard title="Google Calendar" desc="Loading integration status and settings.">
        <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`} role="status">Loading Google Calendar settings…</p>
      </ComponentCard>
    );
  }

  if (!status) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="Google Calendar unavailable" message={error || "Integration status could not be loaded."} />
        <Button variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const connected = status.connection.status === "connected";
  const busy = busyAction !== null;
  const savingSettings = busyAction === "save";
  const connecting = busyAction === "connect";
  const disconnecting = busyAction === "disconnect";
  const disabled = !canManage || busy;

  return (
    <div className="space-y-5">
      {oauthNotice ? <Alert {...oauthNotice} /> : null}
      {error ? <Alert variant="error" title="Google Calendar action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Google Calendar updated" message={success} /> : null}

      <ComponentCard
        title="Google Calendar Connection"
        desc="One company Google account authorizes Modulex to create and manage Project calendars."
        headerAction={statusBadge(status.connection.status)}
      >
        <div className={`space-y-4 ${ADMIN_TEXT_STYLES.body}`}>
          <div className="flex flex-wrap gap-3">
            <Badge color={status.configured ? "success" : "warning"}>
              {status.configured ? "OAuth app configured" : "OAuth app not configured"}
            </Badge>
            <Badge color="info">Modulex → Google</Badge>
          </div>
          <p className="text-sm">
            Connected account: {status.connection.provider_account_email || "—"}
          </p>
          <p className="text-sm">
            Last successful provider access: {status.connection.last_success_at || "—"}
          </p>
          <p className="text-sm">
            Last error: {status.connection.last_error_code || "—"}
          </p>
          {canManage ? (
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || !status.configured} onClick={() => void startConnection()}>
                {connecting ? "Connecting…" : connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
              </Button>
              {connected || status.connection.status === "error" ? (
                <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
                  {disconnecting ? "Disconnecting…" : confirmDisconnect ? "Confirm Disconnect" : "Disconnect"}
                </Button>
              ) : null}
              {confirmDisconnect ? (
                <Button variant="outline" disabled={busy} onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ComponentCard>

      <ComponentCard
        title="Project Calendar Behavior"
        desc="These settings are stored in Modulex and can be changed without a deploy."
        headerAction={canManage ? <Button disabled={busy} onClick={() => void saveSettings()}>{savingSettings ? "Saving…" : "Save Settings"}</Button> : undefined}
      >
        <div className="space-y-5">
          <Checkbox
            label="Enable Google Calendar synchronization"
            checked={form.enabled}
            onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
            disabled={disabled}
          />
          <Checkbox
            label="Automatically create a Google Calendar for each Project when needed"
            checked={form.auto_create_project_calendar}
            onChange={(auto_create_project_calendar) => setForm((current) => ({ ...current, auto_create_project_calendar }))}
            disabled={disabled}
          />

          <div className="space-y-2">
            <Label htmlFor="google-calendar-name-template">Project calendar name template</Label>
            <Input
              id="google-calendar-name-template"
              value={form.calendar_name_template}
              onChange={(event) => setForm((current) => ({ ...current, calendar_name_template: event.target.value }))}
              disabled={disabled}
              hint="Allowed placeholders: {project_no}, {project_name}, {customer_name}."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="google-calendar-timezone">Calendar timezone override</Label>
            <Input
              id="google-calendar-timezone"
              value={form.timezone_override || ""}
              onChange={(event) => setForm((current) => ({ ...current, timezone_override: event.target.value || null }))}
              disabled={disabled}
              placeholder={status.effective_timezone}
              hint={`Leave blank to use company timezone. Current effective timezone: ${status.effective_timezone}.`}
            />
          </div>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Calendar Event Sources"
        desc="Only canonical Modulex schedules can be projected to Google Calendar."
      >
        <div className="space-y-4">
          <Checkbox
            label="Installation appointments"
            checked={form.sync_installations}
            onChange={(sync_installations) => setForm((current) => ({ ...current, sync_installations }))}
            disabled={disabled}
          />
          <Checkbox label="Delivery schedules — unavailable; canonical delivery schedule is not available yet" checked={false} onChange={() => undefined} disabled />
          <Checkbox label="Measurement schedules — unavailable; canonical measurement schedule is not available yet" checked={false} onChange={() => undefined} disabled />
          <Checkbox label="Customer appointment schedules — unavailable; canonical customer appointment schedule is not available yet" checked={false} onChange={() => undefined} disabled />
          <Alert
            variant="info"
            title="Modulex remains canonical"
            message="Google Calendar is an outbound projection. Editing or deleting a Google event does not change the Project or installation record in Modulex."
          />
        </div>
      </ComponentCard>
    </div>
  );
}
