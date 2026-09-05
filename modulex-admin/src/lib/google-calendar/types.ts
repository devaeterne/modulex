export type GoogleCalendarConnectionStatus = "connected" | "disconnected" | "error";
export type GoogleCalendarSyncStatus = "pending" | "synced" | "error" | "skipped" | "cancelled";

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
    reconnect_required: boolean;
    import_scopes_granted: boolean;
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

export type GoogleCalendarDiscoveryItem = {
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

export type CalendarMutationResult = {
  ok: boolean;
  status: GoogleCalendarSyncStatus;
  error_code?: string;
};
