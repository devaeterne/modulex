import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  hasGoogleCalendarImportScopes,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar/config";
import {
  getCalendarIntegrationSettings,
  getGeneralTimezone,
  getGoogleCredential,
  updateCalendarIntegrationSettings,
} from "@/lib/google-calendar/repository";
import { validateCalendarNameTemplate } from "@/lib/google-calendar/template";
import type { GoogleCalendarIntegrationSettings, GoogleCalendarStatusDto } from "@/lib/google-calendar/types";
import { withApiTiming } from "@/lib/observability/apiTiming";

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function buildStatus(): Promise<GoogleCalendarStatusDto> {
  const [settings, generalTimezone, credential] = await Promise.all([
    getCalendarIntegrationSettings(),
    getGeneralTimezone(),
    getGoogleCredential(),
  ]);
  const importScopesGranted = hasGoogleCalendarImportScopes(credential?.granted_scopes);
  const reconnectRequired = Boolean(
    credential &&
      (credential.status === "error" || (credential.status === "connected" && !importScopesGranted)),
  );

  return {
    configured: isGoogleCalendarConfigured(),
    connection: {
      status: credential?.status ?? "disconnected",
      provider_account_email: credential?.provider_account_email ?? null,
      connected_at: credential?.connected_at ?? null,
      disconnected_at: credential?.disconnected_at ?? null,
      last_success_at: credential?.last_success_at ?? null,
      last_error_at: credential?.last_error_at ?? null,
      last_error_code: credential?.last_error_code ?? null,
      reconnect_required: reconnectRequired,
      import_scopes_granted: importScopesGranted,
    },
    settings,
    effective_timezone: settings.timezone_override || generalTimezone,
  };
}

async function handleGet(request: Request) {
  const auth = await requirePermission(request, "settings.view");
  if (auth.response) return auth.response;

  try {
    return Response.json(await buildStatus());
  } catch {
    return jsonError("Google Calendar settings could not be loaded.", 500);
  }
}

async function handlePatch(request: Request) {
  const auth = await requirePermission(request, "settings.manage");
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (
    typeof body.enabled !== "boolean" ||
    typeof body.auto_create_project_calendar !== "boolean" ||
    typeof body.sync_installations !== "boolean" ||
    typeof body.calendar_name_template !== "string"
  ) {
    return jsonError("Google Calendar settings are incomplete.", 400);
  }

  const template = body.calendar_name_template.trim();
  const templateValidation = validateCalendarNameTemplate(template);
  if (!templateValidation.ok) return jsonError(templateValidation.error, 400);

  const timezoneOverride = typeof body.timezone_override === "string" && body.timezone_override.trim()
    ? body.timezone_override.trim()
    : null;
  if (timezoneOverride && !isValidTimezone(timezoneOverride)) {
    return jsonError("Timezone override must be a valid IANA timezone.", 400);
  }

  if (body.enabled) {
    if (!isGoogleCalendarConfigured()) {
      return jsonError("Google Calendar OAuth application is not configured.", 409);
    }
    const credential = await getGoogleCredential();
    if (!credential || credential.status !== "connected") {
      return jsonError("Connect Google Calendar before enabling synchronization.", 409);
    }
  }

  const nextSettings: GoogleCalendarIntegrationSettings = {
    enabled: body.enabled,
    auto_create_project_calendar: body.auto_create_project_calendar,
    calendar_name_template: template,
    timezone_override: timezoneOverride,
    sync_installations: body.sync_installations,
    sync_deliveries: false,
    sync_measurements: false,
    sync_customer_appointments: false,
  };

  try {
    await updateCalendarIntegrationSettings(nextSettings, auth.actor.user.id);
    return Response.json(await buildStatus());
  } catch {
    return jsonError("Google Calendar settings could not be saved.", 500);
  }
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/status", method: "GET" },
    () => handleGet(request)
  );
}

export async function PATCH(request: Request) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/status", method: "PATCH" },
    () => handlePatch(request)
  );
}
