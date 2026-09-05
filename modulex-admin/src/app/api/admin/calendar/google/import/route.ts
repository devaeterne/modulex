import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  GoogleCalendarImportError,
  importGoogleCalendar,
} from "@/lib/google-calendar/calendar-import";
import { withApiTiming } from "@/lib/observability/apiTiming";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handlePost(request: Request) {
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
  if (!providerCalendarId) return jsonError("Google Calendar is required.", 400);
  if (!UUID_PATTERN.test(ownerProfileId)) return jsonError("A valid Modulex Calendar owner is required.", 400);

  try {
    const result = await importGoogleCalendar({
      providerCalendarId,
      ownerProfileId,
      actorUserId: auth.actor.user.id,
      requestUrl: request.url,
    });
    return Response.json({
      calendar: {
        id: result.binding.admin_calendar_id,
        binding_id: result.binding.id,
        provider_calendar_name: result.binding.provider_calendar_name,
        timezone: result.binding.timezone,
        provider_data_owner: result.binding.provider_data_owner,
        provider_access_role: result.binding.provider_access_role,
        provider_background_color: result.binding.provider_background_color,
        provider_foreground_color: result.binding.provider_foreground_color,
        provider_color_id: result.binding.provider_color_id,
      },
      sync: result.sync,
      sync_error_code: result.sync_error_code,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleCalendarImportError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Google Calendar import failed.", 502);
  }
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/import", method: "POST" },
    () => handlePost(request),
  );
}
