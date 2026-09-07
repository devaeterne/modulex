import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { discoverGoogleCalendars, GoogleCalendarImportError } from "@/lib/google-calendar/calendar-import";
import { getGoogleCredential } from "@/lib/google-calendar/repository";
import {
  getCompanyCalendarBinding,
  listActiveWatchChannels,
  setCompanyCalendarBinding,
} from "@/lib/google-calendar/v3-repository";
import { withApiTiming } from "@/lib/observability/apiTiming";

async function companyStatus() {
  const binding = await getCompanyCalendarBinding();
  const credential = await getGoogleCredential();
  const watches = binding ? await listActiveWatchChannels(binding.id) : [];
  const watch = watches.find((row) => row.status === "active") ?? watches[0] ?? null;
  return {
    binding,
    google_account_email: credential?.provider_account_email ?? null,
    watch: watch ? {
      status: watch.status,
      expires_at: watch.expires_at,
      last_message_number: watch.last_message_number,
    } : null,
  };
}

async function handleGet(request: Request) {
  const auth = await requirePermission(request, "calendar.view");
  if (auth.response) return auth.response;
  try {
    return Response.json(await companyStatus());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Company Calendar status could not be loaded.", 500);
  }
}

async function handlePut(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const providerCalendarId = typeof body.provider_calendar_id === "string" ? body.provider_calendar_id.trim() : "";
  const ownerProfileId = typeof body.owner_profile_id === "string" ? body.owner_profile_id.trim() : "";
  if (!providerCalendarId || !ownerProfileId) {
    return jsonError("Google Calendar and Modulex Calendar owner are required.", 400);
  }

  try {
    const calendars = await discoverGoogleCalendars(request.url);
    const candidate = calendars.find((row) => row.provider_calendar_id === providerCalendarId);
    if (!candidate) return jsonError("Google Calendar is not available to the connected account.", 404);
    if (!candidate.write_eligible || (candidate.access_role !== "owner" && candidate.access_role !== "writer")) {
      return jsonError("Company Calendar requires Google writer or owner access.", 409);
    }

    const binding = await setCompanyCalendarBinding({
      providerCalendarId: candidate.provider_calendar_id,
      providerCalendarName: candidate.provider_calendar_name,
      timezone: candidate.timezone,
      providerDataOwner: candidate.data_owner,
      providerAccessRole: candidate.access_role,
      providerBackgroundColor: candidate.background_color,
      providerForegroundColor: candidate.foreground_color,
      providerColorId: candidate.color_id,
      ownerProfileId,
      actorUserId: auth.actor.user.id,
    });

    // The historical provider pull and watch setup are deferred to the bounded Sync Now
    // flow. This prevents Google from firing a watch notification that starts a second
    // full-history pull while the initial import is still in progress.
    return Response.json({
      ...(await companyStatus()),
      binding,
      sync_error_code: null,
      sync_pending: true,
      watch_error_code: null,
    });
  } catch (error) {
    if (error instanceof GoogleCalendarImportError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "Company Calendar could not be configured.", 400);
  }
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/company-binding", method: "GET" },
    () => handleGet(request),
  );
}

export async function PUT(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/company-binding", method: "PUT" },
    () => handlePut(request),
  );
}
