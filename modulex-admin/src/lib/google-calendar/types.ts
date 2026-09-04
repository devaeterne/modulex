export type GoogleCalendarConnectionStatus = "connected" | "disconnected" | "error";
export type GoogleCalendarSyncStatus = "pending" | "synced" | "error" | "skipped";

export type GoogleCalendarIntegrationSettings = {
  enabled: boolean;
  auto_create_project_calendar: boolean;
  calendar_name_template: string;
  timezone_override: string | null;
  sync_installations: boolean;
  sync_deliveries: boolean;
  sync_measurements: boolean;
  sync_customer_appointments: boolean;
};

export type GoogleCalendarStatusDto = {
  configured: boolean;
  connection: {
    status: GoogleCalendarConnectionStatus;
    provider_account_email: string | null;
    connected_at: string | null;
    disconnected_at: string | null;
    last_success_at: string | null;
    last_error_at: string | null;
    last_error_code: string | null;
  };
  settings: GoogleCalendarIntegrationSettings;
  effective_timezone: string;
};

export type ProjectCalendarBindingDto = {
  project_id: string;
  connected: boolean;
  integration_enabled: boolean;
  sync_enabled: boolean;
  provider_calendar_name: string | null;
  provider_calendar_url: string | null;
  timezone: string | null;
  last_sync_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
};

export type CalendarMutationResult = {
  ok: boolean;
  status: GoogleCalendarSyncStatus;
  error_code?: string;
};
