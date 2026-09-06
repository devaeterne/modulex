"use client";

import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";

export type CalendarCompanyBindingStatus = {
  binding: {
    id: string;
    provider_calendar_id: string;
    provider_calendar_name: string;
    provider_access_role: string | null;
    provider_background_color: string | null;
    provider_foreground_color: string | null;
    provider_color_id: string | null;
    timezone: string;
    sync_enabled: boolean;
    last_sync_at: string | null;
    last_error_code: string | null;
  } | null;
  google_account_email: string | null;
  watch: { status: string; expires_at: string | null; last_message_number: number | null } | null;
};

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function CalendarCompanyStatus({
  status,
  busy,
  onChangeCalendar,
  onSync,
}: {
  status: CalendarCompanyBindingStatus | null;
  busy: boolean;
  onChangeCalendar: () => void;
  onSync: () => void;
}) {
  const binding = status?.binding ?? null;
  return (
    <ComponentCard
      title="Company Calendar"
      desc="One shared Google Calendar is the operational calendar for all Projects, Installations, and normal events."
      headerAction={<Badge color={binding?.sync_enabled ? "success" : "warning"}>{binding?.sync_enabled ? "Bidirectional sync" : "Setup required"}</Badge>}
    >
      <div className="space-y-4">
        <div className={`grid gap-3 text-sm md:grid-cols-2 ${ADMIN_TEXT_STYLES.body}`}>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Calendar:</strong> {binding?.provider_calendar_name ?? "Not selected"}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Google account:</strong> {status?.google_account_email ?? "—"}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Access:</strong> {binding?.provider_access_role ?? "—"}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Timezone:</strong> {binding?.timezone ?? "—"}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Last Google sync:</strong> {displayDate(binding?.last_sync_at ?? null)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Watch:</strong> {status?.watch?.status ?? "—"} · expires {displayDate(status?.watch?.expires_at ?? null)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Last error:</strong> {binding?.last_error_code ?? "—"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={onChangeCalendar}>{binding ? "Change Calendar" : "Choose Company Calendar"}</Button>
          {binding ? <Button size="sm" variant="outline" disabled={busy} onClick={onSync}>Sync Now</Button> : null}
          {binding ? <Button size="sm" variant="outline" onClick={() => window.open(`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(binding.provider_calendar_id)}`, "_blank", "noopener,noreferrer")}>Open in Google</Button> : null}
        </div>
      </div>
    </ComponentCard>
  );
}
